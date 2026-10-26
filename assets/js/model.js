/* ==========================================================================
   Data model — defaults, normalization, serialization, diffing
   Everything the shop owns lives in one JSON file: data/store.json
   ========================================================================== */

import {
  asBool, asInt, asIsoDate, asString, deepClone, isPlainObject,
  jsonEqual, safeUrl, stableStringify, uid
} from './util.js';
import { hasIcon } from './icons.js';

export const SCHEMA_VERSION = 1;
export const CONDITION_OPTIONS = ['نو', 'استوک', 'کارکرده', 'ریفربیش'];
export const THEME_OPTIONS = ['auto', 'light', 'dark'];
export const NUMERAL_OPTIONS = ['fa', 'en'];

export const CATEGORY_ICONS = [
  'mobile_2', 'laptop_mac', 'tablet_mac', 'sports_esports', 'headphones', 'watch',
  'keyboard', 'mouse', 'monitor', 'tv', 'speaker', 'photo_camera', 'print', 'router',
  'memory', 'battery_full', 'cable', 'smart_toy', 'devices_other', 'desktop_windows',
  'gamepad', 'router', 'store', 'category', 'devices', 'badge', 'star', 'sell'
];

export const STORE_DEFAULTS = {
  name: 'فروشگاه من',
  tagline: 'موجودی را ببین، بعد تماس بگیر.',
  description: 'لیست موجودی فروشگاه، همیشه به‌روز و بدون تماس اضافه.',
  phone: '',
  whatsapp: '',
  instagram: '',
  address: '',
  hours: ''
};

export const SETTINGS_DEFAULTS = {
  theme: 'auto',
  showPrices: true,
  showExactStock: true,
  lowStockThreshold: 2,
  currency: 'تومان',
  numerals: 'fa',
  adminName: 'مدیر فروشگاه',
  updatedAtLabel: 'آخرین به‌روزرسانی'
};

export function defaultCategory(title = 'دسته‌بندی جدید', icon = 'category') {
  return {
    id: uid('cat'),
    title,
    description: '',
    icon,
    fields: []
  };
}

export function defaultField({ label = 'مشخصه', key = uid('f'), unit = '', showInRow = false } = {}) {
  return { key, label, unit, type: 'text', showInRow };
}

/** Valid data used before the first store.json exists. */
export function makeDefaultData(now = new Date().toISOString()) {
  return {
    version: SCHEMA_VERSION,
    store: { ...deepClone(STORE_DEFAULTS) },
    settings: { ...deepClone(SETTINGS_DEFAULTS) },
    categories: [
      { id: 'cat_phone', title: 'موبایل', description: 'گوشی‌های نو و استوک', icon: 'mobile_2', fields: [] },
      { id: 'cat_laptop', title: 'لپ‌تاپ', description: 'لپ‌تاپ‌های اداری و گیمینگ', icon: 'laptop_mac', fields: [] }
    ],
    devices: [],
    meta: {
      updatedAt: now,
      updatedBy: 'مدیر فروشگاه',
      history: []
    }
  };
}

/* ── Normalization ───────────────────────────────────────────────────────── */

function normalizeSettings(settings) {
  const s = isPlainObject(settings) ? settings : {};
  const theme = THEME_OPTIONS.includes(s.theme) ? s.theme : SETTINGS_DEFAULTS.theme;
  const numerals = NUMERAL_OPTIONS.includes(s.numerals) ? s.numerals : SETTINGS_DEFAULTS.numerals;
  return {
    theme,
    showPrices: asBool(s.showPrices, SETTINGS_DEFAULTS.showPrices),
    showExactStock: asBool(s.showExactStock, SETTINGS_DEFAULTS.showExactStock),
    lowStockThreshold: Math.min(99, Math.max(0, asInt(s.lowStockThreshold, SETTINGS_DEFAULTS.lowStockThreshold))),
    currency: asString(s.currency, SETTINGS_DEFAULTS.currency).slice(0, 24) || SETTINGS_DEFAULTS.currency,
    numerals,
    adminName: asString(s.adminName, SETTINGS_DEFAULTS.adminName).slice(0, 60) || SETTINGS_DEFAULTS.adminName,
    updatedAtLabel: asString(s.updatedAtLabel, SETTINGS_DEFAULTS.updatedAtLabel).slice(0, 60) || SETTINGS_DEFAULTS.updatedAtLabel
  };
}

