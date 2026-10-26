#!/usr/bin/env node
/**
 * tools/test.mjs — dependency-free unit tests for the pure logic modules.
 * Run: npm test   (or node tools/test.mjs)
 *
 * The browser-only modules (render/admin/ui) are exercised manually; the data
 * model, formatting helpers and vault crypto are the parts worth automating.
 */
import { webcrypto as nodeCrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Node <19 has globalThis.crypto in some builds only; make sure it exists. */
if (!globalThis.crypto) globalThis.crypto = nodeCrypto;
globalThis.btoa ||= (bin) => Buffer.from(bin, 'binary').toString('base64');
globalThis.atob ||= (b64) => Buffer.from(b64, 'base64').toString('binary');

const { default: assert } = await import('node:assert/strict');

const model = await import(path.join(ROOT, 'assets/js/model.js'));
const util = await import(path.join(ROOT, 'assets/js/util.js'));
const crypto = await import(path.join(ROOT, 'assets/js/crypto.js'));

let passed = 0;
let failed = 0;
const failures = [];

/** Builds a token-shaped string at runtime (keeps secret scanners honest). */
function fakeToken(prefix, a, middle = '', b = 0) {
  return prefix + 'a'.repeat(a) + middle + (b ? 'b'.repeat(b) : '');
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  ✖ ${name}\n     ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log(`  ✖ ${name}\n     ${err.message}`);
  }
}

/* ── Numbers, digits, formatting ───────────────────────────────────────── */
console.log('\n  اعداد و قالب‌بندی');

test('اعداد فارسی و عربی به عدد تبدیل می‌شوند', () => {
  assert.equal(util.parseNumber('۸۴٬۵۰۰'), 84500);
  assert.equal(util.parseNumber('۱۲۳۴'), 1234);
  assert.equal(util.parseNumber('٤٥٦'), 456);
  assert.equal(util.parseNumber('1,234,567'), 1234567);
  assert.equal(util.parseNumber(''), NaN);
  assert.equal(util.parseNumber('abc'), NaN);
  assert.equal(util.parseNumber('12.5'), 12.5);
  assert.equal(util.parseNumber(-5), -5);
});

test('ارقام فارسی تولید می‌شوند', () => {
  assert.equal(util.toFaDigits('2026'), '۲۰۲۶');
  assert.equal(util.toEnDigits('۱۴۰۵'), '1405');
});

test('کلمپ امن است', () => {
  assert.equal(util.clamp(5, 0, 3), 3);
  assert.equal(util.clamp(-1, 0, 3), 0);
  assert.equal(util.clamp(NaN, 0, 3), 0);
});

test('timeAgo فارسی درست است', () => {
  const now = new Date('2026-10-26T10:00:00Z').getTime();
  assert.equal(util.timeAgo('2026-10-26T09:59:30Z', now), 'همین الان');
  assert.equal(util.timeAgo('2026-10-26T09:45:00Z', now), '۱۵ دقیقه پیش');
  assert.equal(util.timeAgo('2026-10-26T06:00:00Z', now), '۴ ساعت پیش');
  assert.equal(util.timeAgo('2026-10-25T06:00:00Z', now), 'دیروز');
  assert.equal(util.timeAgo('2026-10-20T06:00:00Z', now), '۶ روز پیش');
  assert.equal(util.timeAgo('bad-value', now), '—');
});

test('تاریخ شمسی تولید می‌شود', () => {
  const out = util.formatJalaliDate('2026-10-26T06:00:00Z');
  assert.match(out, /۱۴۰۵/);
  assert.match(out, /آبان/);
  const time = util.formatJalaliTime('2026-10-26T06:45:00Z');
  assert.match(time, /^[۰-۹]{2}:[۰-۹]{2}$/);
});

test('جستجو حساس به نویسه‌های عربی/فارسی نیست', () => {
  assert.ok(util.matchesQuery('آیفون ۱۶ پرو مکس', 'ایفون'));
  assert.ok(util.matchesQuery('گلکسی S25', 's25'));
  assert.ok(util.matchesQuery('مک‌بوک', 'مک بوک'));
  assert.ok(!util.matchesQuery('آیفون', 'سامسونگ'));
});

