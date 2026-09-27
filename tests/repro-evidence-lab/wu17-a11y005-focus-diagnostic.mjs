import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const scope = '[data-gpp-inbox-surface="gravity_flow.inbox"]';
const rows = `${scope} .ag-center-cols-container > .ag-row`;

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const cookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) throw new RuntimeException('bootstrap_admin unavailable');
$expiration = time() + 600;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
));
`));
if (!manifest?.frontend_inbox_url) throw new Error('frontend Inbox fixture missing');

async function openFresh(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
  const page = await context.newPage();
  await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
  await page.waitForSelector(`${scope} [data-js="gflow-inbox"] .ag-root-wrapper`, { timeout: 30000 });
  return { context, page };
}

async function active(page) {
  return page.evaluate(scopeSelector => {
    const e = document.activeElement;
    if (!(e instanceof Element)) return { tag: null, insideSurface: false };
    const header = e.closest('.ag-header-cell');
    const cell = e.closest('.ag-cell');
    const grid = e.closest('.ag-root-wrapper');
    const toolbar = e.closest('[data-gpp-inbox-toolbar]');
    const inbox = e.closest('[data-js="gflow-inbox"]');
    const pager = e.closest('.ag-paging-panel');
    const cls = typeof e.className === 'string' ? e.className : '';
    const dataJs = e.getAttribute('data-js');
    const ref = e.getAttribute('ref');
    return {
      tag: e.tagName,
      id: e.id || null,
      class: cls || null,
      tabindexAttribute: e.getAttribute('tabindex'),
      effectiveTabIndex: e.tabIndex,
      role: e.getAttribute('role'),
      dataJs,
      ref,
      accessibleNameSources: {
        ariaLabel: e.getAttribute('aria-label'),
        title: e.getAttribute('title'),
        placeholder: e.getAttribute('placeholder'),
        ariaLabelledby: e.getAttribute('aria-labelledby'),
        textContent: (e.textContent || '').trim().slice(0, 220) || null,
      },
      insideSurface: Boolean(e.closest(scopeSelector)),
      insideToolbar: Boolean(toolbar),
      insideInbox: Boolean(inbox),
      insideGrid: Boolean(grid),
      headerColId: header?.getAttribute('col-id') ?? null,
      cellColId: cell?.getAttribute('col-id') ?? null,
      rowIndex: cell?.closest('.ag-row')?.getAttribute('row-index') ?? null,
      classifiers: {
        search: dataJs === 'gflow-inbox-search',
        manualRefresh: e.matches('[data-gpp-inbox-manual-refresh]') || Boolean(e.closest('[data-gpp-inbox-manual-refresh]')),
        settings: dataJs === 'inbox-settings' || Boolean(e.closest('[data-js="inbox-settings"]')),
        tabGuard: cls.includes('ag-tab-guard') || Boolean(e.closest('.ag-tab-guard')),
        header: Boolean(header),
        cell: Boolean(cell),
        pager: Boolean(pager),
        pagerControl: Boolean(pager) && ['btPrevious','btNext'].includes(ref),
        external: !e.closest(scopeSelector),
      },
    };
  }, scope);
}

async function installFocusLog(page) {
  await page.evaluate(scopeSelector => {
    window.__wu17FocusLog = [];
    document.addEventListener('focusin', event => {
      const e = event.target;
      if (!(e instanceof Element)) return;
      const h = e.closest('.ag-header-cell');
      const c = e.closest('.ag-cell');
      window.__wu17FocusLog.push({
        n: window.__wu17FocusLog.length + 1,
        tag: e.tagName,
        id: e.id || null,
        class: typeof e.className === 'string' ? e.className : null,
        tabindexAttribute: e.getAttribute('tabindex'),
        effectiveTabIndex: e.tabIndex,
        role: e.getAttribute('role'),
        dataJs: e.getAttribute('data-js'),
        ref: e.getAttribute('ref'),
        insideSurface: Boolean(e.closest(scopeSelector)),
        insideToolbar: Boolean(e.closest('[data-gpp-inbox-toolbar]')),
        insideGrid: Boolean(e.closest('.ag-root-wrapper')),
        headerColId: h?.getAttribute('col-id') ?? null,
        cellColId: c?.getAttribute('col-id') ?? null,
        rowIndex: c?.closest('.ag-row')?.getAttribute('row-index') ?? null,
      });
    }, true);
  }, scope);
}

async function inventory(page) {
  return page.evaluate(scopeSelector => {
    const surface = document.querySelector(scopeSelector);
    const all = [...document.querySelectorAll('*')];
    const visible = e => {
      if (!(e instanceof Element)) return false;
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const item = (name, e) => !e ? { name, missing: true } : {
      name, tag: e.tagName, id: e.id || null,
      class: typeof e.className === 'string' ? e.className : null,
      tabindexAttribute: e.getAttribute('tabindex'), effectiveTabIndex: e.tabIndex,
      role: e.getAttribute('role'), dataJs: e.getAttribute('data-js'), ref: e.getAttribute('ref'),
      colId: e.getAttribute('col-id'), rowIndex: e.getAttribute('row-index') ?? e.closest('.ag-row')?.getAttribute('row-index') ?? null,
      visible: visible(e), ariaDisabled: e.getAttribute('aria-disabled'), disabled: e.matches(':disabled'), documentOrder: all.indexOf(e),
    };
    const grid = surface?.querySelector('.ag-root-wrapper');
    const guards = [...new Set([...(grid?.querySelectorAll('.ag-tab-guard') || []), ...(grid?.querySelectorAll('[class*="tab-guard"]') || []), ...(grid?.querySelectorAll('[class*="focus-guard"]') || [])])];
    return {
      toolbar: item('toolbar', surface?.querySelector('[data-gpp-inbox-toolbar]')),
      search: item('search', surface?.querySelector('[data-js="gflow-inbox-search"]')),
      manualRefresh: item('manualRefresh', surface?.querySelector('[data-gpp-inbox-manual-refresh]')),
      settings: item('settings', surface?.querySelector('[data-js="inbox-settings"]')),
      gridRoot: item('gridRoot', grid),
      guards: guards.map((e, i) => item(`guard-${i + 1}`, e)),
      allGridTabindexNodes: [...(grid?.querySelectorAll('[tabindex]') || [])].map((e, i) => item(`tabindex-${i + 1}`, e)),
      presentationHeader: item('presentationHeader', surface?.querySelector('.ag-header-cell[col-id="gpp_case_card"]')),
      firstPresentationCell: item('firstPresentationCell', surface?.querySelector('.ag-cell[col-id="gpp_case_card"]')),
      previous: item('previous', surface?.querySelector('[ref="btPrevious"]')),
      next: item('next', surface?.querySelector('[ref="btNext"]')),
      domOrder: [...(surface?.querySelectorAll('[data-gpp-inbox-toolbar], [data-js="gflow-inbox-search"], [data-gpp-inbox-manual-refresh], [data-js="inbox-settings"], .ag-root-wrapper, .ag-tab-guard, .ag-header-cell[col-id="gpp_case_card"], .ag-cell[col-id="gpp_case_card"], [ref="btPrevious"], [ref="btNext"]') || [])].map((e, i) => item(`order-${i + 1}`, e)),
    };
  }, scope);
}

async function waitRows(page, n) {
  await page.waitForFunction(({ selector, n }) => document.querySelectorAll(selector).length === n, { selector: rows, n }, { timeout: 15000 });
}

async function runStage001(page) {
  try {
    const mod = await import('./inbox-composition-assertions.mjs');
    if (typeof mod.exerciseInboxComposition !== 'function') return { available: false };
    await mod.exerciseInboxComposition(page, manifest.frontend_inbox_url);
    await mod.exerciseNativeInboxActions(page, manifest.frontend_inbox_url);
    await mod.exerciseNativePushPreference(page, manifest.frontend_inbox_url);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
    await page.waitForSelector(`${scope} .ag-root-wrapper`, { timeout: 30000 });
    return { available: true };
  } catch (error) {
    if (String(error?.message || '').includes('Cannot find module')) return { available: false, reason: 'helpers_missing' };
    throw error;
  }
}

async function runStage002(page) {
  const search = page.locator(`${scope} [data-js="gflow-inbox-search"]`);
  await search.focus(); await page.keyboard.type('00:24:00'); await waitRows(page, 1);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await waitRows(page, 20);
  return { filtered: 1, restored: 20 };
}

async function runStage003(page) {
  if (await page.locator(`${scope} [data-gpp-inbox-toolbar]`).count() !== 1) return { available: false };
  const search = page.locator(`${scope} [data-js="gflow-inbox-search"]`);
  await search.focus();
  const path = [];
  for (let i = 1; i <= 16; i++) {
    await page.keyboard.press('Tab'); const s = await active(page); path.push({ tab: i, state: s });
    if (s.classifiers?.settings) return { available: true, reachedSettingsInTabs: i, path };
    if (!s.insideSurface) break;
  }
  return { available: true, reachedSettingsInTabs: null, path };
}

async function runStage004(page) {
  const previous = page.locator(`${scope} [ref="btPrevious"]`), next = page.locator(`${scope} [ref="btNext"]`), current = page.locator(`${scope} [ref="lbCurrent"]`);
  const start = (await current.innerText()).trim();
  await next.focus(); await page.keyboard.press('Enter'); await waitRows(page, 5); const p2 = (await current.innerText()).trim();
  await previous.focus(); await page.keyboard.press('Enter'); await waitRows(page, 20); const p1 = (await current.innerText()).trim();
  return { sequence: [start, p2, p1] };
}

async function naturalJourney(page) {
  await installFocusLog(page);
  const search = page.locator(`${scope} [data-js="gflow-inbox-search"]`);
  await search.focus();
  const initial = await active(page), tabs = [];
  let entry = null, exit = null;
  for (let i = 1; i <= 80; i++) {
    await page.keyboard.press('Tab'); const s = await active(page); tabs.push({ step: i, state: s });
    if (s.headerColId || s.cellColId) { entry = { step: i, state: s }; break; }
    if (!s.insideSurface) { exit = { step: i, state: s, reason: 'left_inbox' }; break; }
  }
  if (!entry && !exit) exit = { step: 80, state: await active(page), reason: 'safety_cap_with_location' };

  const completion = { reachedPresentationHeader: false, reachedPresentationCell: false, enterNavigated: false, moves: [] };
  if (entry) {
    let s = entry.state;
    if (s.headerColId && s.headerColId !== 'gpp_case_card') {
      for (const key of ['ArrowRight','ArrowLeft']) {
        for (let i = 1; i <= 16 && s.headerColId !== 'gpp_case_card'; i++) {
          await page.keyboard.press(key); s = await active(page); completion.moves.push({ key, i, state: s });
          if (!s.insideSurface) break;
        }
        if (s.headerColId === 'gpp_case_card' || !s.insideSurface) break;
      }
    }
    if (s.headerColId === 'gpp_case_card') {
      completion.reachedPresentationHeader = true;
      await page.keyboard.press('ArrowDown'); s = await active(page); completion.moves.push({ key: 'ArrowDown', state: s });
    }
    if (s.cellColId && s.cellColId !== 'gpp_case_card') {
      for (const key of ['ArrowRight','ArrowLeft']) {
        for (let i = 1; i <= 16 && s.cellColId !== 'gpp_case_card'; i++) {
          await page.keyboard.press(key); s = await active(page); completion.moves.push({ key, i, state: s });
          if (!s.insideSurface) break;
        }
        if (s.cellColId === 'gpp_case_card' || !s.insideSurface) break;
      }
    }
    if (s.cellColId === 'gpp_case_card') {
      completion.reachedPresentationCell = true;
      completion.nativeFocusedClass = await page.evaluate(() => document.activeElement?.closest?.('.ag-cell[col-id="gpp_case_card"]')?.classList.contains('ag-cell-focus') ?? false);
      const link = page.locator(`${scope} .ag-cell[col-id="gpp_case_card"].ag-cell-focus .gflow-inbox__entry-cell-link`).first();
      if (await link.count() === 1) {
        completion.href = await link.getAttribute('href'); completion.linkTabIndex = await link.getAttribute('tabindex');
        if (completion.href) {
          const expected = new URL(completion.href, page.url()).href;
          try { await Promise.all([page.waitForURL(url => url.href === expected, { timeout: 15000 }), page.keyboard.press('Enter')]); completion.enterNavigated = true; completion.afterUrl = page.url(); }
          catch (error) { completion.enterError = String(error?.message || error); completion.afterUrl = page.url(); }
        }
      }
    }
  }
  return { initial, tabTransitions: tabs, entry, exit, focusinTransitions: await page.evaluate(() => window.__wu17FocusLog || []), completion };
}

async function scenario(browser, label, stages) {
  const { context, page } = await openFresh(browser);
  try {
    const applied = {};
    for (const n of stages) {
      if (n === 1) applied.a11y001 = await runStage001(page);
      if (n === 2) applied.a11y002 = await runStage002(page);
      if (n === 3) applied.a11y003 = await runStage003(page);
      if (n === 4) applied.a11y004 = await runStage004(page);
    }
    return { label, stages, applied, inventory: await inventory(page), journey: await naturalJourney(page) };
  } catch (error) {
    return { label, stages, error: String(error?.stack || error), inventory: await inventory(page).catch(() => null), active: await active(page).catch(() => null) };
  } finally { await context.close(); }
}

const browser = await chromium.launch({ headless: true });
const evidence = { kind: 'WU17-A11Y-005 focus qualification', repositorySha: process.env.GITHUB_SHA || null, generatedAtUtc: new Date().toISOString(), scenarios: [] };
try {
  const isolated = await scenario(browser, 'isolated_fresh_a11y005', []); evidence.scenarios.push(isolated);
  const hasToolbar = isolated?.inventory?.toolbar && !isolated.inventory.toolbar.missing;
  evidence.pr100ToolbarDetected = Boolean(hasToolbar);
  if (hasToolbar) {
    evidence.scenarios.push(await scenario(browser, 'after_a11y001', [1]));
    evidence.scenarios.push(await scenario(browser, 'after_a11y001_002', [1,2]));
    evidence.scenarios.push(await scenario(browser, 'after_a11y001_002_003', [1,2,3]));
    evidence.scenarios.push(await scenario(browser, 'after_a11y001_002_003_004', [1,2,3,4]));
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(artifactDir, 'wu17-a11y005-focus-diagnostic.json'), JSON.stringify(evidence, null, 2) + '\n');
process.stdout.write(`WU17_A11Y005_DIAGNOSTIC=${JSON.stringify(evidence.scenarios.map(s => ({ label:s.label, error:s.error||null, tabs:s.journey?.tabTransitions?.length??null, entry:s.journey?.entry?.state?.headerColId||s.journey?.entry?.state?.cellColId||null, exit:s.journey?.exit?.reason||null, header:s.journey?.completion?.reachedPresentationHeader??false, cell:s.journey?.completion?.reachedPresentationCell??false, enter:s.journey?.completion?.enterNavigated??false })))}\n`);
