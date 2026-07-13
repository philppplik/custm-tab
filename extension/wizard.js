/**
 * cust*m Tab — Onboarding wizard logic
 *
 * 4 steps: mode → bookmarks → engine → appearance.
 * Saves to chrome.storage.local and opens a new tab when done.
 */
(async () => {
  'use strict';

  const $ = (id) => document.getElementById(id);
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
    [...prog.children].forEach((c, i) =>
      c.classList.toggle('active', i <= step)
    );
  }

  /* ── Step visibility ──────────────────────────── */
  function showStep(n) {
    step = n;
    document.querySelectorAll('.wiz-step').forEach((el) => {
      el.hidden = Number(el.dataset.step) !== n;
    });
    $('wiz-back').hidden = n === 0;
    $('wiz-next').textContent = n === STEP_COUNT - 1 ? 'Fertig 🎉' : 'Weiter';
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
    const box = $('wiz-bookmarks');
    box.innerHTML = '';
    state.bookmarks.forEach((bm, i) => {
      const row = document.createElement('div');
      row.className = 'wiz-bm-row';
      row.innerHTML = `
        <input class="ct-input bm-name" placeholder="Name" value="${bm.name}">
        <input class="ct-input bm-url" placeholder="URL" value="${bm.url}">
        <button class="wiz-bm-del" title="Entfernen">✕</button>`;
      row.querySelector('.bm-name').addEventListener('input', (e) => {
        state.bookmarks[i].name = e.target.value;
      });
      row.querySelector('.bm-url').addEventListener('input', (e) => {
        state.bookmarks[i].url = e.target.value;
      });
      row.querySelector('.wiz-bm-del').addEventListener('click', () => {
        state.bookmarks.splice(i, 1);
        renderBookmarks();
      });
      box.appendChild(row);
    });
  }
  $('wiz-add-bm').addEventListener('click', () => {
    state.bookmarks.push({ name: '', url: '' });
    renderBookmarks();
  });

  /* ── Engines ──────────────────────────────────── */
  function renderEngines() {
    const box = $('wiz-engines');
    box.innerHTML = '';
    window.CUSTM_ENGINES.all.forEach((e) => {
      const btn = document.createElement('button');
      btn.className = 'wiz-engine' + (e.id === state.searchEngine ? ' active' : '');
      const label =
        e.privacy === 'high' ? 'privat' : e.privacy === 'medium' ? 'mittel' : 'tracking';
      btn.innerHTML = `
        <span>${e.icon}</span>
        <span>${e.name}</span>
        <span class="e-priv ${e.privacy}">${label}</span>`;
      btn.addEventListener('click', () => {
        state.searchEngine = e.id;
        renderEngines();
      });
      box.appendChild(btn);
    });
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
      // finish
      if (state.mode === 'redirect') {
        let url = $('wiz-url').value.trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (state.mode === 'redirect' && !url) {
          $('wiz-url').focus();
          return;
        }
        await window.CUSTM_STORE.set({
          mode: 'redirect',
          targetUrl: url,
          maskUrl: true,
          bookmarks: state.bookmarks,
          searchEngine: state.searchEngine,
          theme: state.theme,
          onboardingDone: true,
        });
      } else {
        await window.CUSTM_STORE.set({
          mode: 'dashboard',
          bookmarks: state.bookmarks,
          searchEngine: state.searchEngine,
          theme: state.theme,
          onboardingDone: true,
        });
      }
      // open the finished tab
      try {
        await chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
      } catch {}
      window.close();
      return;
    }
    showStep(step + 1);
  });

  $('wiz-back').addEventListener('click', () => showStep(step - 1));

  /* ── Init ─────────────────────────────────────── */
  const existing = await window.CUSTM_STORE.getAll();
  if (existing.bookmarks && existing.bookmarks.length)
    state.bookmarks = existing.bookmarks;
  if (existing.searchEngine) state.searchEngine = existing.searchEngine;
  if (existing.theme) state.theme = existing.theme;
  document.querySelectorAll('[data-wiz-theme]').forEach((b) => {
    b.classList.toggle('active', b.dataset.wizTheme === state.theme);
  });

  renderBookmarks();
  renderEngines();
  showStep(0);
})();
