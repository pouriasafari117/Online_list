/* ==========================================================================
   Online List — bootstrap, theme, data loading, event delegation
   ========================================================================== */

import { fetchSiteConfig, fetchStoreData, parseRepoFromLocation } from './api.js';
import { makeDefaultData, normalizeStore, parseStoreJson } from './model.js';
import {
  initPublic, isAdmin, mutateQuiet, replaceData, setNetwork, setUI, state, subscribe, syncUrl
} from './state.js';
import {
  hydrateIcons, openDeviceDetail, openHistory, openShareSheet, patchDeviceStock,
  renderAll, renderFilters, renderList, renderPrintMeta, renderStats, renderUpdateCard,
  updateThemeIcon
} from './render.js';
import { initAdmin, renderAdmin } from './admin.js';
import { initRipples, openSheet, toast } from './ui.js';
import {
  clamp, debounce, formatJalaliDateTime, parseNumber, prefersReducedMotion,
  storageGet, storageSet, toFaDigits
} from './util.js';
import { icon } from './icons.js';

const THEME_KEY = 'ol.theme';
const $ = (sel) => document.querySelector(sel);

/* ── Theme ──────────────────────────────────────────────────────────────── */

function readStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return ['light', 'dark', 'auto'].includes(value) ? value : null;
  } catch { return null; }
}

function storeTheme(value) {
  try { localStorage.setItem(THEME_KEY, value); } catch { /* ignore */ }
}

function effectiveTheme() {
  const attr = document.documentElement.getAttribute('data-theme') || 'auto';
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode, { persist = false } = {}) {
  const next = ['light', 'dark', 'auto'].includes(mode) ? mode : 'auto';
  document.documentElement.setAttribute('data-theme', next);
  if (persist) storeTheme(next);
  updateThemeIcon();
}

function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  const run = () => applyTheme(next, { persist: true });
  if (document.startViewTransition && !prefersReducedMotion()) {
    document.startViewTransition(run);
  } else {
    run();
  }
}

function applyStoreTheme() {
  if (readStoredTheme()) return; // visitor preference wins
  const mode = state.data?.settings?.theme || 'auto';
  applyTheme(mode);
}

/* ── Toasts keyed by message (avoid duplicates on reconnect) ────────────── */

function bootTheme() {
  applyTheme(readStoredTheme() || document.documentElement.getAttribute('data-theme') || 'auto');
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => {
    if (!readStoredTheme() || readStoredTheme() === 'auto') updateThemeIcon();
  });
}

/* ── Data loading ───────────────────────────────────────────────────────── */

function normalizeSite(config) {
  if (!config || typeof config !== 'object') return {};
  const owner = String(config.owner || '').trim();
  const repo = String(config.repo || '').trim();
  const branch = String(config.branch || 'main').trim() || 'main';
  return { ...config, owner, repo, branch };
}

async function loadData({ retry = false } = {}) {
  const refreshBtn = $('#refreshBtn');
  if (retry && refreshBtn) refreshBtn.setAttribute('aria-busy', 'true');
  try {
    const result = await fetchStoreData(state.site || {});
    const data = parseStoreJson(result.text);
    if (retry) {
      if (isAdmin() && state.dirty) {
        toast('ابتدا تغییرات را منتشر یا بازگردانی کنید.', { type: 'warn' });
        return;
      }
      state.error = null;
      state.sha = null;
      replaceData(data, { baseline: true, source: result.source });
      state.sourceUrl = result.url;
      applyStoreTheme();
      toast('لیست با آخرین نسخه‌ی مخزن همگام شد.', { type: 'ok' });
    } else {
      ensureFilterDefaults(data);
      initPublic(data, { source: result.source, url: result.url });
      applyStoreTheme();
    }
    document.getElementById('dataStatus')?.classList.remove('is-offline');
  } catch (err) {
    console.error('[data]', err);
    if (!state.data) {
      initPublic(makeDefaultData(), { source: 'fallback' });
      state.error = err;
    }
    toast(
      retry ? 'هنوز امکان دریافت نسخه تازه نیست؛ اتصال را بررسی کنید.' : 'دریافت لیست از مخزن ممکن نشد؛ نسخه ذخیره‌شده نمایش داده می‌شود.',
      { type: 'warn', duration: 5200 }
    );
    renderFooterStatus();
  } finally {
    if (retry && refreshBtn) refreshBtn.removeAttribute('aria-busy');
  }
}

