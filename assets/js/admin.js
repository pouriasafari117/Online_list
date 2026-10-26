/* ==========================================================================
   Admin — unlock the vault, edit the shop, publish to GitHub
   ========================================================================== */

import { ApiError, createGitHub, fetchVault, isValidRepoPart, looksLikeToken, parseJsonLoose } from './api.js';
import {
  CryptoError, cryptoAvailable, estimateCrackSeconds, isVault, openVault, passwordScore, sealVault
} from './crypto.js';
import {
  CATEGORY_ICONS, CONDITION_OPTIONS, RESET_PHRASE, clearInventory, computeDiff,
  defaultCategory, defaultField, diffSummary, getCategory, makeDefaultData, normalizeStore,
  parseStoreJson, serializeStore
} from './model.js';
import {
  clearDraft, currentNumerals, discardDraftAndReset, endAdminSession,
  isAdmin, isDemo, markPublished, mutate, persistDraft, readDraft, refreshDirty,
  replaceData, startAdminSession, state
} from './state.js';
import {
  alertDialog, confirmDialog, copyWithToast, fieldError, openMenu, openSheet,
  setButtonBusy, toast
} from './ui.js';
import {
  deepClone, download, escapeHtml, formatCrackTime, formatJalaliDateTime, formatJalaliStamp,
  formatNum, parseNumber, slugify, storageGet, storageSet, toCsv, uid
} from './util.js';
import { icon } from './icons.js';
import { computeStats } from './model.js';
import { hydrateIcons } from './render.js';

const REQUIRED_ACTIONS = new Set([
  'login', 'logout', 'admin-menu', 'add-menu', 'publish', 'discard', 'settings', 'security',
  'add-device', 'edit-device', 'device-menu', 'add-category', 'edit-category',
  'export-backup', 'import-backup', 'lock', 'demo-exit'
]);

const GATE_KEY = 'ol.loginGate.v1';

/* The vault file is public, so a password is always attacked offline.
   Under a week on a single GPU is refused; under a year only warns. */
const WEAK_SECONDS = 7 * 86_400;
const YEAR_SECONDS = 365 * 86_400;

/* ── Small form helpers ─────────────────────────────────────────────────── */

function fieldHtml({
  label, name, value = '', type = 'text', placeholder = '', hint = '', required = false,
  ltr = false, inputmode = '', autocomplete = 'off', maxlength = 0, rows = 0, min = null, max = null, step = null
} = {}) {
  const input = rows
    ? `<textarea class="textarea" name="${escapeHtml(name)}" rows="${rows}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}>${escapeHtml(value)}</textarea>`
    : `<input class="input" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} ${ltr ? 'dir="ltr"' : ''}
        ${inputmode ? `inputmode="${escapeHtml(inputmode)}"` : ''} autocomplete="${escapeHtml(autocomplete)}"
        ${maxlength ? `maxlength="${maxlength}"` : ''} ${min != null ? `min="${min}"` : ''}
        ${max != null ? `max="${max}"` : ''} ${step != null ? `step="${step}"` : ''}>`;
  return `
    <label class="field">
      <span class="field__label">${escapeHtml(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ''}</span>
      ${input}
      ${hint ? `<span class="field__hint">${escapeHtml(hint)}</span>` : ''}
      <span class="field__error"></span>
    </label>`;
}

function selectHtml({ label, name, value = '', options = [], hint = '', required = false }) {
  return `
    <label class="field">
      <span class="field__label">${escapeHtml(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ''}</span>
      <select class="select" name="${escapeHtml(name)}" ${required ? 'required' : ''}>
        ${options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>
      ${hint ? `<span class="field__hint">${escapeHtml(hint)}</span>` : ''}
      <span class="field__error"></span>
    </label>`;
}

function switchHtml({ label, name, checked = false, hint = '' }) {
  return `
    <div class="field" style="gap:5px">
      <label class="switch">
        <input type="checkbox" name="${escapeHtml(name)}" ${checked ? 'checked' : ''}>
        <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
        <span>${escapeHtml(label)}</span>
      </label>
      ${hint ? `<span class="field__hint">${escapeHtml(hint)}</span>` : ''}
    </div>`;
}

function errorNote(message) {
  return `<div class="form-note form-note--danger" data-form-error hidden>${icon('error', { size: 18 })}<span>${escapeHtml(message)}</span></div>`;
}

function showError(sheet, message) {
  const note = sheet.el.querySelector('[data-form-error]');
  if (!note) { toast(message, { type: 'err' }); return; }
  note.hidden = false;
  note.querySelector('span')?.replaceChildren(document.createTextNode(message));
  note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function hideError(sheet) {
  const note = sheet.el.querySelector('[data-form-error]');
  if (note) note.hidden = true;
}

const formEl = (sheet) => sheet.el.querySelector('form');
const fieldValue = (form, name) => String(form.elements.namedItem(name)?.value ?? '').trim();
const fieldChecked = (form, name) => !!form.elements.namedItem(name)?.checked;
const repoLabel = (repo) => (repo ? `${repo.owner}/${repo.repo} · ${repo.branch}` : '—');

function repoConfig(raw) {
  const branch = String(raw?.branch || 'main').trim() || 'main';
  const owner = String(raw?.owner || '').trim();
  const repo = String(raw?.repo || '').trim();
  if (!isValidRepoPart(owner) || !isValidRepoPart(repo) || !isValidRepoPart(branch)) return null;
  return { owner, repo, branch };
}

/* ── Dock ───────────────────────────────────────────────────────────────── */

export function renderAdmin() {
  const host = document.getElementById('adminDockHost');
  if (!host) return;
  document.body.classList.toggle('has-adminbar', isAdmin());
  if (!isAdmin()) { host.innerHTML = ''; return; }

  const dirty = !!state.dirty;
  const demo = isDemo();
  const name = state.data?.settings?.adminName || state.user?.name || 'مدیر';
  const initial = (name || 'م').trim().charAt(0);
  const statusLabel = demo ? 'پیش‌نمایش' : dirty ? 'منتشرنشده' : 'همگام با مخزن';
  const stats = computeStats(state.data, { includeHidden: true });
  const hiddenCount = (state.data?.devices || []).filter((d) => d.hidden).length;
  const warnBits = [];
  if (stats.out) warnBits.push({ label: `${formatNum(stats.out, currentNumerals())} ناموجود`, kind: 'out' });
  if (hiddenCount) warnBits.push({ label: `${formatNum(hiddenCount, currentNumerals())} پنهان`, kind: 'hidden' });
  host.innerHTML = `
    <div class="adminbar ${dirty ? 'is-dirty' : 'is-live'} ${demo ? 'is-demo' : ''}" role="region" aria-label="نوار مدیریت">
      <div class="adminbar__inner">
        <span class="adminbar__avatar" aria-hidden="true" title="${escapeHtml(name)}">${escapeHtml(initial)}</span>
        <span class="adminbar__status">
          <span class="dot" aria-hidden="true"></span>
          <span class="label">${escapeHtml(statusLabel)}</span>
        </span>
        <span class="adminbar__divider" aria-hidden="true"></span>
        ${warnBits.length ? `<div class="adminbar__warns">
          ${warnBits.map((w) => `<button class="adminbar__warn" type="button" data-admin-focus="${w.kind}">${w.label}</button>`).join('')}
        </div>` : ''}
        <div class="adminbar__actions">
          <button class="btn btn--filled btn--sm btn--publish" type="button" data-action="publish">
            ${icon('cloud_upload', { size: 17 })}
            <span class="label">${demo ? 'پیش‌نمایش' : 'انتشار'}</span>
          </button>
          <button class="btn btn--icon btn--sm btn--tonal" type="button" data-action="add-menu" aria-label="افزودن" aria-haspopup="menu" data-tip="افزودن">
            ${icon('add', { size: 19 })}
          </button>
          <button class="btn btn--icon btn--sm btn--text" type="button" data-action="settings" aria-label="تنظیمات" data-tip="تنظیمات">
            ${icon('settings', { size: 19 })}
          </button>
          ${dirty ? `<button class="btn btn--icon btn--sm btn--text" type="button" data-action="discard" aria-label="بازگردانی تغییرات" data-tip="بازگردانی">
            ${icon('replay', { size: 19 })}
          </button>` : ''}
          <button class="btn btn--icon btn--sm btn--text" type="button" data-action="logout" aria-label="${demo ? 'خروج از پیش‌نمایش' : 'قفل کردن'}" data-tip="${demo ? 'خروج' : 'قفل'}">
            ${icon(demo ? 'logout' : 'lock', { size: 19 })}
          </button>
        </div>
      </div>
    </div>
  `;
  host.querySelectorAll('[data-admin-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.adminFocus;
      if (kind === 'out') {
        document.dispatchEvent(new CustomEvent('ol:admin-focus', { detail: { avail: 'out' } }));
      } else {
        document.dispatchEvent(new CustomEvent('ol:admin-focus', { detail: { hidden: true } }));
      }
    });
  });
  hydrateIcons(host);
}

/* ── Login gate (brute-force friction, client side) ─────────────────────── */

function readGate() {
  const gate = storageGet(GATE_KEY, null);
  return gate && typeof gate === 'object' ? { fails: Number(gate.fails) || 0, until: Number(gate.until) || 0 } : { fails: 0, until: 0 };
}

function registerFailure() {
  const gate = readGate();
  gate.fails += 1;
  if (gate.fails >= 5) gate.until = Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (gate.fails - 5));
  storageSet(GATE_KEY, gate);
  return gate;
}

function resetGate() { storageSet(GATE_KEY, { fails: 0, until: 0 }); }

/* ── Login ──────────────────────────────────────────────────────────────── */

let vaultLookup = null;

async function lookupVault() {
  if (state.vault) return { vault: state.vault, url: state.vaultUrl };
  if (!vaultLookup) vaultLookup = fetchVault(state.site || {});
  const result = await vaultLookup;
  vaultLookup = null;
  if (result?.vault && isVault(result.vault)) {
    state.vault = result.vault;
    state.vaultUrl = result.url;
    return result;
  }
  return { vault: null, url: result?.url || null };
}

async function openLogin() {
  if (isAdmin()) return;
  const button = document.getElementById('loginBtn');
  setButtonBusy(button, true, 'بررسی…');
  try {
    const { vault } = await lookupVault();
    if (vault) openPasswordSheet(vault);
    else openSetupSheet();
  } catch (err) {
    toast(err.message || 'بررسی تنظیمات ناموفق بود', { type: 'err' });
  } finally {
    setButtonBusy(button, false);
  }
}

