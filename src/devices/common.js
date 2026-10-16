// -----------------------------------------------------------------------------
// Shared pieces of the device blueprints.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { batteryOf, hardwareOf, productName } from '../hive/home.js';

/** Hive ON/OFF <-> Gladys 1/0. */
export const onOff = (status) => (status === 'ON' ? 1 : 0);

/** Device and feature external ids of a Hive node, namespaced by blueprint key. */
export function idsOf(gladys, blueprintKey, node) {
  return gladys.externalIds(blueprintKey, node.id);
}

/** Gladys device skeleton: name, external id, params describing the hardware. */
export function baseDevice(gladys, blueprintKey, product, home, features) {
  const hardware = hardwareOf(home, product);
  const params = [
    { name: 'HIVE_TYPE', value: product.type },
    { name: 'HIVE_MODEL', value: String(hardware?.props?.model ?? product.props?.model ?? '') },
  ].filter((param) => param.value !== '');
  return {
    name: productName(product),
    external_id: idsOf(gladys, blueprintKey, product).device,
    should_poll: false,
    params,
    features,
  };
}

export function batteryFeature(ids) {
  return {
    name: 'Battery',
    external_id: ids.feature('battery'),
    category: DEVICE_FEATURE_CATEGORIES.BATTERY,
    type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
    unit: DEVICE_FEATURE_UNITS.PERCENT,
    min: 0,
    max: 100,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

export function temperatureFeature(ids, key = 'temperature', name = 'Temperature') {
  return {
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
    unit: DEVICE_FEATURE_UNITS.CELSIUS,
    min: -20,
    max: 60,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/** Battery-powered hardware gets a battery feature. */
export function hasBattery(home, product) {
  return batteryOf(home, product) !== null;
}

/** Round a temperature to Hive's 0.5 °C step. */
export const halfDegree = (value) => Math.round(Number(value) * 2) / 2;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** A command on a feature the device does not have. */
export function unknownFeature(featureKey) {
  return new Error(`Unsupported Hive feature: ${featureKey}`);
}
