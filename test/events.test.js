import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { indexHome } from '../src/hive/home.js';
import { diffEvents, SCENE_TRIGGERS } from '../src/events.js';
import { normalizeConfig } from '../src/config.js';
import { loadFixture } from './helpers/fakeHive.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const config = normalizeConfig();
const gladys = createFakeGladys();

function transition(mutate) {
  const before = loadFixture();
  const after = loadFixture();
  mutate(after, before);
  return diffEvents(gladys, indexHome(before), indexHome(after), config);
}
const product = (raw, id) => raw.products.find((p) => p.id === id);

test('no event on the first read, nor without change', () => {
  assert.deepEqual(diffEvents(gladys, null, indexHome(loadFixture()), config), []);
  assert.deepEqual(
    transition(() => {}),
    [],
  );
});

test('each transition fires one event with declared data', () => {
  const events = transition((after) => {
    product(after, 'motion-1').props.motion.status = true;
    product(after, 'contact-1').props.status = 'OPEN';
    product(after, 'light-1').props.online = false;
    product(after, 'motion-1').props.battery = 10;
    after.devices.find((d) => d.id === 'motion-1').props.battery = 10;
  });
  const keys = events.map((e) => e.key).sort();
  assert.deepEqual(keys, [
    SCENE_TRIGGERS.BATTERY_LOW,
    SCENE_TRIGGERS.CONNECTIVITY_CHANGED,
    SCENE_TRIGGERS.CONTACT_CHANGED,
    SCENE_TRIGGERS.MOTION_DETECTED,
  ]);
  for (const { key, data } of events) {
    const trigger = manifest.scene_triggers.find((t) => t.key === key);
    const declared = [...trigger.fields, ...(trigger.variables ?? [])].map((f) => f.key);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object');
    }
    const select = trigger.fields.find((f) => f.key === 'state' || f.key === 'kind');
    if (select) {
      const value = data[select.key];
      assert.ok(
        select.options.some((o) => o.value === value),
        `${key}: ${value}`,
      );
    }
  }
  assert.equal(events.find((e) => e.key === 'contact_changed').data.state, 'open');
});

test('the end of a boost fires boost_ended', () => {
  const before = loadFixture();
  product(before, 'hotwater-1').state.mode = 'BOOST';
  const after = loadFixture();
  const events = diffEvents(gladys, indexHome(before), indexHome(after), config);
  assert.deepEqual(
    events.map((e) => [e.key, e.data.kind]),
    [['boost_ended', 'hot_water']],
  );
});

test('a battery already low does not fire again', () => {
  // The front door sensor is at 25 %: lower it under a 30 % threshold twice.
  const before = loadFixture();
  const after = loadFixture();
  product(after, 'contact-1').props.battery = 24;
  const events = diffEvents(gladys, indexHome(before), indexHome(after), {
    ...config,
    battery_low_threshold: 30,
  });
  assert.deepEqual(events, []);
});
