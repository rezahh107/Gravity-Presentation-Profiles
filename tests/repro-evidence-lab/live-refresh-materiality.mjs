import fs from 'node:fs';
import path from 'node:path';
import { classifyAssignmentPollRequests } from './live-refresh-contract-repair.mjs';

const changesPath = '/wp-json/gravityflow/internal/inbox/changes';
const rowsSelector = '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await predicate();
    if (value) return value;
    await sleep(120);
  }
  throw new Error(`timeout:${label}`);
}

function shape(body) {
  try {
    const json = JSON.parse(body);
    const ids = (items) => Array.isArray(items)
      ? items.map((item) => String(item?.id ?? item?.entry_id ?? item)).filter(Boolean)
      : [];
    return { add: ids(json.add), remove: ids(json.remove), update: ids(json.update) };
  } catch {
    return null;
  }
}

async function rowText(page, id) {
  return page.locator(`${rowsSelector}[row-id="${id}"]`).innerText().catch(() => '');
}

async function rowPresent(page, id) {
  return (await page.locator(`${rowsSelector}[row-id="${id}"]`).count()) === 1;
}

async function cellText(page, id, columnId) {
  return page.locator(`${rowsSelector}[row-id="${id}"] .ag-cell[col-id="${columnId}"]`).innerText().catch(() => '');
}

async function findVisibleCellByText(page, id, expectedText) {
  return page.locator(`${rowsSelector}[row-id="${id}"] .ag-cell`).evaluateAll((cells, needle) => {
    const cell = cells.find((candidate) => (candidate.textContent || '').includes(needle));
    return cell ? {
      col_id: cell.getAttribute('col-id'),
      text: (cell.textContent || '').trim(),
    } : null;
  }, expectedText);
}