function openSetupSheet() {
  const site = state.site || {};
  const target = site.owner && site.repo ? `${site.owner}/${site.repo}` : 'مخزن شما';
  const sheet = openSheet({
    title: 'ورود مدیر',
    subtitle: 'اولین بار است؟ رمز مدیریت را به توکن گیت‌هاب وصل کنید',
    size: 'narrow',
    body: `
      <div class="stack" style="gap:16px">
        <div class="login-hero">
          <span class="login-hero__icon">${icon('key', { size: 24 })}</span>
          <div>
            <div class="login-hero__title">هنوز رمز مدیریت ساخته نشده</div>
            <div class="login-hero__sub">در صفحه راه‌اندازی، یک توکن گیت‌هاب بسازید و آن را با یک رمز عبور سینک کنید. رمز و توکن فقط رمزگذاری‌شده در مخزن ${escapeHtml(target)} ذخیره می‌شوند.</div>
          </div>
        </div>
        <ol class="stack" style="gap:10px;padding-inline-start:18px;list-style:decimal;font-size:var(--fs-xs);color:var(--text-2);line-height:1.9">
          <li>یک توکن Fine-grained با دسترسی <b>Contents: Read and write</b> بسازید.</li>
          <li>در صفحه راه‌اندازی، توکن و رمز دلخواه را وارد و ذخیره کنید.</li>
          <li>به سایت برگردید و با همان رمز وارد شوید.</li>
        </ol>
        <div class="form-note">
          ${icon('info', { size: 18 })}
          <span>اگر قبلاً توکن را سینک کرده‌اید ولی سایت فایل امنیتی را پیدا نمی‌کند، مقدار مخزن را در <span dir="ltr">data/site.json</span> بررسی کنید.</span>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn--text btn--sm" type="button" data-token-login>${icon('key', { size: 17 })} ورود موقت با توکن</button>
      <span class="spacer"></span>
      <button class="btn btn--outlined btn--sm" type="button" data-demo>${icon('visibility', { size: 17 })} پیش‌نمایش</button>
      <a class="btn btn--filled btn--sm" href="setup/">${icon('rocket_launch', { size: 17 })} صفحه راه‌اندازی</a>
    `,
    onMount: (c) => {
      c.el.querySelector('[data-token-login]')?.addEventListener('click', () => { c.close(); openDirectTokenSheet(); });
      c.el.querySelector('[data-demo]')?.addEventListener('click', () => { c.close(); enterDemo(); });
    }
  });
  return sheet;
}

function openPasswordSheet(vault) {
  const gate = readGate();
  const lockedFor = Math.max(0, Math.ceil((gate.until - Date.now()) / 1000));
  const repo = repoConfig(vault.repo);
  const sheet = openSheet({
    title: 'ورود مدیر',
    subtitle: repo ? repoLabel(repo) : 'مخزن تنظیم نشده',
    size: 'narrow',
    body: `
      <form id="loginForm" class="stack" style="gap:16px" novalidate>
        <div class="login-hero">
          <span class="login-hero__icon">${icon('lock', { size: 24 })}</span>
          <div>
            <div class="login-hero__title">رمز مدیریت را وارد کنید</div>
            <div class="login-hero__sub">رمز در همین مرورگر، توکن ذخیره‌شده در فایل امنیتی را باز می‌کند. رمز هیچ‌جا ارسال نمی‌شود.</div>
          </div>
        </div>
        ${errorNote('رمز یا اتصال ناموفق بود.')}
        ${vault.hint ? `<div class="form-note">${icon('info', { size: 18 })}<span>یادآور شما: ${escapeHtml(vault.hint)}</span></div>` : ''}
        <div class="field">
          <span class="field__label">رمز عبور</span>
          <div class="password-wrap">
            <input class="input" type="password" name="password" id="loginPassword" autocomplete="current-password"
                   placeholder="••••••••" required autofocus>
            <button class="icon-btn" type="button" data-toggle-password aria-label="نمایش رمز">
              ${icon('visibility', { size: 19 })}
            </button>
          </div>
          <span class="field__error"></span>
        </div>
        ${lockedFor ? `<div class="form-note form-note--danger">${icon('warning', { size: 18 })}<span data-lock-msg>تلاش‌های ناموفق زیاد بوده؛ ${formatNum(lockedFor, currentNumerals())} ثانیه صبر کنید.</span></div>` : ''}
        <div class="form-note">
          ${icon('security', { size: 18 })}
          <span>رمز را فراموش کرده‌اید؟ با <a href="setup/" style="text-decoration:underline">صفحه راه‌اندازی</a> می‌توانید توکن جدید بسازید و رمز را بازنشانی کنید.</span>
        </div>
        <div class="form-note">
          ${icon('help', { size: 18 })}
          <span>اولین بار است؟ <a href="help/" target="_blank" rel="noopener" style="text-decoration:underline">راهنمای تصویری مدیر</a> قدم‌به‌قدم توضیح داده است.</span>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn--text btn--sm" type="button" data-token-login>ورود موقت با توکن</button>
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="loginForm" data-submit>${icon('lock_open', { size: 17 })} ورود</button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#loginForm');
      const submit = c.el.querySelector('[data-submit]');
      c.el.querySelector('[data-toggle-password]')?.addEventListener('click', (event) => {
        const input = c.el.querySelector('#loginPassword');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        event.currentTarget.innerHTML = icon(show ? 'visibility_off' : 'visibility', { size: 19 });
        event.currentTarget.setAttribute('aria-label', show ? 'پنهان کردن رمز' : 'نمایش رمز');
        input.focus();
      });
      c.el.querySelector('[data-token-login]')?.addEventListener('click', () => { c.close(); openDirectTokenSheet(); });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideError(c);
        const password = form.elements.namedItem('password').value;
        const passwordField = form.elements.namedItem('password');
        fieldError(passwordField, '');
        if (!password) { fieldError(passwordField, 'رمز عبور را وارد کنید.'); passwordField.focus(); return; }
        if (!cryptoAvailable()) {
          showError(c, 'رمزنگاری مرورگر در دسترس نیست. سایت را روی HTTPS باز کنید.');
          return;
        }
        const freshGate = readGate();
        if (freshGate.until > Date.now()) {
          showError(c, `تلاش‌های ناموفق زیاد بوده؛ ${formatNum(Math.ceil((freshGate.until - Date.now()) / 1000), currentNumerals())} ثانیه دیگر تلاش کنید.`);
          return;
        }
        if (!repo) {
          showError(c, 'اطلاعات مخزن در فایل امنیتی کامل نیست. صفحه راه‌اندازی را دوباره اجرا کنید.');
          return;
        }
        setButtonBusy(submit, true, 'در حال باز کردن…');
        try {
          await unlockAndEnter({ vault, password, repo });
          resetGate();
          c.close();
        } catch (err) {
          setButtonBusy(submit, false);
          if (err?.code === 'bad-password') {
            const gateNow = registerFailure();
            const wait = Math.ceil((gateNow.until - Date.now()) / 1000);
            fieldError(passwordField, 'رمز عبور نادرست است.');
            showError(c, wait > 0
              ? `رمز نادرست است. برای جلوگیری از حدس زدن، ${formatNum(wait, currentNumerals())} ثانیه صبر کنید.`
              : 'رمز عبور نادرست است. دوباره تلاش کنید.');
            passwordField.select();
          } else {
            showError(c, err?.message || 'ورود ناموفق بود.');
          }
        }
      });
    }
  });
  return sheet;
}

async function unlockAndEnter({ vault, password, repo, token: directToken = null, adminName = '' }) {
  let token = directToken;
  if (!token) {
    const opened = await openVault(vault, password);
    token = opened.token;
    if (!adminName && opened.login) adminName = '';
  }
  const api = createGitHub({ token, ...repo });
  const branchInfo = await api.getBranch(repo.branch);
  if (!branchInfo.exists) {
    throw new ApiError(`شاخه «${repo.branch}» در مخزن پیدا نشد.`, { code: 'branch' });
  }
  const repoInfo = await api.getRepo();
  if (repoInfo.canPush === false) {
    throw new ApiError('توکن فقط دسترسی خواندن دارد. در تنظیمات توکن، Contents را روی Read and write بگذارید.', { code: 'forbidden' });
  }
  const [file, user] = await Promise.all([api.getFile('data/store.json'), api.getUser()]);

  let remote = makeDefaultData();
  let sha = null;
  let legacyStore = false;
  if (file) {
    try {
      // Tolerate files written by the early setup build (base64-wrapped JSON).
      const { value, repaired } = parseJsonLoose(file.text);
      remote = parseStoreJson(repaired ? JSON.stringify(value) : file.text);
      if (repaired) legacyStore = true;
    } catch (err) {
      throw new ApiError('فایل data/store.json در مخزن معتبر نیست. لطفاً نسخه پشتیبان را بررسی کنید.', { code: 'bad-data' });
    }
    sha = file.sha;
  }

  const draft = readDraft(repo);
  let initialData = remote;
  let restored = false;
  if (draft && draft.data) {
    try {
      const draftData = normalizeStore(draft.data);
      if (serializeStore(draftData) !== serializeStore(remote)) {
        initialData = draftData;
        restored = true;
      }
    } catch { /* ignore a broken draft */ }
  }

  const displayName = adminName.trim() || state.data?.settings?.adminName || user.name || user.login || 'مدیر فروشگاه';
  startAdminSession({
    data: initialData,
    baseline: remote,
    sha,
    site: state.site,
    repo,
    api,
    user: { name: displayName, login: user.login || '', avatarUrl: user.avatarUrl || '' },
    vault: vault || null,
    vaultUrl: state.vaultUrl || null,
    mode: 'admin'
  });
  refreshDirty();
  if (restored) {
    persistDraft();
    toast('تغییرات ذخیره‌نشده‌ی قبلی بازیابی شد. برای انتشار، دکمه «انتشار» را بزنید.', { type: 'warn', duration: 6000 });
  } else {
    toast(`خوش آمدید${displayName ? `، ${displayName}` : ''}`, { type: 'ok' });
  }
  if (legacyStore) {
    // The file in the repo was double-encoded by an early build. Publishing
    // rewrites it as plain JSON, so nudge the owner once.
    toast('فایل لیست روی مخزن قالب قدیمی دارد؛ با اولین «انتشار» به‌صورت خودکار اصلاح می‌شود.', {
      type: 'info', duration: 9000
    });
  }
  if (!state.sha) {
    // The file may be brand new — remember to create it on publish.
    state.sha = null;
  }
  return true;
}

function openDirectTokenSheet() {
  if (isAdmin()) return;
  const fallback = state.repo || repoConfig(state.vault?.repo) || {};
  openSheet({
    title: 'ورود موقت با توکن',
    subtitle: 'برای عیب‌یابی یا وقتی رمز را فراموش کرده‌اید',
    size: 'narrow',
    body: `
      <form id="tokenForm" class="stack" style="gap:14px" novalidate>
        <div class="form-note">
          ${icon('warning', { size: 18 })}
          <span>توکن فقط در حافظه همین تب نگه داشته می‌شود و با بستن صفحه پاک می‌شود. برای استفاده روزمره، صفحه راه‌اندازی را کامل کنید.</span>
        </div>
        ${fieldHtml({ label: 'توکن گیت‌هاب', name: 'token', placeholder: 'github_pat_… یا ghp_…', required: true, ltr: true, autocomplete: 'off' })}
        <div class="grid-2">
          ${fieldHtml({ label: 'مالک مخزن', name: 'owner', value: fallback.owner || '', ltr: true, required: true, placeholder: 'username' })}
          ${fieldHtml({ label: 'نام مخزن', name: 'repo', value: fallback.repo || '', ltr: true, required: true, placeholder: 'Online_list' })}
        </div>
        <div class="grid-2">
          ${fieldHtml({ label: 'شاخه', name: 'branch', value: fallback.branch || 'main', ltr: true, required: true })}
          ${fieldHtml({ label: 'نام نمایشی مدیر', name: 'adminName', value: state.data?.settings?.adminName || '', placeholder: 'مدیر فروشگاه' })}
        </div>
        ${errorNote('')}
      </form>
    `,
    footer: `
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="tokenForm" data-submit>${icon('login', { size: 17 })} اتصال</button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#tokenForm');
      const submit = c.el.querySelector('[data-submit]');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideError(c);
        const values = {
          token: fieldValue(form, 'token'),
          owner: fieldValue(form, 'owner'),
          repo: fieldValue(form, 'repo'),
          branch: fieldValue(form, 'branch') || 'main',
          adminName: fieldValue(form, 'adminName')
        };
        const tokenInput = form.elements.namedItem('token');
        if (!looksLikeToken(values.token)) {
          fieldError(tokenInput, 'این مقدار شبیه توکن گیت‌هاب نیست.');
          tokenInput.focus();
          return;
        }
        const repo = repoConfig(values);
        if (!repo) { showError(c, 'نام مالک، مخزن یا شاخه معتبر نیست.'); return; }
        setButtonBusy(submit, true, 'در حال اتصال…');
        try {
          await unlockAndEnter({ vault: null, repo, token: values.token, adminName: values.adminName });
          c.close();
        } catch (err) {
          setButtonBusy(submit, false);
          showError(c, err?.message || 'اتصال ناموفق بود.');
        }
      });
    }
  });
}

