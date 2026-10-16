import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticationKey,
  cognitoTimestamp,
  createEphemeral,
  generateDeviceSecret,
  modPow,
  N,
  padHex,
} from '../src/hive/srp.js';

// Vectors computed with amazon-cognito-identity-js 6.3.12 (AuthenticationHelper),
// the reference implementation, from the same inputs.
const A_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00' + '13'.repeat(96);

test('padHex follows the Cognito rules', () => {
  assert.equal(padHex(0xabcn), '0abc');
  assert.equal(padHex(0x12n), '12');
  assert.equal(padHex(0x8fn), '008f');
  assert.equal(padHex('38e'), '038e');
});

test('the password authentication key matches the reference implementation', () => {
  const ephemeral = createEphemeral(BigInt(`0x${A_HEX}`) % N);
  const srpB = modPow(3n, 123456789123456789n, N).toString(16);
  const key = authenticationKey(
    ephemeral,
    'SamNfoWtfuser-id-1234',
    'P@ssw0rd!',
    srpB,
    '38e87860aba4a4046a199752eec13ac',
  );
  assert.equal(key.toString('hex'), '2bca2d10869ad96e55bb9f604de4fed8');
});

test('a fresh ephemeral is random and valid', () => {
  const one = createEphemeral();
  const two = createEphemeral();
  assert.notEqual(one.srpA, two.srpA);
  assert.equal(modPow(2n, one.a, N), one.A);
});

test('the device verifier is g^x, encoded in base64', () => {
  const { devicePassword, verifierConfig } = generateDeviceSecret('-grp', 'eu-west-1_dev', {
    password: 'pw',
    salt: '0011',
  });
  assert.equal(devicePassword, 'pw');
  assert.equal(Buffer.from(verifierConfig.Salt, 'base64').toString('hex'), '11');
  assert.ok(Buffer.from(verifierConfig.PasswordVerifier, 'base64').length > 300);
});

test('the Cognito timestamp does not pad the day of the month', () => {
  assert.equal(
    cognitoTimestamp(new Date(Date.UTC(2026, 9, 5, 9, 5, 1))),
    'Mon Oct 5 09:05:01 UTC 2026',
  );
  assert.equal(
    cognitoTimestamp(new Date(Date.UTC(2026, 9, 15, 23, 0, 0))),
    'Thu Oct 15 23:00:00 UTC 2026',
  );
});