function normalizeField(raw) {
  if (!isPlainObject(raw)) return null;
  const label = asString(raw.label).trim().slice(0, 40);
  if (!label) return null;
  let key = asString(raw.key).trim();
  if (!/^[\w-]{1,48}$/.test(key)) key = uid('f');
  return {
    key,
    label,
    unit: asString(raw.unit).trim().slice(0, 18),
    type: raw.type === 'number' ? 'number' : 'text',
    showInRow: asBool(raw.showInRow, false)
  };
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) return [];
  const seenCats = new Set();
  const out = [];
  for (const raw of categories) {
    if (!isPlainObject(raw)) continue;
    let id = asString(raw.id).trim();
    if (!id || seenCats.has(id)) id = uid('cat');
    seenCats.add(id);
    const title = asString(raw.title).trim().slice(0, 60) || 'بدون نام';
    const icon = asString(raw.icon, 'category');
    const fields = [];
    const seenFields = new Set();
    for (const f of Array.isArray(raw.fields) ? raw.fields : []) {
      const nf = normalizeField(f);
      if (!nf || seenFields.has(nf.key)) continue;
      seenFields.add(nf.key);
      fields.push(nf);
      if (fields.length >= 12) break;
    }
    out.push({
      id,
      title,
      description: asString(raw.description).trim().slice(0, 240),
      icon: hasIcon(icon) ? icon : 'category',
      fields
    });
  }
  return out;
}

function normalizeSpecs(specs) {
  const out = {};
  if (!isPlainObject(specs)) return out;
  for (const [key, value] of Object.entries(specs)) {
    if (!/^[\w-]{1,48}$/.test(key)) continue;
    const str = asString(value).trim();
    if (!str) continue;
    out[key] = str.slice(0, 300);
  }
  return out;
}

function normalizeDevices(devices, categoryIds) {
  if (!Array.isArray(devices)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of devices) {
    if (!isPlainObject(raw)) continue;
    let id = asString(raw.id).trim();
    if (!id || seen.has(id)) id = uid('dev');
    seen.add(id);
    const name = asString(raw.name).trim().slice(0, 120);
    if (!name) continue;
    const categoryId = categoryIds.has(asString(raw.categoryId)) ? asString(raw.categoryId) : '';
    const price = Math.max(0, asInt(raw.price, 0));
    out.push({
      id,
      name,
      brand: asString(raw.brand).trim().slice(0, 60),
      categoryId,
      price,
      priceOnRequest: asBool(raw.priceOnRequest, false),
      stock: Math.max(0, asInt(raw.stock, 0)),
      condition: CONDITION_OPTIONS.includes(raw.condition) ? raw.condition : CONDITION_OPTIONS[0],
      warranty: asString(raw.warranty).trim().slice(0, 80),
      specs: normalizeSpecs(raw.specs),
      note: asString(raw.note).trim().slice(0, 400),
      image: safeUrl(raw.image),
      featured: asBool(raw.featured, false),
      hidden: asBool(raw.hidden, false),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : out.length,
      createdAt: asIsoDate(raw.createdAt, new Date().toISOString()),
      updatedAt: asIsoDate(raw.updatedAt, new Date().toISOString())
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const raw of history) {
    if (!isPlainObject(raw)) continue;
    const at = asIsoDate(raw.at);
    if (!at) continue;
    out.push({
      id: asString(raw.id) || uid('h'),
      at,
      by: asString(raw.by).slice(0, 60) || 'مدیر فروشگاه',
      action: asString(raw.action).slice(0, 30) || 'publish',
      summary: asString(raw.summary).slice(0, 280),
      stats: isPlainObject(raw.stats) ? {
        added: asInt(raw.stats.added, 0),
        updated: asInt(raw.stats.updated, 0),
        removed: asInt(raw.stats.removed, 0)
      } : undefined
    });
  }
  return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 60);
}

export function normalizeStore(raw, { fallback = null } = {}) {
  if (!isPlainObject(raw)) return fallback ? deepClone(fallback) : makeDefaultData();
  const categories = normalizeCategories(raw.categories);
  const categoryIds = new Set(categories.map((c) => c.id));
  const devices = normalizeDevices(raw.devices, categoryIds);
  const meta = isPlainObject(raw.meta) ? raw.meta : {};
  return {
    version: SCHEMA_VERSION,
    store: normalizeStoreFields(raw.store),
    settings: normalizeSettings(raw.settings),
    categories,
    devices,
    meta: {
      updatedAt: asIsoDate(meta.updatedAt) || new Date().toISOString(),
      updatedBy: asString(meta.updatedBy).slice(0, 60) || 'مدیر فروشگاه',
      history: normalizeHistory(meta.history)
    }
  };
}

function normalizeStoreFields(store) {
  const s = isPlainObject(store) ? store : {};
  const out = {};
  for (const key of Object.keys(STORE_DEFAULTS)) {
    out[key] = asString(s[key], STORE_DEFAULTS[key]).slice(0, key === 'description' ? 600 : 160);
  }
  if (!out.name.trim()) out.name = STORE_DEFAULTS.name;
  return out;
}

/** Pretty, stable JSON — this is exactly what gets committed. */
export function serializeStore(data) {
  const payload = {
    version: SCHEMA_VERSION,
    store: pick(data.store, Object.keys(STORE_DEFAULTS)),
    settings: pick(data.settings, Object.keys(SETTINGS_DEFAULTS)),
    categories: data.categories.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      icon: c.icon,
      fields: c.fields.map((f) => ({
        key: f.key, label: f.label, unit: f.unit, type: f.type, showInRow: f.showInRow
      }))
    })),
    devices: data.devices.map((d) => ({
      id: d.id,
      name: d.name,
      brand: d.brand,
      categoryId: d.categoryId,
      price: d.price,
      priceOnRequest: d.priceOnRequest,
      stock: d.stock,
      condition: d.condition,
      warranty: d.warranty,
      specs: d.specs,
      note: d.note,
      image: d.image,
      featured: d.featured,
      hidden: d.hidden,
      order: d.order,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    })),
    meta: {
      updatedAt: data.meta.updatedAt,
      updatedBy: data.meta.updatedBy,
      history: data.meta.history
    }
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj?.[key];
  return out;
}