function ensureFilterDefaults(data) {
  const { category } = state.ui;
  if (category === 'all' || category === '__none__') return;
  if (!data.categories.some((c) => c.id === category)) {
    state.ui.category = 'all';
  }
}

let deepLinkHandled = null;

function handleDeepLink() {
  const match = location.hash.match(/^#device-([\w-]+)$/);
  if (!match) return;
  if (deepLinkHandled === location.hash) return;
  const id = match[1];
  if (!state.data?.devices.some((d) => d.id === id)) return;
  deepLinkHandled = location.hash;
  setTimeout(() => openDeviceDetail(id), 350);
}

/* ── Header & navigation ────────────────────────────────────────────────── */

function initHeader() {
  const appbar = $('#appbar');
  let lastY = window.scrollY;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      if (appbar) appbar.classList.toggle('is-stuck', y > 6);
      lastY = y;
      updateNavState();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  updateNavState();
}

function updateNavState() {
  const links = [...document.querySelectorAll('.appbar__link')];
  if (!links.length) return;
  const contact = document.getElementById('contact');
  const contactTop = contact ? contact.getBoundingClientRect().top : Infinity;
  const active = contactTop < window.innerHeight * 0.55 ? '#contact' : '#list';
  links.forEach((a) => {
    if (a.getAttribute('href') === '#categories') { a.removeAttribute('aria-current'); return; }
    if (a.getAttribute('href') === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function initReveal() {
  const elements = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  elements.forEach((el) => io.observe(el));
}

/* ── Interactions ───────────────────────────────────────────────────────── */

function scrollToList() {
  const list = document.getElementById('list');
  if (!list) return;
  const rect = list.getBoundingClientRect();
  if (rect.top < 0 || rect.top > window.innerHeight * 0.5) {
    list.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}

function focusSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  document.getElementById('list')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => {
    input.focus({ preventScroll: true });
    input.select();
  }, prefersReducedMotion() ? 0 : 260);
}

function resetFilters() {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  setUI({ q: '', category: 'all', avail: 'all', hiddenOnly: false, sort: 'recommended', limit: 24 });
  document.getElementById('sortSelect') && (document.getElementById('sortSelect').value = 'recommended');
}

function setStock(deviceId, value) {
  const device = state.data?.devices.find((d) => d.id === deviceId);
  if (!device) return;
  const next = clamp(Math.round(Number(value)), 0, 9999);
  if (!Number.isFinite(next) || next === device.stock) return;
  mutateQuiet((draft) => {
    const target = draft.devices.find((d) => d.id === deviceId);
    if (!target) return;
    target.stock = next;
    target.updatedAt = new Date().toISOString();
  });
  patchDeviceStock(deviceId);
  renderStats({ animate: false });
  renderUpdateCard();
  renderAdmin();
  if (navigator.vibrate) navigator.vibrate(8);
}

function initDelegation() {
  document.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === 'filter-cat') {
        event.preventDefault();
        setUI({ category: actionEl.dataset.cat || 'all', limit: 24 });
        scrollToList();
      } else if (action === 'clear-filters') {
        resetFilters();
      } else if (action === 'stock-inc' || action === 'stock-dec') {
        const device = state.data?.devices.find((d) => d.id === actionEl.dataset.deviceId);
        if (!device) return;
        setStock(device.id, device.stock + (action === 'stock-inc' ? 1 : -1));
      } else if (action === 'detail') {
        openDeviceDetail(actionEl.dataset.deviceId);
      } else if (action === 'theme') {
        toggleTheme();
      } else if (action === 'history') {
        openHistory();
      } else if (action === 'print') {
        printList();
      } else if (action === 'refresh') {
        loadData({ retry: true });
      } else if (action === 'share') {
        openShareSheet();
      } else if (action === 'install') {
        handleInstall();
      } else if (action === 'load-more') {
        setUI({ limit: state.ui.limit + 24 });
      } else if (action === 'search-jump') {
        focusSearch();
      } else if (action === 'rail-prev' || action === 'rail-next') {
        scrollRail(action === 'rail-next' ? 1 : -1);
      }
      return;
    }

    // Clicking a device row (public mode) opens its detail sheet.
    const row = event.target.closest('.device[data-clickable="true"]');
    if (row && !event.target.closest('a, button')) {
      openDeviceDetail(row.dataset.deviceId);
    }
  });

  document.addEventListener('change', (event) => {
    const input = event.target.closest('[data-action="stock-input"]');
    if (input) {
      const value = parseNumber(input.value);
      setStock(input.dataset.deviceId, Number.isFinite(value) ? value : 0);
      return;
    }
    if (event.target.id === 'sortSelect') {
      setUI({ sort: event.target.value, limit: 24 });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) {
      if (event.key === 'Escape' && document.activeElement?.id === 'searchInput') {
        document.activeElement.value = '';
        setUI({ q: '', limit: 24 });
        document.activeElement.blur();
      }
      return;
    }
    if (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
      event.preventDefault();
      focusSearch();
    }
    if (event.key === 'Escape') {
      const row = document.activeElement?.closest?.('.device[data-clickable="true"]');
      if (row) document.activeElement.blur();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest?.('.device[data-clickable="true"]');
    if (!row) return;
    event.preventDefault();
    openDeviceDetail(row.dataset.deviceId);
  });

  document.addEventListener('ol:history', () => openHistory());
  document.addEventListener('ol:admin-focus', (event) => {
    const { avail, hidden } = event.detail || {};
    if (hidden) setUI({ hiddenOnly: true, category: 'all', avail: 'all', q: '', limit: 24 });
    if (avail) setUI({ avail, hiddenOnly: false, category: 'all', q: '', limit: 24 });
    scrollToList();
  });

  const search = $('#searchInput');
  if (search) {
    const commit = debounce(() => {
      setUI({ q: search.value.trim(), limit: 24 });
      syncUrl();
    }, 170);
    search.addEventListener('input', () => {
      document.getElementById('searchWrap')?.classList.toggle('has-value', !!search.value);
      commit();
    });
  }
  const clear = $('#searchClear');
  if (clear) {
    clear.addEventListener('click', () => {
      if (search) search.value = '';
      setUI({ q: '', limit: 24 });
      search?.focus();
    });
  }

  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => setUI({ view: btn.dataset.view, limit: 24 }));
  });

  document.querySelectorAll('#availabilityFilter [data-avail]').forEach((btn) => {
    btn.addEventListener('click', () => setUI({ avail: btn.dataset.avail, limit: 24 }));
  });

  $('#resetFilters')?.addEventListener('click', resetFilters);

  window.addEventListener('afterprint', () => {
    state.ui.printAll = false;
    renderList();
  });
}

