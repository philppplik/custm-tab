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
  // Scoped by `[data-theme]`, not by class. `.theme-chip` is now the shared
  // chip style for four separate radio groups — theme, material, solid tone
  // and greeting — and selecting on the class alone made applyTheme() strip
  // the `active` state off the other three every time it ran.
  const themeChips = document.querySelectorAll('.theme-chip[data-theme]');
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

  /* ── Theme ──────────────────────────────────────
   * `auto` is resolved to a concrete value rather than left unset: shared.css
   * only defines an override for data-theme="light", so removing the
   * attribute means "always dark", not "follow everything else".
   * The precedence matches the new tab page exactly — surface, then
   * background — or this page would preview a different product from the one
   * it configures.
   */
  function resolveAutoTheme() {
    if (appearanceState.surface === 'solid') return appearanceState.solidTone;
    if (bg.type === 'color') return backgrounds.themeForColor(bg.color);
    if (hasPicture()) return 'dark';
    return backgrounds.themeForColor(gradientBase());
  }

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute(
      'data-theme',
      theme === 'auto' ? resolveAutoTheme() : theme
    );
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
  const appearanceEngine = window.CUSTM_APPEARANCE;
  const pexels = window.CUSTM_PEXELS;
  const dom = window.CUSTM_DOM;

  let bg = backgrounds.defaults;
  let appearanceState = appearanceEngine.normalize(null);

  /** The user's own picture, held in memory until Save writes it. */
  let backgroundImage = '';

  /** Base colour of the selected palette, used for contrast decisions. */
  function gradientBase() {
    const palette = backgrounds.gradients[bg.gradient];
    return palette ? palette.base : backgrounds.defaults.color;
  }

  /**
   * Is a picture actually going to be drawn?
   *
   * A photo background is previewed as its gradient rather than spending an
   * API request on a settings visit, and an image background with nothing
   * chosen falls back the same way — so neither counts as a picture here.
   */
  function hasPicture() {
    return bg.type === 'image' && !!backgroundImage;
  }

  const PEXELS_MESSAGES = {
    pexelsNoKey: 'That does not look like a Pexels key.',
    pexelsBadKey: 'Pexels rejected this key.',
    pexelsRateLimited: 'Rate limit reached. Try again later.',
    pexelsNetwork: 'Could not reach Pexels. Check your connection.',
    pexelsNoResults: 'No photos matched that search.',
    pexelsFailed: 'Pexels returned an unexpected response.',
    pexelsDenied: 'Permission to reach api.pexels.com was declined.',
  };

  /**
   * Paint the chosen background on the settings page itself.
   *
   * Without this the page showed one background while the picker claimed
   * another, which reads as a bug. Photo mode is previewed as its gradient
   * fallback rather than spending an API request on a settings visit.
   */
  function previewBackground() {
    // A Pexels photo is previewed as its gradient fallback rather than
    // spending one of the user's API requests on a settings visit. Their own
    // picture is already here, so it is shown exactly as it will appear.
    if (hasPicture()) {
      backgrounds.apply(document, bg, { src: backgroundImage });
    } else {
      backgrounds.apply(
        document,
        bg.type === 'photo' || bg.type === 'image' ? { ...bg, type: 'gradient' } : bg,
        null
      );
    }
    // The background decides the theme when the user left it on auto, so the
    // preview has to be re-resolved every time the background moves.
    applyTheme(currentTheme);
  }

  function showBgPanels() {
    $('bg-gradient-settings').hidden = bg.type !== 'gradient';
    $('bg-color-settings').hidden = bg.type !== 'color';
    $('bg-photo-settings').hidden = bg.type !== 'photo';
    $('bg-image-settings').hidden = bg.type !== 'image';
    $('bg-picture-settings').hidden = bg.type !== 'photo' && bg.type !== 'image';
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
              previewBackground();
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
              previewBackground();
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
    backgroundImage = settings.backgroundImage || '';

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
        previewBackground();
      });
    });

    $('bg-color-input').value = bg.color;
    $('bg-color-hex').value = bg.color;
    $('bg-color-input').addEventListener('input', (e) => {
      bg = { ...bg, color: e.target.value };
      $('bg-color-hex').value = e.target.value;
      renderSwatches();
      describeContrast();
      previewBackground();
    });
    $('bg-color-hex').addEventListener('input', (e) => {
      if (!backgrounds.parseHex(e.target.value)) return;
      bg = { ...bg, color: e.target.value };
      $('bg-color-input').value = e.target.value;
      renderSwatches();
      describeContrast();
      previewBackground();
    });

    $('bg-overlay').value = String(Math.round(bg.overlay * 100));
    $('bg-blur').value = String(bg.blur);
    $('bg-overlay').addEventListener('input', (e) => {
      bg = { ...bg, overlay: Number(e.target.value) / 100 };
      syncRangeLabels();
      previewBackground();
    });
    $('bg-blur').addEventListener('input', (e) => {
      bg = { ...bg, blur: Number(e.target.value) };
      syncRangeLabels();
      previewBackground();
    });

    $('pexels-key').value = settings.pexelsApiKey;
    $('pexels-query').value = settings.pexels.query;
    $('pexels-orientation').value = settings.pexels.orientation;
    $('pexels-refresh').value = settings.pexels.refresh;
    $('toggle-sunrise').checked = settings.sunrise !== false;

    $('pexels-test').addEventListener('click', testPexelsKey);

    initImageControls();
    renderImageState();
    if (backgroundImage) {
      setImageStatus('A picture is saved on this device.', null);
    }

    showBgPanels();
    renderGradients();
    renderSwatches();
    describeContrast();
    syncRangeLabels();
    previewBackground();
  }

  /* ── The user's own background picture ──────────
   *
   * The file never leaves the device and is never uploaded anywhere. It is
   * re-encoded through a canvas rather than stored as-is, which does three
   * useful things at once:
   *
   *   - drops EXIF, including the GPS coordinates a phone writes into every
   *     photo. Storing that inside a browser extension would be careless.
   *   - guarantees the bytes really are the raster format they claim to be,
   *     because anything else fails to decode before it can be stored.
   *   - brings a 12-megapixel photo inside the extension storage quota,
   *     which no original camera file would fit in.
   */

  /** Widths to try, largest first. A 4K display is served well by 2560. */
  const IMAGE_WIDTHS = [2560, 1920, 1440, 1024];

  /** Data-URL budget. storage.local allows roughly 10MB in total. */
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

  const IMAGE_ERRORS = {
    imageType: 'That file is not a PNG, JPEG or WebP image.',
    imageDecode: 'That image could not be read. It may be damaged.',
    imageTooLarge: 'That image is too large to store, even after scaling down.',
  };

  /**
   * Turn a chosen file into a storable data URL.
   *
   * @returns {Promise<{ok: true, dataUrl: string, width: number}
   *   | {ok: false, reason: string}>}
   */
  async function importImageFile(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      return { ok: false, reason: 'imageType' };
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return { ok: false, reason: 'imageDecode' };
    }

    try {
      for (const maxWidth of IMAGE_WIDTHS) {
        const scale = Math.min(1, maxWidth / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));

        const context = canvas.getContext('2d');
        if (!context) return { ok: false, reason: 'imageDecode' };
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        // JPEG regardless of the source format: a photographic background
        // compresses an order of magnitude better than PNG, and the alpha
        // channel PNG would preserve is meaningless behind an opaque page.
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (dataUrl.length <= MAX_IMAGE_BYTES) {
          return { ok: true, dataUrl, width: canvas.width };
        }
      }
      return { ok: false, reason: 'imageTooLarge' };
    } finally {
      bitmap.close();
    }
  }

  function setImageStatus(message, ok) {
    const el = $('bg-image-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('field__hint--error', ok === false);
    el.classList.toggle('field__hint--success', ok === true);
  }

  function renderImageState() {
    const clear = $('bg-image-clear');
    if (clear) clear.hidden = !backgroundImage;
  }

  function initImageControls() {
    const input = $('bg-image-file');
    const clear = $('bg-image-clear');
    if (!input || !clear) return;

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      setImageStatus('Preparing…', null);
      const result = await importImageFile(file);
      // Reset the control either way, so choosing the same file twice after a
      // failure still fires a change event.
      input.value = '';

      if (!result.ok) {
        setImageStatus(IMAGE_ERRORS[result.reason] || IMAGE_ERRORS.imageDecode, false);
        return;
      }

      backgroundImage = result.dataUrl;
      setImageStatus(
        `Ready — stored at ${result.width}px wide, on this device only.`,
        true
      );
      renderImageState();
      previewBackground();
    });

    clear.addEventListener('click', () => {
      backgroundImage = '';
      setImageStatus('Removed. The gradient is used until you choose another.', null);
      renderImageState();
      previewBackground();
    });
  }

  /* ── Interface: material, clock, greeting ───────
   * Every control here applies to this page the moment it is touched. A
   * settings screen that describes an appearance without wearing it makes
   * the user guess, and guessing is the thing this product is against.
   */

  function updateAppearance(patch) {
    appearanceState = appearanceEngine.normalize({ ...appearanceState, ...patch });
    appearanceEngine.apply(document, appearanceState);
    renderAppearanceControls();
    // A solid surface dictates its own theme, so the resolution has to re-run.
    applyTheme(currentTheme);
  }

  const SURFACE_NOTES = {
    glass: 'Translucent, lightly blurred. The default.',
    frosted: 'A heavier blur with more colour pulled through from behind.',
    solid: 'Opaque, with no blur at all — the fastest option on older hardware.',
  };

  function selectChips(container, attribute, value) {
    if (!container) return;
    container.querySelectorAll(`[data-${attribute}]`).forEach((chip) => {
      const active = chip.dataset[attribute] === value;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-checked', String(active));
    });
  }

  function renderAppearanceControls() {
    const config = appearanceState;

    selectChips($('surface-row'), 'surface', config.surface);
    selectChips($('solid-tone-row'), 'tone', config.solidTone);
    selectChips($('greeting-row'), 'greeting', config.greeting.mode);

    $('surface-note').textContent = SURFACE_NOTES[config.surface];
    $('solid-tone-field').hidden = config.surface !== 'solid';

    $('toggle-clock').checked = config.clock.show;
    $('clock-settings').hidden = !config.clock.show;
    $('toggle-seconds').checked = config.clock.seconds;
    $('clock-format').value = config.clock.format;
    $('clock-font').value = config.clock.font;
    $('clock-size').value = String(Math.round(config.clock.size * 100));
    $('clock-size-value').textContent = Math.round(config.clock.size * 100) + '%';
    $('clock-weight').value = String(config.clock.weight);
    $('clock-weight-value').textContent = String(config.clock.weight);
    $('toggle-date').checked = config.date.show;

    $('greeting-name-field').hidden = config.greeting.mode !== 'time';
    $('greeting-text-field').hidden = config.greeting.mode !== 'text';

    // Shows the line exactly as the tab will render it, including the comma
    // that only appears once a name is present.
    const preview = appearanceEngine.greetingFor(config, new Date());
    $('greeting-preview').textContent = preview ? `Your tab will say: “${preview}”` : '';
  }

  function initAppearanceControls(settings) {
    appearanceState = appearanceEngine.normalize(settings.appearance);

    dom.replace(
      $('clock-font'),
      Object.entries(appearanceEngine.fonts).map(([id, font]) =>
        dom.el('option', { value: id, text: font.name })
      )
    );

    $('surface-row').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-surface]');
      if (chip) updateAppearance({ surface: chip.dataset.surface });
    });
    $('solid-tone-row').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-tone]');
      if (chip) updateAppearance({ solidTone: chip.dataset.tone });
    });
    $('greeting-row').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-greeting]');
      if (chip) {
        updateAppearance({
          greeting: { ...appearanceState.greeting, mode: chip.dataset.greeting },
        });
      }
    });

    const clockPatch = (patch) =>
      updateAppearance({ clock: { ...appearanceState.clock, ...patch } });

    $('toggle-clock').addEventListener('change', (e) =>
      clockPatch({ show: e.target.checked })
    );
    $('toggle-seconds').addEventListener('change', (e) =>
      clockPatch({ seconds: e.target.checked })
    );
    $('clock-format').addEventListener('change', (e) =>
      clockPatch({ format: e.target.value })
    );
    $('clock-font').addEventListener('change', (e) =>
      clockPatch({ font: e.target.value })
    );
    $('clock-size').addEventListener('input', (e) =>
      clockPatch({ size: Number(e.target.value) / 100 })
    );
    $('clock-weight').addEventListener('input', (e) =>
      clockPatch({ weight: Number(e.target.value) })
    );
    $('toggle-date').addEventListener('change', (e) =>
      updateAppearance({ date: { show: e.target.checked } })
    );

    $('greeting-name').value = appearanceState.greeting.name;
    $('greeting-text').value = appearanceState.greeting.text;
    $('greeting-name').addEventListener('input', (e) =>
      updateAppearance({
        greeting: { ...appearanceState.greeting, name: e.target.value },
      })
    );
    $('greeting-text').addEventListener('input', (e) =>
      updateAppearance({
        greeting: { ...appearanceState.greeting, text: e.target.value },
      })
    );

    appearanceEngine.apply(document, appearanceState);
    renderAppearanceControls();
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

  // Appearance and background come first: on `auto` the theme is derived from
  // both of them, so resolving it before either is loaded would pick a theme
  // from the defaults and then leave it wrong.
  initAppearanceControls(settings);
  initBackgroundControls(settings);
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
      const favicons = window.CUSTM_FAVICON;
      const mode = iconModeSelect.value;
      if (favicons.disclosesToThirdParty(mode)) {
        iconModeNote.textContent =
          'Sends each bookmark’s hostname to DuckDuckGo. Nothing else is sent.';
      } else if (favicons.disclosesToSites(mode)) {
        iconModeNote.textContent =
          'Asks each bookmarked site for its own icon. No third party is involved, ' +
          'but those sites learn when you open a tab.';
      } else {
        iconModeNote.textContent = 'Resolved on this device. No network request is made.';
      }
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
      appearance: appearanceState,
      background: bg,
      backgroundImage,
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
