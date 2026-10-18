import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.env.WU21_ARTIFACT_DIR;
if (!root) throw new Error('Exact-head journey artifact directory missing.');
const artifact = path.join(root, 'blocksy-frontend-native-print.json');
const data = JSON.parse(fs.readFileSync(artifact, 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const ids = ['BLOCKSY-FRONTEND-PRINT-AUTHORIZED', 'BLOCKSY-FRONTEND-PRINT-UNASSIGNED-DENIED'];

function verify(d) {
  assert.equal(d.schema, 'BLOCKSY_FRONTEND_NATIVE_PRINT_V1');
  assert.equal(d.repository_head, head);
  assert.equal(d.theme, 'blocksy');
  assert.equal(d.theme_version, '2.1.59');
  assert.ok(Number.isInteger(d.selected_entry_id) && d.selected_entry_id > 0);
  assert.deepEqual(d.expected_case_ids, ids);
  assert.ok(Array.isArray(d.results));
  assert.equal(d.results.length, ids.length, 'Missing, duplicate or extra required Print scenarios.');
  assert.deepEqual(d.results.map(r => r.id), ids, 'Print case order and exact IDs must be preserved.');
  assert.ok(d.results.every(r => r.status === 'PASS' && r.details && !r.error));
  assert.deepEqual(d.page_errors, []);
  const positive = d.results[0].details;
  const negative = d.results[1].details;
  assert.equal(positive.entry_id, d.selected_entry_id);
  assert.equal(positive.authenticated_as, 'bootstrap_admin');
  assert.equal(positive.selected_entry_verified, true);
  assert.ok(['gravity_flow_printPage', 'supported_window_open_fallback'].includes(positive.dispatch));
  assert.equal(positive.print_page_available, positive.dispatch === 'gravity_flow_printPage');
  const request = positive.dispatched_native_request;
  assert.ok(request && request.method === 'GET');
  const url = new URL(request.url);
  assert.equal(url.pathname, '/wp-admin/admin-ajax.php');
  assert.equal(url.searchParams.get('action'), 'gravityflow_print_entries');
  assert.equal(url.searchParams.get('lid'), String(d.selected_entry_id));
  assert.equal(url.searchParams.get('gpp_presentation'), 'dossier');
  assert.equal(positive.native_response_status, 200);
  assert.equal(positive.print_state, 'ready');
  assert.equal(positive.permission_trace, 'post_permission_seam_reached');
  assert.equal(positive.composition_trace, 'ready_two_pages');
  assert.equal(positive.protected_entry_witness_confirmed, true);
  assert.equal(positive.native_iframe_observed, positive.dispatch === 'gravity_flow_printPage');
  assert.equal(negative.entry_id, d.selected_entry_id);
  assert.equal(negative.independently_authenticated_as, 'srwf_participant');
  assert.equal(negative.native_session_verified, true);
  assert.equal(negative.same_print_request, true);
  assert.ok(Number.isInteger(negative.native_response_status) && negative.native_response_status >= 200);
  assert.equal(negative.explicit_native_permission_denial, true);
  assert.equal(negative.protected_entry_witness_absent, true);
  assert.equal(negative.post_permission_gpp_renderer_absent, true);
}
verify(data);

// Falsification: a forged PASS must not compensate for missing/duplicate or
// skipped cases, absent native HTTP evidence, or absent explicit host denial.
const mutations = [
  d => d.results.pop(),
  d => d.results[1] = structuredClone(d.results[0]),
  d => d.results[1].status = 'SKIPPED',
  d => d.results[0].details.dispatched_native_request = null,
  d => d.results[0].details.composition_trace = 'unproven',
  d => d.results[1].details.explicit_native_permission_denial = false,
  d => d.results[1].details.native_session_verified = false,
];
for (const mutate of mutations) {
  const copy = structuredClone(data);
  mutate(copy);
  assert.throws(() => verify(copy), 'Qualification gate accepted forged/incomplete result.');
}
for (const name of [
  'blocksy-frontend-print-before-click.png',
  'blocksy-frontend-print-unassigned-denied.png',
]) {
  assert.ok(fs.statSync(path.join(root, name)).size > 0, 'Missing actual browser capture: ' + name);
}
console.log('BLOCKSY_FRONTEND_NATIVE_PRINT_GATE_PASS cases=' + ids.length + ' falsification=' + mutations.length);