test('CSV کاراکترهای خاص را escape می‌کند', () => {
  const csv = util.toCsv([['نام', 'توضیح'], ['آیفون', 'با "گارانتی", ۱۸ ماه']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"با ""گارانتی"", ۱۸ ماه"'));
});

test('لینک‌های تماس و واتساپ ساخته می‌شوند', () => {
  assert.equal(util.telHref('۰۹۱۲ ۳۴۵ ۶۷۸۹'), 'tel:۰۹۱۲۳۴۵۶۷۸۹'.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  assert.equal(util.whatsappHref('989123456789'), 'https://wa.me/989123456789');
  assert.equal(util.whatsappHref(''), '');
  assert.equal(util.instagramHref('@shop'), 'https://instagram.com/shop');
  assert.equal(util.instagramHref(''), '');
});

/* ── Model: normalisation & safety ────────────────────────────────────── */
console.log('\n  مدل داده');

const base = model.makeDefaultData('2026-10-26T00:00:00.000Z');

test('داده پیش‌فرض معتبر است', () => {
  const data = model.normalizeStore(base);
  assert.equal(data.version, model.SCHEMA_VERSION);
  assert.ok(Array.isArray(data.categories));
  assert.equal(data.devices.length, 0);
  assert.ok(data.meta.updatedAt);
});

test('ورودی نامعتبر باعث کرش نمی‌شود', () => {
  for (const bad of [null, undefined, 42, 'x', [], { devices: 'no' }, { devices: [null, 5, {}] }]) {
    const data = model.normalizeStore(bad);
    assert.ok(Array.isArray(data.devices));
    assert.ok(Array.isArray(data.categories));
  }
});

test('موجودی و قیمت منفی صفر می‌شوند', () => {
  const data = model.normalizeStore({
    categories: [{ id: 'c1', title: 'تست' }],
    devices: [
      { id: 'd1', name: 'الف', categoryId: 'c1', stock: -5, price: -1000 },
      { id: 'd2', name: 'ب', categoryId: 'c1', stock: '3', price: '۴۵۰۰۰' }
    ]
  });
  assert.equal(data.devices[0].stock, 0);
  assert.equal(data.devices[0].price, 0);
  assert.equal(data.devices[1].stock, 3);
  assert.equal(data.devices[1].price, 45000);
});

test('شناسه‌های تکراری یکتا می‌شوند', () => {
  const data = model.normalizeStore({
    categories: [{ id: 'c', title: 'یک' }, { id: 'c', title: 'دو' }],
    devices: [
      { id: 'x', name: 'الف', categoryId: 'c' },
      { id: 'x', name: 'ب', categoryId: 'c' }
    ]
  });
  assert.equal(new Set(data.categories.map((c) => c.id)).size, 2);
  assert.equal(new Set(data.devices.map((d) => d.id)).size, 2);
});

test('دستگاه بدون نام حذف می‌شود', () => {
  const data = model.normalizeStore({ devices: [{ id: 'a', name: '   ' }, { id: 'b', name: 'ب' }] });
  assert.equal(data.devices.length, 1);
  assert.equal(data.devices[0].name, 'ب');
});

test('دسته ناموجود به «بدون دسته» تبدیل می‌شود', () => {
  const data = model.normalizeStore({
    categories: [{ id: 'c1', title: 'یک' }],
    devices: [{ id: 'd', name: 'الف', categoryId: 'ghost' }]
  });
  assert.equal(data.devices[0].categoryId, '');
});

test('آیکون ناشناخته جایگزین می‌شود', () => {
  const data = model.normalizeStore({ categories: [{ id: 'c', title: 'x', icon: 'not-an-icon' }] });
  assert.equal(data.categories[0].icon, 'category');
});

test('تصویر ناامن حذف می‌شود', () => {
  const data = model.normalizeStore({
    categories: [{ id: 'c', title: 'x' }],
    devices: [
      { id: 'a', name: 'الف', categoryId: 'c', image: 'javascript:alert(1)' },
      { id: 'b', name: 'ب', categoryId: 'c', image: 'https://example.com/a.jpg' }
    ]
  });
  assert.equal(data.devices[0].image, '');
  assert.equal(data.devices[1].image, 'https://example.com/a.jpg');
});

test('مشخصات با کلید خطرناک ذخیره نمی‌شوند', () => {
  const data = model.normalizeStore({
    devices: [{ id: 'a', name: 'الف', specs: { '__proto__': 'x', 'ok-key': 'مقدار', 'بد': 'y' } }]
  });
  assert.equal(data.devices[0].specs['ok-key'], 'مقدار');
  assert.ok(!('بد' in data.devices[0].specs));
});

test('serialize و parse رفت‌وبرگشت پایدار دارند', () => {
  const data = model.normalizeStore(base);
  const text = model.serializeStore(data);
  const again = model.parseStoreJson(text);
  assert.equal(model.serializeStore(again), text);
  assert.throws(() => model.parseStoreJson('{not json}'));
  assert.throws(() => model.parseStoreJson('[]'));
});

test('امار فروشگاه درست محاسبه می‌شود', () => {
  const data = model.normalizeStore({
    settings: { lowStockThreshold: 2 },
    categories: [{ id: 'c1', title: 'x' }, { id: 'c2', title: 'y' }],
    devices: [
      { id: 'a', name: 'A', categoryId: 'c1', stock: 5 },
      { id: 'b', name: 'B', categoryId: 'c1', stock: 2 },
      { id: 'c', name: 'C', categoryId: 'c2', stock: 0 },
      { id: 'd', name: 'D', categoryId: 'c2', stock: 1, hidden: true }
    ]
  });
  const stats = model.computeStats(data);
  assert.equal(stats.devices, 3); // hidden device excluded
  assert.equal(stats.inStock, 2);
  assert.equal(stats.low, 1);
  assert.equal(stats.out, 1);
  assert.equal(stats.units, 7);
  assert.equal(stats.categories, 2);
});

test('وضعیت موجودی با آستانه کار می‌کند', () => {
  const settings = { lowStockThreshold: 2 };
  assert.equal(model.stockState({ stock: 0 }, settings), 'out');
  assert.equal(model.stockState({ stock: 1 }, settings), 'low');
  assert.equal(model.stockState({ stock: 2 }, settings), 'low');
  assert.equal(model.stockState({ stock: 3 }, settings), 'in');
});

test('diff تغییرات را درست تشخیص می‌دهد', () => {
  const before = model.normalizeStore({
    categories: [{ id: 'c', title: 'x' }],
    devices: [
      { id: 'a', name: 'A', categoryId: 'c', stock: 1 },
      { id: 'b', name: 'B', categoryId: 'c', stock: 1 }
    ]
  });
  const after = model.normalizeStore({
    categories: [{ id: 'c', title: 'x' }],
    devices: [
      { id: 'a', name: 'A', categoryId: 'c', stock: 4 },
      { id: 'c', name: 'C', categoryId: 'c', stock: 1 }
    ]
  });
  const diff = model.computeDiff(before, after);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.updated.length, 1);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.total, 3);
  assert.equal(diff.settingsChanged, false);

  const stockOnly = model.computeDiff(
    model.normalizeStore({ devices: [{ id: 'a', name: 'A', stock: 1, updatedAt: '2026-01-01T00:00:00.000Z' }] }),
    model.normalizeStore({ devices: [{ id: 'a', name: 'A', stock: 9, updatedAt: '2026-02-01T00:00:00.000Z' }] })
  );
  assert.equal(stockOnly.stockOnly, true);
});

test('فایل واقعی store.json معتبر و کامل است', () => {
  const text = fs.readFileSync(path.join(ROOT, 'data/store.json'), 'utf8');
  const data = model.parseStoreJson(text);
  assert.equal(model.serializeStore(data), text, 'store.json باید با خروجی سریالایزر یکسان باشد');
  // An empty inventory is valid (the admin can reset everything on purpose).
  assert.ok(Array.isArray(data.devices));
  assert.ok(Array.isArray(data.categories));
  assert.ok(data.categories.every((c) => c.fields.every((f) => f.label)));
});

test('clearInventory فقط لیست را پاک می‌کند', () => {
  const data = model.normalizeStore({
    store: { name: 'فروشگاه من', phone: '۰۹۱۲' },
    settings: { currency: 'تومان', adminName: 'مدیر' },
    categories: [{ id: 'c1', title: 'موبایل', fields: [{ key: 'ram', label: 'رم' }] }],
    devices: [{ id: 'd1', name: 'الف', categoryId: 'c1', stock: 2, specs: { ram: '۸' } }],
    meta: { updatedBy: 'قبلی', history: [{ id: 'h1', at: '2026-01-01T00:00:00.000Z', by: 'x', action: 'publish', summary: 'ق' }] }
  });
  const { data: next, removedDevices, removedCategories } = model.clearInventory(data, {
    at: '2026-10-26T10:00:00.000Z', by: 'پوریا'
  });
  assert.equal(removedDevices, 1);
  assert.equal(removedCategories, 1);
  assert.equal(next.devices.length, 0);
  assert.equal(next.categories.length, 0);
  // identity, settings and history survive
  assert.equal(next.store.name, 'فروشگاه من');
  assert.equal(next.store.phone, '۰۹۱۲');
  assert.equal(next.settings.currency, 'تومان');
  assert.equal(next.meta.updatedAt, '2026-10-26T10:00:00.000Z');
  assert.equal(next.meta.updatedBy, 'پوریا');
  assert.equal(next.meta.history[0].action, 'reset');
  assert.equal(next.meta.history.length, 2);
});

test('clearInventory روی داده خالی هم امن است', () => {
  const { data, removedDevices } = model.clearInventory(null);
  assert.equal(removedDevices, 0);
  assert.equal(data.devices.length, 0);
  assert.deepEqual(data.devices, []);
  assert.equal(data.meta.history[0].action, 'reset');
});

test('عبارت تأیید بازنشانی ثابت است', () => {
  assert.equal(model.RESET_PHRASE, 'حذف همه');
});

/* ── Crypto / vault ───────────────────────────────────────────────────── */
console.log('\n  رمزنگاری (Vault)');

test('cryptoAvailable در Node فعال است', () => {
  assert.equal(crypto.cryptoAvailable(), true);
});

await testAsync('رمزگذاری و رمزگشایی رفت‌وبرگشت دارد', async () => {
  const password = 'کافه-۱۲۴-آفتاب-۷';
  const token = fakeToken('github_pat_', 22, '_', 18);
  const vault = await crypto.sealVault({
    password,
    token,
    login: 'shop-owner',
    repo: { owner: 'me', repo: 'Online_list', branch: 'main' },
    hint: 'یادآور'
  });
  assert.ok(crypto.isVault(vault));
  assert.ok(!JSON.stringify(vault).includes(token), 'توکن نباید در نتیجه باشد');
  assert.equal(vault.kdf.iterations, 600000, 'پیش‌فرض باید ۶۰۰٬۰۰۰ دور باشد');
  assert.equal(vault.repo.branch, 'main');

  const opened = await crypto.openVault(vault, password);
  assert.equal(opened.token, token);
  assert.equal(opened.login, 'shop-owner');
});

await testAsync('رمز غلط با کد bad-password رد می‌شود', async () => {
  const vault = await crypto.sealVault({ password: 'درست-۱۲۳-۴۵۶-۷۸۹', token: fakeToken('ghp_', 30) });
  await assert.rejects(() => crypto.openVault(vault, 'غلط-۱۲۳'), (err) => err.code === 'bad-password');
});

await testAsync('دستکاری ciphertext تشخیص داده می‌شود', async () => {
  const vault = await crypto.sealVault({ password: 'درست-۱۲۳-۴۵۶-۷۸۹', token: fakeToken('ghp_', 30) });
  const bytes = crypto.base64ToBytes(vault.cipher.data);
  bytes[0] ^= 0xff;
  vault.cipher.data = crypto.bytesToBase64(bytes);
  await assert.rejects(() => crypto.openVault(vault, 'درست-۱۲۳-۴۵۶-۷۸۹'), (err) => err.code === 'bad-password');
});

await testAsync('رمز رایج یا کوتاه در لایهٔ رمزنگاری رد می‌شود', async () => {
  await assert.rejects(
    () => crypto.sealVault({ password: 'password', token: fakeToken('ghp_', 30) }),
    (err) => err.code === 'weak-password'
  );
  await assert.rejects(
    () => crypto.sealVault({ password: '1234567890', token: fakeToken('ghp_', 30) }),
    (err) => err.code === 'weak-password'
  );
});

await testAsync('ریست رمز: رمز قبلی بی‌اعتبار و توکن حفظ می‌شود', async () => {
  const oldPassword = 'نمونه-رمز-۱۲۳-آزمایشی';
  const newPassword = 'کتاب-پرنده-آبی-ماه-۱۲۴';
  const token = fakeToken('ghp_', 30);
  const before = await crypto.sealVault({ password: oldPassword, token });
  // What the admin dialog does: open with the current password, then re-seal.
  const opened = await crypto.openVault(before, oldPassword);
  assert.equal(opened.token, token);
  const after = await crypto.sealVault({ password: newPassword, token: opened.token });
  assert.equal(after.kdf.iterations, 600000);
  assert.notEqual(after.kdf.salt, before.kdf.salt, 'salt باید تازه باشد');
  assert.equal((await crypto.openVault(after, newPassword)).token, token);
  await assert.rejects(() => crypto.openVault(after, oldPassword), (err) => err.code === 'bad-password');
});

await testAsync('vault قدیمی با ۳۰۰٬۰۰۰ دور همچنان باز می‌شود', async () => {
  const password = 'درست-۱۲۳-۴۵۶-۷۸۹';
  const legacy = await crypto.sealVault({
    password, token: fakeToken('ghp_', 30), iterations: 300000
  });
  assert.equal(legacy.kdf.iterations, 300000);
  const opened = await crypto.openVault(legacy, password);
  assert.equal(opened.token, fakeToken('ghp_', 30));
});

await testAsync('رمز کوتاه پذیرفته نمی‌شود', async () => {
  await assert.rejects(
    () => crypto.sealVault({ password: '123', token: fakeToken('ghp_', 30) }),
    (err) => err.code === 'weak-password'
  );
  await assert.rejects(
    () => crypto.sealVault({ password: 'درست-۱۲۳-۴۵۶-۷۸۹', token: '' }),
    (err) => err.code === 'missing-token'
  );
});

test('ساختار vault ناقص رد می‌شود', () => {
  assert.equal(crypto.isVault(null), false);
  assert.equal(crypto.isVault({ v: 1 }), false);
  assert.equal(crypto.isVault({ v: 1, kdf: { name: 'PBKDF2', salt: 'x' }, cipher: { iv: 'y', data: 'z' } }), true);
});

test('تخمین شکستن رمز محافظه‌کارانه و یکنوا است', () => {
  const weak = crypto.estimateCrackSeconds('shop1404');
  const year = crypto.estimateCrackSeconds('mahdi1385');
  const twoWords = crypto.estimateCrackSeconds('کافه-آفتاب');
  const fourWords = crypto.estimateCrackSeconds('کتاب-پرنده-آبی-ماه-۱۲۴');
  assert.ok(weak < 86400, `واژه + سال باید زیر یک روز شکسته شود، نه ${Math.round(weak)} ثانیه`);
  assert.ok(year < 86400, 'رمز با سال تولد باید زیر یک روز شکسته شود');
  assert.ok(fourWords > twoWords, 'عبارت چهارکلمه‌ای باید قوی‌تر از دوکلمه‌ای باشد');
  assert.ok(fourWords > 365 * 86400, 'عبارت چهارکلمه‌ای باید بیش از یک سال دوام بیاورد');
  assert.equal(crypto.estimateCrackSeconds(''), 0);
  // The estimator must price years as years, not as 4 random digits.
  assert.ok(crypto.passwordEntropyBits('سال۱۴۰۵') < crypto.passwordEntropyBits('سال۹۴۷۲'));
});

test('دور بیشتر KDF زمان شکستن را طولانی‌تر می‌کند', () => {
  const pw = 'کتاب-پرنده-آبی-ماه-۱۲۴';
  const at600 = crypto.estimateCrackSeconds(pw, { iterations: 600000 });
  const at300 = crypto.estimateCrackSeconds(pw, { iterations: 300000 });
  assert.ok(at600 > at300 * 1.9, 'افزایش دورها باید هزینهٔ حمله را دو برابر کند');
});

test('CLI ساخت vault از همان منطق رمزِ سایت استفاده می‌کند', async () => {
  // Regression guard: the CLI used to carry a copy of the heuristics, which
  // could silently drift away from the browser policy.
  const src = fs.readFileSync(path.join(ROOT, 'tools/make-vault.mjs'), 'utf8');
  assert.ok(src.includes("from '../assets/js/crypto.js'"), 'CLI باید از crypto.js وارد کند');
  assert.ok(!/function passwordEntropyBits/.test(src), 'CLI نباید نسخهٔ جداگانه‌ای داشته باشد');
  const cli = await import(path.join(ROOT, 'tools/make-vault.mjs'));
  assert.equal(typeof cli.default, 'undefined');
});

test('امتیاز رمز منطقی است', () => {
  assert.equal(crypto.passwordScore(''), 0);
  assert.ok(crypto.passwordScore('12345678') <= 1);
  assert.ok(crypto.passwordScore('Abcdefgh123!@#') >= 3);
  assert.ok(crypto.passwordScore('password') <= 1);
});

/* ── API helpers ──────────────────────────────────────────────────────── */
console.log('\n  ابزار API');

const api = await import(path.join(ROOT, 'assets/js/api.js'));

test('توکن‌های معتبر شناسایی می‌شوند', () => {
  assert.equal(api.looksLikeToken(fakeToken('github_pat_', 22, '_', 18)), true);
  assert.equal(api.looksLikeToken(fakeToken('ghp_', 36)), true);
  assert.equal(api.looksLikeToken('short'), false);
  assert.equal(api.looksLikeToken('has space in it and is long enough'), false);
  assert.equal(api.looksLikeToken(''), false);
});

test('مالک/مخزن/شاخه اعتبارسنجی می‌شوند', () => {
  assert.equal(api.isValidRepoPart('pouriasafari117'), true);
  assert.equal(api.isValidRepoPart('Online_list'), true);
  assert.equal(api.isValidRepoPart('bad/name'), false);
  assert.equal(api.isValidRepoPart(''), false);
  assert.equal(api.isValidRepoPart('main', { allowSlash: true }), true);
  assert.equal(api.isValidRepoPart('feature/x', { allowSlash: true }), true);
});

test('آدرس raw با encode ساخته می‌شود', () => {
  const url = api.rawUrl({ owner: 'me', repo: 'Online_list', branch: 'main', path: 'data/store.json' });
  assert.equal(url, 'https://raw.githubusercontent.com/me/Online_list/main/data/store.json');
  assert.ok(api.rawUrl({ owner: 'me', repo: 'r', path: 'a b.json' }).includes('a%20b.json'));
});

test('آدرس Pages برای هر دو نوع مخزن درست است', () => {
  assert.equal(api.pagesUrl({ owner: 'me', repo: 'Online_list' }), 'https://me.github.io/Online_list/');
  assert.equal(api.pagesUrl({ owner: 'me', repo: 'me.github.io' }), 'https://me.github.io/');
});

/* ── Commit encoding (regression: base64 text was stored as the file) ──── */
console.log('\n  ثبت فایل در مخزن');

await testAsync('commitFiles محتوا را به‌صورت UTF-8 خام می‌فرستد', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, method: options.method || 'GET', body });
    const reply = (data, status = 200) => ({
      ok: status < 400,
      status,
      headers: new Headers(),
      text: async () => JSON.stringify(data),
      json: async () => data
    });
    if (url.includes('/git/ref/heads/')) return reply({ object: { sha: 'head-sha' } });
    if (url.includes('/git/commits/head-sha')) return reply({ tree: { sha: 'tree-sha' } });
    if (url.endsWith('/git/blobs')) return reply({ sha: `blob-${calls.length}` });
    if (url.endsWith('/git/trees')) return reply({ sha: 'new-tree' });
    if (url.endsWith('/git/commits')) return reply({ sha: 'new-commit', html_url: 'https://x' });
    if (url.includes('/git/refs/heads/')) return reply({});
    return reply({});
  };
  const client = api.createGitHub({
    token: fakeToken('ghp_', 30), owner: 'me', repo: 'Online_list', branch: 'main', fetchImpl
  });
  const payload = '{\n  "name": "مک‌بوک"\n}\n';
  await client.commitFiles([{ path: 'data/x.json', content: payload }], 'پیام');

  const blobCall = calls.find((c) => c.url.endsWith('/git/blobs'));
  assert.ok(blobCall, 'درخواست blob ارسال نشد');
  assert.equal(blobCall.body.encoding, 'utf-8');
  assert.equal(blobCall.body.content, payload, 'محتوا نباید base64 شود');
  assert.ok(!blobCall.body.content.startsWith('eyJ'), 'محتوا نباید base64 باشد');
});

