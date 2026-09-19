/**
 * cust*m Tab — Options page logic
 */
(async () => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const api = window.CUSTM_API;
  const urls = window.CUSTM_URL;
  const store = window.CUSTM_STORE;

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
  const syncToggle = $('toggle-sync');
  const iconModeSelect = $('icon-mode-select');
  const iconModeNote = $('icon-mode-note');

  let currentTheme = 'auto';
  let currentMode = 'dashboard';
  let validateTimer = null;

  /* ── Theme ────────────────────────────────────── */
  function applyTheme(theme) {
    currentTheme = theme;
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else document.documentElement.removeAttribute('data-theme');
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
  modeBtns.forEach((b) => b.addEventListener('click', () => applyMode(b.dataset.mode)));

  /* ── Engine select ────────────────────────────── */
  function buildEngineSelect(selectedId) {
    engineSelect.innerHTML = '';
    window.CUSTM_ENGINES.all.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      const tag =
        e.privacy === 'high'
          ? ' (private)'
          : e.privacy === 'medium'
            ? ' (mixed)'
            : ' (tracking)';
      opt.textContent = `${e.icon} ${e.name}${tag}`;
      if (e.id === selectedId) opt.selected = true;
      engineSelect.appendChild(opt);
    });
  }

  /* ── URL validation ───────────────────────────── */
  function setInputState(state, hint, icon) {
    urlInput.classList.remove(
      'url-input--valid',
      'url-input--invalid',
      'url-input--warning'
    );
    urlHint.classList.remove(
      'field__hint--success',
      'field__hint--error',
      'field__hint--warning'
    );
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

  const URL_ERRORS = {
    urlEmpty: 'Enter a URL.',
    urlMalformed: 'That does not look like a valid URL.',
    urlUnsafeProtocol: 'Only http, https, file and extension URLs are allowed.',
    urlNoHost: 'That URL is missing a hostname.',
  };

  /**
   * Validate the redirect target.
   *
   * Goes through CUSTM_URL rather than a bare `new URL()`: parsing succeeding
   * is not the same as being safe to navigate to, and `javascript:` parses.
   */
  async function validateUrl(value) {
    if (!String(value || '').trim()) {
      setInputState('empty', '', '');
      return 'empty';
    }

    const target = urls.normalizeTargetUrl(value);
    if (!target.ok) {
      setInputState('invalid', URL_ERRORS[target.reason] || URL_ERRORS.urlMalformed, '✗');
      return 'invalid';
    }

    if (target.kind === 'file') {
      // Chrome and Firefox both gate file:// behind a per-extension switch the
      // user has to flip themselves; warn rather than pretend it will work.
      let allowed = false;
      try {
        allowed = await api.extension.isAllowedFileSchemeAccess();
      } catch {
        allowed = false;
      }
      if (allowed) {
        setInputState('valid', 'Local file — access granted ✓', '✓');
        return 'valid';
      }
      setInputState('warning', 'File access is off — see the guide below', '⚠');
      return 'warning';
    }

    if (target.kind === 'extension') {
      setInputState('valid', 'Extension page ✓', '✓');
      return 'valid';
    }

    setInputState('valid', 'Looks good ✓', '✓');
    return 'valid';
  }

  urlInput.addEventListener('input', () => {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => validateUrl(urlInput.value), 400);
  });

  /* ── Status badge ─────────────────────────────── */
  function updateStatusBadge(active) {
    if (active) {
      statusBadge.textContent = '● Active';
      statusBadge.className = 'status-badge status-badge--active';
    } else {
      statusBadge.textContent = '● Not configured';
      statusBadge.className = 'status-badge status-badge--inactive';
    }
  }

  /* ── Save feedback ────────────────────────────── */
  let fbTimer = null;
  function showSaveFeedback() {
    saveFeedback.textContent = 'Saved ✓';
    saveFeedback.classList.add('save-feedback--visible');
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(() => {
      saveFeedback.classList.remove('save-feedback--visible');
      setTimeout(() => (saveFeedback.textContent = ''), 200);
    }, 2000);
  }

  /* ── Load ─────────────────────────────────────── */
  const settings = await store.getAll();
  applyMode(settings.mode || 'dashboard');
  applyTheme(settings.theme || 'auto');
  buildEngineSelect(settings.searchEngine || 'duckduckgo');
  urlInput.value = settings.targetUrl || '';
  maskUrlToggle.checked = settings.maskUrl !== false;

  const isActive = settings.mode === 'redirect' ? !!settings.targetUrl : true;
  updateStatusBadge(isActive);
  if (settings.targetUrl) await validateUrl(settings.targetUrl);
  syncToggle.checked = settings.syncEnabled === true;

  if (iconModeSelect) {
    iconModeSelect.value = settings.iconMode;
    const describeIconMode = () => {
      iconModeNote.textContent = window.CUSTM_FAVICON.disclosesToThirdParty(
        iconModeSelect.value
      )
        ? 'Sends each bookmark’s hostname to DuckDuckGo. Nothing else is sent.'
        : 'Resolved on this device. No network request is made.';
    };
    describeIconMode();
    iconModeSelect.addEventListener('change', describeIconMode);
  }

  // Onboarding banner
  const params = new URLSearchParams(location.search);
  if (params.get('onboarding') === 'true' && !settings.onboardingDone) {
    onboardingBanner.hidden = false;
  }
  btnDismissOnboard.addEventListener('click', () => {
    onboardingBanner.hidden = true;
    api.storage.local.set({ onboardingDone: true });
  });

  /* ── Save ─────────────────────────────────────── */
  btnSave.addEventListener('click', async () => {
    const patch = {
      searchEngine: engineSelect.value,
      theme: currentTheme,
      iconMode: iconModeSelect ? iconModeSelect.value : 'local',
      syncEnabled: syncToggle.checked,
    };
    if (currentMode === 'redirect') {
      const state = await validateUrl(urlInput.value);
      if (state === 'invalid') return;
      Object.assign(patch, {
        mode: 'redirect',
        targetUrl: urls.normalizeTargetUrl(urlInput.value).url || '',
        maskUrl: maskUrlToggle.checked,
      });
      updateStatusBadge(!!urlInput.value.trim());
    } else {
      Object.assign(patch, { mode: 'dashboard' });
      updateStatusBadge(true);
    }
    await store.set(patch);
    if (syncToggle.checked) {
      // best-effort: pull any settings already on other devices
      try {
        await store.pullSyncIfEnabled();
      } catch {}
    }
    showSaveFeedback();
  });

  syncToggle.addEventListener('change', () =>
    api.storage.local.set({ syncEnabled: syncToggle.checked })
  );

  maskUrlToggle.addEventListener('change', () =>
    api.storage.local.set({ maskUrl: maskUrlToggle.checked })
  );

  btnHowto.addEventListener('click', () => {
    api.tabs.create({ url: api.runtime.getURL('howto.html') });
  });
})();