function enterDemo() {
  const data = normalizeStore(state.data || makeDefaultData());
  startAdminSession({
    data,
    baseline: data,
    sha: null,
    site: state.site,
    repo: state.repo,
    api: null,
    user: { name: 'پیش‌نمایش' },
    vault: null,
    vaultUrl: null,
    mode: 'demo'
  });
  toast('حالت پیش‌نمایش فعال شد؛ تغییرات ذخیره یا منتشر نمی‌شوند.', { type: 'info', duration: 6000 });
}

async function doLogout() {
  if (state.dirty) {
    const ok = await confirmDialog({
      title: 'خروج از حالت مدیریت',
      message: 'تغییرات منتشرنشده دارید. با خروج، این تغییرات از بین می‌رود.',
      confirmText: 'خروج بدون انتشار',
      danger: true
    });
    if (!ok) return;
  }
  endAdminSession();
  document.querySelectorAll('dialog.sheet[open]').forEach((d) => { try { d.close(); } catch { /* ignore */ } });
  toast('از حالت مدیریت خارج شدید', { type: 'ok' });
}

/* ── Admin menus ────────────────────────────────────────────────────────── */

function openAdminMenu(anchor) {
  openMenu(anchor, [
    { label: 'انتشار تغییرات', icon: 'cloud_upload', onSelect: openPublish },
    { label: 'افزودن دستگاه', icon: 'add', onSelect: () => openDeviceEditor({}) },
    { label: 'دسته‌بندی جدید', icon: 'category', onSelect: () => openCategoryEditor({}) },
    { separator: true },
    { label: 'تنظیمات فروشگاه', icon: 'settings', onSelect: openSettings },
    { label: 'رمز و توکن', icon: 'key', onSelect: openSecurity },
    { label: 'نسخه پشتیبان', icon: 'download', onSelect: exportBackup },
    { label: 'راهنمای مدیر', icon: 'help', onSelect: openHelp },
    { label: 'تاریخچه', icon: 'history', onSelect: () => document.dispatchEvent(new CustomEvent('ol:history')) },
    { separator: true },
    { label: 'بازنشانی لیست', icon: 'delete_forever', danger: true, onSelect: openResetSheet },
    { label: isDemo() ? 'خروج از پیش‌نمایش' : 'قفل کردن', icon: 'lock', danger: true, onSelect: doLogout }
  ], { align: 'end' });
}

function openAddMenu(anchor) {
  openMenu(anchor, [
    { heading: 'افزودن' },
    { label: 'دستگاه جدید', icon: 'add', onSelect: () => openDeviceEditor({}) },
    { label: 'دسته‌بندی جدید', icon: 'category', onSelect: () => openCategoryEditor({}) },
    { separator: true },
    { label: 'تنظیمات فروشگاه', icon: 'settings', onSelect: openSettings },
    { label: 'رمز و توکن', icon: 'key', onSelect: openSecurity }
  ], { align: 'start' });
}

function openDeviceMenu(anchor, id) {
  const device = state.data?.devices.find((d) => d.id === id);
  if (!device) return;
  const siblings = state.data.devices
    .filter((d) => d.categoryId === device.categoryId)
    .sort((a, b) => a.order - b.order);
  const idx = siblings.findIndex((d) => d.id === id);
  openMenu(anchor, [
    { label: 'ویرایش دستگاه', icon: 'edit', onSelect: () => openDeviceEditor({ id }) },
    { label: 'تکثیر', icon: 'content_copy', onSelect: () => duplicateDevice(id) },
    { label: 'انتقال به بالای دسته', icon: 'arrow_upward', disabled: idx <= 0, onSelect: () => moveDevice(id, -1) },
    { label: 'انتقال به پایین دسته', icon: 'arrow_downward', disabled: idx < 0 || idx >= siblings.length - 1, onSelect: () => moveDevice(id, 1) },
    { separator: true },
    {
      label: device.hidden ? 'نمایش در سایت' : 'پنهان کردن از سایت',
      icon: device.hidden ? 'visibility' : 'visibility_off',
      onSelect: () => toggleDeviceFlag(id, 'hidden')
    },
    {
      label: device.featured ? 'حذف از پیشنهادها' : 'افزودن به پیشنهادها',
      icon: 'star',
      onSelect: () => toggleDeviceFlag(id, 'featured')
    },
    { separator: true },
    { label: 'حذف دستگاه', icon: 'delete', danger: true, onSelect: () => deleteDevice(id) }
  ], { align: 'end' });
}

/* ── Device actions ─────────────────────────────────────────────────────── */

function toggleDeviceFlag(id, flag) {
  mutate((d) => {
    const device = d.devices.find((x) => x.id === id);
    if (!device) return;
    device[flag] = !device[flag];
    device.updatedAt = new Date().toISOString();
  }, 'data');
  toast('ذخیره شد؛ برای اعمال روی سایت منتشر کنید.', { type: 'ok' });
}

function moveDevice(id, dir) {
  mutate((d) => {
    const device = d.devices.find((x) => x.id === id);
    if (!device) return;
    const siblings = d.devices.filter((x) => x.categoryId === device.categoryId).sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((x) => x.id === id);
    const other = siblings[idx + dir];
    if (!other) return;
    const a = siblings[idx];
    const b = other;
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;
    if (a.order === b.order) {
      siblings.forEach((x, i) => { x.order = i; });
    }
    a.updatedAt = new Date().toISOString();
  }, 'data');
}

function duplicateDevice(id) {
  const source = state.data?.devices.find((d) => d.id === id);
  if (!source) return;
  mutate((d) => {
    const now = new Date().toISOString();
    const maxOrder = d.devices.reduce((m, x) => Math.max(m, x.order), 0);
    d.devices.push({
      ...deepClone(source),
      id: uid('dev'),
      name: `${source.name} (کپی)`,
      featured: false,
      hidden: true,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    });
  }, 'data');
  toast('یک نسخه کپی ساخته شد (پنهان). برای ویرایش، آن را باز کنید.', { type: 'ok', duration: 4200 });
}

async function deleteDevice(id) {
  const device = state.data?.devices.find((d) => d.id === id);
  if (!device) return;
  const ok = await confirmDialog({
    title: 'حذف دستگاه',
    message: `«${device.name}» از لیست حذف می‌شود. این تغییر بعد از انتشار روی سایت اعمال می‌شود.`,
    confirmText: 'حذف کن',
    danger: true
  });
  if (!ok) return;
  mutate((d) => {
    d.devices = d.devices.filter((x) => x.id !== id);
  }, 'data');
  toast('دستگاه حذف شد. برای اعمال، منتشر کنید.', { type: 'ok' });
}