/* ── Derived data ────────────────────────────────────────────────────────── */

export function visibleDevices(data, { includeHidden = false } = {}) {
  const list = data?.devices || [];
  return includeHidden ? list : list.filter((d) => !d.hidden);
}

export function getCategory(data, id) {
  return (data?.categories || []).find((c) => c.id === id) || null;
}

export function categoryTitle(data, id) {
  return getCategory(data, id)?.title || 'سایر';
}

export function stockState(device, settings) {
  if (!device || device.stock <= 0) return 'out';
  if (device.stock <= (settings?.lowStockThreshold ?? 2)) return 'low';
  return 'in';
}

export function computeStats(data, { includeHidden = false } = {}) {
  const devices = visibleDevices(data, { includeHidden });
  const inStock = devices.filter((d) => d.stock > 0).length;
  const low = devices.filter((d) => d.stock > 0 && d.stock <= (data?.settings?.lowStockThreshold ?? 2)).length;
  const out = devices.filter((d) => d.stock <= 0).length;
  const units = devices.reduce((sum, d) => sum + Math.max(0, d.stock), 0);
  const catIds = new Set(devices.map((d) => d.categoryId).filter(Boolean));
  const categories = (data?.categories || []).filter((c) => catIds.has(c.id)).length;
  return {
    devices: devices.length,
    inStock,
    low,
    out,
    units,
    categories,
    categoriesTotal: data?.categories?.length || 0,
    featured: devices.filter((d) => d.featured).length
  };
}

