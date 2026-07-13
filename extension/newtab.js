/**
 * cust*m Tab — New Tab Dashboard logic
 *
 * - Redirect mode: loads targetUrl in full-screen iframe (keeps extension
 *   URL in address bar when maskUrl on; otherwise navigates directly).
 * - Dashboard mode: clock, greeting, search (engine picker), bookmarks.
 *   Bookmarks support live edit (modal), delete, and drag-and-drop reorder.
 * Settings come from chrome.storage.local via CUSTM_STORE.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /* ── Clock + greeting ─────────────────────────── */
  function updateClock() {
    const now = new Date();
    const clockEl = $('clock');
    const dateEl = $('date-line');
    if (clockEl)
      clockEl.textContent = now.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });
    if (dateEl)
      dateEl.textContent = now.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
  }
  function updateGreeting() {
    const h = new Date().getHours();
    let g = 'Hallo';
    if (h >= 5 && h < 12) g = 'Guten Morgen';
    else if (h >= 12 && h < 17) g = 'Guten Tag';
    else if (h >= 17 && h < 21) g = 'Guten Abend';
    else g = 'Gute Nacht';
    const el = $('greeting');
    if (el) el.textContent = g;
  }
  updateClock();
  updateGreeting();
  setInterval(updateClock, 10000);
  setInterval(updateGreeting, 60000);

  /* ── Search + engine picker ───────────────────── */
  let currentEngine = 'duckduckgo';

  function favicon(url) {
    try {
      return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
    } catch {
      return '';
    }
  }

  function renderEnginePicker() {
    const top = window.CUSTM_ENGINES.top();
    const menu = $('engine-menu');
    menu.innerHTML = '';
    top.forEach((e) => {
      const item = document.createElement('div');
      item.className = 'engine-item';
      item.innerHTML = `
        <span>${e.icon}</span>
        <span class="e-name">${e.name}</span>
        <span class="e-privacy ${e.privacy}">${
        e.privacy === 'high' ? 'privat' : e.privacy === 'medium' ? 'mittel' : 'tracking'
      }</span>`;
      item.addEventListener('click', () => {
        currentEngine = e.id;
        window.CUSTM_STORE.set({ searchEngine: e.id });
        applyEngineButton();
        menu.hidden = true;
      });
      menu.appendChild(item);
    });
  }

  function applyEngineButton() {
    const e = window.CUSTM_ENGINES.getById(currentEngine);
    $('engine-icon').textContent = e.icon;
  }

  function handleSearch(raw) {
    const q = (raw || '').trim();
    if (!q) return;
    const isUrl =
      /^(https?:\/\/)/i.test(q) ||
      /^(www\.)/i.test(q) ||
      /\S+\.\S{2,}/.test(q);
    if (isUrl) {
      window.location.href = /^https?:\/\//i.test(q) ? q : 'https://' + q;
    } else {
      window.location.href = window.CUSTM_ENGINES.buildUrl(currentEngine, q);
    }
  }

  /* ── Bookmarks ────────────────────────────────── */
  let bookmarks = [];
  let dragIndex = null;

  function renderBookmarks() {
    const grid = $('shortcuts-grid');
    grid.innerHTML = '';

    bookmarks.forEach((bm, index) => {
      const item = document.createElement('div');
      item.className = 'sc-item';
      item.draggable = true;
      item.dataset.index = index;
      item.innerHTML = `
        <div class="btn-del" data-del="${index}" title="Entfernen">✕</div>
        <button class="btn-edit" data-edit="${index}" title="Bearbeiten" aria-label="Bearbeiten">✎</button>
        <a class="full-link" href="${bm.url}" target="_blank" rel="noopener"></a>
        <div class="sc-icon"><img src="${favicon(bm.url)}" onerror="this.style.display='none'"></div>
        <span class="sc-label">${bm.name}</span>`;

      // Drag & drop reorder
      item.addEventListener('dragstart', (e) => {
        dragIndex = index;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(index));
        } catch {}
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document
          .querySelectorAll('.sc-item')
          .forEach((el) => el.classList.remove('drag-over'));
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const to = index;
        if (dragIndex === null || dragIndex === to) return;
        const moved = bookmarks.splice(dragIndex, 1)[0];
        bookmarks.splice(to, 0, moved);
        dragIndex = null;
        window.CUSTM_STORE.set({ bookmarks });
        renderBookmarks();
      });

      // Edit button (stop the full-link from navigating)
      item.querySelector('.btn-edit').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(index);
      });

      grid.appendChild(item);
    });

    // add button
    const add = document.createElement('div');
    add.className = 'sc-item sc-item-add';
    add.innerHTML = `
      <div class="sc-icon">+</div>
      <span class="sc-label">Hinzufügen</span>`;
    add.addEventListener('click', () => openModal(-1));
    grid.appendChild(add);
  }

  /* ── Modal ────────────────────────────────────── */
  let editIndex = -1;
  function openModal(index) {
    editIndex = index;
    const name = $('bookmark-name');
    const url = $('bookmark-url');
    if (index >= 0) {
      name.value = bookmarks[index].name;
      url.value = bookmarks[index].url;
      $('modal-title').textContent = 'Lesezeichen bearbeiten';
      $('modal-save').textContent = 'Aktualisieren';
    } else {
      name.value = '';
      url.value = '';
      $('modal-title').textContent = 'Lesezeichen hinzufügen';
      $('modal-save').textContent = 'Speichern';
    }
    $('modal-overlay').classList.add('active');
    name.focus();
  }
  function closeModal() {
    $('modal-overlay').classList.remove('active');
  }
  function saveModal() {
    const name = $('bookmark-name').value.trim();
    let url = $('bookmark-url').value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (editIndex >= 0) bookmarks[editIndex] = { name, url };
    else bookmarks.push({ name, url });
    window.CUSTM_STORE.set({ bookmarks });
    closeModal();
    renderBookmarks();
  }

  /* ── Init dashboard ───────────────────────────── */
  function initDashboard() {
    renderEnginePicker();
    const grid = $('shortcuts-grid');
    grid.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.preventDefault();
        e.stopPropagation();
        bookmarks.splice(Number(del.dataset.del), 1);
        window.CUSTM_STORE.set({ bookmarks });
        renderBookmarks();
      }
    });

    // Allow dropping anywhere on the grid empties reorder gracefully
    grid.addEventListener('dragover', (e) => e.preventDefault());

    $('engine-current').addEventListener('click', (e) => {
      e.stopPropagation();
      $('engine-menu').hidden = !$('engine-menu').hidden;
    });
    document.addEventListener('click', () => {
      $('engine-menu').hidden = true;
    });

    $('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      handleSearch($('search-input').value);
    });
    $('search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch($('search-input').value);
      }
    });

    $('modal-cancel').addEventListener('click', closeModal);
    $('modal-save').addEventListener('click', saveModal);
    $('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
    $('bookmark-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveModal();
    });

    $('settings-link').addEventListener('click', (e) => {
      e.preventDefault();
      try {
        chrome.runtime.openOptionsPage();
      } catch {}
    });
    $('logo').addEventListener('click', () => {
      try {
        chrome.runtime.openOptionsPage();
      } catch {}
    });

    // Keyboard: type anywhere focuses search
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        $('search-input').focus();
      } else if (e.key === 'Escape') {
        $('search-input').blur();
        closeModal();
      } else if (e.key.length === 1) {
        $('search-input').focus();
      }
    });
  }

  /* ── Redirect mode ────────────────────────────── */
  function initRedirect(targetUrl, maskUrl) {
    $('dashboard').hidden = true;
    const wrap = $('redirect-frame-wrap');
    const frame = $('redirect-frame');
    wrap.hidden = false;
    if (maskUrl) {
      frame.src = targetUrl;
    } else {
      window.location.href = targetUrl;
    }
  }

  /* ── Boot ─────────────────────────────────────── */
  (async () => {
    try {
      chrome.storage.local.set({ lastSeen: Date.now() });
    } catch {}

    try {
      await window.CUSTM_STORE.pullSyncIfEnabled();
    } catch {}

    const s = await window.CUSTM_STORE.getAll();
    currentEngine = s.searchEngine || 'duckduckgo';
    applyEngineButton();
    bookmarks = s.bookmarks || [];

    if (s.mode === 'redirect' && s.targetUrl) {
      initRedirect(s.targetUrl, s.maskUrl);
    } else {
      initDashboard();
      renderBookmarks();
    }
  })();
})();
