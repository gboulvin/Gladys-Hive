// -----------------------------------------------------------------------------
// The Hive controller: one object owning the Hive session, the cached home and
// the refresh loop, used by index.js (SDK wiring), src/scenes.js and
// src/widgets.js.
//
// Lifecycle:
//   connect()  -> log in (or finish the SMS step), read the home, publish the
//                 devices, start the refresh loop;
//   refresh()  -> read the home, publish the changed states, the transport
//                 badges and the scene events of the transitions;
//   command()  -> send a Hive command, patch the cached home, publish, and
//                 re-read the home a few seconds later (Hive's confirmation).
//
// A login that needs the user (wrong password, SMS code) stops the loop and
// says so in the connection status: nothing retries a login that would send
// an SMS on its own. Network errors keep the loop running.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HiveAuth, HiveAuthError, SmsCodeRequiredError } from './hive/auth.js';
import { createHiveApi } from './hive/api.js';
import { indexHome } from './hive/home.js';
import { createFileStore } from './hive/store.js';
import { normalizeConfig } from './config.js';
import {
  buildDiscoveredDevices,
  buildStates,
  buildTransportEntries,
  featureKeyOf,
  findEntry,
} from './devices/index.js';
import { diffEvents } from './events.js';
import { STATUS } from './i18n.js';

const logger = createLogger({ name: 'hive' });

const STATE_HEARTBEAT_MS = 30 * 60 * 1000;
// Hive applies a command in a few seconds: read it back then.
const CONFIRM_DELAY_MS = 4000;

// Login failures only the user can fix: the loop stops until the config changes.
const BLOCKING_CODES = new Set([
  'missing_credentials',
  'invalid_credentials',
  'invalid_sms_code',
  'sms_expired',
  'password_reset_required',
  'unsupported_challenge',
]);

export class HiveController {
  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {object} [options] - injected by the tests
   */
  constructor(gladys, { store, fetchImpl, loginInfo, confirmDelayMs = CONFIRM_DELAY_MS } = {}) {
    this.gladys = gladys;
    this.store = store ?? createFileStore();
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.loginInfo = loginInfo;
    this.confirmDelayMs = confirmDelayMs;
    this.config = normalizeConfig();
    this.auth = null;
    this.api = null;
    this.home = null;
    this.status = { code: 'unconfigured' };
    this.publishedStatus = null;
    this.publishedDevices = null;
    this.publishedTransports = null;
    this.pollTimer = null;
    this.confirmTimer = null;
    this.polling = false;
    this.onChange = () => {};
  }

  get connected() {
    return this.status.code === 'connected';
  }

  /** Called with nothing whenever the home or the status changed (widgets). */
  setChangeListener(listener) {
    this.onChange = listener;
  }

  /**
   * Apply a (new) configuration. Reconnects when the account changed, or when
   * a new SMS code arrives; otherwise only the refresh pace follows.
   */
  async applyConfig(rawConfig) {
    const previous = this.config;
    this.config = normalizeConfig(rawConfig);
    const accountChanged =
      !this.auth ||
      previous.username.toLowerCase() !== this.config.username.toLowerCase() ||
      previous.password !== this.config.password;

    if (accountChanged) {
      this.stopPolling();
      this.home = null;
      this.auth = new HiveAuth({
        username: this.config.username,
        password: this.config.password,
        store: this.store,
        fetchImpl: this.fetchImpl,
        loginInfo: this.loginInfo,
      });
      this.api = createHiveApi({ auth: this.auth, fetchImpl: this.fetchImpl });
      return this.connect();
    }
    const newSmsCode =
      this.config.sms_code && this.config.sms_code !== previous.sms_code && !this.connected;
    if (newSmsCode || !this.polling) {
      return this.connect();
    }
    // Same account, still connected: apply the new refresh interval.
    this.startPolling();
    return undefined;
  }

  /**
   * Log in (or finish the pending SMS step), read the home, publish the
   * devices and start the refresh loop. Never throws: the outcome is the
   * connection status.
   */
  async connect() {
    this.stopPolling();
    if (!this.config.username || !this.config.password) {
      await this.setStatus({ code: 'unconfigured' });
      return this.status;
    }
    try {
      await this.auth.init();
      const pending = this.auth.pendingSms();
      if (pending) {
        const code = this.config.sms_code;
        if (!code || code === this.auth.persisted.lastSmsCode) {
          // Waiting for the user: a new login would send yet another SMS.
          await this.setStatus({ code: 'sms_required', destination: pending.destination });
          return this.status;
        }
        await this.auth.submitSmsCode(code);
      }
      await this.refresh({ publishDevices: true });
      this.startPolling();
    } catch (err) {
      await this.handleError(err);
    }
    return this.status;
  }

  /** Forget the Hive session and the remembered device, then log in again. */
  async forgetSession() {
    if (!this.auth) {
      return this.status;
    }
    this.stopPolling();
    await this.auth.reset();
    return this.connect();
  }

