#!/usr/bin/env node
/**
 * tools/make-vault.mjs
 * ---------------------------------------------------------------------------
 * Creates data/vault.json entirely from the command line — the token never
 * passes through a browser. Same format as the /setup/ page:
 *   PBKDF2-SHA256 (600k iterations) → AES-256-GCM.
 *
 * Usage:
 *   node tools/make-vault.mjs --owner USER --repo Online_list --branch main
 *   node tools/make-vault.mjs --token github_pat_xxx --password '…' --owner …
 *
 * Everything can also come from environment variables:
 *   GH_TOKEN, OL_PASSWORD, OL_OWNER, OL_REPO, OL_BRANCH, OL_HINT
 * ---------------------------------------------------------------------------
 */

import { webcrypto as crypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout, argv, exit, env } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'vault.json');
const ITERATIONS = 600_000;

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'help' || key === 'h') { out.help = true; continue; }
    const next = args[i + 1];
    if (!next || next.startsWith('--')) { out[key] = true; continue; }
    out[key] = next;
    i += 1;
  }
  return out;
}

function usage() {
  stdout.write(`
  ساخت فایل امنیتی Online List
  ────────────────────────────
  node tools/make-vault.mjs [options]

  توکن:
    --token <token>      توکن گیت‌هاب (یا محیط GH_TOKEN)
  رمز:
    --password <pass>    رمز مدیریت (یا محیط OL_PASSWORD) — حداقل ۱۰ کاراکتر
  مخزن:
    --owner <name>       مالک مخزن (یا OL_OWNER)
    --repo <name>        نام مخزن (یا OL_REPO)
    --branch <name>      شاخه، پیش‌فرض main
  دیگر:
    --hint <text>        یادآور رمز که روی سایت دیده می‌شود
    --login <name>       نام نمایشی مدیر
    --force              بازنویسی بدون پرسش
    --offline            بدون بررسی آنلاین توکن (برای شبکه محدود)
    --dry-run            فایل را ذخیره نکن، فقط صحت را بررسی کن
    --help               همین راهنما

  نکته: اگر مقادیری داده نشوند، تعاملی پرسیده می‌شوند.
`);
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function seal({ token, password, login, owner, repo, branch, hint }) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify({ token, login }))
  );
  return {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
    repo: { owner, repo, branch },
    hint: hint || '',
    cipher: { iv: b64(iv), data: b64(new Uint8Array(cipher)) },
    createdAt: new Date().toISOString()
  };
}

async function unseal(vault, password) {
  const salt = Buffer.from(vault.kdf.salt, 'base64');
  const iv = Buffer.from(vault.cipher.iv, 'base64');
  const key = await deriveKey(password, salt, vault.kdf.iterations);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    Buffer.from(vault.cipher.data, 'base64')
  );
  return JSON.parse(Buffer.from(plain).toString('utf8'));
}

async function validateToken({ token, owner, repo }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'online-list-setup'
  };
  try {
    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) {
      return { ok: false, message: `توکن معتبر نیست (HTTP ${userRes.status}).` };
    }
    const user = await userRes.json();
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      return { ok: false, message: `مخزن ${owner}/${repo} در دسترس نیست (HTTP ${repoRes.status}).`, login: user.login };
    }
    const info = await repoRes.json();
    if (info.permissions && info.permissions.push === false) {
      return { ok: false, message: 'توکن فقط دسترسی خواندن دارد؛ Contents را Read and write کنید.', login: user.login };
    }
    return { ok: true, login: user.login, private: !!info.private, fullName: info.full_name };
  } catch (err) {
    return { ok: false, message: `اتصال به گیت‌هاب ناموفق بود: ${err.message}` };
  }
}

// Same implementation the web UI uses — no duplicated heuristics.
import { isCommonPassword, passwordEntropyBits, estimateCrackSeconds } from '../assets/js/crypto.js';

function strengthIssue(password) {
  if (!password || password.length < 10) return 'رمز باید حداقل ۱۰ کاراکتر باشد.';
  if (isCommonPassword(password)) return 'این رمز در فهرست رمزهای رایج است؛ عبارت دیگری انتخاب کنید.';
  const seconds = estimateCrackSeconds(password);
  if (seconds < 7 * 86_400) {
    const human = seconds >= 86_400
      ? `${Math.round(seconds / 86_400)} روز`
      : `${Math.max(1, Math.round(seconds / 3600))} ساعت`;
    return `رمز در برابر حملهٔ آفلاین فقط حدود ${human} دوام می‌آورد؛ چهار کلمهٔ بی‌ربط بگذارید.`;
  }
  return null;
}

