import fs from 'node:fs';
import path from 'node:path';

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
    schema_version: '1.0.0',
    evidence_ceiling: 'REPRODUCIBLE_PINNED_RUNTIME_NOT_TARGET_PRODUCTION',
    production_visible_value_race: { status: 'NOT_PROVEN' },
    assignment_membership_race: { status: 'NOT_PROVEN' },
  };

  let valueEntryId = null;
  let assignmentFixture = null;
  let mode = 'pass';
  let holdRemaining = 0;
  let held = null;
  let releaseHeld = null;
  let heldSettled = Promise.resolve();
  let resolveHeldSettled = null;
  let tearingDown = false;
  const responses = [];

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

  const responseListener = async (response) => {
    if (!response.url().includes(changesPath)) return;
    let body = '';
    try { body = await response.text(); } catch {}
    responses.push({ at: Date.now(), status: response.status(), shape: shape(body) });
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

  page.on('response', responseListener);
  await page.route(`**${changesPath}**`, routeHandler);

  try {
    const inboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;
    await page.goto(inboxUrl, { waitUntil: 'domcontentloaded' });
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
        (string)$f['national_id_field_id']=>'LRQ-VISIBLE-RACE',
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
    const oldText = await rowText(page, valueEntryId);
    const oldCreatedBy = 'bootstrap_admin';
    const oldCell = await findVisibleCellByText(page, valueEntryId, oldCreatedBy);
    const productionValueRendered = Boolean(oldCell?.col_id && oldCell.text.includes(oldCreatedBy));
    const visibleColumnId = oldCell?.col_id || null;
    const oldCellText = visibleColumnId ? await cellText(page, valueEntryId, visibleColumnId) : '';

    held = null;
    releaseHeld = null;
    mode = 'hold';
    holdRemaining = 1;
    await waitFor(() => held, pollTimeout, 'production-visible-held-response');
    const heldContainsValueUpdate = Boolean(held.shape?.update.includes(String(valueEntryId)));

    wpEval(`
      $m=get_option('gpp_wu21_fixture_manifest');
      $viewer=(int)$m['viewer']['id'];
      $r=GFAPI::update_entry_property(${valueEntryId}, 'created_by', $viewer);
      if(is_wp_error($r)) throw new RuntimeException($r->get_error_message());
    `);

    mode = 'pass';
    const newerStart = responses.length;
    await waitFor(
      () => responses.slice(newerStart).find((item) => item.shape?.update.includes(String(valueEntryId))) || null,
      pollTimeout,
      'production-visible-newer-response'
    );
    await waitFor(
      async () => visibleColumnId && (await cellText(page, valueEntryId, visibleColumnId)).includes('wu21_viewer'),
      pollTimeout,
      'production-visible-newer-render'
    );
    const freshText = await rowText(page, valueEntryId);
    const freshCellText = visibleColumnId ? await cellText(page, valueEntryId, visibleColumnId) : '';

    await releaseHeldResponse('production-visible');

    await waitFor(
      async () => {
        const text = visibleColumnId ? await cellText(page, valueEntryId, visibleColumnId) : '';
        return text.includes(oldCreatedBy) ? text : null;
      },
      15000,
      'production-visible-stale-render'
    ).catch(() => null);

    const staleText = await rowText(page, valueEntryId);
    const staleCellText = visibleColumnId ? await cellText(page, valueEntryId, visibleColumnId) : '';
    const transientReversion = staleCellText.includes(oldCreatedBy) && !staleCellText.includes('wu21_viewer');
    let recoveredNextPoll = !transientReversion;

    if (transientReversion) {
      await waitFor(
        async () => visibleColumnId && (await cellText(page, valueEntryId, visibleColumnId)).includes('wu21_viewer'),
        pollTimeout,
        'production-visible-recovery'
      );
      recoveredNextPoll = true;
    }

    evidence.production_visible_value_race = {
      status: productionValueRendered && heldContainsValueUpdate ? 'OBSERVED' : 'NOT_PROVEN',
      entry_id: valueEntryId,
      semantic_surface: 'created_by',
      surface_role: 'native Gravity Flow Inbox production-visible task-row value',
      production_column_id: visibleColumnId,
      old_value_rendered: productionValueRendered,
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
      final_cell_text: visibleColumnId ? await cellText(page, valueEntryId, visibleColumnId) : '',
      host_membership_final: hostContains(valueEntryId),
      not_proven_reason: !productionValueRendered
        ? 'No current production-visible Inbox cell containing the authoritative created_by value was found on the SRWF task row.'
        : (!heldContainsValueUpdate ? 'The held native response did not contain the SRWF row in update, so the value-ordering race was not formed.' : null),
    };

    wpEval(`GFAPI::delete_entry(${valueEntryId});`);
    const deletedValueEntryId = valueEntryId;
    valueEntryId = null;
    await waitFor(async () => !(await rowPresent(page, deletedValueEntryId)), pollTimeout, 'production-visible-cleanup');

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
    const transientMembershipReversion = heldContainsAdd && hostAfterMove === false && staleMembershipPresent;
    let membershipRecoveredNextPoll = !transientMembershipReversion;

    if (transientMembershipReversion) {
      await waitFor(async () => !(await rowPresent(page, assignmentId)), pollTimeout, 'assignment-recovery-remove');
      membershipRecoveredNextPoll = true;
    }

    evidence.assignment_membership_race = {
      status: heldContainsAdd && hostBeforeMove === true && hostAfterMove === false && newerMembershipExcludesEntry && absentBeforeRelease ? 'OBSERVED' : 'NOT_PROVEN',
      entry_id: assignmentId,
      held_response_add_contains_entry: heldContainsAdd,
      host_membership_before_move: hostBeforeMove,
      host_membership_after_move: hostAfterMove,
      newer_response_shape: newerMembershipResponse.shape,
      newer_response_excludes_entry: newerMembershipExcludesEntry,
      row_absent_before_release: absentBeforeRelease,
      stale_row_present_after_older_response: staleMembershipPresent,
      transient_membership_reversion: transientMembershipReversion,
      recovered_next_poll: membershipRecoveredNextPoll,
      final_row_absent: !(await rowPresent(page, assignmentId)),
      not_proven_reason: !heldContainsAdd
        ? 'The held native response did not contain the assignment row in add, so the membership-changing race was not formed.'
        : (hostBeforeMove !== true || hostAfterMove !== false
          ? 'Authoritative operator membership did not transition true-to-false.'
          : (!newerMembershipExcludesEntry || !absentBeforeRelease
            ? 'The newer native response/UI did not establish host-authoritative absence before the older add was released.'
            : null)),
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
    } catch {}
    try {
      if (assignmentFixture) {
        wpEval(`
          GFAPI::delete_entry(${Number(assignmentFixture.entry_id)});
          GFAPI::delete_form(${Number(assignmentFixture.form_id)});
        `);
      }
    } catch {}
    page.off('response', responseListener);
    await page.unroute(`**${changesPath}**`, routeHandler);
  }

  fs.writeFileSync(
    path.join(artifactDir, 'live-refresh-materiality.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
  return evidence;
}
