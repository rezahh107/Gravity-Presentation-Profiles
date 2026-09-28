import fs from 'node:fs';
import path from 'node:path';

function bounded(value, max = 4000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function visibleFocus(style) {
  const outlineVisible = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth || '0') >= 2;
  const shadowVisible = typeof style.boxShadow === 'string' && style.boxShadow !== 'none';
  return outlineVisible || shadowVisible;
}

async function focusStyle(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      active: element === document.activeElement || element.contains(document.activeElement),
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  });
}

async function accessibleNameSource(locator) {
  return locator.evaluate(element => {
    const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const ariaLabel = normalize(element.getAttribute('aria-label'));
    if (ariaLabel) return { source: 'aria-label', value: ariaLabel };

    const labelledBy = normalize(element.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const value = labelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .map(node => normalize(node.textContent))
        .filter(Boolean)
        .join(' ');
      if (value) return { source: 'aria-labelledby', value };
    }

    const title = normalize(element.getAttribute('title'));
    if (title) return { source: 'title', value: title };

    const text = normalize(element.textContent);
    if (text) return { source: 'text-content', value: text };

    return null;
  });
}

async function focusBackwardFromSearch(page, targetSelector, maxTabs = 16) {
  const search = page.locator('[data-js="gflow-inbox-search"]');
  if (await search.count() !== 1) throw new Error('Native Search must exist exactly once before toolbar keyboard traversal.');
  await search.focus();

  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    await page.keyboard.press('Shift+Tab');
    const reached = await page.evaluate(selector => {
      const active = document.activeElement;
      return active instanceof Element && (active.matches(selector) || Boolean(active.closest(selector)));
    }, targetSelector);
    if (reached) return attempt + 1;
  }

  throw new Error(`Keyboard Shift+Tab did not reach ${targetSelector} from native Search.`);
}

async function focusedNativeCellState(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const cell = active instanceof Element ? active.closest('[data-js="gflow-inbox"] .ag-cell') : null;
    if (!cell) return null;
    const link = cell.querySelector('.gflow-inbox__entry-cell-link');
    return {
      colId: cell.getAttribute('col-id'),
      rowIndex: cell.closest('.ag-row')?.getAttribute('row-index') ?? null,
      nativeFocusedClass: cell.classList.contains('ag-cell-focus'),
      href: link?.getAttribute('href') ?? null,
      activeTag: active.tagName,
      activeClass: active.className,
    };
  });
}

async function focusNativeEntryCellByKeyboard(page) {
  const search = page.locator('[data-js="gflow-inbox-search"]');
  await search.focus();

  let reachedGrid = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press('Tab');
    reachedGrid = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof Element)) return null;
      const header = active.closest('[data-js="gflow-inbox"] .ag-header-cell');
      const cell = active.closest('[data-js="gflow-inbox"] .ag-cell');
      if (header) return { kind: 'header', colId: header.getAttribute('col-id'), tabMoves: 0 };
      if (cell) return { kind: 'cell', colId: cell.getAttribute('col-id'), tabMoves: 0 };
      return null;
    });
    if (reachedGrid) {
      reachedGrid.tabMoves = attempt + 1;
      break;
    }
  }
  if (!reachedGrid) throw new Error('Keyboard Tab traversal did not reach the native AG Grid focus model.');
  if (reachedGrid.colId === 'gpp_case_card') throw new Error('Retired gpp_case_card reappeared in native keyboard navigation.');

  if (reachedGrid.kind === 'header') {
    await page.keyboard.press('ArrowDown');
  }

  const visibleColumnCount = await page.locator('[data-js="gflow-inbox"] .ag-header-cell').count();
  for (let attempt = 0; attempt <= visibleColumnCount + 2; attempt += 1) {
    const state = await focusedNativeCellState(page);
    if (state?.colId === 'gpp_case_card') throw new Error('Retired gpp_case_card received native Grid focus.');
    if (state?.nativeFocusedClass && state.href) {
      return { ...state, initialGridFocus: reachedGrid, horizontalMoves: attempt };
    }
    await page.keyboard.press('ArrowRight');
  }

  throw new Error('Native AG Grid keyboard navigation did not reach an authentic entry-link cell.');
}

/**
 * Bounded Native-First accessibility regression coverage retained from the old
 * WU17 era without restoring Card Mode assumptions or a parallel browser/login
 * harness. browser-tests-core.mjs supplies the authenticated pinned-runtime page.
 */
