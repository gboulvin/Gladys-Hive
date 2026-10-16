// -----------------------------------------------------------------------------
// Integration configuration, filled in by the user from the `config_schema`
// of gladys-assistant-integration.json. This module provides the defaults
// and normalizes the received object, so the rest of the code never deals
// with `undefined` or numbers typed as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  // The 6-digit code Hive sends by SMS, only needed while the connection
  // status asks for it.
  sms_code: '',
  // Seconds between two reads of the Hive cloud.
  poll_frequency: 60,
  // Default duration (minutes) and temperature (°C) of a boost.
  boost_duration: 30,
  boost_temperature: 21,
  // Battery level (%) under which the `battery_low` scene trigger fires.
  battery_low_threshold: 20,
};

export const POLL_FREQUENCY_BOUNDS = { min: 30, max: 3600 };

function numberIn(raw, fallback, min, max) {
  const value = Number(raw);
  if (raw === '' || raw === null || raw === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    sms_code: String(raw.sms_code ?? '').replace(/\s+/g, ''),
    poll_frequency: numberIn(
      raw.poll_frequency,
      DEFAULT_CONFIG.poll_frequency,
      POLL_FREQUENCY_BOUNDS.min,
      POLL_FREQUENCY_BOUNDS.max,
    ),
    boost_duration: numberIn(raw.boost_duration, DEFAULT_CONFIG.boost_duration, 15, 360),
    boost_temperature: numberIn(raw.boost_temperature, DEFAULT_CONFIG.boost_temperature, 5, 32),
    battery_low_threshold: numberIn(
      raw.battery_low_threshold,
      DEFAULT_CONFIG.battery_low_threshold,
      5,
      50,
    ),
  };
}