test('parseJsonLoose فایل‌های base64 قدیمی را بازیابی می‌کند', () => {
  const original = { v: 1, text: 'سلام' };
  const b64 = Buffer.from(JSON.stringify(original, null, 2), 'utf8').toString('base64');
  const parsed = api.parseJsonLoose(b64);
  assert.equal(parsed.repaired, true);
  assert.deepEqual(parsed.value, original);

  const plain = api.parseJsonLoose('{"a":1}');
  assert.equal(plain.repaired, false);
  assert.deepEqual(plain.value, { a: 1 });

  assert.throws(() => api.parseJsonLoose('not json at all'));
});

test('deleteFile فایل امنیتی را با sha حذف می‌کند', async () => {
  const calls = [];
  const reply = (data, status = 200) => ({
    ok: status < 400,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(data),
    json: async () => data
  });
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.includes('/contents/data/vault.json') && (options.method || 'GET') === 'GET') {
      return reply({ sha: 'vault-sha', content: Buffer.from('{}').toString('base64') });
    }
    if (url.includes('/contents/data/vault.json') && options.method === 'DELETE') {
      return reply({ commit: { sha: 'c0ffee', html_url: 'https://github.com/me/Online_list/commit/c0ffee' } });
    }
    return reply({}, 404);
  };
  const client = api.createGitHub({
    token: fakeToken('ghp_', 30), owner: 'me', repo: 'Online_list', branch: 'main', fetchImpl
  });
  const res = await client.deleteFile({ path: 'data/vault.json', message: 'حذف فایل امنیتی' });
  const del = calls.find((c) => c.method === 'DELETE');
  assert.ok(del, 'درخواست DELETE ارسال نشد');
  assert.equal(del.body.sha, 'vault-sha', 'sha فایل باید فرستاده شود');
  assert.equal(del.body.branch, 'main');
  assert.equal(del.body.message, 'حذف فایل امنیتی');
  assert.equal(res.commitSha, 'c0ffee');
  assert.equal(res.missing, false);
});

