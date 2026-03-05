'use strict';

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const AutoLaunch = require('auto-launch');
const state = require('./state');
const { AUTO_LAUNCH_NAME } = require('./config');

function cleanupStartupShortcut() {
  try {
    const appData = process.env.APPDATA || '';
    if (!appData) return;
    const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const shortcutPath = path.join(startupDir, `${AUTO_LAUNCH_NAME}.lnk`);
    if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath);
  } catch (err) {
    console.warn('Startup shortcut cleanup failed:', err.message);
  }
}

function setStartupApproved(enabled) {
  return new Promise((resolve) => {
    const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
    const enabledValue = '02,00,00,00,00,00,00,00,00,00,00,00';
    const disabledValue = '03,00,00,00,00,00,00,00,00,00,00,00';
    const data = enabled ? enabledValue : disabledValue;
    execFile(
      'reg',
      ['add', regPath, '/v', AUTO_LAUNCH_NAME, '/t', 'REG_BINARY', '/d', data, '/f'],
      { windowsHide: true },
      () => resolve()
    );
  });
}

function cleanupLegacyScheduledTask() {
  const taskName = `${AUTO_LAUNCH_NAME} AutoStart`;
  execFile('schtasks', ['/Delete', '/TN', taskName, '/F'], { windowsHide: true }, () => {});
}

function cleanupAllLegacyAutoStart() {
  return Promise.all([
    new Promise((resolve) => {
      cleanupStartupShortcut();
      resolve();
    }),
    new Promise((resolve) => {
      cleanupLegacyScheduledTask();
      resolve();
    }),
  ]);
}

async function setAutoLaunch(enabled) {
  try {
    if (!state.autoLauncher) return;

    await cleanupAllLegacyAutoStart();

    const isEnabled = await state.autoLauncher.isEnabled();
    if (enabled && !isEnabled) {
      await state.autoLauncher.enable();
    } else if (!enabled && isEnabled) {
      await state.autoLauncher.disable();
    }

    state.autoLaunchEnabled = await state.autoLauncher.isEnabled();

    await setStartupApproved(state.autoLaunchEnabled);
  } catch (err) {
    console.warn('Auto-launch setup failed:', err.message);
  }
}

async function isAutoLaunchEnabled() {
  try {
    if (!state.autoLauncher) return false;
    return await state.autoLauncher.isEnabled();
  } catch {
    return false;
  }
}

async function setupAutoLaunch() {
  state.autoLauncher = new AutoLaunch({ name: AUTO_LAUNCH_NAME });
  try {
    await cleanupAllLegacyAutoStart();
    state.autoLaunchEnabled = await state.autoLauncher.isEnabled();
    await setStartupApproved(state.autoLaunchEnabled);
  } catch (err) {
    console.warn('Auto-launch setup failed:', err.message);
  }
}

module.exports = {
  setAutoLaunch,
  isAutoLaunchEnabled,
  setupAutoLaunch,
};
