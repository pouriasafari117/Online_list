/* ==========================================================================
   Rendering — all markup for the public list and the admin affordances.
   (No framework: template strings + delegated events.)
   ========================================================================== */

import { hydrateIcons, icon } from './icons.js';
import {
  categoryTitle, computeStats, countByCategory, getCategory, specText,
  stockState, visibleDevices
} from './model.js';
import { currentNumerals, isAdmin, isDemo, state } from './state.js';
import {
  escapeHtml, formatJalaliDate, formatJalaliDateTime, formatNum,
  instagramHref, matchesQuery, pickTone, prefersReducedMotion, safeUrl,
  telHref, timeAgo, whatsappHref
} from './util.js';
import { openSheet, toast, copyWithToast } from './ui.js';

const GROUP_LIMIT = 8;
const CURRENCY_FALLBACK = 'تومان';

export function numerals() {
  return currentNumerals();
}
export function num(value) {
  const out = formatNum(value, numerals());
  return numerals() === 'fa' ? out.replace(/,/g, '٬') : out;
}
function currency() {
  return state.data?.settings?.currency || CURRENCY_FALLBACK;
}

/* ── Icons ──────────────────────────────────────────────────────────────── */

export { hydrateIcons };

export function updateThemeIcon() {
  const root = document.documentElement;
  const attr = root.getAttribute('data-theme') || 'auto';
  const dark = attr === 'dark' || (attr === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('[data-theme-icon]').forEach((el) => {
    el.innerHTML = icon(dark ? 'light_mode' : 'dark_mode', { size: 21 });
    el.dataset.icon = dark ? 'light_mode' : 'dark_mode';
    el.dataset.iconDone = '1';
  });
  const metaLight = document.querySelector('meta[name="theme-color"][media*="light"]');
  const metaDark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  if (metaLight) metaLight.content = '#f4f2ed';
  if (metaDark) metaDark.content = '#0e0e0c';
}

/* ── Branding & chrome ──────────────────────────────────────────────────── */

export function renderBranding() {
  const data = state.data;
  if (!data) return;
  const { store } = data;
  document.querySelectorAll('[data-store-name]').forEach((el) => { el.textContent = store.name; });
  document.querySelectorAll('[data-store-description]').forEach((el) => { el.textContent = store.description; });
  document.querySelectorAll('[data-store-address]').forEach((el) => { el.textContent = store.address || '—'; });
  document.querySelectorAll('[data-store-hours]').forEach((el) => { el.textContent = store.hours || '—'; });
  const headline = document.querySelector('.hero__headline');
  if (headline && store.tagline) headline.textContent = store.tagline;

  document.title = `${store.name} — لیست موجودی`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', store.description || `${store.name} — لیست موجودی آنلاین`);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', document.title);

  const phoneHref = telHref(store.phone);
  ['heroCall', 'contactCall', 'contactPhone'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (store.phone) { el.href = phoneHref; el.removeAttribute('aria-disabled'); }
    else { el.setAttribute('aria-disabled', 'true'); el.href = '#'; }
  });
  const phoneEl = document.getElementById('contactPhone');
  if (phoneEl) phoneEl.textContent = store.phone || '—';

  const wa = whatsappHref(store.whatsapp, `سلام! درباره موجودی ${store.name} سوال داشتم.`);
  const waBtn = document.getElementById('contactWhatsapp');
  if (waBtn) { if (wa) waBtn.href = wa; else waBtn.hidden = true; }

  const ig = instagramHref(store.instagram);
  const igBtn = document.getElementById('contactInstagram');
  if (igBtn) { if (ig) igBtn.href = ig; else igBtn.hidden = true; }

  const yearEl = document.getElementById('year');
  if (yearEl) {
    try {
      const p = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' })
        .formatToParts(new Date()).find((x) => x.type === 'year');
      yearEl.textContent = p?.value || '۱۴۰۵';
    } catch { yearEl.textContent = '۱۴۰۵'; }
  }
  renderFooter();
}

export function renderFooter() {
  const data = state.data;
  if (!data) return;
  const footerUpdate = document.querySelector('[data-footer-update]');
  if (footerUpdate) footerUpdate.textContent = `آخرین به‌روزرسانی: ${formatJalaliDate(data.meta.updatedAt, { short: true })}`;
  const status = document.getElementById('dataStatus');
  if (status) {
    const online = state.online && !state.error;
    status.classList.toggle('is-offline', !online);
    const label = status.querySelector('span:last-child');
    if (label) label.textContent = state.error ? 'داده‌ها در دسترس نیست' : (online ? 'متصل' : 'آفلاین');
  }
  const footerCats = document.getElementById('footerCategories');
  if (footerCats) {
    const counts = countByCategory(data);
    const items = data.categories.filter((c) => counts.get(c.id));
    footerCats.innerHTML = items.length
      ? items.slice(0, 6).map((c) => `
          <a href="#list" data-action="filter-cat" data-cat="${escapeHtml(c.id)}">
            ${escapeHtml(c.title)} <span style="opacity:.55">${num(counts.get(c.id) || 0)}</span>
          </a>`).join('')
      : '<span class="t-muted">هنوز دسته‌بندی‌ای ثبت نشده است.</span>';
  }
  const footerLogin = document.getElementById('footerLogin');
  if (footerLogin) footerLogin.textContent = isAdmin() ? 'تنظیمات مدیریت' : 'ورود مدیر';
}

