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

async function focusBackwardFromSearch(page, targetSelector, maxTabs = 12) {
  const search = page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox-search"]');
  await search.focus();

  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    await page.keyboard.press('Shift+Tab');
    const active = await page.evaluate(selector => document.activeElement?.matches?.(selector) === true, targetSelector);
    if (active) return attempt + 1;
  }

  throw new Error(`Keyboard Shift+Tab did not reach ${targetSelector} from the native search control.`);
}

async function focusPresentationCellByKeyboard(page) {
  const scope = '[data-gpp-inbox-surface="gravity_flow.inbox"]';
  const search = page.locator(`${scope} [data-js="gflow-inbox-search"]`);
  await search.focus();

  let headerFocus = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const active = document.activeElement;
      const header = active instanceof Element ? active.closest('.ag-header-cell') : null;
      if (!header) return null;
      return {
        colId: header.getAttribute('col-id'),
        activeTag: active.tagName,
        activeClass: active.className,
      };
    });
    if (focused?.colId === 'gpp_case_card') {
      headerFocus = { ...focused, tabMoves: attempt + 1 };
      break;
    }
  }

  if (!headerFocus) throw new Error('Native AG Grid presentation header was not reached through its keyboard tab guard.');

  await page.keyboard.press('ArrowDown');
  const cellFocus = await page.evaluate(() => {
    const active = document.activeElement;
    const cell = active instanceof Element ? active.closest('.ag-cell[col-id="gpp_case_card"]') : null;
    if (!cell) return null;
    return {
      colId: cell.getAttribute('col-id'),
      rowIndex: cell.closest('.ag-row')?.getAttribute('row-index') ?? null,
      activeTag: active.tagName,
      activeClass: active.className,
      nativeFocusedClass: cell.classList.contains('ag-cell-focus'),
    };
  });

  if (!cellFocus?.nativeFocusedClass) throw new Error(`ArrowDown did not move native AG Grid focus into the presentation cell: ${JSON.stringify(cellFocus)}`);
  return { header: headerFocus, cell: cellFocus };
}

const manifest = loadManifest();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });

try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', ['wu21', 'bootstrap', 'pass', '2026'].join('-'));
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

  await test('WU17-A11Y-003', 'active native host icon controls have visible keyboard focus and inactive Clear Filters stays host-hidden', async () => {
    const observations = {};
    const clearFilters = page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="inbox-clear-filters"]');
    const clearState = await clearFilters.evaluate(element => {
      const style = getComputedStyle(element);
      const grid = element.closest('[data-js="gflow-inbox"]');
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        width: rect.width,
        height: rect.height,
        filtersActive: grid?.classList.contains('gflow-inbox--filters-active') ?? false,
      };
    });
    if (!clearState.filtersActive && clearState.display !== 'none') {
      throw new Error(`Native Clear Filters should stay hidden until a column filter is active: ${JSON.stringify(clearState)}`);
    }
    observations['inbox-clear-filters'] = {
      state: clearState.filtersActive ? 'native_filters_active' : 'native_inactive_hidden',
      ...clearState,
    };

    for (const dataJs of ['inbox-fullscreeen', 'inbox-settings']) {
      const selector = `[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="${dataJs}"]`;
      const control = page.locator(selector);
      const tabMoves = await focusBackwardFromSearch(page, selector);
      const style = await focusStyle(control);
      const box = await targetBox(control);
      const hasStrongOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
      const hasTwoPixelRingShadow = typeof style.boxShadow === 'string' && /0px 0px 0px 2px/.test(style.boxShadow);
      if (!hasStrongOutline && !hasTwoPixelRingShadow) throw new Error(`${dataJs} focus is not visibly strong after keyboard navigation: ${JSON.stringify(style)}`);
      if (box.width < 40 || box.height < 40) throw new Error(`${dataJs} target below 40px baseline: ${JSON.stringify(box)}`);
      observations[dataJs] = {
        focus: style,
        visible_indicator: hasStrongOutline ? 'outline_2px_or_more' : 'box_shadow_ring_2px',
        target: box,
        shift_tab_moves_from_search: tabMoves,
      };
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

  await test('WU17-A11Y-005', 'native AG Grid entry cell is keyboard reachable and Enter preserves host navigation', async () => {
    const keyboardFocus = await focusPresentationCellByKeyboard(page);
    const focusedCell = page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"] .ag-cell[col-id="gpp_case_card"].ag-cell-focus').first();
    if (await focusedCell.count() !== 1) throw new Error('Keyboard focus did not produce the native AG Grid focused-cell state.');

    const state = await focusedCell.evaluate(cell => {
      const card = cell.querySelector('.gpp-inbox-card');
      const link = cell.querySelector('.gflow-inbox__entry-cell-link');
      if (!card || !link) return null;
      const cardStyle = getComputedStyle(card);
      return {
        href: link.getAttribute('href'),
        linkTabIndex: link.getAttribute('tabindex'),
        cardFocus: {
          boxShadow: cardStyle.boxShadow,
          borderColor: cardStyle.borderColor,
        },
      };
    });
    if (!state) throw new Error('Focused native presentation cell is missing its card or host entry link.');
    if (!state.href) throw new Error('Native entry href is missing.');
    if (state.linkTabIndex !== '-1') throw new Error(`Pinned host entry overlay is expected outside the tab order, found tabindex=${state.linkTabIndex}.`);
    if (!state.cardFocus.boxShadow || state.cardFocus.boxShadow === 'none') throw new Error(`Focused AG Grid entry cell has no visible card focus treatment: ${JSON.stringify(state.cardFocus)}`);

    const expected = new URL(state.href, page.url()).href;
    await Promise.all([
      page.waitForURL(url => url.href === expected, { timeout: 30000 }),
      page.keyboard.press('Enter'),
    ]);
    return { href: state.href, link_tabindex: state.linkTabIndex, focus: state.cardFocus, keyboard_focus: keyboardFocus, navigated_with_enter: true };
  });
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(artifactDir, 'wu17-accessibility-browser-results.json'), JSON.stringify({ suite: 'WU17 Inbox accessibility/keyboard control', results }, null, 2) + '\n');
for (const result of results) process.stdout.write(`${result.status} ${result.id} ${result.name}\n`);
if (results.some(result => result.status !== 'PASS')) process.exit(1);
