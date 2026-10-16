// -----------------------------------------------------------------------------
// Hive Active Plug ("activeplug"): a relay with power metering.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { baseDevice, idsOf, onOff, unknownFeature } from './common.js';

const KEY = 'plug';

export const plug = {
  key: KEY,
  hiveTypes: ['activeplug'],

  buildDevice(gladys, product, home) {
    const ids = idsOf(gladys, KEY, product);
    return baseDevice(gladys, KEY, product, home, [
      {
        name: 'On/Off',
        external_id: ids.feature('binary'),
        category: DEVICE_FEATURE_CATEGORIES.SWITCH,
        type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      {
        name: 'Power',
        external_id: ids.feature('power'),
        category: DEVICE_FEATURE_CATEGORIES.SWITCH,
        type: DEVICE_FEATURE_TYPES.SWITCH.POWER,
        unit: DEVICE_FEATURE_UNITS.WATT,
        min: 0,
        max: 3680,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ]);
  },

  readStates(product) {
    const power = Number(product.props?.powerConsumption);
    return {
      binary: onOff(product.state?.status),
      power: Number.isFinite(power) ? power : null,
    };
  },

  command(_product, featureKey, value) {
    if (featureKey === 'binary') {
      return { status: Number(value) === 1 ? 'ON' : 'OFF' };
    }
    throw unknownFeature(featureKey);
  },
};
