#!/usr/bin/env node
/**
 * tools/verify.mjs — static integrity checks for the repo.
 * No dependencies: validates JSON files, HTML references, JS syntax,
 * the data schema, and that no plaintext token slipped into the repo.
 *
 *   node tools/verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const notes = [];

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }
function note(message) { notes.push(message); }

function walk(dir, filter = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

/* ── 1. JSON files parse ────────────────────────────────────────────────── */
const jsonFiles = walk(path.join(ROOT, 'data'), (f) => f.endsWith('.json'));
const dataDirExists = fs.existsSync(path.join(ROOT, 'data'));
if (!dataDirExists) fail('پوشه data/ پیدا نشد.');
jsonFiles.push(path.join(ROOT, 'manifest.webmanifest'));
if (fs.existsSync(path.join(ROOT, 'package.json'))) jsonFiles.push(path.join(ROOT, 'package.json'));

const parsed = new Map();
for (const file of jsonFiles) {
  try {
    parsed.set(rel(file), JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    fail(`JSON نامعتبر: ${rel(file)} → ${err.message}`);
  }
}
note(`${parsed.size} فایل JSON معتبر`);

/* ── 2. JS syntax ───────────────────────────────────────────────────────── */
const jsFiles = walk(path.join(ROOT, 'assets', 'js'), (f) => f.endsWith('.js'))
  .concat(walk(path.join(ROOT, 'tools'), (f) => f.endsWith('.mjs')))
  .concat(exists('sw.js') ? [path.join(ROOT, 'sw.js')] : []);
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`خطای سینتکس: ${rel(file)}\n${err.stderr?.toString() || err.message}`);
  }
}
note(`${jsFiles.length} فایل جاوااسکریپت بدون خطای سینتکس`);

/* ── 3. Local references resolve ────────────────────────────────────────── */
const htmlFiles = walk(ROOT, (f) => f.endsWith('.html'));
for (const file of htmlFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const base = path.dirname(file);
  const refs = [
    ...text.matchAll(/(?:href|src)="([^"#][^"]*)"/g)
  ].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(ref)) continue;
    if (ref.startsWith('#')) continue;
    const clean = ref.split('?')[0].split('#')[0];
    const target = path.resolve(base, clean);
    if (!fs.existsSync(target)) {
      fail(`ارجاع شکسته در ${rel(file)} → ${ref}`);
    }
  }
  if (/<script[^>]*>[^<]/i.test(text)) {
    warn(`${rel(file)}: اسکریپت درون‌خطی دارد؛ CSP سخت‌گیرانه آن را اجرا نمی‌کند.`);
  }
}
note(`${htmlFiles.length} فایل HTML بررسی شد`);

/* ── 4. Service worker asset list ───────────────────────────────────────── */
if (exists('sw.js')) {
  const sw = read('sw.js');
  const list = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter(Boolean);
  for (const item of list) {
    if (!fs.existsSync(path.join(ROOT, item))) warn(`sw.js: فایل کش‌شده وجود ندارد → ${item}`);
  }
}

/* ── 5. Data schema sanity ──────────────────────────────────────────────── */
const store = parsed.get('data/store.json');
if (!store) {
  fail('data/store.json پیدا نشد.');
} else {
  if (store.version !== 1) warn(`نسخه داده ${store.version} است (انتظار ۱).`);
  if (!store.store?.name) fail('نام فروشگاه در data/store.json خالی است.');
  if (!Array.isArray(store.categories) || store.categories.length === 0) fail('دسته‌بندی‌ای تعریف نشده است.');
  if (!Array.isArray(store.devices)) fail('آرایه devices معتبر نیست.');
  const ids = new Set();
  const catIds = new Set((store.categories || []).map((c) => c.id));
  for (const device of store.devices || []) {
    if (!device.id) fail(`دستگاه بدون شناسه: ${device.name}`);
    if (ids.has(device.id)) fail(`شناسه تکراری دستگاه: ${device.id}`);
    ids.add(device.id);
    if (!device.name) fail(`دستگاه بدون نام: ${device.id}`);
    if (device.categoryId && !catIds.has(device.categoryId)) warn(`دستگاه «${device.name}» به دسته ناموجود اشاره می‌کند.`);
    if (!Number.isFinite(device.stock) || device.stock < 0) fail(`موجودی نامعتبر: ${device.name}`);
    if (!Number.isFinite(device.price) || device.price < 0) fail(`قیمت نامعتبر: ${device.name}`);
    for (const key of Object.keys(device.specs || {})) {
      const cat = (store.categories || []).find((c) => c.id === device.categoryId);
      if (cat && !(cat.fields || []).some((f) => f.key === key)) {
        warn(`مشخصه «${key}» در دسته «${cat.title}» تعریف نشده (دستگاه ${device.name}).`);
      }
    }
  }
  for (const cat of store.categories || []) {
    const keys = new Set();
    for (const field of cat.fields || []) {
      if (keys.has(field.key)) fail(`کلید تکراری مشخصه در دسته ${cat.title}: ${field.key}`);
      keys.add(field.key);
      if (!field.label) fail(`مشخصه بدون عنوان در دسته ${cat.title}`);
    }
  }
  if (!store.meta?.updatedAt) fail('meta.updatedAt خالی است.');
  note(`${store.devices?.length || 0} دستگاه در ${store.categories?.length || 0} دسته`);
}