function openDeviceEditor({ id = null, categoryId = '' } = {}) {
  if (!isAdmin()) { openLogin(); return; }
  if (!state.data.categories.length) {
    openSheet({
      title: 'اول یک دسته بسازید',
      size: 'narrow',
      body: `<p class="t-sm" style="color:var(--text-2);line-height:1.9">دستگاه‌ها داخل دسته‌بندی‌ها قرار می‌گیرند. قبل از افزودن دستگاه، حداقل یک دسته بسازید.</p>`,
      footer: `<span class="spacer"></span><button class="btn btn--filled btn--sm" type="button" data-new-cat>${icon('category', { size: 17 })} ساخت دسته</button>`,
      onMount: (c) => c.el.querySelector('[data-new-cat]')?.addEventListener('click', () => { c.close(); openCategoryEditor({}); })
    });
    return;
  }
  const device = id ? state.data.devices.find((d) => d.id === id) : null;
  if (id && !device) { toast('دستگاه پیدا نشد', { type: 'err' }); return; }
  const isNew = !device;
  const draft = device || {
    name: '', brand: '', categoryId: categoryId || state.data.categories[0]?.id || '',
    price: 0, priceOnRequest: false, stock: 1, condition: 'نو', warranty: '',
    specs: {}, note: '', image: '', featured: false, hidden: false
  };
  const categoryOptions = [
    ...state.data.categories.map((c) => ({ value: c.id, label: c.title })),
    { value: '', label: 'بدون دسته' }
  ];
  const conditionOptions = CONDITION_OPTIONS.map((c) => ({ value: c, label: c }));

  const sheet = openSheet({
    title: isNew ? 'افزودن دستگاه' : 'ویرایش دستگاه',
    subtitle: isNew ? 'اطلاعات دستگاه را کامل کنید' : draft.name,
    size: 'wide',
    body: `
      <form id="deviceForm" class="sheet__section" novalidate>
        ${errorNote('')}
        <div class="grid-2">
          ${fieldHtml({ label: 'نام دستگاه', name: 'name', value: draft.name, required: true, maxlength: 120, placeholder: 'مثلاً آیفون ۱۶ پرو مکس ۲۵۶ گیگ' })}
          ${fieldHtml({ label: 'برند', name: 'brand', value: draft.brand, maxlength: 60, placeholder: 'Apple' })}
        </div>
        <div class="grid-2">
          ${selectHtml({ label: 'دسته‌بندی', name: 'categoryId', value: draft.categoryId, options: categoryOptions, required: false })}
          ${selectHtml({ label: 'وضعیت کالا', name: 'condition', value: draft.condition, options: conditionOptions })}
        </div>
        <div class="grid-2">
          ${fieldHtml({ label: 'قیمت', name: 'price', value: draft.price ? String(draft.price) : '', type: 'text', inputmode: 'numeric', ltr: true, hint: `به ${state.data.settings.currency || 'تومان'} — خالی یا صفر یعنی «استعلام قیمت»` })}
          ${fieldHtml({ label: 'موجودی', name: 'stock', value: String(draft.stock), type: 'number', min: 0, max: 9999, step: 1, ltr: true, hint: 'تعداد دستگاه موجود در انبار' })}
        </div>
        <label class="check" style="margin-top:-4px">
          <input type="checkbox" name="priceOnRequest" ${draft.priceOnRequest ? 'checked' : ''}>
          <span>قیمت را اعلام نکنید و به‌جای آن «استعلام قیمت» نمایش داده شود.</span>
        </label>
        <div class="grid-2">
          ${fieldHtml({ label: 'گارانتی', name: 'warranty', value: draft.warranty, maxlength: 80, placeholder: '۱۸ ماه گارانتی شرکتی' })}
          ${fieldHtml({ label: 'آدرس تصویر (اختیاری)', name: 'image', value: draft.image, ltr: true, autocomplete: 'off', placeholder: 'https://…', hint: 'اگر خالی باشد، آیکون دسته نمایش داده می‌شود.' })}
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${icon('tune', { size: 18 })} مشخصات دسته</div>
          <div id="specsHost" class="grid-2"></div>
          <div class="form-note">
            ${icon('info', { size: 18 })}
            <span>این فیلدها از دسته‌بندی انتخاب‌شده می‌آیند. برای تغییر عنوان‌ها، دسته را ویرایش کنید.</span>
          </div>
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${icon('edit_note', { size: 18 })} توضیح و نمایش</div>
          ${fieldHtml({ label: 'توضیح کوتاه', name: 'note', value: draft.note, rows: 2, maxlength: 400, placeholder: 'مثلاً: تک‌سیم، باتری ۱۰۰٪، همراه با جعبه' })}
          <div class="grid-2">
            ${switchHtml({ label: 'نمایش در پیشنهادهای ویژه', name: 'featured', checked: draft.featured })}
            ${switchHtml({ label: 'پنهان کردن از سایت', name: 'hidden', checked: draft.hidden, hint: 'برای آماده‌سازی قبل از انتشار' })}
          </div>
        </div>
      </form>
    `,
    footer: `
      ${!isNew ? `<button class="btn btn--text btn--sm" type="button" data-delete style="color:var(--danger)">${icon('delete', { size: 17 })} حذف</button>` : ''}
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="deviceForm" data-save>${icon('check', { size: 17 })} ${isNew ? 'افزودن' : 'ذخیره'}</button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#deviceForm');
      const specsHost = c.el.querySelector('#specsHost');
      const categorySelect = form.elements.namedItem('categoryId');
      const saveBtn = c.el.querySelector('[data-save]');

      const renderSpecs = () => {
        const typed = {};
        specsHost.querySelectorAll('[data-spec-key]').forEach((input) => {
          typed[input.dataset.specKey] = input.value;
        });
        const values = { ...(draft.specs || {}), ...typed };
        const cat = getCategory(state.data, categorySelect.value);
        if (!cat) {
          specsHost.innerHTML = `<div class="form-note" style="grid-column:1/-1">${icon('info', { size: 18 })}<span>این دستگاه بدون دسته است؛ مشخصات اختصاصی ندارد.</span></div>`;
          return;
        }
        if (!cat.fields.length) {
          specsHost.innerHTML = `<div class="form-note" style="grid-column:1/-1">${icon('info', { size: 18 })}<span>برای دسته «${escapeHtml(cat.title)}» هنوز مشخصه‌ای تعریف نشده است. از ویرایش دسته می‌توانید اضافه کنید.</span></div>`;
          return;
        }
        specsHost.innerHTML = cat.fields.map((f) => fieldHtml({
          label: f.unit ? `${f.label} (${f.unit})` : f.label,
          name: `spec_${f.key}`,
          value: values[f.key] || '',
          maxlength: 300,
          placeholder: '—'
        }).replace('<input class="input"', `<input data-spec-key="${escapeHtml(f.key)}" class="input"`)).join('');
      };

      categorySelect.addEventListener('change', renderSpecs);
      renderSpecs();

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        hideError(c);
        const nameInput = form.elements.namedItem('name');
        const name = fieldValue(form, 'name');
        let valid = true;
        if (!name) { fieldError(nameInput, 'نام دستگاه را وارد کنید.'); valid = false; }
        const priceInput = form.elements.namedItem('price');
        const priceOnRequest = fieldChecked(form, 'priceOnRequest');
        const priceRaw = parseNumber(fieldValue(form, 'price'));
        const price = Number.isFinite(priceRaw) ? Math.max(0, Math.round(priceRaw)) : 0;
        if (!priceOnRequest && fieldValue(form, 'price') && !Number.isFinite(priceRaw)) {
          fieldError(priceInput, 'قیمت باید عدد باشد.');
          valid = false;
        }
        const stockInput = form.elements.namedItem('stock');
        const stockRaw = parseNumber(fieldValue(form, 'stock'));
        if (!Number.isFinite(stockRaw) || stockRaw < 0) {
          fieldError(stockInput, 'موجودی باید عددی صفر یا بیشتر باشد.');
          valid = false;
        }
        const image = fieldValue(form, 'image');
        if (image && !/^(https?:\/\/|data:image\/)/i.test(image)) {
          fieldError(form.elements.namedItem('image'), 'آدرس تصویر باید با https:// شروع شود.');
          valid = false;
        }
        if (!valid) {
          form.querySelector('.field.is-invalid .input, .field.is-invalid .select')?.focus();
          showError(c, 'چند مورد نیاز به اصلاح دارد؛ فیلدهای مشخص‌شده را بررسی کنید.');
          return;
        }
        const categoryId = fieldValue(form, 'categoryId');
        const specs = {};
        const cat = getCategory(state.data, categoryId);
        for (const f of cat?.fields || []) {
          const input = specsHost.querySelector(`[data-spec-key="${CSS.escape(f.key)}"]`);
          const value = input ? input.value.trim() : '';
          if (value) specs[f.key] = value;
        }
        const preserved = { ...(draft.specs || {}) };
        for (const key of Object.keys(preserved)) {
          if (!(key in specs) && !(cat?.fields || []).some((f) => f.key === key)) {
            specs[key] = preserved[key];
          }
        }
        const patch = {
          name,
          brand: fieldValue(form, 'brand'),
          categoryId,
          condition: fieldValue(form, 'condition') || CONDITION_OPTIONS[0],
          price,
          priceOnRequest,
          stock: Math.round(stockRaw),
          warranty: fieldValue(form, 'warranty'),
          image,
          note: fieldValue(form, 'note'),
          featured: fieldChecked(form, 'featured'),
          hidden: fieldChecked(form, 'hidden'),
          specs
        };
        setButtonBusy(saveBtn, true, 'ذخیره…');
        try {
          mutate((d) => {
            const now = new Date().toISOString();
            if (isNew) {
              const maxOrder = d.devices.reduce((m, x) => Math.max(m, x.order), 0);
              d.devices.push({
                ...patch,
                id: uid('dev'),
                order: maxOrder + 1,
                createdAt: now,
                updatedAt: now
              });
            } else {
              const target = d.devices.find((x) => x.id === device.id);
              if (!target) return;
              Object.assign(target, patch, { updatedAt: now });
            }
          }, 'data');
          c.close();
          toast(isNew ? 'دستگاه اضافه شد؛ برای دیدن روی سایت منتشر کنید.' : 'تغییرات دستگاه ذخیره شد.', { type: 'ok' });
        } catch (err) {
          setButtonBusy(saveBtn, false);
          showError(c, err.message || 'ذخیره ناموفق بود.');
        }
      });

      c.el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'حذف دستگاه',
          message: `«${device.name}» حذف شود؟`,
          confirmText: 'حذف',
          danger: true
        });
        if (!ok) return;
        mutate((d) => { d.devices = d.devices.filter((x) => x.id !== device.id); }, 'data');
        c.close();
        toast('دستگاه حذف شد.', { type: 'ok' });
      });
    }
  });
  return sheet;
}

/* ── Category editor ────────────────────────────────────────────────────── */

function catFieldRow(field) {
  const row = document.createElement('div');
  row.className = 'cat-field';
  row.dataset.fieldRow = '1';
  row.dataset.key = field.key;
  row.innerHTML = `
    <input class="input" data-field-label value="${escapeHtml(field.label)}" placeholder="عنوان مشخصه" maxlength="40" aria-label="عنوان مشخصه">
    <input class="input" data-field-unit value="${escapeHtml(field.unit || '')}" placeholder="واحد" maxlength="18" aria-label="واحد">
    <label class="cat-field__show" title="نمایش در ردیف">
      <input type="checkbox" data-field-show ${field.showInRow ? 'checked' : ''} aria-label="نمایش در ردیف دستگاه">
    </label>
    <button class="icon-btn" type="button" data-move="up" aria-label="بالا">${icon('arrow_upward', { size: 16 })}</button>
    <button class="icon-btn" type="button" data-move="down" aria-label="پایین">${icon('arrow_downward', { size: 16 })}</button>
    <button class="icon-btn" type="button" data-remove-field aria-label="حذف مشخصه" style="color:var(--danger)">${icon('close', { size: 16 })}</button>
  `;
  return row;
}

function openCategoryEditor({ id = null } = {}) {
  if (!isAdmin()) { openLogin(); return; }
  const category = id ? state.data.categories.find((c) => c.id === id) : null;
  const isNew = !category;
  const draft = category || { ...defaultCategory('', 'category'), fields: [] };
  const icons = [...new Set(CATEGORY_ICONS)];
  const sheet = openSheet({
    title: isNew ? 'دسته‌بندی جدید' : 'ویرایش دسته',
    subtitle: isNew ? 'هر دسته، عنوان‌های مشخصات خودش را دارد' : draft.title,
    size: 'wide',
    body: `
      <form id="categoryForm" class="sheet__section" novalidate>
        ${errorNote('')}
        <div class="grid-2">
          ${fieldHtml({ label: 'نام دسته', name: 'title', value: draft.title, required: true, maxlength: 60, placeholder: 'مثلاً لپ‌تاپ' })}
          ${fieldHtml({ label: 'توضیح کوتاه', name: 'description', value: draft.description, maxlength: 120, placeholder: 'برای بازدیدکننده نمایش داده می‌شود' })}
        </div>
        <div class="field">
          <span class="field__label">آیکون دسته</span>
          <input type="hidden" name="icon" value="${escapeHtml(draft.icon || 'category')}" id="catIconValue">
          <div class="icon-picker" id="iconPicker" role="group" aria-label="انتخاب آیکون">
            ${icons.map((name) => `
              <button class="icon-picker__opt" type="button" data-icon-opt="${name}"
                aria-pressed="${name === (draft.icon || 'category')}" aria-label="${name}" title="${name}">
                ${icon(name, { size: 19 })}
              </button>`).join('')}
          </div>
        </div>
        <div class="sheet__section">
          <div class="row">
            <div class="sheet__legend">${icon('tune', { size: 18 })} مشخصات این دسته</div>
            <span class="spacer"></span>
            <button class="btn btn--tonal btn--sm" type="button" data-add-field>${icon('add', { size: 17 })} افزودن مشخصه</button>
          </div>
          <div class="cat-fields" id="catFields"></div>
          <div class="form-note">
            ${icon('info', { size: 18 })}
            <span>این عنوان‌ها هنگام ویرایش دستگاه‌های این دسته نمایش داده می‌شوند. تیک «نمایش در ردیف» باعث می‌شود مقدار آن مشخصه کنار نام دستگاه در لیست دیده شود.</span>
          </div>
        </div>
        <div data-delete-zone></div>
      </form>
    `,
    footer: `
      ${!isNew ? `<button class="btn btn--text btn--sm" type="button" data-delete-cat style="color:var(--danger)">${icon('delete', { size: 17 })} حذف دسته</button>` : ''}
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="categoryForm" data-save>${icon('check', { size: 17 })} ${isNew ? 'ساخت دسته' : 'ذخیره'}</button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#categoryForm');
      const host = c.el.querySelector('#catFields');
      const picker = c.el.querySelector('#iconPicker');
      const iconValue = c.el.querySelector('#catIconValue');
      const saveBtn = c.el.querySelector('[data-save]');

      (draft.fields || []).forEach((f) => host.append(catFieldRow(f)));
      if (!(draft.fields || []).length) {
        host.append(catFieldRow(defaultField({ label: '', key: uid('f'), showInRow: true })));
      }

      picker.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-icon-opt]');
        if (!btn) return;
        picker.querySelectorAll('[data-icon-opt]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        iconValue.value = btn.dataset.iconOpt;
      });

      host.addEventListener('click', (event) => {
        const row = event.target.closest('[data-field-row]');
        if (!row) return;
        if (event.target.closest('[data-remove-field]')) { row.remove(); return; }
        const move = event.target.closest('[data-move]');
        if (!move) return;
        if (move.dataset.move === 'up' && row.previousElementSibling) {
          row.parentElement.insertBefore(row, row.previousElementSibling);
        } else if (move.dataset.move === 'down' && row.nextElementSibling) {
          row.parentElement.insertBefore(row.nextElementSibling, row);
        }
        row.querySelector('[data-field-label]')?.focus();
      });

      c.el.querySelector('[data-add-field]')?.addEventListener('click', () => {
        if (host.querySelectorAll('[data-field-row]').length >= 12) {
          toast('حداکثر ۱۲ مشخصه برای هر دسته مجاز است.', { type: 'warn' });
          return;
        }
        const row = catFieldRow(defaultField({ label: '', key: uid('f'), showInRow: true }));
        host.append(row);
        row.querySelector('[data-field-label]')?.focus();
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        hideError(c);
        const titleInput = form.elements.namedItem('title');
        const title = fieldValue(form, 'title');
        let valid = true;
        if (!title) { fieldError(titleInput, 'نام دسته را وارد کنید.'); valid = false; }
        const rows = [...host.querySelectorAll('[data-field-row]')];
        const fields = [];
        for (const row of rows) {
          const labelInput = row.querySelector('[data-field-label]');
          const label = labelInput.value.trim();
          const unit = row.querySelector('[data-field-unit]').value.trim();
          const showInRow = row.querySelector('[data-field-show]').checked;
          if (!label) {
            if (unit) {
              row.style.borderColor = 'var(--danger)';
              labelInput.focus();
              valid = false;
              break;
            }
            row.style.borderColor = '';
            continue;
          }
          row.style.borderColor = '';
          fields.push({ key: row.dataset.key, label, unit, type: 'text', showInRow });
        }
        if (!valid) {
          showError(c, 'برای هر مشخصه یک عنوان بنویسید یا ردیف خالی را حذف کنید.');
          return;
        }
        const patch = {
          title,
          description: fieldValue(form, 'description'),
          icon: iconValue.value || 'category',
          fields
        };
        setButtonBusy(saveBtn, true, 'ذخیره…');
        try {
          mutate((d) => {
            if (isNew) {
              d.categories.push({ ...patch, id: uid('cat') });
            } else {
              const target = d.categories.find((x) => x.id === draft.id);
              if (target) Object.assign(target, patch);
            }
          }, 'data');
          c.close();
          toast(isNew ? 'دسته ساخته شد.' : 'دسته ذخیره شد.', { type: 'ok' });
        } catch (err) {
          setButtonBusy(saveBtn, false);
          showError(c, err.message || 'ذخیره ناموفق بود.');
        }
      });

      c.el.querySelector('[data-delete-cat]')?.addEventListener('click', async () => {
        c.close();
        await deleteCategory(draft.id);
      });
    }
  });
  return sheet;
}

