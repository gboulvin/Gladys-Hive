// -----------------------------------------------------------------------------
// Hot water ("hotwater" product of a Hive Active Heating with a cylinder), as
// a Gladys water heater.
//
// Hive modes        Gladys WATER_HEATER_MODE
//   SCHEDULE    <->   PROGRAM (6)
//   MANUAL / ON <->   MANUAL (4)   always on
//   OFF         <->   OFF (0)
//   BOOST             the `boost` feature (1), the mode it returns to stays
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { boostMinutes, hotWaterIsOn } from '../hive/home.js';
import { baseDevice, idsOf, unknownFeature } from './common.js';

const KEY = 'hot-water';

// Gladys WATER_HEATER_MODE values (server/utils/constants.js).
export const WATER_HEATER_MODE = { OFF: 0, MANUAL: 4, PROGRAM: 6 };

const HIVE_TO_GLADYS_MODE = {
  OFF: WATER_HEATER_MODE.OFF,
  MANUAL: WATER_HEATER_MODE.MANUAL,
  ON: WATER_HEATER_MODE.MANUAL,
  SCHEDULE: WATER_HEATER_MODE.PROGRAM,
};

export function hotWaterMode(product) {
  const mode = product.state?.mode;
  if (mode === 'BOOST') {
    return product.props?.previous?.mode ?? 'SCHEDULE';
  }
  return mode;
}

export const hotWater = {
  key: KEY,
  hiveTypes: ['hotwater'],

  buildDevice(gladys, product, home) {
    const ids = idsOf(gladys, KEY, product);
    return baseDevice(gladys, KEY, product, home, [
      {
        name: 'Mode',
        external_id: ids.feature('mode'),
        category: DEVICE_FEATURE_CATEGORIES.WATER_HEATER,
        type: DEVICE_FEATURE_TYPES.WATER_HEATER.MODE,
        min: 0,
        max: 6,
        read_only: false,
        has_feedback: true,
        keep_history: true,
        supported_options: [
          { value: WATER_HEATER_MODE.PROGRAM, label: 'Schedule', sort_order: 0 },
          { value: WATER_HEATER_MODE.MANUAL, label: 'On', sort_order: 1 },
          { value: WATER_HEATER_MODE.OFF, label: 'Off', sort_order: 2 },
        ],
      },
      {
        name: 'Boost',
        external_id: ids.feature('boost'),
        category: DEVICE_FEATURE_CATEGORIES.WATER_HEATER,
        type: DEVICE_FEATURE_TYPES.WATER_HEATER.BOOST,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      {
        name: 'Heating water',
        external_id: ids.feature('heating'),
        category: DEVICE_FEATURE_CATEGORIES.WATER_HEATER,
        type: DEVICE_FEATURE_TYPES.WATER_HEATER.HEATING,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ]);
  },

  readStates(product, home) {
    return {
      mode: HIVE_TO_GLADYS_MODE[hotWaterMode(product)] ?? null,
      boost: product.state?.mode === 'BOOST' ? 1 : 0,
      heating: hotWaterIsOn(product, home.timeZone) ? 1 : 0,
    };
  },

  command(product, featureKey, value, config) {
    if (featureKey === 'mode') {
      switch (Number(value)) {
        case WATER_HEATER_MODE.OFF:
          return { mode: 'OFF' };
        case WATER_HEATER_MODE.MANUAL:
          return { mode: 'MANUAL' };
        case WATER_HEATER_MODE.PROGRAM:
          return { mode: 'SCHEDULE' };
        default:
          throw new Error(`Unsupported hot water mode: ${value}`);
      }
    }
    if (featureKey === 'boost') {
      return Number(value) === 1
        ? this.boostOn(product, config.boost_duration)
        : this.boostOff(product);
    }
    throw unknownFeature(featureKey);
  },

  boostOn(_product, minutes) {
    return { mode: 'BOOST', boost: Math.round(minutes) };
  },

  boostOff(product) {
    const previous = product.props?.previous?.mode;
    return { mode: previous && previous !== 'BOOST' ? previous : 'SCHEDULE' };
  },

  isBoosting: (product) => product.state?.mode === 'BOOST',
  boostRemaining: boostMinutes,
};
