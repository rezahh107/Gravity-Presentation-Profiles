import fs from 'node:fs';
import path from 'node:path';

const scope = '[data-gpp-inbox-surface="gravity_flow.inbox"]';

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return { width, height, area: width * height };
}

async function clearFiltersState(page) {
  return page.locator(`${scope} [data-js="inbox-clear-filters"]`).evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const grid = element.closest('[data-js="gflow-inbox"]');
    return {
      filtersActive: grid?.classList.contains('gflow-inbox--filters-active') ?? false,
      display: style.display,
      visibility: style.visibility,
      width: rect.width,
      height: rect.height,
      disabled: Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true',
    };
  });
}

async function keyboardFocusSearch(page) {
  const search = page.locator(`${scope} [data-js="gflow-inbox-search"]`);
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await search.evaluate(element => document.activeElement === element)) {
      if (!await search.evaluate(element => element.matches(':focus-visible'))) {
        throw new Error('Search received keyboard focus but :focus-visible is false.');
      }
      return attempt + 1;
    }
  }
  throw new Error('Keyboard Tab traversal did not reach the native Inbox search control.');
}

async function activateRealNativeColumnFilter(page) {
  const header = page.locator(`${scope} .ag-header-cell[col-id="gpp_case_card"]`);
  if (await header.count() !== 1 || !await header.isVisible()) {
    throw new Error('Authentic visible AG Grid presentation-column header is unavailable.');
  }

  await header.hover();
  const menuButton = header.locator('.ag-header-cell-menu-button');
  if (await menuButton.count() !== 1) throw new Error('Native AG Grid column-menu button is unavailable.');
  await menuButton.click();

  const menu = page.locator('.ag-menu:visible').last();
  await menu.waitFor({ state: 'visible', timeout: 5000 });

  let input = menu.locator('input:not([type="checkbox"]):not([type="radio"]):visible').first();
  if (await input.count() === 0) {
    const tabs = menu.locator('.ag-tab');
    for (let index = 0; index < await tabs.count(); index += 1) {
      const tab = tabs.nth(index);
      if (await tab.locator('.ag-icon-filter').count() === 1) {
        await tab.click();
        break;
      }
    }
    input = menu.locator('input:not([type="checkbox"]):not([type="radio"]):visible').first();
  }
  if (await input.count() !== 1) throw new Error('Native AG Grid column menu exposed no usable filter input.');

  const firstName = (await page.locator(`${scope} .gpp-inbox-card__name`).first().innerText()).trim();
  const token = firstName.split(/\s+/).find(part => part.length >= 4) || firstName;
  await input.fill(token);
  await page.waitForFunction(scopeSelector => {
    const grid = document.querySelector(`${scopeSelector} [data-js="gflow-inbox"]`);
    const clear = document.querySelector(`${scopeSelector} [data-js="inbox-clear-filters"]`);
    return grid && clear && grid.classList.contains('gflow-inbox--filters-active') && getComputedStyle(clear).display !== 'none';
  }, scope, { timeout: 15000 });

  const state = await clearFiltersState(page);
  if (!state.filtersActive || state.display === 'none' || state.visibility === 'hidden' || state.width <= 0 || state.height <= 0 || state.disabled) {
    throw new Error(`Native Clear Filters is not visible/enabled after real column filtering: ${JSON.stringify(state)}`);
  }
  await page.keyboard.press('Escape');
  return { column: 'gpp_case_card', token, clearFilters: state };
}

async function captureGeometry(page) {
  return page.evaluate(scopeSelector => {
    const search = document.querySelector(`${scopeSelector} [data-js="gflow-inbox-search"]`);
    const clear = document.querySelector(`${scopeSelector} [data-js="inbox-clear-filters"]`);
    const header = document.querySelector(`${scopeSelector} .gflow-grid__header`);
    if (!search || !clear || !header) throw new Error('Required Inbox controls/header are missing.');

    const rect = element => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left, top: value.top, right: value.right, bottom: value.bottom,
        width: value.width, height: value.height, x: value.x, y: value.y,
      };
    };
    const searchRect = rect(search);
    const clearRect = rect(clear);
    const headerRect = rect(header);
    const searchStyle = getComputedStyle(search);
    const clearStyle = getComputedStyle(clear);
    const headerStyle = getComputedStyle(header);
    const outlineWidth = parseFloat(searchStyle.outlineWidth) || 0;
    const outlineOffset = parseFloat(searchStyle.outlineOffset) || 0;
    const extent = outlineWidth + outlineOffset;

    return {
      focusVisible: search.matches(':focus-visible'),
      search: searchRect,
      clearFilters: clearRect,
      header: headerRect,
      focusIndicator: {
        outlineStyle: searchStyle.outlineStyle,
        outlineWidth,
        outlineOffset,
        extent,
        outerRect: {
          left: searchRect.left - extent,
          top: searchRect.top - extent,
          right: searchRect.right + extent,
          bottom: searchRect.bottom + extent,
          width: searchRect.width + (extent * 2),
          height: searchRect.height + (extent * 2),
        },
      },
      computed: {
        gap: headerStyle.gap,
        columnGap: headerStyle.columnGap,
        headerOverflow: headerStyle.overflow,
        headerOverflowX: headerStyle.overflowX,
        headerOverflowY: headerStyle.overflowY,
        headerPosition: headerStyle.position,
        headerZIndex: headerStyle.zIndex,
        searchOverflow: searchStyle.overflow,
        searchClipPath: searchStyle.clipPath,
        searchPosition: searchStyle.position,
        searchZIndex: searchStyle.zIndex,
        clearOverflow: clearStyle.overflow,
        clearPosition: clearStyle.position,
        clearZIndex: clearStyle.zIndex,
        clearDisplay: clearStyle.display,
        clearVisibility: clearStyle.visibility,
      },
    };
  }, scope);
}

