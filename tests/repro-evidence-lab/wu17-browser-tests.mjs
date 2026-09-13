import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const centerRowsSelector = '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row';
const cardSelector = `${centerRowsSelector} .gpp-inbox-card`;

function bounded(value, max = 4000) {
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
    throw new Error(`WU17 runtime assertions failed:\n${cp.stdout}\n${cp.stderr}`);
  }
  process.stdout.write(cp.stdout);
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

async function waitForNativeCards(page, expected = null, requireVisible = true) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForSelector(cardSelector, { state: 'attached', timeout: 30000 });
  if (expected !== null) {
    await page.waitForFunction(
      ({ selector, count }) => document.querySelectorAll(selector).length === count,
      { selector: cardSelector, count: expected },
      { timeout: 30000 },
    );
  }
  if (requireVisible) {
    await page.locator(cardSelector).first().waitFor({ state: 'visible', timeout: 30000 });
  }
}

async function narrowDiagnostic(page) {
  return page.evaluate(({ rowsSelector, cardsSelector }) => {
    const target = document.querySelector('[data-js="gflow-inbox"]');
    const root = target?.querySelector('.ag-root-wrapper');
    const viewport = target?.querySelector('.ag-center-cols-viewport');
    const center = target?.querySelector('.ag-center-cols-container');
    const row = document.querySelector(rowsSelector);
    const cell = row?.querySelector('.ag-cell[col-id="gpp_case_card"]');
    const card = document.querySelector(cardsSelector);
    const describe = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        classes: element.className,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
        overflowX: style.overflowX,
        width: style.width,
        height: style.height,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      media782: matchMedia('(max-width: 782px)').matches,
      bodyClasses: document.body.className,
      centerRowCount: document.querySelectorAll(rowsSelector).length,
      cardCount: document.querySelectorAll(cardsSelector).length,
      target: describe(target),
      root: describe(root),
      viewportElement: describe(viewport),
      center: describe(center),
      row: describe(row),
      cell: describe(cell),
      card: describe(card),
    };
  }, { rowsSelector: centerRowsSelector, cardsSelector: cardSelector });
}

