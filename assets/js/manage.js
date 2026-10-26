/* ==========================================================================
   پنل مدیریت — یک صفحهٔ کامل (نه پنجرهٔ شناور) برای مدیریت کالاها و موجودی
   --------------------------------------------------------------------------
   چرا یک صفحه؟ ویرایش روی خودِ لیست عمومی هر تغییر را به رندر دوبارهٔ کل صفحه
   گره می‌زد و روی گوشی کند بود. این‌جا یک صفحهٔ مستقل باز می‌شود که هدر، فهرست
   و نوار پایینِ خودش را دارد و فقط با «بازگشت» بسته می‌شود؛ هیچ قفل اسکرول یا
   لایهٔ شناوری روی صفحهٔ اصلی نمی‌نشیند. تغییرات هم فقط با «اعمال تغییرات» و
   تأیید صریح مدیر روی سایت می‌نشیند.
   ========================================================================== */

import { categoryTitle, computeDiff, computeStats, getCategory } from './model.js';
import {
  currentNumerals, isAdmin, isDemo, mutateQuiet, refreshDirty, state, subscribe
} from './state.js';
import { openMenu, toast } from './ui.js';
import { clamp, escapeHtml, formatNum, parseNumber } from './util.js';
import { icon } from './icons.js';
import { hydrateIcons, patchDeviceStock, renderGroupMeta, renderStats, renderUpdateCard } from './render.js';

const STATUS_LABELS = { all: 'همه', in: 'موجود', low: 'کم‌موجود', out: 'ناموجود' };

let page = null;
let unsubscribe = null;

/** True while the management page is on screen (used to skip list re-renders). */
export function isManagePanelOpen() {
  return !!page && !page.el.hidden;
}

/**
 * Opens the management page.
 * `api` is supplied by admin.js so this module never imports the editor itself.
 */
export function openManagePanel(api = {}) {
  if (!isAdmin() || !state.data) return null;
  if (!page) {
    const el = buildPage();
    page = { el, api, view: { q: '', status: 'all', cat: 'all' }, confirmApply: false, savedScroll: 0, pushed: false };
    mount(el);
  }
  page.api = api;
  show();
  return page;
}

/* ── Mount / unmount ────────────────────────────────────────────────────── */

function show() {
  if (!page) return;
  if (page.el.hidden) {
    page.savedScroll = window.scrollY;
    page.el.hidden = false;
    document.body.classList.add('is-manage-page');
    // Keep the browser's own scroll restoration out of the way while the page
    // is on screen; the panel restores the list position when it closes.
    try { history.scrollRestoration = 'manual'; } catch { /* older browsers */ }
    try {
      history.pushState({ ...(history.state || {}), olManage: true }, '', location.href);
      page.pushed = true;
    } catch { page.pushed = false; }
    window.scrollTo(0, 0);
  }
  page.paintAll?.();
  if (!unsubscribe) {
    unsubscribe = subscribe((reason) => {
      if (!page || page.el.hidden) return;
      if (reason === 'auth' && !isAdmin()) { closeManagePanel(); return; }
      if (reason === 'data' || reason === 'auth' || reason === 'published') page.paintAll?.();
      if (reason === 'published') {
        page.confirmApply = false;
        page.paintApply?.();
      }
    });
  }
  document.dispatchEvent(new CustomEvent('ol:manage-state', { detail: { open: true } }));
  // Move focus into the page for keyboard and screen-reader users. Focusing the
  // search input here popped the soft keyboard on every phone open, so the
  // page itself takes the focus instead.
  page.el.focus({ preventScroll: true });
}

/** Closes the page and hands the screen back to the public list. */
export function closeManagePanel({ fromHistory = false } = {}) {
  if (!page || page.el.hidden) return;
  // The panel pushed one history entry when it opened, so the browser Back
  // button (or a phone's back gesture) pops it and lands back on the list
  // instead of leaving the site.
  if (!fromHistory && page.pushed && history.state && history.state.olManage) {
    page.pushed = false;
    try { history.back(); return; } catch { /* fall through to a plain close */ }
  }
  finishClose();
}

