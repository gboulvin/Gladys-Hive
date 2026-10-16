import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig coerces and bounds numbers coming from a form', () => {
  const config = normalizeConfig({
    poll_frequency: '10',
    boost_duration: '45',
    boost_temperature: 40,
  });
  assert.equal(config.poll_frequency, 30, 'one read every 30 s at most');
  assert.equal(config.boost_duration, 45);
  assert.equal(config.boost_temperature, 32);
});

test('normalizeConfig cleans the credentials and the SMS code', () => {
  const config = normalizeConfig({ username: ' me@example.com ', sms_code: '123 456' });
  assert.equal(config.username, 'me@example.com');
  assert.equal(config.sms_code, '123456');
});

test('normalizeConfig falls back to the default for an empty number', () => {
  assert.equal(
    normalizeConfig({ poll_frequency: '' }).poll_frequency,
    DEFAULT_CONFIG.poll_frequency,
  );
});
