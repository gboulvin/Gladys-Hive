// -----------------------------------------------------------------------------
// Entry point of the Hive integration for Gladys Assistant.
//
// This file only wires the SDK to the Hive controller (src/controller.js),
// which owns the Hive session, the cached home and the refresh loop. Every
// handler is registered BEFORE connect().
//
// Environment variables provided by the Gladys supervisor to the container
// (read by the SDK): GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { HiveController } from './src/controller.js';
import { MANIFEST_ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { createWidgets, refreshWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();
const controller = new HiveController(gladys);
const widgets = createWidgets(controller);

// Widgets show computed rows (mode, boost, counters): nudge them on change.
controller.setChangeListener(() => refreshWidgets(gladys, widgets));

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> reading the Hive home');
  await controller.refresh({ publishDevices: true });
});

// --- Command: the user acts on a controllable feature ------------------------
// Throwing acks the command as failed, with the message.
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  await controller.setValue(device, feature, value);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(MANIFEST_ACTIONS)) {
  gladys.onAction(actionKey, (fields) => handler(controller, { fields }));
}

// --- Scene actions ------------------------------------------------------------
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(controller, { fields }));
}

// --- Dashboard widgets ---------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(widgets)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(request));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
    widget.action({ actionKey, params, settings }),
  );
}

// --- Configuration updated by the user -----------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  await controller.applyConfig(newConfig);
});

// --- Connection lifecycle ------------------------------------------------------
gladys.on('connected', async () => {
  try {
    // What was published while the socket was down was dropped: publish again.
    controller.forgetPublished();
    // The loop is stopped while disconnected, so this (re)connects to Hive,
    // publishes the devices and restarts the loop.
    await controller.applyConfig(await gladys.getConfig());
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
  }
});

gladys.on('disconnected', () => {
  controller.stop();
});

// --- Graceful shutdown -----------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  controller.stop();
});

// --- Startup -----------------------------------------------------------------------
logger.info('Starting the Hive integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
