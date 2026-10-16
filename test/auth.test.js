import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HiveAuth,
  HiveAuthError,
  SmsCodeRequiredError,
  fetchLoginInfo,
  FALLBACK_LOGIN_INFO,
} from '../src/hive/auth.js';
import { createMemoryStore } from '../src/hive/store.js';
import { createFakeHive, PASSWORD, SMS_CODE, USERNAME } from './helpers/fakeHive.js';

function newAuth(hive, store, overrides = {}) {
  return new HiveAuth({
    username: USERNAME,
    password: PASSWORD,
    store,
    fetchImpl: hive.fetchImpl,
    ...overrides,
  });
}

test('login reads the pool from the SSO page and falls back to the built-in one', async () => {
  const hive = createFakeHive();
  assert.equal((await fetchLoginInfo(hive.fetchImpl)).poolId, 'eu-west-1_TestPool');
  hive.state.ssoAvailable = false;
  assert.deepEqual(await fetchLoginInfo(hive.fetchImpl), FALLBACK_LOGIN_INFO);
});

test('a wrong password is reported as invalid credentials', async () => {
  const hive = createFakeHive();
  const auth = newAuth(hive, createMemoryStore(), { password: 'wrong' });
  await assert.rejects(
    auth.getIdToken(),
    (err) => err instanceof HiveAuthError && err.code === 'invalid_credentials',
  );
});

test('SMS login, then the remembered device logs in without SMS', async () => {
  const hive = createFakeHive();
  const store = createMemoryStore();
  const auth = newAuth(hive, store);

  await assert.rejects(auth.getIdToken(), (err) => {
    assert.ok(err instanceof SmsCodeRequiredError);
    assert.equal(err.destination, '+*******1234');
    return true;
  });
  assert.equal(hive.state.smsSent, 1);
  assert.ok(auth.pendingSms());

  await assert.rejects(auth.submitSmsCode('000000'), (err) => err.code === 'invalid_sms_code');
  await auth.submitSmsCode(SMS_CODE);
  assert.match(await auth.getIdToken(), /^id-token-/);
  assert.equal(store.state.lastSmsCode, SMS_CODE);
  assert.ok(store.state.device.key, 'the device is persisted');
  assert.equal([...hive.state.remembered.values()][0].status, 'remembered');
  assert.equal([...hive.state.remembered.values()][0].name, 'Gladys Assistant');
  assert.ok(store.state.refreshToken);
  assert.equal(JSON.stringify(store.state).includes(PASSWORD), false, 'never the password');

  // A restart: refresh token first.
  const restarted = newAuth(hive, store);
  assert.match(await restarted.getIdToken(), /^id-token-/);

  // Refresh token expired: the device proof replaces the SMS.
  hive.state.expireRefreshTokens();
  const later = newAuth(hive, store);
  assert.match(await later.getIdToken(), /^id-token-/);
  assert.equal(hive.state.smsSent, 1, 'no new SMS');
});

test('a forgotten device falls back to an SMS login', async () => {
  const hive = createFakeHive();
  const store = createMemoryStore({
    username: USERNAME,
    device: { groupKey: '-g', key: 'eu-west-1_gone', password: 'x' },
  });
  const auth = newAuth(hive, store);
  await assert.rejects(auth.getIdToken(), SmsCodeRequiredError);
  assert.equal(store.state.device, null);
});

test('without MFA the login completes directly', async () => {
  const hive = createFakeHive({ mfa: false });
  const auth = newAuth(hive, createMemoryStore());
  assert.match(await auth.getIdToken(), /^id-token-/);
});

test('an expired SMS challenge is reported', async () => {
  const hive = createFakeHive();
  let now = Date.now();
  const auth = newAuth(hive, createMemoryStore(), { now: () => now });
  await assert.rejects(auth.getIdToken(), SmsCodeRequiredError);
  now += 4 * 60 * 1000;
  await assert.rejects(auth.submitSmsCode(SMS_CODE), (err) => err.code === 'sms_expired');
});

test('another account does not reuse the saved session', async () => {
  const hive = createFakeHive();
  const store = createMemoryStore({
    username: 'other@example.com',
    refreshToken: 'r',
    device: { key: 'k' },
  });
  const auth = newAuth(hive, store);
  await auth.init();
  assert.equal(auth.persisted.refreshToken, null);
  assert.equal(auth.hasRememberedDevice(), false);
});
