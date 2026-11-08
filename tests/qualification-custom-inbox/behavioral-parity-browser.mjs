import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

// Read-only observations on the real, isolated, pinned WU21 WordPress host.
// Expected IDs and FIFO originate in behavioral-parity-oracle.php, never Inbox 2.
const env = process.env;
const phase = env.CIQ2_PARITY_PHASE;
const mutation = env.CIQ2_PARITY_MUTATION || '';
const artifactDir = env.WU21_ARTIFACT_DIR;
const output = path.join(artifactDir, 'ciq2-parity-browser-' + phase +
  (mutation ? '-mutated' : '') + '.json');
const report = {
  status: 'RUNNING', phase, mutation: mutation || null,
  head: env.GPP_WU21_REPOSITORY_SHA, base_sha: env.CIQ2_PARITY_BASE_SHA,
  assertions: [], oracle: 'independent authenticated host facts from PHP/Gravity Flow',
};
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2));
const pass = name => { report.assertions.push({name, status: 'PASS'}); save(); };
const same = (actual, expected, name) => {
  assert.deepEqual(actual, expected, name);
  pass(name);
};
function wp(code) {
  const run = spawnSync('php', [env.WU21_WP_CLI, '--path=' + env.WU21_WP_PATH, 'eval', code],
    {encoding: 'utf8', env, timeout: 60000});
  assert.equal(run.status, 0, 'WP-CLI authentication setup failed: ' + (run.stderr || run.stdout));
  return run.stdout.trim();
}
function cookies(uid) {
  const code = '$u=get_user_by("id",' + uid + ');$e=time()+1800;' +
    'if(!$u)throw new RuntimeException("missing_fixture_actor");' +
    'echo wp_json_encode([["name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"auth")],' +
    '["name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"logged_in")]]);';
  return JSON.parse(wp(code)).map(c => ({...c, url: env.WU21_BASE_URL}));
}
const sortIds = ids => [...ids].sort((a, b) => a - b);
function assertIds(ids, label) {
  assert.ok(ids.every(id => Number.isSafeInteger(id) && id > 0), label + '_invalid_ids');
  assert.equal(new Set(ids).size, ids.length, label + '_duplicate_ids');
}
async function open(ctx, url) {
  const page = await ctx.newPage();
  const response = await page.goto(url, {waitUntil: 'networkidle', timeout: 60000});
  assert.equal(response.status(), 200, 'unexpected_http_status_at_' + url.split('/').at(-1));
  return page;
}
async function nativeObservation(page, expectedCount) {
  const selector = '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]';
  if (expectedCount) {
    await page.locator('[data-js="gflow-inbox"]').waitFor({state: 'attached'});
    await page.waitForFunction(({selector, expectedCount}) =>
      document.querySelectorAll(selector).length === expectedCount,
      {selector, expectedCount}, {timeout: 30000});
  }
  const rows = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const id = Number(node.getAttribute('row-id'));
    const link = node.querySelector('a[data-js="inbox-details-link"]');
    return {id, href: link?.getAttribute('href') || null};
  }));
  assertIds(rows.map(r => r.id), 'native');
  return rows;
}
async function inbox2Observation(page) {
  const root = page.locator('[data-ciq2-root]');
  await root.waitFor({state: 'attached'});
  assert.equal(await root.getAttribute('data-ciq2-state'), 'current',
    'candidate_is_not_in_verified_current_state');
  const rows = await page.locator('[data-ciq2-entry]').evaluateAll(nodes => nodes.map(node => {
    const link = node.querySelector('a[data-ciq2-detail]');
    return {id: Number(node.dataset.ciq2Entry), href: link?.getAttribute('href') || null};
  }));
  assertIds(rows.map(r => r.id), 'inbox2');
  assert.ok(!(await page.content()).includes('CQ_SECRET_DO_NOT_EXPOSE_'),
    'unlisted_synthetic_private_field_leaked');
  return rows;
}
let browser;
try {
  assert.equal(env.WU21_BASE_URL, 'http://127.0.0.1:8080', 'non_disposable_browser_target');
  assert.equal(env.CIQ2_SCENARIO, 'return-fifo', 'wrong_ci_scenario');
  assert.ok(['initial', 'after-usability', 'after-native'].includes(phase), 'invalid_phase');
  assert.ok(['', 'drop-first'].includes(mutation), 'unrecognized_mutation');
  const f = JSON.parse(fs.readFileSync(path.join(artifactDir, 'ciq2-browser-fixture.json'), 'utf8'));
  const oracle = JSON.parse(fs.readFileSync(path.join(artifactDir, 'ciq2-parity-oracle-' + phase + '.json'), 'utf8'));
  assert.equal(oracle.status, 'PASS_INDEPENDENT_HOST_ORACLE', 'PARITY_MISSING_REQUIRED_ORACLE');
  assert.equal(oracle.head, env.GPP_WU21_REPOSITORY_SHA, 'PARITY_ORACLE_HEAD_MISMATCH');
  assert.equal(oracle.base_sha, env.CIQ2_PARITY_BASE_SHA, 'PARITY_ORACLE_BASE_MISMATCH');
  assert.equal(f.head, oracle.head, 'PARITY_FIXTURE_HEAD_MISMATCH');
  assert.ok(Array.isArray(oracle.expected_fifo_ids), 'PARITY_FIFO_EXPECTATION_MISSING');
  assert.ok(oracle.roles?.officer && oracle.roles?.viewer, 'PARITY_ROLE_ORACLE_MISSING');
  report.versions = oracle.versions;
  report.oracle_provenance = oracle.oracle_provenance;
  report.host_facts = oracle.fixture_entry_facts;
  report.expected_ids = oracle.roles;
  report.expected_fifo_ids = oracle.expected_fifo_ids;
  save();
  browser = await chromium.launch({headless: true});
  for (const actor of ['officer', 'viewer']) {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    try {
      await ctx.addCookies(cookies(f[actor]));
      // This intentionally reads both actual surfaces. Native's visible page
      // is never used as a full oracle: the fixture must fit one native page.
      const expected = oracle.roles[actor].ids;
      assert.ok(expected.length <= 3, 'PARITY_UNEXPECTED_UNBOUNDED_NATIVE_PAGE');
      const np = await open(ctx, f.native_url);
      const nativeRows = await nativeObservation(np, expected.length);
      await np.close();
      const ip = await open(ctx, f.custom_url);
      const inboxRows = await inbox2Observation(ip);
      const nativeIds = nativeRows.map(r => r.id);
      const liveCandidateIds = inboxRows.map(r => r.id);
      const candidateIds = mutation === 'drop-first' && actor === 'officer'
        ? liveCandidateIds.slice(1) : liveCandidateIds;
      report[actor] = {native_ids: nativeIds, inbox2_ids: liveCandidateIds,
        compared_inbox2_ids: candidateIds, expected_ids: expected};
      save();
      same(sortIds(nativeIds), expected, 'PARITY_NATIVE_ID_SET_MATCH_' + actor);
      same(sortIds(candidateIds), expected, 'PARITY_INBOX2_ID_SET_MISMATCH_' + actor);
      if (actor === 'officer') {
        same(candidateIds, oracle.expected_fifo_ids, 'PARITY_FIFO_ENTRY_DATE_ORDER');
        for (const id of expected) {
          const nativeRow = nativeRows.find(row => row.id === id);
          const candidate = inboxRows.find(row => row.id === id);
          assert.ok(nativeRow?.href && candidate?.href,
            'PARITY_REQUIRED_NATIVE_DETAIL_LINK_MISSING_' + id);
          const hostLink = new URL(nativeRow.href, env.WU21_BASE_URL);
          const cardLink = new URL(candidate.href, env.WU21_BASE_URL);
          assert.equal(Number(cardLink.searchParams.get('lid')), id, 'PARITY_CARD_DETAIL_ID');
          assert.equal(Number(hostLink.searchParams.get('lid')), id, 'PARITY_NATIVE_DETAIL_ID');
          assert.equal(cardLink.origin + cardLink.pathname, hostLink.origin + hostLink.pathname,
            'PARITY_DETAIL_TARGET_DIFFERS_FROM_AUTHENTIC_NATIVE');
        }
        pass('PARITY_NATIVE_ENTRY_DETAIL_TARGETS');
        if (expected.length > 0) {
          await ip.locator('[data-ciq2-entry="' + expected[0] + '"] a[data-ciq2-detail]').click();
          await ip.locator('.gravityflow_workflow_detail').waitFor({timeout: 30000});
          assert.equal(Number(new URL(ip.url()).searchParams.get('lid')), expected[0],
            'PARITY_AUTHENTIC_ENTRY_DETAIL_NAVIGATION');
          pass('PARITY_AUTHENTIC_ENTRY_DETAIL_NAVIGATION');
        }
      }
      await ip.close();
    } finally {
      await ctx.close();
    }
  }
  report.status = 'PASS_THREE_WAY_PARITY';
  save();
  console.log('CIQ2_THREE_WAY_PARITY_PASS ' + phase);
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack || error);
  save();
  throw error;
} finally {
  if (browser) await browser.close();
}
