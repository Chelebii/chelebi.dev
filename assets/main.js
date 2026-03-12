(function () {
  var root = document.documentElement;
  var storageKey = 'theme-preference';
  var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getSystemTheme() {
    return mediaQuery.matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(theme === 'dark'));
      toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      toggle.setAttribute('title', theme === 'dark' ? 'Light mode' : 'Dark mode');
    }
  }

  function getSavedTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (error) {
      return;
    }
  }

  function refreshProfileAvatar() {
    var avatar = document.querySelector('.profile-avatar[data-avatar-base]');
    if (!avatar) {
      return;
    }

    var version = String(Date.now());
    avatar.dataset.avatarVersion = version;
    delete avatar.dataset.fallback;
    avatar.src = avatar.dataset.avatarBase + '?v=' + version;
  }

  var initialTheme = getSavedTheme() || getSystemTheme();
  applyTheme(initialTheme);

  document.addEventListener('DOMContentLoaded', function () {
    refreshProfileAvatar();

    var toggle = document.getElementById('theme-toggle');
    if (!toggle) {
      return;
    }

    applyTheme(getSavedTheme() || root.getAttribute('data-theme') || getSystemTheme());

    toggle.addEventListener('click', function () {
      var currentTheme = root.getAttribute('data-theme') || getSystemTheme();
      var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      saveTheme(nextTheme);
    });

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', function (event) {
        if (!getSavedTheme()) {
          applyTheme(event.matches ? 'dark' : 'light');
        }
      });
    }
  });

  window.addEventListener('pageshow', function () {
    refreshProfileAvatar();
  });
})();