function finishClose() {
  if (!page || page.el.hidden) return;
  // Leaving the page with a sheet still open would strand the dialog over the
  // shop (and keep its scroll lock on).
  document.querySelectorAll('dialog.sheet[open]').forEach((d) => { try { d.close(); } catch { /* ignore */ } });
  page.el.hidden = true;
  page.pushed = false;
  page.confirmApply = false;
  document.body.classList.remove('is-manage-page');
  try { history.scrollRestoration = 'auto'; } catch { /* ignore */ }
  const previous = page.savedScroll;
  window.scrollTo(0, previous);
  requestAnimationFrame(() => { if (page?.el.hidden) window.scrollTo(0, previous); });
  document.getElementById('loginBtn')?.focus({ preventScroll: true });
  document.dispatchEvent(new CustomEvent('ol:manage-state', { detail: { open: false } }));
}

function mount(el) {
  const list = el.querySelector('[data-mp-list]');
  const note = el.querySelector('[data-mp-note]');
  const catSelect = el.querySelector('[data-mp-cat]');
  const search = el.querySelector('[data-mp-search]');
  const applyHost = el.querySelector('[data-mp-applyhost]');

  const api = () => page?.api || {};

  /* ── header + footer chrome ─────────────────────────────────────────── */
  el.querySelector('[data-mp-back]').addEventListener('click', closeManagePanel);

  el.querySelector('[data-mp-settings]').addEventListener('click', () => api().settings?.());
  el.querySelector('[data-mp-more]').addEventListener('click', (event) => openMoreMenu(event.currentTarget));

  el.querySelector('[data-mp-add]').addEventListener('click', () => {
    api().add?.(page.view.cat !== 'all' ? page.view.cat : '');
  });
  el.querySelector('[data-mp-cat-add]').addEventListener('click', () => api().addCategory?.());
  el.querySelector('[data-mp-apply]').addEventListener('click', () => {
    page.confirmApply = true;
    paintApply();
    el.querySelector('[data-mp-applybox]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  /* ── filters ────────────────────────────────────────────────────────── */
  search.addEventListener('input', () => {
    page.view.q = search.value.trim().toLowerCase();
    paintRows({ keepFocus: true });
  });
  catSelect.addEventListener('change', () => {
    page.view.cat = catSelect.value;
    paintRows();
  });
  el.querySelectorAll('[data-mp-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      page.view.status = btn.dataset.mpStatus;
      el.querySelectorAll('[data-mp-status]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      paintRows();
    });
  });

  /* ── rows: one delegated listener for the whole list ────────────────── */
  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-mp-act]');
    const row = event.target.closest('[data-mp-row]');
    if (!row) return;
    const id = row.dataset.id;
    const device = state.data.devices.find((d) => d.id === id);
    if (!device) return;

    // Clicking anywhere on the row (outside the controls) opens the editor.
    if (!btn) {
      if (event.target.closest('input, button, a, label')) return;
      api().edit?.(id);
      return;
    }
    if (btn.dataset.mpAct === 'inc') { setStock(id, device.stock + 1); return; }
    if (btn.dataset.mpAct === 'dec') { setStock(id, device.stock - 1); return; }
    if (btn.dataset.mpAct === 'edit') { api().edit?.(id); return; }
    if (btn.dataset.mpAct === 'delete') { paintRowConfirm(row); return; }
    if (btn.dataset.mpAct === 'delete-yes') { await removeDevice(id, device); return; }
    if (btn.dataset.mpAct === 'delete-no') { paintRows({ keepScroll: true }); return; }
    if (btn.dataset.mpAct === 'hide') { toggleFlag(id, 'hidden'); return; }
  });

  list.addEventListener('change', (event) => {
    const input = event.target.closest('[data-mp-act="input"]');
    if (!input) return;
    const row = input.closest('[data-mp-row]');
    const device = state.data.devices.find((d) => d.id === row?.dataset.id);
    if (!device) return;
    const value = parseNumber(input.value);
    // An emptied box (or Persian digits typed into a number input, which the
    // browser drops) must restore the old stock — not silently zero it.
    if (!input.value.trim() || !Number.isFinite(value)) {
      input.value = String(device.stock);
      input.classList.add('is-invalid');
      setTimeout(() => input.classList.remove('is-invalid'), 900);
      return;
    }
    input.classList.remove('is-invalid');
    setStock(row.dataset.id, value);
  });

  /* ── apply (the admin's confirmation lives here) ────────────────────── */
  el.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-mp-apply-act]')?.dataset.mpApplyAct;
    if (!act) return;
    if (act === 'cancel') { page.confirmApply = false; paintApply(); return; }
    if (act !== 'confirm') return;
    const box = el.querySelector('[data-mp-applybox]');
    const button = event.target.closest('[data-mp-apply-act="confirm"]');
    const message = box?.querySelector('[data-mp-message]')?.value.trim();
    if (button) { button.disabled = true; button.dataset.busy = '1'; }
    const ok = await api().apply?.(message);
    if (button) { button.disabled = false; delete button.dataset.busy; }
    // A failed publish keeps the confirmation open with the message intact so
    // the admin can simply try again.
    page.confirmApply = !ok;
    if (ok) paintAll(); else paintApply();
  });

  /* Ctrl/⌘ + S asks for the same confirmation panel instead of publishing. */
  document.addEventListener('ol:apply-request', () => {
    if (!page || page.el.hidden) return;
    page.confirmApply = true;
    paintApply();
    el.querySelector('[data-mp-applybox]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  window.addEventListener('popstate', () => {
    if (!page || page.el.hidden) return;
    if (!(history.state && history.state.olManage)) closeManagePanel({ fromHistory: true });
  });

  document.addEventListener('keydown', (event) => {
    if (!page || page.el.hidden) return;
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (!typing && (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))) {
      event.preventDefault();
      search.focus();
      return;
    }
    if (event.key !== 'Escape') return;
    if (event.defaultPrevented || document.querySelector('.menu')) return;
    if (document.querySelector('dialog[open]')) return;
    // A half-finished “really delete?” row is dismissed before the box is.
    if (list.querySelector('[data-ask]')) { paintRows({ keepScroll: true }); return; }
    if (el.querySelector('[data-mp-applybox]')) {
      page.confirmApply = false;
      paintApply();
    }
  });

  /* ── stock ──────────────────────────────────────────────────────────── */
  function setStock(id, raw) {
    const device = state.data.devices.find((d) => d.id === id);
    if (!device) return;
    const next = clamp(Math.round(Number(raw)), 0, 9999);
    if (!Number.isFinite(next) || next === device.stock) return;
    mutateQuiet((draft) => {
      const target = draft.devices.find((d) => d.id === id);
      if (!target) return;
      target.stock = next;
      target.updatedAt = new Date().toISOString();
    });
    const row = list.querySelector(`[data-mp-row][data-id="${cssEscape(id)}"]`);
    if (row) {
      const input = row.querySelector('[data-mp-act="input"]');
      // Also write back into the field the admin is typing in: 99999 clamps to
      // 9999 and the box used to keep showing the number that was refused.
      if (input) input.value = String(next);
      row.dataset.stock = stockStateKey(next);
      row.classList.toggle('is-oos', next <= 0);
      const badge = row.querySelector('[data-mp-badge]');
      if (badge) {
        badge.textContent = stockLabel(next);
        badge.classList.remove('mp-badge--ok', 'mp-badge--low', 'mp-badge--out');
        badge.classList.add(`mp-badge--${stockStateKey(next)}`);
      }
    }
    // Keep the public list (behind the page) and the summary in sync without
    // re-rendering either of them.
    patchDeviceStock(id);
    renderGroupMeta();
    renderStats({ animate: false });
    renderUpdateCard();
    paintSummary();
    paintPending();
    if (navigator.vibrate) navigator.vibrate(6);
  }

  async function removeDevice(id, device) {
    mutateQuiet((draft) => {
      draft.devices = draft.devices.filter((d) => d.id !== id);
    });
    toast(`«${device.name}» حذف شد؛ با «اعمال تغییرات» روی سایت می‌نشیند.`, { type: 'ok' });
    paintAll();
  }

  function toggleFlag(id, flag) {
    mutateQuiet((draft) => {
      const target = draft.devices.find((d) => d.id === id);
      if (!target) return;
      target[flag] = !target[flag];
      target.updatedAt = new Date().toISOString();
    });
    paintRows({ keepScroll: true });
  }

  /* ── painting helpers ───────────────────────────────────────────────── */
  function storeCurrency() {
    return state.data?.settings?.currency || 'تومان';
  }

  function lowThreshold() {
    return state.data?.settings?.lowStockThreshold ?? 2;
  }

  function stockStateKey(stock) {
    if (stock <= 0) return 'out';
    return stock <= lowThreshold() ? 'low' : 'ok';
  }

  function stockLabel(stock) {
    const n = formatNum(stock, currentNumerals());
    if (stock <= 0) return 'ناموجود';
    if (stock <= lowThreshold()) return `${n} — کم`;
    return `${n} موجود`;
  }

  function matchDevice(device) {
    if (page.view.cat !== 'all' && (device.categoryId || '') !== page.view.cat) return false;
    if (page.view.status === 'in' && device.stock <= 0) return false;
    if (page.view.status === 'out' && device.stock > 0) return false;
    if (page.view.status === 'low') {
      if (!(device.stock > 0 && device.stock <= lowThreshold())) return false;
    }
    if (!page.view.q) return true;
    const haystack = `${device.name} ${device.brand || ''} ${categoryTitle(state.data, device.categoryId)}`.toLowerCase();
    return haystack.includes(page.view.q);
  }

  function rowHtml(device) {
    const category = getCategory(state.data, device.categoryId);
    const stockKey = stockStateKey(device.stock);
    const price = device.priceOnRequest || !device.price
      ? '<span class="mp-row__price">استعلام</span>'
      : `<span class="mp-row__price">${formatNum(device.price, currentNumerals())} <small>${escapeHtml(storeCurrency())}</small></span>`;
    const flags = [
      device.featured ? `<span class="mp-badge mp-badge--star">${icon('star', { size: 11 })} ویژه</span>` : '',
      device.hidden ? `<span class="mp-badge mp-badge--low">${icon('visibility_off', { size: 11 })} پنهان</span>` : ''
    ].join('');
    return `
      <div class="mp-row ${stockKey === 'out' ? 'is-oos' : ''}" data-mp-row data-id="${escapeHtml(device.id)}" data-stock="${stockKey}">
        <span class="mp-row__thumb" data-stock="${stockKey}" aria-hidden="true">${icon(category?.icon || 'devices_other', { size: 20 })}</span>
        <div class="mp-row__main">
          <div class="mp-row__title">
            <span class="mp-row__name">${escapeHtml(device.name)}</span>${flags}
          </div>
          <div class="mp-row__sub">
            <span class="mp-row__meta">${escapeHtml(device.brand || 'بدون برند')}<span class="mp-row__cat"> · ${escapeHtml(category?.title || 'بدون دسته')}</span></span>
            ${price}
          </div>
        </div>
        <span class="mp-badge mp-badge--${stockKey}" data-mp-badge>${stockLabel(device.stock)}</span>
        <div class="mp-stepper" role="group" aria-label="موجودی ${escapeHtml(device.name)}">
          <button type="button" class="mp-stepper__btn mp-stepper__btn--dec" data-mp-act="dec" aria-label="کاهش موجودی">${icon('remove', { size: 15 })}</button>
          <input class="mp-stepper__input" type="number" inputmode="numeric" min="0" max="9999" step="1"
                 value="${device.stock}" data-mp-act="input" aria-label="تعداد موجودی">
          <button type="button" class="mp-stepper__btn mp-stepper__btn--inc" data-mp-act="inc" aria-label="افزایش موجودی">${icon('add', { size: 15 })}</button>
        </div>
        <div class="mp-row__actions">
          <button type="button" class="icon-btn mp-row__edit" data-mp-act="edit" aria-label="ویرایش ${escapeHtml(device.name)}" data-tip="ویرایش">${icon('edit', { size: 17 })}</button>
          <button type="button" class="icon-btn ${device.hidden ? 'mp-row__hidden-on' : 'mp-row__hide'}" data-mp-act="hide" aria-label="${device.hidden ? 'نمایش در سایت' : 'پنهان کردن در سایت'}" data-tip="${device.hidden ? 'نمایش' : 'پنهان'}">${icon(device.hidden ? 'visibility' : 'visibility_off', { size: 17 })}</button>
          <button type="button" class="icon-btn mp-row__danger" data-mp-act="delete" aria-label="حذف ${escapeHtml(device.name)}" data-tip="حذف">${icon('delete', { size: 17 })}</button>
        </div>
      </div>`;
  }

  function paintRows({ keepScroll = false, keepFocus = false } = {}) {
    const top = list.scrollTop;
    const rows = state.data.devices.filter(matchDevice);
    list.innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : `<div class="mp-empty">
           ${icon('inventory_2', { size: 26 })}
           <b>${page.view.q || page.view.status !== 'all' || page.view.cat !== 'all' ? 'با این فیلتر کالایی نیست' : 'هنوز کالایی ثبت نشده'}</b>
           <span>${page.view.q || page.view.status !== 'all' || page.view.cat !== 'all' ? 'فیلترها را پاک کنید.' : 'با «افزودن کالا» اولین دستگاه را ثبت کنید.'}</span>
         </div>`;
    if (keepScroll) list.scrollTop = top;
    if (keepFocus) search.focus({ preventScroll: true });
    paintSummary();
    paintPending();
    paintApply();
  }

  function paintRowConfirm(row) {
    const actions = row.querySelector('.mp-row__actions');
    if (!actions) return;
    actions.innerHTML = `
      <span class="mp-row__ask">حذف شود؟</span>
      <button type="button" class="btn btn--sm btn--danger" data-mp-act="delete-yes">بله، حذف</button>
      <button type="button" class="icon-btn" data-mp-act="delete-no" aria-label="انصراف">${icon('close', { size: 18 })}</button>
    `;
    actions.setAttribute('data-ask', '1');
    actions.querySelector('[data-mp-act="delete-yes"]')?.focus({ preventScroll: true });
    hydrateIcons(actions);
  }

  function paintCategoryOptions() {
    const cats = state.data.categories
      .map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.title)}</option>`)
      .join('');
    catSelect.innerHTML = `<option value="all">همهٔ دسته‌ها</option>${cats}`;
    if (!state.data.categories.some((c) => c.id === page.view.cat)) page.view.cat = 'all';
    catSelect.value = page.view.cat;
  }

  function paintChrome() {
    const sub = el.querySelector('[data-mp-sub]');
    if (sub) sub.textContent = manageSubtitle();
    const sync = el.querySelector('[data-mp-sync]');
    const clean = !state.dirty;
    const demo = isDemo();
    if (sync) {
      const diff = clean ? null : computeDiff(state.baseline, state.data);
      const count = diff?.total || 0;
      sync.dataset.state = demo ? 'demo' : clean ? 'ok' : 'pending';
      sync.querySelector('.label').textContent = demo
        ? 'حالت پیش‌نمایش'
        : clean ? 'همگام با مخزن' : `${formatNum(count || 1, currentNumerals())} تغییر در انتظار تأیید`;
      const short = sync.querySelector('.label-short');
      if (short) {
        short.textContent = demo ? 'پیش‌نمایش' : clean ? 'همگام' : `${formatNum(count || 1, currentNumerals())} تغییر`;
      }
      sync.title = demo
        ? 'در پیش‌نمایش چیزی روی مخزن نوشته نمی‌شود.'
        : clean ? 'همه‌چیز روی مخزن به‌روز است.' : 'تا «اعمال تغییرات» را نزنید، سایت نسخهٔ قبلی را نشان می‌دهد.';
    }
  }

  function paintSummary() {
    const stats = computeStats(state.data, { includeHidden: true });
    // Patch the segmented labels in place: rebuilding them would drop focus.
    const counts = { all: stats.devices, in: stats.inStock, low: stats.low, out: stats.out };
    el.querySelectorAll('[data-mp-status]').forEach((btn) => {
      const key = btn.dataset.mpStatus;
      const label = STATUS_LABELS[key] || key;
      const count = formatNum(counts[key] ?? 0, currentNumerals());
      const html = `${label} <b class="mp__seg-count">${count}</b>`;
      if (btn.dataset.rendered !== html) {
        btn.innerHTML = html;
        btn.dataset.rendered = html;
      }
      btn.classList.toggle('is-empty', !counts[key]);
    });
    const host = el.querySelector('[data-mp-summary]');
    if (!host) return;
    host.innerHTML = `
      <div class="mp-stat">
        <span class="mp-stat__icon">${icon('inventory_2', { size: 16 })}</span>
        <b>${formatNum(stats.devices, currentNumerals())}</b><span>کالا</span>
      </div>
      <div class="mp-stat mp-stat--ok">
        <span class="mp-stat__icon">${icon('check_circle', { size: 16 })}</span>
        <b>${formatNum(stats.units, currentNumerals())}</b><span>واحد موجود</span>
      </div>
      <div class="mp-stat ${stats.out ? 'mp-stat--danger' : ''}">
        <span class="mp-stat__icon">${icon('cancel', { size: 16 })}</span>
        <b>${formatNum(stats.out, currentNumerals())}</b><span>ناموجود</span>
      </div>
      <div class="mp-stat mp-stat--low">
        <span class="mp-stat__icon">${icon('category', { size: 16 })}</span>
        <b>${formatNum(stats.categoriesTotal, currentNumerals())}</b><span>دسته</span>
      </div>
    `;
  }

  function paintPending() {
    refreshDirty();
    const host = el.querySelector('[data-mp-pending]');
    const diff = state.dirty ? computeDiff(state.baseline, state.data) : null;
    const total = diff?.total || 0;
    if (host) {
      host.innerHTML = state.dirty
        ? `<span class="mp__pending-dot" aria-hidden="true"></span>${formatNum(total || 1, currentNumerals())} تغییر در انتظار تأیید`
        : 'همه‌چیز مطابق سایت است';
      host.classList.toggle('is-dirty', !!state.dirty);
    }
    if (note) {
      note.hidden = !state.dirty;
      note.innerHTML = state.dirty
        ? `${icon('info', { size: 18 })}<span>تغییرات فعلاً فقط روی همین صفحه است. برای دیدن روی سایت، «اعمال تغییرات» را بزنید و تأیید کنید.</span>`
        : '';
    }
    const applyBtn = el.querySelector('[data-mp-apply]');
    if (applyBtn) applyBtn.disabled = !state.dirty || isDemo();
    paintChrome();
  }

  function paintApply() {
    const existing = applyHost.querySelector('[data-mp-applybox]');
    const applyBtn = el.querySelector('[data-mp-apply]');
    // Nothing staged (discarded, reset, or just published) → nothing to confirm.
    if (!state.dirty) page.confirmApply = false;
    if (!page.confirmApply) {
      existing?.remove();
      applyBtn?.removeAttribute('data-open');
      return;
    }
    applyBtn?.setAttribute('data-open', '1');
    // Focus is only moved when the box is created: re-focusing on every repaint
    // stole the caret from the search field while the box was open.
    if (existing) return;
    const diff = computeDiff(state.baseline, state.data);
    const names = [
      ...diff.added.map((d) => `+ ${d.name}`),
      ...diff.updated.map((d) => `~ ${d.name}`),
      ...diff.removed.map((d) => `− ${d.name}`),
      ...diff.catAdded.map((c) => `+ دسته: ${c.title}`),
      ...diff.catUpdated.map((c) => `~ دسته: ${c.title}`),
      ...diff.catRemoved.map((c) => `− دسته: ${c.title}`),
      ...(diff.storeChanged ? ['~ اطلاعات فروشگاه'] : []),
      ...(diff.settingsChanged ? ['~ تنظیمات نمایش'] : [])
    ];
    const touched = names.length;
    const demo = isDemo();
    const block = document.createElement('div');
    block.className = 'mp-apply';
    block.setAttribute('data-mp-applybox', '');
    block.innerHTML = `
      <div class="mp-apply__head">
        <span class="mp-apply__icon">${icon('cloud_upload', { size: 20 })}</span>
        <div>
          <b>${demo ? 'در پیش‌نمایش امکان انتشار نیست' : 'اعمال تغییرات روی سایت؟'}</b>
          <span>${demo
            ? 'این حالت توکن ندارد؛ فقط ظاهر پنل را می‌بینید.'
            : `${formatNum(diff.total, currentNumerals())} تغییر در ${formatNum(touched, currentNumerals())} مورد. با تأیید، فایل مخزن به‌روز می‌شود.`}</span>
        </div>
      </div>
      ${names.length ? `<ul class="mp-apply__list">${names.slice(0, 6).map((n) => `<li>${escapeHtml(n)}</li>`).join('')}${names.length > 6 ? `<li>و ${formatNum(names.length - 6, currentNumerals())} مورد دیگر…</li>` : ''}</ul>` : ''}
      <label class="field" style="gap:6px">
        <span class="field__label">پیام کامیت</span>
        <input class="input" data-mp-message dir="auto" value="${escapeHtml(defaultCommitMessage())}" maxlength="160">
      </label>
      <div class="mp-apply__actions">
        <button type="button" class="btn btn--text btn--sm" data-mp-apply-act="cancel">انصراف</button>
        <button type="button" class="btn btn--ok btn--sm" data-mp-apply-act="confirm" ${demo ? 'disabled' : ''}>
          ${icon('check', { size: 17 })} تأیید و انتشار
        </button>
      </div>
    `;
    applyHost.append(block);
    hydrateIcons(block);
    // On a phone, focusing the commit message raises the keyboard and covers
    // the confirm button; the box itself takes the focus there (screen readers
    // land on the confirmation, the buttons stay one Tab away).
    const fine = window.matchMedia?.('(pointer: fine)').matches;
    if (fine) block.querySelector('[data-mp-message]')?.focus({ preventScroll: true });
    else { block.tabIndex = -1; block.focus({ preventScroll: true }); }
  }

  function paintAll() {
    if (!page || page.el.hidden) return;
    paintCategoryOptions();
    paintRows();
    paintPending();
    paintApply();
  }

  page.paintAll = paintAll;
  page.paintApply = paintApply;

  /* ── more menu (everything the old bottom bar used to hold) ─────────── */
  function openMoreMenu(anchor) {
    const items = [
      { label: 'دسته‌بندی جدید', icon: 'category', onSelect: () => api().addCategory?.() },
      { label: 'تنظیمات فروشگاه', icon: 'settings', onSelect: () => api().settings?.() },
      { label: 'رمز و توکن', icon: 'key', onSelect: () => api().security?.() },
      { label: 'نسخهٔ پشتیبان', icon: 'download', onSelect: () => api().backup?.() },
      { label: 'تاریخچهٔ به‌روزرسانی', icon: 'history', onSelect: () => api().history?.() },
      { label: 'راهنمای مدیر', icon: 'help', onSelect: () => api().help?.() }
    ];
    if (state.dirty) {
      items.push({ separator: true });
      items.push({ label: 'بازگردانی تغییرات', icon: 'replay', onSelect: () => api().discard?.() });
    }
    items.push({ separator: true });
    items.push({ label: 'بازنشانی لیست', icon: 'delete', danger: true, onSelect: () => api().reset?.() });
    items.push({
      label: isDemo() ? 'خروج از پیش‌نمایش' : 'قفل کردن',
      icon: isDemo() ? 'logout' : 'lock',
      danger: true,
      onSelect: () => api().logout?.()
    });
    openMenu(anchor, items);
  }
}

/* ── Page skeleton ──────────────────────────────────────────────────────── */

function buildPage() {
  const host = document.getElementById('managePageHost');
  const el = document.createElement('section');
  el.className = 'mpage';
  el.id = 'managePage';
  el.hidden = true;
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', 'manageTitle');
  el.innerHTML = `
    <header class="mpage__bar">
      <div class="container mpage__bar-inner">
        <button class="mpage__back" type="button" data-mp-back aria-label="بازگشت به لیست" data-tip="بازگشت به لیست">
          ${icon('chevron_right', { size: 20 })}
        </button>
        <div class="mpage__titles">
          <h1 class="mpage__title" id="manageTitle">پنل مدیریت</h1>
          <p class="mpage__sub" data-mp-sub></p>
        </div>
        <span class="mpage__sync" data-mp-sync data-state="ok">
          <span class="mpage__sync-dot" aria-hidden="true"></span>
          <span class="label"></span>
          <span class="label-short"></span>
        </span>
        <div class="mpage__actions">
          <button class="icon-btn" type="button" data-mp-settings aria-label="تنظیمات فروشگاه" data-tip="تنظیمات">
            ${icon('settings', { size: 19 })}
          </button>
          <button class="icon-btn" type="button" data-mp-more aria-label="گزینه‌های بیشتر" aria-haspopup="menu" data-tip="بیشتر">
            ${icon('more_vert', { size: 19 })}
          </button>
        </div>
      </div>
    </header>

    <div class="container mpage__body">
      <div class="mp__summary" data-mp-summary></div>
      <div class="mp__toolbar">
        <label class="mp__search">
          ${icon('search', { size: 18 })}
          <input type="search" data-mp-search placeholder="جستجوی نام یا برند…" autocomplete="off" aria-label="جستجوی کالا">
        </label>
        <select class="select mp__cat" data-mp-cat aria-label="دسته‌بندی"></select>
        <div class="mp__seg" role="group" aria-label="وضعیت موجودی">
          ${Object.entries(STATUS_LABELS).map(([key, label]) => `
            <button type="button" class="mp__seg-btn ${key === 'all' ? 'is-active' : ''}" data-mp-status="${key}" aria-pressed="${key === 'all'}">${label}</button>
          `).join('')}
        </div>
      </div>
      <div class="mp__note" data-mp-note hidden></div>
      <div class="mp__list" data-mp-list></div>
      <div class="mp__applyhost" data-mp-applyhost></div>
    </div>

    <div class="mpage__foot">
      <div class="container mpage__foot-inner">
        <button class="btn btn--ok-soft btn--sm" type="button" data-mp-add>${icon('add', { size: 17 })} افزودن کالا</button>
        <button class="btn btn--text btn--sm" type="button" data-mp-cat-add aria-label="دسته‌بندی جدید" data-tip="دسته‌بندی جدید">${icon('category', { size: 17 })} <span class="label">دسته‌بندی</span></button>
        <span class="spacer"></span>
        <span class="mp__pending" data-mp-pending role="status" aria-live="polite"></span>
        <button class="btn btn--ok btn--sm" type="button" data-mp-apply disabled>${icon('cloud_upload', { size: 17 })} اعمال تغییرات</button>
      </div>
    </div>
  `;
  host.append(el);
  hydrateIcons(el);
  return el;
}

/* ── Small helpers ──────────────────────────────────────────────────────── */

function defaultCommitMessage() {
  const label = state.data?.settings?.storeName || state.data?.store?.name || 'لیست موجودی';
  const stamp = new Date().toLocaleString('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  return `به‌روزرسانی ${label} — ${stamp}`;
}

function manageSubtitle() {
  const settings = state.data?.settings || {};
  const name = settings.storeName || state.data?.store?.name || 'فروشگاه شما';
  return isDemo() ? `${name} · حالت پیش‌نمایش` : `${name} · مدیریت کالا و موجودی`;
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}
