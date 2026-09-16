import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const centerRowsSelector = '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row';
const cardSelector = `${centerRowsSelector} .gpp-inbox-card`;
const readySelector = `${centerRowsSelector} .gpp-inbox-card__readiness--ready`;
const unreadySelector = `${centerRowsSelector} .gpp-inbox-card__readiness--unready`;
const manualRefreshSelector = '[data-gpp-inbox-manual-refresh]';

function bounded(value, max = 5000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function runRuntimeAssertions() {
  const wpCli = process.env.WU21_WP_CLI;
  const wpPath = process.env.WU21_WP_PATH;
  const repoRoot = process.env.GITHUB_WORKSPACE;
  const script = path.join(repoRoot, 'tests/repro-evidence-lab/wu17-runtime-tests.php');
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', script], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) {
    throw new Error(`PR4 runtime assertions failed:\n${cp.stdout}\n${cp.stderr}`);
  }
  process.stdout.write(cp.stdout);
}

async function waitForInbox(page, expectedRows = null) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(selector => document.querySelectorAll(selector).length > 0, centerRowsSelector, { timeout: 30000 });
  if (expectedRows !== null) {
    await page.waitForFunction(
      ({ selector, count }) => document.querySelectorAll(selector).length === count,
      { selector: centerRowsSelector, count: expectedRows },
      { timeout: 30000 },
    );
  }
}

async function projectionState(page) {
  return page.evaluate(({ rowsSelector, cardsSelector, ready, unready }) => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const rows = [...document.querySelectorAll(rowsSelector)];
    const cards = [...document.querySelectorAll(cardsSelector)];
    const nativeCells = rows.flatMap(row => [...row.querySelectorAll('.ag-cell:not([col-id="gpp_case_card"])')]);
    const cardCells = rows.map(row => row.querySelector('.ag-cell[col-id="gpp_case_card"]')).filter(Boolean);
    return {
      selector_has_supported: CSS.supports('selector(:has(*))'),
      rows: rows.length,
      ready_markers: document.querySelectorAll(ready).length,
      unready_markers: document.querySelectorAll(unready).length,
      cards: cards.length,
      visible_cards: cards.filter(visible).length,
      visible_native_cells: nativeCells.filter(visible).length,
      visible_card_cells: cardCells.filter(visible).length,
    };
  }, { rowsSelector: centerRowsSelector, cardsSelector: cardSelector, ready: readySelector, unready: unreadySelector });
}

async function measureWidths(page, label) {
  return page.evaluate(({ rowsSelector, labelText }) => {
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    };
    const firstRow = document.querySelector(rowsSelector);
    const cell = firstRow?.querySelector('.ag-cell[col-id="gpp_case_card"]');
    const card = firstRow?.querySelector('.gpp-inbox-card');
    const cellRect = cell?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    return {
      label: labelText,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      html_font_size: getComputedStyle(document.documentElement).fontSize,
      body_classes: document.body.className,
      admin_menu_folded: document.body.classList.contains('folded'),
      native_inbox: rect('[data-js="gflow-inbox"]'),
      grid_root: rect('[data-js="gflow-inbox"] .ag-root-wrapper'),
      center_viewport: rect('[data-js="gflow-inbox"] .ag-center-cols-viewport'),
      card_cell: cellRect ? { x: cellRect.x, y: cellRect.y, width: cellRect.width, height: cellRect.height, scrollWidth: cell.scrollWidth, clientWidth: cell.clientWidth } : null,
      card: cardRect ? { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth, scrollHeight: card.scrollHeight, clientHeight: card.clientHeight } : null,
    };
  }, { rowsSelector: centerRowsSelector, labelText: label });
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').evaluate(element => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  if (overflow.scrollWidth > overflow.clientWidth + 2) {
    throw new Error(`${label}: horizontal overflow ${JSON.stringify(overflow)}`);
  }
  return overflow;
}

async function cardBoxes(page, count = 4) {
  const cards = page.locator(cardSelector);
  const boxes = [];
  for (let i = 0; i < Math.min(count, await cards.count()); i += 1) {
    const box = await cards.nth(i).boundingBox();
    if (!box) throw new Error(`Card ${i} has no bounding box.`);
    boxes.push(box);
  }
  return boxes;
}

