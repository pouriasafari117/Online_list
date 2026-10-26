/* ==========================================================================
   Client state — a tiny observable store
   - public mode: read-only data + view preferences
   - admin mode: encrypted token unlocked, drafts kept in sessionStorage
   - demo mode: try the admin UI without a vault (nothing can be published)
   ========================================================================== */

import { computeDiff, normalizeStore, serializeStore } from './model.js';
import { deepClone, sessionGet, sessionRemove, sessionSet, storageGet, storageSet } from './util.js';

const DRAFT_PREFIX = 'ol.draft.v1.';
const VIEW_KEY = 'ol.view';

export const state = {
  data: null,
  baseline: null,
  sha: null,
  loading: true,
  source: null,
  sourceUrl: null,
  error: null,
  mode: 'public', // public | admin | demo
  site: null,
  repo: null, // { owner, repo, branch }
  api: null,
  user: null,
  vault: null,
  vaultUrl: null,
  lastLoadedAt: null,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  ui: {
    q: '',
    category: 'all',
    avail: 'all',
    hiddenOnly: false,
    sort: 'recommended',
    view: 'list',
    limit: 24,
    printAll: false,
    adminFilterHidden: false
  },
  loginFailures: 0
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(reason = 'change', detail = {}) {
  for (const fn of [...listeners]) {
    try { fn(reason, detail); } catch (err) { console.error('[state]', err); }
  }
}

export function isAdmin() { return state.mode === 'admin' || state.mode === 'demo'; }
export function isDemo() { return state.mode === 'demo'; }
export function canPublish() { return state.mode === 'admin' && !!state.api && !!state.repo; }

export function repoKey(repo = state.repo) {
  return repo ? `${repo.owner}/${repo.repo}@${repo.branch}` : 'local';
}

function draftStorageKey(repo = state.repo) {
  return `${DRAFT_PREFIX}${repoKey(repo)}`;
}

/* ── Data ────────────────────────────────────────────────────────────────── */

export function initPublic(data, { source = 'local', url = '', sha = null } = {}) {
  state.data = normalizeStore(data);
  state.baseline = deepClone(state.data);
  state.sha = sha;
  state.source = source;
  state.sourceUrl = url;
  state.loading = false;
  state.error = null;
  state.lastLoadedAt = Date.now();
  applyStoredPreferences();
  emit('data', { source });
}

export function setLoading(value) {
  state.loading = !!value;
  emit('loading');
}

export function setError(error) {
  state.error = error;
  state.loading = false;
  emit('error', { error });
}

/** Replaces the whole document (import, remote refresh while admin, etc.). */
export function replaceData(next, { baseline = false, source = null } = {}) {
  state.data = normalizeStore(next);
  if (baseline || !state.baseline) state.baseline = deepClone(state.data);
  if (source) state.source = source;
  refreshDirty();
  if (isAdmin()) persistDraft();
  emit('data', { source: source || 'replace' });
}

/**
 * Applies a mutation on a deep clone, then re-normalizes.
 * This is the only sanctioned way to edit the document.
 */
export function mutate(fn, reason = 'data') {
  if (!state.data) return;
  const draft = deepClone(state.data);
  fn(draft);
  const next = normalizeStore(draft);
  state.data = next;
  refreshDirty();
  if (isAdmin()) persistDraft();
  emit(reason);
}

/**
 * Like mutate(), but does not emit a re-render. Used for high-frequency
 * interactions (stock +/-) where the caller patches just one row.
 */
export function mutateQuiet(fn) {
  if (!state.data) return;
  const draft = deepClone(state.data);
  fn(draft);
  state.data = normalizeStore(draft);
  refreshDirty();
  if (isAdmin()) persistDraft();
  return state.data;
}

export function refreshDirty() {
  if (!state.baseline || !state.data) { state.dirty = false; return false; }
  const changed = serializeStore(state.baseline) !== serializeStore(state.data);
  state.dirty = changed;
  return changed;
}

export function currentDiff() {
  if (!state.baseline || !state.data) return null;
  return computeDiff(state.baseline, state.data);
}

/* ── View preferences ───────────────────────────────────────────────────── */

export function applyStoredPreferences() {
  const view = storageGet(VIEW_KEY, null);
  if (view === 'grid' || view === 'list') state.ui.view = view;
  const params = new URLSearchParams(location.search);
  const cat = params.get('cat');
  if (cat) state.ui.category = cat;
  const q = params.get('q');
  if (q) state.ui.q = q.slice(0, 80);
  const avail = params.get('avail');
  if (['all', 'in', 'low', 'out'].includes(avail)) state.ui.avail = avail;
  const sort = params.get('sort');
  if (['recommended', 'price-asc', 'price-desc', 'stock-desc', 'newest', 'name-asc'].includes(sort)) state.ui.sort = sort;
  const viewParam = params.get('view');
  if (viewParam === 'grid' || viewParam === 'list') state.ui.view = viewParam;
}

export function setUI(patch, { reason = 'ui', silent = false } = {}) {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (state.ui[key] !== value) { state.ui[key] = value; changed = true; }
  }
  if (!changed) return;
  if (Object.hasOwn(patch, 'view')) storageSet(VIEW_KEY, state.ui.view);
  if (!silent) emit(reason);
}