export async function runWu17BrowserTests({ page, inboxUrl, artifactDir }) {
  const results = [];
  const test = async (id, name, fn) => {
    try {
      results.push({ id, name, status: 'PASS', details: await fn() });
    } catch (error) {
      results.push({ id, name, status: 'FAIL', details: { error: bounded(error?.stack || error) } });
    }
  };

  await test('WU21-NATIVE-A11Y-001', 'native Search remains singular, keyboard-usable and visibly focused', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
    const search = page.locator('[data-js="gflow-inbox-search"]');
    if (await search.count() !== 1) throw new Error(`Expected one native Search, got ${await search.count()}.`);

    await search.fill('');
    await search.focus();
    await page.keyboard.type('WU21 Alpha Form');
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row')];
      return rows.length > 0 && rows.length < 20 && rows.every(row => row.textContent.includes('WU21 Alpha Form'));
    }, null, { timeout: 15000 });

    const focus = await focusStyle(search);
    if (!focus.active || !visibleFocus(focus)) throw new Error(`Native Search keyboard focus is not visibly indicated: ${JSON.stringify(focus)}`);

    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20, null, { timeout: 15000 });
    return { count: 1, keyboard_query: 'WU21 Alpha Form', focus };
  });

  await test('WU21-NATIVE-A11Y-002', 'native Settings and Fullscreen remain singular, named, keyboard reachable and visibly focused', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });

    const observations = {};
    for (const dataJs of ['inbox-fullscreeen', 'inbox-settings']) {
      const selector = `[data-js="${dataJs}"]`;
      const control = page.locator(selector);
      const count = await control.count();
      if (count !== 1) throw new Error(`Expected one native ${dataJs} control, got ${count}.`);
      if (!(await control.isVisible())) throw new Error(`Native ${dataJs} control is not visible in the authentic host state.`);

      const name = await accessibleNameSource(control);
      if (!name?.value) throw new Error(`Native ${dataJs} has no real accessible-name source.`);

      const keyboardMoves = await focusBackwardFromSearch(page, selector);
      const focus = await focusStyle(control);
      if (!focus.active || !visibleFocus(focus)) throw new Error(`Native ${dataJs} keyboard focus is not visibly indicated: ${JSON.stringify(focus)}`);
      observations[dataJs] = { count, name, keyboard_moves_from_search: keyboardMoves, focus };
    }

    return observations;
  });

  await test('WU21-NATIVE-A11Y-003', 'native Clear Filters state is observed without GPP visibility or ownership changes', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });

    const clear = page.locator('[data-js="inbox-clear-filters"]');
    const count = await clear.count();
    if (count > 1) throw new Error(`Native Clear Filters control was duplicated: ${count}.`);
    if (count === 0) return { count: 0, host_state: 'not_exposed' };

    return clear.evaluate(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const grid = element.closest('[data-js="gflow-inbox"]');
      return {
        count: 1,
        host_state: 'exposed',
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
        display: style.display,
        visibility: style.visibility,
        width: rect.width,
        height: rect.height,
        filters_active: grid?.classList.contains('gflow-inbox--filters-active') ?? null,
      };
    });
  });

  await test('WU21-NATIVE-A11Y-004', 'native AG Grid keyboard navigation reaches an authentic entry cell and Enter preserves Entry Detail navigation', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout: 30000 });

    const state = await focusNativeEntryCellByKeyboard(page);
    if (!state.href || !state.href.includes('admin.php?page=gravityflow-inbox&view=entry') || !state.href.includes('&id=') || !state.href.includes('&lid=')) {
      throw new Error(`Unexpected native Entry Detail href from keyboard-focused cell: ${state.href}`);
    }

    const expected = new URL(state.href, page.url()).href;
    await Promise.all([
      page.waitForURL(url => url.href === expected, { timeout: 30000 }),
      page.keyboard.press('Enter'),
    ]);
    return { ...state, navigated_with_enter: true };
  });

  if (artifactDir) {
    fs.writeFileSync(
      path.join(artifactDir, 'native-accessibility-results.json'),
      JSON.stringify({ suite: 'WU21 Native-First Inbox accessibility/keyboard', results }, null, 2) + '\n',
    );
  }

  for (const result of results) process.stdout.write(`${result.status} ${result.id} ${result.name}\n`);
  return results;
}
