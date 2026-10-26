/* ==========================================================================
   Vault — the token ↔ password bridge
   --------------------------------------------------------------------------
   The GitHub token is never stored in plain text. The setup page (or the
   `tools/make-vault.mjs` CLI) derives a key from the admin password with
   PBKDF2-SHA256 and encrypts the token with AES-256-GCM. Only the ciphertext
   is committed to the repository (data/vault.json). Entering the password in
   the browser decrypts it locally and produces the token for the API calls.
   ========================================================================== */

const KDF_ITERATIONS = 300_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const VAULT_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class CryptoError extends Error {
  constructor(message, code = 'crypto') {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

export function cryptoAvailable() {
  return !!(globalThis.crypto && globalThis.crypto.subtle);
}

export function randomBytes(length) {
  if (!cryptoAvailable()) throw new CryptoError('مرورگر شما از Web Crypto پشتیبانی نمی‌کند.');
  return crypto.getRandomValues(new Uint8Array(length));
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(str) {
  const binary = atob(String(str || '').replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(password, saltBytes, iterations) {
  if (!cryptoAvailable()) throw new CryptoError('رمزنگاری در این مرورگر در دسترس نیست (HTTPS لازم است).');
  const baseKey = await crypto.subtle.importKey(
    'raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts { token, login } with the admin password.
 * The returned object is safe to publish — it only contains ciphertext.
 */
export async function sealVault({ password, token, login = '', repo = {}, hint = '', iterations = KDF_ITERATIONS }) {
  if (!password || String(password).length < 8) {
    throw new CryptoError('رمز عبور باید حداقل ۸ کاراکتر باشد.', 'weak-password');
  }
  if (!token) throw new CryptoError('توکن گیت‌هاب را وارد کنید.', 'missing-token');
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(password, salt, iterations);
  const payload = JSON.stringify({ token, login });
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(payload));
  return {
    v: VAULT_VERSION,
    alg: 'AES-256-GCM',
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bytesToBase64(salt)
    },
    repo: {
      owner: String(repo.owner || '').trim(),
      repo: String(repo.repo || '').trim(),
      branch: String(repo.branch || 'main').trim() || 'main'
    },
    hint: String(hint || '').slice(0, 80),
    cipher: {
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(cipher))
    },
    createdAt: new Date().toISOString()
  };
}

/** Decrypts the vault. Throws CryptoError('bad-password') when the key is wrong. */
export async function openVault(vault, password) {
  if (!isVault(vault)) throw new CryptoError('فایل تنظیمات امنیتی معتبر نیست.', 'bad-vault');
  const iterations = Number(vault.kdf?.iterations) || KDF_ITERATIONS;
  if (iterations < 10_000) throw new CryptoError('تنظیمات رمزنگاری معتبر نیست.', 'bad-vault');
  const salt = base64ToBytes(vault.kdf.salt);
  const iv = base64ToBytes(vault.cipher.iv);
  const data = base64ToBytes(vault.cipher.data);
  let key;
  try {
    key = await deriveKey(password, salt, iterations);
  } catch (err) {
    throw new CryptoError(err.message || 'خطا در آماده‌سازی رمزنگاری.', 'crypto');
  }
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const parsed = JSON.parse(decoder.decode(plain));
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) {
      throw new CryptoError('محتوای رمزگشایی‌شده معتبر نیست.', 'bad-vault');
    }
    return { token: parsed.token, login: parsed.login || '' };
  } catch (err) {
    if (err instanceof CryptoError) throw err;
    throw new CryptoError('رمز عبور نادرست است.', 'bad-password');
  }
}

export function isVault(obj) {
  return !!obj
    && typeof obj === 'object'
    && obj.v === VAULT_VERSION
    && obj.kdf?.name === 'PBKDF2'
    && typeof obj.kdf.salt === 'string'
    && typeof obj.cipher?.iv === 'string'
    && typeof obj.cipher?.data === 'string';
}

/** Rough, local-only password strength (0..4). */
export function passwordScore(pw) {
  const s = String(pw || '');
  if (!s) return 0;
  let score = 0;
  if (s.length >= 8) score += 1;
  if (s.length >= 12) score += 1;
  if (s.length >= 16) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(s)).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  if (isCommonPassword(s)) score = Math.min(score, 1);
  return Math.min(4, score);
}

const COMMON = new Set([
  'password', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'admin123', 'iloveyou', '11111111', '00000000', 'password1', 'abc12345',
  '12341234', 'mahdi123', 'ali12345', 'iran1234', 'shop1234', 'store123'
]);

export function isCommonPassword(pw) {
  const s = toLowerAscii(pw);
  return COMMON.has(s) || /^(.)\1{7,}$/.test(s) || /^(\d{4,})$/.test(s);
}

function toLowerAscii(s) {
  return String(s ?? '').toLowerCase();
}

/** Cryptographically strong token for future features (not the admin password). */
export function randomId(length = 12) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
