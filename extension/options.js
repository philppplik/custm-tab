/**
 * cust*m Tab — Options page logic
 */
(async () => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const urlInput = $('url-input');
  const urlStatusIcon = $('url-status-icon');
  const urlHint = $('url-hint');
  const maskUrlToggle = $('toggle-mask-url');
  const redirectSettings = $('redirect-settings');
  const modeBtns = document.querySelectorAll('.mode-opt');
  const engineSelect = $('engine-select');
  const themeChips = document.querySelectorAll('.theme-chip');
  const btnSave = $('btn-save');
  const saveFeedback = $('save-feedback');
  const statusBadge = $('status-badge');
  const btnHowto = $('btn-howto');
  const themeToggle = $('theme-toggle');
  const onboardingBanner = $('onboarding-banner');
  const btnDismissOnboard = $('btn-dismiss-onboarding');

  let currentTheme = 'auto';
  let currentMode = 'dashboard';
  let validateTimer = null;

  /* ── Theme ────────────────────────────────────── */
  function applyTheme(theme) {
    currentTheme = theme;
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    themeToggle.textContent = theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐';
    themeChips.forEach((c) => c.classList.toggle('active', c.dataset.theme === theme));
  }
  themeToggle.addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    applyTheme(order[(order.indexOf(currentTheme) + 1) % 3]);
  });
  themeChips.forEach((c) =>
    c.addEventListener('click', () => applyTheme(c.dataset.theme))
  );

  /* ── Mode ─────────────────────────────────────── */
  function applyMode(mode) {
    currentMode = mode;
    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    redirectSettings.hidden = mode !== 'redirect';
  }
  modeBtns.forEach((b) =>
    b.addEventListener('click', () => applyMode(b.dataset.mode))
  );

  /* ── Engine select ────────────────────────────── */
  function buildEngineSelect(selectedId) {
    engineSelect.innerHTML = '';
    window.CUSTM_ENGINES.all.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      const tag =
        e.privacy === 'high' ? ' (privat)' : e.privacy === 'medium' ? ' (mittel)' : ' (tracking)';
      opt.textContent = `${e.icon} ${e.name}${tag}`;
      if (e.id === selectedId) opt.selected = true;
      engineSelect.appendChild(opt);
    });
  }

  /* ── URL validation ───────────────────────────── */
  function setInputState(state, hint, icon) {
    urlInput.classList.remove('url-input--valid', 'url-input--invalid', 'url-input--warning');
    urlHint.classList.remove('field__hint--success', 'field__hint--error', 'field__hint--warning');
    if (state === 'valid') {
      urlInput.classList.add('url-input--valid');
      urlHint.classList.add('field__hint--success');
    } else if (state === 'invalid') {
      urlInput.classList.add('url-input--invalid');
      urlHint.classList.add('field__hint--error');
    } else if (state === 'warning') {
      urlInput.classList.add('url-input--warning');
      urlHint.classList.add('field__hint--warning');
    }
    urlHint.textContent = hint;
    urlStatusIcon.textContent = icon;
  }

  async function validateUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) {
      setInputState('empty', '', '');
      return 'empty';
    }
    if (trimmed.startsWith('file://')) {
      let allowed = false;
      try {
        allowed = await new Promise((res) =>
          chrome.extension.isAllowedFileSchemeAccess(res)
        );
      } catch {
        allowed = false;
      }
      if (allowed) {
        setInputState('valid', 'Lokale Datei — Zugriff aktiv ✓', '✓');
        return 'valid';
      }
      setInputState('warning', 'Dateizugriff nicht aktiv — siehe unten', '⚠');
      return 'warning';
    }
    if (trimmed.startsWith('chrome-extension://')) {
      setInputState('valid', 'Extension-URL ✓', '✓');
      return 'valid';
    }
    try {
      new URL(trimmed);
      setInputState('valid', 'Sieht gut aus ✓', '✓');
      return 'valid';
    } catch {
      setInputState('invalid', 'Keine gültige URL', '✗');
      return 'invalid';
    }
  }

  urlInput.addEventListener('input', () => {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => validateUrl(urlInput.value), 400);
  });

  /* ── Status badge ─────────────────────────────── */
  function updateStatusBadge(active) {
    if (active) {
      statusBadge.textContent = '● Aktiv';
      statusBadge.className = 'status-badge status-badge--active';
    } else {
      statusBadge.textContent = '● Nicht konfiguriert';
      statusBadge.className = 'status-badge status-badge--inactive';
    }
  }

  /* ── Save feedback ────────────────────────────── */
  let fbTimer = null;
  function showSaveFeedback() {
    saveFeedback.textContent = 'Gespeichert ✓';
    saveFeedback.classList.add('save-feedback--visible');
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(() => {
      saveFeedback.classList.remove('save-feedback--visible');
      setTimeout(() => (saveFeedback.textContent = ''), 200);
    }, 2000);
  }

  /* ── Load ─────────────────────────────────────── */
  const settings = await window.CUSTM_STORE.getAll();
  applyMode(settings.mode || 'dashboard');
  applyTheme(settings.theme || 'auto');
  buildEngineSelect(settings.searchEngine || 'duckduckgo');
  urlInput.value = settings.targetUrl || '';
  maskUrlToggle.checked = settings.maskUrl !== false;

  const isActive =
    settings.mode === 'redirect' ? !!settings.targetUrl : true;
  updateStatusBadge(isActive);
  if (settings.targetUrl) await validateUrl(settings.targetUrl);

  // Onboarding banner
  const params = new URLSearchParams(location.search);
  if (params.get('onboarding') === 'true' && !settings.onboardingDone) {
    onboardingBanner.hidden = false;
  }
  btnDismissOnboard.addEventListener('click', () => {
    onboardingBanner.hidden = true;
    chrome.storage.local.set({ onboardingDone: true });
  });

  /* ── Save ─────────────────────────────────────── */
  btnSave.addEventListener('click', async () => {
    if (currentMode === 'redirect') {
      const state = await validateUrl(urlInput.value);
      if (state === 'invalid') return;
      await window.CUSTM_STORE.set({
        mode: 'redirect',
        targetUrl: urlInput.value.trim(),
        maskUrl: maskUrlToggle.checked,
        theme: currentTheme,
        searchEngine: engineSelect.value,
      });
      updateStatusBadge(!!urlInput.value.trim());
    } else {
      await window.CUSTM_STORE.set({
        mode: 'dashboard',
        theme: currentTheme,
        searchEngine: engineSelect.value,
      });
      updateStatusBadge(true);
    }
    showSaveFeedback();
  });

  maskUrlToggle.addEventListener('change', () =>
    chrome.storage.local.set({ maskUrl: maskUrlToggle.checked })
  );

  btnHowto.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('howto.html') });
  });
})();
