import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';

// WU21-only: a WordPress HTML fallback must not count as a built Hello asset.
const requiredAssets = [
  ['assets/js/hello-frontend.js', 'javascript'],
  ['assets/js/hello-editor.js', 'javascript'],
  ['assets/css/reset.css', 'css'],
  ['assets/css/theme.css', 'css'],
  ['assets/css/header-footer.css', 'css'],
  ['assets/css/editor-styles.css', 'css'],
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const [mode, root, base] = process.argv.slice(2);
const artifactDir = process.env.WU21_ARTIFACT_DIR;
function output(filename, value) {
  assert.ok(artifactDir, 'WU21_ARTIFACT_DIR is missing');
  fs.writeFileSync(path.join(artifactDir, filename), JSON.stringify(value, null, 2) + '\n');
}
function verifyFiles(themePath) {
  assert.ok(themePath && fs.statSync(themePath).isDirectory(), 'HELLO_BUILD_INFRASTRUCTURE_FAILURE: built theme missing');
  const details = {};
  for (const [name, kind] of requiredAssets) {
    const full = path.join(themePath, name);
    assert.ok(fs.existsSync(full) && fs.statSync(full).isFile(), 'HELLO_BUILD_MISSING_REQUIRED_ASSET: ' + name);
    const bytes = fs.readFileSync(full);
    assert.ok(bytes.length > 64, 'HELLO_BUILD_EMPTY_REQUIRED_ASSET: ' + name);
    const value = bytes.toString('utf8').trimStart();
    assert.ok(!/^<(?:!doctype|html|head|body|\?php)/i.test(value), 'HELLO_BUILD_HTML_INSTEAD_OF_ASSET: ' + name);
    if (kind === 'javascript') new Script(value, { filename: name });
    else assert.ok(/\{[^}]*:[^}]*\}/s.test(value), 'HELLO_BUILD_INVALID_STYLESHEET: ' + name);
    details[name] = { bytes: bytes.length, sha256: sha256(bytes), kind };
  }
  return details;
}
async function verifyHttp(urlBase, files) {
  assert.ok(urlBase, 'HELLO_BUILD_INFRASTRUCTURE_FAILURE: missing WordPress base URL');
  const result = {};
  for (const [name, kind] of requiredAssets) {
    const url = new URL('/wp-content/themes/hello-elementor/' + name, urlBase);
    const response = await fetch(url, { redirect: 'manual' });
    const type = (response.headers.get('content-type') || '').toLowerCase();
    assert.equal(response.status, 200, 'HELLO_ASSET_HTTP_STATUS_INVALID: ' + name);
    assert.ok(kind === 'css' ? /^text\/css(?:;|$)/.test(type)
      : /^(?:text|application)\/(?:javascript|ecmascript|x-javascript)(?:;|$)/.test(type),
      'HELLO_ASSET_HTTP_MIME_INVALID: ' + name + ' (' + type + ')');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(!/^<(?:!doctype|html|head|body|\?php)/i.test(bytes.toString('utf8').trimStart().slice(0, 200)),
      'HELLO_ASSET_HTTP_HTML_FALLBACK: ' + name);
    assert.equal(sha256(bytes), files[name].sha256, 'HELLO_ASSET_HTTP_BYTES_DIFFER_FROM_BUILD: ' + name);
    if (kind === 'javascript') new Script(bytes.toString('utf8'), { filename: name });
    result[name] = { status: response.status, content_type: type, bytes: bytes.length, sha256: sha256(bytes) };
  }
  return result;
}
async function verifyBrowser(urlBase) {
  assert.ok(urlBase && artifactDir, 'HELLO_BROWSER_INFRASTRUCTURE_FAILURE: missing URL/artifact directory');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const seen = [], errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(String(error).slice(0, 400)));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/wp-content/themes/hello-elementor/assets/')) {
        seen.push({ path: url.pathname.replace('/wp-content/themes/hello-elementor/', ''),
          status: response.status(), type: response.headers()['content-type'] || '' });
      }
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
    const inboxUrl = manifest.frontend_inbox_url;
    assert.ok(inboxUrl && new URL(inboxUrl).origin === new URL(urlBase).origin,
      'HELLO_BROWSER_INFRASTRUCTURE_FAILURE: synthetic Inbox origin differs');
    const response = await page.goto(inboxUrl, { waitUntil: 'networkidle', timeout: 45000 });
    assert.equal(response?.status(), 200, 'HELLO_BROWSER_INBOX_HTTP_FAILED');
    assert.ok(await page.locator('body').evaluate(body => body.classList.contains('hello-elementor')),
      'HELLO_BROWSER_THEME_NOT_ACTIVE');
    for (const name of ['assets/js/hello-frontend.js', 'assets/css/reset.css', 'assets/css/theme.css']) {
      const match = seen.find(item => item.path === name);
      assert.ok(match, 'HELLO_BROWSER_REQUIRED_ASSET_NOT_REQUESTED: ' + name);
      assert.equal(match.status, 200, 'HELLO_BROWSER_ASSET_HTTP_FAILED: ' + name);
      assert.ok(name.endsWith('.css') ? /^text\/css/i.test(match.type) : /javascript|ecmascript/i.test(match.type),
        'HELLO_BROWSER_ASSET_MIME_FAILED: ' + name);
    }
    assert.deepEqual(errors, [], 'HELLO_BROWSER_UNCAUGHT_PAGEERROR: ' + JSON.stringify(errors));
    return { route: new URL(inboxUrl).pathname, theme_body_class: true, assets: seen,
      uncaught_pageerrors: errors };
  } finally { await browser.close(); }
}
async function main() {
  if (mode === 'negative') {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wu21-hello-negative-'));
    try {
      for (const [name] of requiredAssets.filter(([n]) => n !== 'assets/js/hello-frontend.js')) {
        fs.mkdirSync(path.dirname(path.join(temp, name)), { recursive: true });
        fs.copyFileSync(path.join(root, name), path.join(temp, name));
      }
      assert.throws(() => verifyFiles(temp), /HELLO_BUILD_MISSING_REQUIRED_ASSET: assets\/js\/hello-frontend\.js/,
        'WU21 missing-script negative control failed to reject the actual defect');
      output('hello-build-negative-control.json', { status: 'PASS', mutation: 'omit hello-frontend.js',
        same_validator_rejected: true, native_and_production_state_unmodified: true });
      console.log('HELLO_BUILD_MISSING_ASSET_FALSIFICATION_PASS');
      return;
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  const files = verifyFiles(root);
  if (mode === 'files') {
    const source = process.env.WU21_HELLO_SOURCE_PATH;
    assert.ok(source, 'HELLO_BUILD_INFRASTRUCTURE_FAILURE: no pinned source');
    const lockfiles = Object.fromEntries(['package.json', 'package-lock.json', 'composer.json', 'composer.lock']
      .map(name => [name, sha256(fs.readFileSync(path.join(source, name)))]));
    const zip = path.join(source, 'hello-elementor.' + process.env.WU21_HELLO_VERSION + '.zip');
    assert.ok(fs.existsSync(zip), 'HELLO_BUILD_INFRASTRUCTURE_FAILURE: upstream distribution missing');
    output('hello-build-provenance.json', { status: 'PASS', source_commit: process.env.WU21_HELLO_COMMIT,
      source_archive_sha256: process.env.WU21_HELLO_SHA256, build: 'npm ci --no-audit --no-fund && npm run package:zip',
      package_zip_sha256: sha256(fs.readFileSync(zip)), lockfiles, assets: files,
      node: process.version, composer: '2.8.12' });
    console.log('HELLO_BUILT_ASSETS_PASS ' + JSON.stringify({ required_assets: Object.keys(files).length }));
  } else if (mode === 'http') {
    const http = await verifyHttp(base, files);
    output('hello-build-http.json', { status: 'PASS', assets: http });
    console.log('HELLO_HTTP_ASSETS_PASS ' + JSON.stringify({ assets: Object.keys(http).length }));
  } else if (mode === 'browser') {
    const evidence = await verifyBrowser(base);
    output('hello-build-browser.json', { status: 'PASS', ...evidence });
    console.log('HELLO_BROWSER_RUNTIME_ASSETS_PASS');
  } else throw Error('Usage: node hello-theme-runtime-gate.mjs <files|http|negative|browser> <built-theme-root> [base URL]');
}
await main();
