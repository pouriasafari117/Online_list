/* Runs before the stylesheets paint: applies the visitor's theme without a flash. */
(function () {
  var theme = 'auto';
  try {
    var stored = localStorage.getItem('ol.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'auto') theme = stored;
  } catch (e) { /* private mode */ }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.add('js');
})();