export function currentNumerals() {
  return state.data?.settings?.numerals === 'en' ? 'en' : 'fa';
}

export function syncUrl() {
  if (typeof history === 'undefined') return;
  const params = new URLSearchParams();
  const { q, category, avail, sort, view } = state.ui;
  if (q) params.set('q', q);
  if (category && category !== 'all') params.set('cat', category);
  if (avail && avail !== 'all') params.set('avail', avail);
  if (sort && sort !== 'recommended') params.set('sort', sort);
  if (view && view !== 'list') params.set('view', view);
  const search = params.toString();
  const url = `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
  try { history.replaceState(null, '', url); } catch { /* ignore */ }
}

/* ── Drafts (survive an accidental refresh, per tab) ────────────────────── */

export function persistDraft() {
  if (!isAdmin() || !state.data) return;
  if (!state.dirty) { sessionRemove(draftStorageKey()); return; }
  try {
    const ok = sessionSet(draftStorageKey(), {
      data: state.data,
      at: Date.now()
    });
    if (!ok) console.warn('[state] draft could not be stored');
  } catch (err) {
    console.warn('[state] draft failed', err);
  }
}

export function readDraft(repo = state.repo) {
  const draft = sessionGet(draftStorageKey(repo), null);
  if (!draft?.data) return null;
  if (Date.now() - Number(draft.at || 0) > 1000 * 60 * 60 * 24) {
    sessionRemove(draftStorageKey(repo));
    return null;
  }
  return draft;
}

export function clearDraft(repo = state.repo) {
  sessionRemove(draftStorageKey(repo));
}

export function discardDraftAndReset() {
  clearDraft();
  state.data = deepClone(state.baseline);
  state.dirty = false;
  emit('data', { source: 'discard' });
}

/* ── Sessions ────────────────────────────────────────────────────────────── */

export function startAdminSession({ data, baseline, sha, site, repo, api, user, vault, vaultUrl, mode = 'admin' }) {
  const nextBaseline = normalizeStore(baseline || data);
  state.baseline = nextBaseline;
  state.data = normalizeStore(data || nextBaseline);
  state.sha = sha ?? null;
  state.site = site || state.site;
  state.repo = repo || state.repo;
  state.api = api || null;
  state.user = user || null;
  state.vault = vault || null;
  state.vaultUrl = vaultUrl || null;
  state.mode = mode;
  state.loading = false;
  state.error = null;
  refreshDirty();
  emit('auth', { mode });
  emit('data', { source: 'admin' });
}

export function endAdminSession() {
  state.mode = 'public';
  state.api = null;
  state.user = null;
  state.vault = null;
  state.vaultUrl = null;
  clearDraft();
  if (state.baseline) state.data = deepClone(state.baseline);
  state.dirty = false;
  state.sha = null;
  emit('auth', { mode: 'public' });
  emit('data', { source: 'logout' });
}

export function markPublished({ data, sha, commit }) {
  state.baseline = deepClone(data);
  state.data = deepClone(data);
  state.sha = sha || state.sha;
  state.dirty = false;
  state.lastCommit = commit || null;
  clearDraft();
  emit('data', { source: 'publish' });
  emit('published', { commit });
}

export function setNetwork(online) {
  state.online = !!online;
  emit('network', { online: state.online });
}