export async function runLiveRefreshMateriality({ page, wpEval, manifest, baseUrl, artifactDir }) {
  const evidence = {
    schema_version: '1.1.0',
    historical_native_admin_created_by: {
      observation: 'OBSERVED_IN_PRIOR_PINNED_WU21_RUN_NOT_REEXECUTED_HERE',
      run_id: 37741349213,
      artifact_file: 'live-refresh-materiality.json',
      artifact_sha256: 'd4ad23ca3d4b705bd09a755a5d66f08219ee4e4357ee3d129814e59d869ae1d0',
      surface: 'wp-admin gravityflow-inbox; WU21 synthetic form; created_by column',
      direct_srwf_target_column_proof: false,
    },
    evidence_ceiling: 'REPRODUCIBLE_PINNED_RUNTIME_NOT_TARGET_PRODUCTION',
    production_visible_value_race: { status: 'NOT_PROVEN' },
    assignment_membership_race: { status: 'NOT_PROVEN' },
  };

  let valueEntryId = null;
  let targetPage = null;
  let assignmentFixture = null;
  let assignmentNavigationListener = null;
  let assignmentMount = null;
  const assignmentNavigations = [];

  let mode = 'pass';
  let holdRemaining = 0;
  let held = null;
  let releaseHeld = null;
  let heldSettled = Promise.resolve();
  let resolveHeldSettled = null;
  let tearingDown = false;
  const responses = [];
  const nativeRequests = [];
  const nativeRequestByObject = new WeakMap();
  let requestSequence = 0;
  let completionSequence = 0;
  function finishNativeRequest(record, outcome, details = {}) {
    if (!record || record.outcome !== 'PENDING') return;
    record.outcome = outcome;
    record.http_status = details.http_status ?? null;
    record.shape = details.shape ?? null;
    record.error = details.error ?? null;
    record.completed_at = Date.now();
    record.completion_sequence = ++completionSequence;
  }

  async function releaseHeldResponse(label) {
    if (typeof releaseHeld !== 'function') {
      throw new Error(`${label}: held response cannot be released`);
    }
    const release = releaseHeld;
    const settled = heldSettled;
    releaseHeld = null;
    release();
    await settled;
  }

  const hostContains = (id) => JSON.parse(wpEval(`
    $m=get_option('gpp_wu21_fixture_manifest');
    $u=(int)$m['operator']['id'];
    $t=0;
    $entries=Gravity_Flow_API::get_inbox_entries([
      'filter_key'=>'workflow_user_id_'.$u,
      'user_id'=>$u,
      'paging'=>['page_size'=>1000]
    ],$t);
    $ids=array_map(fn($x)=>(int)$x['id'],$entries);
    echo wp_json_encode(in_array(${Number(id)},$ids,true));
  `));

  const requestListener = (request) => {
    if (!request.url().includes(changesPath)) return;
    const sequence = ++requestSequence;
    const record = {
      request_id: `lrq-native-${sequence}`, sequence, started_at: Date.now(),
      outcome: 'PENDING', http_status: null, shape: null, error: null,
      completed_at: null, completion_sequence: null,
    };
    nativeRequests.push(record);
    nativeRequestByObject.set(request, record);
  };
  const responseListener = async (response) => {
    if (!response.url().includes(changesPath)) return;
    const record = nativeRequestByObject.get(response.request());
    let body;
    try {
      body = await response.text();
    } catch (error) {
      finishNativeRequest(record, 'NETWORK_FAILURE', {
        error: String(error), http_status: response.status(),
      });
      return;
    }
    let parsed = null;
    if (response.status() === 200) {
      try {
        const json = JSON.parse(body);
        if (json && typeof json === 'object'
            && ['add', 'remove', 'update'].every(key => Array.isArray(json[key]))) {
          parsed = shape(body);
        }
      } catch {}
    }
    const outcome = response.status() !== 200 ? 'HTTP_FAILURE'
      : parsed === null ? 'MALFORMED_RESPONSE' : 'NATIVE_CHANGE';
    finishNativeRequest(record, outcome, {
      http_status: response.status(), shape: parsed,
    });
    responses.push({
      at: Date.now(), request_id: record?.request_id ?? null,
      request_sequence: record?.sequence ?? null,
      request_started_at: record?.started_at ?? null,
      status: response.status(), shape: parsed,
    });
  };
  const failedListener = (request) => {
    if (!request.url().includes(changesPath)) return;
    finishNativeRequest(nativeRequestByObject.get(request), 'NETWORK_FAILURE', {
      error: request.failure()?.errorText || 'native request failed',
    });
  };

  const routeHandler = async (route) => {
    if (mode !== 'hold' || holdRemaining <= 0) {
      await route.continue();
      return;
    }

    holdRemaining -= 1;
    const upstream = await route.fetch();
    const body = await upstream.body();
    held = {
      status: upstream.status(),
      headers: upstream.headers(),
      body,
      shape: shape(body.toString('utf8')),
    };
    heldSettled = new Promise((resolve) => { resolveHeldSettled = resolve; });
    try {
      await new Promise((resolve) => { releaseHeld = resolve; });
      await route.fulfill({ status: held.status, headers: held.headers, body: held.body });
    } catch (error) {
      if (!(tearingDown && /already handled/i.test(String(error)))) throw error;
    } finally {
      if (resolveHeldSettled) resolveHeldSettled();
      resolveHeldSettled = null;
    }
  };

  page.on('request', requestListener);
  page.on('response', responseListener);
  page.on('requestfailed', failedListener);
  await page.route(`**${changesPath}**`, routeHandler);

  try {
    const inboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;
    // The target is the already-admitted frontend SRWF projection, not the
    // wp-admin default Inbox. Bind a single form using Gravity Flow's native
    // shortcode, exactly as the header/pagination WU21 browser test does.
    targetPage = JSON.parse(wpEval(`
      $m=get_option('gpp_wu21_fixture_manifest');
      $f=$m['forms'][0];
      $form=(int)$f['form_id'];
      $page=wp_insert_post([
        'post_type'=>'page',
        'post_status'=>'publish',
        'post_title'=>'WU21 LRQ Scoped SRWF Value Race',
        'post_content'=>'[gravityflow page="inbox" form="'.$form.'"]'
      ],true);
      if(is_wp_error($page)) throw new RuntimeException($page->get_error_message());
      echo wp_json_encode([
        'page_id'=>(int)$page,
        'url'=>get_permalink($page),
        'form_id'=>$form,
        'national_id_field_id'=>(int)$f['national_id_field_id'],
        'first_name_field_id'=>(int)$f['first_name_field_id'],
        'school_field_id'=>(int)$f['school_field_id'],
      ]);
    `));
    if (!targetPage.page_id || !targetPage.url || !targetPage.national_id_field_id) {
      throw new Error('SRWF scoped value-race route could not be established.');
    }
    await page.goto(targetPage.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });

    const intervalSeconds = await page.evaluate(() => {
      const grids = Object.values(window.gflow_config?.grids || {});
      return Number(grids[0]?.fetch_interval || 30);
    });
    const pollTimeout = Math.max(70000, intervalSeconds * 2200);

    valueEntryId = Number(wpEval(`
      $m=get_option('gpp_wu21_fixture_manifest');
      $f=$m['forms'][0];
      $seed=GFAPI::get_entry((int)$m['entry_records'][0]['entry_id']);
      $entry=[
        'form_id'=>(int)$f['form_id'],
        'created_by'=>(int)$m['operator']['id'],
        (string)$f['first_name_field_id']=>'WU21 Alpha',
        (string)$f['last_name_field_id']=>'Race Student',
        (string)$f['photo_field_id']=>$seed[(string)$f['photo_field_id']]??'',
        (string)$f['national_id_field_id']=>'LRQ-TARGET-NATIONAL-OLD',
        (string)$f['grade_group_field_id']=>'پایه آزمایشی',
        (string)$f['school_field_id']=>'مدرسه آزمایشی'
      ];
      $id=GFAPI::add_entry($entry);
      if(is_wp_error($id)) throw new RuntimeException($id->get_error_message());
      GFAPI::update_entry_property($id,'date_created','2099-12-31 23:59:59');
      (new Gravity_Flow_API((int)$f['form_id']))->process_workflow($id);
      echo (int)$id;
    `));

    await waitFor(() => rowPresent(page, valueEntryId), pollTimeout, 'production-visible-entry-add');

    // A recorded target claim requires real Grid column identity, the
    // admitted five-column projection, and the exact mapped GF field.
    const targetSurface = await page.evaluate(({ formId, fieldId, firstId, schoolId, entryId }) => {
      const grids = [...document.querySelectorAll('[data-js="gflow-inbox"]')];
      const root = grids[0];
      const gridId = root?.dataset?.gridId || 'inbox_default';
      const options = window.gflow_config?.grids?.[gridId]?.grid_options;
      const headers = [...(root?.querySelectorAll('.ag-header-cell[col-id]') || [])]
        .filter(el => el.getBoundingClientRect().width > 0)
        .map(el => ({
          col_id: el.getAttribute('col-id'),
          label: (el.querySelector('.ag-header-cell-text')?.textContent || '').trim(),
        }));
      const defs = Array.isArray(options?.columnDefs)
        ? options.columnDefs.map(col => ({ field: String(col.field), display_key: col.displayKey || null }))
        : [];
      const matching = defs.find(col => col.field === String(fieldId));
      const row = Array.isArray(options?.rowData)
        ? options.rowData.find(item => Number(item.id) === entryId)
        : null;
      const expected = ['id', String(firstId), String(fieldId), String(schoolId), 'date_created'];
      return {
        kind: 'AUTHENTIC_FRONTEND_SCOPED_SRWF_INBOX',
        form_id: formId,
        native_grid_count: grids.length,
        gpp_surface_count: document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"]').length,
        headers,
        column_defs: defs,
        expected_column_ids: expected,
        national_id_column_def: matching || null,
        bootstrap_row_value: row ? row[String(fieldId)] ?? null : null,
        is_five_column_projection: grids.length === 1
          && headers.length === 5
          && expected.every(key => headers.some(header => header.col_id === key))
          && headers.some(header => header.col_id === String(fieldId) && header.label === 'کد ملی'),
      };
    }, {
      formId: targetPage.form_id,
      fieldId: targetPage.national_id_field_id,
      firstId: targetPage.first_name_field_id,
      schoolId: targetPage.school_field_id,
      entryId: valueEntryId,
    });
    const fieldId = String(targetPage.national_id_field_id);
    const oldValue = 'LRQ-TARGET-NATIONAL-OLD';
    const newValue = 'LRQ-TARGET-NATIONAL-NEW';
    const visibleColumnId = fieldId;
    const oldText = await rowText(page, valueEntryId);
    const oldCellText = await cellText(page, valueEntryId, visibleColumnId);
    const beforeSource = JSON.parse(wpEval(`
      $entry=GFAPI::get_entry(${valueEntryId});
      if(is_wp_error($entry)) throw new RuntimeException($entry->get_error_message());
      echo wp_json_encode(['form_id'=>(int)$entry['form_id'], 'value'=>$entry['${fieldId}']??null]);
    `));
    const bindingProven = targetSurface.is_five_column_projection
      && targetSurface.gpp_surface_count === 1
      && targetSurface.national_id_column_def?.field === fieldId
      // Initial Grid options are a bootstrap snapshot; this row was added
      // by native Live Refresh after mount, so rowData cannot prove its value.
      && beforeSource.form_id === targetPage.form_id
      && beforeSource.value === oldValue
      && oldCellText.trim() === oldValue;

    held = null;
    releaseHeld = null;
    mode = 'hold';
    holdRemaining = 1;
    await waitFor(() => held, pollTimeout, 'target-national-held-response');
    const heldContainsValueUpdate = Boolean(held.shape?.update.includes(String(valueEntryId)));

    wpEval(`
      $m=get_option('gpp_wu21_fixture_manifest');
      $key=(string)$m['forms'][0]['national_id_field_id'];
      $entry=GFAPI::get_entry(${valueEntryId});
      if(is_wp_error($entry)) throw new RuntimeException($entry->get_error_message());
      $entry[$key]='LRQ-TARGET-NATIONAL-NEW';
      $r=GFAPI::update_entry($entry);
      if(is_wp_error($r)) throw new RuntimeException($r->get_error_message());
    `);
    const afterSource = JSON.parse(wpEval(`
      $entry=GFAPI::get_entry(${valueEntryId});
      if(is_wp_error($entry)) throw new RuntimeException($entry->get_error_message());
      echo wp_json_encode(['form_id'=>(int)$entry['form_id'], 'value'=>$entry['${fieldId}']??null]);
    `));

    mode = 'pass';
    const newerStart = responses.length;
    await waitFor(
      () => responses.slice(newerStart).find(item => item.shape?.update.includes(String(valueEntryId))) || null,
      pollTimeout, 'target-national-newer-response'
    );
    await waitFor(
      async () => (await cellText(page, valueEntryId, visibleColumnId)).trim() === newValue,
      pollTimeout, 'target-national-newer-render'
    );
    const freshText = await rowText(page, valueEntryId);
    const freshCellText = await cellText(page, valueEntryId, visibleColumnId);

    await releaseHeldResponse('target-national');
    await waitFor(
      async () => (await cellText(page, valueEntryId, visibleColumnId)).trim() === oldValue,
      15000, 'target-national-stale-render'
    ).catch(() => null);
    const staleText = await rowText(page, valueEntryId);
    const staleCellText = await cellText(page, valueEntryId, visibleColumnId);
    const transientReversion = staleCellText.trim() === oldValue;
    let recoveredNextPoll = !transientReversion;

    if (transientReversion) {
      await waitFor(
        async () => (await cellText(page, valueEntryId, visibleColumnId)).trim() === newValue,
        pollTimeout, 'target-national-recovery'
      );
      recoveredNextPoll = true;
    }

    const targetProven = bindingProven && heldContainsValueUpdate
      && afterSource.form_id === targetPage.form_id && afterSource.value === newValue
      && freshCellText.trim() === newValue && transientReversion && recoveredNextPoll;
    evidence.production_visible_value_race = {
      status: targetProven ? 'OBSERVED' : 'NOT_PROVEN',
      entry_id: valueEntryId,
      semantic_surface: 'student.national_id',
      surface_role: 'AUTHENTIC_FRONTEND_SCOPED_SRWF_INBOX',
      route: targetPage.url,
      route_page_id: targetPage.page_id,
      target_surface: targetSurface,
      value_binding: {
        semantic_slot: 'student.national_id',
        form_id: targetPage.form_id,
        field_id: fieldId,
        native_grid_field: targetSurface.national_id_column_def?.field || null,
        source_before: beforeSource.value,
        source_after: afterSource.value,
        verified: bindingProven && afterSource.value === newValue,
      },
      production_column_id: visibleColumnId,
      old_value_rendered: oldCellText.trim() === oldValue,
      held_response_update_contains_entry: heldContainsValueUpdate,
      old_row_text: oldText,
      old_cell_text: oldCellText,
      fresh_row_text: freshText,
      fresh_cell_text: freshCellText,
      stale_row_text_after_older_response: staleText,
      stale_cell_text_after_older_response: staleCellText,
      transient_reversion: transientReversion,
      recovered_next_poll: recoveredNextPoll,
      final_row_text: await rowText(page, valueEntryId),
      final_cell_text: await cellText(page, valueEntryId, visibleColumnId),
      host_membership_final: hostContains(valueEntryId),
      not_proven_reason: targetProven ? null : 'Exact target route, five-column native binding, authoritative GF field transition, or stale response/recovery was not all proven.',
    };

    wpEval(`GFAPI::delete_entry(${valueEntryId});`);
    const deletedValueEntryId = valueEntryId;
    valueEntryId = null;
    await waitFor(async () => !(await rowPresent(page, deletedValueEntryId)), pollTimeout, 'production-visible-cleanup');

    // The assignment fixture below is deliberately a different, synthetic
    // wp-admin race; it is not evidence of a five-column SRWF field binding.
    await page.goto(inboxUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
    // Capture the original wp-admin document and native mounted Grid before
    // the assignment is added. A reload must never count as poll recovery.
    assignmentMount = await page.evaluateHandle(() => ({
      document,
      grid: document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper'),
    }));
    assignmentNavigationListener = (frame) => {
      if (frame === page.mainFrame()) assignmentNavigations.push(frame.url());
    };
    page.on('framenavigated', assignmentNavigationListener);
    const assignmentInboxUrl = page.url();
    const mountedGridState = async () => {
      try {
        return await page.evaluate(({ original, url, id }) => {
          const currentGrid = document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper');
          return {
            document_identity_preserved: original.document === document,
            grid_identity_preserved: original.grid !== null && original.grid === currentGrid,
            original_grid_connected: Boolean(original.grid?.isConnected),
            native_grid_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-root-wrapper').length,
            url_unchanged: location.href === url,
            row_present: Boolean(document.querySelector(
              '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="' + id + '"]'
            )),
          };
        }, { original: assignmentMount, url: assignmentInboxUrl, id: Number(assignmentFixture.entry_id) });
      } catch (error) {
        return { document_identity_preserved: false, grid_identity_preserved: false,
          original_grid_connected: false, url_unchanged: false,
          observation_error: String(error) };
      }
    };
    held = null;
    releaseHeld = null;
    mode = 'hold';
    holdRemaining = 1;

    assignmentFixture = JSON.parse(wpEval(`
      $m=get_option('gpp_wu21_fixture_manifest');
      $operator=(int)$m['operator']['id'];
      $viewer=(int)$m['viewer']['id'];
      $form=[
        'title'=>'LRQ Assignment Race Form',
        'description'=>'Synthetic Live Refresh qualification fixture only.',
        'labelPlacement'=>'top_label',
        'fields'=>[['id'=>1,'label'=>'Name','type'=>'text','isRequired'=>true]],
        'button'=>['type'=>'text','text'=>'Submit']
      ];
      $fid=GFAPI::add_form($form);
      if(is_wp_error($fid)) throw new RuntimeException($fid->get_error_message());
      $api=new Gravity_Flow_API((int)$fid);
      $operatorStep=$api->add_step([
        'step_name'=>'LRQ Operator Step',
        'step_type'=>'approval',
        'type'=>'select',
        'assignees'=>['user_id|'.$operator],
        'assignee_policy'=>'all'
      ]);
      $viewerStep=$api->add_step([
        'step_name'=>'LRQ Viewer Step',
        'step_type'=>'approval',
        'type'=>'select',
        'assignees'=>['user_id|'.$viewer],
        'assignee_policy'=>'all'
      ]);
      if(!$operatorStep||is_wp_error($operatorStep)||!$viewerStep||is_wp_error($viewerStep)) {
        throw new RuntimeException('Unable to create LRQ assignment race steps.');
      }
      $eid=GFAPI::add_entry(['form_id'=>(int)$fid,'created_by'=>$operator,'1'=>'LRQ Assignment Race']);
      if(is_wp_error($eid)) throw new RuntimeException($eid->get_error_message());
      $api->process_workflow((int)$eid);
      echo wp_json_encode([
        'form_id'=>(int)$fid,
        'entry_id'=>(int)$eid,
        'operator_step'=>(int)$operatorStep,
        'viewer_step'=>(int)$viewerStep
      ]);
    `));

    await waitFor(() => held, pollTimeout, 'assignment-held-response');
    const assignmentId = Number(assignmentFixture.entry_id);
    const rowVisibleBeforeHeldAdd = await rowPresent(page, assignmentId);
    const heldContainsAdd = Boolean(held.shape?.add.includes(String(assignmentId)));
    const hostBeforeMove = hostContains(assignmentId);

    wpEval(`
      $entry=GFAPI::get_entry(${assignmentId});
      if(is_wp_error($entry)) throw new RuntimeException($entry->get_error_message());
      $api=new Gravity_Flow_API(${Number(assignmentFixture.form_id)});
      $sent=$api->send_to_step($entry,${Number(assignmentFixture.viewer_step)});
      if(false===$sent||is_wp_error($sent)) {
        throw new RuntimeException(is_wp_error($sent)?$sent->get_error_message():'send_to_step failed');
      }
    `);

    const hostAfterMove = hostContains(assignmentId);
    mode = 'pass';
    const newerMembershipStart = responses.length;
    const newerMembershipResponse = await waitFor(
      () => responses.slice(newerMembershipStart).find((item) => item.shape) || null,
      pollTimeout,
      'assignment-newer-poll'
    );
    const newerMembershipExcludesEntry = !newerMembershipResponse.shape.add.includes(String(assignmentId))
      && !newerMembershipResponse.shape.update.includes(String(assignmentId));
    const absentBeforeRelease = !(await rowPresent(page, assignmentId));

    await releaseHeldResponse('assignment');

    if (heldContainsAdd) {
      await waitFor(() => rowPresent(page, assignmentId), 15000, 'assignment-stale-add').catch(() => null);
    }

    const staleMembershipPresent = await rowPresent(page, assignmentId);
    const delayedStaleAddVisible = heldContainsAdd && !rowVisibleBeforeHeldAdd
      && hostAfterMove === false && staleMembershipPresent;
    const mountAtStaleAdd = await mountedGridState();
    const staleRowLink = delayedStaleAddVisible
      ? await page.locator(`${rowsSelector}[row-id="${assignmentId}"] .gflow-inbox__entry-cell-link`).first().getAttribute('href').catch(() => null)
      : null;

    // Start looking only after the stale add has been rendered. The first
    // following native response must explicitly classify this ID as removed;
    // absence alone (or a clean page reload) is not proof of poll recovery.
    const recoveryStart = responses.length;
    const staleRowObservedAt = Date.now();
    const recoveryResponse = delayedStaleAddVisible
      ? await waitFor(
        () => responses.slice(recoveryStart).find(
          (item) => item.status === 200 && item.shape
            && item.request_started_at !== null
            && item.request_started_at >= staleRowObservedAt
        ) || null,
        pollTimeout, 'assignment-first-same-mount-poll'
      ).catch(() => null)
      : null;
    const recoveryClassification = {
      status: recoveryResponse?.status ?? null,
      request_started_at: recoveryResponse?.request_started_at ?? null,
      stale_row_observed_at: staleRowObservedAt,
      native_request_started_after_stale: recoveryResponse
        ? recoveryResponse.request_started_at >= staleRowObservedAt : false,
      shape: recoveryResponse?.shape ?? null,
      add_contains_entry: recoveryResponse?.shape?.add.includes(String(assignmentId)) ?? null,
      remove_contains_entry: recoveryResponse?.shape?.remove.includes(String(assignmentId)) ?? null,
      update_contains_entry: recoveryResponse?.shape?.update.includes(String(assignmentId)) ?? null,
    };
    if (recoveryClassification.remove_contains_entry === true) {
      await waitFor(
        async () => !(await rowPresent(page, assignmentId)),
        15000, 'assignment-same-mount-native-remove'
      ).catch(() => null);
    }
    const mountAfterRecoveryPoll = await mountedGridState();
    const recoveryIdentityContinuity = [mountAtStaleAdd, mountAfterRecoveryPoll].every(
      (snapshot) => snapshot.document_identity_preserved === true
        && snapshot.grid_identity_preserved === true
        && snapshot.original_grid_connected === true
        && snapshot.native_grid_count === 1
        && snapshot.url_unchanged === true
    ) && assignmentNavigations.length === 0;
    const membershipRecoveredNextPoll = delayedStaleAddVisible
      && mountAtStaleAdd.row_present === true
      && recoveryClassification.remove_contains_entry === true
      && mountAfterRecoveryPoll.row_present === false
      && recoveryIdentityContinuity;
    const sameMountRecovery = {
      status: membershipRecoveredNextPoll ? 'OBSERVED' : 'NOT_PROVEN',
      route: assignmentInboxUrl,
      response: recoveryClassification,
      grid_at_stale_add: mountAtStaleAdd,
      grid_after_recovery_poll: mountAfterRecoveryPoll,
      main_frame_navigation_events: [...assignmentNavigations],
      identity_continuity: recoveryIdentityContinuity,
      removed_by_first_native_poll_on_same_grid: membershipRecoveredNextPoll,
      not_proven_reason: membershipRecoveredNextPoll ? null
        : 'No first subsequent native remove response with a vanished row and continuous original document/Grid was established.',
    };

    // Exercise the stale native href in a separate page. Neither authenticated
    // navigation nor the guest login check can destroy the observed Grid.
    const navigation = {
      stale_native_link: staleRowLink,
      operator_identity: 'bootstrap_admin',
      operator_role: 'administrator',
      assignment_specific_authorization: 'NOT_PROVEN_ADMINISTRATOR_CAPABILITY_CONFOUNDS',
      anonymous_login_guard: 'NOT_PROVEN',
      administrator_entry_open: 'NOT_PROVEN',
      original_inbox_preserved: true,
    };
    if (staleRowLink) {
      const targetUrl = new URL(staleRowLink, baseUrl).toString();
      const browser = page.context().browser();
      const guestContext = await browser.newContext();
      try {
        const guestPage = await guestContext.newPage();
        const guestResponse = await guestPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        navigation.guest_http_status = guestResponse?.status() ?? null;
        navigation.guest_final_path = new URL(guestPage.url()).pathname;
        navigation.anonymous_login_guard = /\/wp-login\.php$/.test(navigation.guest_final_path)
          ? 'OBSERVED_LOGIN_REQUIRED' : 'NOT_PROVEN';
      } finally {
        await guestContext.close();
      }
      const detailPage = await page.context().newPage();
      try {
        const detailResponse = await detailPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        navigation.administrator_http_status = detailResponse?.status() ?? null;
        navigation.administrator_final_url = detailPage.url();
        navigation.administrator_entry_open = /[?&]view=entry(?:&|$)/.test(detailPage.url())
          ? 'OBSERVED_NAVIGATION_TO_ENTRY_DETAIL' : 'NOT_PROVEN';
      } finally {
        await detailPage.close();
      }
    }
    const mountAfterSeparateNavigation = await mountedGridState();
    sameMountRecovery.grid_after_separate_navigation = mountAfterSeparateNavigation;
    sameMountRecovery.identity_continuity = sameMountRecovery.identity_continuity
      && mountAfterSeparateNavigation.document_identity_preserved === true
      && mountAfterSeparateNavigation.grid_identity_preserved === true
      && mountAfterSeparateNavigation.original_grid_connected === true
      && mountAfterSeparateNavigation.url_unchanged === true
      && assignmentNavigations.length === 0;
    sameMountRecovery.removed_by_first_native_poll_on_same_grid =
      membershipRecoveredNextPoll && sameMountRecovery.identity_continuity;
    sameMountRecovery.status = sameMountRecovery.removed_by_first_native_poll_on_same_grid ? 'OBSERVED' : 'NOT_PROVEN';
    if (sameMountRecovery.status === 'NOT_PROVEN') {
      sameMountRecovery.not_proven_reason =
        'No first subsequent native remove with intact original Grid/document through separate navigation was established.';
    }
    navigation.original_inbox_preserved = sameMountRecovery.identity_continuity;

    evidence.assignment_membership_race = {
      status: delayedStaleAddVisible
        && hostBeforeMove === true && newerMembershipExcludesEntry && absentBeforeRelease
        ? 'OBSERVED' : 'NOT_PROVEN',
      entry_id: assignmentId,
      fixture_surface: 'NATIVE_WP_ADMIN_SYNTHETIC_ASSIGNMENT_FORM',
      form_id: assignmentFixture.form_id,
      held_response_add_contains_entry: heldContainsAdd,
      row_visible_before_held_add: rowVisibleBeforeHeldAdd,
      delayed_stale_add_visible: delayedStaleAddVisible,
      reintroduction_of_previously_visible_then_removed_row: false,
      navigation_authorization: navigation,
      same_mount_recovery: sameMountRecovery,
      host_membership_before_move: hostBeforeMove,
      host_membership_after_move: hostAfterMove,
      newer_response_shape: newerMembershipResponse.shape,
      newer_response_excludes_entry: newerMembershipExcludesEntry,
      row_absent_before_release: absentBeforeRelease,
      stale_row_present_after_older_response: staleMembershipPresent,
      transient_membership_reversion: false,
      transient_stale_membership_visibility: delayedStaleAddVisible,
      semantic_precision: 'DELAYED_STALE_ADD_NOT_REINTRODUCTION_OF_PREVIOUSLY_VISIBLE_ROW',
      recovered_next_poll: sameMountRecovery.removed_by_first_native_poll_on_same_grid,
      final_row_absent: !(await rowPresent(page, assignmentId)),
      not_proven_reason: !heldContainsAdd
        ? 'The held native response did not contain the assignment row in add, so the membership-changing race was not formed.'
        : (hostBeforeMove !== true || hostAfterMove !== false
          ? 'Authoritative operator membership did not transition true-to-false.'
          : (!newerMembershipExcludesEntry || !absentBeforeRelease
            ? 'The newer native response/UI did not establish host-authoritative absence before the older add was released.'
            : (!delayedStaleAddVisible ? 'The delayed stale add was not rendered.' : null))),
    };
  } finally {
    tearingDown = true;
    mode = 'pass';
    if (typeof releaseHeld === 'function') {
      const release = releaseHeld;
      releaseHeld = null;
      release();
      try { await heldSettled; } catch {}
    }
    try {
      if (valueEntryId) wpEval(`GFAPI::delete_entry(${Number(valueEntryId)});`);
      if (targetPage?.page_id) wpEval(`wp_delete_post(${Number(targetPage.page_id)}, true);`);
    } catch {}
    try {
      if (assignmentFixture) {
        wpEval(`
          GFAPI::delete_entry(${Number(assignmentFixture.entry_id)});
          GFAPI::delete_form(${Number(assignmentFixture.form_id)});
        `);
      }
    } catch {}
    if (assignmentNavigationListener) page.off('framenavigated', assignmentNavigationListener);
    if (assignmentMount) await assignmentMount.dispose().catch(() => {});
    page.off('requestfailed', failedListener);
    page.off('request', requestListener);
    page.off('response', responseListener);
    await page.unroute(`**${changesPath}**`, routeHandler);
  }

  fs.writeFileSync(
    path.join(artifactDir, 'live-refresh-materiality.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
  return evidence;
}
