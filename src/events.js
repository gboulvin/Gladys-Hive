// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`, Gladys 5.1+).
//
// The Hive cloud is polled: each refresh is compared with the previous one,
// and every TRANSITION becomes one scene event (never one per poll). The
// states themselves stay device features: an event says "this happened, with
// these details", and carries the device external id the scene author
// filters on (a `"source": "devices"` field).
//
// Commands sent by Gladys patch the cached home before the next refresh, so
// they never come back as events: a scene acting on Hive cannot loop through
// its own trigger.
// -----------------------------------------------------------------------------

import { batteryOf, isOnline, productName } from './hive/home.js';
import { entriesOf } from './devices/index.js';
import { heating } from './devices/heating.js';

// Keys are forever: scenes store them.
export const SCENE_TRIGGERS = {
  MOTION_DETECTED: 'motion_detected',
  CONTACT_CHANGED: 'contact_changed',
  BOOST_ENDED: 'boost_ended',
  CONNECTIVITY_CHANGED: 'connectivity_changed',
  BATTERY_LOW: 'battery_low',
};

export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

/**
 * Scene events between two refreshes of the home.
 * @returns {Array<{ key: string, data: Record<string, string | number | boolean | null> }>}
 */
export function diffEvents(gladys, previousHome, home, config) {
  if (!previousHome) {
    // First read: nothing "happened", we just learned the current state.
    return [];
  }
  const previousNodes = new Map(
    entriesOf(previousHome).map(({ blueprint, node }) => [`${blueprint.key}:${node.id}`, node]),
  );
  const events = [];

  for (const { blueprint, node } of entriesOf(home)) {
    const before = previousNodes.get(`${blueprint.key}:${node.id}`);
    if (!before || blueprint.fromActions) {
      continue;
    }
    const device = gladys.externalIds(blueprint.key, node.id).device;
    const deviceName = productName(node);

    if (
      node.type === 'motionsensor' &&
      !before.props?.motion?.status &&
      node.props?.motion?.status
    ) {
      events.push({
        key: SCENE_TRIGGERS.MOTION_DETECTED,
        data: { device, device_name: deviceName },
      });
    }

    if (node.type === 'contactsensor' && before.props?.status !== node.props?.status) {
      const state = { OPEN: 'open', CLOSED: 'closed' }[node.props?.status];
      if (state) {
        events.push({
          key: SCENE_TRIGGERS.CONTACT_CHANGED,
          data: { device, state, device_name: deviceName },
        });
      }
    }

    if (before.state?.mode === 'BOOST' && node.state?.mode !== 'BOOST') {
      events.push({
        key: SCENE_TRIGGERS.BOOST_ENDED,
        data: {
          device,
          kind: blueprint === heating ? 'heating' : 'hot_water',
          device_name: deviceName,
        },
      });
    }

    const wasOnline = isOnline(previousHome, before);
    const online = isOnline(home, node);
    if (wasOnline !== online) {
      events.push({
        key: SCENE_TRIGGERS.CONNECTIVITY_CHANGED,
        data: { device, state: online ? 'online' : 'offline', device_name: deviceName },
      });
    }

    const threshold = config.battery_low_threshold;
    const batteryBefore = batteryOf(previousHome, before);
    const battery = batteryOf(home, node);
    if (
      battery !== null &&
      battery < threshold &&
      (batteryBefore === null || batteryBefore >= threshold)
    ) {
      events.push({
        key: SCENE_TRIGGERS.BATTERY_LOW,
        data: { device, battery, device_name: deviceName },
      });
    }
  }
  return events;
}
