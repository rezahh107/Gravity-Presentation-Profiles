import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const results = [];

function bounded(value, max = 4000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function loadManifest() {
  const cp = spawnSync(
    'php',
    [wpCli, `--path=${wpPath}`, 'eval', 'echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'],
    { encoding: 'utf8', env: process.env },
  );
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  const manifest = JSON.parse(cp.stdout);
  if (!manifest?.frontend_inbox_url) throw new Error('WU17 frontend Inbox URL missing from fixture manifest.');
  return manifest;
}

async function test(id, name, fn) {
  try {
    results.push({ id, name, status: 'PASS', details: await fn() });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', details: { error: bounded(error?.stack || error) } });
  }
}

function focusStyle(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  });
}

function targetBox(locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

const manifest = loadManifest();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });

try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });

  await test('WU17-A11Y-001', 'semantic RTL surface and authentic controls expose usable accessible names', async () => {
    const surface = page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    const title = surface.locator('h1.gpp-inbox-surface__title');
    if (await title.count() !== 1 || (await title.innerText()).trim() !== 'کارهای من') throw new Error('Semantic Inbox H1 is missing.');
    if (await surface.getAttribute('dir') !== 'rtl') throw new Error('Inbox surface is not explicitly RTL.');

    const search = surface.locator('[data-js="gflow-inbox-search"]');
    const searchPlaceholder = await search.getAttribute('placeholder');
    const searchAria = await search.getAttribute('aria-label');
    const searchTitle = await search.getAttribute('title');
    if (![searchAria, searchTitle, searchPlaceholder].some(value => typeof value === 'string' && value.trim() !== '')) {
      throw new Error('Native search has no accessible-name source (aria-label/title/placeholder).');
    }

    const controls = {};
    for (const dataJs of ['inbox-clear-filters', 'inbox-fullscreeen', 'inbox-settings']) {
      const control = surface.locator(`[data-js="${dataJs}"]`);
      if (await control.count() !== 1) throw new Error(`Native host control missing: ${dataJs}`);
      const label = (await control.getAttribute('aria-label')) || (await control.getAttribute('title')) || (await control.innerText()).trim();
      if (!label) throw new Error(`Native host control has no accessible-name source: ${dataJs}`);
      controls[dataJs] = label;
    }

    return { search_name_source: searchAria ? 'aria-label' : (searchTitle ? 'title' : 'placeholder'), controls };
  });

  await test('WU17-A11Y-002', 'search keyboard input and focus indicator remain native and visible', async () => {
    const search = page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox-search"]');
    await search.focus();
    await page.keyboard.type('00:24:00');
    await page.waitForFunction(() => document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"] .ag-center-cols-container > .ag-row').length === 1, null, { timeout: 15000 });
    const style = await focusStyle(search);
    const box = await targetBox(search);
    if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) < 2) throw new Error(`Search focus indicator is not visibly strong: ${JSON.stringify(style)}`);
    if (box.height < 40) throw new Error(`Search target is below 40px baseline: ${JSON.stringify(box)}`);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"] .ag-center-cols-container > .ag-row').length === 20, null, { timeout: 15000 });
    return { focus: style, target: box, filtered_rows: 1, restored_rows: 20 };
  });

  await test('WU17-A11Y-003', 'native host icon controls have visible keyboard focus and modern target sizing', async () => {
    const observations = {};
    for (const dataJs of ['inbox-clear-filters', 'inbox-fullscreeen', 'inbox-settings']) {
      const control = page.locator(`[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="${dataJs}"]`);
      await control.focus();
      const style = await focusStyle(control);
      const box = await targetBox(control);
      if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) < 2) throw new Error(`${dataJs} focus is not visible: ${JSON.stringify(style)}`);
      if (box.width < 40 || box.height < 40) throw new Error(`${dataJs} target below 40px baseline: ${JSON.stringify(box)}`);
      observations[dataJs] = { focus: style, target: box };
    }
    return observations;
  });

  await test('WU17-A11Y-004', 'native pagination operates from keyboard and remains synchronized', async () => {
    const scope = '[data-gpp-inbox-surface="gravity_flow.inbox"]';
    const previous = page.locator(`${scope} [ref="btPrevious"]`);
    const next = page.locator(`${scope} [ref="btNext"]`);
    const current = page.locator(`${scope} [ref="lbCurrent"]`);
    if ((await current.innerText()).trim() !== '1') throw new Error('Pagination did not start on page 1.');

    await next.focus();
    const nextFocus = await focusStyle(next);
    const nextBox = await targetBox(next);
    if (nextFocus.outlineStyle === 'none' || parseFloat(nextFocus.outlineWidth) < 2) throw new Error(`Next focus is not visible: ${JSON.stringify(nextFocus)}`);
    if (nextBox.width < 40 || nextBox.height < 40) throw new Error(`Next target below 40px baseline: ${JSON.stringify(nextBox)}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"] .ag-center-cols-container > .ag-row').length === 5, null, { timeout: 15000 });
    if ((await current.innerText()).trim() !== '2') throw new Error('Keyboard Next did not advance native AG Grid page state.');

    await previous.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"] .ag-center-cols-container > .ag-row').length === 20, null, { timeout: 15000 });
    if ((await current.innerText()).trim() !== '1') throw new Error('Keyboard Previous did not restore native AG Grid page state.');
    return { next_focus: nextFocus, next_target: nextBox, sequence: ['1', '2', '1'] };
  });

  await test('WU17-A11Y-005', 'native entry action is keyboard reachable and Enter preserves host navigation', async () => {
    const link = page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"] .ag-cell[col-id="gpp_case_card"] .gflow-inbox__entry-cell-link').first();
    await link.focus();
    const href = await link.getAttribute('href');
    const cardFocus = await link.locator('.gpp-inbox-card').evaluate(element => ({ boxShadow: getComputedStyle(element).boxShadow, borderColor: getComputedStyle(element).borderColor }));
    if (!href || !href.includes('page=gravityflow-inbox') || !href.includes('view=entry')) throw new Error(`Unexpected native entry href: ${href}`);
    if (!cardFocus.boxShadow || cardFocus.boxShadow === 'none') throw new Error(`Focused entry card has no visible focus treatment: ${JSON.stringify(cardFocus)}`);
    await Promise.all([
      page.waitForURL(/page=gravityflow-inbox.*view=entry/, { timeout: 30000 }),
      page.keyboard.press('Enter'),
    ]);
    return { href, focus: cardFocus, navigated_with_enter: true };
  });
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(artifactDir, 'wu17-accessibility-browser-results.json'), JSON.stringify({ suite: 'WU17 Inbox accessibility/keyboard control', results }, null, 2) + '\n');
for (const result of results) process.stdout.write(`${result.status} ${result.id} ${result.name}\n`);
if (results.some(result => result.status !== 'PASS')) process.exit(1);
