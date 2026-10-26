/* ==========================================================================
   GitHub API — the only "backend" this site has.
   The admin's encrypted vault holds a fine-grained token with Contents:write.
   ========================================================================== */

import { base64ToBytes, bytesToBase64 } from './crypto.js';

const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';
const API_VERSION = '2022-11-28';
const DEFAULT_TIMEOUT = 20_000;
// Resolve data/ against the document base (reliable on Pages, file servers
// and custom domains) instead of import.meta.url. Resolved lazily so this
// module can also be unit-tested outside a browser.
function dataBase() {
  const base = (typeof document !== 'undefined' && document.baseURI)
    || (typeof location !== 'undefined' && location.href)
    || 'http://localhost/';
  return new URL('data/', base);
}


export class ApiError extends Error {
  constructor(message, { status = 0, code = 'api', detail = '', url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.url = url;
  }
}

/** Reads owner/repo from a GitHub Pages URL. */
export function parseRepoFromLocation(loc = window.location) {
  const host = loc.hostname || '';
  if (!host.endsWith('.github.io')) return null;
  const owner = host.slice(0, -'.github.io'.length);
  if (!owner || owner.includes('.')) return null;
  const segments = loc.pathname.split('/').filter(Boolean);
  const repo = segments[0] || `${owner}.github.io`;
  const branch = 'main';
  return { owner, repo, branch, pageUrl: `${loc.origin}/${repo === `${owner}.github.io` ? '' : repo + '/'}` };
}

export function isValidRepoPart(value, { allowSlash = false } = {}) {
  const s = String(value || '').trim();
  if (!s || s.length > 100) return false;
  return allowSlash
    ? /^[A-Za-z0-9._/-]+$/.test(s)
    : /^[A-Za-z0-9._-]+$/.test(s);
}

export function looksLikeToken(token) {
  const s = String(token || '').trim();
  return s.length >= 20 && /^[A-Za-z0-9_]+$/.test(s);
}

export function rawUrl({ owner, repo, branch = 'main', path }, { cacheBust = false } = {}) {
  const safePath = String(path).split('/').map(encodeURIComponent).join('/');
  const q = cacheBust ? `?v=${Date.now()}` : '';
  return `${RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${safePath}${q}`;
}

export function pagesUrl({ owner, repo }) {
  return repo === `${owner}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${repo}/`;
}

function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(String(text)));
}

function base64ToUtf8(b64) {
  return new TextDecoder().decode(base64ToBytes(String(b64).replace(/\s+/g, '')));
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 300) }; }
}

function mapHttpError(response, data, url) {
  const status = response.status;
  const apiMessage = data?.message || '';
  const base = { status, detail: apiMessage, url };
  if (status === 401) {
    return new ApiError('توکن گیت‌هاب معتبر نیست یا منقضی شده است.', { ...base, code: 'unauthorized' });
  }
  if (status === 403) {
    if (/rate limit/i.test(apiMessage)) {
      return new ApiError('محدودیت درخواست گیت‌هاب؛ کمی بعد دوباره تلاش کنید.', { ...base, code: 'rate-limit' });
    }
    return new ApiError('دسترسی توکن کافی نیست. مجوز «Contents: Read and write» را بررسی کنید.', { ...base, code: 'forbidden' });
  }
  if (status === 404) {
    return new ApiError('مخزن یا مسیر پیدا نشد؛ نام مخزن و دسترسی توکن را بررسی کنید.', { ...base, code: 'not-found' });
  }
  if (status === 409 || status === 422) {
    return new ApiError('تغییرات هم‌زمان ثبت شده است. صفحه را تازه کنید و دوباره تلاش کنید.', { ...base, code: 'conflict' });
  }
  if (status >= 500) {
    return new ApiError('سرویس گیت‌هاب موقتاً در دسترس نیست؛ دوباره تلاش کنید.', { ...base, code: 'server' });
  }
  return new ApiError(apiMessage ? `خطای گیت‌هاب: ${apiMessage}` : `خطای گیت‌هاب (${status}).`, base);
}

