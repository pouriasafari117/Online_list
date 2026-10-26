/* ==========================================================================
   پنل مدیریت — یک صفحهٔ کامل برای مدیریت کالاها و موجودی
   --------------------------------------------------------------------------
   چرا جدا از لیست عمومی؟ ویرایش روی خودِ لیست (استپر روی هر ردیف) هر تغییر را
   به یک رندر دوبارهٔ کل صفحه گره می‌زد؛ روی گوشی همین باعث کندی و «فریز» می‌شد.
   این پنل یک‌بار ساخته می‌شود و بعد از آن فقط همان ردیفی که عوض شده به‌روز
   می‌شود. هیچ تغییری هم بدون زدن «اعمال تغییرات» و تأیید، روی سایت نمی‌نشیند.
   ========================================================================== */

import { categoryTitle, computeDiff, computeStats, getCategory } from './model.js';
import {
  currentNumerals, isAdmin, isDemo, mutateQuiet, refreshDirty, state, subscribe
} from './state.js';
import { confirmDialog, openSheet, toast } from './ui.js';
import { clamp, escapeHtml, formatNum, parseNumber } from './util.js';
import { icon } from './icons.js';
import { hydrateIcons, patchDeviceStock, renderGroupMeta, renderStats, renderUpdateCard } from './render.js';

const STATUS_LABELS = { all: 'همه', in: 'موجود', low: 'کم‌موجود', out: 'ناموجود' };

let panel = null;
let unsubscribe = null;

/** True while the management panel is on screen (used to skip list re-renders). */
export function isManagePanelOpen() {
  return !!panel;
}

/**
 * Opens the full-screen management panel.
 * `api` is supplied by admin.js so this module never imports the editor itself.
 */
