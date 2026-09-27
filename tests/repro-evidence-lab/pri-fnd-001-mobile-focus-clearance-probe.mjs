import fs from 'node:fs';
import path from 'node:path';

const scope = '[data-gpp-inbox-surface="gravity_flow.inbox"]';

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return { width, height, area: width * height };
}

async function utilityState(page, dataJs) {
  const locator = page.locator(`${scope} [data-js="${dataJs}"]`);
  if (await locator.count() !== 1) throw new Error(`Authentic native utility is missing: ${dataJs}`);
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      visibility: style.visibility,
      width: rect.width,
      height: rect.height,
      tabIndex: element.tabIndex,
      focused: document.activeElement === element,
    };
  });
}

async function assertUnadmittedUtilitiesHidden(page, width) {
  const states = {
    clearFilters: await utilityState(page, 'inbox-clear-filters'),
    fullscreen: await utilityState(page, 'inbox-fullscreeen'),
  };
  for (const [name, state] of Object.entries(states)) {
    if (state.display !== 'none' || state.visibility === 'hidden' && state.width > 0 || state.width > 0 || state.height > 0 || state.focused) {
      throw new Error(`Unadmitted ${name} utility is exposed at ${width}px: ${JSON.stringify(state)}`);
    }
  }
  return states;
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

async function captureGeometry(page) {
  return page.evaluate(scopeSelector => {
    const search = document.querySelector(`${scopeSelector} [data-js="gflow-inbox-search"]`);
    const refresh = document.querySelector(`${scopeSelector} [data-gpp-inbox-manual-refresh]`);
    const settings = document.querySelector(`${scopeSelector} [data-js="inbox-settings"]`);
    const toolbar = document.querySelector(`${scopeSelector} [data-gpp-inbox-toolbar]`);
    if (!search || !refresh || !settings || !toolbar) throw new Error('Required admitted Inbox toolbar controls are missing.');

    const rect = element => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left, top: value.top, right: value.right, bottom: value.bottom,
        width: value.width, height: value.height, x: value.x, y: value.y,
      };
    };
    const searchRect = rect(search);
    const refreshRect = rect(refresh);
    const settingsRect = rect(settings);
    const toolbarRect = rect(toolbar);
    const searchStyle = getComputedStyle(search);
    const refreshStyle = getComputedStyle(refresh);
    const settingsStyle = getComputedStyle(settings);
    const toolbarStyle = getComputedStyle(toolbar);
    const rootStyle = getComputedStyle(document.documentElement);
    const outlineWidth = parseFloat(searchStyle.outlineWidth) || 0;
    const outlineOffset = parseFloat(searchStyle.outlineOffset) || 0;
    const extent = outlineWidth + outlineOffset;
    const outerRect = {
      left: searchRect.left - extent,
      top: searchRect.top - extent,
      right: searchRect.right + extent,
      bottom: searchRect.bottom + extent,
      width: searchRect.width + (extent * 2),
      height: searchRect.height + (extent * 2),
    };

    const clippingAncestors = [];
    let clippingFailure = null;
    for (let parent = search.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const parentRect = rect(parent);
      const clipsX = /hidden|clip|auto|scroll/.test(style.overflowX);
      const clipsY = /hidden|clip|auto|scroll/.test(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const clip = {
        left: parentRect.left + parent.clientLeft,
        right: parentRect.left + parent.clientLeft + parent.clientWidth,
        top: parentRect.top + parent.clientTop,
        bottom: parentRect.top + parent.clientTop + parent.clientHeight,
      };
      const clipped = (clipsX && (outerRect.left < clip.left - 1 || outerRect.right > clip.right + 1))
        || (clipsY && (outerRect.top < clip.top - 1 || outerRect.bottom > clip.bottom + 1));
      clippingAncestors.push({
        node: typeof parent.className === 'string' ? parent.className : parent.tagName,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clip,
        clipped,
      });
      if (clipped && !clippingFailure) clippingFailure = clippingAncestors[clippingAncestors.length - 1];
    }

    return {
      focusVisible: search.matches(':focus-visible'),
      rootFontSize: rootStyle.fontSize,
      search: searchRect,
      refresh: refreshRect,
      settings: settingsRect,
      toolbar: toolbarRect,
      focusIndicator: {
        outlineStyle: searchStyle.outlineStyle,
        outlineWidth,
        outlineOffset,
        extent,
        outerRect,
      },
      clippingAncestors,
      clippingFailure,
      computed: {
        toolbarGap: toolbarStyle.gap,
        toolbarRowGap: toolbarStyle.rowGap,
        toolbarOverflow: toolbarStyle.overflow,
        searchOverflow: searchStyle.overflow,
        searchClipPath: searchStyle.clipPath,
        refreshDisplay: refreshStyle.display,
        settingsDisplay: settingsStyle.display,
      },
    };
  }, scope);
}