  /** Read the home and publish what changed. Throws on failure. */
  async refresh({ publishDevices = false } = {}) {
    const home = indexHome(await this.api.getAll());
    const previousHome = this.home;
    this.home = home;

    const devices = buildDiscoveredDevices(this.gladys, home, this.config);
    const devicesSignature = JSON.stringify(devices);
    if (publishDevices || devicesSignature !== this.publishedDevices) {
      await this.gladys.publishDiscoveredDevices(devices);
      this.publishedDevices = devicesSignature;
    }
    await this.publishStates();
    await this.publishTransports();

    for (const event of diffEvents(this.gladys, previousHome, home, this.config)) {
      try {
        await this.gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.warn(`Scene event ${event.key} refused: ${err.message}`);
      }
    }
    await this.setStatus({ code: 'connected' });
    this.onChange();
    return home;
  }

  async publishStates() {
    const states = buildStates(this.gladys, this.home, this.config);
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  }

  async publishTransports() {
    const entries = buildTransportEntries(this.gladys, this.home);
    const signature = JSON.stringify(entries);
    if (entries.length > 0 && signature !== this.publishedTransports) {
      await this.gladys.publishTransports(entries);
      this.publishedTransports = signature;
    }
  }

  // --- Refresh loop -----------------------------------------------------------

  startPolling() {
    this.stopPolling();
    this.polling = true;
    this.scheduleNextPoll();
  }

  scheduleNextPoll() {
    if (!this.polling) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.refresh();
      } catch (err) {
        await this.handleError(err);
      }
      this.scheduleNextPoll();
    }, this.config.poll_frequency * 1000);
  }

  stopPolling() {
    this.polling = false;
    clearTimeout(this.pollTimer);
    clearTimeout(this.confirmTimer);
    this.pollTimer = null;
    this.confirmTimer = null;
  }

  async handleError(err) {
    if (err instanceof SmsCodeRequiredError) {
      this.stopPolling();
      await this.setStatus({ code: 'sms_required', destination: err.destination });
      return;
    }
    if (err instanceof HiveAuthError && BLOCKING_CODES.has(err.code)) {
      logger.error(`Hive login failed: ${err.message}`);
      this.stopPolling();
      await this.setStatus({ code: err.code });
      return;
    }
    // Network, Hive outage, rate limit: keep the loop, report it.
    logger.warn(`Hive refresh failed: ${err.message}`);
    await this.setStatus({
      code: err instanceof HiveAuthError ? err.code : 'unavailable',
    });
    if (!this.polling && this.auth) {
      // The first connection failed on the network: retry at the normal pace.
      this.polling = true;
      this.scheduleNextPoll();
    }
  }

  async setStatus(status) {
    this.status = status;
    const signature = JSON.stringify(status);
    if (signature === this.publishedStatus) {
      return;
    }
    this.publishedStatus = signature;
    const message =
      status.code === 'connected'
        ? undefined
        : status.code === 'sms_required'
          ? STATUS.sms_required(status.destination)
          : (STATUS[status.code] ?? STATUS.unavailable);
    try {
      await this.gladys.setConnectionStatus(status.code === 'connected', message);
    } catch (err) {
      logger.warn(`Could not publish the connection status: ${err.message}`);
    }
    this.onChange();
  }

  // --- Commands ---------------------------------------------------------------

  /** The cached home, read once if the loop has not run yet. */
  async currentHome() {
    if (!this.home) {
      if (!this.api) {
        throw new Error('Hive is not configured');
      }
      await this.refresh();
    }
    return this.home;
  }

  /** onSetValue: a Gladys feature command. */
  async setValue(device, feature, value) {
    const home = await this.currentHome();
    const entry = findEntry(this.gladys, home, device.external_id);
    const featureKey = featureKeyOf(device.external_id, feature.external_id);
    if (!entry || !featureKey || typeof entry.blueprint.command !== 'function') {
      throw new Error(`No Hive command for ${feature.external_id}`);
    }
    const fields = entry.blueprint.command(entry.node, featureKey, value, this.config, home);
    await this.execute(entry, fields);
  }

  /**
   * Send a command to one Hive node and reflect it right away.
   * @param {{ blueprint: object, node: object }} entry
   * @param {object} fields
   */
  async execute({ blueprint, node }, fields) {
    logger.info(`Hive command -> ${node.type ?? 'action'} ${node.id}: ${JSON.stringify(fields)}`);
    if (typeof blueprint.execute === 'function') {
      await blueprint.execute(this.api, node, fields);
      Object.assign(node, fields);
    } else {
      await this.api.setState(node.type, node.id, fields);
      if (fields.mode === 'BOOST' && node.state?.mode !== 'BOOST') {
        // What the boost returns to, as Hive itself records it.
        node.props = {
          ...node.props,
          previous: { mode: node.state?.mode, target: node.state?.target },
        };
      }
      node.state = { ...node.state, ...fields };
    }
    await this.publishStates();
    this.onChange();
    this.scheduleConfirmation();
  }

  scheduleConfirmation() {
    clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => {
      this.refresh().catch((err) => logger.warn(`Hive confirmation read failed: ${err.message}`));
    }, this.confirmDelayMs);
  }

  stop() {
    this.stopPolling();
  }

  /** After a Gladys reconnection: re-send the status and badges next time. */
  forgetPublished() {
    this.publishedStatus = null;
    this.publishedTransports = null;
  }
}
