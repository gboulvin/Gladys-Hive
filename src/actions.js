// -----------------------------------------------------------------------------
// Manifest `actions`: the buttons of the Configuration screen. Each handler
// resolves the multi-language message shown under its button.
// -----------------------------------------------------------------------------

import { buildDiscoveredDevices } from './devices/index.js';
import { ACTION_MESSAGES, STATUS } from './i18n.js';

function statusMessage(controller) {
  const { status } = controller;
  if (status.code === 'sms_required') {
    return STATUS.sms_required(status.destination);
  }
  return STATUS[status.code] ?? STATUS.unavailable;
}

const deviceCount = (controller) =>
  buildDiscoveredDevices(controller.gladys, controller.home, controller.config).length;

export const MANIFEST_ACTIONS = {
  // Log in again with the saved settings (this may send an SMS code).
  async test_connection(controller) {
    await controller.connect();
    return controller.connected
      ? ACTION_MESSAGES.connected(deviceCount(controller))
      : statusMessage(controller);
  },

  // Re-read the home and re-publish the devices (a bulb added in the Hive app...).
  async refresh_devices(controller) {
    if (!controller.connected) {
      return statusMessage(controller);
    }
    await controller.refresh({ publishDevices: true });
    return ACTION_MESSAGES.refreshed(deviceCount(controller));
  },

  // Forget the remembered device and the session tokens (troubleshooting, or
  // before removing the integration).
  async forget_session(controller) {
    await controller.forgetSession();
    return controller.connected
      ? ACTION_MESSAGES.connected(deviceCount(controller))
      : ACTION_MESSAGES.forgotten;
  },
};
