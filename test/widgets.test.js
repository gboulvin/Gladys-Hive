import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HiveController } from '../src/controller.js';
import { createMemoryStore } from '../src/hive/store.js';
import { createWidgets, refreshWidgets, HEATING_WIDGET, HOME_WIDGET } from '../src/widgets.js';
import { createFakeHive, PASSWORD, USERNAME } from './helpers/fakeHive.js';

async function setup(t, { connect = true } = {}) {
  const hive = createFakeHive({ mfa: false });
  const gladys = createFakeGladys();
  const controller = new HiveController(gladys, {
    store: createMemoryStore(),
    fetchImpl: hive.fetchImpl,
    confirmDelayMs: 60_000,
  });
  t.after(() => controller.stop());
  if (connect) {
    await controller.applyConfig({ username: USERNAME, password: PASSWORD });
  }
  return { hive, gladys, controller, widgets: createWidgets(controller) };
}

const request = (settings = {}) => ({ settings, language: 'fr', units: 'metric' });

test('every widget content is rendered exactly as sent', async (t) => {
  const { gladys, widgets } = await setup(t);
  const trv = gladys.externalIds('heating', 'trvcontrol-1').device;
  for (const content of [
    await widgets[HEATING_WIDGET].get(request()),
    await widgets[HEATING_WIDGET].get(request({ device: trv })),
    await widgets[HOME_WIDGET].get(request()),
  ]) {
    assert.deepEqual(validateWidgetContent(content), []);
  }
});

test('the widgets say when Hive is not connected', async (t) => {
  const { widgets } = await setup(t, { connect: false });
  for (const key of [HEATING_WIDGET, HOME_WIDGET]) {
    const content = await widgets[key].get(request());
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].type, 'text');
  }
});

test('the live tiles reference published features', async (t) => {
  const { gladys, widgets } = await setup(t);
  const published = new Set(
    gladys.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
  );
  const content = await widgets[HEATING_WIDGET].get(request());
  const tiles = content.components.filter((c) => c.device_feature);
  assert.equal(tiles.length, 2);
  for (const tile of tiles) {
    assert.ok(published.has(tile.device_feature), tile.device_feature);
  }
});

test('every button action is handled and answers a short toast', async (t) => {
  const { hive, widgets } = await setup(t);
  for (const key of [HEATING_WIDGET, HOME_WIDGET]) {
    // Twice: boost, then the content offers to cancel it.
    for (let round = 0; round < 2; round += 1) {
      const content = await widgets[key].get(request());
      assert.deepEqual(validateWidgetContent(content), []);
      for (const button of content.components.filter((c) => c.type === 'button')) {
        const toast = await widgets[key].action({
          actionKey: button.action.key,
          params: button.action.params,
          settings: {},
        });
        assert.ok(toast.en && toast.en.length <= 200);
      }
    }
  }
  assert.ok(hive.state.commands.some((c) => c.fields?.mode === 'BOOST' && c.type === 'hotwater'));
  await assert.rejects(
    widgets[HOME_WIDGET].action({ actionKey: 'nope', params: {}, settings: {} }),
    /Unknown widget action/,
  );
});

test('refreshWidgets nudges every widget', async (t) => {
  const { widgets } = await setup(t, { connect: false });
  const fresh = createFakeGladys();
  refreshWidgets(fresh, widgets);
  assert.deepEqual(fresh.fake.widgetRefreshes, [HEATING_WIDGET, HOME_WIDGET]);
});
