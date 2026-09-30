import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { artifactDir, wpCli, wpPath, assertEnv, login, waitForGrid } from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const alpha = (fixture.forms || []).find(item => item.key === 'alpha') || fixture.forms?.[0];
if (!alpha?.form_id) throw new Error('INBOX_HEADER_AUTHORITY_RUNTIME_FAILURE: alpha form fixture is unavailable.');
if (!fixture.frontend_inbox_url) throw new Error('INBOX_HEADER_AUTHORITY_RUNTIME_FAILURE: unscoped frontend Inbox fixture is unavailable.');

const evidencePath = path.join(artifactDir, 'inbox-table-header-form-authority-evidence.json');
const bindingRestoreOption = 'gpp_wu21_header_binding_restore_v1';
const probeOption = 'gpp_wu21_header_authority_probe_results';
let browser = null;
let bindingStateTouched = false;
let evidence = {
  contract: 'SRWF_INBOX_TABLE_HEADER_FORM_AUTHORITY_V1',
  execution_status: 'ERROR',
};

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`WP-CLI failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

function setupSingleActiveInboxBinding() {
  const result = wpEval(`
$restore_option = '${bindingRestoreOption}';
$probe_option = '${probeOption}';
$option_name = \\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME;
if ( null !== get_option( $restore_option, null ) ) {
    throw new RuntimeException( 'Stale WU21 header binding restore state is present.' );
}
$state = get_option( $option_name );
if ( ! is_array( $state ) || empty( $state['installed'] ) || empty( $state['activations'] ) ) {
    throw new RuntimeException( 'Binding lifecycle state is unavailable.' );
}
update_option( $restore_option, $state, false );
delete_option( $probe_option );
$target_form_id = ${Number(alpha.form_id)};
$kept_inbox_bindings = array();
foreach ( $state['activations'] as $context_key => $identity ) {
    $id = $identity['binding_set_id'] ?? null;
    $version = $identity['binding_set_version'] ?? null;
    $record = ( $id && $version ) ? ( $state['installed'][ $id ][ $version ] ?? null ) : null;
    $artifact = is_array( $record ) ? ( $record['artifact'] ?? null ) : null;
    $context = is_array( $artifact ) ? ( $artifact['context'] ?? null ) : null;
    $surfaces = is_array( $context ) ? ( $context['surfaces'] ?? array() ) : array();
    if ( ! is_array( $surfaces ) || ! in_array( 'gravity_flow.inbox', $surfaces, true ) ) {
        continue;
    }
    $form_ref = $context['form_source_ref'] ?? null;
    $form_id = is_array( $form_ref ) ? (int) ( $form_ref['form_id'] ?? 0 ) : 0;
    if ( $form_id !== $target_form_id || ! empty( $kept_inbox_bindings ) ) {
        unset( $state['activations'][ $context_key ] );
        continue;
    }
    $kept_inbox_bindings[] = array(
        'context_key' => $context_key,
        'binding_set_id' => $id,
        'binding_set_version' => $version,
        'form_id' => $form_id,
    );
}
if ( 1 !== count( $kept_inbox_bindings ) ) {
    throw new RuntimeException( 'Unable to select exactly one active SRWF Inbox binding for the authoritative fixture form.' );
}
update_option( $option_name, $state, false );
\\GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxTableHeaderPresentation::resetRuntimeCache();
echo wp_json_encode(array(
    'active_inbox_binding_count' => count( $kept_inbox_bindings ),
    'active_binding' => $kept_inbox_bindings[0],
));
  `);
  const decoded = JSON.parse(result);
  assert.equal(decoded?.active_inbox_binding_count, 1, 'Qualification setup did not establish exactly one active Inbox binding.');
  assert.equal(Number(decoded?.active_binding?.form_id), Number(alpha.form_id), 'Qualification setup retained the wrong form binding.');
  return decoded;
}

function readProbeEvents() {
  const result = wpEval(`
$events = get_option( '${probeOption}', array() );
echo wp_json_encode( is_array( $events ) ? $events : array() );
  `);
  return JSON.parse(result || '[]');
}

function restoreBindingState() {
  wpEval(`
