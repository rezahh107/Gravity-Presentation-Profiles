import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const scope = '[data-gpp-inbox-surface="gravity_flow.inbox"]';
const searchSelector = `${scope} [data-js="gflow-inbox-search"]`;
const clearSelector = `${scope} [data-js="inbox-clear-filters"]`;
const headerSelector = `${scope} .gflow-grid__header`;

if (!artifactDir || !wpCli || !wpPath) throw new Error('WU21 runtime paths are required for PRI-FND-001 verification.');

function loadManifest() {
  const cp = spawnSync(
    'php',
    [wpCli, `--path=${wpPath}`, 'eval', 'echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'],
    { encoding: 'utf8', env: process.env },
  );
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  const manifest = JSON.parse(cp.stdout);
  if (!manifest?.frontend_inbox_url) throw new Error('WU21 frontend Inbox URL missing from fixture manifest.');
  return manifest;
}

function rectObject(rect) {
  return {
    x: rect.x,
    y: rect.y,
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function intersection(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return { width, height, area: width * height };
}

async function keyboardFocus(page, selector, maxTabs = 80) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  for (let tabMoves = 1; tabMoves <= maxTabs; tabMoves += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(target => document.activeElement?.matches?.(target) === true, selector);
    if (focused) return tabMoves;
  }
  throw new Error(`Keyboard Tab did not reach ${selector} within ${maxTabs} moves.`);
}

async function clearState(page) {
  return page.locator(clearSelector).evaluate(element => {
    const style = getComputedStyle(element);
    const grid = element.closest('[data-js="gflow-inbox"]');
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      width: rect.width,
      height: rect.height,
      ariaDisabled: element.getAttribute('aria-disabled'),
      disabled: 'disabled' in element ? Boolean(element.disabled) : false,
      filtersActive: grid?.classList.contains('gflow-inbox--filters-active') ?? false,
    };
  });
}

async function assertInactiveClearFilters(page, phase) {
  const state = await clearState(page);
  if (state.filtersActive || state.display !== 'none' || state.width !== 0 || state.height !== 0) {
    throw new Error(`${phase}: native Clear Filters did not return to the inactive/hidden state: ${JSON.stringify(state)}`);
  }
  return state;
}

