/**
 * @file background.js
 * @description MV3 service worker for the "cust*m Tab" extension.
 *
 * Responsibilities:
 *  - Open the onboarding WIZARD on first install (not the bare options page).
 *  - Hourly persistence check that warns if the new-tab override appears
 *    to have been disabled by Chrome.
 *  - Toolbar icon opens the options page.
 *
 * Storage schema (chrome.storage.local):
 *  mode, targetUrl, bookmarks[], searchEngine, maskUrl,
 *  theme, onboardingDone, lastSeen, browserLastStartup, lastNotified
 * See store.js for the canonical defaults.
 */

const ALARM_PERSISTENCE = 'persistenceCheck';
const NOTIFICATION_ID = 'custmtab-persistence';
const STARTUP_GRACE_MS = 2 * 60 * 60 * 1000; // 2h
const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// ── Install / Update ──────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First run → open the wizard so the user configures the tab immediately.
    await chrome.tabs.create({
      url: chrome.runtime.getURL('wizard.html'),
    });
    await chrome.storage.local.set({ onboardingDone: false });
  }
  // (Re-)create the persistence alarm; alarms are cleared on SW update.
  await chrome.alarms.create(ALARM_PERSISTENCE, { periodInMinutes: 60 });
});

// ── Startup ───────────────────────────────────────
chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.set({ browserLastStartup: Date.now() });
});

// ── Persistence check ─────────────────────────────
async function checkPersistence() {
  const { targetUrl, lastSeen, browserLastStartup, lastNotified } =
    await chrome.storage.local.get([
      'targetUrl',
      'lastSeen',
      'browserLastStartup',
      'lastNotified',
    ]);

  const now = Date.now();
  if (!targetUrl) return; // nothing to verify yet

  const startupTooLongAgo =
    browserLastStartup && now - browserLastStartup > STARTUP_GRACE_MS;
  const noNewTabSinceStartup = !lastSeen || lastSeen < browserLastStartup;

  if (startupTooLongAgo && noNewTabSinceStartup) {
    const cooldownExpired =
      !lastNotified || now - lastNotified > NOTIFY_COOLDOWN_MS;
    if (cooldownExpired) {
      await chrome.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'cust*m Tab — Check required',
        message:
          'Your new tab override may have been disabled. Open a new tab to verify.',
      });
      await chrome.storage.local.set({ lastNotified: now });
    }
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PERSISTENCE) await checkPersistence();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === NOTIFICATION_ID) {
    await chrome.runtime.openOptionsPage();
    await chrome.notifications.clear(NOTIFICATION_ID);
  }
});

// ── Toolbar icon → options ────────────────────────
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
