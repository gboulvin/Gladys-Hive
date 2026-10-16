// -----------------------------------------------------------------------------
// Hive actions: the automations of the Hive app ("when the door opens, turn
// the hall light on..."), each one a switch that enables or disables it.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { idsOf, unknownFeature } from './common.js';

const KEY = 'action';

export const hiveAction = {
  key: KEY,
  // Not a product: listed from the `actions` of the home.
  fromActions: true,

  buildDevice(gladys, action) {
    const ids = idsOf(gladys, KEY, action);
    return {
      name: `Hive action: ${action.name ?? action.id}`,
      external_id: ids.device,
      should_poll: false,
      params: [{ name: 'HIVE_TYPE', value: 'action' }],
      features: [
        {
          name: 'Enabled',
          external_id: ids.feature('enabled'),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
          keep_history: true,
        },
      ],
    };
  },

  readStates(action) {
    return { enabled: action.enabled ? 1 : 0 };
  },

  command(_action, featureKey, value) {
    if (featureKey === 'enabled') {
      return { enabled: Number(value) === 1 };
    }
    throw unknownFeature(featureKey);
  },

  // Actions are replaced as a whole, not patched like products.
  async execute(api, action, fields) {
    await api.setAction(action.id, { ...action, ...fields });
  },
};
