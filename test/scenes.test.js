import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HiveController } from '../src/controller.js';
import { createMemoryStore } from '../src/hive/store.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { createFakeHive, PASSWORD, USERNAME } from './helpers/fakeHive.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

async function connected(t) {
  const hive = createFakeHive({ mfa: false });
  const gladys = createFakeGladys();
  const controller = new HiveController(gladys, {
    store: createMemoryStore(),
    fetchImpl: hive.fetchImpl,
    confirmDelayMs: 60_000,
  });
  t.after(() => controller.stop());
  await controller.applyConfig({ username: USERNAME, password: PASSWORD });
  return { hive, gladys, controller };
}

const run = (controller, key, fields) => SCENE_ACTIONS[key](controller, { fields });

function assertDeclaredOutputs(key, outputs) {
  const declared = manifest.scene_actions.find((a) => a.key === key).outputs.map((o) => o.key);
  for (const name of Object.keys(outputs)) {
    assert.ok(declared.includes(name), `${key}: output ${name} not declared`);
  }
}

test('boost_heating boosts the first zone, then cancel_heating_boost restores the mode', async (t) => {
  const { hive, controller } = await connected(t);
  const boosted = await run(controller, 'boost_heating', { duration: 45, temperature: 22 });
  assertDeclaredOutputs('boost_heating', boosted);
  assert.deepEqual(boosted, { boosted: true });
  assert.deepEqual(hive.state.commands.at(-1), {
    type: 'heating',
    id: 'heating-1',
    fields: { mode: 'BOOST', boost: 45, target: 22 },
  });
  const cancelled = await run(controller, 'cancel_heating_boost', {});
  assert.deepEqual(cancelled, { cancelled: true });
  assert.deepEqual(hive.state.commands.at(-1).fields, { mode: 'SCHEDULE' });
  assert.deepEqual(await run(controller, 'cancel_heating_boost', {}), { cancelled: false });
});

test('a device of another kind is an output, not a failure', async (t) => {
  const { gladys, controller } = await connected(t);
  const plug = gladys.externalIds('plug', 'plug-1').device;
  assert.deepEqual(await run(controller, 'boost_heating', { device: plug }), { boosted: false });
  assert.deepEqual(await run(controller, 'set_hot_water_mode', { device: plug, mode: 'on' }), {
    applied: false,
  });
});

test('hot water boost and modes', async (t) => {
  const { hive, gladys, controller } = await connected(t);
  assert.deepEqual(await run(controller, 'boost_hot_water', {}), { boosted: true });
  assert.deepEqual(hive.state.commands.at(-1).fields, { mode: 'BOOST', boost: 30 });
  assert.deepEqual(await run(controller, 'cancel_hot_water_boost', {}), { cancelled: true });
  assert.deepEqual(hive.state.commands.at(-1).fields, { mode: 'SCHEDULE' });
  const water = gladys.externalIds('hot-water', 'hotwater-1').device;
  assert.deepEqual(await run(controller, 'set_hot_water_mode', { device: water, mode: 'off' }), {
    applied: true,
  });
  assert.deepEqual(hive.state.commands.at(-1).fields, { mode: 'OFF' });
});

test('set_heating_mode manual holds the requested temperature', async (t) => {
  const { hive, gladys, controller } = await connected(t);
  const trv = gladys.externalIds('heating', 'trvcontrol-1').device;
  const outputs = await run(controller, 'set_heating_mode', {
    device: trv,
    mode: 'manual',
    temperature: 19,
  });
  assert.deepEqual(outputs, { applied: true });
  assert.deepEqual(hive.state.commands.at(-1), {
    type: 'trvcontrol',
    id: 'trvcontrol-1',
    fields: { mode: 'MANUAL', target: 19 },
  });
});
