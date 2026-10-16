import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  indexHome,
  hotWaterIsOn,
  scheduleNow,
  rgbIntToHsv,
  hsvToRgbInt,
} from '../src/hive/home.js';
import {
  buildDiscoveredDevices,
  buildStates,
  buildTransportEntries,
  findEntry,
} from '../src/devices/index.js';
import { normalizeConfig } from '../src/config.js';
import { loadFixture } from './helpers/fakeHive.js';

const config = normalizeConfig();
const home = indexHome(loadFixture());
const stateOf = (gladys, states, type, id, key) =>
  states.find((s) => s.device_feature_external_id === gladys.externalIds(type, id).feature(key))
    ?.state;
const entry = (gladys, type, id) => findEntry(gladys, home, gladys.externalIds(type, id).device);

test('every Hive product and action becomes a device Gladys accepts', async () => {
  const gladys = createFakeGladys();
  const devices = buildDiscoveredDevices(gladys, home, config);
  assert.equal(devices.length, 10);
  // The fake Gladys refuses what the real one refuses (categories, units...).
  await gladys.publishDiscoveredDevices(devices);
  const names = devices.map((d) => d.name);
  assert.ok(names.includes('Heating Zone 1'));
  assert.ok(names.includes('Hive action: Front door opened'));
});

test('states follow the Gladys conventions', async () => {
  const gladys = createFakeGladys();
  const states = buildStates(gladys, home, config);
  await gladys.publishStates(states);
  const s = (type, id, key) => stateOf(gladys, states, type, id, key);
  assert.equal(s('heating', 'heating-1', 'current-temperature'), 19.2);
  assert.equal(s('heating', 'heating-1', 'target-temperature'), 20);
  assert.equal(s('heating', 'heating-1', 'mode'), 3, 'SCHEDULE is AUTO');
  assert.equal(s('heating', 'heating-1', 'operating-state'), 1);
  assert.equal(s('heating', 'heating-1', 'battery'), 70, 'battery of the thermostat');
  assert.equal(s('heating', 'trvcontrol-1', 'mode'), 1, 'MANUAL is HEATING');
  assert.equal(s('heating', 'trvcontrol-1', 'battery'), 40, 'battery of the TRV');
  assert.equal(s('hot-water', 'hotwater-1', 'mode'), 6, 'SCHEDULE is PROGRAM');
  assert.equal(s('light', 'light-1', 'brightness'), 80);
  assert.equal(s('light', 'light-2', 'temperature'), 250, '4000 K is 250 mireds');
  assert.equal(s('light', 'light-3', 'color'), 0xff0000);
  assert.equal(s('plug', 'plug-1', 'power'), 42);
  assert.equal(s('contact-sensor', 'contact-1', 'opening'), 1, 'CLOSED is 1 in Gladys');
  assert.equal(s('motion-sensor', 'motion-1', 'temperature'), 19.3);
  assert.equal(s('action', 'action-1', 'enabled'), 1);
});

test('offline products show as unreachable', () => {
  const gladys = createFakeGladys();
  const entries = buildTransportEntries(gladys, home);
  const lounge = entries.find(
    (e) => e.external_id === gladys.externalIds('light', 'light-3').device,
  );
  assert.equal(lounge.transport, 'unreachable');
  assert.ok(entries.filter((e) => e.transport === 'cloud').length >= 8);
});

test('heating commands', () => {
  const gladys = createFakeGladys();
  const { blueprint, node } = entry(gladys, 'heating', 'heating-1');
  assert.deepEqual(blueprint.command(node, 'target-temperature', 21.3), { target: 21.5 });
  assert.deepEqual(blueprint.command(node, 'target-temperature', 50), { target: 32 });
  assert.deepEqual(blueprint.command(node, 'mode', 0), { mode: 'OFF' });
  assert.deepEqual(blueprint.command(node, 'mode', 3), { mode: 'SCHEDULE' });
  assert.deepEqual(blueprint.command(node, 'mode', 1), { mode: 'MANUAL', target: 20 });
  const off = { ...node, state: { ...node.state, mode: 'OFF' } };
  assert.deepEqual(blueprint.command(off, 'target-temperature', 19), {
    mode: 'MANUAL',
    target: 19,
  });
  assert.throws(() => blueprint.command(node, 'battery', 1));
});

test('hot water commands and boost', () => {
  const gladys = createFakeGladys();
  const { blueprint, node } = entry(gladys, 'hot-water', 'hotwater-1');
  assert.deepEqual(blueprint.command(node, 'mode', 4), { mode: 'MANUAL' });
  assert.deepEqual(blueprint.command(node, 'boost', 1, config), { mode: 'BOOST', boost: 30 });
  const boosting = {
    ...node,
    state: { mode: 'BOOST', boost: 25 },
    props: { previous: { mode: 'OFF' } },
  };
  assert.deepEqual(blueprint.command(boosting, 'boost', 0, config), { mode: 'OFF' });
  assert.deepEqual(blueprint.readStates(boosting, home).mode, 0);
  assert.equal(blueprint.readStates(boosting, home).boost, 1);
});

test('light commands', () => {
  const gladys = createFakeGladys();
  const warm = entry(gladys, 'light', 'light-1');
  assert.deepEqual(warm.blueprint.command(warm.node, 'brightness', 0), { status: 'OFF' });
  assert.deepEqual(warm.blueprint.command(warm.node, 'brightness', 2), {
    status: 'ON',
    brightness: 5,
  });
  assert.throws(() => warm.blueprint.command(warm.node, 'color', 0xff));
  const colour = entry(gladys, 'light', 'light-3');
  assert.deepEqual(colour.blueprint.command(colour.node, 'temperature', 370), {
    colourMode: 'WHITE',
    colourTemperature: 2703,
  });
  assert.deepEqual(colour.blueprint.command(colour.node, 'color', 0x00ff00), {
    status: 'ON',
    colourMode: 'COLOUR',
    hue: 120,
    saturation: 100,
    value: 100,
  });
});

test('colour conversions round-trip', () => {
  for (const color of [0xff0000, 0x00ff00, 0x0000ff, 0xffffff, 0x336699]) {
    const { hue, saturation, value } = rgbIntToHsv(color);
    const back = hsvToRgbInt(hue, saturation, value);
    for (const shift of [16, 8, 0]) {
      assert.ok(Math.abs(((back >> shift) & 0xff) - ((color >> shift) & 0xff)) <= 3);
    }
  }
});

test('the hot water schedule is read in the home time zone', () => {
  const water = home.products.find((p) => p.type === 'hotwater');
  // Monday 15 June 2026, 06:30 in London = 05:30 UTC.
  const morning = new Date(Date.UTC(2026, 5, 15, 5, 30));
  assert.deepEqual(scheduleNow(water.state.schedule, 'Europe/London', morning), { status: 'ON' });
  assert.equal(hotWaterIsOn(water, 'Europe/London', morning), true);
  assert.equal(hotWaterIsOn(water, 'Europe/London', new Date(Date.UTC(2026, 5, 15, 12))), false);
  // Sunday 08:00: the last slot of Saturday still runs.
  assert.equal(hotWaterIsOn(water, 'Europe/London', new Date(Date.UTC(2026, 5, 14, 7))), true);
});
