/**
 * cust*m Tab — Onboarding wizard logic
 *
 * 4 steps: mode → bookmarks → engine → appearance.
 * Saves to chrome.storage.local and opens a new tab when done.
 */
(async () => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const dom = window.CUSTM_DOM;
  const urls = window.CUSTM_URL;
  const api = window.CUSTM_API;
  const STEP_COUNT = 4;
  let step = 0;

  // collected state
  const state = {
    mode: 'dashboard',
    targetUrl: '',
    bookmarks: [
      { name: 'Google', url: 'https://www.google.com' },
      { name: 'YouTube', url: 'https://youtube.com' },
      { name: 'Reddit', url: 'https://reddit.com' },
    ],
    searchEngine: 'duckduckgo',
    theme: 'auto',
  };

  /* ── Progress bar ─────────────────────────────── */
  const prog = $('wiz-progress');
  for (let i = 0; i < STEP_COUNT; i++) {
    const s = document.createElement('span');
    if (i === 0) s.classList.add('active');
    prog.appendChild(s);
  }
  function renderProgress() {
    [...prog.children].forEach((c, i) => c.classList.toggle('active', i <= step));
  }

  /* ── Step visibility ──────────────────────────── */
  function showStep(n) {
    step = n;
    document.querySelectorAll('.wiz-step').forEach((el) => {
      el.hidden = Number(el.dataset.step) !== n;
    });
    $('wiz-back').hidden = n === 0;
    $('wiz-next').textContent = n === STEP_COUNT - 1 ? 'Finish 🎉' : 'Next';
    renderProgress();
  }

  /* ── Mode ─────────────────────────────────────── */
  document.querySelectorAll('[data-wiz-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document
        .querySelectorAll('[data-wiz-mode]')
        .forEach((b) => b.classList.toggle('active', b === btn));
      $('wiz-redirect').hidden = state.mode !== 'redirect';
    });
  });

  /* ── Bookmarks ────────────────────────────────── */
  function renderBookmarks() {
    // Built as elements rather than an HTML string: interpolating a bookmark
    // name into value="..." lets a single quote character break out of the
    // attribute and inject markup.
    const rows = state.bookmarks.map((bm, i) =>
      dom.el('div', { class: 'wiz-bm-row' }, [
        dom.el('input', {
          class: 'ct-input bm-name',
          placeholder: 'Name',
          value: bm.name,
          'aria-label': 'Bookmark name',
          on: {
            input: (event) => {
              state.bookmarks[i].name = event.target.value;
            },
          },
        }),
        dom.el('input', {
          class: 'ct-input bm-url',
          placeholder: 'URL',
          value: bm.url,
          spellcheck: 'false',
          'aria-label': 'Bookmark URL',
          on: {
            input: (event) => {
              state.bookmarks[i].url = event.target.value;
            },
          },
        }),
        dom.el('button', {
          type: 'button',
          class: 'wiz-bm-del',
          text: '✕',
          title: 'Remove',
          'aria-label': 'Remove bookmark',
          on: {
            click: () => {
              state.bookmarks.splice(i, 1);
              renderBookmarks();
            },
          },
        }),
      ])
    );

    dom.replace($('wiz-bookmarks'), rows);
  }
  $('wiz-add-bm').addEventListener('click', () => {
    state.bookmarks.push({ name: '', url: '' });
    renderBookmarks();
  });

  /* ── Engines ──────────────────────────────────── */
  function renderEngines() {
    const buttons = window.CUSTM_ENGINES.all.map((engine) =>
      dom.el(
        'button',
        {
          type: 'button',
          class: 'wiz-engine' + (engine.id === state.searchEngine ? ' active' : ''),
          'aria-pressed': String(engine.id === state.searchEngine),
          on: {
            click: () => {
              state.searchEngine = engine.id;
              renderEngines();
            },
          },
        },
        [
          dom.el('span', { class: 'wiz-engine__icon' }, [
            window.CUSTM_ICONS.engineIcon(engine.id),
          ]),
          dom.el('span', { text: engine.name }),
          dom.el('span', { class: `e-priv ${engine.privacy}`, text: engine.privacy }),
        ]
      )
    );

    dom.replace($('wiz-engines'), buttons);
  }

  /* ── Theme ────────────────────────────────────── */
  document.querySelectorAll('[data-wiz-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.theme = btn.dataset.wizTheme;
      document
        .querySelectorAll('[data-wiz-theme]')
        .forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  /* ── Nav ──────────────────────────────────────── */
  $('wiz-next').addEventListener('click', async () => {
    if (step === STEP_COUNT - 1) {
      const settings = {
        mode: state.mode,
        // Normalised here so a wizard-created profile is already clean;
        // store.js re-checks on read, but an unusable value should be caught
        // while the user is still looking at the field.
        bookmarks: window.CUSTM_STORE.normalizeBookmarks(state.bookmarks),
        searchEngine: state.searchEngine,
        theme: state.theme,
        onboardingDone: true,
      };

      if (state.mode === 'redirect') {
        const target = urls.normalizeTargetUrl($('wiz-url').value);
        if (!target.ok) {
          $('wiz-url').focus();
          $('wiz-url').setAttribute('aria-invalid', 'true');
          return;
        }
        settings.targetUrl = target.url;
        settings.maskUrl = true;
      }

      await window.CUSTM_STORE.set(settings);

      try {
        await api.tabs.create({ url: api.runtime.getURL('newtab.html') });
      } catch {
        /* The wizard still closes; the user's next new tab picks it up. */
      }
      window.close();
      return;
    }
    showStep(step + 1);
  });

  $('wiz-back').addEventListener('click', () => showStep(step - 1));

  /* ── Init ─────────────────────────────────────── */
  const existing = await window.CUSTM_STORE.getAll();
  if (existing.bookmarks && existing.bookmarks.length) {
    state.bookmarks = existing.bookmarks;
  }
  if (existing.searchEngine) state.searchEngine = existing.searchEngine;
  if (existing.theme) state.theme = existing.theme;
  document.querySelectorAll('[data-wiz-theme]').forEach((b) => {
    b.classList.toggle('active', b.dataset.wizTheme === state.theme);
  });

  renderBookmarks();
  renderEngines();
  showStep(0);
})();