/* ── Robust JSON parsing ─────────────────────────────────────────────────── */

function looksLikeBase64(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  return compact.length > 16
    && compact.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

/**
 * Parses JSON that may have been stored as a base64 string (an early version of
 * the setup page did this by mistake). Returns `{ value, repaired }` so callers
 * can warn the owner, or throws when the text is not JSON at all.
 */
export function parseJsonLoose(text) {
  const raw = String(text ?? '').trim();
  try {
    return { value: JSON.parse(raw), repaired: false };
  } catch (err) {
    if (!looksLikeBase64(raw)) throw err;
    return { value: JSON.parse(base64ToUtf8(raw)), repaired: true };
  }
}



/* ── Public reads (no token) ─────────────────────────────────────────────── */

/**
 * Fetches data/store.json with a short timeout and a graceful fallback.
 * Order: raw.githubusercontent (fresh) → relative path (cached by Pages).
 */
export async function fetchStoreData(siteConfig, { timeout = 8000 } = {}) {
  const attempts = [];
  if (siteConfig?.owner && siteConfig?.repo) {
    attempts.push({
      source: 'raw',
      url: rawUrl({ ...siteConfig, path: 'data/store.json' }, { cacheBust: true })
    });
  }
  attempts.push({
    source: 'local',
    url: new URL('store.json', dataBase()).href
  });

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(attempt.url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      clearTimeout(timer);
      if (!res.ok) throw new ApiError(`دریافت لیست ناموفق بود (${res.status}).`, { status: res.status });
      let text = await res.text();
      let repaired = false;
      try { repaired = parseJsonLoose(text).repaired; } catch { repaired = false; }
      if (repaired) text = JSON.stringify(parseJsonLoose(text).value, null, 2);
      return { text, source: attempt.source, url: attempt.url };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new ApiError('دریافت لیست موجودی ناموفق بود.', { code: 'network' });
}

/** Fetches `data/vault.json` (encrypted blob — safe to be public). */
export async function fetchVault(siteConfig, { timeout = 8000 } = {}) {
  const attempts = [];
  if (siteConfig?.owner && siteConfig?.repo) {
    attempts.push(rawUrl({ ...siteConfig, path: 'data/vault.json' }, { cacheBust: true }));
  }
  attempts.push(new URL('vault.json', dataBase()).href);
  for (const url of attempts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
      clearTimeout(timer);
      if (res.status === 404) continue;
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim()) continue;
      const parsed = parseJsonLoose(text);
      return { vault: parsed.value, url, repaired: parsed.repaired };
    } catch { /* try next */ }
  }
  return { vault: null, url: null };
}