test('deleteFile برای فایل ناموجود خطا نمی‌دهد', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET' });
    return { ok: false, status: 404, headers: new Headers(), text: async () => '{}', json: async () => ({}) };
  };
  const client = api.createGitHub({
    token: fakeToken('ghp_', 30), owner: 'me', repo: 'Online_list', branch: 'main', fetchImpl
  });
  const res = await client.deleteFile({ path: 'data/vault.json', message: 'حذف' });
  assert.equal(res.missing, true);
  assert.equal(calls.some((c) => c.method === 'DELETE'), false, 'وقتی فایل نیست، DELETE نباید بفرستد');
});

test('عبارت تأیید بازنشانی رمز دقیق است', () => {
  assert.equal(model.CREDENTIAL_RESET_PHRASE.trim(), model.CREDENTIAL_RESET_PHRASE);
  assert.ok(model.CREDENTIAL_RESET_PHRASE.length >= 8);
  assert.notEqual(model.CREDENTIAL_RESET_PHRASE, model.RESET_PHRASE,
    'عبارت بازنشانی رمز باید با عبارت حذف لیست فرق کند');
});

test('ورود، مسیر «راهنمای بازیابی» را نشان می‌دهد', () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/admin.js'), 'utf8');
  assert.ok(/data-forgot/.test(src), 'دکمهٔ راهنمای بازیابی در پنجرهٔ ورود نیست');
  assert.ok(/function openForgotPassword\b/.test(src), 'تابع راهنمای بازیابی تعریف نشده');
  assert.ok(/openForgotPassword\(\)/.test(src), 'راهنمای بازیابی به هیچ‌جا وصل نیست');
});