const site = parsed.get('data/site.json');
if (site) {
  if (!/^[A-Za-z0-9._-]+$/.test(site.owner || '')) warn('data/site.json: owner معتبر به نظر نمی‌رسد.');
  if (!/^[A-Za-z0-9._-]+$/.test(site.repo || '')) warn('data/site.json: repo معتبر به نظر نمی‌رسد.');
}

const vault = parsed.get('data/vault.json');
if (vault) {
  const ok = vault.v === 1
    && vault.kdf?.name === 'PBKDF2'
    && typeof vault.kdf.salt === 'string'
    && typeof vault.cipher?.iv === 'string'
    && typeof vault.cipher?.data === 'string';
  if (!ok) fail('data/vault.json ساختار امنیتی معتبری ندارد.');
  else note('فایل امنیتی ساختار درستی دارد (داده رمزگذاری‌شده)');
}

/* ── 6. No secrets leaked ───────────────────────────────────────────────── */
const SECRET_PATTERNS = [
  { re: /github_pat_[A-Za-z0-9_]{20,}/g, label: 'GitHub fine-grained token' },
  { re: /gh[pousr]_[A-Za-z0-9]{30,}/g, label: 'GitHub token' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, label: 'private key' }
];
const textFiles = walk(ROOT, (f) => /\.(js|mjs|json|html|css|md|txt|yml|yaml|webmanifest)$/.test(f)
  || f.endsWith('sw.js'));
for (const file of textFiles) {
  if (rel(file).startsWith('tools/verify')) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const { re, label } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    const match = re.exec(text);
    if (match) fail(`احتمال لو رفتن کلید (${label}) در ${rel(file)}`);
  }
}
note(`${textFiles.length} فایل برای بررسی کلیدهای لو رفته اسکن شد`);

/* ── 7. CSP sanity: every remote origin is declared ────────────────────── */
for (const file of htmlFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const csp = text.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  if (!csp) { warn(`${rel(file)}: تگ CSP پیدا نشد.`); continue; }
  if (/script-src[^;]*'unsafe-inline'/.test(csp)) fail(`${rel(file)}: CSP اجازه اسکریپت درون‌خطی می‌دهد.`);
  if (!csp.includes("default-src 'self'")) warn(`${rel(file)}: default-src محدود نیست.`);
}

/* ── 8. Deploy safety: the setup page must never be published ──────────── */
if (exists('.github/workflows/pages.yml')) {
  const workflow = read('.github/workflows/pages.yml');
  const copyLines = workflow.split('\n').filter((l) => /^\s*(cp -r|rm -rf)\b/.test(l));
  const copiesSetup = copyLines.some((l) => /^\s*cp -r\b/.test(l) && /(^|\s)setup(\s|$)/.test(l));
  if (copiesSetup) fail('گردش‌کار Pages پوشه setup/ را منتشر می‌کند؛ این صفحه باید فقط محلی بماند.');
  else note('صفحه راه‌اندازی (setup/) در خروجی Pages نیست');
}

/* ── Report ─────────────────────────────────────────────────────────────── */
const line = (char = '─') => char.repeat(58);
console.log(`\n${line()}\n  Online List — verify\n${line()}`);
for (const n of notes) console.log(`  ✓ ${n}`);
if (warnings.length) {
  console.log(`\n  هشدارها (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.log(`\n  خطاها (${errors.length}):`);
  for (const e of errors) console.log(`  ✖ ${e}`);
  console.log(`\n${line()}\n  نتیجه: ناموفق\n${line()}\n`);
  process.exit(1);
}
console.log(`\n${line()}\n  نتیجه: همه بررسی‌ها موفق ✅\n${line()}\n`);
