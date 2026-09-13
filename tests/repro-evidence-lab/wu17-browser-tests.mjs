import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
  const cards = page.locator('[data-js="gflow-inbox"] .gpp-inbox-card');
  const boxes = [];
  for (let i = 0; i < Math.min(count, await cards.count()); i += 1) {
    const box = await cards.nth(i).boundingBox();
    if (!box) throw new Error(`Card ${i} has no bounding box.`);
    boxes.push(box);
  }
  return boxes;
}

async function waitForNativeCards(page, expected = null) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForSelector('[data-js="gflow-inbox"] .gpp-inbox-card', { timeout: 30000 });
  if (expected !== null) {
    await page.waitForFunction(
      n => document.querySelectorAll('[data-js="gflow-inbox"] .gpp-inbox-card').length === n,
      expected,
      { timeout: 30000 },
    );
  }
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
    const rows = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').count();
    const cards = await page.locator('[data-js="gflow-inbox"] .gpp-inbox-card').count();
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
    await waitForNativeCards(page, 20);
    const boxes = await cardBoxes(page, 3);
    if (boxes.length < 3) throw new Error('Need three cards to prove one-column composition.');
    if (!(boxes[1].y > boxes[0].y + 20 && boxes[2].y > boxes[1].y + 20)) throw new Error('Narrow cards are not stacked one per row.');
    const overflow = await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').evaluate(element => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 2) throw new Error(`Native Inbox has horizontal overflow: ${JSON.stringify(overflow)}`);
    return { card_y: boxes.map(box => box.y), overflow };
  });

  await test('WU17-BROWSER-003', 'card hierarchy uses shared profile and form-local fail-closed semantics', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);

    const alphaRow = page.locator('[data-js="gflow-inbox"] .ag-row', { hasText: 'WU21 Alpha Student 00' }).first();
    const betaRow = page.locator('[data-js="gflow-inbox"] .ag-row', { hasText: 'WU21 Beta Student 01' }).first();
    if (await alphaRow.count() !== 1 || await betaRow.count() !== 1) throw new Error('Synthetic Alpha/Beta native rows were not found.');

    const alphaCard = alphaRow.locator('.gpp-inbox-card');
    const betaCard = betaRow.locator('.gpp-inbox-card');
    if (await alphaCard.getAttribute('data-gpp-profile-id') !== 'shared.inbox.v1') throw new Error('Alpha card switched profile.');
    if (await betaCard.getAttribute('data-gpp-profile-id') !== 'shared.inbox.v1') throw new Error('Beta card switched profile.');

    const alphaText = await alphaCard.innerText();
    const betaText = await betaCard.innerText();
    for (const expected of ['WU21 Alpha Student 00', 'SYN-A-۰۰۰۰۰۰', 'WU21 Alpha Review', '۱۴۰۴/۱۰/۱۱']) {
      if (!alphaText.includes(expected)) throw new Error(`Alpha hierarchy is missing ${expected}`);
    }
    for (const expected of ['WU21 Beta Student 01', 'SYN-B-۰۰۰۰۰۱', 'WU21 Beta Review']) {
      if (!betaText.includes(expected)) throw new Error(`Beta hierarchy is missing ${expected}`);
    }
    if (await alphaCard.locator('.gpp-inbox-card__photo-image').count() !== 1) throw new Error('PROVEN Alpha photo did not render.');
    if (await betaCard.locator('.gpp-inbox-card__photo-image').count() !== 0) throw new Error('NOT_PROVEN Beta photo leaked from host data.');
    if (await betaCard.locator('.gpp-inbox-card__photo-fallback').count() !== 1) throw new Error('NOT_PROVEN Beta photo did not fail closed to fallback.');
    if (await page.locator('.gpp-inbox-card__school, .gpp-inbox-card__due').count() !== 0) throw new Error('UNBOUND School or NOT_PROVEN Due became visible.');
    return { shared_profile: 'shared.inbox.v1', alpha_photo: 'proven', beta_photo: 'fail_closed', optional_school_due: 'absent' };
  });

  await test('WU17-BROWSER-004', 'native Entry Detail link remains the only card navigation path', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);
    const cards = page.locator('[data-js="gflow-inbox"] .gpp-inbox-card');
    const firstCard = cards.first();
    const link = firstCard.locator('xpath=ancestor::a[contains(@class,"gflow-inbox__entry-cell-link")]');
    if (await link.count() !== 1) throw new Error('Card is not wrapped by the native Gravity Flow Entry Detail link.');
    const href = await link.getAttribute('href');
    if (!href || !href.includes('admin.php?page=gravityflow-inbox&view=entry') || !href.includes('&id=') || !href.includes('&lid=')) {
      throw new Error(`Unexpected native Entry Detail href: ${href}`);
    }
    const replacements = await page.locator('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').count();
    if (replacements !== 0) throw new Error(`Replacement Inbox detected: ${replacements}`);
    return { href, replacement_inboxes: replacements };
  });

  await test('WU17-BROWSER-005', 'native polling adds and removes exactly one card without duplicates', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox-search"]', { timeout: 30000 });
    const search = page.locator('[data-js="gflow-inbox-search"]');
    await search.click();
    await search.pressSequentially('WU21 Refresh Student');
    await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-row').length === 0, null, { timeout: 15000 });
    const id = wpControl('add');
    await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-row').length === 1, null, { timeout: 45000 });
    const rowCount = await page.locator('[data-js="gflow-inbox"] .ag-row').count();
    const cardCount = await page.locator('[data-js="gflow-inbox"] .gpp-inbox-card').count();
    if (rowCount !== 1 || cardCount !== 1) throw new Error(`Polling created duplicate/stale presentation: rows=${rowCount}, cards=${cardCount}`);
    const cardText = await page.locator('[data-js="gflow-inbox"] .gpp-inbox-card').innerText();
    if (!cardText.includes('WU21 Refresh Student')) throw new Error('Native polling row did not receive the GPP card presentation.');
    wpControl('remove');
    await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-row').length === 0, null, { timeout: 45000 });
    if (await page.locator('[data-js="gflow-inbox"] .gpp-inbox-card').count() !== 0) throw new Error('Card remained stale after native row removal.');
    return { dynamic_entry_id: Number(id), add_card_count: cardCount, remove_card_count: 0 };
  });

  await test('WU17-BROWSER-006', 'reload keeps one native Inbox and one card per native row', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForNativeCards(page, 20);
    const wrappers = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
    const rows = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').count();
    const cards = await page.locator('[data-js="gflow-inbox"] .gpp-inbox-card').count();
    const multiCardRows = await page.locator('[data-js="gflow-inbox"] .ag-row').evaluateAll(rows => rows.filter(row => row.querySelectorAll('.gpp-inbox-card').length !== 1).length);
    if (wrappers !== 1 || rows !== cards || multiCardRows !== 0) throw new Error(`Reload duplication: wrappers=${wrappers}, rows=${rows}, cards=${cards}, invalid_rows=${multiCardRows}`);
    return { native_wrappers: wrappers, native_rows: rows, cards, invalid_rows: multiCardRows };
  });

  fs.writeFileSync(path.join(artifactDir, 'wu17-browser-results.json'), JSON.stringify({ suite: 'WU17 native Inbox presentation browser/runtime', results }, null, 2) + '\n');
  for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
  return results;
}