async function deleteCategory(id) {
  const category = state.data?.categories.find((c) => c.id === id);
  if (!category) return;
  const devices = state.data.devices.filter((d) => d.categoryId === id);
  const others = state.data.categories.filter((c) => c.id !== id);
  if (!devices.length) {
    const ok = await confirmDialog({
      title: 'حذف دسته',
      message: `دسته «${category.title}» حذف شود؟ هیچ دستگاهی در آن نیست.`,
      confirmText: 'حذف',
      danger: true
    });
    if (!ok) return;
    mutate((d) => { d.categories = d.categories.filter((c) => c.id !== id); }, 'data');
    toast('دسته حذف شد.', { type: 'ok' });
    return;
  }
  const options = [
    ...others.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.title)}</option>`),
    '<option value="">بدون دسته</option>'
  ].join('');
  const sheet = openSheet({
    title: 'حذف دسته',
    subtitle: `${devices.length} دستگاه در «${category.title}»`,
    size: 'narrow',
    body: `
      <form id="deleteCatForm" class="stack" style="gap:14px">
        <p class="t-sm" style="color:var(--text-2);line-height:1.9">این دسته حذف می‌شود، اما دستگاه‌های آن حذف نمی‌شوند. انتخاب کنید به کدام دسته منتقل شوند:</p>
        <label class="field">
          <span class="field__label">دسته مقصد</span>
          <select class="select" name="target">${options}</select>
        </label>
      </form>
    `,
    footer: `
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--danger btn--sm" type="button" data-confirm>${icon('delete', { size: 17 })} حذف و انتقال</button>
    `
  });
  sheet.el.querySelector('[data-confirm]')?.addEventListener('click', () => {
    const target = sheet.el.querySelector('select[name="target"]').value;
    mutate((d) => {
      d.devices.forEach((device) => {
        if (device.categoryId === id) {
          device.categoryId = target;
          device.updatedAt = new Date().toISOString();
        }
      });
      d.categories = d.categories.filter((c) => c.id !== id);
    }, 'data');
    sheet.close();
    toast('دسته حذف شد و دستگاه‌ها منتقل شدند.', { type: 'ok' });
  });
}

/* ── Settings ───────────────────────────────────────────────────────────── */

function openSettings(tab = 'store') {
  if (!isAdmin()) { openLogin(); return; }
  const { store, settings } = state.data;
  const sheet = openSheet({
    title: 'تنظیمات فروشگاه',
    subtitle: 'این اطلاعات بلافاصله در سایت استفاده می‌شوند',
    size: 'wide',
    body: `
      <form id="settingsForm" class="sheet__section" novalidate>
        ${errorNote('')}
        <div class="sheet__section">
          <div class="sheet__legend">${icon('storefront', { size: 18 })} هویت فروشگاه</div>
          <div class="grid-2">
            ${fieldHtml({ label: 'نام فروشگاه', name: 'name', value: store.name, required: true, maxlength: 60 })}
            ${fieldHtml({ label: 'شعار کوتاه', name: 'tagline', value: store.tagline, maxlength: 100, hint: 'زیر نام فروشگاه در صفحه اول' })}
          </div>
          ${fieldHtml({ label: 'توضیح فروشگاه', name: 'description', value: store.description, rows: 2, maxlength: 300 })}
          <div class="grid-2">
            ${fieldHtml({ label: 'تلفن', name: 'phone', value: store.phone, ltr: true, inputmode: 'tel', placeholder: '۰۹۱۲۱۲۳۴۵۶۷' })}
            ${fieldHtml({ label: 'واتساپ', name: 'whatsapp', value: store.whatsapp, ltr: true, inputmode: 'tel', hint: 'با کد کشور، مثلاً 989121234567' })}
          </div>
          <div class="grid-2">
            ${fieldHtml({ label: 'اینستاگرام', name: 'instagram', value: store.instagram, ltr: true, placeholder: 'shop_name', hint: 'بدون @ یا آدرس کامل' })}
            ${fieldHtml({ label: 'ساعات کاری', name: 'hours', value: store.hours, maxlength: 100 })}
          </div>
          ${fieldHtml({ label: 'آدرس', name: 'address', value: store.address, maxlength: 160 })}
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${icon('palette', { size: 18 })} نمایش لیست</div>
          <div class="grid-3">
            ${selectHtml({ label: 'پوسته پیش‌فرض', name: 'theme', value: settings.theme, options: [
              { value: 'auto', label: 'خودکار (سیستم)' },
              { value: 'light', label: 'روشن' },
              { value: 'dark', label: 'تاریک' }
            ] })}
            ${fieldHtml({ label: 'واحد پول', name: 'currency', value: settings.currency, maxlength: 20 })}
            ${selectHtml({ label: 'اعداد', name: 'numerals', value: settings.numerals, options: [
              { value: 'fa', label: 'فارسی (۱۲۳)' },
              { value: 'en', label: 'لاتین (123)' }
            ] })}
          </div>
          <div class="grid-2">
            ${fieldHtml({ label: 'آستانه «کمیاب»', name: 'lowStockThreshold', type: 'number', value: String(settings.lowStockThreshold), min: 0, max: 99, ltr: true, hint: 'اگر موجودی از این عدد کمتر یا مساوی بود، «کمیاب» نمایش داده شود.' })}
            ${fieldHtml({ label: 'نام نمایشی مدیر', name: 'adminName', value: settings.adminName, maxlength: 60, hint: 'در «آخرین به‌روزرسانی» دیده می‌شود.' })}
          </div>
          <div class="grid-2">
            ${switchHtml({ label: 'نمایش قیمت‌ها', name: 'showPrices', checked: settings.showPrices, hint: 'در صورت خاموش بودن، «استعلام قیمت» نمایش داده می‌شود.' })}
            ${switchHtml({ label: 'نمایش تعداد دقیق موجودی', name: 'showExactStock', checked: settings.showExactStock, hint: 'در صورت خاموش بودن فقط «موجود / ناموجود» دیده می‌شود.' })}
          </div>
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${icon('security', { size: 18 })} امنیت و اتصال</div>
          <div class="form-note">
            ${icon('key', { size: 18 })}
            <span>مخزن: <span dir="ltr" style="font-family:monospace">${escapeHtml(repoLabel(state.repo))}</span><br>
            ${state.vault ? 'توکن شما رمزگذاری‌شده در فایل vault.json ذخیره شده است.' : 'این نشست با توکن موقت باز شده؛ تغییر رمز در دسترس نیست.'}</span>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn--outlined btn--sm" type="button" data-inline-action="security">${icon('key', { size: 17 })} تغییر رمز / توکن</button>
            <button class="btn btn--text btn--sm" type="button" data-inline-action="logout">${icon('lock', { size: 17 })} قفل کردن</button>
          </div>
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${icon('download', { size: 18 })} نسخه پشتیبان</div>
          <p class="t-xs" style="color:var(--text-3);line-height:1.9">فایل JSON دوره‌ای از لیست بگیرید؛ برای بازیابی یا انتقال به مخزن دیگر لازم است.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn--outlined btn--sm" type="button" data-inline-action="export-backup">${icon('download', { size: 17 })} دریافت نسخه پشتیبان</button>
            <button class="btn btn--text btn--sm" type="button" data-inline-action="export-csv">${icon('table_rows', { size: 17 })} خروجی CSV (اکسل)</button>
            <button class="btn btn--text btn--sm" type="button" data-inline-action="import-backup">${icon('cloud_upload', { size: 17 })} بازیابی از فایل</button>
            ${state.dirty ? `<button class="btn btn--text btn--sm" type="button" data-inline-action="discard">${icon('replay', { size: 17 })} بازگشت به نسخه منتشرشده</button>` : ''}
          </div>
        </div>

        <div class="sheet__section danger-zone">
          <div class="sheet__legend">${icon('warning', { size: 18 })} منطقه خطر</div>
          <p class="t-xs" style="color:var(--text-3);line-height:1.9">
            همه دستگاه‌ها و دسته‌بندی‌ها یک‌جا پاک می‌شوند. اطلاعات فروشگاه، تنظیمات و رمز دست‌نخورده می‌مانند.
            قبل از اجرا می‌توانید نسخه پشتیبان بگیرید.
          </p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn--danger btn--sm" type="button" data-inline-action="reset">
              ${icon('delete_forever', { size: 17 })} بازنشانی همه داده‌های لیست
            </button>
          </div>
        </div>
      </form>
    `,
    footer: `
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="settingsForm" data-save>${icon('check', { size: 17 })} ذخیره تنظیمات</button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#settingsForm');
      const saveBtn = c.el.querySelector('[data-save]');
      c.el.querySelectorAll('[data-inline-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const kind = btn.dataset.inlineAction;
          c.close();
          if (kind === 'security') openSecurity();
          else if (kind === 'logout') doLogout();
          else if (kind === 'discard') discardChanges();
          else if (kind === 'export-backup') exportBackup();
          else if (kind === 'export-csv') exportCsv();
          else if (kind === 'import-backup') importBackup();
          else if (kind === 'reset') openResetSheet();
        });
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        hideError(c);
        const name = fieldValue(form, 'name');
        if (!name) {
          fieldError(form.elements.namedItem('name'), 'نام فروشگاه را وارد کنید.');
          showError(c, 'نام فروشگاه نمی‌تواند خالی باشد.');
          return;
        }
        const lowRaw = parseNumber(fieldValue(form, 'lowStockThreshold'));
        const low = Number.isFinite(lowRaw) ? Math.min(99, Math.max(0, Math.round(lowRaw))) : 2;
        setButtonBusy(saveBtn, true, 'ذخیره…');
        try {
          mutate((d) => {
            Object.assign(d.store, {
              name,
              tagline: fieldValue(form, 'tagline'),
              description: fieldValue(form, 'description'),
              phone: fieldValue(form, 'phone'),
              whatsapp: fieldValue(form, 'whatsapp'),
              instagram: fieldValue(form, 'instagram'),
              address: fieldValue(form, 'address'),
              hours: fieldValue(form, 'hours')
            });
            Object.assign(d.settings, {
              theme: fieldValue(form, 'theme'),
              currency: fieldValue(form, 'currency') || 'تومان',
              numerals: fieldValue(form, 'numerals') === 'en' ? 'en' : 'fa',
              lowStockThreshold: low,
              adminName: fieldValue(form, 'adminName') || 'مدیر فروشگاه',
              showPrices: fieldChecked(form, 'showPrices'),
              showExactStock: fieldChecked(form, 'showExactStock')
            });
          }, 'settings');
          c.close();
          toast('تنظیمات ذخیره شد؛ برای اعمال روی سایت منتشر کنید.', { type: 'ok' });
        } catch (err) {
          setButtonBusy(saveBtn, false);
          showError(c, err.message || 'ذخیره ناموفق بود.');
        }
      });
    }
  });
  return sheet;
}