export function renderHeader() {
  const loginBtn = document.getElementById('loginBtn');
  if (!loginBtn) return;
  if (isAdmin()) {
    loginBtn.className = 'btn btn--sm admin-pill';
    loginBtn.innerHTML = `<span class="admin-pill__dot" aria-hidden="true"></span><span>${escapeHtml(state.user?.name || 'مدیر')}</span>`;
    loginBtn.setAttribute('data-action', 'admin-menu');
    loginBtn.removeAttribute('data-login');
    loginBtn.setAttribute('aria-haspopup', 'menu');
  } else {
    loginBtn.className = 'btn btn--outlined btn--sm login-btn';
    loginBtn.innerHTML = `${icon('lock', { size: 17 })}<span>ورود مدیر</span>`;
    loginBtn.setAttribute('data-action', 'login');
    loginBtn.removeAttribute('aria-haspopup');
  }
  const quickAdd = document.getElementById('quickAdd');
  if (quickAdd) quickAdd.hidden = !isAdmin();
  const headerPublish = document.getElementById('headerPublish');
  if (headerPublish) {
    const compact = window.matchMedia('(max-width: 719px)').matches;
    const showPublish = isAdmin() && !isDemo() && state.dirty && !compact;
    headerPublish.hidden = !showPublish;
    headerPublish.classList.toggle('is-visible', showPublish);
    headerPublish.classList.toggle('has-changes', !!state.dirty);
    const label = headerPublish.querySelector('.header-publish__label');
    if (label) label.textContent = state.dirty ? 'انتشار تغییرات' : 'منتشرشده';
    headerPublish.setAttribute('aria-disabled', String(!state.dirty));
    headerPublish.title = state.dirty ? 'تغییرات منتظر انتشار است' : 'همه تغییرات منتشر شده است';
  }
  const loginLink = document.getElementById('footerLogin');
  if (loginLink) loginLink.textContent = isAdmin() ? 'تنظیمات مدیریت' : 'ورود مدیر';
}

/* ── Stats & last update ────────────────────────────────────────────────── */

let statsAnimated = false;

export function renderStats({ animate = true } = {}) {
  if (!state.data) return;
  const stats = computeStats(state.data, { includeHidden: isAdmin() });
  document.querySelectorAll('[data-stat]').forEach((el) => {
    const key = el.dataset.stat;
    const target = stats[key] ?? 0;
    if (!animate || statsAnimated || prefersReducedMotion()) {
      el.textContent = num(target);
    } else {
      animateNumber(el, target);
    }
  });
  if (animate) statsAnimated = true;
}

function animateNumber(el, target) {
  const duration = 800;
  const start = performance.now();
  const from = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = num(Math.round(from + (target - from) * eased));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = num(target);
  };
  requestAnimationFrame(step);
}

export function renderUpdateCard() {
  if (!state.data) return;
  const { meta } = state.data;
  const ago = document.querySelector('[data-update-ago]');
  const exact = document.querySelector('[data-update-exact]');
  const by = document.querySelector('[data-update-by]');
  const source = document.querySelector('[data-update-source]');
  if (ago) ago.textContent = timeAgo(meta.updatedAt);
  if (exact) exact.textContent = formatJalaliDateTime(meta.updatedAt);
  if (by) by.textContent = meta.updatedBy || 'مدیر فروشگاه';
  if (source) {
    if (state.mode === 'admin' && state.dirty) source.textContent = 'تغییرات منتشرنشده — منتظر انتشار';
    else if (state.mode === 'admin') source.textContent = 'همگام با مخزن گیت‌هاب';
    else if (state.mode === 'demo') source.textContent = 'حالت نمایشی — تغییرات ذخیره نمی‌شود';
    else if (state.error) source.textContent = 'آخرین نسخه ذخیره‌شده';
    else source.textContent = 'مستقیم از مخزن گیت‌هاب';
  }
  const listSub = document.getElementById('listSub');
  if (listSub) {
    const stats = computeStats(state.data, { includeHidden: isAdmin() });
    listSub.textContent = `${num(stats.devices)} مدل در ${num(stats.categoriesTotal)} دسته‌بندی · ${num(stats.inStock)} مدل موجود`;
  }
}