async function main() {
  const args = parseArgs(argv.slice(2));
  if (args.help) { usage(); return; }

  const interactive = stdin.isTTY && !env.CI;
  const rl = interactive ? readline.createInterface({ input: stdin, output: stdout }) : null;
  const ask = async (question, { secret = false } = {}) => {
    if (!rl) return '';
    if (!secret) return (await rl.question(question)).trim();
    // Minimal hidden input using raw mode.
    stdout.write(question);
    return new Promise((resolve) => {
      let value = '';
      const onData = (chunk) => {
        const str = chunk.toString();
        for (const ch of str) {
          if (ch === '\u0003') { stdin.write; exit(130); }
          if (ch === '\r' || ch === '\n') {
            stdin.removeListener('data', onData);
            stdin.setRawMode(false);
            stdout.write('\n');
            resolve(value);
            return;
          }
          if (ch === '\u007f' || ch === '\b') {
            value = value.slice(0, -1);
          } else {
            value += ch;
          }
        }
      };
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', onData);
    });
  };

  try {
    let token = args.token || env.GH_TOKEN || '';
    if (!token && rl) token = await ask('توکن گیت‌هاب: ', { secret: true });
    if (!token) { console.error('✖ توکن داده نشد.'); exit(1); }

    let password = args.password || env.OL_PASSWORD || '';
    if (!password && rl) password = await ask('رمز مدیریت (حداقل ۱۰ کاراکتر): ', { secret: true });
    if (!password) { console.error('✖ رمز داده نشد.'); exit(1); }
    const issue = strengthIssue(password);
    if (issue) { console.error(`✖ ${issue}`); exit(1); }
    if (rl) {
      const again = await ask('تکرار رمز: ', { secret: true });
      if (again !== password) { console.error('✖ تکرار رمز مطابقت ندارد.'); exit(1); }
    }

    const owner = args.owner || env.OL_OWNER || (rl ? await ask('مالک مخزن: ') : '');
    const repo = args.repo || env.OL_REPO || (rl ? await ask('نام مخزن: ') : '');
    const branch = args.branch || env.OL_BRANCH || 'main';
    const hint = args.hint || env.OL_HINT || (rl ? await ask('یادآور رمز (اختیاری): ') : '');
    if (!owner || !repo) { console.error('✖ مالک و نام مخزن لازم است.'); exit(1); }

    let check = { ok: true, login: args.login || '' };
    if (args.offline) {
      stdout.write('\n… بررسی آنلاین رد شد (--offline)\n');
    } else {
      stdout.write('\n… بررسی توکن و دسترسی مخزن\n');
      check = await validateToken({ token, owner, repo });
      if (!check.ok) {
        console.error(`✖ ${check.message}`);
        console.error('  اگر شبکه محدود است، با --offline دوباره اجرا کنید (توکن بدون تست ذخیره می‌شود).');
        exit(1);
      }
      stdout.write(`✔ توکن معتبر است (حساب ${check.login})\n`);
      stdout.write(`✔ دسترسی نوشتن به ${check.fullName} تأیید شد\n`);
    }

    const vault = await seal({
      token,
      password,
      login: args.login || check.login || '',
      owner,
      repo,
      branch,
      hint
    });

    // Round-trip check: make sure the file can be opened with this password.
    const reopened = await unseal(vault, password);
    if (reopened.token !== token) { console.error('✖ بررسی رمزگشایی ناموفق بود.'); exit(1); }

    const json = `${JSON.stringify(vault, null, 2)}\n`;
    if (args['dry-run']) {
      stdout.write('\n— dry run —\n');
      stdout.write(json.slice(0, 260));
      stdout.write('\n…\n✔ فایل امنیتی معتبر است (ذخیره نشد).\n');
      return;
    }

    if (fs.existsSync(OUT) && !args.force) {
      const answer = rl ? await ask('\ndata/vault.json از قبل وجود دارد. بازنویسی شود؟ (y/N) ') : 'n';
      if (!/^y(es)?$/i.test(answer.trim())) { console.error('✖ لغو شد.'); return; }
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, json, { mode: 0o600 });
    stdout.write(`\n✔ ${path.relative(ROOT, OUT)} ساخته شد.\n`);
    stdout.write('  این فایل فقط شامل داده رمزگذاری‌شده است و می‌تواند کامیت شود.\n');
    stdout.write('  گام بعدی:\n');
    stdout.write('    git add data/vault.json && git commit -m "راه‌اندازی امنیتی Online List" && git push\n');

    const sitePath = path.join(ROOT, 'data', 'site.json');
    if (!fs.existsSync(sitePath)) {
      fs.writeFileSync(sitePath, `${JSON.stringify({
        owner,
        repo,
        branch,
        pageUrl: `https://${owner}.github.io/${repo}/`,
        dataPath: 'data/store.json',
        vaultPath: 'data/vault.json'
      }, null, 2)}\n`);
      stdout.write('✔ data/site.json هم ساخته شد.\n');
    }
  } finally {
    rl?.close();
  }
}

// Only run when executed directly, so tools/test.mjs can import the helpers.
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`✖ ${err.message}`);
    exit(1);
  });
}
