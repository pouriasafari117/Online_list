/* 404 page — resolves links to the correct GitHub Pages root. */
(function () {
  try {
    var parts = location.pathname.split('/').filter(Boolean);
    var isProjectPage = location.hostname.endsWith('.github.io') && parts.length > 0;
    var root = isProjectPage ? '/' + parts[0] + '/' : '/';
    document.getElementById('homeLink').href = root;
    document.getElementById('backLink').addEventListener('click', function (event) {
      event.preventDefault();
      if (history.length > 1) history.back();
    });
  } catch (e) { /* ignore */ }
})();