export function renderPrintMeta() {
  if (!state.data) return;
  const { store, meta } = state.data;
  const title = document.querySelector('[data-print-title]');
  if (title) title.textContent = `${store.name} — لیست موجودی`;
  const metaEl = document.querySelector('[data-print-meta]');
  if (metaEl) {
    const stats = computeStats(state.data, { includeHidden: false });
    const bits = [
      `آخرین به‌روزرسانی: ${formatJalaliDateTime(meta.updatedAt)}`,
      `${num(stats.devices)} مدل · ${num(stats.inStock)} موجود`,
      store.phone ? `تلفن: ${store.phone}` : '',
      store.address || ''
    ].filter(Boolean);
    metaEl.textContent = bits.join('  —  ');
  }
}

/* ── Featured rail ──────────────────────────────────────────────────────── */

export function renderFeatured() {
  const section = document.getElementById('featuredSection');
  const rail = document.getElementById('featuredRail');
  if (!section || !rail || !state.data) return;
  const featured = visibleDevices(state.data)
    .filter((d) => d.featured)
    .sort((a, b) => a.order - b.order)
    .slice(0, 10);
  if (!featured.length) { section.hidden = true; rail.innerHTML = ''; return; }
  section.hidden = false;
  rail.innerHTML = featured.map((d) => featureCardHtml(d)).join('');
}

function featureCardHtml(device) {
  const cat = getCategory(state.data, device.categoryId);
  const specs = (cat?.fields || []).filter((f) => f.showInRow && specText(f, device)).slice(0, 2);
  const stock = stockState(device, state.data.settings);
  return `
    <button class="feature-card reveal is-in" type="button" role="listitem" data-action="detail" data-device-id="${escapeHtml(device.id)}"
            aria-label="جزئیات ${escapeHtml(device.name)}">
      <div class="feature-card__media">
        ${device.image ? `<img class="thumb-img" src="${escapeHtml(safeUrl(device.image))}" alt="" loading="lazy" decoding="async">` : icon(cat?.icon || 'devices_other', { size: 54 })}
        <span class="feature-card__tag badge badge--inverse">${icon('star', { size: 12 })} ویژه</span>
      </div>
      <div>
        <div class="feature-card__name">${escapeHtml(device.name)}</div>
        <div class="feature-card__specs">${escapeHtml([device.brand, ...specs.map((f) => specText(f, device))].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="feature-card__foot">
        <span class="feature-card__price">${priceText(device)}</span>
        ${stockBadgeHtml(device)}
      </div>
    </button>
  `;
}

/* ── Filtering & sorting ────────────────────────────────────────────────── */

export function visibleFilteredDevices() {
  const data = state.data;
  if (!data) return [];
  const { ui } = state;
  let list = visibleDevices(data, { includeHidden: isAdmin() });
  if (ui.category !== 'all') {
    list = list.filter((d) => (d.categoryId || '__none__') === ui.category);
  }
  if (ui.avail !== 'all') {
    list = list.filter((d) => stockState(d, data.settings) === ui.avail);
  }
  if (ui.q.trim()) {
    list = list.filter((d) => {
      const cat = getCategory(data, d.categoryId);
      const hay = [
        d.name, d.brand, d.condition, d.warranty, d.note, d.specs ? Object.values(d.specs).join(' ') : '',
        cat?.title || '', cat?.description || ''
      ].join(' ');
      return matchesQuery(hay, ui.q);
    });
  }
  return sortDevices(list, data);
}

function sortDevices(list, data) {
  const arr = [...list];
  const price = (d) => (d.priceOnRequest || !d.price ? Number.POSITIVE_INFINITY : d.price);
  switch (state.ui.sort) {
    case 'price-asc':
      return arr.sort((a, b) => price(a) - price(b) || a.order - b.order);
    case 'price-desc':
      return arr.sort((a, b) => {
        const pa = price(a); const pb = price(b);
        if (!Number.isFinite(pa)) return 1;
        if (!Number.isFinite(pb)) return -1;
        return pb - pa || a.order - b.order;
      });
    case 'stock-desc':
      return arr.sort((a, b) => b.stock - a.stock || a.order - b.order);
    case 'newest':
      return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'name-asc':
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    case 'recommended':
    default:
      return arr.sort((a, b) => (Number(b.featured) - Number(a.featured)) || a.order - b.order);
  }
}

export function isGroupedView() {
  return state.ui.category === 'all' && !state.ui.q.trim();
}

/* ── Filters UI ─────────────────────────────────────────────────────────── */

