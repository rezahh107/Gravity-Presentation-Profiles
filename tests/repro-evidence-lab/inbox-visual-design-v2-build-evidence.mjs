import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.WU21_ARTIFACT_DIR;
if (!dir) throw new Error('WU21_ARTIFACT_DIR required.');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const setup = read('inbox-visual-design-v2-qualification-setup.json');
const q1 = read('inbox-visual-design-v2-q1.json');
const q2 = read('inbox-visual-design-v2-q2.json');
const q4 = read('inbox-visual-design-v2-q4.json');
if ([q1,q2,q4].some(q => q.execution_status !== 'CAPTURED')) throw new Error('Qualification browser capture incomplete.');
await import('./inbox-visual-design-v2-contract-falsification.mjs');
const workspace = process.env.GITHUB_WORKSPACE;
if (!workspace) throw new Error('GITHUB_WORKSPACE required for exact checkout provenance.');
const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(exactHead)) throw new Error(`Invalid checked-out repository Head: ${exactHead}`);

const bindingMatrix = 'docs/visual/SRWF_GRAVITY_FLOW_DATA_ASSET_BINDING_MATRIX_v1.0.0.md';
const evidence = {
  artifact_type: 'gpp.inbox_visual_design_v2.qualification_batch_1_evidence',
  schema_version: '1.0.0',
  evidence_ceiling: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
  repository: {
    full_name: process.env.GITHUB_REPOSITORY,
    exact_head: exactHead,
    github_event_sha: process.env.GITHUB_SHA || null,
    provenance_rule: 'exact_head is git rev-parse HEAD from the checkout already asserted by the workflow; github_event_sha is retained separately because pull_request events may expose a temporary merge ref SHA.',
  },
  runtime: setup.runtime,
  synthetic_data: setup.data_class,
  qualifications: { q1, q2, q4 },
  live_refresh: {
    status: q1.live_refresh?.update_poll_status === 200 && q1.live_refresh?.add_poll_status === 200 && q4.flags?.update_observed && q4.flags?.add_observed && q4.flags?.remove_observed && q4.flags?.same_native_grid ? 'PASS' : 'FAIL',
    same_native_grid: Boolean(q4.flags?.same_native_grid),
    native_polling_update: Boolean(q4.flags?.update_observed),
    native_polling_add: Boolean(q4.flags?.add_observed),
    native_polling_remove: Boolean(q4.flags?.remove_observed),
    no_duplicate_state: Boolean(q4.flags?.one_native_pager && q4.flags?.one_native_grid && q4.flags?.one_native_search && q4.flags?.unique_row_identity),
  },
  target_bindings: {
    student_name: {
      state: 'UNBOUND',
      reason: 'The repository binding matrix defines student.full_name as a presentation derivation from canonical student.first_name + student.last_name, while both concrete target field IDs remain unbound.',
      source_document: bindingMatrix,
    },
    school: {
      state: 'UNBOUND',
      reason: 'The repository binding matrix defines school.name and its SRWF source family, but concrete target field IDs and Inbox exposure remain unbound.',
      source_document: bindingMatrix,
    },
    grade_group: {
      state: 'UNBOUND',
      reason: 'The repository binding matrix defines education.grade_group from SRWF GRADE_GROUP_SELECTION, but the concrete target field ID remains unbound.',
      source_document: bindingMatrix,
    },
    identity_semantic_source: {
      state: 'NOT_PROVEN',
      reason: 'No current repository evidence proves the authorized target field/value mapping for the semantic icon source.',
      source_document: 'docs/design/GPP_INBOX_DESIGN_TOOLBOX_V1.1.md',
    },
    workflow_status_source: {
      state: 'NOT_PROVEN',
      reason: 'The repository binding matrix leaves workflow.status target display/configuration not proven; the synthetic runtime proves host workflow/current-step mechanics only and does not establish the target row-chip meaning/source.',
      source_document: bindingMatrix,
    },
  },
  persian_gravity_reuse: {
    state: 'REUSED_EXISTING_CONTRACT',
    owner: 'PersianGravity',
    provider_version: '4.6.0',
    provider_source: 'd134c9ac81b177a32a3138f074fca3d1c1ebfae4',
    canonical_source: 'entry.created_at -> Gravity Forms entry.date_created',
    month_chip_required: false,
    q1_required_for_date_presentation: false,
    gpp_conversion_algorithm_allowed: false,
    source_document: 'docs/architecture/PERSIANGRAVITY_JALALI_CONSUMER_V1.md',
  },
  admitted_design_mechanisms: {
    flow_html_cell_value_path: q1.status === 'PASS' ? 'ADMITTED_BY_Q1' : q1.status === 'FAIL' ? 'NOT_ADMITTED_BY_Q1' : 'CONDITIONAL_NOT_PROVEN',
    semantic_svg_same_path: q1.status === 'PASS' && q1.flags?.svg_rendered ? 'ADMITTED_BY_Q1' : 'NOT_ADMITTED',
    native_rtl_behavior_without_enableRtl: q2.status === 'PASS' ? 'ADMITTED_OBSERVED_BEHAVIOR' : 'NOT_PROVEN',
    native_page2_live_refresh_lifecycle: q4.status === 'PASS' ? 'ADMITTED_OBSERVED_BEHAVIOR' : 'NOT_PROVEN',
    native_pager_presentation_ownership: 'GPP_PAINT_ONLY__FLOW_STATE_OWNER',
  },
  forbidden_or_unopened: {
    custom_renderer_registry: 'NOT_USED',
    mutation_observer_decoration: 'NOT_USED',
    post_render_patch_loop: 'NOT_USED',
    grid_takeover: 'NOT_USED',
    custom_paging_state: 'NOT_USED',
    q3_geometry: 'NOT_EXECUTED_BY_CONTRACT',
  },
  scope_ceiling: {
    target_production_equivalence: 'NOT_PROVEN',
    final_visual_approval: 'NOT_GRANTED',
    implementation_approval: 'NOT_GRANTED',
    runtime_golden_activation: 'NOT_GRANTED',
  },
};
fs.writeFileSync(path.join(dir, 'inbox-visual-design-v2-qualification-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ exact_head: exactHead, q1: q1.status, q2: q2.status, q4: q4.status, live_refresh: evidence.live_refresh.status }, null, 2));
