// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+): the Hive operations
// a device feature cannot express — a boost has a duration and a temperature.
//
//   - `fields` arrive RESOLVED (scene variables substituted, defaults applied);
//     a `"source": "devices"` field is the chosen device external_id. Left
//     empty, the first matching Hive zone is used (most homes have one);
//   - the declared scalar `outputs` say whether it worked: a device that is
//     not a heating zone (or not a hot water) is an output, not a failure;
//   - throwing fails this action only (Hive unreachable...).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { entriesOf, findEntry } from './devices/index.js';
import { heating, MAX_TEMPERATURE, MIN_TEMPERATURE } from './devices/heating.js';
import { hotWater } from './devices/hotWater.js';

const logger = createLogger({ name: 'scenes' });

/**
 * The heating zone or hot water a scene (or widget) targets: the chosen
 * device, or the first one of the home when none is chosen.
 * @returns {Promise<{ blueprint: object, node: object } | null>}
 */
export async function resolveTarget(controller, blueprint, deviceExternalId) {
  const home = await controller.currentHome();
  if (deviceExternalId) {
    const entry = findEntry(controller.gladys, home, deviceExternalId);
    return entry?.blueprint === blueprint ? entry : null;
  }
  return entriesOf(home).find((entry) => entry.blueprint === blueprint) ?? null;
}

const minutesOf = (value, fallback) => {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.round(minutes), 360) : fallback;
};

const temperatureOf = (value, fallback) => {
  const temperature = Number(value);
  return Number.isFinite(temperature)
    ? Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, temperature))
    : fallback;
};

/** Start a boost; resolves false when the target is not that kind of zone. */
export async function startBoost(controller, blueprint, deviceExternalId, options = {}) {
  const entry = await resolveTarget(controller, blueprint, deviceExternalId);
  if (!entry) {
    return false;
  }
  const { config } = controller;
  const minutes = minutesOf(options.duration, config.boost_duration);
  const fields =
    blueprint === heating
      ? heating.boostOn(
          entry.node,
          minutes,
          temperatureOf(options.temperature, config.boost_temperature),
        )
      : hotWater.boostOn(entry.node, minutes);
  await controller.execute(entry, fields);
  return true;
}

/** Stop a running boost; resolves false when there was none. */
export async function stopBoost(controller, blueprint, deviceExternalId) {
  const entry = await resolveTarget(controller, blueprint, deviceExternalId);
  if (!entry || !blueprint.isBoosting(entry.node)) {
    return false;
  }
  await controller.execute(entry, blueprint.boostOff(entry.node));
  return true;
}

const HEATING_MODES = {
  schedule: () => ({ mode: 'SCHEDULE' }),
  manual: (node, temperature) => ({
    mode: 'MANUAL',
    target: temperatureOf(temperature, Number(node.state?.target ?? 20)),
  }),
  off: () => ({ mode: 'OFF' }),
};

const HOT_WATER_MODES = {
  schedule: { mode: 'SCHEDULE' },
  on: { mode: 'MANUAL' },
  off: { mode: 'OFF' },
};

export const SCENE_ACTIONS = {
  async boost_heating(controller, { fields }) {
    logger.info(`Scene action boost_heating <- ${fields.device ?? 'first zone'}`);
    const boosted = await startBoost(controller, heating, fields.device, fields);
    return { boosted };
  },

  async cancel_heating_boost(controller, { fields }) {
    logger.info(`Scene action cancel_heating_boost <- ${fields.device ?? 'first zone'}`);
    return { cancelled: await stopBoost(controller, heating, fields.device) };
  },

  async boost_hot_water(controller, { fields }) {
    logger.info('Scene action boost_hot_water');
    const boosted = await startBoost(controller, hotWater, fields.device, fields);
    return { boosted };
  },

  async cancel_hot_water_boost(controller, { fields }) {
    logger.info('Scene action cancel_hot_water_boost');
    return { cancelled: await stopBoost(controller, hotWater, fields.device) };
  },

  async set_heating_mode(controller, { fields }) {
    logger.info(`Scene action set_heating_mode <- ${fields.mode}`);
    const entry = await resolveTarget(controller, heating, fields.device);
    const build = HEATING_MODES[fields.mode];
    if (!entry || !build) {
      return { applied: false };
    }
    await controller.execute(entry, build(entry.node, fields.temperature));
    return { applied: true };
  },

  async set_hot_water_mode(controller, { fields }) {
    logger.info(`Scene action set_hot_water_mode <- ${fields.mode}`);
    const entry = await resolveTarget(controller, hotWater, fields.device);
    const mode = HOT_WATER_MODES[fields.mode];
    if (!entry || !mode) {
      return { applied: false };
    }
    await controller.execute(entry, { ...mode });
    return { applied: true };
  },
};