export function renderFilters() {
  if (!state.data) return;
  const { ui } = state;
  const searchInput = document.getElementById('searchInput');
  if (searchInput && document.activeElement !== searchInput) searchInput.value = ui.q;
  document.getElementById('searchWrap')?.classList.toggle('has-value', !!ui.q);

  document.querySelectorAll('#availabilityFilter [data-avail]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.avail === ui.avail));
  });
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.view === ui.view));
  });
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect && sortSelect.value !== ui.sort) sortSelect.value = ui.sort;

  renderCategoryChips();

  const resetBtn = document.getElementById('resetFilters');
  const hasFilters = !!ui.q || ui.category !== 'all' || ui.avail !== 'all' || ui.sort !== 'recommended';
  if (resetBtn) resetBtn.hidden = !hasFilters;

  const listRoot = document.getElementById('listRoot');
  if (listRoot) listRoot.classList.toggle('list--static', !!ui.q);

  const searchClear = document.getElementById('searchClear');
  if (searchClear) searchClear.hidden = !ui.q;
}

function renderCategoryChips() {
  const host = document.getElementById('categories') || document.getElementById('categoryChips');
  if (!host) return;
  const counts = countByCategory(state.data, { includeHidden: isAdmin() });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const items = [
    `<button class="chip" type="button" data-action="filter-cat" data-cat="all" aria-pressed="${state.ui.category === 'all'}">
      ${icon('grid_view', { size: 17 })} همه <span class="chip__count">${num(total)}</span>
    </button>`
  ];
  for (const cat of state.data.categories) {
    if (!counts.get(cat.id) && !isAdmin()) continue;
    items.push(`
      <button class="chip" type="button" data-action="filter-cat" data-cat="${escapeHtml(cat.id)}"
              aria-pressed="${state.ui.category === cat.id}">
        ${icon(cat.icon || 'category', { size: 17 })}
        ${escapeHtml(cat.title)}
        <span class="chip__count">${num(counts.get(cat.id) || 0)}</span>
      </button>`);
  }
  if (counts.get('__none__')) {
    items.push(`
      <button class="chip" type="button" data-action="filter-cat" data-cat="__none__"
              aria-pressed="${state.ui.category === '__none__'}">
        ${icon('category', { size: 17 })} سایر <span class="chip__count">${num(counts.get('__none__') || 0)}</span>
      </button>`);
  }
  if (isAdmin()) {
    items.push(`
      <button class="chip" type="button" data-action="add-category" style="border-style:dashed">
        ${icon('add', { size: 17 })} دسته جدید
      </button>`);
  }
  host.innerHTML = items.join('');
}

/* ── List ───────────────────────────────────────────────────────────────── */

export function renderList() {
  const root = document.getElementById('listRoot');
  if (!root) return;
  if (!state.data) return;
  const list = visibleFilteredDevices();
  const totalVisible = visibleDevices(state.data, { includeHidden: isAdmin() }).length;
  const resultCount = document.getElementById('resultCount');
  const grouped = isGroupedView();
  let html = '';

  if (!list.length) {
    html = emptyStateHtml(totalVisible === 0);
  } else if (grouped) {
    html = groupsHtml(list);
  } else {
    const limit = state.ui.printAll ? list.length : Math.max(state.ui.limit, 1);
    const shown = list.slice(0, limit);
    html = `
      <div class="group">
        <div class="group__list">
          ${shown.map((d, i) => deviceRowHtml(d, i, { showCategory: true })).join('')}
        </div>
      </div>`;
  }

  root.innerHTML = html;
  root.setAttribute('aria-busy', 'false');

  // count
  if (resultCount) {
    if (grouped) {
      const shownCats = new Set(list.map((d) => d.categoryId || '__none__')).size;
      resultCount.innerHTML = `<b>${num(list.length)}</b> دستگاه در ${num(shownCats)} دسته · ${num(list.filter((d) => d.stock > 0).length)} موجود`;
    } else {
      resultCount.innerHTML = `<b>${num(list.length)}</b> نتیجه از ${num(totalVisible)} دستگاه`;
    }
  }

  // load more
  const wrap = document.getElementById('loadMoreWrap');
  const btn = document.getElementById('loadMoreBtn');
  if (wrap && btn) {
    const remaining = grouped ? 0 : Math.max(0, list.length - state.ui.limit);
    wrap.hidden = remaining <= 0 || state.ui.printAll;
    if (remaining > 0) btn.textContent = `نمایش ${num(Math.min(24, remaining))} دستگاه دیگر (${num(remaining)} باقی‌مانده)`;
  }
  hydrateIcons(root);
}

function groupsHtml(list) {
  const data = state.data;
  const groups = [];
  for (const cat of data.categories) {
    const items = list.filter((d) => d.categoryId === cat.id);
    if (!items.length && !isAdmin()) continue;
    groups.push({ cat, items });
  }
  const orphans = list.filter((d) => !getCategory(data, d.categoryId));
  if (orphans.length) groups.push({ cat: null, items: orphans });
  if (!groups.length) return emptyStateHtml(true);
  return groups.map(({ cat, items }) => groupHtml(cat, items)).join('');
}

