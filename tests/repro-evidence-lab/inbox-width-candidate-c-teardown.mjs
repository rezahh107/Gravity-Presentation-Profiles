// Exact WU21 integrity boundary for Candidate C's synthetic binding falsifier.
// The browser runtime test predates this guard and can leave a synthetic binding
// behind if its whole-option restore is ineffective. Recover only from the
// fixture's authoritative pre-test binding mirror, then independently prove a
// genuinely distinct/evidence-current ambiguity and remove it as an exact delta.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifactDir, wpCli, wpPath } from './inbox-visual-design-v2-browser-lib.mjs';

if (!artifactDir || !wpCli || !wpPath) throw new Error('Pinned WU21 lab required');
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const alpha = fixture.forms.find(item => item.key === 'alpha');
if (!alpha?.form_id) throw new Error('Candidate C binding integrity alpha form missing');

const legacySyntheticId = 'gpp.wu21.candidate-c.ambiguous';
const proofSyntheticId = 'gpp.wu21.candidate-c.ambiguity-proof';
const expectedContractIds = [
  'id',
  String(alpha.first_name_field_id),
  String(alpha.national_id_field_id),
  String(alpha.school_field_id),
  'date_created',
];
const script = path.join(artifactDir, `candidate-c-binding-integrity-${process.pid}.php`);
const php = String.raw`<?php
$state = get_option('gpp_binding_set_lifecycle_v1');
$mirror = get_option('gpp_wu21_binding_sets');
if (!is_array($state) || !isset($state['installed'], $state['activations']) || !is_array($mirror)) {
    throw new RuntimeException('Candidate C binding integrity prerequisites are unavailable.');
}
$form_id = ${Number(alpha.form_id)};
$legacy_synthetic_id = ${JSON.stringify(legacySyntheticId)};
$proof_synthetic_id = ${JSON.stringify(proofSyntheticId)};
$expected_contract_ids = ${JSON.stringify(expectedContractIds)};

$baseline_matches = array();
foreach ($mirror as $artifact) {
    if (!is_array($artifact)
        || (int)($artifact['context']['form_source_ref']['form_id'] ?? 0) !== $form_id
        || !in_array('gravity_flow.inbox', $artifact['context']['surfaces'] ?? array(), true)) {
        continue;
    }
    $baseline_matches[] = $artifact;
}
if (count($baseline_matches) !== 1) {
    throw new RuntimeException('WU21 mirror did not expose exactly one authoritative alpha Inbox binding.');
}
$baseline_artifact = $baseline_matches[0];
$baseline_id = $baseline_artifact['binding_set_id'];
$baseline_version = $baseline_artifact['binding_set_version'];
$baseline_key = \GravityPresentationProfiles\Core\Portable\CanonicalJson::hash($baseline_artifact['context']);
$baseline_record = $state['installed'][$baseline_id][$baseline_version] ?? null;
if (!is_array($baseline_record)
    || ($baseline_record['context_key'] ?? null) !== $baseline_key
    || ($baseline_record['artifact'] ?? null) !== $baseline_artifact) {
    throw new RuntimeException('Authoritative WU21 alpha binding record no longer matches its fixture mirror.');
}

$restore_baseline = static function (&$target_state) use ($baseline_id, $baseline_version, $baseline_key, $legacy_synthetic_id, $proof_synthetic_id, $form_id) {
    foreach ($target_state['activations'] as $context_key => $identity) {
        $binding_id = $identity['binding_set_id'] ?? null;
        if ($binding_id === $legacy_synthetic_id || $binding_id === $proof_synthetic_id) {
            unset($target_state['activations'][$context_key]);
        }
    }
    unset($target_state['installed'][$legacy_synthetic_id], $target_state['installed'][$proof_synthetic_id]);
    $target_state['activations'][$baseline_key] = array(
        'binding_set_id' => $baseline_id,
        'binding_set_version' => $baseline_version,
    );

    $unexpected = array();
    foreach ($target_state['activations'] as $context_key => $identity) {
        $record = $target_state['installed'][$identity['binding_set_id']][$identity['binding_set_version']] ?? null;
        $artifact = is_array($record) ? ($record['artifact'] ?? null) : null;
        if (!is_array($artifact)
            || (int)($artifact['context']['form_source_ref']['form_id'] ?? 0) !== $form_id
            || !in_array('gravity_flow.inbox', $artifact['context']['surfaces'] ?? array(), true)) {
            continue;
        }
        if ($context_key !== $baseline_key
            || ($identity['binding_set_id'] ?? null) !== $baseline_id
            || ($identity['binding_set_version'] ?? null) !== $baseline_version) {
            $unexpected[] = array($context_key, $identity);
        }
    }
    if ($unexpected) {
        throw new RuntimeException('Unexpected non-Candidate-C alpha Inbox activation exists; teardown refuses to hide it.');
    }
};

// Recover the exact pre-test activation from the WU21 mirror. This repairs the
// legacy falsifier even when it overwrote the original activation at the same
// context key instead of creating a second context.
$restore_baseline($state);
update_option('gpp_binding_set_lifecycle_v1', $state, false);
$state = get_option('gpp_binding_set_lifecycle_v1');
\GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::resetRuntimeCache();
$restored_contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract(array('form_id' => $form_id));
if (!is_array($restored_contract)
    || (int)($restored_contract['form_id'] ?? 0) !== $form_id
    || array_values(array_map('strval', $restored_contract['column_ids'] ?? array())) !== $expected_contract_ids) {
    throw new RuntimeException('Candidate C baseline recovery did not restore the authoritative alpha geometry contract.');
}

// Build a genuinely distinct admitted context from the authoritative baseline.
// Unlike the legacy falsifier, this must not collide with the original context.
$clone = $baseline_record;
$clone['binding_set_id'] = $proof_synthetic_id;
$clone['artifact']['binding_set_id'] = $proof_synthetic_id;
$context_candidates = array(
    array('gravity_flow.inbox'),
    array('gravity_flow.inbox', 'gravity_flow.entry_detail'),
    array('gravity_flow.inbox', 'print.dossier'),
);
$proof_key = null;
foreach ($context_candidates as $surfaces) {
    $clone['artifact']['context']['surfaces'] = $surfaces;
    $candidate_key = \GravityPresentationProfiles\Core\Portable\CanonicalJson::hash($clone['artifact']['context']);
    if ($candidate_key !== $baseline_key && !isset($state['activations'][$candidate_key])) {
        $proof_key = $candidate_key;
        break;
    }
}
if (null === $proof_key) {
    throw new RuntimeException('Could not construct a distinct admitted context for the ambiguity proof.');
}

// Availability evidence identity includes binding ID and context. Recompute the
// exact refs so the second binding is evidence-current rather than merely stale.
$sources = array();
foreach ($clone['artifact']['bindings'] as $binding) {
    if (($binding['state'] ?? null) === 'PROVEN' && is_array($binding['source_ref'] ?? null)) {
        $sources[$binding['semantic_slot_key']] = $binding['source_ref'];
    }
}
foreach ($clone['artifact']['runtime_claims'] as &$claim) {
    if (($claim['claim'] ?? null) !== 'availability' || ($claim['evidence_state'] ?? null) !== 'PROVEN') {
        continue;
    }
    $slot = $claim['semantic_slot_key'] ?? null;
    if (!isset($sources[$slot])) {
        throw new RuntimeException('Ambiguity proof availability claim lost its proven source.');
    }
    $claim['evidence_refs'] = array(
        \GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeEvidence::availabilityRef(
            $clone['artifact'],
            $slot,
            $sources[$slot]
        ),
    );
}
unset($claim);
$clone['context_key'] = $proof_key;
$clone['content_hash'] = \GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet::contentHash($clone['artifact']);
$state['installed'][$proof_synthetic_id][$baseline_version] = $clone;
$state['activations'][$proof_key] = array(
    'binding_set_id' => $proof_synthetic_id,
    'binding_set_version' => $baseline_version,
);
update_option('gpp_binding_set_lifecycle_v1', $state, false);

\GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::resetRuntimeCache();
$ambiguous_contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract(array('form_id' => $form_id));
if (null !== $ambiguous_contract) {
    throw new RuntimeException('Two evidence-current alpha Inbox bindings did not fail geometry resolution closed.');
}

\GravityPresentationProfiles\SRWF\GravityFlow\InboxInitialGeometryGuard::resetRuntimeCache();
$columns = array(
    'id' => 'Operations',
    (string)${Number(alpha.first_name_field_id)} => 'Student',
    (string)${Number(alpha.national_id_field_id)} => 'National ID',
    (string)${Number(alpha.school_field_id)} => 'School',
    'date_created' => 'Submitted',
    'date_created_human_readable' => 'Submitted display',
);
\GravityPresentationProfiles\SRWF\GravityFlow\InboxInitialGeometryGuard::captureResolvedContract($columns, array('form_id' => $form_id));
$request_contract = new ReflectionProperty(\GravityPresentationProfiles\SRWF\GravityFlow\InboxInitialGeometryGuard::class, 'request_contract');
$request_contract->setAccessible(true);
if (null !== $request_contract->getValue()) {
    throw new RuntimeException('Candidate C captured a request contract despite genuinely ambiguous bindings.');
}

// Remove only the proof delta and restore the exact WU21 baseline again.
$state = get_option('gpp_binding_set_lifecycle_v1');
$restore_baseline($state);
update_option('gpp_binding_set_lifecycle_v1', $state, false);
$state = get_option('gpp_binding_set_lifecycle_v1');
if (isset($state['installed'][$legacy_synthetic_id]) || isset($state['installed'][$proof_synthetic_id])) {
    throw new RuntimeException('Candidate C synthetic binding remained installed after final cleanup.');
}
\GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::resetRuntimeCache();
$final_contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract(array('form_id' => $form_id));
if (!is_array($final_contract)
    || (int)($final_contract['form_id'] ?? 0) !== $form_id
    || array_values(array_map('strval', $final_contract['column_ids'] ?? array())) !== $expected_contract_ids) {
    throw new RuntimeException('Candidate C final cleanup did not restore the authoritative alpha geometry contract.');
}

echo wp_json_encode(array(
    'status' => 'PASS',
    'baseline' => array(
        'context_key' => $baseline_key,
        'binding_set_id' => $baseline_id,
        'binding_set_version' => $baseline_version,
        'contract' => $final_contract,
    ),
    'legacy_recovery' => 'RESTORED_FROM_WU21_BINDING_MIRROR',
    'ambiguity_proof' => array(
        'synthetic_context_key' => $proof_key,
        'distinct_from_baseline' => $proof_key !== $baseline_key,
        'evidence_current' => true,
        'resolved_contract' => $ambiguous_contract,
        'guard_request_contract' => null,
    ),
));
`;