/** Fetches data/site.json (public deployment config). */
export async function fetchSiteConfig({ timeout = 6000 } = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(new URL('site.json', dataBase()), {
      signal: controller.signal, cache: 'no-store', credentials: 'omit'
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const { value: data } = parseJsonLoose(await res.text());
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data;
  } catch {
    return null;
  }
}

/* ── Authenticated client ────────────────────────────────────────────────── */

export function createGitHub({ token, owner, repo, branch = 'main', fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch.bind(globalThis);
  const base = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  async function request(path, { method = 'GET', body, timeout = DEFAULT_TIMEOUT, allow404 = false } = {}) {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
      res = await doFetch(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': API_VERSION,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        throw new ApiError('درخواست به گیت‌هاب بیش از حد طول کشید.', { code: 'timeout', url });
      }
      throw new ApiError('اتصال به گیت‌هاب برقرار نشد. اینترنت را بررسی کنید.', { code: 'network', url });
    }
    clearTimeout(timer);
    const data = await readJson(res);
    if (!res.ok) {
      if (allow404 && res.status === 404) return { ok: false, status: 404, data: null };
      throw mapHttpError(res, data, url);
    }
    return { ok: true, status: res.status, data, headers: res.headers };
  }

  return {
    owner,
    repo,
    branch,
    token,

    /** Authenticated user (login + avatar) — used for the admin chip. */
    async getUser() {
      try {
        const { data } = await request(`${API_BASE}/user`);
        return { login: data.login || '', name: data.name || data.login || '', avatarUrl: data.avatar_url || '' };
      } catch {
        return { login: '', name: '', avatarUrl: '' };
      }
    },

    /** Repository metadata + whether this token may write. */
    async getRepo() {
      const { data } = await request('');
      return {
        fullName: data.full_name,
        defaultBranch: data.default_branch,
        private: data.private,
        htmlUrl: data.html_url,
        permissions: data.permissions || {},
        canPush: data.permissions ? !!data.permissions.push : null
      };
    },

    /** Checks that a branch exists (and returns its head). */
    async getBranch(name = branch) {
      const { ok } = await request(`/branches/${encodeURIComponent(name)}`, { allow404: true });
      return { exists: ok };
    },

    /** Reads a file. Returns null when it does not exist. */
    async getFile(path, ref = branch) {
      const { ok, status, data } = await request(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, { allow404: true });
      if (!ok || status === 404) return null;
      const content = Array.isArray(data) ? null : data?.content;
      return {
        path,
        sha: data?.sha || null,
        size: data?.size || 0,
        text: content ? base64ToUtf8(content) : '',
        htmlUrl: data?.html_url || null
      };
    },

    /** Creates or updates a single file (one commit). */
    async putFile({ path, content, message, sha, author }) {
      const body = {
        message,
        content: utf8ToBase64(content),
        branch
      };
      if (sha) body.sha = sha;
      if (author?.name && author?.email) body.author = author;
      const { data } = await request(`/contents/${encodePath(path)}`, { method: 'PUT', body });
      return {
        sha: data?.content?.sha || null,
        commitSha: data?.commit?.sha || null,
        commitUrl: data?.commit?.html_url || null,
        message: data?.commit?.message || message
      };
    },

    /** Atomic multi-file commit via the Git Data API (used by the setup page). */
    async commitFiles(files, message, author) {
      if (!Array.isArray(files) || files.length === 0) throw new ApiError('فایلی برای ثبت وجود ندارد.');
      const ref = await request(`/git/ref/heads/${encodeURIComponent(branch)}`);
      const headSha = ref.data?.object?.sha;
      if (!headSha) throw new ApiError('شاخه هدف پیدا نشد.', { code: 'branch' });
      const commit = await request(`/git/commits/${headSha}`);
      const baseTree = commit.data?.tree?.sha;
      if (!baseTree) throw new ApiError('ساختار شاخه قابل خواندن نیست.', { code: 'tree' });

      const blobs = [];
      for (const file of files) {
        const blob = await request('/git/blobs', {
          method: 'POST',
          // The Git Data API accepts raw UTF-8 here; base64-encoding the
          // payload while declaring `utf-8` stores the base64 text itself.
          body: { content: String(file.content ?? ''), encoding: 'utf-8' }
        });
        blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.data.sha });
      }
      const tree = await request('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: blobs } });
      const newCommit = await request('/git/commits', {
        method: 'POST',
        body: {
          message,
          tree: tree.data.sha,
          parents: [headSha],
          ...(author?.name && author?.email ? { author } : {})
        }
      });
      await request(`/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: 'PATCH',
        body: { sha: newCommit.data.sha, force: false }
      });
      return { commitSha: newCommit.data.sha, commitUrl: newCommit.data.html_url || null };
    },

    /** Convenience used by the security dialog to rotate the vault. */
    async replaceVault(text, message) {
      const existing = await this.getFile('data/vault.json');
      return this.putFile({ path: 'data/vault.json', content: text, message, sha: existing?.sha });
    }
  };
}

function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

/** Returns a compact, local-only "last commit" info for the raw data file. */
export async function fetchLatestCommit({ owner, repo, branch = 'main', path = 'data/store.json', token } = {}) {
  const url = `${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=1`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return null;
    return {
      sha: item.sha,
      message: item.commit?.message || '',
      date: item.commit?.committer?.date || item.commit?.author?.date || '',
      author: item.author?.login || item.commit?.author?.name || '',
      url: item.html_url || ''
    };
  } catch {
    return null;
  }
}