function groupHtml(cat, items) {
  const data = state.data;
  const catId = cat?.id || '__none__';
  const isFiltered = state.ui.category === catId;
  const cap = state.ui.printAll || isFiltered ? items.length : GROUP_LIMIT;
  const shown = items.slice(0, cap);
  const inStock = items.filter((d) => d.stock > 0).length;
  const hiddenCount = items.filter((d) => d.hidden).length;
  const title = cat?.title || 'سایر';
  const iconName = cat?.icon || 'category';
  const metaBits = [`${num(items.length)} دستگاه`, `${num(inStock)} موجود`];
  if (isAdmin() && hiddenCount) metaBits.push(`${num(hiddenCount)} پنهان`);
  return `
    <section class="group group--${state.ui.view === 'grid' ? 'grid' : 'list'}" data-group="${escapeHtml(catId)}" aria-label="${escapeHtml(title)}">
      <div class="group__head">
        <span class="group__icon">${icon(iconName, { size: 19 })}</span>
        <div class="group__titles">
          <h3 class="group__title">${escapeHtml(title)}</h3>
          <span class="group__meta" data-group-meta="${escapeHtml(catId)}">${metaBits.join(' · ')}</span>
        </div>
        <span class="group__line" aria-hidden="true"></span>
        <div class="group__actions">
          ${cat && cat.description ? `<span class="group__meta" style="max-width:26ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(cat.description)}">${escapeHtml(cat.description)}</span>` : ''}
          ${isAdmin() ? `
            <button class="icon-btn" type="button" data-action="add-device" data-cat="${escapeHtml(cat?.id || '')}" aria-label="افزودن دستگاه به ${escapeHtml(title)}" data-tip="افزودن">
              ${icon('add', { size: 18 })}
            </button>
            ${cat ? `<button class="icon-btn" type="button" data-action="edit-category" data-cat="${escapeHtml(cat.id)}" aria-label="ویرایش دسته ${escapeHtml(title)}" data-tip="ویرایش دسته">
              ${icon('edit', { size: 17 })}
            </button>` : ''}
          ` : `
            <button class="icon-btn" type="button" data-action="filter-cat" data-cat="${escapeHtml(catId)}" aria-label="نمایش فقط ${escapeHtml(title)}" data-tip="فیلتر">
              ${icon('filter_list', { size: 17 })}
            </button>
          `}
        </div>
      </div>
      ${shown.length ? `<div class="group__list">${shown.map((d, i) => deviceRowHtml(d, i)).join('')}</div>` : `
        <div class="empty" style="padding:28px 16px">
          <div class="empty__desc">هنوز دستگاهی در این دسته ثبت نشده است.</div>
          ${isAdmin() ? `<button class="btn btn--tonal btn--sm" type="button" data-action="add-device" data-cat="${escapeHtml(cat?.id || '')}">${icon('add', { size: 17 })} افزودن دستگاه</button>` : ''}
        </div>`}
      ${items.length > shown.length ? `
        <div class="load-more" style="margin-top:10px">
          <button class="btn btn--text btn--sm" type="button" data-action="filter-cat" data-cat="${escapeHtml(catId)}">
            نمایش همه ${num(items.length)} دستگاه این دسته
            ${icon('chevron_left', { size: 16 })}
          </button>
        </div>` : ''}
    </section>
  `;
}

function deviceRowHtml(device, index = 0, { showCategory = false } = {}) {
  const data = state.data;
  const cat = getCategory(data, device.categoryId);
  const stock = stockState(device, data.settings);
  const admin = isAdmin();
  const fields = (cat?.fields || []).filter((f) => f.showInRow && specText(f, device)).slice(0, 4);
  const allFields = (cat?.fields || []).filter((f) => specText(f, device));
  const specs = (fields.length ? fields : allFields.slice(0, 2));
  const subBits = [
    device.brand,
    showCategory ? (cat?.title || 'سایر') : '',
    device.condition,
    device.warranty
  ].filter(Boolean);
  return `
    <article class="device ${stock === 'out' ? 'device--oos' : ''} ${device.featured ? 'device--featured' : ''}"
      data-device-id="${escapeHtml(device.id)}" style="--i:${Math.min(index, 12)}"
      ${admin ? '' : 'data-clickable="true" role="button" tabindex="0"'}
      aria-label="${escapeHtml(device.name)}${admin ? '' : ' — مشاهده جزئیات'}">
      <div class="device__thumb" data-tone="${pickTone(device.name + device.brand)}">
        ${device.image
          ? `<img src="${escapeHtml(safeUrl(device.image))}" alt="" loading="lazy" decoding="async">`
          : icon(cat?.icon || 'devices_other', { size: 26 })}
      </div>
      <div class="device__main">
        <div class="device__titleline">
          <h4 class="device__name">${escapeHtml(device.name)}</h4>
          ${device.featured ? `<span class="badge badge--outline" title="پیشنهاد فروشگاه">${icon('star', { size: 12 })} ویژه</span>` : ''}
          ${admin && device.hidden ? `<span class="badge">${icon('visibility_off', { size: 12 })} پنهان</span>` : ''}
        </div>
        ${subBits.length ? `<div class="device__sub">${subBits.map((b, i) => `${i ? '<span class="dot" aria-hidden="true"></span>' : ''}<span>${escapeHtml(b)}</span>`).join('')}</div>` : ''}
        ${specs.length ? `<ul class="device__specs">
          ${specs.map((f) => `<li><span class="k">${escapeHtml(f.label)}</span><span class="v">${escapeHtml(specText(f, device))}</span></li>`).join('')}
        </ul>` : ''}
        ${device.note ? `<div class="device__note">${escapeHtml(device.note)}</div>` : ''}
      </div>
      <div class="device__side">
        <div class="device__price ${device.priceOnRequest || !data.settings.showPrices || !device.price ? 'device__price--ask' : ''}">
          ${priceHtml(device)}
        </div>
        ${admin ? stepperHtml(device) : stockBadgeHtml(device)}
        ${admin ? `<div class="device__admin">
          <button class="icon-btn" type="button" data-action="edit-device" data-device-id="${escapeHtml(device.id)}" aria-label="ویرایش ${escapeHtml(device.name)}" data-tip="ویرایش">
            ${icon('edit', { size: 17 })}
          </button>
          <button class="icon-btn" type="button" data-action="device-menu" data-device-id="${escapeHtml(device.id)}" aria-label="گزینه‌های بیشتر" data-tip="بیشتر" aria-haspopup="menu">
            ${icon('more_vert', { size: 17 })}
          </button>
        </div>` : `
          <span class="device__chevron" aria-hidden="true" style="color:var(--text-3)">${icon('chevron_left', { size: 16 })}</span>
        `}
      </div>
    </article>
  `;
}