async function openAuthenticColumnFilter(page) {
  const headers = page.locator(`${scope} .ag-header-cell`);
  const count = await headers.count();
  const attempts = [];

  for (let index = 0; index < count; index += 1) {
    const header = headers.nth(index);
    const colId = await header.getAttribute('col-id');
    const menu = header.locator('.ag-header-cell-menu-button').first();
    if (await menu.count() !== 1) {
      attempts.push({ colId, result: 'no_menu_button' });
      continue;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await menu.evaluate(element => element.click());
    await page.waitForTimeout(150);

    let input = page.locator('.ag-popup .ag-filter input.ag-filter-filter:visible').first();
    if (await input.count() !== 1) {
      const filterTab = page.locator('.ag-popup .ag-tab[ref="filterMenuTab"]:visible, .ag-popup .ag-tab[aria-label*="filter" i]:visible').first();
      if (await filterTab.count() === 1) {
        await filterTab.click();
        await page.waitForTimeout(100);
      }
      input = page.locator('.ag-popup .ag-filter input.ag-filter-filter:visible, .ag-popup .ag-filter input[type="text"]:visible').first();
    }

    if (await input.count() !== 1) {
      attempts.push({ colId, result: 'no_native_text_filter_input' });
      await page.keyboard.press('Escape').catch(() => {});
      continue;
    }

    await input.fill('WU21 Alpha Student 24');
    try {
      await page.waitForFunction(
        ({ scopeSelector, clearButton }) => {
          const grid = document.querySelector(`${scopeSelector} [data-js="gflow-inbox"]`);
          const clear = document.querySelector(clearButton);
          if (!grid || !clear) return false;
          const style = getComputedStyle(clear);
          const rect = clear.getBoundingClientRect();
          return grid.classList.contains('gflow-inbox--filters-active')
            && style.display !== 'none'
            && rect.width > 0
            && rect.height > 0;
        },
        { scopeSelector: scope, clearButton: clearSelector },
        { timeout: 5000 },
      );
      await page.keyboard.press('Escape').catch(() => {});
      return { colId, attempts };
    } catch (error) {
      attempts.push({ colId, result: 'filter_did_not_activate_clear_filters' });
      await input.fill('');
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  throw new Error(`No authentic native AG Grid text column filter could activate Gravity Flow Clear Filters: ${JSON.stringify(attempts)}`);
}

async function measureFocusedClearance(page, viewport) {
  const search = page.locator(searchSelector);
  const clear = page.locator(clearSelector);
  const header = page.locator(headerSelector);
  const activeClear = await clearState(page);
  if (!activeClear.filtersActive || activeClear.display === 'none' || activeClear.width <= 0 || activeClear.height <= 0 || activeClear.disabled || activeClear.ariaDisabled === 'true') {
    throw new Error(`${viewport}px: native Clear Filters is not visibly active and enabled: ${JSON.stringify(activeClear)}`);
  }

  const tabMoves = await keyboardFocus(page, searchSelector);
  const measurement = await page.evaluate(({ searchTarget, clearTarget, headerTarget }) => {
    const searchElement = document.querySelector(searchTarget);
    const clearElement = document.querySelector(clearTarget);
    const headerElement = document.querySelector(headerTarget);
    if (!searchElement || !clearElement || !headerElement) throw new Error('Required Inbox geometry node missing.');

    const searchStyle = getComputedStyle(searchElement);
    const clearStyle = getComputedStyle(clearElement);
    const headerStyle = getComputedStyle(headerElement);
    const rootStyle = getComputedStyle(document.documentElement);
    const searchRect = searchElement.getBoundingClientRect();
    const clearRect = clearElement.getBoundingClientRect();
    const headerRect = headerElement.getBoundingClientRect();
    const outlineWidth = Number.parseFloat(searchStyle.outlineWidth) || 0;
    const outlineOffset = Number.parseFloat(searchStyle.outlineOffset) || 0;
    const extent = outlineWidth + outlineOffset;

    return {
      focusVisible: searchElement.matches(':focus-visible'),
      rootFontSize: rootStyle.fontSize,
      gap: headerStyle.gap,
      columnGap: headerStyle.columnGap,
      rowGap: headerStyle.rowGap,
      outline: {
        style: searchStyle.outlineStyle,
        width: searchStyle.outlineWidth,
        offset: searchStyle.outlineOffset,
        color: searchStyle.outlineColor,
        extent,
      },
      search: {
        rect: {
          x: searchRect.x, y: searchRect.y, left: searchRect.left, top: searchRect.top,
          right: searchRect.right, bottom: searchRect.bottom, width: searchRect.width, height: searchRect.height,
        },
        overflow: searchStyle.overflow,
        overflowX: searchStyle.overflowX,
        overflowY: searchStyle.overflowY,
        position: searchStyle.position,
        zIndex: searchStyle.zIndex,
      },
      clearFilters: {
        rect: {
          x: clearRect.x, y: clearRect.y, left: clearRect.left, top: clearRect.top,
          right: clearRect.right, bottom: clearRect.bottom, width: clearRect.width, height: clearRect.height,
        },
        overflow: clearStyle.overflow,
        position: clearStyle.position,
        zIndex: clearStyle.zIndex,
      },
      header: {
        rect: {
          x: headerRect.x, y: headerRect.y, left: headerRect.left, top: headerRect.top,
          right: headerRect.right, bottom: headerRect.bottom, width: headerRect.width, height: headerRect.height,
        },
        overflow: headerStyle.overflow,
        overflowX: headerStyle.overflowX,
        overflowY: headerStyle.overflowY,
        position: headerStyle.position,
        zIndex: headerStyle.zIndex,
      },
    };
  }, { searchTarget: searchSelector, clearTarget: clearSelector, headerTarget: headerSelector });

  if (!measurement.focusVisible) throw new Error(`${viewport}px: keyboard-focused search does not match :focus-visible.`);
  if (measurement.outline.style === 'none' || Number.parseFloat(measurement.outline.width) !== 3 || Number.parseFloat(measurement.outline.offset) !== 3) {
    throw new Error(`${viewport}px: approved 3px + 3px search focus geometry changed: ${JSON.stringify(measurement.outline)}`);
  }

  const extent = measurement.outline.extent;
  const focusOuterRect = {
    left: measurement.search.rect.left - extent,
    top: measurement.search.rect.top - extent,
    right: measurement.search.rect.right + extent,
    bottom: measurement.search.rect.bottom + extent,
    width: measurement.search.rect.width + (extent * 2),
    height: measurement.search.rect.height + (extent * 2),
  };
  const overlap = intersection(focusOuterRect, measurement.clearFilters.rect);
  if (overlap.area !== 0) {
    throw new Error(`${viewport}px: search focus-indicator intersects native Clear Filters: ${JSON.stringify({ focusOuterRect, clearFilters: measurement.clearFilters.rect, overlap })}`);
  }

  const screenshot = path.join(artifactDir, `pri-fnd-001-${viewport}-active-filter-focus.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  return { tabMoves, activeClear, ...measurement, focusOuterRect, intersection: overlap, screenshot: path.basename(screenshot) };
}

const manifest = loadManifest();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 1000 } });
const page = await context.newPage();
const results = [];

try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  for (const viewport of [390, 394]) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
    await page.waitForSelector(`${scope} [data-js="gflow-inbox"] .ag-root-wrapper`, { timeout: 30000 });

    const initialInactive = await assertInactiveClearFilters(page, `${viewport}px initial state`);
    const positiveControlMoves = await keyboardFocus(page, searchSelector);
    const positiveControl = await page.locator(searchSelector).evaluate(element => {
      const style = getComputedStyle(element);
      return {
        focusVisible: element.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
      };
    });
    if (!positiveControl.focusVisible || Number.parseFloat(positiveControl.outlineWidth) !== 3 || Number.parseFloat(positiveControl.outlineOffset) !== 3) {
      throw new Error(`${viewport}px: unfiltered keyboard-focus positive control failed: ${JSON.stringify(positiveControl)}`);
    }

    const nativeFilter = await openAuthenticColumnFilter(page);
    const active = await measureFocusedClearance(page, viewport);

    await page.locator(clearSelector).click();
    await page.waitForFunction(
      ({ scopeSelector, clearButton }) => {
        const grid = document.querySelector(`${scopeSelector} [data-js="gflow-inbox"]`);
        const clear = document.querySelector(clearButton);
        if (!grid || !clear) return false;
        const style = getComputedStyle(clear);
        const rect = clear.getBoundingClientRect();
        return !grid.classList.contains('gflow-inbox--filters-active') && style.display === 'none' && rect.width === 0 && rect.height === 0;
      },
      { scopeSelector: scope, clearButton: clearSelector },
      { timeout: 10000 },
    );
    const resetInactive = await assertInactiveClearFilters(page, `${viewport}px reset state`);

    results.push({
      viewport,
      initialInactive,
      positiveControl: { tabMoves: positiveControlMoves, ...positiveControl },
      nativeFilter,
      active,
      resetInactive,
    });
  }
} finally {
  await browser.close();
}

const evidence = {
  finding: 'PRI-FND-001',
  status: 'PASS',
  method: 'authentic Gravity Flow Inbox + native AG Grid column filter UI + keyboard :focus-visible',
  results,
};
fs.writeFileSync(path.join(artifactDir, 'pri-fnd-001-focus-clearance.json'), JSON.stringify(evidence, null, 2) + '\n');
for (const result of results) {
  process.stdout.write(`PASS PRI-FND-001 ${result.viewport}px intersection_area=${result.active.intersection.area} gap=${result.active.columnGap} outline=${result.active.outline.width}+${result.active.outline.offset}\n`);
}
