(function () {
  const storageKey = 'rutinas-theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(storageKey);
  let theme = saved === 'light' || saved === 'dark'
    ? saved
    : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const scene = '<span class="theme-scene" aria-hidden="true"><span class="theme-sun">☀</span><span class="theme-moon">☾</span><span class="theme-cloud"></span></span>';

  const accessPlaceholder = document.querySelector('.access-theme-icon');
  if (accessPlaceholder) {
    const button = document.createElement('button');
    button.id = 'accessThemeToggle';
    button.className = 'access-theme-icon';
    button.type = 'button';
    button.title = 'Cambiar tema';
    button.innerHTML = scene;
    accessPlaceholder.replaceWith(button);
  }

  const topActions = document.querySelector('.top-actions');
  const logoutButton = document.querySelector('#logoutButton');
  if (topActions && logoutButton) {
    const button = document.createElement('button');
    button.id = 'appThemeToggle';
    button.className = 'icon-button theme-toggle';
    button.type = 'button';
    button.title = 'Cambiar tema';
    button.innerHTML = scene;
    topActions.insertBefore(button, logoutButton);
  }

  function applyTheme(value) {
    theme = value;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#07111f' : '#edf5ff');
    document.querySelectorAll('#accessThemeToggle, #appThemeToggle').forEach(button => {
      button.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    });
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(storageKey, next);
    applyTheme(next);
  }

  document.querySelector('#accessThemeToggle')?.addEventListener('click', toggleTheme);
  document.querySelector('#appThemeToggle')?.addEventListener('click', toggleTheme);
  applyTheme(theme);
})();
