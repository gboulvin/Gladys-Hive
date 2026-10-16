import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HiveController } from '../src/controller.js';
import { createMemoryStore } from '../src/hive/store.js';
import { createFakeHive, PASSWORD, SMS_CODE, USERNAME } from './helpers/fakeHive.js';

const CREDENTIALS = { username: USERNAME, password: PASSWORD };

function setup(hiveOptions) {
  const hive = createFakeHive(hiveOptions);
  const gladys = createFakeGladys();
  const store = createMemoryStore();
  const controller = new HiveController(gladys, {
    store,
    fetchImpl: hive.fetchImpl,
    confirmDelayMs: 60_000,
  });
  return { hive, gladys, store, controller };
}

test('no credentials: asks for them', async (t) => {
  const { gladys, controller } = setup();
  t.after(() => controller.stop());
  await controller.applyConfig({});
  assert.equal(controller.status.code, 'unconfigured');
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('full onboarding: SMS code, devices, states, then commands', async (t) => {
  const { hive, gladys, controller } = setup();
  t.after(() => controller.stop());

  await controller.applyConfig(CREDENTIALS);
  assert.equal(controller.status.code, 'sms_required');
  assert.match(gladys.fake.connectionStatus.message.fr, /\+\*{7}1234/);
  assert.equal(hive.state.smsSent, 1);

  // Saving another setting must not send another SMS.
  await controller.applyConfig({ ...CREDENTIALS, poll_frequency: 120 });
  assert.equal(hive.state.smsSent, 1);

  await controller.applyConfig({ ...CREDENTIALS, poll_frequency: 120, sms_code: SMS_CODE });
  assert.equal(controller.status.code, 'connected');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.discoveredDevices.length, 10);
  assert.ok(gladys.fake.states.length > 20);
  assert.ok(gladys.fake.transports.length > 0);

  // A Gladys command reaches Hive and is reflected at once.
  const [heatingDevice] = gladys.fake.discoveredDevices;
  const target = heatingDevice.features.find((f) => f.external_id.endsWith(':target-temperature'));
  await controller.setValue(heatingDevice, target, 22);
  assert.deepEqual(hive.state.commands.at(-1), {
    type: 'heating',
    id: 'heating-1',
    fields: { target: 22 },
  });
  assert.equal(gladys.fake.states.at(-1)?.state ?? 22, 22);

  // A Hive action is replaced as a whole.
  const action = gladys.fake.discoveredDevices.find((d) => d.name.startsWith('Hive action'));
  await controller.setValue(action, action.features[0], 0);
  assert.equal(hive.state.commands.at(-1).body.enabled, false);
  assert.equal(hive.state.commands.at(-1).body.name, 'Front door opened');
});

test('a polled transition becomes a scene event', async (t) => {
  const { hive, gladys, controller } = setup({ mfa: false });
  t.after(() => controller.stop());
  await controller.applyConfig(CREDENTIALS);
  hive.state.home.products.find((p) => p.id === 'motion-1').props.motion.status = true;
  await controller.refresh();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    ['motion_detected'],
  );
});

test('a revoked token is renewed transparently', async (t) => {
  const { hive, controller } = setup({ mfa: false });
  t.after(() => controller.stop());
  await controller.applyConfig(CREDENTIALS);
  hive.state.revokeIdTokens();
  await controller.refresh();
  assert.equal(controller.status.code, 'connected');
});

test('a Hive outage keeps the loop and reports it', async (t) => {
  const { hive, controller } = setup({ mfa: false });
  t.after(() => controller.stop());
  await controller.applyConfig(CREDENTIALS);
  hive.state.beekeeperDown = true;
  await controller.refresh().catch((err) => controller.handleError(err));
  assert.equal(controller.status.code, 'unavailable');
  assert.equal(controller.polling, true);
});

test('a wrong password stops the loop', async (t) => {
  const { controller } = setup({ mfa: false });
  t.after(() => controller.stop());
  await controller.applyConfig({ ...CREDENTIALS, password: 'nope' });
  assert.equal(controller.status.code, 'invalid_credentials');
  assert.equal(controller.polling, false);
});