$restore = get_option( '${bindingRestoreOption}', null );
if ( is_array( $restore ) ) {
    update_option( \\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME, $restore, false );
    delete_option( '${bindingRestoreOption}' );
    \\GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxTableHeaderPresentation::resetRuntimeCache();
}
delete_option( '${probeOption}' );
  `);
}

function authoritativeFormId(formArg) {
  if (!formArg?.present) return null;
  const raw = formArg.value;
  if (Array.isArray(raw)) {
    const ids = raw.map(value => Number.parseInt(String(value), 10)).filter(value => Number.isInteger(value) && value > 0);
    return ids.length === 1 ? ids[0] : null;
  }
  if (raw === null || typeof raw === 'object') return null;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function visibleHeaderIdentity(headers) {
  return headers.map(item => ({ col_id: item.col_id, text: item.text }));
}

try {
  bindingStateTouched = true;
  const singleBinding = setupSingleActiveInboxBinding();

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);

  const probeUrl = new URL(fixture.frontend_inbox_url);
  probeUrl.searchParams.set('wu21_header_authority_probe', '1');
  await page.goto(probeUrl.toString(), { waitUntil: 'networkidle' });
  await waitForGrid(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout: 15000 });

  const visibleRows = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').evaluateAll(rows => rows
    .map(row => Number(row.getAttribute('row-id')))
    .filter(Number.isFinite));
  const formByEntry = new Map((fixture.entry_records || []).map(record => [Number(record.entry_id), Number(record.form_id)]));
  const visibleFormIds = [...new Set(visibleRows.map(entryId => formByEntry.get(entryId)).filter(Number.isFinite))];
  assert.ok(visibleFormIds.length >= 2, `Unscoped qualification did not render a real multi-form Inbox page: ${JSON.stringify(visibleFormIds)}`);

  const headers = await page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(cells => cells
    .filter(cell => {
      const rect = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(cell => ({
      col_id: cell.getAttribute('col-id'),
      text: (cell.querySelector('.ag-header-cell-text')?.textContent || cell.textContent || '').replace(/\s+/g, ' ').trim(),
    })));

  const events = readProbeEvents();
  assert.ok(Array.isArray(events) && events.length > 0, 'Native Gravity Flow column hook was not observed by the form-authority probe.');
  const noAuthorityEvents = events.filter(event => authoritativeFormId(event.before_form_id) === null);

  if (noAuthorityEvents.length === 0) {
    evidence = {
      ...evidence,
      execution_status: 'NOT_PROVEN',
      reason: 'AUTHENTIC_UNSCOPED_MULTI_FORM_REQUEST_DID_NOT_EMIT_A_NO_AUTHORITY_COLUMNS_HOOK_CONTEXT',
      setup: singleBinding,
      route: { page_id: Number(fixture.frontend_inbox_page_id), url: fixture.frontend_inbox_url },
      visible_row_ids: visibleRows,
      visible_form_ids: visibleFormIds,
      visible_headers: visibleHeaderIdentity(headers),
      hook_events: events,
    };
  } else {
    for (const event of noAuthorityEvents) {
      assert.equal(
        JSON.stringify(event.after_columns),
        JSON.stringify(event.before_columns),
        `Missing/ambiguous native form authority changed the native column array: ${JSON.stringify(event)}`
      );
    }

    evidence = {
      ...evidence,
      execution_status: 'PASS',
      evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
      setup: singleBinding,
      route: { page_id: Number(fixture.frontend_inbox_page_id), url: fixture.frontend_inbox_url },
      visible_row_ids: visibleRows,
      visible_form_ids: visibleFormIds,
      visible_headers: visibleHeaderIdentity(headers),
      hook_event_count: events.length,
      no_authority_event_count: noAuthorityEvents.length,
      hook_events: events,
    };
  }

  console.log(`INBOX_TABLE_HEADER_FORM_AUTHORITY_RUNTIME_${evidence.execution_status}`);
} catch (error) {
  evidence = {
    ...evidence,
    execution_status: 'ERROR',
    error: String(error?.stack || error).slice(0, 12000),
  };
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (bindingStateTouched) restoreBindingState();
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
}