export async function runPriFnd001MobileFocusClearance(page, inboxUrl, artifactDir) {
  const results = [];

  for (const width of [390, 394]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector(`${scope} [data-js="gflow-inbox"] .ag-root-wrapper`, { timeout: 30000 });
    await page.locator(`${scope} .gflow-grid__header`).scrollIntoViewIfNeeded();

    const inactiveBefore = await clearFiltersState(page);
    if (inactiveBefore.filtersActive || inactiveBefore.display !== 'none') {
      throw new Error(`Expected Clear Filters inactive/hidden at ${width}px: ${JSON.stringify(inactiveBefore)}`);
    }

    const positiveTabMoves = await keyboardFocusSearch(page);
    const positiveGeometry = await captureGeometry(page);
    if (!positiveGeometry.focusVisible) throw new Error(`Unfiltered search is not :focus-visible at ${width}px.`);
    if (positiveGeometry.focusIndicator.outlineWidth !== 3 || positiveGeometry.focusIndicator.outlineOffset !== 3) {
      throw new Error(`Approved 3px + 3px focus geometry changed at ${width}px.`);
    }

    const activation = await activateRealNativeColumnFilter(page);
    const activeTabMoves = await keyboardFocusSearch(page);
    const geometry = await captureGeometry(page);
    if (!geometry.focusVisible) throw new Error(`Filtered search is not keyboard :focus-visible at ${width}px.`);
    if (geometry.focusIndicator.outlineWidth !== 3 || geometry.focusIndicator.outlineOffset !== 3 || geometry.focusIndicator.extent !== 6) {
      throw new Error(`Approved focus extent changed at ${width}px: ${JSON.stringify(geometry.focusIndicator)}`);
    }

    const intersection = intersectionArea(geometry.focusIndicator.outerRect, geometry.clearFilters);
    if (intersection.area !== 0) {
      throw new Error(`PRI-FND-001 collision remains at ${width}px: ${JSON.stringify({ intersection, geometry })}`);
    }

    const screenshot = path.join(artifactDir, `pri-fnd-001-mobile-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });

    await page.locator(`${scope} [data-js="inbox-clear-filters"]`).click();
    await page.waitForFunction(scopeSelector => {
      const grid = document.querySelector(`${scopeSelector} [data-js="gflow-inbox"]`);
      const clear = document.querySelector(`${scopeSelector} [data-js="inbox-clear-filters"]`);
      return grid && clear && !grid.classList.contains('gflow-inbox--filters-active') && getComputedStyle(clear).display === 'none';
    }, scope, { timeout: 15000 });
    const inactiveAfter = await clearFiltersState(page);

    results.push({
      viewport: { width, height: 900 }, status: 'PASS',
      positiveControl: { tabMoves: positiveTabMoves, clearFilters: inactiveBefore, geometry: positiveGeometry },
      activeFilter: { activation, tabMoves: activeTabMoves, geometry, intersection },
      reset: inactiveAfter,
      screenshot,
    });
  }

  const evidencePath = path.join(artifactDir, 'pri-fnd-001-mobile-focus-clearance.json');
  fs.writeFileSync(evidencePath, JSON.stringify({ finding: 'PRI-FND-001', runtime: 'authentic WU21 Inbox', results }, null, 2) + '\n');
  for (const result of results) {
    process.stdout.write(`PASS PRI-FND-001 viewport=${result.viewport.width} intersection_area=${result.activeFilter.intersection.area}\n`);
  }
  return { evidencePath, results };
}
