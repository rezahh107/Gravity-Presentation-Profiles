import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

/**
 * Native Gravity Flow 3.1.0 Inbox / 501-task qualification.
 * DO NOT use on a production site. Run only AFTER operational-browser.mjs
 * in the disposable WU21 GitHub Actions job for PR #171's isolated prototype.
 * This tests the actual Gravity Flow Native Inbox, NOT Inbox 2.
 */
const env = process.env;
const base = env.WU21_BASE_URL;
const out = env.WU21_ARTIFACT_DIR;
const wpPath = env.WU21_WP_PATH;
assert.equal(base, 'http://127.0.0.1:8080', 'Disposable WU21 endpoint only');
assert.equal(wpPath, '/tmp/wu21-wordpress', 'Disposable WordPress path only');
assert.equal(env.GITHUB_REPOSITORY, 'rezahh107/Gravity-Presentation-Profiles');
assert.ok(out?.startsWith('/tmp/wu21-artifacts'));
const f = JSON.parse(fs.readFileSync(path.join(out, 'ciq2-operational-fixture.json'), 'utf8'));
assert.equal(f.ids.length, 501, 'Historical fixture must have exactly 501 original tasks');
const target = Number(f.synthetic[2]); // Stable older synthetic task, not the two transitioned tasks.
assert.ok(Number.isSafeInteger(target) && target > 0);
const targetName = 'سیمرغ۵۰۱یگانه';
const expectedSha = 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404';
const packageSha = crypto.createHash('sha256').update(fs.readFileSync(env.WU21_FLOW_ZIP)).digest('hex');
assert.equal(packageSha, expectedSha, 'The pinned Gravity Flow package differs');

