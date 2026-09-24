import assert from 'node:assert/strict';
import { assertSerializedReferenceIdentity, SAME_RUN_REFERENCE_IDENTITY, selectComparisonReference } from './reference-selection.mjs';

const preview = selectComparisonReference({ mode: 'PREVIEW_DIAGNOSTIC' }, { id: 'preview' });
assert.equal(preview.kind, 'SAME_RUN_CAPTURE');
assert.equal(preview.identity, SAME_RUN_REFERENCE_IDENTITY);

const approved = selectComparisonReference(
  { mode: 'APPROVED_VISUAL_CONTRACT' },
  { id: 'approved', reference: { path: 'approved.png', classification: 'OWNER_APPROVED_GOLDEN' } },
);
assert.equal(approved.kind, 'VERSIONED_REFERENCE_FILE');
assert.equal(approved.identity, 'OWNER_APPROVED_GOLDEN');
assert.notEqual(approved.identity, SAME_RUN_REFERENCE_IDENTITY);

assert.throws(
  () => selectComparisonReference({ mode: 'APPROVED_VISUAL_CONTRACT' }, { id: 'approved-missing' }),
  /has no approved Golden/,
);
assert.throws(
  () => selectComparisonReference(
    { mode: 'APPROVED_VISUAL_CONTRACT' },
    { id: 'approved-wrong', reference: { path: 'wrong.png', classification: 'PREVIEW_RUNTIME_BASELINE' } },
  ),
  /not backed by an Owner-approved Golden/,
);

assert.equal(assertSerializedReferenceIdentity({
  metrics: { reference_identity: preview.identity },
  environment: { base_reference_identity: preview.identity },
  scenario: { id: 'preview', reference_identity: preview.identity },
  mode: 'PREVIEW_DIAGNOSTIC',
}), SAME_RUN_REFERENCE_IDENTITY);

assert.equal(assertSerializedReferenceIdentity({
  metrics: { reference_identity: approved.identity },
  environment: { base_reference_identity: approved.identity },
  scenario: { id: 'approved', reference_identity: approved.identity },
  mode: 'APPROVED_VISUAL_CONTRACT',
}), 'OWNER_APPROVED_GOLDEN');

assert.throws(() => assertSerializedReferenceIdentity({
  metrics: { reference_identity: 'FORGED_REFERENCE' },
  environment: { base_reference_identity: approved.identity },
  scenario: { id: 'forged', reference_identity: approved.identity },
  mode: 'APPROVED_VISUAL_CONTRACT',
}), /serialized reference identity mismatch/);

console.log('REFERENCE_IDENTITY_FALSIFICATION_PASS preview_same_run=true approved_identity_preserved=true forged_identity_rejected=true');