test('ریست کلی رمزها فایل امنیتی را حذف می‌کند', () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/admin.js'), 'utf8');
  assert.ok(/data-reset-credential/.test(src), 'دکمهٔ ریست کلی در برگهٔ رمز و توکن نیست');
  assert.ok(/deleteFile\(\{\s*\n?\s*path: 'data\/vault\.json'/.test(src),
    'ریست کلی باید vault.json را حذف کند');
  assert.ok(/CREDENTIAL_RESET_PHRASE/.test(src), 'تأیید متنی برای ریست کلی لازم است');
});

test('قالب‌های آمادهٔ مشخصات، فیلدهای تازه و مستقل می‌سازند', () => {
  const phone = model.presetFields('phone');
  assert.ok(phone.length >= 3, 'قالب موبایل باید چند مشخصه داشته باشد');
  assert.ok(phone.every((f) => f.label && f.key));
  assert.ok(phone.some((f) => f.showInRow), 'حداقل یک مشخصه باید در ردیف نمایش داده شود');
  const again = model.presetFields('phone');
  assert.notEqual(phone[0], again[0], 'هر بار باید شیء تازه ساخته شود');
  assert.equal(phone[0].key, again[0].key, 'کلید مشخصه باید پایدار باشد');
  assert.deepEqual(model.presetFields('nope'), []);
});

test('مشخصات اضافهٔ هر کالا ذخیره، پاک‌سازی و گرد می‌شوند', () => {
  const data = model.normalizeStore({
    store: { name: 'فروشگاه' },
    categories: [{ id: 'c1', title: 'موبایل', fields: [{ key: 'ram', label: 'رم' }] }],
    devices: [{
      id: 'd1', name: 'گوشی', categoryId: 'c1', stock: 1,
      specs: { ram: '۸' },
      extraSpecs: [
        { label: 'ایراد فنی', value: 'خش کوچک' },
        { label: 'ایراد فنی', value: 'تکراری' },
        { label: '', value: 'بدون عنوان' },
        { label: ' جعبه ', value: ' دارد ' }
      ]
    }]
  });
  const extra = model.deviceExtraSpecs(data.devices[0]);
  assert.deepEqual(extra, [
    { label: 'ایراد فنی', value: 'خش کوچک' },
    { label: 'جعبه', value: 'دارد' }
  ]);
  const json = JSON.parse(model.serializeStore(data));
  assert.deepEqual(json.devices[0].extraSpecs, extra, 'خروجی JSON باید مشخصات اضافه را نگه دارد');
  assert.deepEqual(model.deviceExtraSpecs({}), [], 'کالای بدون مشخصات اضافه نباید خطا بدهد');
});

test('پنل مدیریت یک صفحه است، نه پنجرهٔ شناور', () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/manage.js'), 'utf8');
  assert.ok(!/openSheet/.test(src), 'پنل نباید از دیالوگ شناور استفاده کند');
  assert.ok(/is-manage-page/.test(src), 'کلاس صفحهٔ مدیریت تنظیم نمی‌شود');
  assert.ok(/data-mp-back/.test(src), 'دکمهٔ بازگشت به لیست در پنل نیست');
  assert.ok(/closeManagePanel/.test(src), 'تابع بستن صفحه تعریف نشده');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/managePageHost/.test(html), 'میزبان صفحهٔ مدیریت در index.html نیست');
  assert.ok(!/adminDockHost/.test(html), 'میزبان نوار مدیریت قدیمی هنوز در HTML است');
  const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');
  assert.ok(/\.mpage__foot/.test(css), 'نوار پایین صفحهٔ مدیریت استایل ندارد');
  assert.ok(!/\.adminbar/.test(css), 'استایل نوار مدیریت قدیمی باقی مانده');
});

