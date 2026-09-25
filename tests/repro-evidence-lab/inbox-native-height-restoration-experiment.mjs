import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const {
  WU21_WP_CLI: wpCli,
  WU21_WP_PATH: wpPath,
  WU21_ARTIFACT_DIR: artifactDir,
  WU21_BASE_URL: baseUrl,
  GITHUB_WORKSPACE: repoRoot,
  GPP_BOUND_HEAD: boundHead,
} = process.env;
for (const [name, value] of Object.entries({ wpCli, wpPath, artifactDir, baseUrl, repoRoot, boundHead })) {
  if (!value) throw new Error(`Missing required experiment environment: ${name}`);
}

const productionCssPath = path.join(repoRoot, 'assets/css/srwf-gravity-flow-inbox.css');
const productionCss = fs.readFileSync(productionCssPath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const wp = code => execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8' }).trim();
const p06 = JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const cookies = JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+1800; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const runtime = JSON.parse(fs.readFileSync(path.join(artifactDir, 'runtime.json'), 'utf8'));

const scope = '.gflow-inbox.gflow-grid.gflow-common';
const selectors = {
  gridRoot: `${scope} .ag-root-wrapper`,
  centerRows: `${scope} .ag-center-cols-container`,
  searchInput: `${scope} [data-js="gflow-inbox-search"]`,
};
const rowsSelector = `${selectors.centerRows} > .ag-row`;

function stripRuleAuthority(css, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`([^{}]*${escaped}\\s*\\{)([^{}]*)(\\})`, 'g');
  let matchedRules = 0;
  let removedDeclarations = 0;
  const output = css.replace(rule, (full, head, body, tail) => {
    if (!head.includes(':has(') || !head.includes(':not(:has(') || !head.trimEnd().endsWith(`${className} {`)) return full;
    matchedRules += 1;
    const rewritten = body.replace(/(^|\n)(\s*)(height\s*:\s*auto\s*!important\s*;|min-height\s*:\s*0\s*!important\s*;)\s*/g, (match, prefix) => {
      removedDeclarations += 1;
      return prefix;
    });
    return `${head}${rewritten}${tail}`;
  });
  return { css: output, matchedRules, removedDeclarations };
}

const containerStrip = stripRuleAuthority(productionCss, '.ag-center-cols-container');
const clipperStrip = stripRuleAuthority(containerStrip.css, '.ag-center-cols-clipper');
assert.equal(containerStrip.matchedRules, 1, 'Expected exactly one admitted Card Mode center-container rule.');
assert.equal(containerStrip.removedDeclarations, 2, 'Expected to neutralize only container height/min-height declarations.');
assert.equal(clipperStrip.matchedRules, 1, 'Expected exactly one admitted Card Mode clipper rule.');
assert.equal(clipperStrip.removedDeclarations, 2, 'Expected to neutralize only clipper height/min-height declarations.');
const counterfactualCss = clipperStrip.css;

function wpControl(action) {
  const env = { ...process.env, WU21_CONTROL: action };
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/runtime-control.php')], { encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(`WP control ${action} failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

const report = {
  status: 'RUNNING',
  repository: 'rezahh107/Gravity-Presentation-Profiles',
  bound_head: boundHead,
  experiment_head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  production_source_mutation: false,
  runtime,
  css_counterfactual: {
    source: 'test-only route fulfillment',
    container_removed_declarations: containerStrip.removedDeclarations,
    clipper_removed_declarations: clipperStrip.removedDeclarations,
  },
  positive_control: [],
  counterfactual: [],
  conclusion: null,
};

function px(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}
function approx(a, b, tolerance = 1.5) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

async function waitForGrid(page) {
  await page.waitForSelector(selectors.gridRoot, { timeout: 30000 });
  await page.evaluate(async () => { await document.fonts.ready; });
}
async function settleExact(page, count, timeout = 15000) {
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: rowsSelector, count }, { timeout });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(350);
}
async function stableRowCount(page) {
  await waitForGrid(page);
  let previous = -1;
  let stable = 0;
  const started = Date.now();
  while (Date.now() - started < 12000) {
    const count = await page.locator(rowsSelector).count();
    if (count === previous && count >= 0) stable += 1;
    else stable = 0;
    previous = count;
    if (stable >= 4) return count;
    await page.waitForTimeout(250);
  }
  return page.locator(rowsSelector).count();
}

