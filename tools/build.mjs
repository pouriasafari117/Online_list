#!/usr/bin/env node
/** Build the production storefront without changing the editable source files.
 * Versioned module paths make the service worker's cache-first responses safe:
 * an older HTML document uses the old graph, new HTML uses a new graph.
 */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ASSET_VERSION = 'v24';
const modules = ['gradient-loader', 'app', 'api', 'crypto', 'icons', 'model', 'state', 'render', 'ui', 'util', 'admin', 'manage'];
const styles = ['tokens', 'base', 'app', 'glass', 'cohesion', 'day-night-toggle'];

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = {};
const record = async (file) => {
  const relative = path.relative(root, file).split(path.sep).join('/');
  files[relative] = hash(await fs.readFile(file));
};

await build({
  entryPoints: [path.join(root, 'assets/js/hero-gradient.jsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: path.join(root, 'assets/js/hero-gradient.js'),
  logLevel: 'info'
});
await record(path.join(root, 'assets/js/hero-gradient.jsx'));
await record(path.join(root, 'assets/js/fera-gradient-engine.jsx'));
await record(path.join(root, 'assets/js/hero-gradient.js'));
await fs.mkdir(path.join(root, 'assets/js', `fast-${ASSET_VERSION}`), { recursive: true });
const heroPath = path.join(root, 'assets/js', `fast-${ASSET_VERSION}`, 'hero-gradient.js');
await fs.copyFile(path.join(root, 'assets/js/hero-gradient.js'), heroPath);
await record(heroPath);

const jsDestination = path.join(root, 'assets/js', `fast-${ASSET_VERSION}`);
for (const name of modules) {
  const input = path.join(root, 'assets/js', `${name}.js`);
  const result = await transform(await fs.readFile(input, 'utf8'), {
    loader: 'js', format: 'esm', minify: true, charset: 'utf8', target: 'es2020'
  });
  const built = path.join(jsDestination, `${name}.js`);
  await fs.writeFile(built, result.code);
  await record(input);
  await record(built);
}

// One blocking stylesheet instead of six separate CSS requests. The
// source order (and thus all cascade and animation rules) stays unchanged.
const cssDestination = path.join(root, 'assets/css', `fast-${ASSET_VERSION}`);
await fs.mkdir(cssDestination, { recursive: true });
const css = [];
for (const name of styles) {
  const input = path.join(root, 'assets/css', `${name}.css`);
  const result = await transform(await fs.readFile(input, 'utf8'), {
    loader: 'css', minify: true, charset: 'utf8', target: 'chrome100'
  });
  css.push(result.code.replaceAll('../fonts/', '../../fonts/'));
  await record(input);
}
const stylesheet = path.join(cssDestination, 'site.css');
await fs.writeFile(stylesheet, css.join('\n'));
await record(stylesheet);
await record(path.join(root, 'tools/build.mjs'));
await fs.writeFile(path.join(root, 'tools/fast-manifest.json'), JSON.stringify({ version: ASSET_VERSION, files }, null, 2) + '\n');
console.log(`Production modules/styles: fast-${ASSET_VERSION}`);