export function openManagePanel(api = {}) {
  if (panel) {
    panel.sheet.el.querySelector('[data-mp-search]')?.focus({ preventScroll: true });
    return panel;
  }
  if (!isAdmin() || !state.data) return null;

  const view = { q: '', status: 'all', cat: 'all' };
  let confirmApply = false;

  const sheet = openSheet({
    title: 'پنل مدیریت',
    subtitle: manageSubtitle(),
    size: 'full',
    className: 'manage-panel',
    body: `
      <div class="mp">
        <div class="mp__summary" data-mp-summary></div>
        <div class="mp__toolbar">
          <label class="mp__search">
            ${icon('search', { size: 18 })}
            <input type="search" data-mp-search placeholder="جستجوی نام یا برند…" autocomplete="off" aria-label="جستجوی کالا">
          </label>
          <select class="select mp__cat" data-mp-cat aria-label="دسته‌بندی"></select>
          <div class="mp__seg" role="group" aria-label="وضعیت موجودی">
            ${Object.entries(STATUS_LABELS).map(([key, label]) => `
              <button type="button" class="mp__seg-btn ${key === 'all' ? 'is-active' : ''}" data-mp-status="${key}">${label}</button>
            `).join('')}
          </div>
        </div>
        <div class="mp__note" data-mp-note hidden></div>
        <div class="mp__list" data-mp-list aria-live="polite"></div>
      </div>
    `,
    footer: `
      <button class="btn btn--tonal btn--sm" type="button" data-mp-add>${icon('add', { size: 17 })} افزودن کالا</button>
      <button class="btn btn--text btn--sm" type="button" data-mp-cat-add>${icon('category', { size: 17 })} دسته‌بندی</button>
      <button class="btn btn--text btn--sm" type="button" data-mp-settings>${icon('settings', { size: 17 })} تنظیمات</button>
      <span class="spacer"></span>
      <span class="mp__pending" data-mp-pending></span>
      <button class="btn btn--filled btn--sm" type="button" data-mp-apply disabled>${icon('cloud_upload', { size: 17 })} اعمال تغییرات</button>
    `,
    onMount: (c) => {
      panel = { sheet: c, api, view, el: c.el, confirmApply: false };
      document.dispatchEvent(new CustomEvent('ol:manage-state', { detail: { open: true } }));
      const el = c.el;
      const list = el.querySelector('[data-mp-list]');
      const note = el.querySelector('[data-mp-note]');
      const pending = el.querySelector('[data-mp-pending]');
      const applyBtn = el.querySelector('[data-mp-apply]');
      const catSelect = el.querySelector('[data-mp-cat]');
      const search = el.querySelector('[data-mp-search]');

      /* ── filters ─────────────────────────────────────────────────────── */
      const paintCategoryOptions = () => {
        const cats = state.data.categories.map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.title)}</option>`).join('');
        catSelect.innerHTML = `<option value="all">همهٔ دسته‌ها</option>${cats}`;
        catSelect.value = view.cat;
      };

      search.addEventListener('input', () => {
        view.q = search.value.trim().toLowerCase();
        paintRows({ keepScroll: true });
      });
      catSelect.addEventListener('change', () => {
        view.cat = catSelect.value;
        paintRows();
      });
      el.querySelectorAll('[data-mp-status]').forEach((btn) => {
        btn.addEventListener('click', () => {
          view.status = btn.dataset.mpStatus;
          el.querySelectorAll('[data-mp-status]').forEach((b) => b.classList.toggle('is-active', b === btn));
          paintRows();
        });
      });

      /* ── footer actions ──────────────────────────────────────────────── */
      el.querySelector('[data-mp-add]').addEventListener('click', () => {
        api.add?.(view.cat !== 'all' ? view.cat : '');
      });
      el.querySelector('[data-mp-cat-add]').addEventListener('click', () => api.addCategory?.());
      el.querySelector('[data-mp-settings]').addEventListener('click', () => api.settings?.());
      applyBtn.addEventListener('click', () => {
        if (confirmApply) return;
        confirmApply = true;
        paintApply();
      });

      /* ── rows: one delegated listener for the whole list ─────────────── */
      list.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-mp-act]');
        if (!btn) return;
        const row = btn.closest('[data-mp-row]');
        if (!row) return;
        const id = row.dataset.id;
        const device = state.data.devices.find((d) => d.id === id);
        if (!device) return;

        if (btn.dataset.mpAct === 'inc') { setStock(id, device.stock + 1); return; }
        if (btn.dataset.mpAct === 'dec') { setStock(id, device.stock - 1); return; }
        if (btn.dataset.mpAct === 'edit') { api.edit?.(id); return; }
        if (btn.dataset.mpAct === 'delete') { paintRowConfirm(row, device); return; }
        if (btn.dataset.mpAct === 'delete-yes') { await removeDevice(id, device); return; }
        if (btn.dataset.mpAct === 'delete-no') { paintRows({ keepScroll: true }); return; }
        if (btn.dataset.mpAct === 'hide') { toggleFlag(id, 'hidden'); return; }
        if (btn.dataset.mpAct === 'feature') { toggleFlag(id, 'featured'); return; }
      });

      list.addEventListener('change', (event) => {
        const input = event.target.closest('[data-mp-act="input"]');
        if (!input) return;
        const id = input.closest('[data-mp-row]')?.dataset.id;
        const value = parseNumber(input.value);
        setStock(id, Number.isFinite(value) ? value : 0, input);
      });

      /* ── apply (admin confirmation lives here) ───────────────────────── */
      el.addEventListener('click', async (event) => {
        const act = event.target.closest('[data-mp-apply-act]')?.dataset.mpApplyAct;
        if (!act) return;
        if (act === 'cancel') { confirmApply = false; paintApply(); return; }
        if (act === 'confirm') {
          const message = el.querySelector('[data-mp-message]')?.value.trim();
          const ok = await api.apply?.(message);
          confirmApply = false;
          if (ok) paintAll();
          else paintApply();
        }
      });

      /* ── stock ───────────────────────────────────────────────────────── */
      function setStock(id, raw, inputEl = null) {
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
          if (input && input !== inputEl) input.value = String(next);
          row.classList.toggle('is-oos', next <= 0);
          row.querySelector('[data-mp-badge]')?.replaceChildren(document.createTextNode(stockLabel(next)));
          row.querySelector('[data-mp-badge]')?.classList.toggle('mp-badge--out', next <= 0);
        }
        // Keep the public list (behind the panel) and the dock in sync without
        // re-rendering either of them.
        patchDeviceStock(id);
        renderGroupMeta();
        renderStats({ animate: false });
        renderUpdateCard();
        paintSummary();
        paintPending();
        api.onChange?.();
        if (navigator.vibrate) navigator.vibrate(6);
      }

      async function removeDevice(id, device) {
        const ok = await confirmDialog({
          title: 'حذف کالا',
          message: `«${device.name}» از لیست حذف می‌شود. تا وقتی «اعمال تغییرات» را نزنید، روی سایت نمی‌رود.`,
          confirmText: 'حذف کن',
          danger: true
        });
        if (!ok) { paintRows({ keepScroll: true }); return; }
        mutateQuiet((draft) => {
          draft.devices = draft.devices.filter((d) => d.id !== id);
        });
        toast('حذف شد؛ با «اعمال تغییرات» روی سایت می‌نشیند.', { type: 'ok' });
        paintAll();
        api.onChange?.();
      }

      function toggleFlag(id, flag) {
        mutateQuiet((draft) => {
          const target = draft.devices.find((d) => d.id === id);
          if (!target) return;
          target[flag] = !target[flag];
          target.updatedAt = new Date().toISOString();
        });
        paintRows({ keepScroll: true });
        paintPending();
        api.onChange?.();
      }

      /* ── painting helpers ────────────────────────────────────────────── */
      function storeCurrency() {
        return state.data?.settings?.currency || 'تومان';
      }

      function stockLabel(stock) {
        const n = formatNum(stock, currentNumerals());
        if (stock <= 0) return 'ناموجود';
        if (stock <= (state.data?.settings?.lowStockThreshold ?? 2)) return `${n} — کم`;
        return `${n} موجود`;
      }

      function matchDevice(device) {
        if (view.cat !== 'all' && (device.categoryId || '') !== view.cat) return false;
        if (view.status === 'in' && device.stock <= 0) return false;
        if (view.status === 'out' && device.stock > 0) return false;
        if (view.status === 'low') {
          const threshold = state.data?.settings?.lowStockThreshold ?? 2;
          if (!(device.stock > 0 && device.stock <= threshold)) return false;
        }
        if (!view.q) return true;
        const haystack = `${device.name} ${device.brand || ''} ${categoryTitle(state.data, device.categoryId)}`.toLowerCase();
        return haystack.includes(view.q);
      }

      function rowHtml(device) {
        const category = getCategory(state.data, device.categoryId);
        const price = device.priceOnRequest || !device.price
          ? '<span class="mp-row__price">استعلام</span>'
          : `<span class="mp-row__price">${formatNum(device.price, currentNumerals())} <small>${escapeHtml(storeCurrency())}</small></span>`;
        const flags = [
          device.featured ? '<span class="mp-badge">ویژه</span>' : '',
          device.hidden ? '<span class="mp-badge mp-badge--muted">پنهان</span>' : ''
        ].join('');
        const low = device.stock > 0 && device.stock <= (state.data?.settings?.lowStockThreshold ?? 2);
        return `
          <div class="mp-row ${device.stock <= 0 ? 'is-oos' : ''}" data-mp-row data-id="${escapeHtml(device.id)}">
            <span class="mp-row__thumb" aria-hidden="true">${icon(category?.icon || 'devices_other', { size: 20 })}</span>
            <div class="mp-row__main">
              <div class="mp-row__title">${escapeHtml(device.name)}${flags}</div>
              <div class="mp-row__sub">
                <span class="mp-row__meta">${escapeHtml(device.brand || 'بدون برند')}<span class="mp-row__cat"> · ${escapeHtml(category?.title || 'بدون دسته')}</span></span>
                ${price}
              </div>
            </div>
            <span class="mp-badge ${device.stock <= 0 ? 'mp-badge--out' : low ? 'mp-badge--low' : 'mp-badge--ok'}" data-mp-badge>${stockLabel(device.stock)}</span>
            <div class="mp-stepper" role="group" aria-label="موجودی ${escapeHtml(device.name)}">
              <button type="button" class="mp-stepper__btn" data-mp-act="dec" aria-label="کاهش موجودی">${icon('remove', { size: 15 })}</button>
              <input class="mp-stepper__input" type="number" inputmode="numeric" min="0" max="9999" step="1"
                     value="${device.stock}" data-mp-act="input" aria-label="تعداد موجودی">
              <button type="button" class="mp-stepper__btn" data-mp-act="inc" aria-label="افزایش موجودی">${icon('add', { size: 15 })}</button>
            </div>
            <div class="mp-row__actions">
              <button type="button" class="icon-btn" data-mp-act="edit" aria-label="ویرایش ${escapeHtml(device.name)}" data-tip="ویرایش">${icon('edit', { size: 17 })}</button>
              <button type="button" class="icon-btn" data-mp-act="hide" aria-label="${device.hidden ? 'نمایش' : 'پنهان کردن'} در سایت" data-tip="${device.hidden ? 'نمایش' : 'پنهان'}">${icon(device.hidden ? 'visibility' : 'visibility_off', { size: 17 })}</button>
              <button type="button" class="icon-btn mp-row__danger" data-mp-act="delete" aria-label="حذف ${escapeHtml(device.name)}" data-tip="حذف">${icon('delete', { size: 17 })}</button>
            </div>
          </div>`;
      }

      function paintRows({ keepScroll = false } = {}) {
        const top = list.scrollTop;
        const rows = state.data.devices.filter(matchDevice);
        list.innerHTML = rows.length
          ? rows.map(rowHtml).join('')
          : `<div class="mp-empty">
               ${icon('inventory_2', { size: 26 })}
               <b>${view.q || view.status !== 'all' || view.cat !== 'all' ? 'با این فیلتر کالایی نیست' : 'هنوز کالایی ثبت نشده'}</b>
               <span>${view.q || view.status !== 'all' || view.cat !== 'all' ? 'فیلترها را پاک کنید.' : 'با «افزودن کالا» اولین دستگاه را ثبت کنید.'}</span>
             </div>`;
        if (keepScroll) list.scrollTop = top;
        paintSummary();
        paintPending();
        paintApply();
      }

      function paintRowConfirm(row, device) {
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
        });
        const host = el.querySelector('[data-mp-summary]');
        if (!host) return;
        host.innerHTML = `
          <div class="mp-stat"><b>${formatNum(stats.devices, currentNumerals())}</b><span>کالا</span></div>
          <div class="mp-stat"><b>${formatNum(stats.units, currentNumerals())}</b><span>واحد موجود</span></div>
          <div class="mp-stat ${stats.out ? 'is-warn' : ''}"><b>${formatNum(stats.out, currentNumerals())}</b><span>ناموجود</span></div>
          <div class="mp-stat"><b>${formatNum(stats.categoriesTotal, currentNumerals())}</b><span>دسته</span></div>
        `;
      }

      function paintPending() {
        refreshDirty();
        const host = el.querySelector('[data-mp-pending]');
        const note = el.querySelector('[data-mp-note]');
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
      }

      function paintApply() {
        const box = el.querySelector('[data-mp-applybox]');
        const applyBtn = el.querySelector('[data-mp-apply]');
        if (!confirmApply) {
          box?.remove();
          applyBtn?.removeAttribute('data-open');
          return;
        }
        applyBtn?.setAttribute('data-open', '1');
        if (box) { box.querySelector('[data-mp-message]')?.focus(); return; }
        const diff = computeDiff(state.baseline, state.data);
        const names = [...diff.added.map((d) => `+ ${d.name}`), ...diff.updated.map((d) => `~ ${d.name}`), ...diff.removed.map((d) => `− ${d.name}`)];
        const demo = isDemo();
        const block = document.createElement('div');
        block.className = 'mp-apply';
        block.setAttribute('data-mp-applybox', '');
        block.innerHTML = `
          <div class="mp-apply__head">
            ${icon('cloud_upload', { size: 20 })}
            <div>
              <b>${demo ? 'در پیش‌نمایش امکان انتشار نیست' : 'اعمال تغییرات روی سایت؟'}</b>
              <span>${demo
                ? 'این حالت توکن ندارد؛ فقط ظاهر پنل را می‌بینید.'
                : `${formatNum(diff.total, currentNumerals())} تغییر در ${formatNum(diff.added.length + diff.updated.length + diff.removed.length, currentNumerals())} کالا. با تأیید، فایل مخزن به‌روز می‌شود.`}</span>
            </div>
          </div>
          ${names.length ? `<ul class="mp-apply__list">${names.slice(0, 6).map((n) => `<li>${escapeHtml(n)}</li>`).join('')}${names.length > 6 ? `<li>و ${formatNum(names.length - 6, currentNumerals())} مورد دیگر…</li>` : ''}</ul>` : ''}
          <label class="field" style="gap:6px">
            <span class="field__label">پیام کامیت</span>
            <input class="input" data-mp-message dir="auto" value="${escapeHtml(defaultCommitMessage())}" maxlength="160">
          </label>
          <div class="mp-apply__actions">
            <button type="button" class="btn btn--text btn--sm" data-mp-apply-act="cancel">انصراف</button>
            <button type="button" class="btn btn--filled btn--sm" data-mp-apply-act="confirm" ${demo ? 'disabled' : ''}>
              ${icon('check', { size: 17 })} تأیید و انتشار
            </button>
          </div>
        `;
        applyBtn?.closest('.sheet__foot')?.before(block);
        block.scrollIntoView({ block: 'nearest' });
        block.querySelector('[data-mp-message]')?.focus({ preventScroll: true });
        hydrateIcons(block);
      }

      function paintAll() {
        paintCategoryOptions();
        paintRows();
        paintApply();
      }

      /* keep the panel in sync with edits made in the nested editor sheets */
      unsubscribe?.();
      unsubscribe = subscribe((reason, detail) => {
        if (!panel) return;
        if (reason === 'data' || reason === 'auth' || reason === 'published') {
          paintAll();
          const sub = el.querySelector('.sheet__sub');
          if (sub) sub.textContent = manageSubtitle();
        }
        if (reason === 'auth' && !isAdmin()) closePanel();
        if (reason === 'published') {
          confirmApply = false;
          paintApply();
          paintAll();
        }
      });

      // expose to the outer scope for cleanup
      panel.paint = paintAll;
      paintAll();
    },
    onClose: () => {
      unsubscribe?.();
      unsubscribe = null;
      panel = null;
      // app.js skips full re-renders while the panel covers the page; this is
      // the single catch-up render when it closes.
      document.dispatchEvent(new CustomEvent('ol:manage-state', { detail: { open: false } }));
    }
  });

  return panel;
}

function closePanel() {
  panel?.sheet?.close();
}

function defaultCommitMessage() {
  const label = state.data?.settings?.storeName || state.data?.settings?.name || 'لیست موجودی';
  const stamp = new Date().toLocaleString('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  return `به‌روزرسانی ${label} — ${stamp}`;
}

function manageSubtitle() {
  const settings = state.data?.settings || {};
  const name = settings.storeName || settings.name || 'فروشگاه شما';
  return isDemo() ? `${name} · حالت پیش‌نمایش` : `${name} · مدیریت کالا و موجودی`;
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}
