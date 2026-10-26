/* ==========================================================================
   Setup page — seal the GitHub token with the admin password.
   Runs entirely in the browser. Nothing is stored until the owner clicks
   "write to repository", and even then only ciphertext leaves the page.
   ========================================================================== */

import { createGitHub, isValidRepoPart, looksLikeToken, pagesUrl } from './api.js';
import { cryptoAvailable, estimateCrackSeconds, passwordScore, sealVault } from './crypto.js';
import { makeDefaultData, serializeStore, SETTINGS_DEFAULTS, STORE_DEFAULTS } from './model.js';
import { icon, hydrateIcons } from './icons.js';
import {
  copyText, download, escapeHtml, formatCrackTime, formatJalaliStamp, storageGet
} from './util.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#setupForm');
const statusHost = $('#testStatus');
const writeStatusHost = $('#writeStatus');
const resultPanel = $('#resultPanel');


/* ── Host guard ────────────────────────────────────────────────────────────
   This page seals a GitHub token, so it must only run on the owner's machine.
   Anywhere else it renders a short explanation and disables everything.
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * A vault file is public, so the password is attacked offline. Anything that a
 * GPU can chew through in under a week is refused outright; under a year only
 * gets a warning, because the owner may still prefer a memorable phrase.
 */
const WEAK_SECONDS = 7 * 86_400;
const YEAR_SECONDS = 365 * 86_400;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