function printList() {
  if (!state.data) return;
  state.ui.printAll = true;
  renderList();
  renderPrintMeta();
  setTimeout(() => window.print(), 80);
}

function scrollRail(direction) {
  const rail = document.getElementById('featuredRail');
  if (!rail) return;
  const step = Math.max(260, rail.clientWidth * 0.75);
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
  rail.scrollBy({ left: direction * step * (rtl ? -1 : 1), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/* ── Install as app ─────────────────────────────────────────────────────── */

let installPrompt = null;

function initInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
  });
}

async function handleInstall() {
  if (installPrompt) {
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') toast('اپلیکیشن نصب شد.', { type: 'ok' });
    installPrompt = null;
    return;
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openSheet({
    title: 'نصب روی صفحه اصلی',
    size: 'narrow',
    body: `
      <div class="stack" style="gap:14px">
        <div class="login-hero">
          <span class="login-hero__icon">${icon('download', { size: 24 })}</span>
          <div>
            <div class="login-hero__title">این لیست را مثل یک اپلیکیشن داشته باشید</div>
            <div class="login-hero__sub">بدون نصب از استور، همیشه در دسترس و بدون مصرف داده اضافه.</div>
          </div>
        </div>
        <ol style="display:grid;gap:10px;padding-inline-start:18px;list-style:decimal;font-size:var(--fs-xs);color:var(--text-2);line-height:1.9">
          ${isIos
            ? '<li>در Safari روی دکمه «اشتراک‌گذاری» بزنید.</li><li>گزینه «Add to Home Screen» را انتخاب کنید.</li><li>نام دلخواه را ذخیره کنید.</li>'
            : '<li>از منوی مرورگر گزینه «Install app» یا «نصب برنامه» را انتخاب کنید.</li><li>اگر این گزینه نبود، صفحه را نشانه‌گذاری (Bookmark) کنید.</li>'}
        </ol>
      </div>
    `,
    footer: '<span class="spacer"></span><button class="btn btn--filled btn--sm" type="button" data-close>باشه</button>'
  });
}

/* ── Service worker (production only) ──────────────────────────────────── */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const host = location.hostname;
  if (location.protocol === 'file:') return;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.e2b.app')) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      if (reg.waiting) {
        toast('نسخه جدید سایت آماده است؛ برای دریافت، صفحه را دوباره باز کنید.', { type: 'info', duration: 6000 });
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('نسخه جدید سایت آماده است؛ صفحه را دوباره باز کنید.', { type: 'info', duration: 6000 });
          }
        });
      });
    } catch (err) {
      console.warn('[sw] registration failed', err);
    }
  });
}