const report = {
  head: env.GPP_WU21_REPOSITORY_SHA,
  packageSHA256: packageSha,
  status: 'RUNNING',
  scope: 'ephemeral WU21 / synthetic tasks / Native Gravity Flow 3.1.0',
  target, targetName, cases: [], checks: [],
  limits: [
    'Grid rowData is an internal Gravity Flow/AG Grid implementation detail.',
    'A pinned Chromium test does not prove all physical devices, Persian IMEs or production.',
    'A newly loaded Native Inbox does not prove background refresh of an already open tab.',
  ],
};
const reportPath = path.join(out, 'native-501-search-qualification.json');
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const sorted = ids => [...ids].map(Number).sort((a, b) => a - b);
const unique = ids => new Set(ids).size === ids.length;
function wp(code) {
  const result = spawnSync('php', [env.WU21_WP_CLI, '--path=' + wpPath, 'eval', code], {
    encoding: 'utf8', env, timeout: 120000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

// Both independent host-side surfaces must agree before inspecting browser data.
function serverOracle() {
  const code =
    'wp_set_current_user(' + Number(f.officer) + ');' +
    "require_once WP_PLUGIN_DIR.'/gravity-presentation-profiles/tests/qualification-custom-inbox/cell-boundary.php';" +
    "$s=['form_id'=>" + Number(f.form_id) + "];" +
    '$public=ciq_entries($s);' +
    "if(is_wp_error($public)||!is_array($public))throw new RuntimeException('public_query_failed');" +
    '$p=array_map("intval",array_column($public,"id"));$n=[];' +
    'for($o=0;$o<count($p);$o+=40){' +
      '$rows=cellq_model()->get_inbox_tasks(cellq_args($s,$o,40));' +
      "if(!is_array($rows)||count($rows)>40)throw new RuntimeException('native_batch_invalid');" +
      'foreach($rows as $row){$n[]=(int)($row["id"]??0);}}' +
    '$total=0;$args=apply_filters("gravityflow_inbox_args",' +
      'array_merge(Gravity_Flow_Inbox::get_defaults(),$s,' +
      '["paging"=>["offset"=>0,"page_size"=>1]]));' +
    'Gravity_Flow_API::get_inbox_entries($args,$total);' +
    '$fx=get_option("cellq_fixture",[]);' +
    'echo wp_json_encode(["public"=>$p,"native"=>$n,"total"=>(int)$total,' +
      '"native_url"=>$fx["native_url"]??""]);';
  return JSON.parse(wp(code));
}
function assertServerOracle(oracle, expected) {
  assert.equal(oracle.total, expected, 'Host public task total mismatch');
  for (const key of ['public', 'native']) {
    assert.equal(oracle[key].length, expected, key + ' task count');
    assert.ok(unique(oracle[key]), key + ' has duplicate IDs');
    assert.ok(oracle[key].every(id => Number.isSafeInteger(id) && id > 0));
  }
  assert.deepEqual(sorted(oracle.public), sorted(oracle.native), 'Host public/native task IDs differ');
}

save();
let before;
try {
  before = serverOracle();
  assertServerOracle(before, 501); // Fail if operational-browser did not finish at 501.
  assert.ok(before.public.includes(target), 'Older Persian target is not currently authorized');
  assert.ok(before.native_url.startsWith(base + '/'), 'Unexpected Native page URL');
  report.oracleBefore = {count: before.public.length, ids: sorted(before.public)};
  report.checks.push('501_public_and_native_task_model_oracle_exact');
  save();
} catch (error) {
  report.status = 'PRECHECK_FAILED_NOT_PROVEN';
  report.error = String(error.stack || error);
  save();
  throw error;
}

// Use the same already-established synthetic-user authentication fixture as
// operational-browser.mjs. Never receive a credential or token from a user.
const authCode = '$u=get_user_by("id",' + Number(f.officer) + ');' +
  'if(!$u)throw new RuntimeException("synthetic_officer_missing");' +
  '$exp=time()+3600;echo wp_json_encode([' +
    '["name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$exp,"auth")],' +
    '["name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$exp,"logged_in")]]);';
const authCookies = JSON.parse(wp(authCode)).map(c => ({...c, url: base}));

function nativeGridSnapshot() {
  const root = document.querySelector('[data-js="gflow-inbox"]');
  const config = window.gflow_config?.grids?.[root?.dataset.gridId]?.grid_options;
  const data = config?.rowData;
  const rows = [...(root?.querySelectorAll('.ag-center-cols-container .ag-row[row-id]') ?? [])];
  return {
    found: !!root,
    hasRowData: Array.isArray(data),
    ids: Array.isArray(data) ? data.map(row => Number(row.id)) : [],
    renderedIds: rows.map(row => Number(row.getAttribute('row-id'))),
    paginationLabel: root?.querySelector('[ref=lbCurrent]')?.textContent?.trim() ?? null,
  };
}
async function readGrid(page, oracle) {
  const state = await page.evaluate(nativeGridSnapshot);
  assert.ok(state.found, 'Native Inbox not found in page');
  assert.ok(state.hasRowData, 'Native Grid rowData unavailable: NOT_PROVEN');
  assert.equal(state.ids.length, oracle.length, 'Native Grid omitted or added authorized tasks');
  assert.ok(unique(state.ids), 'Native Grid duplicated task IDs');
  assert.deepEqual(sorted(state.ids), sorted(oracle), 'Native Grid differs from independent server oracle');
  return {rowCount: state.ids.length, renderedCount: state.renderedIds.length,
    renderedIds: state.renderedIds, paginationLabel: state.paginationLabel};
}
async function visibleIds(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')
    .evaluateAll(rows => rows.map(row => Number(row.getAttribute('row-id'))));
}
async function waitIds(page, expected) {
  await page.waitForFunction(ids => {
    const rows = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')];
    return rows.length === ids.length && rows.every((row, i) => Number(row.getAttribute('row-id')) === ids[i]);
  }, expected, {timeout: 20000});
}

let browser;
try {
  // Change only synthetic entry contents in /tmp/WU21 DB. Task identity and
  // assignment remain unchanged, enabling unique Persian cross-page search.
  wp('wp_set_current_user(' + Number(f.admin) + ');' +
    '$entry=GFAPI::get_entry(' + target + ');' +
    'if(is_wp_error($entry))throw new RuntimeException("synthetic_entry_missing");' +
    '$entry["1"]="' + targetName + '";' +
    '$r=GFAPI::update_entry($entry);' +
    'if(is_wp_error($r)||$r===false)throw new RuntimeException("synthetic_name_update_failed");');
  assert.equal(wp('$e=GFAPI::get_entry(' + target + ');' +
    'if(is_wp_error($e))throw new RuntimeException("target_missing");' +
    'echo (string)($e["1"]??"");'), targetName);
  assertServerOracle(serverOracle(), 501);
  report.checks.push('unique_synthetic_persian_label_persisted');

  // Read-only instrumentation for ephemeral WordPress HTTP requests.
  const instrumentation = [
    '<?php',
    "if (!defined('ABSPATH') || getenv('WU21_BASE_URL') !== 'http://127.0.0.1:8080') return;",
    "if (PHP_SAPI !== 'cli-server') return;",
    "add_action('shutdown', static function () {",
    'global $wpdb;',
    "$row = ['path' => parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH),",
    "'queryCount' => (int)$wpdb->num_queries, 'peakMemoryBytes' => memory_get_peak_usage(true),",
    "'status' => http_response_code()];",
    "file_put_contents(getenv('WU21_ARTIFACT_DIR').'/native-501-http-metrics.ndjson',",
    'wp_json_encode($row).PHP_EOL, FILE_APPEND|LOCK_EX);',
    '}, 999);',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(wpPath, 'wp-content/mu-plugins/native-501-metrics.php'), instrumentation);

  browser = await chromium.launch({headless: true});
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({viewport: {width, height: 900}});
    await ctx.addCookies(authCookies);
    const page = await ctx.newPage();
    const relevantRequests = [], relevantResponses = [], jsErrors = [];
    page.on('pageerror', error => jsErrors.push(String(error)));
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.hostname === '127.0.0.1' && /wp-json|admin-ajax|gravityflow|admin\.php/.test(url.pathname)) {
        relevantRequests.push({method: req.method(), path: url.pathname});
      }
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.hostname === '127.0.0.1' && /wp-json|admin-ajax|gravityflow|admin\.php/.test(url.pathname)) {
        relevantResponses.push({path: url.pathname, status: response.status(),
          size: response.headers()['content-length'] ?? null});
      }
    });

    const loadStart = Date.now();
    const reply = await page.goto(before.native_url, {waitUntil: 'networkidle', timeout: 120000});
    assert.equal(reply.status(), 200);
    await page.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state: 'attached', timeout: 45000});
    const loadMs = Date.now() - loadStart;
    const initial = await readGrid(page, before.public);
    assert.equal(initial.renderedIds.length, 20, 'Native page should show 20 rows');
    assert.ok(!initial.renderedIds.includes(target), 'Target must be beyond the first 20 rows');
    const outcome = {width, loadMs, initial, initialRequests: relevantRequests.slice(),
      initialResponses: relevantResponses.slice(), jsErrors};

    const input = page.locator('[data-js="gflow-inbox-search"]');
    assert.equal(await input.count(), 1, 'Expected one real Native Search field');
    await page.evaluate(() => {
      window.__native501EventTrace = [];
      const control = document.querySelector('[data-js="gflow-inbox-search"]');
      for (const name of ['keydown', 'keyup', 'input', 'search']) {
        control.addEventListener(name, event => {
          window.__native501EventTrace.push({type: event.type,
            key: event.key || null, trusted: event.isTrusted});
        }, true);
      }
    });
    const networkStart = relevantRequests.length;
    await input.fill('');
    await input.pressSequentially(targetName, {delay: 25});
    await page.waitForTimeout(700);
    outcome.afterTyping = await visibleIds(page);
    outcome.typingFoundTarget = outcome.afterTyping.length === 1 && outcome.afterTyping[0] === target;
    await input.press('Enter');
    await page.waitForTimeout(700);
    outcome.afterEnter = await visibleIds(page);
    outcome.enterFoundTarget = outcome.afterEnter.length === 1 && outcome.afterEnter[0] === target;
    assert.equal(await input.inputValue(), targetName);
    const quickStart = Date.now();
    await input.dispatchEvent('keyup'); // Explicit diagnostic control, not claimed to be human typing.
    await waitIds(page, [target]);
    outcome.quickFilterControlMs = Date.now() - quickStart;
    outcome.quickFilterFoundTarget = true;
    outcome.eventTrace = await page.evaluate(() => window.__native501EventTrace);
    outcome.searchRequests = relevantRequests.slice(networkStart);
    const link = page.locator('[data-js="gflow-inbox"] .ag-row[row-id="' + target + '"] a[data-js="inbox-details-link"]').first();
    const href = await link.getAttribute('href');
    assert.equal(new URL(href, base).searchParams.get('lid'), String(target));
    await link.click();
    await page.waitForLoadState('domcontentloaded');
    outcome.detailUrlPath = new URL(page.url()).pathname;
    await page.goBack({waitUntil: 'domcontentloaded', timeout: 60000});
    const afterBack = page.locator('[data-js="gflow-inbox-search"]');
    await afterBack.waitFor({state: 'attached'});
    outcome.queryAfterBack = await afterBack.inputValue();

    await afterBack.fill('NO_MATCH_SYNTHETIC_NATIVE_501_92841');
    await afterBack.dispatchEvent('keyup');
    await waitIds(page, []);
    outcome.negativeMatches = await visibleIds(page);
    await afterBack.fill('');
    await afterBack.dispatchEvent('keyup');
    await page.waitForFunction(() => document.querySelectorAll(
      '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').length === 20,
    null, {timeout: 20000});
    outcome.resetCount = (await visibleIds(page)).length;
    assert.equal(outcome.resetCount, 20);
    const navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation').at(-1);
      return entry ? {durationMs: entry.duration, transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize} : null;
    });
    outcome.navigation = navigation;
    outcome.browserHeap = await page.evaluate(() =>
      performance.memory?.usedJSHeapSize ?? null);
    await page.screenshot({path: path.join(out, 'native-501-' + width + '.png'), fullPage: false});
    report.cases.push(outcome);
    report.checks.push('native_501_exact_grid_cross_page_persian_and_entry_detail_' + width);
    save();
    await ctx.close();
  }

  // Exercise a genuine task transition, then query a fresh Native page. This
  // is not evidence of automatic live refresh in an already-open Native tab.
  wp('wp_set_current_user(' + Number(f.admin) + ');' +
    '$entry=GFAPI::get_entry(' + target + ');' +
    '$api=new Gravity_Flow_API(' + Number(f.form_id) + ');' +
    '$res=$api->send_to_step($entry,' + Number(f.next_step) + ');' +
    'if(is_wp_error($res)||$res===false)throw new RuntimeException("synthetic_transition_failed");');
  const after = serverOracle();
  assertServerOracle(after, 500);
  assert.ok(!after.public.includes(target), 'Transitioned task still assigned to officer');
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  await ctx.addCookies(authCookies);
  const page = await ctx.newPage();
  const response = await page.goto(after.native_url, {waitUntil: 'networkidle', timeout: 120000});
  assert.equal(response.status(), 200);
  await page.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state: 'attached'});
  report.afterTransition = await readGrid(page, after.public);
  report.afterTransition.taskCount = after.public.length;
  report.checks.push('fresh_native_500_grid_after_real_step_transition');
  await ctx.close();

  const metricsPath = path.join(out, 'native-501-http-metrics.ndjson');
  report.httpMetrics = fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, 'utf8')
    .split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  report.status = 'PASS_ISOLATED_NATIVE_501';
  save();
  console.log('NATIVE_501_QUALIFICATION_PASS ' + report.checks.length);
} catch (error) {
  report.status = 'FAIL_OR_NOT_PROVEN_REQUIRES_TRIAGE';
  report.error = String(error.stack || error);
  save();
  throw error;
} finally {
  if (browser) await browser.close();
  save();
}