async function measure(page, label) {
  return page.evaluate(({ scope, rowsSelector, label }) => {
    const inbox = document.querySelector(scope);
    if (!inbox) throw new Error('Inbox scope missing.');
    const describeRules = element => {
      const found = [];
      const visit = (rules, href) => {
        for (const rule of [...(rules || [])]) {
          if (rule.cssRules) visit(rule.cssRules, href);
          if (!rule.selectorText) continue;
          let matches = false;
          try { matches = element.matches(rule.selectorText); } catch {}
          if (!matches) continue;
          for (const property of ['height', 'min-height']) {
            const value = rule.style?.getPropertyValue(property)?.trim();
            if (!value) continue;
            found.push({ href: href || 'inline-style-sheet', selector: rule.selectorText, property, value, priority: rule.style.getPropertyPriority(property) || '' });
          }
        }
      };
      for (const sheet of [...document.styleSheets]) {
        try { visit(sheet.cssRules, sheet.href); } catch {}
      }
      return found;
    };
    const box = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        inline_style: element.getAttribute('style'),
        inline_height: element.style.getPropertyValue('height'),
        inline_height_priority: element.style.getPropertyPriority('height'),
        inline_min_height: element.style.getPropertyValue('min-height'),
        inline_min_height_priority: element.style.getPropertyPriority('min-height'),
        computed_height: style.height,
        computed_min_height: style.minHeight,
        computed_display: style.display,
        computed_overflow: style.overflow,
        bbox_top: rect.top,
        bbox_bottom: rect.bottom,
        bbox_width: rect.width,
        bbox_height: rect.height,
        matched_height_rules: describeRules(element),
      };
    };
    const rowElements = [...inbox.querySelectorAll(rowsSelector)];
    const cards = rowElements.map(row => {
      const card = row.querySelector('.gpp-inbox-card');
      if (!card || card.getBoundingClientRect().height <= 0) return null;
      return { row_id: row.getAttribute('row-id'), row: box(row), card: box(card) };
    }).filter(Boolean);
    const cardBoxes = cards.map(item => item.card);
    const pager = inbox.querySelector('.ag-paging-panel');
    const body = inbox.querySelector('.ag-body-viewport');
    const container = inbox.querySelector('.ag-center-cols-container');
    const clipper = inbox.querySelector('.ag-center-cols-clipper');
    const pagerBox = box(pager);
    const widthOwner = inbox.closest('[data-gpp-inbox-surface]') || inbox;
    const tops = [...new Set(cardBoxes.map(item => Math.round(item.bbox_top)))];
    const lastBottom = cardBoxes.length ? Math.max(...cardBoxes.map(item => item.bbox_bottom)) : null;
    const firstTop = cardBoxes.length ? Math.min(...cardBoxes.map(item => item.bbox_top)) : null;
    return {
      label,
      row_count: rowElements.length,
      card_count: cards.length,
      row_ids: rowElements.map(row => row.getAttribute('row-id')).filter(Boolean),
      cards,
      card_heights: cardBoxes.map(item => item.bbox_height),
      median_card_height: cardBoxes.length ? [...cardBoxes.map(item => item.bbox_height)].sort((a,b)=>a-b)[Math.floor(cardBoxes.length/2)] : null,
      cards_per_visual_row: cardBoxes.length ? Math.max(...tops.map(top => cardBoxes.filter(item => Math.abs(item.bbox_top - top) < 3).length)) : 0,
      visual_card_flow_height: cardBoxes.length ? lastBottom - firstTop : 0,
      last_card_to_pager_gap: cardBoxes.length && pagerBox ? pagerBox.bbox_top - lastBottom : null,
      container: box(container),
      clipper: box(clipper),
      body: box(body),
      pager: pagerBox,
      grid_count: document.querySelectorAll(`${scope} .ag-root-wrapper`).length,
      pager_count: inbox.querySelectorAll('.ag-paging-panel').length,
      custom_pager_count: inbox.querySelectorAll('[data-gpp-pager], .gpp-inbox-pager, .gpp-custom-pager').length,
      replacement_inbox_count: document.querySelectorAll('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').length,
      manual_refresh_count: document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      empty_visible: !!inbox.querySelector('.ag-overlay-no-rows-center')?.getBoundingClientRect().height,
      horizontal_overflow: Math.max(0, widthOwner.scrollWidth - widthOwner.clientWidth),
      inbox_width: inbox.getBoundingClientRect().width,
      document_horizontal_overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  }, { scope, rowsSelector, label });
}