test('رنگ‌های تأکیدی فقط روی همین چند عنصر پنل اعمال می‌شوند', () => {
  const css = fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8');
  assert.ok(/\.mp-badge--ok/.test(css) && /\.mp-badge--low/.test(css) && /\.mp-badge--out/.test(css),
    'برچسب وضعیت باید سه رنگ داشته باشد');
  assert.ok(/\.mp-stepper__btn--inc[^{]*\{[^}]*var\(--ok\)/.test(css), 'دکمهٔ افزایش باید سبز باشد');
  assert.ok(/\.mp-stepper__btn--dec[^{]*\{[^}]*var\(--low\)/.test(css), 'دکمهٔ کاهش باید زرد باشد');
  assert.ok(/\.mp-row__danger[^{]*\{[^}]*var\(--danger\)/.test(css), 'حذف باید قرمز باشد');
  const base = fs.readFileSync(path.join(ROOT, 'assets/css/base.css'), 'utf8');
  assert.ok(/\.btn--ok\s*\{/.test(base), 'دکمهٔ سبز تأیید تعریف نشده');
});

test('دسته‌ها قالب مشخصات دارند و کالاها می‌توانند مشخصهٔ اضافه بگیرند', () => {
  const admin = fs.readFileSync(path.join(ROOT, 'assets/js/admin.js'), 'utf8');
  assert.ok(/FIELD_PRESETS/.test(admin), 'قالب‌های آماده در ویرایش دسته استفاده نشده‌اند');
  assert.ok(/data-preset/.test(admin), 'دکمهٔ قالب مشخصات در ویرایش دسته نیست');
  assert.ok(/extraSpecsHost/.test(admin), 'بخش مشخصات اضافه در فرم کالا نیست');
  assert.ok(/specs,\s*\n\s*extraSpecs/.test(admin), 'مشخصات اضافه هنگام ذخیره ثبت نمی‌شود');
  const modelSrc = fs.readFileSync(path.join(ROOT, 'assets/js/model.js'), 'utf8');
  assert.ok(/export const FIELD_PRESETS/.test(modelSrc));
  assert.ok(/extraSpecs: normalizeExtraSpecs/.test(modelSrc));
  const render = fs.readFileSync(path.join(ROOT, 'assets/js/render.js'), 'utf8');
  assert.ok(/deviceExtraSpecs\(device\)/.test(render), 'مشخصات اضافه در جزئیات کالا دیده نمی‌شود');
});

/* ── Summary ──────────────────────────────────────────────────────────── */
const line = '─'.repeat(58);
console.log(`\n${line}`);
if (failed) {
  console.log(`  ${passed} موفق · ${failed} ناموفق`);
  for (const f of failures) console.log(`   ✖ ${f.name}`);
  console.log(`${line}\n`);
  process.exit(1);
}
console.log(`  همه ${passed} آزمون موفق ✅`);
console.log(`${line}\n`);
