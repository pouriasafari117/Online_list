/* ==========================================================================
   UI primitives — toasts, sheets, menus, confirms, busy buttons
   ========================================================================== */

import { icon } from './icons.js';
import { escapeHtml, focusFirst } from './util.js';

const dialogHost = () => document.getElementById('dialogHost') || document.body;

/* ── Toasts ─────────────────────────────────────────────────────────────── */

const TOAST_ICONS = { ok: 'check_circle', err: 'error', warn: 'warning', info: 'info' };

export function toast(message, { type = 'info', duration = 3400, icon: iconName = null } = {}) {
  const root = document.getElementById('toastRoot');
  if (!root) return () => {};
  while (root.children.length >= 4) root.firstElementChild?.remove();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="ic-host">${icon(iconName || TOAST_ICONS[type] || 'info', { size: 18 })}</span>
    <span class="toast__text">${escapeHtml(message)}</span>
  `;
  root.append(el);
  let timer = 0;
  const dismiss = () => {
    if (!el.isConnected || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  };
  const arm = () => {
    clearTimeout(timer);
    if (duration > 0) timer = setTimeout(dismiss, duration);
  };
  arm();
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', (e) => { if (e.pointerType === 'mouse') arm(); });
  el.addEventListener('click', dismiss);
  return dismiss;
}

/* ── Sheets (modal dialogs) ─────────────────────────────────────────────── */

export function openSheet({
  title = '',
  subtitle = '',
  body = '',
  footer = '',
  size = '',
  dismissible = true,
  onMount = null,
  onClose = null,
  className = ''
} = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = [
    'sheet',
    size === 'wide' ? 'sheet--wide' : '',
    size === 'narrow' ? 'sheet--narrow' : '',
    size === 'full' ? 'sheet--full' : '',
    className
  ].filter(Boolean).join(' ');
  dlg.innerHTML = `
    <div class="sheet__head">
      <div>
        <div class="sheet__title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="sheet__sub">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <button class="icon-btn sheet__close" type="button" data-close aria-label="بستن">
        ${icon('close', { size: 20 })}
      </button>
    </div>
    <div class="sheet__body">${body}</div>
    ${footer ? `<div class="sheet__foot">${footer}</div>` : ''}
  `;
  if (title) dlg.setAttribute('aria-label', title);
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('tabindex', '-1');
  dialogHost().append(dlg);
  document.body.classList.add('has-dialog');

  let resolved = false;
  const cleanup = (result) => {
    if (resolved) return;
    resolved = true;
    // Mark this dialog first: the body lock must be released only when no
    // *other* sheet is still open. Checking before closing used to leave
    // `has-dialog` (and therefore `body { overflow: hidden }`) behind, which
    // froze page scrolling after the first dialog in a session.
    dlg.classList.add('is-closing');
    if (dlg.open) {
      try { dlg.close(result); } catch { /* ignore */ }
    }
    dlg.remove();
    syncDialogLock();
    if (typeof onClose === 'function') onClose(result);
  };

  const close = (result = undefined) => cleanup(result);

  dlg.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) { event.preventDefault(); close(); }
  });
  dlg.addEventListener('cancel', (event) => {
    if (!dismissible) event.preventDefault();
  });
  dlg.addEventListener('close', () => cleanup(dlg.returnValue));
  dlg.addEventListener('click', (event) => {
    if (event.target !== dlg) return;
    // clicking the backdrop (the dialog element itself) closes it
    const rect = dlg.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside && dismissible) close();
  });

  const controller = {
    el: dlg,
    body: dlg.querySelector('.sheet__body'),
    foot: dlg.querySelector('.sheet__foot'),
    close,
    setBusy(busy) {
      dlg.toggleAttribute('data-busy', !!busy);
      dlg.querySelectorAll('button, input, select, textarea').forEach((el) => {
        if (busy) { el.dataset.wasDisabled = el.disabled ? '1' : ''; el.disabled = true; }
        else if (el.dataset.wasDisabled !== undefined) {
          if (!el.dataset.wasDisabled) el.disabled = false;
          delete el.dataset.wasDisabled;
        }
      });
    }
  };

  try { dlg.showModal(); } catch { dlg.show(); }
  requestAnimationFrame(() => {
    if (typeof onMount === 'function') onMount(controller);
    else focusFirst(dlg);
    // Keep focus inside the dialog without lighting up the close button.
    if (!dlg.contains(document.activeElement) || document.activeElement === dlg.querySelector('[data-close]')) {
      const textField = dlg.querySelector('.sheet__body input:not([type="hidden"]):not([disabled]), .sheet__body textarea:not([disabled])');
      if (textField) textField.focus({ preventScroll: true });
      else dlg.focus({ preventScroll: true });
    }
  });
  return controller;
}

/** Keeps the body scroll lock in sync with the sheets that are really open. */
export function syncDialogLock() {
  const anyOpen = !!document.querySelector('dialog.sheet[open]:not(.is-closing)');
  document.body.classList.toggle('has-dialog', anyOpen);
}

export function closeAllSheets() {
  document.querySelectorAll('dialog.sheet[open]').forEach((d) => {
    d.classList.add('is-closing');
    try { d.close(); } catch { /* ignore */ }
    d.remove();
  });
  syncDialogLock();
}

/* ── Confirm / alert ────────────────────────────────────────────────────── */

export function confirmDialog({
  title = 'تأیید',
  message = '',
  confirmText = 'تأیید',
  cancelText = 'انصراف',
  danger = false,
  details = ''
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const sheet = openSheet({
      title,
      size: 'narrow',
      body: `
        <div class="stack" style="gap:12px">
          <p class="t-sm" style="color:var(--text-2);line-height:1.9">${escapeHtml(message)}</p>
          ${details ? `<div class="form-note">${details}</div>` : ''}
        </div>
      `,
      footer: `
        <span class="spacer"></span>
        <button class="btn btn--text btn--sm" type="button" data-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--filled'} btn--sm" type="button" data-confirm>${escapeHtml(confirmText)}</button>
      `,
      onMount: (c) => {
        c.el.querySelector('[data-cancel]')?.focus();
        c.el.querySelector('[data-confirm]')?.addEventListener('click', () => { finish(true); c.close(); });
        c.el.querySelector('[data-cancel]')?.addEventListener('click', () => { finish(false); c.close(); });
      },
      onClose: () => finish(false)
    });
    sheet.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) finish(false);
    });
  });
}

export function alertDialog({ title = 'توجه', message = '', iconName = 'info', confirmText = 'متوجه شدم' } = {}) {
  return new Promise((resolve) => {
    openSheet({
      title,
      size: 'narrow',
      body: `
        <div class="stack" style="gap:14px">
          <div class="login-hero">
            <span class="login-hero__icon">${icon(iconName, { size: 24 })}</span>
            <div>
              <div class="login-hero__title">${escapeHtml(title)}</div>
              <div class="login-hero__sub">${escapeHtml(message)}</div>
            </div>
          </div>
        </div>
      `,
      footer: `<span class="spacer"></span><button class="btn btn--filled btn--sm" type="button" data-close>${escapeHtml(confirmText)}</button>`,
      onClose: () => resolve()
    });
  });
}

/* ── Popup menu ─────────────────────────────────────────────────────────── */

let activeMenu = null;

export function closeMenu() {
  if (!activeMenu) return;
  activeMenu.el.remove();
  document.removeEventListener('pointerdown', activeMenu.onOutside, true);
  document.removeEventListener('keydown', activeMenu.onKey, true);
  window.removeEventListener('scroll', closeMenu, true);
  activeMenu = null;
}

export function openMenu(anchor, items, { align = 'end', label = '' } = {}) {
  closeMenu();
  if (!anchor) return null;
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    ${label ? `<div class="menu__label">${escapeHtml(label)}</div>` : ''}
    ${items.map((item, index) => {
      if (item.separator) return '<div class="menu__sep" role="separator"></div>';
      if (item.heading) return `<div class="menu__label">${escapeHtml(item.heading)}</div>`;
      return `<button class="menu__item ${item.danger ? 'menu__item--danger' : ''}" type="button" role="menuitem"
        data-index="${index}" ${item.disabled ? 'disabled' : ''}>
        ${item.icon ? icon(item.icon, { size: 18 }) : ''}
        <span>${escapeHtml(item.label)}</span>
      </button>`;
    }).join('')}
  `;
  document.body.append(menu);

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  let top = rect.bottom + margin;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - menuRect.height - margin);
  }
  let left;
  if (align === 'end') left = rect.right - menuRect.width;
  else if (align === 'start') left = rect.left;
  else left = rect.left + rect.width / 2 - menuRect.width / 2;
  left = Math.min(window.innerWidth - menuRect.width - margin, Math.max(margin, left));
  menu.style.top = `${top + window.scrollY}px`;
  menu.style.left = `${left + window.scrollX}px`;

  const onOutside = (event) => {
    if (menu.contains(event.target) || anchor.contains(event.target)) return;
    closeMenu();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      anchor.focus?.();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const focusables = [...menu.querySelectorAll('.menu__item:not([disabled])')];
      if (!focusables.length) return;
      event.preventDefault();
      const idx = focusables.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown'
        ? focusables[(idx + 1) % focusables.length]
        : focusables[(idx - 1 + focusables.length) % focusables.length];
      next.focus();
    }
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', closeMenu, true);
    menu.querySelector('.menu__item:not([disabled])')?.focus({ preventScroll: true });
  }, 0);

  menu.addEventListener('click', (event) => {
    const btn = event.target.closest('.menu__item');
    if (!btn || btn.disabled) return;
    const item = items[Number(btn.dataset.index)];
    closeMenu();
    if (item?.onSelect) item.onSelect();
  });

  activeMenu = { el: menu, onOutside, onKey };
  return menu;
}

/* ── Busy state ─────────────────────────────────────────────────────────── */

export function setButtonBusy(button, busy, busyLabel = 'در حال انجام…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="spinner"></span><span>${escapeHtml(busyLabel)}</span>`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

/** Delegated ripple effect for every .btn / .icon-btn. */
export function initRipples() {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest('.btn, .icon-btn, .segmented__item, .feature-card, .menu__item');
    if (!target) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 0.7;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.append(ripple);
    setTimeout(() => ripple.remove(), 520);
  }, { passive: true });
}

/** Copies text and shows a toast. */
export async function copyWithToast(text, message = 'کپی شد') {
  const { copyText } = await import('./util.js');
  const ok = await copyText(text);
  toast(ok ? message : 'کپی ناموفق بود', { type: ok ? 'ok' : 'err' });
  return ok;
}

export function fieldError(fieldEl, message) {
  if (!fieldEl) return;
  const wrapper = fieldEl.closest('.field');
  if (!wrapper) return;
  wrapper.classList.toggle('is-invalid', !!message);
  const error = wrapper.querySelector('.field__error');
  if (error) error.textContent = message || '';
}

export function clearErrors(root) {
  root?.querySelectorAll('.field.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
}
