// -----------------------------------------------------------------------------
// Heating zones: the Hive Active Heating thermostat ("heating") and the Hive
// Radiator Valve zones ("trvcontrol"), as Gladys thermostats.
//
// Hive modes        Gladys THERMOSTAT_MODE
//   SCHEDULE    <->   AUTO (3)     follow the Hive schedule
//   MANUAL      <->   HEATING (1)  hold the target temperature
//   OFF         <->   OFF (0)      frost protection only
//   BOOST             reported as the mode it returns to, see `boost`
// Boosts are scene actions and widget buttons (src/scenes.js): a duration and
// a temperature do not fit a device feature.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { batteryOf, boostMinutes } from '../hive/home.js';
import {
  baseDevice,
  batteryFeature,
  clamp,
  halfDegree,
  hasBattery,
  idsOf,
  temperatureFeature,
  unknownFeature,
} from './common.js';

const KEY = 'heating';

// Gladys THERMOSTAT_MODE / THERMOSTAT_OPERATING_STATE values (server/utils/constants.js).
export const THERMOSTAT_MODE = { OFF: 0, HEATING: 1, AUTO: 3 };
const OPERATING_STATE = { IDLE: 0, HEATING: 1 };

const HIVE_TO_GLADYS_MODE = {
  OFF: THERMOSTAT_MODE.OFF,
  MANUAL: THERMOSTAT_MODE.HEATING,
  SCHEDULE: THERMOSTAT_MODE.AUTO,
};

export const MIN_TEMPERATURE = 5;
export const MAX_TEMPERATURE = 32;

/** The mode the zone runs (or returns to, after a boost), in Hive terms. */
export function heatingMode(product) {
  const mode = product.state?.mode;
  if (mode === 'BOOST') {
    return product.props?.previous?.mode ?? 'SCHEDULE';
  }
  return mode;
}

export const heating = {
  key: KEY,
  hiveTypes: ['heating', 'trvcontrol'],

  buildDevice(gladys, product, home) {
    const ids = idsOf(gladys, KEY, product);
    const features = [
      temperatureFeature(ids, 'current-temperature', 'Current temperature'),
      {
        name: 'Target temperature',
        external_id: ids.feature('target-temperature'),
        category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
        type: DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE,
        unit: DEVICE_FEATURE_UNITS.CELSIUS,
        min: MIN_TEMPERATURE,
        max: MAX_TEMPERATURE,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      {
        name: 'Mode',
        external_id: ids.feature('mode'),
        category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
        type: DEVICE_FEATURE_TYPES.THERMOSTAT.MODE,
        min: 0,
        max: 3,
        read_only: false,
        has_feedback: true,
        keep_history: true,
        supported_options: [
          { value: THERMOSTAT_MODE.AUTO, label: 'Schedule', sort_order: 0 },
          { value: THERMOSTAT_MODE.HEATING, label: 'Manual', sort_order: 1 },
          { value: THERMOSTAT_MODE.OFF, label: 'Off', sort_order: 2 },
        ],
      },
      {
        name: 'Heating',
        external_id: ids.feature('operating-state'),
        category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
        type: DEVICE_FEATURE_TYPES.THERMOSTAT.OPERATING_STATE,
        min: 0,
        max: 2,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ];
    if (hasBattery(home, product)) {
      features.push(batteryFeature(ids));
    }
    return baseDevice(gladys, KEY, product, home, features);
  },

  readStates(product, home) {
    const target = Number(product.state?.target ?? product.state?.heat);
    const current = Number(product.props?.temperature);
    return {
      'current-temperature': Number.isFinite(current) ? Math.round(current * 10) / 10 : null,
      'target-temperature': Number.isFinite(target) ? target : null,
      mode: HIVE_TO_GLADYS_MODE[heatingMode(product)] ?? null,
      'operating-state': product.props?.working ? OPERATING_STATE.HEATING : OPERATING_STATE.IDLE,
      battery: batteryOf(home, product),
    };
  },

  // Fields of the Hive command for a Gladys value.
  command(product, featureKey, value) {
    if (featureKey === 'target-temperature') {
      const target = clamp(halfDegree(value), MIN_TEMPERATURE, MAX_TEMPERATURE);
      // A temperature asked for while the zone is off means "heat to this".
      return heatingMode(product) === 'OFF' ? { mode: 'MANUAL', target } : { target };
    }
    if (featureKey === 'mode') {
      switch (Number(value)) {
        case THERMOSTAT_MODE.OFF:
          return { mode: 'OFF' };
        case THERMOSTAT_MODE.HEATING:
          return { mode: 'MANUAL', target: Number(product.state?.target ?? 20) };
        case THERMOSTAT_MODE.AUTO:
          return { mode: 'SCHEDULE' };
        default:
          throw new Error(`Unsupported heating mode: ${value}`);
      }
    }
    throw unknownFeature(featureKey);
  },

  boostOn(product, minutes, temperature) {
    return {
      mode: 'BOOST',
      boost: Math.round(minutes),
      target: clamp(halfDegree(temperature), MIN_TEMPERATURE, MAX_TEMPERATURE),
    };
  },

  boostOff(product) {
    const previous = product.props?.previous ?? {};
    const mode = previous.mode && previous.mode !== 'BOOST' ? previous.mode : 'SCHEDULE';
    return mode === 'MANUAL' && previous.target !== undefined
      ? { mode, target: Number(previous.target) }
      : { mode };
  },

  isBoosting: (product) => product.state?.mode === 'BOOST',
  boostRemaining: boostMinutes,
};