function gppImportantAuthorityRules(box) {
  return (box?.matched_height_rules || []).filter(rule =>
    rule.priority === 'important' && String(rule.href || '').includes('srwf-gravity-flow-inbox.css')
  );
}
function assertHostAuthority(box, name) {
  assert.ok(box, `${name} box missing.`);
  assert.equal(gppImportantAuthorityRules(box).length, 0, `${name} still has a GPP !important height authority.`);
  const inlineHeight = px(box.inline_height);
  const computedHeight = px(box.computed_height);
  const minHeight = px(box.computed_min_height) ?? 0;
  assert.ok(Number.isFinite(inlineHeight) && inlineHeight > 0, `${name} native inline height missing: ${box.inline_height}`);
  const expected = Math.max(inlineHeight, minHeight);
  assert.ok(approx(computedHeight, expected), `${name} computed height does not follow native inline/minimum authority: inline=${inlineHeight}, min=${minHeight}, computed=${computedHeight}`);
  assert.ok(approx(box.bbox_height, expected), `${name} bounding height does not follow native inline/minimum authority: inline=${inlineHeight}, min=${minHeight}, bbox=${box.bbox_height}`);
}
function assertComposition(m, expectedRows, columns, control = null) {
  assert.equal(m.row_count, expectedRows, `${m.label}: row count`);
  assert.equal(m.card_count, expectedRows, `${m.label}: card count`);
  assert.equal(m.grid_count, 1, `${m.label}: native grid count`);
  assert.equal(m.pager_count, 1, `${m.label}: native pager count`);
  assert.equal(m.custom_pager_count, 0, `${m.label}: custom pager introduced`);
  assert.equal(m.replacement_inbox_count, 0, `${m.label}: replacement Inbox introduced`);
  assert.equal(m.horizontal_overflow, 0, `${m.label}: surface horizontal overflow`);
  assert.equal(m.document_horizontal_overflow, 0, `${m.label}: document horizontal overflow`);
  assert.equal(m.cards_per_visual_row, expectedRows ? Math.min(columns, expectedRows) : 0, `${m.label}: cards per visual row`);
  assertHostAuthority(m.container, `${m.label} container`);
  assertHostAuthority(m.clipper, `${m.label} clipper`);
  if (expectedRows > 0) {
    assert.ok(m.last_card_to_pager_gap >= -1, `${m.label}: pager/card overlap ${m.last_card_to_pager_gap}`);
    assert.ok(m.last_card_to_pager_gap <= 64, `${m.label}: stale blank tail ${m.last_card_to_pager_gap}`);
  }
  if (control?.cards?.length) {
    const controlById = new Map(control.cards.map(item => [item.row_id, item.card.bbox_height]));
    const comparable = m.cards.filter(item => controlById.has(item.row_id));
    assert.ok(comparable.length >= Math.min(3, control.cards.length), `${m.label}: insufficient same-row card-size control overlap.`);
    for (const item of comparable) {
      const prior = controlById.get(item.row_id);
      assert.ok(Math.abs(item.card.bbox_height - prior) <= 2, `${m.label}: card ${item.row_id} height changed from ${prior} to ${item.card.bbox_height} when only native height authority was restored.`);
    }
  }
}

async function verifySort(page) {
  const header = page.locator(`${scope} .ag-header-cell[col-id="gpp_case_card"]`).first();
  await header.click();
  await page.waitForTimeout(300);
  const sort1 = await header.getAttribute('aria-sort');
  await header.click();
  await page.waitForTimeout(300);
  const sort2 = await header.getAttribute('aria-sort');
  assert.ok(sort1 && sort2 && sort1 !== sort2, `Sorting did not toggle: ${sort1} -> ${sort2}`);
  return { first: sort1, second: sort2 };
}
async function verifyEntryLink(page) {
  const link = page.locator(`${scope} .ag-center-cols-container .ag-cell[col-id="gpp_case_card"] .gflow-inbox__entry-cell-link`).first();
  await link.waitFor({ state: 'attached', timeout: 15000 });
  const href = await link.getAttribute('href');
  assert.ok(href && href.includes('view=entry') && href.includes('id=') && href.includes('lid='), `Unexpected native Entry Detail href: ${href}`);
  return href;
}
async function clearSearch(page, expected = 20) {
  const search = page.locator(selectors.searchInput);
  await search.fill('');
  await search.dispatchEvent('keyup');
  await settleExact(page, expected);
}
async function search(page, query, expected) {
  const input = page.locator(selectors.searchInput);
  await input.fill('');
  await input.click();
  await input.pressSequentially(query);
  await settleExact(page, expected);
}
async function page2(page) {
  const next = page.locator(`${scope} [ref="btNext"]`);
  assert.equal(await next.count(), 1, 'Native next-page control missing.');
  assert.equal(await page.locator(`${scope} [ref="lbCurrent"]`).count(), 1, 'Native current-page label missing.');
  await next.click();
  await settleExact(page, 5);
}
async function page1(page) {
  const prev = page.locator(`${scope} [ref="btPrevious"]`);
  assert.equal(await prev.count(), 1, 'Native previous-page control missing.');
  await prev.click();
  await settleExact(page, 20);
}
async function readinessFallback(page) {
  await page.locator(`${scope} .gpp-inbox-card__readiness--ready`).first().evaluate(el => {
    el.classList.replace('gpp-inbox-card__readiness--ready', 'gpp-inbox-card__readiness--unready');
  });
  await page.waitForTimeout(350);
}
async function readinessRestore(page) {
  await page.locator(`${scope} .gpp-inbox-card__readiness--unready`).evaluate(el => {
    el.classList.replace('gpp-inbox-card__readiness--unready', 'gpp-inbox-card__readiness--ready');
  });
  await settleExact(page, 20);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));

