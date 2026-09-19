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

  /* ── Background ───────────────────────────────── */
  const backgrounds = window.CUSTM_BACKGROUND;
  const pexels = window.CUSTM_PEXELS;
  const dom = window.CUSTM_DOM;

  let bg = backgrounds.defaults;

  const PEXELS_MESSAGES = {
    pexelsNoKey: 'That does not look like a Pexels key.',
    pexelsBadKey: 'Pexels rejected this key.',
    pexelsRateLimited: 'Rate limit reached. Try again later.',
    pexelsNetwork: 'Could not reach Pexels. Check your connection.',
    pexelsNoResults: 'No photos matched that search.',
    pexelsFailed: 'Pexels returned an unexpected response.',
    pexelsDenied: 'Permission to reach api.pexels.com was declined.',
  };

  function showBgPanels() {
    $('bg-gradient-settings').hidden = bg.type !== 'gradient';
    $('bg-color-settings').hidden = bg.type !== 'color';
    $('bg-photo-settings').hidden = bg.type !== 'photo';
    document.querySelectorAll('[data-bg-type]').forEach((btn) => {
      const active = btn.dataset.bgType === bg.type;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }

  function renderGradients() {
    const row = $('gradient-palette');
    if (!row) return;
    dom.replace(
      row,
      Object.entries(backgrounds.gradients).map(([id, palette]) =>
        dom.el('button', {
          type: 'button',
          class: 'palette-chip' + (id === bg.gradient ? ' active' : ''),
          role: 'radio',
          'aria-checked': String(id === bg.gradient),
          title: palette.name,
          'aria-label': palette.name,
          style: {
            '--p0': palette.base,
            '--p1': palette.blobs[0],
            '--p2': palette.blobs[1],
            '--p3': palette.blobs[2],
          },
          on: {
            click: () => {
              bg = { ...bg, gradient: id };
              renderGradients();
            },
          },
        })
      )
    );
  }

  function describeContrast() {
    const note = $('bg-contrast-note');
    if (!note) return;
    const theme = backgrounds.themeForColor(bg.color);
    note.textContent =
      theme === 'light'
        ? 'Light background — the interface switches to dark text.'
        : 'Dark background — the interface uses light text.';
  }

  function renderSwatches() {
    const row = $('color-swatches');
    if (!row) return;
    dom.replace(
      row,
      backgrounds.swatches.map((hex) =>
        dom.el('button', {
          type: 'button',
          class: 'palette-chip palette-chip--solid' + (hex === bg.color ? ' active' : ''),
          role: 'radio',
          'aria-checked': String(hex === bg.color),
          title: hex,
          'aria-label': 'Background colour ' + hex,
          style: { '--p0': hex },
          on: {
            click: () => {
              bg = { ...bg, color: hex };
              $('bg-color-input').value = hex;
              $('bg-color-hex').value = hex;
              renderSwatches();
              describeContrast();
            },
          },
        })
      )
    );
  }

  function syncRangeLabels() {
    $('bg-overlay-value').textContent = Math.round(bg.overlay * 100) + '%';
    $('bg-blur-value').textContent = bg.blur + 'px';
  }

  function initBackgroundControls(settings) {
    bg = backgrounds.normalize(settings.background);

    document.querySelectorAll('[data-bg-type]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.bgType;
        // Host access is requested at the moment the feature is switched on,
        // from inside the click — browsers reject a prompt without a gesture.
        if (type === 'photo' && !(await pexels.hasPermission())) {
          const granted = await pexels.requestPermission();
          if (!granted) {
            setPexelsStatus(PEXELS_MESSAGES.pexelsDenied, false);
            return;
          }
        }
        if (type !== 'photo') await pexels.dropPermission();
        bg = { ...bg, type };
        showBgPanels();
      });
    });

    $('bg-color-input').value = bg.color;
    $('bg-color-hex').value = bg.color;
    $('bg-color-input').addEventListener('input', (e) => {
      bg = { ...bg, color: e.target.value };
      $('bg-color-hex').value = e.target.value;
      renderSwatches();
      describeContrast();
    });
    $('bg-color-hex').addEventListener('input', (e) => {
      if (!backgrounds.parseHex(e.target.value)) return;
      bg = { ...bg, color: e.target.value };
      $('bg-color-input').value = e.target.value;
      renderSwatches();
      describeContrast();
    });

    $('bg-overlay').value = String(Math.round(bg.overlay * 100));
    $('bg-blur').value = String(bg.blur);
    $('bg-overlay').addEventListener('input', (e) => {
      bg = { ...bg, overlay: Number(e.target.value) / 100 };
      syncRangeLabels();
    });
    $('bg-blur').addEventListener('input', (e) => {
      bg = { ...bg, blur: Number(e.target.value) };
      syncRangeLabels();
    });

    $('pexels-key').value = settings.pexelsApiKey;
    $('pexels-query').value = settings.pexels.query;
    $('pexels-orientation').value = settings.pexels.orientation;
    $('pexels-refresh').value = settings.pexels.refresh;
    $('toggle-sunrise').checked = settings.sunrise !== false;

    $('pexels-test').addEventListener('click', testPexelsKey);

    showBgPanels();
    renderGradients();
    renderSwatches();
    describeContrast();
    syncRangeLabels();
  }

  function setPexelsStatus(message, ok) {
    const el = $('pexels-status');
    el.textContent = message;
    el.classList.add('save-feedback--visible');
    el.classList.toggle('save-feedback--error', ok === false);
  }

  async function testPexelsKey() {
    const key = $('pexels-key').value.trim();
    if (!pexels.looksLikeKey(key)) {
      setPexelsStatus(PEXELS_MESSAGES.pexelsNoKey, false);
      return;
    }
    if (!(await pexels.hasPermission()) && !(await pexels.requestPermission())) {
      setPexelsStatus(PEXELS_MESSAGES.pexelsDenied, false);
      return;
    }

    setPexelsStatus('Checking…', true);
    const result = await pexels.verifyKey(key);
    if (!result.ok) {
      setPexelsStatus(
        PEXELS_MESSAGES[result.reason] || PEXELS_MESSAGES.pexelsFailed,
        false
      );
      return;
    }
    setPexelsStatus(
      result.remaining === null
        ? 'Key works ✓'
        : 'Key works ✓ — ' + result.remaining + ' requests left this month',
      true
    );
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

  initBackgroundControls(settings);

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
      background: bg,
      sunrise: $('toggle-sunrise').checked,
      pexels: {
        query: $('pexels-query').value.trim(),
        orientation: $('pexels-orientation').value,
        refresh: $('pexels-refresh').value,
      },
      pexelsApiKey: $('pexels-key').value.trim(),
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