export function isLocalHost(hostname = globalThis.location?.hostname || '') {
  const host = String(hostname).toLowerCase();
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

function enforceLocalOnly() {
  const blocked = $('#blockedPanel');
  const main = $('#setupMain');
  if (isLocalHost()) return true;
  document.body.classList.add('is-blocked');
  if (main) main.hidden = true;
  if (blocked) blocked.hidden = false;
  hydrateIcons(document);
  const form = $('#setupForm');
  if (form) {
    form.querySelectorAll('input, button, select').forEach((el) => { el.disabled = true; });
    form.reset();
  }
  return false;
}

let context = null; // { client, info, user, values }
let vaultText = '';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function readValues() {
  return {
    token: form.elements.namedItem('token').value.trim(),
    owner: form.elements.namedItem('owner').value.trim(),
    repo: form.elements.namedItem('repo').value.trim(),
    branch: form.elements.namedItem('branch').value.trim() || 'main',
    password: form.elements.namedItem('password').value,
    password2: form.elements.namedItem('password2').value,
    hint: form.elements.namedItem('hint').value.trim(),
    adminName: form.elements.namedItem('adminName').value.trim()
  };
}

function setFieldError(input, message = '') {
  if (!input) return;
  const field = input.closest('.field');
  if (!field) return;
  field.classList.toggle('is-invalid', !!message);
  const error = field.querySelector('.field__error');
  if (error) error.textContent = message;
}

function clearErrors() {
  form.querySelectorAll('.field.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
}

function statusChip({ kind = 'busy', text = '', iconName = 'info' }) {
  return `<div class="status-chip" data-kind="${kind}">${icon(kind === 'busy' ? 'sync' : iconName, { size: 16 })}<span>${escapeHtml(text)}</span></div>`;
}

function renderStatuses(host, items) {
  host.hidden = false;
  host.innerHTML = items.map(statusChip).join('');
  hydrateIcons(host);
}

function clearStatuses(host) {
  host.hidden = true;
  host.innerHTML = '';
}

function setBusy(button, busy, label = 'در حال بررسی…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span><span>${escapeHtml(label)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
    hydrateIcons(button);
  }
}

function validateRepo(values) {
  let ok = true;
  const ownerInput = form.elements.namedItem('owner');
  const repoInput = form.elements.namedItem('repo');
  const branchInput = form.elements.namedItem('branch');
  setFieldError(ownerInput, '');
  setFieldError(repoInput, '');
  setFieldError(branchInput, '');
  if (!isValidRepoPart(values.owner)) {
    setFieldError(ownerInput, 'نام مالک معتبر نیست.');
    ok = false;
  }
  if (!isValidRepoPart(values.repo)) {
    setFieldError(repoInput, 'نام مخزن معتبر نیست.');
    ok = false;
  }
  if (!isValidRepoPart(values.branch)) {
    setFieldError(branchInput, 'نام شاخه معتبر نیست (بدون فاصله و اسلش).');
    ok = false;
  }
  return ok;
}

/* ── Connection test ────────────────────────────────────────────────────── */

async function testConnection({ quiet = false } = {}) {
  clearErrors();
  const values = readValues();
  const tokenInput = form.elements.namedItem('token');
  setFieldError(tokenInput, '');
  if (!looksLikeToken(values.token)) {
    setFieldError(tokenInput, 'این مقدار شبیه توکن گیت‌هاب نیست.');
    tokenInput.focus();
    return null;
  }
  if (!validateRepo(values)) return null;

  const testBtn = $('#testBtn');
  setBusy(testBtn, true, 'در حال بررسی…');
  renderStatuses(statusHost, [{ kind: 'busy', text: 'اتصال به گیت‌هاب و بررسی دسترسی‌ها…' }]);

  try {
    const client = createGitHub({
      token: values.token,
      owner: values.owner,
      repo: values.repo,
      branch: values.branch
    });
    const info = await client.getRepo();
    const branchInfo = await client.getBranch(values.branch);
    const [storeFile, vaultFile, user] = await Promise.all([
      client.getFile('data/store.json'),
      client.getFile('data/vault.json'),
      client.getUser()
    ]);

    const items = [];
    items.push({ kind: 'ok', iconName: 'check_circle', text: `مخزن «${info.fullName}» در دسترس است.` });
    if (info.canPush === false) {
      items.push({
        kind: 'err', iconName: 'error',
        text: 'توکن اجازه نوشتن ندارد. در تنظیمات توکن، Contents را روی Read and write بگذارید.'
      });
    } else {
      items.push({ kind: 'ok', iconName: 'check_circle', text: 'دسترسی نوشتن تأیید شد (Contents: Read and write).' });
    }
    if (!branchInfo.exists) {
      items.push({ kind: 'err', iconName: 'error', text: `شاخه «${values.branch}» در مخزن پیدا نشد.` });
    } else {
      items.push({ kind: 'ok', iconName: 'check_circle', text: `شاخه «${values.branch}» آماده است.` });
    }
    items.push({
      kind: storeFile ? 'ok' : 'warn',
      iconName: storeFile ? 'check_circle' : 'info',
      text: storeFile ? 'فایل data/store.json پیدا شد؛ لیست فعلی حفظ می‌شود.' : 'فایل data/store.json وجود ندارد؛ می‌توانید در مرحله بعد یک لیست خالی بسازید.'
    });
    if (vaultFile) {
      items.push({ kind: 'warn', iconName: 'warning', text: 'یک فایل امنیتی قبلی وجود دارد؛ با ذخیره، رمز و توکن جدید جایگزین می‌شود.' });
    }
    if (info.private) {
      items.push({ kind: 'warn', iconName: 'warning', text: 'این مخزن خصوصی است؛ GitHub Pages برای مخزن خصوصی به پلن پرداختی نیاز دارد.' });
    }
    items.push({
      kind: 'ok', iconName: 'account_circle',
      text: user.login ? `توکن متعلق به حساب «${user.login}» است.` : 'توکن معتبر است.'
    });

    renderStatuses(statusHost, items);
    const critical = items.some((item) => item.kind === 'err');
    $('#testHint').textContent = critical ? 'اتصال برقرار شد اما دسترسی کامل نیست.' : 'اتصال با موفقیت بررسی شد.';
    if (critical) return null;

    context = { client, info, user, values, vaultExists: !!vaultFile };
    return context;
  } catch (err) {
    const message = err?.message || 'بررسی اتصال ناموفق بود.';
    renderStatuses(statusHost, [{ kind: 'err', text: message }]);
    $('#testHint').textContent = 'اتصال ناموفق بود.';
    if (!quiet) console.warn('[setup]', err);
    return null;
  } finally {
    setBusy(testBtn, false);
  }
}

/* ── Generate the encrypted vault ──────────────────────────────────────── */

async function generate(event) {
  event.preventDefault();
  clearErrors();
  clearStatuses(writeStatusHost);
  $('#successBox').hidden = true;
  $('#commitBtn').disabled = false;

  if (!cryptoAvailable()) {
    renderStatuses(statusHost, [{
      kind: 'err',
      text: 'مرورگر شما رمزنگاری امن را در این آدرس در اختیار نمی‌گذارد. صفحه را روی HTTPS (یا localhost) باز کنید.'
    }]);
    return;
  }

  const values = readValues();
  const pwInput = form.elements.namedItem('password');
  const pw2Input = form.elements.namedItem('password2');
  let valid = true;
  if (!looksLikeToken(values.token)) {
    setFieldError(form.elements.namedItem('token'), 'توکن گیت‌هاب را وارد کنید.');
    valid = false;
  }
  if (!validateRepo(values)) valid = false;
  if (values.password.length < 10) {
    setFieldError(pwInput, 'رمز باید حداقل ۱۰ کاراکتر باشد.');
    valid = false;
  }
  if (passwordScore(values.password) < 2) {
    setFieldError(pwInput, 'رمز ضعیف است؛ حروف و عدد یا عبارت بلندتری به کار ببرید.');
    valid = false;
  }
  if (estimateCrackSeconds(values.password) < WEAK_SECONDS) {
    setFieldError(pwInput, `این رمز در برابر حملهٔ آفلاین فقط ${formatCrackTime(estimateCrackSeconds(values.password))} دوام می‌آورد؛ چهار کلمهٔ بی‌ربط بگذارید.`);
    valid = false;
  }
  if (values.password !== values.password2) {
    setFieldError(pw2Input, 'تکرار رمز مطابقت ندارد.');
    valid = false;
  }
  if (!valid) {
    form.querySelector('.field.is-invalid .input')?.focus();
    return;
  }

  const generateBtn = $('#generateBtn');
  setBusy(generateBtn, true, 'در حال رمزگذاری…');
  try {
    const ctx = context && context.values.token === values.token
      && context.values.owner === values.owner
      && context.values.repo === values.repo
      && context.values.branch === values.branch
      ? context
      : await testConnection({ quiet: true });
    if (!ctx) {
      $('#testStatus').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const sealed = await sealVault({
      password: values.password,
      token: values.token,
      login: ctx.user?.login || '',
      repo: { owner: values.owner, repo: values.repo, branch: values.branch },
      hint: values.hint
    });
    vaultText = `${JSON.stringify(sealed, null, 2)}\n`;
    context = { ...ctx, values };
    $('#vaultPreview').textContent = vaultText;
    resultPanel.hidden = false;
    hydrateIcons(resultPanel);
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    renderStatuses(statusHost, [{ kind: 'err', text: err?.message || 'ساخت فایل امنیتی ناموفق بود.' }]);
  } finally {
    setBusy(generateBtn, false);
  }
}

/* ── Commit to GitHub ───────────────────────────────────────────────────── */

async function writeToRepo() {
  if (!context || !vaultText) {
    renderStatuses(writeStatusHost, [{ kind: 'err', text: 'اول فایل امنیتی را بسازید.' }]);
    return;
  }
  const { values, client, info } = context;
  if (info.canPush === false) {
    renderStatuses(writeStatusHost, [{ kind: 'err', text: 'توکن اجازه نوشتن ندارد.' }]);
    return;
  }
  if (context.vaultExists && !window.confirm('یک فایل امنیتی قبلی در مخزن وجود دارد. رمز و توکن جدید جایگزین آن می‌شود. ادامه می‌دهید؟')) {
    return;
  }
  const btn = $('#commitBtn');
  let written = false;
  setBusy(btn, true, 'در حال نوشتن در مخزن…');
  clearStatuses(writeStatusHost);
  renderStatuses(writeStatusHost, [{ kind: 'busy', text: 'ارسال فایل‌ها به مخزن…' }]);

  try {
    const siteConfig = {
      owner: values.owner,
      repo: values.repo,
      branch: values.branch,
      pageUrl: pagesUrl({ owner: values.owner, repo: values.repo }),
      dataPath: 'data/store.json',
      vaultPath: 'data/vault.json'
    };
    const files = [
      { path: 'data/vault.json', content: vaultText },
      { path: 'data/site.json', content: `${JSON.stringify(siteConfig, null, 2)}\n` }
    ];
    if ($('#seedStore').checked) {
      const existing = await client.getFile('data/store.json');
      if (!existing) {
        const seed = makeDefaultData();
        seed.store = { ...seed.store, name: values.adminName || STORE_DEFAULTS.name };
        seed.settings = { ...seed.settings, adminName: values.adminName || SETTINGS_DEFAULTS.adminName };
        files.push({ path: 'data/store.json', content: serializeStore(seed) });
      }
    }
    const result = await client.commitFiles(files, `راه‌اندازی امنیتی Online List — ${formatJalaliStamp()}`);
    renderStatuses(writeStatusHost, [
      { kind: 'ok', iconName: 'check_circle', text: 'فایل‌های امنیتی در مخزن ثبت شدند.' },
      { kind: 'ok', iconName: 'cloud_done', text: 'GitHub Pages معمولاً تا یک دقیقه نسخه تازه را منتشر می‌کند.' },
      {
        kind: 'ok', iconName: 'cloud_done',
        text: result.commitSha ? `کامیت ${result.commitSha.slice(0, 7)} ثبت شد.` : 'کامیت ثبت شد.'
      }
    ]);
    written = true;
    $('#successBox').hidden = false;
    hydrateIcons($('#successBox'));
    $('#commitBtn').disabled = true;
    $('#seedStore').disabled = true;
    form.elements.namedItem('password').value = '';
    form.elements.namedItem('password2').value = '';
    form.elements.namedItem('token').value = '';
    context = { ...context, values: { ...values, token: '', password: '', password2: '' } };
    $('#pwMeter').dataset.score = '0';
    $('#successBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    renderStatuses(writeStatusHost, [{ kind: 'err', text: err?.message || 'نوشتن در مخزن ناموفق بود.' }]);
    if (err?.commitUrl) console.warn('[setup] commit', err.commitUrl);
  } finally {
    setBusy(btn, false);
    if (written) {
      btn.disabled = true;
      btn.innerHTML = `${icon('cloud_done', { size: 18 })}<span>در مخزن ثبت شد</span>`;
    }
  }
}

/* ── Bindings ───────────────────────────────────────────────────────────── */

function bindVisibilityToggle(buttonId, inputId) {
  const button = document.getElementById(buttonId);
  const input = document.getElementById(inputId);
  if (!button || !input) return;
  button.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.innerHTML = icon(show ? 'visibility_off' : 'visibility', { size: 19 });
    button.setAttribute('aria-label', show ? 'پنهان کردن' : 'نمایش');
    input.focus();
  });
}

function initPasswordMeter() {
  const pw = form.elements.namedItem('password');
  const meter = $('#pwMeter');
  const hint = $('#pwHint');
  const estimate = $('#pwEstimate');
  pw.addEventListener('input', () => {
    const value = pw.value;
    const score = passwordScore(value);
    meter.dataset.score = String(score);
    hint.textContent = value.length === 0
      ? 'یک عبارت طولانی و یکتا انتخاب کنید؛ مثل «کافه-۱۲۴-آفتاب».'
      : value.length < 10
        ? 'حداقل ۱۰ کاراکتر لازم است.'
        : score >= 3
          ? 'رمز خوبی است.'
          : 'بهتر است طولانی‌تر باشد یا عدد و علامت هم داشته باشد.';
    if (!estimate) return;
    if (!value) { estimate.hidden = true; estimate.textContent = ''; return; }
    const seconds = estimateCrackSeconds(value);
    estimate.hidden = false;
    estimate.dataset.level = seconds < WEAK_SECONDS ? 'weak' : seconds < YEAR_SECONDS ? 'ok' : 'strong';
    estimate.textContent = seconds < WEAK_SECONDS
      ? `در برابر حملهٔ آفلاین ${formatCrackTime(seconds)} دوام می‌آورد — برای این کار کافی نیست.`
      : `تخمین در برابر حملهٔ آفلاین (${formatCrackTime(seconds)}) با فرض واژه‌نامه و یک کارت گرافیک.`;
  });
}

async function prefill() {
  const siteUrl = new URL('../../data/site.json', import.meta.url);
  let site = null;
  try {
    const res = await fetch(siteUrl, { cache: 'no-store' });
    if (res.ok) site = await res.json();
  } catch { /* optional */ }

  let owner = site?.owner || '';
  let repo = site?.repo || '';
  const branch = site?.branch || 'main';
  if (location.hostname.endsWith('.github.io')) {
    owner = location.hostname.replace(/\.github\.io$/, '');
    const first = location.pathname.split('/').filter(Boolean)[0];
    repo = first || `${owner}.github.io`;
  }
  if (owner) form.elements.namedItem('owner').value = owner;
  if (repo) form.elements.namedItem('repo').value = repo;
  form.elements.namedItem('branch').value = branch;

  // Best effort: prefill the admin display name from the live store.
  try {
    const storeUrl = new URL('../../data/store.json', import.meta.url);
    const res = await fetch(storeUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const adminName = data?.settings?.adminName || '';
      if (adminName) form.elements.namedItem('adminName').value = adminName;
    }
  } catch { /* optional */ }

  if (!cryptoAvailable()) {
    renderStatuses(statusHost, [{
      kind: 'err',
      text: 'رمزنگاری Web Crypto فقط روی HTTPS یا localhost فعال است. این صفحه را از طریق آدرس امن باز کنید.'
    }]);
  }
}

function init() {
  hydrateIcons();
  if (!enforceLocalOnly()) return;
  const stored = (() => {
    try { return localStorage.getItem('ol.theme'); } catch { return null; }
  })();
  if (stored === 'light' || stored === 'dark') document.documentElement.setAttribute('data-theme', stored);

  prefill();
  bindVisibilityToggle('toggleToken', 'token');
  bindVisibilityToggle('togglePw', 'password');
  initPasswordMeter();

  $('#testBtn').addEventListener('click', () => testConnection());
  form.addEventListener('submit', generate);
  $('#commitBtn').addEventListener('click', writeToRepo);

  $('#copyVault').addEventListener('click', async () => {
    const ok = await copyText(vaultText);
    renderStatuses(writeStatusHost, [{ kind: ok ? 'ok' : 'err', text: ok ? 'فایل امنیتی کپی شد.' : 'کپی ناموفق بود.' }]);
  });
  $('#downloadVault').addEventListener('click', () => {
    if (!vaultText) return;
    download('vault.json', vaultText);
  });

  form.addEventListener('input', (event) => {
    if (event.target.matches('input')) {
      const field = event.target.closest('.field');
      if (field?.classList.contains('is-invalid')) {
        field.classList.remove('is-invalid');
      }
    }
  });
}

init();