fs.writeFileSync(script, php, 'utf8');
let command;
try {
  command = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', script], {encoding: 'utf8'});
} finally {
  fs.rmSync(script, {force: true});
}
if (command?.error) throw command.error;
if (command?.status !== 0) {
  throw new Error(`Candidate C binding integrity failed status=${command?.status}\n${command?.stderr || ''}\n${command?.stdout || ''}`);
}
const readback = JSON.parse((command.stdout || '').trim());
assert.equal(readback.status, 'PASS');
assert.equal(readback.ambiguity_proof.distinct_from_baseline, true);
assert.equal(readback.ambiguity_proof.evidence_current, true);
assert.equal(readback.ambiguity_proof.resolved_contract, null);
assert.equal(readback.ambiguity_proof.guard_request_contract, null);

// Correct the legacy runtime artifact's label: that inline mutation can collide
// with the baseline context, so it remains only a fail-closed control. The true
// ambiguity proof above is the authoritative evidence for this scope predicate.
const runtimePath = path.join(artifactDir, 'inbox-width-candidate-c-production-runtime.json');
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const legacy = runtime.scope_falsification?.find(item => item.scenario === 'ambiguous_binding_resolution');
if (legacy) {
  legacy.scenario = 'legacy_binding_collision_fail_closed_control';
  legacy.evidence_limit = 'Not used as the ambiguity proof; the mutation may reuse the baseline context key.';
}
runtime.scope_falsification = runtime.scope_falsification || [];
runtime.scope_falsification.push({
  scenario: 'ambiguous_binding_resolution',
  attached: 0,
  proof: 'TWO_DISTINCT_EVIDENCE_CURRENT_ACTIVE_BINDINGS',
  context_key: readback.ambiguity_proof.synthetic_context_key,
  resolved_contract: null,
  guard_request_contract: null,
});
fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2) + '\n');
fs.writeFileSync(
  path.join(artifactDir, 'inbox-width-candidate-c-teardown.json'),
  JSON.stringify(readback, null, 2) + '\n'
);
console.log('CANDIDATE_C_BINDING_TEARDOWN_PASS');
console.log('CANDIDATE_C_TRUE_AMBIGUITY_PROOF_PASS');