/* ── Security (password / token rotation) ───────────────────────────────── */

function openSecurity() {
  if (!isAdmin()) { openLogin(); return; }
  if (!state.vault || !state.api) {
    openSheet({
      title: 'رمز و توکن',
      size: 'narrow',
      body: `
        <div class="form-note">
          ${icon('info', { size: 18 })}
          <span>این نشست با «توکن موقت» باز شده و فایل امنیتی در دسترس نیست. برای ساخت رمز، صفحه راه‌اندازی را کامل کنید.</span>
        </div>
        <p class="t-xs" style="margin-top:12px;color:var(--text-3);line-height:1.9">با صفحه راه‌اندازی می‌توانید همین توکن را با یک رمز عبور سینک کنید؛ از آن به بعد ورود فقط با رمز انجام می‌شود.</p>
      `,
      footer: `<span class="spacer"></span><a class="btn btn--filled btn--sm" href="setup/">${icon('rocket_launch', { size: 17 })} صفحه راه‌اندازی</a>`
    });
    return;
  }
  const sheet = openSheet({
    title: 'رمز و توکن',
    subtitle: 'تغییر رمز مدیریت یا جایگزینی توکن گیت‌هاب',
    size: 'narrow',
    body: `
      <form id="securityForm" class="stack" style="gap:14px" novalidate>
        ${errorNote('')}
        <div class="form-note">
          ${icon('security', { size: 18 })}
          <span>رمز جدید فقط برای باز کردن توکن استفاده می‌شود؛ خود توکن رمزگذاری‌شده در <span dir="ltr">data/vault.json</span> می‌ماند و هیچ‌گاه به‌صورت متن ساده منتشر نمی‌شود.</span>
        </div>
        <div class="field">
          <span class="field__label">رمز عبور جدید<span class="req">*</span></span>
          <div class="password-wrap">
            <input class="input" type="password" name="password" id="newPassword" autocomplete="new-password" placeholder="حداقل ۱۰ کاراکتر">
            <button class="icon-btn" type="button" data-toggle-password aria-label="نمایش رمز">${icon('visibility', { size: 19 })}</button>
          </div>
          <div class="pw-meter" data-pw-meter data-score="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <div class="pw-estimate" data-pw-estimate data-level="weak" role="status" hidden></div>
          <span class="field__hint">پیشنهاد: چهار کلمهٔ بی‌ربط با خط تیره؛ مثل «کتاب-پرنده-آبی-ماه».</span>
          <span class="field__error"></span>
        </div>
        ${fieldHtml({ label: 'تکرار رمز جدید', name: 'password2', type: 'password', autocomplete: 'new-password', required: true })}
        ${fieldHtml({ label: 'یادآور رمز (اختیاری)', name: 'hint', value: state.vault.hint || '', maxlength: 80, hint: 'مثلاً «شماره پلاک + اسم فروشگاه» — خود رمز را ننویسید.' })}
        <div class="sheet__section">
          <div class="sheet__legend">${icon('key', { size: 18 })} توکن گیت‌هاب</div>
          ${fieldHtml({ label: 'توکن جدید (اختیاری)', name: 'token', ltr: true, autocomplete: 'off', placeholder: 'برای تغییر، توکن تازه را اینجا بگذارید', hint: 'اگر خالی بماند، توکن فعلی دوباره رمزگذاری می‌شود.' })}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn--outlined btn--sm" type="button" data-download-vault>${icon('download', { size: 17 })} دریافت فایل پشتیبان امنیتی</button>
        </div>
      </form>
    `,
    footer: `
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="securityForm" data-save>${icon('shield', { size: 17 })} ذخیره امن</button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#securityForm');
      const pw = form.elements.namedItem('password');
      const meter = c.el.querySelector('[data-pw-meter]');
      const saveBtn = c.el.querySelector('[data-save]');
      const estimate = c.el.querySelector('[data-pw-estimate]');
      const renderEstimate = () => {
        const value = pw.value;
        meter.dataset.score = String(passwordScore(value));
        if (!estimate) return;
        if (!value) { estimate.hidden = true; estimate.textContent = ''; return; }
        const seconds = estimateCrackSeconds(value);
        estimate.hidden = false;
        estimate.dataset.level = seconds < WEAK_SECONDS ? 'weak' : seconds < YEAR_SECONDS ? 'ok' : 'strong';
        estimate.textContent = seconds < WEAK_SECONDS
          ? `در برابر حملهٔ آفلاین ${formatCrackTime(seconds)} دوام می‌آورد — کافی نیست.`
          : `تخمین در برابر حملهٔ آفلاین (${formatCrackTime(seconds)}) با فرض واژه‌نامه و یک کارت گرافیک.`;
      };
      pw.addEventListener('input', renderEstimate);
      c.el.querySelector('[data-toggle-password]')?.addEventListener('click', (event) => {
        const show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        event.currentTarget.innerHTML = icon(show ? 'visibility_off' : 'visibility', { size: 19 });
        pw.focus();
      });
      c.el.querySelector('[data-download-vault]')?.addEventListener('click', () => {
        if (!state.vault) return;
        download('vault.json', `${JSON.stringify(state.vault, null, 2)}\n`);
        toast('فایل امنیتی دانلود شد؛ آن را در جای مطمئن نگه دارید.', { type: 'ok' });
      });
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideError(c);
        const password = pw.value;
        const password2 = fieldValue(form, 'password2');
        const hint = fieldValue(form, 'hint');
        const newToken = fieldValue(form, 'token');
        if (password.length < 10) {
          fieldError(pw, 'رمز جدید باید حداقل ۱۰ کاراکتر باشد.');
          pw.focus();
          return;
        }
        if (password !== password2) {
          fieldError(form.elements.namedItem('password2'), 'تکرار رمز مطابقت ندارد.');
          return;
        }
        if (passwordScore(password) < 2) {
          showError(c, 'رمز ضعیف است؛ از حروف و عدد یا یک عبارت بلندتر استفاده کنید.');
          return;
        }
        if (estimateCrackSeconds(password) < WEAK_SECONDS) {
          fieldError(pw, `این رمز در برابر حملهٔ آفلاین فقط ${formatCrackTime(estimateCrackSeconds(password))} دوام می‌آورد؛ چهار کلمهٔ بی‌ربط بگذارید.`);
          pw.focus();
          return;
        }
        if (newToken && !looksLikeToken(newToken)) {
          showError(c, 'مقدار توکن جدید معتبر به نظر نمی‌رسد.');
          return;
        }
        setButtonBusy(saveBtn, true, 'ذخیره امن…');
        try {
          let token = state.api.token;
          if (newToken) {
            const probe = createGitHub({ token: newToken, ...state.repo });
            const info = await probe.getRepo();
            if (info.canPush === false) throw new ApiError('توکن جدید دسترسی نوشتن ندارد.');
            token = newToken;
          }
          const sealed = await sealVault({
            password,
            token,
            login: state.user?.login || '',
            repo: state.repo,
            hint
          });
          const content = `${JSON.stringify(sealed, null, 2)}\n`;
          const existing = await state.api.getFile('data/vault.json');
          const res = await state.api.putFile({
            path: 'data/vault.json',
            content,
            message: `به‌روزرسانی رمز مدیریت — ${formatJalaliStamp()}`,
            sha: existing?.sha || null
          });
          state.vault = sealed;
          if (newToken) {
            state.api = createGitHub({ token, ...state.repo });
          }
          c.close();
          toast('رمز و توکن با موفقیت به‌روزرسانی شد.', { type: 'ok' });
          if (res?.commitUrl) {
            console.info('[vault] updated:', res.commitUrl);
          }
        } catch (err) {
          setButtonBusy(saveBtn, false);
          showError(c, err?.message || 'ذخیره امن ناموفق بود.');
        }
      });
    }
  });
  return sheet;
}

/* ── Publish ────────────────────────────────────────────────────────────── */

/**
 * Writes the current draft to data/store.json and marks the session as clean.
 * Used by the publish sheet and by destructive actions (reset) that commit
 * immediately.
 */
async function commitStore(next, message) {
  let sha = state.sha;
  if (!sha) {
    const existing = await state.api.getFile('data/store.json');
    sha = existing?.sha || null;
  }
  const res = await state.api.putFile({
    path: 'data/store.json',
    content: serializeStore(next),
    message,
    sha
  });
  markPublished({ data: next, sha: res.sha, commit: res });
  return res;
}

/* ── Danger zone: reset the whole inventory ─────────────────────────────── */

function openResetSheet() {
  if (!isAdmin()) { openLogin(); return; }
  const data = state.data;
  const devices = data?.devices?.length || 0;
  const categories = data?.categories?.length || 0;
  const numbers = (n) => formatNum(n, currentNumerals());
  const sheet = openSheet({
    title: 'بازنشانی لیست موجودی',
    subtitle: 'همه دستگاه‌ها و دسته‌بندی‌ها حذف می‌شوند',
    size: 'narrow',
    body: `
      <form id="resetForm" class="stack" style="gap:16px" novalidate>
        ${errorNote('')}
        <div class="danger-card">
          ${icon('warning', { size: 22 })}
          <div>
            <b>این کار قابل بازگشت نیست</b>
            <p>با تأیید، ${numbers(devices)} دستگاه و ${numbers(categories)} دسته‌بندی پاک می‌شوند و تغییر
            <b>بلافاصله</b> روی سایت منتشر می‌شود. بازدیدکننده‌ها از آن لحظه لیست خالی می‌بینند.</p>
          </div>
        </div>
        <div class="reset-summary">
          <div class="reset-summary__row is-removed">
            ${icon('delete', { size: 18 })}
            <span>حذف می‌شود: دستگاه‌ها، دسته‌بندی‌ها و مشخصات آن‌ها</span>
          </div>
          <div class="reset-summary__row">
            ${icon('check', { size: 18 })}
            <span>می‌ماند: نام فروشگاه، تماس و آدرس، تنظیمات نمایش، رمز و توکن، تاریخچه</span>
          </div>
        </div>
        <label class="check">
          <input type="checkbox" name="backup" checked>
          <span>قبل از حذف، یک نسخه پشتیبان (فایل JSON) دانلود کن</span>
        </label>
        <label class="field">
          <span class="field__label">برای تأیید، عبارت <b dir="rtl">${escapeHtml(RESET_PHRASE)}</b> را بنویسید<span class="req">*</span></span>
          <input class="input" name="phrase" autocomplete="off" placeholder="${escapeHtml(RESET_PHRASE)}" required>
          <span class="field__hint">این عبارت جلوی حذف اتفاقی را می‌گیرد.</span>
          <span class="field__error"></span>
        </label>
      </form>
    `,
    footer: `
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm btn--danger" type="submit" form="resetForm" data-submit>
        ${icon('delete_forever', { size: 17 })} حذف همه و انتشار
      </button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#resetForm');
      const submit = c.el.querySelector('[data-submit]');
      const phrase = form.elements.namedItem('phrase');
      phrase.focus();
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideError(c);
        const typed = String(phrase.value || '').replace(/\s+/g, ' ').trim();
        if (typed !== RESET_PHRASE) {
          fieldError(phrase, `برای تأیید، دقیقاً «${RESET_PHRASE}» را بنویسید.`);
          phrase.select();
          return;
        }
        if (form.elements.namedItem('backup').checked && state.data) exportBackup();
        setButtonBusy(submit, true, 'در حال حذف…');
        c.setBusy(true);
        try {
          const by = state.user?.name || state.data?.settings?.adminName || 'مدیر فروشگاه';
          const { data: next, removedDevices, removedCategories } = clearInventory(state.data, { by });
          let res = null;
          if (isDemo()) {
            replaceData(next, { baseline: next });
          } else {
            res = await commitStore(next, `بازنشانی لیست موجودی — ${formatJalaliStamp()}`);
          }
          c.close();
          document.querySelectorAll('dialog.sheet[open]').forEach((d) => { try { d.close(); } catch { /* ignore */ } });
          openResetSuccess({ removedDevices, removedCategories, res, demo: isDemo() });
        } catch (err) {
          setButtonBusy(submit, false);
          c.setBusy(false);
          showError(c, err?.message || 'بازنشانی ناموفق بود.');
        }
      });
    }
  });
  return sheet;
}

