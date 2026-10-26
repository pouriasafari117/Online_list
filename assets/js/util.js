/* ==========================================================================
   Small utilities — formatting, DOM helpers, validation
   ========================================================================== */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Tiny hyperscript: h('div', {class:'x'}, 'text', node) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'attrs') for (const [a, val] of Object.entries(v)) { if (val != null && val !== false) el.setAttribute(a, val); }
    else if (k in el && typeof el[k] !== 'function' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toFaDigits(input) {
  return String(input ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}

export function toEnDigits(input) {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Converts Persian/Arabic digits and strips separators. Returns NaN when empty. */
export function parseNumber(input) {
  if (typeof input === 'number') return input;
  const cleaned = toEnDigits(String(input ?? ''))
    .replace(/[٬,\s\u00a0]/g, '')
    .replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return NaN;
  return Number(cleaned);
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export function debounce(fn, wait = 180) {
  let t = 0;
  const debounced = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(t);
  debounced.flush = (...args) => { clearTimeout(t); fn(...args); };
  return debounced;
}

export function raf(fn) { return requestAnimationFrame(fn); }

export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value));
}

export function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

export function asString(v, fallback = '') {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

export function asInt(v, fallback = 0) {
  const n = parseNumber(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function asBool(v, fallback = false) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return fallback;
}

export function asIsoDate(v, fallback = null) {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

export function slugify(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .slice(0, 40) || 'item';
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Formats numbers with the configured numeral system. */
export function formatNum(value, numerals = 'fa', options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const locale = numerals === 'en' ? 'en-US' : 'fa-IR';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, ...options }).format(n);
}

/** Persian/Arabic-aware "time ago". */
export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Math.round((now - t) / 1000);
  if (diff < 0) return 'همین حالا';
  if (diff < 60) return 'همین الان';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${toFaDigits(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${toFaDigits(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'دیروز';
  if (days < 7) return `${toFaDigits(days)} روز پیش`;
  if (days < 31) return `${toFaDigits(Math.floor(days / 7))} هفته پیش`;
  if (days < 365) return `${toFaDigits(Math.floor(days / 30))} ماه پیش`;
  return `${toFaDigits(Math.floor(days / 365))} سال پیش`;
}

const JALALI_FMT = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});
const JALALI_SHORT = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric', month: 'long', day: 'numeric'
});
const JALALI_TIME = new Intl.DateTimeFormat('fa-IR', {
  hour: '2-digit', minute: '2-digit', hour12: false
});

function partsOf(fmt, date) {
  const out = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}

/** "دوشنبه ۴ آبان ۱۴۰۵" */
export function formatJalaliDate(iso, { short = false } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = partsOf(short ? JALALI_SHORT : JALALI_FMT, d);
  return short ? `${p.day} ${p.month} ${p.year}` : `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

/** "۱۴:۳۵" */
export function formatJalaliTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return JALALI_TIME.format(d).replace(/[0-9]/g, (x) => FA_DIGITS[+x]);
}

export function formatJalaliDateTime(iso, opts = {}) {
  return `${formatJalaliDate(iso, opts)} · ${formatJalaliTime(iso)}`;
}

/** "۱۴۰۵/۰۸/۰۴" — useful for filenames / commit messages */
export function formatJalaliStamp(date = new Date()) {
  const p = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce((acc, x) => (x.type !== 'literal' ? { ...acc, [x.type]: x.value } : acc), {});
  return toFaDigits(`${p.year}/${p.month}/${p.day}`);
}

export function telHref(phone) {
  const digits = toEnDigits(String(phone || '')).replace(/[^\d+]/g, '');
  return `tel:${digits || ''}`;
}

export function whatsappHref(number, text = '') {
  const digits = toEnDigits(String(number || '')).replace(/[^\d]/g, '');
  if (!digits) return '';
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${q}`;
}

export function instagramHref(handle) {
  const h = String(handle || '').trim().replace(/^@/, '');
  if (!h) return '';
  if (/^https?:\/\//i.test(h)) return h;
  return `https://instagram.com/${h}`;
}

export function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function truncate(str, max = 80) {
  const s = String(str ?? '');
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;
}

export function safeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^(https?:|data:image\/)/i.test(s)) return s;
  return '';
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;inset-block-start:-1000px;opacity:0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Normalizes a search query: lower-case, unify Arabic/Persian letters, strip ZWNJ. */
export function normalizeSearch(str) {
  return toEnDigits(String(str ?? ''))
    .toLowerCase()
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ۀهٔ]/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesQuery(haystack, needle) {
  const h = normalizeSearch(haystack);
  const terms = normalizeSearch(needle).split(' ').filter(Boolean);
  return terms.every((t) => h.includes(t));
}

export function isTouchDevice() {
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

export function storageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function sessionGet(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function sessionSet(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function sessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

/** Simple deterministic hash for choosing a neutral thumbnail tone. */
export function hashCode(str) {
  let hash = 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function pickTone(str) {
  return (hashCode(str) % 5) + 1;
}

/** Compare two JSON-able values (stable-ish). */
export function jsonEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

export function stableStringify(obj, space = 0) {
  const seen = new WeakSet();
  const build = (value) => {
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '"[Circular]"';
      seen.add(value);
      if (Array.isArray(value)) return value.map(build);
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = build(value[key]);
      return out;
    }
    return value;
  };
  return JSON.stringify(build(obj), null, space);
}

/** Focus trap fallback helpers for elements outside <dialog>. */
export const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',');

export function focusFirst(root) {
  const target = root.querySelector('[autofocus]') || root.querySelector(focusableSelector);
  if (target) setTimeout(() => target.focus({ preventScroll: true }), 60);
}
