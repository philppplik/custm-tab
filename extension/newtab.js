/**
 * cust*m Tab — New-tab controller
 *
 * Two experiences, chosen at runtime from persisted settings:
 *   redirect  — load the user's own URL, optionally inside a full-screen frame
 *   dashboard — clock, greeting, search with engine picker, bookmark tiles
 *
 * Every value rendered here is user-controlled, so nothing reaches the DOM as
 * markup: elements come from `CUSTM_DOM`, URLs pass `CUSTM_URL` first.
 */
(function () {
  'use strict';

  const api = window.CUSTM_API;
  const dom = window.CUSTM_DOM;
  const urls = window.CUSTM_URL;
  const store = window.CUSTM_STORE;
  const engines = window.CUSTM_ENGINES;
  const favicons = window.CUSTM_FAVICON;
  const backgrounds = window.CUSTM_BACKGROUND;
  const pexels = window.CUSTM_PEXELS;

  const $ = (id) => document.getElementById(id);

  const CLOCK_INTERVAL_MS = 10000;
  const GREETING_INTERVAL_MS = 60000;
  /** How long to wait before offering a direct link when framing looks blocked. */
  const FRAME_FALLBACK_MS = 2500;

  /** Locale for clock and date. Follows the browser, not a hard-coded region. */
  const LOCALE = navigator.language || 'en';

  let settings = null;
  let bookmarks = [];
  let currentEngine = 'duckduckgo';
  let dragIndex = null;
  let editIndex = -1;

  /* ── Theme ─────────────────────────────────────────────────────────────
   * The new-tab page persisted a `theme` setting and then never applied it,
   * so the dashboard was always dark regardless of the choice. `auto` has to
   * be resolved explicitly, because shared.css only defines an override for
   * data-theme="light" — leaving the attribute off is not "follow the system",
   * it is "always dark".
   */
  const prefersLight =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

  function resolveTheme(theme) {
    if (theme === 'light' || theme === 'dark') return theme;
    return prefersLight && prefersLight.matches ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', resolveTheme(theme));
  }

  if (prefersLight && typeof prefersLight.addEventListener === 'function') {
    prefersLight.addEventListener('change', () => {
      if (!settings || settings.theme === 'auto') applyTheme('auto');
    });
  }

  /* ── Clock and greeting ────────────────────────────────────────────── */
  function updateClock() {
    const now = new Date();
    const clock = $('clock');
    const date = $('date-line');
    if (clock) {
      clock.textContent = now.toLocaleTimeString(LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (date) {
      date.textContent = now.toLocaleDateString(LOCALE, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
  }

  const GREETINGS = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good night',
  };

  function greetingKey(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  function updateGreeting() {
    const el = $('greeting');
    if (el) el.textContent = GREETINGS[greetingKey(new Date().getHours())];
  }

  /* ── Search ────────────────────────────────────────────────────────── */
  function renderEnginePicker() {
    const menu = $('engine-menu');
    if (!menu) return;

    const items = engines.top().map((engine) =>
      dom.el(
        'button',
        {
          type: 'button',
          class: 'engine-item',
          role: 'option',
          'aria-selected': String(engine.id === currentEngine),
          on: {
            click: async () => {
              currentEngine = engine.id;
              await store.set({ searchEngine: engine.id });
              applyEngineButton();
              closeEngineMenu();
              const input = $('search-input');
              if (input) input.focus();
            },
          },
        },
        [
          dom.el('span', { class: 'engine-item__icon', text: engine.icon }),
          dom.el('span', { class: 'e-name', text: engine.name }),
          dom.el('span', { class: `e-privacy ${engine.privacy}`, text: engine.privacy }),
        ]
      )
    );

    dom.replace(menu, items);
  }

  function applyEngineButton() {
    const engine = engines.getById(currentEngine);
    const icon = $('engine-icon');
    const button = $('engine-current');
    if (icon) icon.textContent = engine.icon;
    if (button) button.setAttribute('aria-label', `Search engine: ${engine.name}`);
  }

  function closeEngineMenu() {
    const menu = $('engine-menu');
    if (menu) menu.hidden = true;
    const button = $('engine-current');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function handleSearch(raw) {
    const query = String(raw || '').trim();
    if (!query) return;

    // A destination only wins when it is unambiguously one; anything else is
    // a search, which is the recoverable outcome.
    if (urls.looksLikeUrl(query)) {
      const target = urls.normalizeBookmarkUrl(query);
      if (target.ok) {
        window.location.href = target.url;
        return;
      }
    }
    window.location.href = engines.buildUrl(currentEngine, query);
  }

  /* ── Bookmarks ─────────────────────────────────────────────────────── */

  /** Build the icon for a tile: a real favicon, or a locally drawn monogram. */
  function buildIcon(bookmark) {
    const icon = favicons.resolve(bookmark, settings.iconMode);

    const monogram = (data) =>
      dom.el('span', {
        class: 'sc-monogram',
        text: data.letter,
        style: { '--tile-hue': String(data.hue) },
      });

    if (icon.kind === 'monogram') return monogram(icon);

    const image = dom.el('img', {
      src: icon.src,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
      width: '32',
      height: '32',
    });
    // A cached favicon can be missing and a remote one can 404; swap in the
    // monogram rather than leaving a broken-image tile.
    image.addEventListener('error', () => image.replaceWith(monogram(icon.fallback)));
    return image;
  }

  function persistBookmarks() {
    return store.set({ bookmarks });
  }

  function buildTile(bookmark, index) {
    const tile = dom.el('div', {
      class: 'sc-item',
      draggable: 'true',
      dataset: { index: String(index) },
      on: {
        dragstart: (event) => {
          dragIndex = index;
          tile.classList.add('dragging');
          event.dataTransfer.effectAllowed = 'move';
          try {
            event.dataTransfer.setData('text/plain', String(index));
          } catch {
            /* Firefox requires setData; a failure here is not fatal. */
          }
        },
        dragend: () => {
          tile.classList.remove('dragging');
          document
            .querySelectorAll('.sc-item')
            .forEach((el) => el.classList.remove('drag-over'));
        },
        dragover: (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          tile.classList.add('drag-over');
        },
        dragleave: () => tile.classList.remove('drag-over'),
        drop: async (event) => {
          event.preventDefault();
          tile.classList.remove('drag-over');
          if (dragIndex === null || dragIndex === index) return;
          const [moved] = bookmarks.splice(dragIndex, 1);
          bookmarks.splice(index, 0, moved);
          dragIndex = null;
          await persistBookmarks();
          renderBookmarks();
        },
      },
    });

    // `href` goes through CUSTM_DOM, which drops it unless the protocol is on
    // the allowlist — so an unsafe stored URL renders as an inert tile.
    const link = dom.el('a', {
      class: 'full-link',
      href: bookmark.url,
      rel: 'noopener noreferrer',
      'aria-label': bookmark.name,
    });

    const remove = dom.el('button', {
      type: 'button',
      class: 'btn-del',
      text: '✕',
      title: `Remove ${bookmark.name}`,
      'aria-label': `Remove ${bookmark.name}`,
      on: {
        click: async (event) => {
          event.preventDefault();
          event.stopPropagation();
          bookmarks.splice(index, 1);
          await persistBookmarks();
          renderBookmarks();
        },
      },
    });

    const edit = dom.el('button', {
      type: 'button',
      class: 'btn-edit',
      text: '✎',
      title: `Edit ${bookmark.name}`,
      'aria-label': `Edit ${bookmark.name}`,
      on: {
        click: (event) => {
          event.preventDefault();
          event.stopPropagation();
          openModal(index);
        },
      },
    });

    return dom.append(tile, [
      remove,
      edit,
      link,
      dom.el('div', { class: 'sc-icon' }, [buildIcon(bookmark)]),
      dom.el('span', { class: 'sc-label', text: bookmark.name }),
    ]);
  }

  function renderBookmarks() {
    const grid = $('shortcuts-grid');
    if (!grid) return;

    const tiles = bookmarks.map(buildTile);

    if (bookmarks.length < store.maxBookmarks) {
      tiles.push(
        dom.el(
          'button',
          {
            type: 'button',
            class: 'sc-item sc-item-add',
            'aria-label': 'Add bookmark',
            on: { click: () => openModal(-1) },
          },
          [
            dom.el('span', { class: 'sc-icon', text: '+' }),
            dom.el('span', { class: 'sc-label', text: 'Add' }),
          ]
        )
      );
    }

    dom.replace(grid, tiles);
  }

  /* ── Add / edit modal ──────────────────────────────────────────────── */
  const URL_ERRORS = {
    urlEmpty: 'Enter a URL.',
    urlMalformed: 'That does not look like a valid URL.',
    urlUnsafeProtocol: 'Only http:// and https:// addresses are allowed.',
    urlNoHost: 'That URL is missing a hostname.',
  };

  function setModalError(message) {
    const el = $('modal-error');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function openModal(index) {
    editIndex = index;
    const name = $('bookmark-name');
    const url = $('bookmark-url');
    const editing = index >= 0;

    name.value = editing ? bookmarks[index].name : '';
    url.value = editing ? bookmarks[index].url : '';
    $('modal-title').textContent = editing ? 'Edit bookmark' : 'Add bookmark';
    $('modal-save').textContent = editing ? 'Update' : 'Save';

    setModalError('');
    $('modal-overlay').classList.add('active');
    name.focus();
  }

  function closeModal() {
    $('modal-overlay').classList.remove('active');
    setModalError('');
  }

  async function saveModal() {
    const rawName = $('bookmark-name').value.trim();
    const check = urls.normalizeBookmarkUrl($('bookmark-url').value);

    if (!check.ok) {
      setModalError(URL_ERRORS[check.reason] || URL_ERRORS.urlMalformed);
      $('bookmark-url').focus();
      return;
    }

    const entry = { name: rawName || urls.displayHost(check.url), url: check.url };
    if (editIndex >= 0) bookmarks[editIndex] = entry;
    else bookmarks.push(entry);

    await persistBookmarks();
    closeModal();
    renderBookmarks();
  }

  /* ── Dashboard wiring ──────────────────────────────────────────────── */
  function initDashboard() {
    renderEnginePicker();
    applyEngineButton();
    renderBookmarks();

    const engineButton = $('engine-current');
    engineButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = $('engine-menu');
      menu.hidden = !menu.hidden;
      engineButton.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', closeEngineMenu);

    $('search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      handleSearch($('search-input').value);
    });

    $('modal-cancel').addEventListener('click', closeModal);
    $('modal-save').addEventListener('click', saveModal);
    $('modal-overlay').addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeModal();
    });
    $('bookmark-url').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') saveModal();
    });
    $('bookmark-name').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('bookmark-url').focus();
    });

    $('settings-link').addEventListener('click', (event) => {
      event.preventDefault();
      window.CUSTM_ENV.openOptions();
    });
    $('logo').addEventListener('click', () => window.CUSTM_ENV.openOptions());

    // Typing anywhere focuses search, so the tab behaves like an address bar.
    document.addEventListener('keydown', (event) => {
      const tag = event.target.tagName;
      const modalOpen = $('modal-overlay').classList.contains('active');

      if (event.key === 'Escape') {
        closeEngineMenu();
        if (modalOpen) closeModal();
        else $('search-input').blur();
        return;
      }
      if (modalOpen || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === '/') {
        event.preventDefault();
        $('search-input').focus();
      } else if (event.key.length === 1) {
        $('search-input').focus();
      }
    });
  }

  /* ── Background ────────────────────────────────────────────────────── */

  /**
   * Render the photographer credit Pexels asks for.
   *
   * Not optional politeness: crediting is a condition of the API terms, and
   * someone made the picture.
   */
  function renderPhotoCredit(photo) {
    if (!photo) return;
    document.body.appendChild(
      dom.el('div', { class: 'photo-credit' }, [
        'Photo by ',
        dom.el('a', {
          href: photo.photographerUrl,
          text: photo.photographer,
          target: '_blank',
          rel: 'noopener noreferrer',
        }),
        ' on ',
        dom.el('a', {
          href: photo.url || 'https://www.pexels.com',
          text: 'Pexels',
          target: '_blank',
          rel: 'noopener noreferrer',
        }),
      ])
    );
  }

  /**
   * Resolve and apply the background.
   *
   * Returns the theme the background implies: a flat colour the user picked
   * decides its own contrast, and a photo always wants light text.
   */
  async function applyBackground() {
    const config = settings.background;

    if (config.type !== 'photo') {
      return backgrounds.apply(document, config, null);
    }

    // No key means the photo mode cannot work; fall back to the gradient
    // rather than rendering an empty tab.
    if (!pexels.looksLikeKey(settings.pexelsApiKey)) {
      return backgrounds.apply(document, { ...config, type: 'gradient' }, null);
    }

    const result = await pexels.resolve({
      key: settings.pexelsApiKey,
      query: settings.pexels.query,
      orientation: settings.pexels.orientation,
      refresh: settings.pexels.refresh,
      cache: settings.pexelsCache,
    });

    if (!result.ok) {
      return backgrounds.apply(document, { ...config, type: 'gradient' }, null);
    }

    // Persist the rotated index (and any newly fetched page) so the next tab
    // continues the rotation instead of repeating this photo.
    store.set({ pexelsCache: result.cache }).catch(() => {});

    const theme = backgrounds.apply(document, config, result.photo);
    renderPhotoCredit(result.photo);
    return theme;
  }

  /* ── Redirect mode ─────────────────────────────────────────────────── */
  function initRedirect(targetUrl, maskUrl) {
    const target = urls.normalizeTargetUrl(targetUrl);
    if (!target.ok) {
      // A target that no longer validates must not strand the user on a blank
      // page — fall through to the dashboard instead.
      initDashboard();
      return;
    }

    $('dashboard').hidden = true;

    if (!maskUrl) {
      window.location.replace(target.url);
      return;
    }

    const wrap = $('redirect-frame-wrap');
    const frame = $('redirect-frame');
    wrap.hidden = false;
    frame.src = target.url;

    // Many sites refuse to be framed (X-Frame-Options / frame-ancestors). The
    // frame then sits blank with no error a parent page can read. Offer a way
    // out rather than leaving a dead tab.
    let loaded = false;
    frame.addEventListener('load', () => {
      loaded = true;
    });

    setTimeout(() => {
      if (loaded) return;
      wrap.appendChild(
        dom.el('div', { class: 'frame-fallback', role: 'status' }, [
          dom.el('p', {
            class: 'frame-fallback__text',
            text: 'This site refuses to be embedded.',
          }),
          dom.el('a', {
            class: 'ct-btn-primary',
            href: target.url,
            text: 'Open it directly',
          }),
        ])
      );
    }, FRAME_FALLBACK_MS);
  }

  /* ── Boot ──────────────────────────────────────────────────────────── */
  (async () => {
    updateClock();
    updateGreeting();
    setInterval(updateClock, CLOCK_INTERVAL_MS);
    setInterval(updateGreeting, GREETING_INTERVAL_MS);

    // Marks the tab as rendered, for the background persistence check.
    try {
      await api.storage.local.set({ lastSeen: Date.now() });
    } catch {
      /* Not worth failing the page over. */
    }

    try {
      await store.pullSyncIfEnabled();
    } catch {
      /* Local settings remain authoritative. */
    }

    settings = await store.getAll();
    currentEngine = settings.searchEngine;
    bookmarks = settings.bookmarks;

    // Redirect mode never shows the dashboard, so skip the background work
    // entirely rather than fetching a photo nobody will see.
    if (settings.mode === 'redirect' && settings.targetUrl) {
      applyTheme(settings.theme);
      initRedirect(settings.targetUrl, settings.maskUrl);
      document.body.classList.add('is-ready');
      return;
    }

    // Start the reveal before the background resolves: the animation is on the
    // blobs, which are already in the document, so it begins at first paint
    // instead of waiting on a network round trip.
    backgrounds.playSunrise(document, settings.sunrise);

    const backgroundTheme = await applyBackground();
    // An explicit theme choice wins; `auto` defers to what the background
    // needs, which is the only way a user-picked pale colour stays readable.
    applyTheme(settings.theme === 'auto' ? backgroundTheme : settings.theme);

    initDashboard();
    document.body.classList.add('is-ready');
  })();
})();