export async function runWu17BrowserTests({ page, inboxUrl, wpControl, artifactDir }) {
  const results = [];
  const record = (id, name, status, details = null) => results.push({ id, name, status, details });
  const test = async (id, name, fn) => {
    try {
      record(id, name, 'PASS', await fn());
    } catch (error) {
      record(id, name, 'FAIL', { error: bounded(error?.stack || error) });
    }
  };

  try {
    runRuntimeAssertions();
  } catch (error) {
    record('WU17-BROWSER-000', 'production adapter runtime assertions execute in pinned simulation', 'FAIL', { error: bounded(error?.stack || error) });
  }

  await test('WU17-BROWSER-001', 'desktop native Inbox composes exactly two cards per row', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);
    const rows = await page.locator(centerRowsSelector).count();
    const cards = await page.locator(cardSelector).count();
    if (rows !== cards) throw new Error(`One-to-one native row/card mapping failed: rows=${rows}, cards=${cards}`);
    const boxes = await cardBoxes(page, 4);
    if (boxes.length < 4) throw new Error(`Need four cards to prove two-column composition; got ${boxes.length}.`);
    if (Math.abs(boxes[0].y - boxes[1].y) > 3) throw new Error('First two cards are not in the same desktop row.');
    if (Math.abs(boxes[0].x - boxes[1].x) < 20) throw new Error('First two cards overlap instead of forming two columns.');
    if (boxes[2].y <= boxes[0].y + 20 || Math.abs(boxes[2].y - boxes[3].y) > 3) throw new Error('Second desktop card row is not a two-card row.');
    return { native_rows: rows, cards, first_row_y: [boxes[0].y, boxes[1].y], second_row_y: [boxes[2].y, boxes[3].y] };
  });

  await test('WU17-BROWSER-002', 'narrow native Inbox composes exactly one card per row without primary horizontal overflow', async () => {
    await page.setViewportSize({ width: 700, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20, false);
    const diagnostic = await narrowDiagnostic(page);
    fs.writeFileSync(path.join(artifactDir, 'wu17-narrow-diagnostic.json'), JSON.stringify(diagnostic, null, 2) + '\n');
    await page.screenshot({ path: path.join(artifactDir, 'wu17-narrow.png'), fullPage: true });
    if (!diagnostic.card || diagnostic.card.rect.width <= 0 || diagnostic.card.rect.height <= 0 || diagnostic.card.display === 'none' || diagnostic.card.visibility === 'hidden') {
      throw new Error(`Narrow card is not visibly laid out: ${JSON.stringify(diagnostic)}`);
    }
    const boxes = await cardBoxes(page, 3);
    if (boxes.length < 3) throw new Error('Need three cards to prove one-column composition.');
    if (!(boxes[1].y > boxes[0].y + 20 && boxes[2].y > boxes[1].y + 20)) throw new Error(`Narrow cards are not stacked one per row: ${JSON.stringify(boxes)}`);
    const overflow = await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 2) throw new Error(`Native Inbox has horizontal overflow: ${JSON.stringify(overflow)}`);
    return { card_y: boxes.map(box => box.y), overflow, diagnostic };
  });

  await test('WU17-BROWSER-003', 'card hierarchy uses shared profile and form-local fail-closed semantics', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);

    const alphaRow = page.locator(centerRowsSelector, { hasText: 'WU21 Alpha Student' }).first();
    const betaRow = page.locator(centerRowsSelector, { hasText: 'WU21 Beta Student' }).first();
    if (await alphaRow.count() !== 1 || await betaRow.count() !== 1) throw new Error('Visible synthetic Alpha/Beta native rows were not found.');

    const alphaCard = alphaRow.locator('.gpp-inbox-card');
    const betaCard = betaRow.locator('.gpp-inbox-card');
    if (await alphaCard.getAttribute('data-gpp-profile-id') !== 'shared.inbox.v1') throw new Error('Alpha card switched profile.');
    if (await betaCard.getAttribute('data-gpp-profile-id') !== 'shared.inbox.v1') throw new Error('Beta card switched profile.');

    const alphaName = await alphaCard.locator('.gpp-inbox-card__name').innerText();
    const betaName = await betaCard.locator('.gpp-inbox-card__name').innerText();
    const alphaNational = await alphaCard.locator('.gpp-inbox-card__national-id').innerText();
    const betaNational = await betaCard.locator('.gpp-inbox-card__national-id').innerText();
    const alphaStep = await alphaCard.locator('.gpp-inbox-card__step dd').innerText();
    const betaStep = await betaCard.locator('.gpp-inbox-card__step dd').innerText();
    const alphaCreated = await alphaCard.locator('.gpp-inbox-card__created-at dd').innerText();
    if (!alphaName.startsWith('WU21 Alpha Student ') || !betaName.startsWith('WU21 Beta Student ')) throw new Error('Visible card names do not come from their form-local synthetic bindings.');
    if (!alphaNational.startsWith('SYN-A-') || !betaNational.startsWith('SYN-B-')) throw new Error(`Cross-form national-ID substitution detected: ${alphaNational} / ${betaNational}`);
    if (alphaStep !== 'WU21 Alpha Review' || betaStep !== 'WU21 Beta Review') throw new Error(`Cross-form current-step substitution detected: ${alphaStep} / ${betaStep}`);
    if (!/^۱۴۰۴\/۱۰\/۱۱،/.test(alphaCreated)) throw new Error(`Jalali/Persian created-at presentation missing: ${alphaCreated}`);
    if (await alphaCard.locator('.gpp-inbox-card__photo-image').count() !== 1) throw new Error('PROVEN Alpha photo did not render.');
    if (await betaCard.locator('.gpp-inbox-card__photo-image').count() !== 0) throw new Error('NOT_PROVEN Beta photo leaked from host data.');
    if (await betaCard.locator('.gpp-inbox-card__photo-fallback').count() !== 1) throw new Error('NOT_PROVEN Beta photo did not fail closed to fallback.');
    if (await page.locator('.gpp-inbox-card__school, .gpp-inbox-card__due').count() !== 0) throw new Error('UNBOUND School or NOT_PROVEN Due became visible.');
    return {
      shared_profile: 'shared.inbox.v1',
      alpha: { name: alphaName, national_id: alphaNational, step: alphaStep },
      beta: { name: betaName, national_id: betaNational, step: betaStep },
      alpha_photo: 'proven',
      beta_photo: 'fail_closed',
      optional_school_due: 'absent',
    };
  });

  await test('WU17-BROWSER-004', 'clear card action uses the native Gravity Flow Entry Detail link', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);
    const firstCell = page.locator(`${centerRowsSelector} .ag-cell[col-id="gpp_case_card"]`).first();
    const link = firstCell.locator('.gflow-inbox__entry-cell-link');
    if (await link.count() !== 1) throw new Error('Card cell does not contain exactly one native Gravity Flow Entry Detail link.');
    const href = await link.getAttribute('href');
    if (!href || !href.includes('admin.php?page=gravityflow-inbox&view=entry') || !href.includes('&id=') || !href.includes('&lid=')) {
      throw new Error(`Unexpected native Entry Detail href: ${href}`);
    }
    const action = firstCell.locator('.gpp-inbox-card__open');
    const box = await action.boundingBox();
    if (!box) throw new Error('Clear open-dossier action is not visible.');
    const replacements = await page.locator('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').count();
    if (replacements !== 0) throw new Error(`Replacement Inbox detected: ${replacements}`);
    await Promise.all([
      page.waitForURL(/page=gravityflow-inbox.*view=entry/, { timeout: 30000 }),
      page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
    ]);
    return { href, replacement_inboxes: replacements, clear_action_navigated_via_native_cell_link: true };
  });

  await test('WU17-BROWSER-005', 'native polling adds and removes exactly one card without duplicates', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox-search"]', { timeout: 30000 });
    const search = page.locator('[data-js="gflow-inbox-search"]');
    await search.click();
    await search.pressSequentially('WU21 Refresh Student');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, centerRowsSelector, { timeout: 15000 });
    const id = wpControl('add');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 1, centerRowsSelector, { timeout: 45000 });
    const rowCount = await page.locator(centerRowsSelector).count();
    const cardCount = await page.locator(cardSelector).count();
    if (rowCount !== 1 || cardCount !== 1) throw new Error(`Polling created duplicate/stale presentation: rows=${rowCount}, cards=${cardCount}`);
    const cardText = await page.locator(cardSelector).innerText();
    if (!cardText.includes('WU21 Refresh Student')) throw new Error('Native polling row did not receive the GPP card presentation.');
    wpControl('remove');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, centerRowsSelector, { timeout: 45000 });
    if (await page.locator(cardSelector).count() !== 0) throw new Error('Card remained stale after native row removal.');
    return { dynamic_entry_id: Number(id), add_card_count: cardCount, remove_card_count: 0 };
  });

  await test('WU17-BROWSER-006', 'reload keeps one native Inbox and one card per native center row', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);
    const wrappers = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
    const rows = await page.locator(centerRowsSelector).count();
    const cards = await page.locator(cardSelector).count();
    const invalidRows = await page.locator(centerRowsSelector).evaluateAll(rows => rows.filter(row => row.querySelectorAll('.gpp-inbox-card').length !== 1).length);
    if (wrappers !== 1 || rows !== cards || invalidRows !== 0) throw new Error(`Reload duplication: wrappers=${wrappers}, rows=${rows}, cards=${cards}, invalid_rows=${invalidRows}`);
    return { native_wrappers: wrappers, native_center_rows: rows, cards, invalid_rows: invalidRows };
  });

  fs.writeFileSync(path.join(artifactDir, 'wu17-browser-results.json'), JSON.stringify({ suite: 'WU17 native Inbox presentation browser/runtime', results }, null, 2) + '\n');
  for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
  return results;
}
