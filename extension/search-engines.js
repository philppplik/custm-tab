/**
 * cust*m Tab — Search Engine Registry (shared)
 *
 * Single source of truth for the search engine picker used by the
 * new-tab dashboard, the extended options page, and the onboarding wizard.
 *
 * `top`  : shown directly in the dashboard UI dropdown (curated, privacy-first).
 * `extra`: available in the extended settings picker (20+ additional engines).
 *
 * Each engine: { id, name, url, icon, privacy }
 *   url  : must contain the {query} placeholder (replaced with encodeURIComponent).
 *   icon : emoji used as a lightweight favicon (no network needed).
 *   privacy : 'high' | 'medium' | 'low' — drives the privacy badge.
 *
 * No build step, no modules — attaches to `window.CUSTM_ENGINES`.
 */
(function () {
  'use strict';

  const ENGINES = [
    // ── Top 5 — curated, privacy-first defaults ──────────────
    {
      id: 'duckduckgo',
      name: 'DuckDuckGo',
      url: 'https://duckduckgo.com/?q={query}',
      icon: '🦆',
      privacy: 'high',
    },
    {
      id: 'brave',
      name: 'Brave Search',
      url: 'https://search.brave.com/search?q={query}',
      icon: '🦁',
      privacy: 'high',
    },
    {
      id: 'startpage',
      name: 'Startpage',
      url: 'https://www.startpage.com/sp/search?query={query}',
      icon: '🛡️',
      privacy: 'high',
    },
    {
      id: 'ecosia',
      name: 'Ecosia',
      url: 'https://www.ecosia.org/search?q={query}',
      icon: '🌳',
      privacy: 'medium',
    },
    {
      id: 'google',
      name: 'Google',
      url: 'https://www.google.com/search?q={query}',
      icon: '🔍',
      privacy: 'low',
    },

    // ── Extended (20+) — full picker in options / wizard ─────
    {
      id: 'bing',
      name: 'Bing',
      url: 'https://www.bing.com/search?q={query}',
      icon: '🅱️',
      privacy: 'low',
    },
    {
      id: 'yahoo',
      name: 'Yahoo',
      url: 'https://search.yahoo.com/search?p={query}',
      icon: '🟣',
      privacy: 'low',
    },
    {
      id: 'yandex',
      name: 'Yandex',
      url: 'https://yandex.com/search/?text={query}',
      icon: '🔴',
      privacy: 'low',
    },
    {
      id: 'baidu',
      name: 'Baidu',
      url: 'https://www.baidu.com/s?wd={query}',
      icon: '🐾',
      privacy: 'low',
    },
    {
      id: 'qwant',
      name: 'Qwant',
      url: 'https://www.qwant.com/?q={query}',
      icon: '🟦',
      privacy: 'high',
    },
    {
      id: 'mojeek',
      name: 'Mojeek',
      url: 'https://www.mojeek.com/search?q={query}',
      icon: '🍃',
      privacy: 'high',
    },
    {
      id: 'searx',
      name: 'Searx (beispiel)',
      url: 'https://searx.be/search?q={query}',
      icon: '🧭',
      privacy: 'high',
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      url: 'https://www.perplexity.ai/search?q={query}',
      icon: '💡',
      privacy: 'medium',
    },
    {
      id: 'kagi',
      name: 'Kagi',
      url: 'https://kagi.com/search?q={query}',
      icon: '🟠',
      privacy: 'high',
    },
    {
      id: 'you',
      name: 'You.com',
      url: 'https://you.com/search?q={query}',
      icon: '👋',
      privacy: 'medium',
    },
    {
      id: 'presearch',
      name: 'Presearch',
      url: 'https://www.presearch.com/search?q={query}',
      icon: '🔎',
      privacy: 'high',
    },
    {
      id: 'marginalia',
      name: 'Marginalia',
      url: 'https://search.marginalia.nu/search?query={query}',
      icon: '📜',
      privacy: 'high',
    },
    {
      id: 'mohengen',
      name: 'Mojeek DE',
      url: 'https://www.mojeek.com/search?q={query}&language=de',
      icon: '🍃',
      privacy: 'high',
    },
    {
      id: 'metager',
      name: 'MetaGer',
      url: 'https://www.metager.de/meta/meta.ger3?eingabe={query}',
      icon: '🇩🇪',
      privacy: 'high',
    },
    {
      id: 'swisscows',
      name: 'Swisscows',
      url: 'https://swisscows.com/web?query={query}',
      icon: '🐄',
      privacy: 'high',
    },
    {
      id: 'yahoojp',
      name: 'Yahoo! JAPAN',
      url: 'https://search.yahoo.co.jp/search?p={query}',
      icon: '🗾',
      privacy: 'low',
    },
    {
      id: 'naver',
      name: 'Naver',
      url: 'https://search.naver.com/search.naver?query={query}',
      icon: '🇰🇷',
      privacy: 'low',
    },
    {
      id: 'daum',
      name: 'Daum',
      url: 'https://search.daum.net/search?q={query}',
      icon: '🇰🇷',
      privacy: 'low',
    },
    {
      id: 'ask',
      name: 'Ask',
      url: 'https://www.ask.com/web?q={query}',
      icon: '❓',
      privacy: 'low',
    },
    {
      id: 'aol',
      name: 'AOL Search',
      url: 'https://search.aol.com/aol/search?q={query}',
      icon: '🅰️',
      privacy: 'low',
    },
    {
      id: 'liefer',
      name: 'Lieferwerk',
      url: 'https://www.lieferwerk.de/search?q={query}',
      icon: '📦',
      privacy: 'high',
    },
    {
      id: 'ecosia_en',
      name: 'Ecosia (EN)',
      url: 'https://www.ecosia.org/search?q={query}&lang=en',
      icon: '🌳',
      privacy: 'medium',
    },
  ];

  /** IDs that appear directly in the dashboard dropdown. */
  const TOP_IDS = ['duckduckgo', 'brave', 'startpage', 'ecosia', 'google'];

  function getById(id) {
    return ENGINES.find((e) => e.id === id) || ENGINES[0];
  }

  function topEngines() {
    return TOP_IDS.map(getById);
  }

  /** Build a final search URL for a query. */
  function buildUrl(engineId, query) {
    const engine = getById(engineId);
    return engine.url.replace('{query}', encodeURIComponent(query));
  }

  window.CUSTM_ENGINES = {
    all: ENGINES,
    top: topEngines,
    getById,
    buildUrl,
  };
})();
