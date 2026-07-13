/**
 * cust*m Tab — How-to / Documentation Page Script
 */
(async () => {
  'use strict';

  // Back to settings
  document.getElementById('btn-back').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Read theme
  const { theme } = await chrome.storage.local.get('theme');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