export function countByCategory(data, { includeHidden = false } = {}) {
  const map = new Map();
  for (const d of visibleDevices(data, { includeHidden })) {
    const key = d.categoryId || '__none__';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

/** Format a spec value for display. */
export function specText(field, device) {
  const raw = device?.specs?.[field.key];
  if (raw == null || raw === '') return '';
  return field.unit ? `${raw} ${field.unit}` : raw;
}

export function deviceSearchText(device, data) {
  const cat = getCategory(data, device.categoryId);
  const specs = Object.values(device.specs || {}).join(' ');
  return [
    device.name, device.brand, device.condition, device.warranty, device.note,
    cat?.title || '', specs
  ].join(' \u0001 ');
}

/* ── Diffing (for the publish dialog) ───────────────────────────────────── */

export function computeDiff(base, next) {
  const baseDevices = new Map((base?.devices || []).map((d) => [d.id, d]));
  const nextDevices = new Map((next?.devices || []).map((d) => [d.id, d]));
  const added = [];
  const updated = [];
  const removed = [];
  for (const [id, device] of nextDevices) {
    if (!baseDevices.has(id)) added.push(device);
    else if (!jsonEqual(baseDevices.get(id), device)) updated.push(device);
  }
  for (const [id, device] of baseDevices) if (!nextDevices.has(id)) removed.push(device);

  const baseCats = new Map((base?.categories || []).map((c) => [c.id, c]));
  const nextCats = new Map((next?.categories || []).map((c) => [c.id, c]));
  const catAdded = [];
  const catUpdated = [];
  const catRemoved = [];
  for (const [id, cat] of nextCats) {
    if (!baseCats.has(id)) catAdded.push(cat);
    else if (!jsonEqual(baseCats.get(id), cat)) catUpdated.push(cat);
  }
  for (const [id, cat] of baseCats) if (!nextCats.has(id)) catRemoved.push(cat);

  const settingsChanged = !jsonEqual(base?.settings, next?.settings);
  const storeChanged = !jsonEqual(base?.store, next?.store);
  const stockOnly = added.length === 0 && removed.length === 0 && catAdded.length === 0 && catRemoved.length === 0
    && catUpdated.length === 0 && !settingsChanged && !storeChanged
    && updated.length > 0 && updated.every((d) => {
      const before = baseDevices.get(d.id);
      return before && before.stock !== d.stock
        && jsonEqual({ ...before, stock: 0, updatedAt: '' }, { ...d, stock: 0, updatedAt: '' });
    });

  return {
    added, updated, removed,
    catAdded, catUpdated, catRemoved,
    settingsChanged,
    storeChanged,
    stockOnly,
    total: added.length + updated.length + removed.length + catAdded.length + catUpdated.length + catRemoved.length
      + (settingsChanged ? 1 : 0) + (storeChanged ? 1 : 0)
  };
}

export function diffSummary(diff) {
  if (!diff) return '';
  if (diff.total === 0) return 'بدون تغییر';
  const parts = [];
  if (diff.added.length) parts.push(`${diff.added.length} دستگاه جدید`);
  if (diff.updated.length) parts.push(`${diff.updated.length} دستگاه به‌روزرسانی`);
  if (diff.removed.length) parts.push(`${diff.removed.length} دستگاه حذف`);
  if (diff.catAdded.length) parts.push(`${diff.catAdded.length} دسته جدید`);
  if (diff.catUpdated.length) parts.push(`${diff.catUpdated.length} دسته ویرایش`);
  if (diff.catRemoved.length) parts.push(`${diff.catRemoved.length} دسته حذف`);
  if (diff.storeChanged) parts.push('اطلاعات فروشگاه');
  if (diff.settingsChanged) parts.push('تنظیمات نمایش');
  return parts.join(' · ');
}

/** Public JSON parse guard used by both the site and the setup page. */
/**
 * Wipes the inventory (devices + categories) while keeping store identity,
 * settings, the vault and the history log. Returns the new data plus what was
 * removed so the UI can report exact numbers.
 *
 * Pure and side-effect free — safe to unit-test.
 */
export function clearInventory(data, {
  at = new Date().toISOString(),
  by = '',
  keepCategories = false,
  reason = 'بازنشانی کامل لیست موجودی'
} = {}) {
  const next = normalizeStore(data);
  const removedDevices = next.devices.length;
  const removedCategories = keepCategories ? 0 : next.categories.length;

  next.devices = [];
  if (!keepCategories) next.categories = [];

  const author = String(by || next.meta.updatedBy || next.settings.adminName || 'مدیر فروشگاه').trim();
  next.meta.updatedAt = at;
  next.meta.updatedBy = author;
  next.meta.history = [{
    id: uid('h'),
    at,
    by: author,
    action: 'reset',
    summary: reason,
    stats: { added: 0, updated: 0, removed: removedDevices }
  }, ...(next.meta.history || [])].slice(0, 60);

  return { data: normalizeStore(next), removedDevices, removedCategories };
}

/** The exact phrase an admin has to type before a destructive reset. */
export const RESET_PHRASE = 'حذف همه';
/** Typed confirmation for deleting the vault (password + token) entirely. */
export const CREDENTIAL_RESET_PHRASE = 'بازنشانی رمز';

export function parseStoreJson(text) {
  const raw = JSON.parse(text);
  if (!isPlainObject(raw)) throw new Error('ساختار فایل معتبر نیست.');
  return normalizeStore(raw);
}

export { stableStringify };