async function findRenderedUnreadyPage(page) {
  await waitForInbox(page);
  if (await page.locator(unreadySelector).count() > 0) return 'current';
  const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
  if (await next.count() === 1) {
    const disabled = await next.evaluate(el => el.classList.contains('ag-disabled') || el.getAttribute('aria-disabled') === 'true');
    if (!disabled) {
      await next.click();
      await page.waitForTimeout(600);
      if (await page.locator(unreadySelector).count() > 0) return 'next';
    }
  }
  throw new Error('Authentic unbound task was not present in either rendered native Inbox page.');
}

export async function runWu17BrowserTests({ page, inboxUrl, wpControl, artifactDir }) {
  const results = [];
  const sizing = [];
  const record = (id, name, status, details = null) => results.push({ id, name, status, details });
  const test = async (id, name, fn) => {
    try {
      record(id, name, 'PASS', await fn());
    } catch (error) {
      record(id, name, 'FAIL', { error: bounded(error?.stack || error) });
    }
  };

  let manifest = null;
  try {
    runRuntimeAssertions();
    const wpCli = process.env.WU21_WP_CLI;
    const wpPath = process.env.WU21_WP_PATH;
    const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', 'echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'], { encoding: 'utf8', env: process.env });
    if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
    manifest = JSON.parse(cp.stdout);
    record('PR4-BROWSER-000', 'authentic product runtime assertions execute before browser qualification', 'PASS', { executed: true, profile: manifest.surface_profile_id });
  } catch (error) {
    record('PR4-BROWSER-000', 'authentic product runtime assertions execute before browser qualification', 'FAIL', { error: bounded(error?.stack || error) });
  }

  await test('PR4-BROWSER-001', 'desktop current rendered set enters Card Mode only when every visible row is ready', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const state = await projectionState(page);
    if (!state.selector_has_supported) throw new Error('Pinned Chromium lacks selector(:has()) support.');
    if (state.ready_markers !== state.rows || state.unready_markers !== 0) throw new Error(`Rendered set is not fully ready: ${JSON.stringify(state)}`);
    if (state.visible_cards !== state.rows || state.visible_native_cells !== 0) throw new Error(`All-ready set did not enter Card Mode: ${JSON.stringify(state)}`);
    const boxes = await cardBoxes(page, 4);
    if (boxes.length < 4 || Math.abs(boxes[0].y - boxes[1].y) > 3 || Math.abs(boxes[0].x - boxes[1].x) < 20 || boxes[2].y <= boxes[0].y + 20) {
      throw new Error(`Desktop cards are not the expected two-column composition: ${JSON.stringify(boxes)}`);
    }
    await page.screenshot({ path: path.join(artifactDir, 'pr4-inbox-desktop-actual.png'), fullPage: true });
    return { state, first_cards: boxes };
  });

  await test('PR4-BROWSER-002', 'card hierarchy renders authoritative mapped and derived semantics without fabricated Due', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const alpha = page.locator(centerRowsSelector, { hasText: 'WU21 Alpha Student 00' }).first();
    const beta = page.locator(centerRowsSelector, { hasText: 'WU21 Beta Student 01' }).first();
    if (await alpha.count() !== 1 || await beta.count() !== 1) throw new Error('Expected Alpha/Beta mapped rows were not rendered.');
    for (const [name, row] of [['alpha', alpha], ['beta', beta]]) {
      const card = row.locator('.gpp-inbox-card');
      if (await card.getAttribute('data-gpp-profile-id') !== 'srwf.operations.inbox.v1') throw new Error(`${name}: wrong surface profile.`);
      if (await card.locator('.gpp-inbox-card__grade-group').count() !== 1) throw new Error(`${name}: grade/group missing.`);
      if (await card.locator('.gpp-inbox-card__school').count() !== 1) throw new Error(`${name}: school missing.`);
      if (await card.locator('.gpp-inbox-card__step').count() !== 1) throw new Error(`${name}: current step missing.`);
      if (await card.locator('.gpp-inbox-card__created-at').count() !== 1) throw new Error(`${name}: created-at missing.`);
      if (await card.locator('.gpp-inbox-card__due').count() !== 0) throw new Error(`${name}: unresolved Due was fabricated.`);
      if (await card.locator('.gpp-inbox-card__photo-image').count() !== 1) throw new Error(`${name}: mapped photo did not render.`);
    }
    const alphaStep = await alpha.locator('.gpp-inbox-card__step dd').innerText();
    const betaStep = await beta.locator('.gpp-inbox-card__step dd').innerText();
    if (alphaStep !== 'WU21 Alpha Review' || betaStep !== 'WU21 Beta Review') throw new Error(`Authentic current-step mismatch: ${alphaStep} / ${betaStep}`);
    return { alpha_step: alphaStep, beta_step: betaStep, due: 'absent_optional' };
  });

  await test('PR4-BROWSER-003', 'native quick search rerender re-evaluates readiness and retains Card Mode', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const search = page.locator('[data-js="gflow-inbox-search"]');
    if (await search.count() !== 1) throw new Error('Native quick-search control missing.');
    await search.fill('Student 24');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 1, centerRowsSelector, { timeout: 15000 });
    const state = await projectionState(page);
    if (state.rows !== 1 || state.ready_markers !== 1 || state.visible_cards !== 1 || state.visible_native_cells !== 0) throw new Error(`Search rerender readiness failure: ${JSON.stringify(state)}`);
    const text = await page.locator(cardSelector).innerText();
    if (!text.includes('WU21 Alpha Student 24')) throw new Error(`Search result did not preserve derived identity: ${text}`);
    await search.fill('');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 20, centerRowsSelector, { timeout: 15000 });
    return state;
  });

  await test('PR4-BROWSER-004', 'native sorting and pagination rerenders retain host ownership and readiness evaluation', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const header = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="gpp_case_card"]').first();
    await header.click();
    await page.waitForTimeout(350);
    const sort1 = await header.getAttribute('aria-sort');
    await header.click();
    await page.waitForTimeout(350);
    const sort2 = await header.getAttribute('aria-sort');
    if (!sort1 || !sort2 || sort1 === sort2) throw new Error(`Native sorting did not toggle: ${sort1} -> ${sort2}`);
    let state = await projectionState(page);
    if (state.unready_markers !== 0 || state.visible_cards !== state.rows) throw new Error(`Sorting rerender lost Card Mode: ${JSON.stringify(state)}`);
    const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
    await next.click();
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 5, centerRowsSelector, { timeout: 15000 });
    state = await projectionState(page);
    if (state.rows !== 5 || state.ready_markers !== 5 || state.visible_cards !== 5) throw new Error(`Paging rerender lost readiness: ${JSON.stringify(state)}`);
    return { sort1, sort2, second_page: state };
  });

  await test('PR4-BROWSER-005', 'Entry Detail navigation remains the native Gravity Flow link', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const link = page.locator(`${centerRowsSelector} .ag-cell[col-id="gpp_case_card"] .gflow-inbox__entry-cell-link`).first();
    const href = await link.getAttribute('href');
    if (!href || !href.includes('admin.php?page=gravityflow-inbox&view=entry') || !href.includes('&id=') || !href.includes('&lid=')) throw new Error(`Unexpected native entry link: ${href}`);
    return { href };
  });

  await test('PR4-BROWSER-006', 'native Live Refresh add/remove re-evaluates product Card Mode without replacement polling', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const search = page.locator('[data-js="gflow-inbox-search"]');
    await search.fill('WU21 Refresh Student');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, centerRowsSelector, { timeout: 15000 });
    const id = Number(wpControl('add'));
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 1, centerRowsSelector, { timeout: 45000 });
    let state = await projectionState(page);
    if (state.rows !== 1 || state.ready_markers !== 1 || state.visible_cards !== 1) throw new Error(`Live Refresh add did not produce one ready card: ${JSON.stringify(state)}`);
    const text = await page.locator(cardSelector).innerText();
    if (!text.includes('WU21 Refresh Student')) throw new Error(`Live-added task identity missing: ${text}`);
    if (await page.locator(manualRefreshSelector).count() !== 1) throw new Error('Live Refresh duplicated/removed manual recovery control.');
    wpControl('remove');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, centerRowsSelector, { timeout: 45000 });
    state = await projectionState(page);
    return { dynamic_entry_id: id, after_remove: state, native_live_refresh: true };
  });

  await test('PR4-BROWSER-007', 'one authentic unbound visible task keeps the whole rendered set native with no lost row', async () => {
    wpControl('add-unbound');
    try {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      const location = await findRenderedUnreadyPage(page);
      const state = await projectionState(page);
      if (state.unready_markers < 1) throw new Error(`No unready marker for authentic unbound row: ${JSON.stringify(state)}`);
      if (state.visible_cards !== 0 || state.visible_card_cells !== 0) throw new Error(`Hybrid Card Mode leaked into mixed rendered set: ${JSON.stringify(state)}`);
      if (state.visible_native_cells < 1) throw new Error(`Native Gravity Flow rows disappeared on mixed readiness: ${JSON.stringify(state)}`);
      if (await page.locator('[data-js="gflow-inbox-search"]').count() !== 1) throw new Error('Native search disappeared during fallback.');
      return { rendered_page: location, state };
    } finally {
      wpControl('remove-unbound');
    }
  });

  await test('PR4-BROWSER-008', 'manual recovery control is unique on admin Inbox and performs only same-page top-level reload', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page);
    await page.waitForSelector(manualRefreshSelector, { timeout: 10000 });
    if (await page.locator(manualRefreshSelector).count() !== 1) throw new Error('Manual refresh control is not unique before reload.');
    const before = page.url();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator(manualRefreshSelector).click(),
    ]);
    await waitForInbox(page);
    const after = page.url();
    if (after !== before) throw new Error(`Manual refresh changed Inbox URL: ${before} -> ${after}`);
    if (await page.locator(manualRefreshSelector).count() !== 1) throw new Error('Manual refresh control duplicated after normal reload.');
    return { before, after, controls: 1 };
  });

  await test('PR4-BROWSER-009', 'manual recovery control is reachable and unique on the supported frontend Gravity Flow Inbox', async () => {
    if (!manifest?.frontend_inbox_url) throw new Error('Frontend Inbox URL missing from product fixture manifest.');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
    await waitForInbox(page);
    await page.waitForSelector(manualRefreshSelector, { timeout: 10000 });
    if (await page.locator(manualRefreshSelector).count() !== 1) throw new Error('Frontend manual refresh control is not unique.');
    const before = page.url();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator(manualRefreshSelector).click(),
    ]);
    await waitForInbox(page);
    if (page.url() !== before || await page.locator(manualRefreshSelector).count() !== 1) throw new Error('Frontend recovery control did not perform one normal same-page reload.');
    return { url: before, controls: 1 };
  });

  await test('PR4-SIZING-001', 'measure admitted admin Inbox widths with expanded and collapsed WordPress menu', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const expanded = await measureWidths(page, 'admin-1440-before-menu-toggle');
    sizing.push(expanded);
    const collapse = page.locator('#collapse-menu');
    if (await collapse.count() !== 1) throw new Error('WordPress admin menu collapse control unavailable.');
    await collapse.click();
    await page.waitForTimeout(400);
    const collapsed = await measureWidths(page, 'admin-1440-after-menu-toggle');
    sizing.push(collapsed);
    if (!expanded.card_cell || !collapsed.card_cell || expanded.card_cell.width <= 0 || collapsed.card_cell.width <= 0) throw new Error('Could not measure real card-cell widths.');
    return { expanded, collapsed };
  });

  await test('PR4-SIZING-002', '<782px and 320px states reflow to one card per row without horizontal overflow', async () => {
    const observations = [];
    for (const width of [700, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await waitForInbox(page, 20);
      const boxes = await cardBoxes(page, 3);
      if (boxes.length < 3 || !(boxes[1].y > boxes[0].y + 20 && boxes[2].y > boxes[1].y + 20)) throw new Error(`${width}px did not reflow to one card per row: ${JSON.stringify(boxes)}`);
      const overflow = await assertNoHorizontalOverflow(page, `${width}px`);
      const measured = await measureWidths(page, `admin-${width}-reflow`);
      sizing.push(measured);
      observations.push({ width, overflow, measured });
      if (width === 320) await page.screenshot({ path: path.join(artifactDir, 'pr4-inbox-320.png'), fullPage: true });
      if (width === 700) await page.screenshot({ path: path.join(artifactDir, 'pr4-inbox-mobile-actual.png'), fullPage: true });
    }
    return observations;
  });

  await test('PR4-SIZING-003', '200 percent root text sizing grows rem content without clipping or horizontal overflow', async () => {
    await page.setViewportSize({ width: 700, height: 1100 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const before = await measureWidths(page, 'admin-700-text-100');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.waitForTimeout(250);
    const after = await measureWidths(page, 'admin-700-text-200');
    sizing.push(before, after);
    if (parseFloat(after.html_font_size) < parseFloat(before.html_font_size) * 1.9) throw new Error(`Root text resize did not reach 200%: ${before.html_font_size} -> ${after.html_font_size}`);
    if (!after.card || after.card.scrollWidth > after.card.clientWidth + 2 || after.card.scrollHeight > after.card.clientHeight + 2) throw new Error(`200% text clipped card content: ${JSON.stringify(after.card)}`);
    await assertNoHorizontalOverflow(page, '200% text');
    await page.screenshot({ path: path.join(artifactDir, 'pr4-inbox-text-200.png'), fullPage: true });
    return { before, after };
  });

  await test('PR4-SIZING-004', 'long Persian grade and school content wraps inside the card without horizontal overflow', async () => {
    await page.setViewportSize({ width: 320, height: 1200 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForInbox(page, 20);
    const row = page.locator(centerRowsSelector, { hasText: 'عنوان طولانی برای آزمون بازچینی متن' }).first();
    if (await row.count() !== 1) throw new Error('Long Persian sizing fixture was not rendered.');
    const card = row.locator('.gpp-inbox-card');
    const geometry = await card.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, text: el.innerText }));
    if (geometry.scrollWidth > geometry.clientWidth + 2 || geometry.scrollHeight > geometry.clientHeight + 2) throw new Error(`Long Persian content clips: ${JSON.stringify(geometry)}`);
    if (!geometry.text.includes('دبیرستان نمونه دولتی')) throw new Error('Long Persian school content missing.');
    await assertNoHorizontalOverflow(page, 'long Persian content');
    return geometry;
  });

  await test('PR4-SIZING-005', 'very wide frontend host records real container/card widths without an invented production cap', async () => {
    if (!manifest?.frontend_inbox_url) throw new Error('Frontend Inbox URL missing.');
    await page.setViewportSize({ width: 2200, height: 1200 });
    await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
    await waitForInbox(page);
    const measured = await measureWidths(page, 'frontend-2200-wide-host');
    sizing.push(measured);
    if (!measured.native_inbox || !measured.card_cell || measured.native_inbox.width <= 0 || measured.card_cell.width <= 0) throw new Error(`Wide-host measurements unavailable: ${JSON.stringify(measured)}`);
    await assertNoHorizontalOverflow(page, 'wide frontend host');
    await page.screenshot({ path: path.join(artifactDir, 'pr4-inbox-wide-2200.png'), fullPage: true });
    return {
      ...measured,
      viewport_to_inbox_ratio: measured.native_inbox.width / measured.viewport.width,
      inbox_to_card_ratio: measured.card_cell.width / measured.native_inbox.width,
      production_max_width_added: false,
      production_container_query_added: false,
    };
  });

  await test('PR4-VISUAL-001', 'capture current Desktop/Mobile and canonical Owner A/B references in the same browser engine', async () => {
    const referencePath = path.join(process.env.GITHUB_WORKSPACE, 'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html');
    if (!fs.existsSync(referencePath)) throw new Error('Canonical Owner visual reference HTML is unavailable.');
    const refUrl = pathToFileURL(referencePath).href;

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(refUrl, { waitUntil: 'load' });
    const desktopTab = page.locator('[data-surface="inbox-desktop"]');
    if (await desktopTab.count() !== 1) throw new Error('Owner reference A selector missing.');
    await desktopTab.click();
    await page.screenshot({ path: path.join(artifactDir, 'pr4-owner-reference-A-inbox-desktop.png'), fullPage: true });
    const desktopText = await page.locator('body').innerText();
    if (!desktopText.includes('مرحله') || !desktopText.includes('تاریخ')) throw new Error('Owner reference A does not expose expected Inbox information hierarchy.');

    await page.setViewportSize({ width: 390, height: 1000 });
    const mobileTab = page.locator('[data-surface="inbox-mobile"]');
    if (await mobileTab.count() !== 1) throw new Error('Owner reference B selector missing.');
    await mobileTab.click();
    await page.screenshot({ path: path.join(artifactDir, 'pr4-owner-reference-B-inbox-mobile.png'), fullPage: true });

    return {
      reference: path.basename(referencePath),
      desktop_reference_captured: true,
      mobile_reference_captured: true,
      actual_desktop: 'pr4-inbox-desktop-actual.png',
      actual_mobile: 'pr4-inbox-mobile-actual.png',
      note: 'Screenshots are comparable evidence artifacts; visual acceptance still requires review of GPP-owned scope.',
    };
  });

  fs.writeFileSync(path.join(artifactDir, 'pr4-inbox-sizing-measurements.json'), JSON.stringify({ measurements: sizing }, null, 2) + '\n');
  fs.writeFileSync(path.join(artifactDir, 'wu17-browser-results.json'), JSON.stringify({ suite: 'PR4 authentic Inbox browser/runtime', results }, null, 2) + '\n');
  for (const result of results) process.stdout.write(`${result.status} ${result.id} ${result.name}\n`);
  return results;
}