function stepperHtml(device) {
  return `
    <div class="stepper" role="group" aria-label="موجودی ${escapeHtml(device.name)}">
      <button class="stepper__btn" type="button" data-action="stock-dec" data-device-id="${escapeHtml(device.id)}" aria-label="کاهش موجودی">
        ${icon('remove', { size: 15 })}
      </button>
      <input class="stepper__input" type="number" inputmode="numeric" min="0" max="9999" step="1"
             value="${device.stock}" data-action="stock-input" data-device-id="${escapeHtml(device.id)}"
             aria-label="تعداد موجودی ${escapeHtml(device.name)}" aria-valuenow="${device.stock}">
      <button class="stepper__btn" type="button" data-action="stock-inc" data-device-id="${escapeHtml(device.id)}" aria-label="افزایش موجودی">
        ${icon('add', { size: 15 })}
      </button>
    </div>
  `;
}

function priceHtml(device) {
  if (!state.data.settings.showPrices) return '<b>استعلام قیمت</b><small>تماس بگیرید</small>';
  if (device.priceOnRequest || !device.price) return '<b>استعلام قیمت</b><small>تماس بگیرید</small>';
  return `<b>${num(device.price)}</b><small>${escapeHtml(currency())}</small>`;
}

function priceText(device) {
  if (!state.data.settings.showPrices) return 'استعلام';
  if (device.priceOnRequest || !device.price) return 'استعلام';
  return `${num(device.price)} ${escapeHtml(currency())}`;
}

export function stockBadgeHtml(device) {
  const stateKey = stockState(device, state.data.settings);
  const exact = state.data.settings.showExactStock;
  const label = stateKey === 'out'
    ? 'ناموجود'
    : exact
      ? `${num(device.stock)} عدد`
      : (stateKey === 'low' ? 'کمیاب' : 'موجود');
  const title = stateKey === 'out' ? 'موجود نیست' : `موجودی: ${num(device.stock)} عدد`;
  return `<span class="stock-badge" data-stock-badge="${escapeHtml(device.id)}" data-state="${stateKey}" title="${escapeHtml(title)}">
    <span class="stock-badge__dot" aria-hidden="true"></span>${label}
  </span>`;
}

function emptyStateHtml(nothingAtAll) {
  if (nothingAtAll) {
    return `
      <div class="empty">
        <span class="empty__icon">${icon('inventory_2', { size: 30 })}</span>
        <div class="empty__title">لیست موجودی هنوز خالی است</div>
        <div class="empty__desc">
          ${isAdmin()
            ? 'اولین دستگاه را اضافه کنید تا لیست شما روی سایت منتشر شود.'
            : 'فروشنده هنوز دستگاهی ثبت نکرده است. کمی بعد دوباره سر بزنید.'}
        </div>
        ${isAdmin() ? `<div class="empty__actions">
          <button class="btn btn--filled btn--sm" type="button" data-action="add-device">${icon('add', { size: 17 })} افزودن دستگاه</button>
          <button class="btn btn--outlined btn--sm" type="button" data-action="add-category">${icon('category', { size: 17 })} ساخت دسته</button>
        </div>` : ''}
      </div>`;
  }
  return `
    <div class="empty">
      <span class="empty__icon">${icon('search_off', { size: 30 })}</span>
      <div class="empty__title">چیزی با این فیلتر پیدا نشد</div>
      <div class="empty__desc">جستجو یا فیلترها را تغییر دهید. شاید دستگاه در دسته دیگری باشد.</div>
      <div class="empty__actions">
        <button class="btn btn--outlined btn--sm" type="button" data-action="clear-filters">${icon('refresh', { size: 17 })} پاک کردن فیلترها</button>
      </div>
    </div>`;
}

