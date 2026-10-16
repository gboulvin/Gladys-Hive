// -----------------------------------------------------------------------------
// Device registry: which blueprint handles which Hive node, and the helpers
// that turn a Hive home into Gladys payloads.
//
// A blueprint exposes:
//   - key                      : external id namespace — FOREVER, it is in
//                                every device and feature external id
//   - hiveTypes                : Hive product types it handles, or
//   - fromActions              : true when it handles the Hive actions
//   - buildDevice(gladys, node, home, config): the discovery payload
//   - readStates(node, home, config): { featureKey: value | null }
//   - command(node, featureKey, value, config, home) (optional): the fields
//     of the Hive command for a Gladys value
//   - execute(api, node, fields) (optional): send the command, when it is not
//     a product state change
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { isOnline } from '../hive/home.js';
import { heating } from './heating.js';
import { hotWater } from './hotWater.js';
import { light } from './light.js';
import { plug } from './plug.js';
import { motionSensor, contactSensor } from './sensors.js';
import { hiveAction } from './hiveAction.js';

export const DEVICE_BLUEPRINTS = [
  heating,
  hotWater,
  light,
  plug,
  motionSensor,
  contactSensor,
  hiveAction,
];

/** The Hive nodes a blueprint handles. */
export function nodesOf(blueprint, home) {
  if (!home) {
    return [];
  }
  if (blueprint.fromActions) {
    return home.actions;
  }
  return home.products.filter((product) => blueprint.hiveTypes.includes(product.type));
}

/** Every [blueprint, node] pair of the home. */
export function entriesOf(home) {
  return DEVICE_BLUEPRINTS.flatMap((blueprint) =>
    nodesOf(blueprint, home).map((node) => ({ blueprint, node })),
  );
}

/** The discovery payload: every Hive device Gladys can create. */
export function buildDiscoveredDevices(gladys, home, config) {
  return entriesOf(home).map(({ blueprint, node }) =>
    blueprint.buildDevice(gladys, node, home, config),
  );
}

/**
 * The states of every feature, in the publishStates format. Only the
 * features the device declares, only known values.
 */
export function buildStates(gladys, home, config) {
  return entriesOf(home).flatMap(({ blueprint, node }) => {
    const device = blueprint.buildDevice(gladys, node, home, config);
    const declared = new Set(device.features.map((feature) => feature.external_id));
    const ids = gladys.externalIds(blueprint.key, node.id);
    return Object.entries(blueprint.readStates(node, home, config))
      .filter(
        ([key, state]) => state !== null && state !== undefined && declared.has(ids.feature(key)),
      )
      .map(([key, state]) => ({ device_feature_external_id: ids.feature(key), state }));
  });
}

/** Find the blueprint and Hive node behind a Gladys device external id. */
export function findEntry(gladys, home, deviceExternalId) {
  return (
    entriesOf(home).find(
      ({ blueprint, node }) =>
        gladys.externalIds(blueprint.key, node.id).device === deviceExternalId,
    ) ?? null
  );
}

/** The feature key of a feature external id: what follows the device id. */
export function featureKeyOf(deviceExternalId, featureExternalId) {
  const prefix = `${deviceExternalId}:`;
  return featureExternalId.startsWith(prefix) ? featureExternalId.slice(prefix.length) : null;
}

/**
 * Transport badges: Hive is a cloud service, a product Hive reports offline
 * (unplugged bulb, flat battery, hub down) is unreachable.
 */
export function buildTransportEntries(gladys, home) {
  return entriesOf(home)
    .filter(({ blueprint }) => !blueprint.fromActions)
    .map(({ blueprint, node }) => ({
      external_id: gladys.externalIds(blueprint.key, node.id).device,
      transport: isOnline(home, node) ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
    }));
}