/* ── Footer status ─────────────────────────────────────────────────────── */

function renderFooterStatus() {
  const status = document.getElementById('dataStatus');
  if (!status) return;
  const label = status.querySelector('span:last-child');
  const offline = !!state.error || !state.online;
  status.classList.toggle('is-offline', offline);
  if (label) label.textContent = offline ? (state.online ? 'داده‌ها در دسترس نیست' : 'آفلاین') : 'متصل';
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

async function boot() {
  bootTheme();
  hydrateIcons();
  initRipples();
  initHeader();
  initReveal();
  initInstall();
  initDelegation();
  initAdmin();

  subscribe((reason) => {
    if (!state.data) return;
    if (reason === 'ui') {
      renderFilters();
      renderList();
      syncUrl();
      return;
    }
    if (reason === 'network') {
      renderFooterStatus();
      return;
    }
    if (reason === 'loading') return;
    renderAll({ animateStats: reason === 'data' });
    renderAdmin();
    if (reason === 'auth' || reason === 'data') document.documentElement.dataset.mode = state.mode;
    if (reason === 'data') handleDeepLink();
  });

  const [siteFile] = await Promise.all([fetchSiteConfig()]);
  const fromLocation = parseRepoFromLocation();
  let site = normalizeSite(siteFile || {});
  if (fromLocation) {
    site = {
      ...site,
      owner: fromLocation.owner,
      repo: fromLocation.repo,
      pageUrl: fromLocation.pageUrl,
      branch: site.branch || fromLocation.branch
    };
  }
  state.site = site;
  state.repo = site.owner && site.repo ? { owner: site.owner, repo: site.repo, branch: site.branch } : null;

  await loadData();
  handleDeepLink();

  window.addEventListener('online', () => {
    setNetwork(true);
    toast('اتصال برقرار شد.', { type: 'ok' });
  });
  window.addEventListener('offline', () => {
    setNetwork(false);
    toast('اتصال قطع شد؛ آخرین نسخه نمایش داده می‌شود.', { type: 'warn' });
  });

  registerServiceWorker();
  document.documentElement.dataset.ready = 'true';
}

boot().catch((err) => {
  console.error('[boot]', err);
  document.documentElement.dataset.ready = 'error';
});