/* ── Atomic patches (avoid re-rendering while the admin taps +/-) ───────── */

export function patchDeviceStock(deviceId) {
  const device = state.data?.devices.find((d) => d.id === deviceId);
  if (!device) return;
  document.querySelectorAll(`[data-stock-badge="${CSS.escape(deviceId)}"]`).forEach((el) => {
    el.outerHTML = stockBadgeHtml(device);
  });
  document.querySelectorAll(`.device[data-device-id="${CSS.escape(deviceId)}"]`).forEach((row) => {
    row.classList.toggle('device--oos', device.stock <= 0);
    const input = row.querySelector('.stepper__input');
    if (input && document.activeElement !== input) input.value = device.stock;
    if (input) input.setAttribute('aria-valuenow', device.stock);
  });
  const stat = document.querySelector('[data-stat="inStock"]');
  if (stat) stat.textContent = num(computeStats(state.data, { includeHidden: isAdmin() }).inStock);
  renderGroupMeta();
}

function renderGroupMeta() {
  if (!state.data) return;
  const counts = countByCategory(state.data, { includeHidden: isAdmin() });
  document.querySelectorAll('[data-group-meta]').forEach((el) => {
    const key = el.dataset.groupMeta;
    const devices = visibleDevices(state.data, { includeHidden: isAdmin() })
      .filter((d) => (d.categoryId || '__none__') === key);
    if (!devices.length && !counts.get(key)) return;
    const inStock = devices.filter((d) => d.stock > 0).length;
    const hiddenCount = devices.filter((d) => d.hidden).length;
    const bits = [`${num(devices.length)} دستگاه`, `${num(inStock)} موجود`];
    if (isAdmin() && hiddenCount) bits.push(`${num(hiddenCount)} پنهان`);
    el.textContent = bits.join(' · ');
  });
}

export function patchAfterListMutation() {
  renderStats({ animate: false });
  renderUpdateCard();
  renderFilters();
  renderList();
  renderFooter();
}

/* ── Full render ────────────────────────────────────────────────────────── */

export function renderAll({ animateStats = true } = {}) {
  if (!state.data) return;
  hydrateIcons();
  renderHeader();
  renderBranding();
  renderStats({ animate: animateStats });
  renderUpdateCard();
  renderFeatured();
  renderFilters();
  renderList();
  renderPrintMeta();
  document.documentElement.dataset.ready = 'true';
}

/* ── Public sheets ──────────────────────────────────────────────────────── */

export function openDeviceDetail(deviceId) {
  const device = state.data?.devices.find((d) => d.id === deviceId);
  if (!device) return;
  const cat = getCategory(state.data, device.categoryId);
  const stock = stockState(device, state.data.settings);
  const fields = (cat?.fields || []).filter((f) => specText(f, device));
  const admin = isAdmin();
  const shareUrl = `${location.origin}${location.pathname}#device-${device.id}`;
  const specs = [
    ['دسته‌بندی', cat?.title || 'سایر'],
    ['برند', device.brand],
    ['وضعیت', device.condition],
    ['گارانتی', device.warranty],
    ...fields.map((f) => [f.label, specText(f, device)])
  ].filter(([, v]) => v);

  const sheet = openSheet({
    title: device.name,
    subtitle: [device.brand, cat?.title].filter(Boolean).join(' · '),
    size: 'narrow',
    body: `
      <div class="stack" style="gap:16px">
        <div class="detail__media">
          ${device.image ? `<img src="${escapeHtml(safeUrl(device.image))}" alt="${escapeHtml(device.name)}" style="width:100%;height:100%;object-fit:cover;position:relative;z-index:1">` : icon(cat?.icon || 'devices_other', { size: 62 })}
        </div>
        <div class="detail__headline">
          <div class="detail__price-row">
            <span class="detail__price">${priceText(device)}</span>
            ${stockBadgeHtml(device)}
            ${device.featured ? `<span class="badge badge--outline">${icon('star', { size: 12 })} پیشنهاد فروشگاه</span>` : ''}
          </div>
          ${device.note ? `<p class="t-sm" style="color:var(--text-2);line-height:1.9">${escapeHtml(device.note)}</p>` : ''}
        </div>
        <div class="spec-table" role="table" aria-label="مشخصات ${escapeHtml(device.name)}">
          ${specs.map(([k, v]) => `<div class="spec-table__row" role="row"><span class="k" role="cell">${escapeHtml(k)}</span><span class="v" role="cell">${escapeHtml(v)}</span></div>`).join('')}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn--filled btn--sm" type="button" data-action="call-store">${icon('call', { size: 17 })} تماس برای خرید</button>
          <button class="btn btn--outlined btn--sm" type="button" data-copy-link="${escapeHtml(shareUrl)}">${icon('link', { size: 17 })} کپی لینک</button>
          ${admin ? `<button class="btn btn--tonal btn--sm" type="button" data-edit-device="${escapeHtml(device.id)}">${icon('edit', { size: 17 })} ویرایش</button>` : ''}
        </div>
        <p class="t-xs t-muted" style="line-height:1.9">
          آخرین تغییر این دستگاه: ${formatJalaliDateTime(device.updatedAt)}
          ${stock === 'out' ? ' · همین حالا ناموجود است' : ''}
        </p>
      </div>
    `
  });
  sheet.el.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="call-store"]')) {
      const phone = state.data.store.phone;
      if (phone) location.href = telHref(phone);
      else toast('شماره تماس ثبت نشده است', { type: 'warn' });
    }
    const copy = event.target.closest('[data-copy-link]');
    if (copy) copyWithToast(copy.dataset.copyLink, 'لینک دستگاه کپی شد');
    const edit = event.target.closest('[data-edit-device]');
    if (edit) {
      sheet.close();
      document.dispatchEvent(new CustomEvent('ol:edit-device', { detail: { id: edit.dataset.editDevice } }));
    }
  });
}