export async function runPriFnd001MobileFocusClearance(page, inboxUrl, artifactDir) {
  const browser = page.context().browser();
  if (!browser) throw new Error('PRI-FND-001 probe requires a browser-backed authenticated context.');

  const probeContext = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 900 },
  });
  page = await probeContext.newPage();
  const results = [];

  try {
    for (const width of [390, 394]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector(`${scope} [data-js="gflow-inbox"] .ag-root-wrapper`, { timeout: 30000 });
      await page.locator(`${scope} [data-gpp-inbox-toolbar]`).scrollIntoViewIfNeeded();

      const hiddenUtilities = await assertUnadmittedUtilitiesHidden(page, width);
      const tabMoves = await keyboardFocusSearch(page);
      const geometry = await captureGeometry(page);
      if (!geometry.focusVisible) throw new Error(`Search is not keyboard :focus-visible at ${width}px.`);
      if (geometry.focusIndicator.outlineWidth !== 3 || geometry.focusIndicator.outlineOffset !== 3 || geometry.focusIndicator.extent !== 6) {
        throw new Error(`Approved 3px + 3px focus geometry changed at ${width}px: ${JSON.stringify(geometry.focusIndicator)}`);
      }
      if (geometry.clippingFailure) {
        throw new Error(`Search focus indicator is clipped at ${width}px: ${JSON.stringify(geometry.clippingFailure)}`);
      }

      const refreshIntersection = intersectionArea(geometry.focusIndicator.outerRect, geometry.refresh);
      const settingsIntersection = intersectionArea(geometry.focusIndicator.outerRect, geometry.settings);
      if (refreshIntersection.area !== 0 || settingsIntersection.area !== 0) {
        throw new Error(`PRI-FND-001 collision with admitted toolbar controls at ${width}px: ${JSON.stringify({ refreshIntersection, settingsIntersection, geometry })}`);
      }
      if (geometry.refresh.width < 40 || geometry.refresh.height < 40 || geometry.settings.width < 40 || geometry.settings.height < 40) {
        throw new Error(`Admitted mobile toolbar target is below 40px at ${width}px: ${JSON.stringify({ refresh: geometry.refresh, settings: geometry.settings })}`);
      }

      const screenshot = path.join(artifactDir, `pr4-pri-fnd-001-mobile-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });

      results.push({
        viewport: { width, height: 900 },
        status: 'PASS',
        tabMoves,
        hiddenUtilities,
        geometry,
        intersections: { refresh: refreshIntersection, settings: settingsIntersection },
        screenshot: path.basename(screenshot),
      });
    }

    const evidencePath = path.join(artifactDir, 'wu17-pri-fnd-001-mobile-focus-clearance.json');
    fs.writeFileSync(evidencePath, JSON.stringify({ finding: 'PRI-FND-001', runtime: 'authentic WU21 Inbox', contract: 'approved Search + Manual Refresh + Notification Settings toolbar; Clear Filters and Fullscreen absent', results }, null, 2) + '\n');
    for (const result of results) {
      process.stdout.write(`PASS PRI-FND-001 viewport=${result.viewport.width} refresh_intersection=${result.intersections.refresh.area} settings_intersection=${result.intersections.settings.area}\n`);
    }
    return { evidencePath, results };
  } finally {
    await probeContext.close();
  }
}
