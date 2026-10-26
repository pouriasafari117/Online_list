/* ==========================================================================
   Help page behaviour — theme toggle, scrollspy, mobile TOC, print
   No dependencies; everything degrades to a plain readable document.
   ========================================================================== */

import { icon } from './icons.js';

const THEME_KEY = 'ol.theme';
const THEMES = ['auto', 'light', 'dark'];

function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(next) {
  document.documentElement.setAttribute('data-theme', next);
  try {
    if (next === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch { /* private mode */ }
  document.dispatchEvent(new CustomEvent('ol:theme', { detail: { theme: next } }));
}

/** Persian digits for the step chips (CSS counter styles are unreliable). */
function numberSteps() {
  const digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const toFa = (n) => String(n).split('').map((d) => digits[Number(d)] ?? d).join('');
  document.querySelectorAll('.help-steps').forEach((list) => {
    [...list.children].forEach((item, index) => {
      item.dataset.step = toFa(index + 1);
    });
  });
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.dataset.icon;
    if (!name || el.dataset.iconDone === '1') return;
    el.innerHTML = icon(name, { size: Number(el.dataset.iconSize || 18) });
    el.dataset.iconDone = '1';
    el.style.display = 'inline-flex';
    el.style.lineHeight = '0';
  });
}

/* ── Scrollspy ──────────────────────────────────────────────────────────── */

function initScrollspy() {
  const links = [...document.querySelectorAll('#tocNav a')];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;

  const setActive = (id) => {
    links.forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
    });
  };

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setActive(visible[0].target.id);
  }, { rootMargin: '-88px 0px -65% 0px', threshold: 0 });

  sections.forEach((section) => observer.observe(section));

  // Keep the active item visible inside the sticky sidebar on small screens.
  links.forEach((link) => link.addEventListener('click', () => {
    document.querySelector('.help-toc')?.classList.remove('is-open');
    document.querySelector('.toc-fab')?.classList.remove('is-open');
  }));
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

function boot() {
  hydrateIcons();

  numberSteps();

  const themeBtn = document.querySelector('[data-action="theme"]');
  const syncThemeButton = () => {
    const current = readTheme();
    if (!themeBtn) return;
    const label = { auto: 'پوسته سیستم', light: 'پوسته روشن', dark: 'پوسته تاریک' }[current];
    themeBtn.innerHTML = icon(current === 'dark' ? 'light_mode' : 'dark_mode', { size: 19 });
    themeBtn.setAttribute('aria-label', `تغییر پوسته (اکنون: ${label})`);
    themeBtn.setAttribute('data-tip', label);
  };
  syncThemeButton();

  themeBtn?.addEventListener('click', () => {
    const current = readTheme();
    const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
    applyTheme(next);
    syncThemeButton();
    document.dispatchEvent(new CustomEvent('ol:theme-changed'));
  });

  document.querySelector('[data-action="print"]')?.addEventListener('click', () => window.print());

  const toc = document.querySelector('.help-toc');
  const fab = document.querySelector('.toc-fab');
  fab?.addEventListener('click', () => {
    const open = toc?.classList.toggle('is-open');
    fab.classList.toggle('is-open', !!open);
  });

  initScrollspy();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