export function openHistory() {
  if (!state.data) return;
  const history = [...(state.data.meta.history || [])];
  if (!history.length) {
    history.push({
      id: 'seed',
      at: state.data.meta.updatedAt,
      by: state.data.meta.updatedBy,
      action: 'seed',
      summary: 'راه‌اندازی اولیه لیست موجودی'
    });
  }
  const items = history.slice(0, 30);
  openSheet({
    title: 'تاریخچه به‌روزرسانی',
    subtitle: 'هر انتشار، با تاریخ و ساعت ثبت می‌شود',
    size: 'narrow',
    body: `
      <div class="timeline">
        ${items.map((entry, i) => `
          <div class="timeline__item">
            <div class="timeline__row">
              <span class="timeline__action">${i === 0 ? 'آخرین به‌روزرسانی' : escapeHtml(actionLabel(entry.action))}</span>
              <span class="timeline__date">${formatJalaliDateTime(entry.at)}</span>
            </div>
            <div class="timeline__desc">${escapeHtml(entry.summary || 'به‌روزرسانی لیست')}</div>
            <div class="timeline__by">توسط ${escapeHtml(entry.by || 'مدیر فروشگاه')}
              ${entry.stats ? ` · ${num(entry.stats.added || 0)} جدید، ${num(entry.stats.updated || 0)} ویرایش، ${num(entry.stats.removed || 0)} حذف` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="form-note" style="margin-top:8px">
        ${icon('info', { size: 18 })}
        <span>این تاریخچه همراه فایل داده منتشر می‌شود؛ تغییرات همیشه قابل پیگیری است.</span>
      </div>
    `
  });
}

function actionLabel(action) {
  return ({
    publish: 'انتشار تغییرات',
    seed: 'راه‌اندازی اولیه',
    import: 'بازیابی نسخه پشتیبان'
  })[action] || 'به‌روزرسانی';
}

export function openShareSheet() {
  const url = location.href.split('#')[0];
  openSheet({
    title: 'اشتراک‌گذاری لیست',
    subtitle: 'لینک این صفحه را برای مشتری بفرستید',
    size: 'narrow',
    body: `
      <div class="stack" style="gap:12px">
        <p class="t-sm" style="color:var(--text-2);line-height:1.9">با اشتراک‌گذاری این لینک، مشتری همیشه آخرین نسخه موجودی را می‌بیند.</p>
        <div class="code-block">${escapeHtml(url)}<button class="icon-btn" type="button" data-copy-link="${escapeHtml(url)}" aria-label="کپی">${icon('content_copy', { size: 16 })}</button></div>
        ${navigator.share ? `<button class="btn btn--filled btn--sm" type="button" data-native-share>${icon('share', { size: 17 })} اشتراک‌گذاری با اپلیکیشن‌ها</button>` : ''}
      </div>
    `,
    onMount: (sheet) => {
      sheet.el.addEventListener('click', async (event) => {
        const copy = event.target.closest('[data-copy-link]');
        if (copy) copyWithToast(copy.dataset.copyLink, 'لینک کپی شد');
        if (event.target.closest('[data-native-share]')) {
          try {
            await navigator.share({ title: state.data.store.name, text: 'لیست موجودی', url });
          } catch { /* cancelled */ }
        }
      });
    }
  });
}

