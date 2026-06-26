/* theme.js — applies saved theme before first paint.
   Must be loaded in <head> (not deferred) so there's no flash of
   the wrong theme. Source of truth is localStorage for instant
   apply; Settings page also persists the choice server-side. */
(function () {
  try {
    const saved = localStorage.getItem('seik-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch {
    /* localStorage unavailable — fall back to default dark theme */
  }
})();