const routes = {
  shortcode: fixture.frontend_inbox_url,
  block: p06.authentic_block_page.url,
};
const devices = {
  desktop: { width: 1440, height: 1000, columns: 2 },
  mobile: { width: 390, height: 844, columns: 1 },
};
const controls = new Map();

try {
  for (const [routeName, url] of Object.entries(routes)) {
    for (const [deviceName, device] of Object.entries(devices)) {
      const page = await context.newPage();
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.goto(url, { waitUntil: 'networkidle' });
      const rowCount = await stableRowCount(page);
      const m = await measure(page, `positive/${routeName}/${deviceName}`);
      m.stable_row_count = rowCount;
      report.positive_control.push(m);
      controls.set(`${routeName}/${deviceName}`, m);
      const clipperAuthority = gppImportantAuthorityRules(m.clipper);
      const containerAuthority = gppImportantAuthorityRules(m.container);
      assert.ok(clipperAuthority.some(rule => rule.property === 'height' && rule.value === 'auto'), `${m.label}: positive control did not observe PR87 clipper !important height override.`);
      assert.ok(containerAuthority.some(rule => rule.property === 'height' && rule.value === 'auto'), `${m.label}: positive control did not observe existing container !important height override.`);
      if (deviceName === 'desktop') assert.equal(rowCount, 5, `${m.label}: known 20->5 regression did not reproduce.`);
      await page.close();
    }
  }

  for (const [routeName, url] of Object.entries(routes)) {
    for (const [deviceName, device] of Object.entries(devices)) {
      const page = await context.newPage();
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.route('**/srwf-gravity-flow-inbox.css*', route => route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: counterfactualCss }));
      await page.goto(url, { waitUntil: 'networkidle' });
      await waitForGrid(page);
      await settleExact(page, 20);
      const key = `${routeName}/${deviceName}`;
      const control = controls.get(key);
      const entry = { route: routeName, device: deviceName, lifecycle: {}, geometry: {}, authority: {} };

      const fresh = await measure(page, `counterfactual/${key}/fresh-20`);
      assert.equal(fresh.inbox_width, control.inbox_width, `${fresh.label}: host/inbox width changed.`);
      assertComposition(fresh, 20, device.columns, control);
      entry.geometry.fresh = fresh;
      entry.authority.fresh = { container: fresh.container, clipper: fresh.clipper };
      entry.lifecycle.fresh_rows = 20;
      entry.lifecycle.sort = await verifySort(page);
      entry.lifecycle.entry_detail_href = await verifyEntryLink(page);

      await page2(page);
      const p2 = await measure(page, `counterfactual/${key}/page-2-5`);
      assertComposition(p2, 5, device.columns);
      entry.lifecycle.page_2_rows = 5;
      entry.geometry.page_2 = p2;

      await page1(page);
      const return20 = await measure(page, `counterfactual/${key}/return-20`);
      assertComposition(return20, 20, device.columns, control);
      entry.lifecycle.return_page_1_rows = 20;
      entry.geometry.return_page_1 = return20;

      await search(page, '00:24:00', 1);
      const one = await measure(page, `counterfactual/${key}/search-1`);
      assertComposition(one, 1, 1);
      entry.lifecycle.search_rows = 1;
      entry.geometry.search_1 = one;

      await clearSearch(page, 20);
      const clearOne = await measure(page, `counterfactual/${key}/search-clear-20`);
      assertComposition(clearOne, 20, device.columns, control);
      entry.lifecycle.clear_search_rows = 20;
      entry.geometry.search_clear = clearOne;

      await search(page, 'VISUAL-NO-RESULT-SYNTHETIC', 0);
      const empty = await measure(page, `counterfactual/${key}/empty-0`);
      assert.equal(empty.row_count, 0);
      assert.equal(empty.card_count, 0);
      assert.equal(empty.grid_count, 1);
      assert.equal(empty.pager_count, 1);
      assert.equal(empty.empty_visible, true);
      assert.ok(px(empty.clipper.computed_min_height) >= 500, `${empty.label}: native empty-state clipper minimum not restored: ${empty.clipper.computed_min_height}`);
      assertHostAuthority(empty.container, `${empty.label} container`);
      assertHostAuthority(empty.clipper, `${empty.label} clipper`);
      entry.lifecycle.empty_rows = 0;
      entry.geometry.empty = empty;

      await clearSearch(page, 20);
      const clearEmpty = await measure(page, `counterfactual/${key}/empty-clear-20`);
      assertComposition(clearEmpty, 20, device.columns, control);
      entry.lifecycle.clear_empty_rows = 20;
      entry.geometry.empty_clear = clearEmpty;

      const beforeFallback = await measure(page, `counterfactual/${key}/pre-fallback`);
      await readinessFallback(page);
      const fallback = await measure(page, `counterfactual/${key}/fallback-native`);
      assert.equal(fallback.card_count, 0, `${fallback.label}: Card Mode did not close.`);
      assertHostAuthority(fallback.container, `${fallback.label} container`);
      assertHostAuthority(fallback.clipper, `${fallback.label} clipper`);
      assert.equal(fallback.container.inline_height, beforeFallback.container.inline_height, `${fallback.label}: container inline height residue/mutation.`);
      assert.equal(fallback.clipper.inline_height, beforeFallback.clipper.inline_height, `${fallback.label}: clipper inline height residue/mutation.`);
      await readinessRestore(page);
      const restored = await measure(page, `counterfactual/${key}/readiness-restored-20`);
      assertComposition(restored, 20, device.columns, control);
      entry.lifecycle.readiness_fallback_native = true;
      entry.lifecycle.readiness_restored_rows = 20;
      entry.geometry.fallback = fallback;
      entry.geometry.readiness_restored = restored;

      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await settleExact(page, 20);
      const text200 = await measure(page, `counterfactual/${key}/root-font-200`);
      assertComposition(text200, 20, device.columns);
      entry.geometry.root_font_200 = text200;
      await page.evaluate(() => { document.documentElement.style.removeProperty('font-size'); });
      await settleExact(page, 20);

      await search(page, 'WU21 Refresh Student', 0);
      const dynamicId = wpControl('add');
      await settleExact(page, 1, 45000);
      const addedText = await page.locator(rowsSelector).first().innerText();
      assert.ok(addedText.includes('WU21 Refresh Student'), `${key}: native polling did not add synthetic refresh task.`);
      wpControl('remove');
      await settleExact(page, 0, 45000);
      entry.lifecycle.polling_refresh = { add_observed: true, remove_observed: true, dynamic_entry_id: Number(dynamicId) };
      await clearSearch(page, 20);

      assert.equal(await page.locator('[data-gpp-inbox-manual-refresh]').count(), 1, `${key}: manual refresh control count.`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.locator('[data-gpp-inbox-manual-refresh]').click(),
      ]);
      await settleExact(page, 20);
      const manual = await measure(page, `counterfactual/${key}/manual-refresh-20`);
      assertComposition(manual, 20, device.columns, control);
      entry.lifecycle.manual_refresh_rows = 20;
      entry.geometry.manual_refresh = manual;

      report.counterfactual.push(entry);
      await page.close();
    }
  }

  report.status = 'PASS';
  report.conclusion = 'REPAIR_METHOD_ESTABLISHED';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error?.stack || error);
  const lifecycleFailures = /row count|rows|polling|Sorting|Entry Detail|native grid|native pager/i.test(report.error);
  report.conclusion = lifecycleFailures ? 'NATIVE_HEIGHT_RESTORATION_FALSIFIED' : 'NATIVE_HEIGHT_RESTORATION_INSUFFICIENT';
  throw error;
} finally {
  fs.writeFileSync(path.join(artifactDir, 'native-height-restoration-experiment.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log(`NATIVE_HEIGHT_RESTORATION_EXPERIMENT=${report.status}`);
  console.log(`NATIVE_HEIGHT_RESTORATION_CONCLUSION=${report.conclusion}`);
}
