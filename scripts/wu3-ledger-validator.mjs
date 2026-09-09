import { fail, ensureString, validateRuntimeClaimEvidence, defaultRepoRoot } from './wu3-evidence-common.mjs';

export function validateLedger(ledger, repoRoot = defaultRepoRoot) {
  if (ledger.schema_version !== '1.0.0') fail('WU3 ledger schema_version must be 1.0.0');
  if (ledger.work_unit_id !== 'WU-GPP-RUNTIME-INTEGRATION-03') fail('WU3 ledger work_unit_id mismatch');
  ensureString(ledger.claim_scope_rule, 'claim_scope_rule');
  if (!ledger.claim_scope_rule.includes('not authentic Gravity ecosystem runtime PASS')) {
    fail('claim_scope_rule must explicitly deny fixture-to-runtime PASS promotion');
  }

  const historical = ledger.supersession?.historical_canonical_criteria;
  const active = ledger.supersession?.active_replacement_criteria;
  const expectedHistorical = Array.from({ length: 7 }, (_, i) => `AC-WU3-00${i + 1}`);
  const expectedActive = Array.from({ length: 10 }, (_, i) => `AC-WU3R-${String(i + 1).padStart(3, '0')}`);
  if (JSON.stringify(historical) !== JSON.stringify(expectedHistorical)) fail('Historical AC-WU3-001..007 set must be preserved exactly');
  if (JSON.stringify(active) !== JSON.stringify(expectedActive)) fail('Active AC-WU3R-001..010 set must be declared exactly');
  if (ledger.supersession?.numbering_equivalence !== null) fail('No one-to-one supersession numbering equivalence may be invented');

  if (!Array.isArray(ledger.claims) || ledger.claims.length === 0) fail('ledger claims must be non-empty');
  const ids = new Set();
  for (const claim of ledger.claims) {
    ensureString(claim.claim_id, 'claim_id');
    if (ids.has(claim.claim_id)) fail(`duplicate claim_id: ${claim.claim_id}`);
    ids.add(claim.claim_id);
    if (!['CI_BLOCKING', 'RUNTIME_EVIDENCE'].includes(claim.classification)) fail(`invalid classification for ${claim.claim_id}`);
    if (!['CI_PROVEN', 'RUNTIME_PROVEN', 'NOT_PROVEN'].includes(claim.state)) fail(`invalid state for ${claim.claim_id}`);
    ensureString(claim.subject, `${claim.claim_id}.subject`);
    ensureString(claim.proof_method, `${claim.claim_id}.proof_method`);
    ensureString(claim.evidence_provenance, `${claim.claim_id}.evidence_provenance`);
    if (!Array.isArray(claim.evidence_refs)) fail(`${claim.claim_id}.evidence_refs must be an array`);
    if (claim.classification === 'CI_BLOCKING' && claim.state !== 'CI_PROVEN') fail(`${claim.claim_id} is blocking and must be CI_PROVEN`);
    if (claim.classification === 'RUNTIME_EVIDENCE' && claim.state === 'CI_PROVEN') fail(`${claim.claim_id} cannot use CI_PROVEN for authentic runtime evidence`);
    if (claim.classification === 'RUNTIME_EVIDENCE') {
      if (!Array.isArray(claim.qualifying_evidence)) fail(`${claim.claim_id}.qualifying_evidence must be an array`);
      if (claim.state === 'NOT_PROVEN' && claim.qualifying_evidence.length !== 0) fail(`${claim.claim_id} is NOT_PROVEN but carries qualifying runtime evidence`);
      if (claim.state === 'RUNTIME_PROVEN') {
        if (claim.evidence_refs.length === 0 || claim.qualifying_evidence.length === 0) fail(`${claim.claim_id} cannot be RUNTIME_PROVEN without qualifying authentic evidence`);
        for (const evidence of claim.qualifying_evidence) validateRuntimeClaimEvidence(evidence, repoRoot, claim.claim_id);
      }
    }
  }

  const blockingCriteria = ['AC-WU3R-001','AC-WU3R-002','AC-WU3R-003','AC-WU3R-004','AC-WU3R-005','AC-WU3R-006','AC-WU3R-007','AC-WU3R-008','AC-WU3R-010'];
  for (const criterion of blockingCriteria) {
    if (!ledger.claims.some((c) => c.criterion === criterion && c.classification === 'CI_BLOCKING' && c.state === 'CI_PROVEN')) {
      fail(`missing CI_PROVEN blocking claim for ${criterion}`);
    }
  }

  const requiredRuntimeSubjects = [
    'authentic_gravity_forms_markup_lifecycle',
    'host_generated_aria_screen_reader',
    'authentic_submission_lifecycle',
    'gp_advanced_select_behavior_configuration',
    'gp_file_upload_pro_behavior_configuration',
    'persiangravity_jalali_date_runtime',
    'authentic_gravity_forms_help_error_validation_relations',
    'authentic_host_focus_management_reading_order',
    'host_composed_contrast',
    'host_composed_reflow'
  ];
  for (const subject of requiredRuntimeSubjects) {
    const claim = ledger.claims.find((c) => c.subject === subject && c.classification === 'RUNTIME_EVIDENCE');
    if (!claim) fail(`missing required runtime subject: ${subject}`);
    if (!['NOT_PROVEN', 'RUNTIME_PROVEN'].includes(claim.state)) fail(`runtime subject ${subject} has contradictory state ${claim.state}`);
  }

  return true;
}
