/* Give the storefront one paint before downloading/parsing the React canvas.
 * The complete Fera renderer is unchanged; CSS supplies the palette while it loads.
 */
function startGradient() {
  import('./hero-gradient.js').catch((err) => console.warn('[gradient] unavailable', err));
}
function scheduleGradient() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(startGradient, { timeout: 900 });
    } else {
      setTimeout(startGradient, 0);
    }
  }));
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleGradient, { once: true });
} else {
  scheduleGradient();
}
