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
 * Storage schema (api.storage.local):
 *  mode, targetUrl, bookmarks[], searchEngine, maskUrl,
 *  theme, onboardingDone, lastSeen, browserLastStartup, lastNotified
 * See store.js for the canonical defaults.
 */

const api = globalThis.browser ?? globalThis.chrome;

const ALARM_PERSISTENCE = 'persistenceCheck';
const NOTIFICATION_ID = 'custmtab-persistence';
const STARTUP_GRACE_MS = 2 * 60 * 60 * 1000; // 2h
const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// ── Install / Update ──────────────────────────────
api.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First run → open the wizard so the user configures the tab immediately.
    await api.tabs.create({
      url: api.runtime.getURL('wizard.html'),
    });
    await api.storage.local.set({ onboardingDone: false });
  }
  // (Re-)create the persistence alarm; alarms are cleared on SW update.
  await api.alarms.create(ALARM_PERSISTENCE, { periodInMinutes: 60 });
});

// ── Startup ───────────────────────────────────────
api.runtime.onStartup.addListener(async () => {
  await api.storage.local.set({ browserLastStartup: Date.now() });
});

// ── Persistence check ─────────────────────────────
async function checkPersistence() {
  const { targetUrl, lastSeen, browserLastStartup, lastNotified } =
    await api.storage.local.get([
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
    const cooldownExpired = !lastNotified || now - lastNotified > NOTIFY_COOLDOWN_MS;
    if (cooldownExpired) {
      await api.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'cust*m Tab — Check required',
        message:
          'Your new tab override may have been disabled. Open a new tab to verify.',
      });
      await api.storage.local.set({ lastNotified: now });
    }
  }
}

api.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PERSISTENCE) await checkPersistence();
});

api.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === NOTIFICATION_ID) {
    await api.runtime.openOptionsPage();
    await api.notifications.clear(NOTIFICATION_ID);
  }
});

// ── Toolbar icon → options ────────────────────────
api.action.onClicked.addListener(() => {
  api.runtime.openOptionsPage();
});

// ── Omnibox search (keyword: "ct") ────────────────
// Load the shared engine registry into the background context so we can build
// search URLs without a separate copy.
//
// Chrome runs this file as a service worker and needs importScripts(). Firefox
// runs it as an event page, where importScripts() does not exist — there,
// manifest `background.scripts` has already loaded search-engines.js ahead of
// this file, so the registry is present either way.
if (typeof importScripts === 'function') {
  try {
    importScripts('search-engines.js');
  } catch (e) {
    console.warn('cust*m Tab: failed to import search-engines.js', e);
  }
}

const OMNIBOX = {
  lastInput: '',
};

api.omnibox.onInputChanged.addListener((text, suggest) => {
  OMNIBOX.lastInput = text || '';
  try {
    const engines = self.CUSTM_ENGINES.top();
    const q = OMNIBOX.lastInput.trim();
    suggest(
      engines.map((e) => ({
        content: e.id + ' ' + q,
        description: `${e.icon} Suche auf ${e.name}: ${q || '…'}`,
      }))
    );
  } catch {}
});

api.omnibox.onInputEntered.addListener(async (text, disposition) => {
  let engineId = null;
  let query = text;
  const parts = (text || '').trim().split(/\s+/);
  // If the first token matches an engine id, use it; else fall back to stored default.
  try {
    if (self.CUSTM_ENGINES.getById(parts[0]).id === parts[0]) {
      engineId = parts[0];
      query = parts.slice(1).join(' ');
    }
  } catch {}
  if (!engineId) {
    const s = await api.storage.local.get(['searchEngine']);
    engineId = s.searchEngine || 'duckduckgo';
    query = text;
  }
  const url = self.CUSTM_ENGINES.buildUrl(engineId, query);

  if (disposition === 'newForegroundTab') {
    api.tabs.create({ url });
  } else if (disposition === 'newBackgroundTab') {
    api.tabs.create({ url, active: false });
  } else {
    api.tabs.update({ url });
  }
});

api.omnibox.setDefaultSuggestion({
  description: 'cust*m Tab — Suche mit deiner Standard-Suchmaschine',
});