function openResetSuccess({ removedDevices, removedCategories, res, demo }) {
  const numbers = (n) => formatNum(n, currentNumerals());
  const url = res?.commitUrl || (state.repo ? `https://github.com/${state.repo.owner}/${state.repo.repo}/commits/${state.repo.branch}` : '');
  openSheet({
    title: 'لیست بازنشانی شد',
    size: 'narrow',
    body: `
      <div class="stack" style="gap:16px">
        <div class="login-hero">
          <span class="login-hero__icon">${icon('delete_sweep', { size: 24 })}</span>
          <div>
            <div class="login-hero__title">${numbers(removedDevices)} دستگاه و ${numbers(removedCategories)} دسته حذف شد</div>
            <div class="login-hero__sub">
              ${demo
                ? 'این تغییر فقط در پیش‌نمایش اعمال شد؛ چون توکنی وجود ندارد، چیزی روی مخزن نوشته نشد.'
                : 'فایل data/store.json بازنویسی شد. لیست عمومی تا یک دقیقه خالی می‌شود.'}
            </div>
          </div>
        </div>
        ${demo ? '' : `<div class="form-note">
          ${icon('info', { size: 18 })}
          <span>نسخه پشتیبان در پوشه دانلودهای شماست. برای بازگردانی کامل: تنظیمات → بازیابی از فایل.
          همچنین می‌توانید همان کامیت را در گیت‌هاب Revert کنید.</span>
        </div>`}
      </div>
    `,
    footer: `
      <span class="spacer"></span>
      ${url ? `<a class="btn btn--text btn--sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon('open_in_new', { size: 17 })} تاریخچه گیت‌هاب</a>` : ''}
      <button class="btn btn--filled btn--sm" type="button" data-close>باشه</button>
    `
  });
}

async function openPublish() {
  if (isDemo()) {
    await alertDialog({
      title: 'انتشار در پیش‌نمایش ممکن نیست',
      message: 'در حالت پیش‌نمایش هیچ توکنی وجود ندارد. برای انتشار واقعی، از صفحه راه‌اندازی توکن را با رمز سینک کنید.',
      iconName: 'info'
    });
    return;
  }
  if (!isAdmin() || !state.api) { openLogin(); return; }
  if (!state.dirty) {
    toast('تغییری برای انتشار وجود ندارد.', { type: 'info' });
    return;
  }
  const diff = computeDiff(state.baseline, state.data);
  const defaultMessage = `به‌روزرسانی لیست موجودی — ${formatJalaliStamp()} · ${new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`;
  const changedDevices = [...diff.added, ...diff.updated, ...diff.removed].slice(0, 6);
  const sheet = openSheet({
    title: 'انتشار تغییرات',
    subtitle: `${repoLabel(state.repo)}`,
    body: `
      <form id="publishForm" class="stack" style="gap:16px" novalidate>
        ${errorNote('')}
        <div class="publish-summary">
          <div class="publish-stat"><b>${formatNum(diff.added.length, currentNumerals())}</b><span>دستگاه جدید</span></div>
          <div class="publish-stat"><b>${formatNum(diff.updated.length, currentNumerals())}</b><span>ویرایش دستگاه</span></div>
          <div class="publish-stat"><b>${formatNum(diff.removed.length, currentNumerals())}</b><span>حذف‌شده</span></div>
        </div>
        ${diff.total ? `<div class="diff-list">
          ${[
            ...diff.added.map((d) => ({ tag: '+', cls: '', label: d.name })),
            ...diff.updated.map((d) => ({ tag: '~', cls: 'tag--mod', label: d.name })),
            ...diff.removed.map((d) => ({ tag: '−', cls: 'tag--del', label: d.name })),
            ...diff.catAdded.map((c) => ({ tag: '+', cls: '', label: `دسته: ${c.title}` })),
            ...diff.catUpdated.map((c) => ({ tag: '~', cls: 'tag--mod', label: `دسته: ${c.title}` })),
            ...diff.catRemoved.map((c) => ({ tag: '−', cls: 'tag--del', label: `دسته: ${c.title}` }))
          ].slice(0, 7).map((item) => `
            <div class="diff-item"><span class="tag ${item.cls}">${item.tag}</span><span>${escapeHtml(item.label)}</span></div>
          `).join('')}
          ${diff.total > 7 ? `<div class="diff-item"><span class="tag">…</span><span>و ${formatNum(diff.total - 7, currentNumerals())} تغییر دیگر</span></div>` : ''}
        </div>` : '<div class="form-note">' + icon('info', { size: 18 }) + '<span>تغییری در دستگاه‌ها نیست؛ فقط اطلاعات فروشگاه یا تنظیمات به‌روزرسانی می‌شود.</span></div>'}
        <label class="field">
          <span class="field__label">پیام کامیت<span class="req">*</span></span>
          <input class="input" name="message" value="${escapeHtml(defaultMessage)}" maxlength="160" dir="ltr" style="text-align:left">
          <span class="field__hint">این پیام در تاریخچه گیت‌هاب ثبت می‌شود.</span>
          <span class="field__error"></span>
        </label>
        <div class="form-note">
          ${icon('cloud_upload', { size: 18 })}
          <span>با تأیید، فایل <span dir="ltr">data/store.json</span> در مخزن ذخیره می‌شود. انتشار روی GitHub Pages معمولاً کمتر از یک دقیقه طول می‌کشد.</span>
        </div>
        <div class="commit-row">
          ${icon('cloud_done', { size: 17 })}
          <span>آخرین انتشار ثبت‌شده: ${formatJalaliDateTime(state.baseline.meta.updatedAt)}</span>
          <span class="spacer"></span>
          <span>${formatNum(diff.total, currentNumerals())} تغییر</span>
        </div>
      </form>
    `,
    footer: `
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="publishForm" data-submit>${icon('cloud_upload', { size: 17 })} انتشار روی گیت‌هاب</button>
    `,
    onMount: (c) => {
      const form = c.el.querySelector('#publishForm');
      const submit = c.el.querySelector('[data-submit]');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideError(c);
        const messageInput = form.elements.namedItem('message');
        const message = fieldValue(form, 'message');
        if (!message) { fieldError(messageInput, 'پیام کامیت خالی است.'); messageInput.focus(); return; }
        setButtonBusy(submit, true, 'در حال انتشار…');
        c.setBusy(true);
        try {
          const next = deepClone(state.data);
          const now = new Date().toISOString();
          next.meta.updatedAt = now;
          next.meta.updatedBy = next.settings.adminName || state.user?.name || 'مدیر فروشگاه';
          next.meta.history = [{
            id: uid('h'),
            at: now,
            by: next.meta.updatedBy,
            action: 'publish',
            summary: diff.stockOnly ? 'به‌روزرسانی موجودی' : diffSummary(diff) || message,
            stats: { added: diff.added.length, updated: diff.updated.length, removed: diff.removed.length }
          }, ...(next.meta.history || [])].slice(0, 60);
          const res = await commitStore(next, message);
          c.close();
          openPublishSuccess(res);
        } catch (err) {
          setButtonBusy(submit, false);
          c.setBusy(false);
          showError(c, err?.message || 'انتشار ناموفق بود.');
        }
      });
    }
  });
  return sheet;
}

function openPublishSuccess(result) {
  const url = result?.commitUrl || (state.repo ? `https://github.com/${state.repo.owner}/${state.repo.repo}/commits/${state.repo.branch}` : '');
  openSheet({
    title: 'تغییرات منتشر شد',
    size: 'narrow',
    body: `
      <div class="stack" style="gap:16px">
        <div class="login-hero">
          <span class="login-hero__icon">${icon('check', { size: 24 })}</span>
          <div>
            <div class="login-hero__title">لیست جدید در مخزن ثبت شد</div>
            <div class="login-hero__sub">سایت عمومی معمولاً تا یک دقیقه بعد نسخه تازه را نشان می‌دهد. صفحه‌ای که همین حالا می‌بینید، از قبل به‌روز شده است.</div>
          </div>
        </div>
        ${result?.commitSha ? `<div class="commit-row">${icon('cloud_done', { size: 17 })}<span dir="ltr" style="font-family:monospace">${escapeHtml(result.commitSha.slice(0, 7))}</span><span class="spacer"></span><span>کامیت ثبت شد</span></div>` : ''}
      </div>
    `,
    footer: `
      <span class="spacer"></span>
      ${url ? `<a class="btn btn--text btn--sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon('open_in_new', { size: 17 })} مشاهده در گیت‌هاب</a>` : ''}
      <button class="btn btn--filled btn--sm" type="button" data-close>باشه</button>
    `
  });
}

/* ── Backups ────────────────────────────────────────────────────────────── */

function exportBackup() {
  if (!state.data) return;
  const stamp = new Date().toISOString().slice(0, 10);
  download(`${slugify(state.data.store.name)}-store-${stamp}.json`, serializeStore(state.data));
  toast('نسخه پشتیبان دانلود شد.', { type: 'ok' });
}

function exportCsv() {
  if (!state.data) return;
  const { data } = state;
  const catTitle = (id) => data.categories.find((c) => c.id === id)?.title || '';
  const fieldKeys = [];
  const fieldLabels = [];
  for (const cat of data.categories) {
    for (const field of cat.fields) {
      const key = `${cat.id}:${field.key}`;
      if (!fieldKeys.includes(key)) {
        fieldKeys.push(key);
        fieldLabels.push(`${cat.title} — ${field.label}${field.unit ? ` (${field.unit})` : ''}`);
      }
    }
  }
  const meta = [
    ['نام فروشگاه', data.store.name],
    ['تلفن', data.store.phone],
    ['آدرس', data.store.address],
    ['آخرین به‌روزرسانی', formatJalaliDateTime(data.meta.updatedAt)],
    ['توسط', data.meta.updatedBy],
    []
  ];
  const header = ['نام دستگاه', 'دسته', 'برند', 'وضعیت', 'موجودی', `قیمت (${data.settings.currency})`, 'گارانتی', ...fieldLabels, 'توضیح'];
  const rows = data.devices.map((device) => {
    const cat = data.categories.find((c) => c.id === device.categoryId);
    return [
      device.name,
      cat?.title || '',
      device.brand,
      device.condition,
      device.stock,
      device.priceOnRequest || !device.price ? 'استعلام' : device.price,
      device.warranty,
      ...fieldKeys.map((key) => {
        const [catId, fieldKey] = key.split(':');
        if (catId !== device.categoryId) return '';
        return device.specs?.[fieldKey] || '';
      }),
      device.note
    ];
  });
  const csv = toCsv([...meta, header, ...rows]);
  download(`${slugify(data.store.name)}-inventory-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  toast('خروجی CSV آماده شد؛ در اکسل قابل باز کردن است.', { type: 'ok' });
}

function importBackup() {
  if (!isAdmin()) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  document.body.append(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseStoreJson(text);
      const ok = await confirmDialog({
        title: 'بازیابی نسخه پشتیبان',
        message: 'لیست فعلی با محتوای این فایل جایگزین می‌شود. تغییرات فعلی منتشرنشده از بین می‌رود.',
        confirmText: 'بازیابی کن'
      });
      if (!ok) return;
      replaceData(parsed);
      refreshDirty();
      toast('فایل بازیابی شد؛ برای اعمال روی سایت منتشر کنید.', { type: 'ok' });
    } catch (err) {
      toast(err.message || 'فایل معتبر نیست.', { type: 'err' });
    }
  });
  input.click();
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */

export function initAdmin() {
  document.addEventListener('click', async (event) => {
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (!REQUIRED_ACTIONS.has(action)) return;
    event.preventDefault();
    try {
      switch (action) {
        case 'login':
          await openLogin();
          break;
        case 'logout':
        case 'lock':
        case 'demo-exit':
          await doLogout();
          break;
        case 'admin-menu':
          openAdminMenu(el);
          break;
        case 'add-menu':
          openAddMenu(el);
          break;
        case 'publish':
          await openPublish();
          break;
        case 'discard':
          await discardChanges();
          break;
        case 'settings':
          openSettings();
          break;
        case 'security':
          openSecurity();
          break;
        case 'add-device':
          openDeviceEditor({ categoryId: el.dataset.cat || '' });
          break;
        case 'edit-device':
          openDeviceEditor({ id: el.dataset.deviceId });
          break;
        case 'device-menu':
          openDeviceMenu(el, el.dataset.deviceId);
          break;
        case 'add-category':
          openCategoryEditor({});
          break;
        case 'edit-category':
          openCategoryEditor({ id: el.dataset.cat });
          break;
        case 'export-backup':
          exportBackup();
          break;
        case 'import-backup':
          importBackup();
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('[admin]', err);
      toast(err?.message || 'عملیات ناموفق بود.', { type: 'err' });
    }
  });

  document.addEventListener('ol:edit-device', (event) => {
    openDeviceEditor({ id: event.detail?.id });
  });
  document.addEventListener('ol:login', () => { openLogin(); });
  document.addEventListener('ol:history', () => {
    // handled by app.js which owns the public history sheet
  });

  window.addEventListener('beforeunload', (event) => {
    if (isAdmin() && state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!isAdmin()) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      openPublish();
    }
  });
}

async function discardChanges() {
  if (!state.dirty) { toast('تغییری برای بازگردانی نیست.', { type: 'info' }); return; }
  const ok = await confirmDialog({
    title: 'بازگردانی تغییرات',
    message: 'همه تغییرات منتشرنشده پاک می‌شود و لیست به نسخه‌ی روی مخزن برمی‌گردد.',
    confirmText: 'بازگردانی',
    danger: true
  });
  if (!ok) return;
  discardDraftAndReset();
  clearDraft();
  toast('تغییرات بازگردانی شد.', { type: 'ok' });
}

function openHelp() {
  const url = new URL('help/', document.baseURI).href;
  window.open(url, '_blank', 'noopener');
}

export { openLogin, openPublish, openSettings, openDeviceEditor, openCategoryEditor, openSecurity, openResetSheet, openHelp };
