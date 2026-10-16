// -----------------------------------------------------------------------------
// Hive sensors: motion sensors ("motionsensor") and window / door sensors
// ("contactsensor"). Read-only, battery powered.
//
// The Hive cloud is polled, so a detection reaches Gladys at the next refresh
// (see the refresh interval of the configuration). Besides their state, both
// fire a scene trigger with details (see src/events.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { batteryOf } from '../hive/home.js';
import { baseDevice, batteryFeature, hasBattery, idsOf, temperatureFeature } from './common.js';

// Gladys OPENING_SENSOR_STATE (server/utils/constants.js): 1 is CLOSED.
export const OPENING_SENSOR_STATE = { OPEN: 0, CLOSED: 1 };

export const motionSensor = {
  key: 'motion-sensor',
  hiveTypes: ['motionsensor'],
  readOnly: true,

  buildDevice(gladys, product, home) {
    const ids = idsOf(gladys, this.key, product);
    const features = [
      {
        name: 'Motion',
        external_id: ids.feature('motion'),
        category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ];
    if (
      Number.isFinite(Number(product.props?.temperature)) &&
      product.props?.temperature !== null
    ) {
      features.push(temperatureFeature(ids));
    }
    if (hasBattery(home, product)) {
      features.push(batteryFeature(ids));
    }
    return baseDevice(gladys, this.key, product, home, features);
  },

  readStates(product, home) {
    const temperature = Number(product.props?.temperature);
    return {
      motion: product.props?.motion?.status ? 1 : 0,
      temperature:
        product.props?.temperature !== undefined && Number.isFinite(temperature)
          ? Math.round(temperature * 10) / 10
          : null,
      battery: batteryOf(home, product),
    };
  },
};

export const contactSensor = {
  key: 'contact-sensor',
  hiveTypes: ['contactsensor'],
  readOnly: true,

  buildDevice(gladys, product, home) {
    const ids = idsOf(gladys, this.key, product);
    const features = [
      {
        name: 'Opening',
        external_id: ids.feature('opening'),
        category: DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
    ];
    if (hasBattery(home, product)) {
      features.push(batteryFeature(ids));
    }
    return baseDevice(gladys, this.key, product, home, features);
  },

  readStates(product, home) {
    const status = product.props?.status;
    return {
      opening:
        status === 'OPEN'
          ? OPENING_SENSOR_STATE.OPEN
          : status === 'CLOSED'
            ? OPENING_SENSOR_STATE.CLOSED
            : null,
      battery: batteryOf(home, product),
    };
  },
};
