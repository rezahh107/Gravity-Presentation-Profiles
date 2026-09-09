import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateAdapterRegistry, validateLedger } from '../../scripts/validate-wu3-evidence.mjs';

function expectFailure(label, fn, expectedFragment) {
  let failed = false;
  try { fn(); } catch (error) {
    failed = true;
    if (!error.message.includes(expectedFragment)) {
      throw new Error(`${label} failed for unexpected reason: ${error.message}`);
    }
  }
  if (!failed) throw new Error(`${label} unexpectedly passed`);
}

function makePolicy() {
  return {
    default: 'DENY',
    claim_scope_rule: 'Synthetic fixtures and mocks may regression-test an already admitted adapter but cannot admit one.',
    qualifying_evidence_types: ['FIRST_PARTY_DOCUMENTATION', 'AUTHENTIC_RUNTIME'],
    production_adapter_locations: ['src/RuntimeAdapters', 'profiles/*/*/runtime-adapters'],
    required_source_marker: 'GPP_RUNTIME_ADAPTER_ID:<adapter_id>',
    first_party_documentation_hosts: {
      'Gravity Forms': ['gravityforms.com', 'docs.gravityforms.com'],
      'GP Advanced Select': ['gravitywiz.com'],
      'GP File Upload Pro': ['gravitywiz.com'],
      'PersianGravity': []
    },
    evidence_artifact_root: 'docs/validation/evidence'
  };
}

function writeEvidenceArtifact(root, name, content) {
  const relative = `docs/validation/evidence/${name}`;
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
  return {
    path: relative,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
  };
}


const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const repositoryLedger = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'docs', 'validation', 'wu3-validation-coverage.json'), 'utf8'));
const falseRuntimeProofLedger = structuredClone(repositoryLedger);
const runtimeClaim = falseRuntimeProofLedger.claims.find((claim) => claim.subject === 'gp_advanced_select_behavior_configuration');
runtimeClaim.state = 'RUNTIME_PROVEN';
runtimeClaim.evidence_refs = ['tests/wu3/fixtures/synthetic-registration.html'];
runtimeClaim.qualifying_evidence = [];
expectFailure('runtime evidence false promotion', () => validateLedger(falseRuntimeProofLedger, repositoryRoot), 'without qualifying authentic evidence');

const missingRuntimeSubjectLedger = structuredClone(repositoryLedger);
missingRuntimeSubjectLedger.claims = missingRuntimeSubjectLedger.claims.filter((claim) => claim.subject !== 'persiangravity_jalali_date_runtime');
expectFailure('missing required runtime subject', () => validateLedger(missingRuntimeSubjectLedger, repositoryRoot), 'missing required runtime subject');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpp-wu3-guard-'));
fs.mkdirSync(path.join(root, 'src', 'RuntimeAdapters'), { recursive: true });
const source = path.join(root, 'src', 'RuntimeAdapters', 'SyntheticProbe.php');
fs.writeFileSync(source, '<?php /* GPP_RUNTIME_ADAPTER_ID:test-gf-selector */\n', 'utf8');
const snapshot = writeEvidenceArtifact(root, 'test-first-party-contract.txt', 'test-only exact selector contract snapshot\n');

const emptyRegistry = { schema_version: '1.0.0', work_unit_id: 'WU-GPP-RUNTIME-INTEGRATION-03', policy: makePolicy(), adapters: [] };
expectFailure('unregistered adapter source', () => validateAdapterRegistry(emptyRegistry, root), 'unregistered production runtime-adapter file');

const baseAdapter = {
  adapter_id: 'test-gf-selector',
  component: 'Gravity Forms',
  version_scope: 'test-only exact-version-scope',
  configuration_scope: 'test-only exact-configuration-scope',
  lifecycle_sensitive: false,
  contract: { type: 'selector', exact_value: '.synthetic-only' },
  source_paths: ['src/RuntimeAdapters/SyntheticProbe.php']
};

const syntheticEvidenceRegistry = {
  schema_version: '1.0.0',
  work_unit_id: 'WU-GPP-RUNTIME-INTEGRATION-03',
  policy: makePolicy(),
  adapters: [{
    ...baseAdapter,
    evidence: [{
      type: 'SYNTHETIC_FIXTURE',
      reference: 'tests/fixture.html',
      provenance: 'test-only synthetic fixture',
      artifact_path: snapshot.path,
      artifact_sha256: snapshot.sha256
    }]
  }]
};
expectFailure('synthetic evidence admission', () => validateAdapterRegistry(syntheticEvidenceRegistry, root), 'not qualifying');

const wrongFirstPartyRegistry = structuredClone(syntheticEvidenceRegistry);
wrongFirstPartyRegistry.adapters[0].evidence = [{
  type: 'FIRST_PARTY_DOCUMENTATION',
  publisher: 'Third Party',
  reference: 'https://example.com/not-first-party',
  provenance: 'test-only invalid authority',
  contract_section: 'selector',
  accessed_at: '2026-09-09T00:00:00Z',
  artifact_path: snapshot.path,
  artifact_sha256: snapshot.sha256
}];
expectFailure('non-first-party documentation admission', () => validateAdapterRegistry(wrongFirstPartyRegistry, root), 'not admitted as first-party');

const digestMismatchRegistry = structuredClone(wrongFirstPartyRegistry);
digestMismatchRegistry.adapters[0].evidence[0] = {
  ...digestMismatchRegistry.adapters[0].evidence[0],
  publisher: 'Gravity Forms',
  reference: 'https://docs.gravityforms.com/test-only-structural-reference',
  artifact_sha256: '0'.repeat(64)
};
expectFailure('tampered evidence artifact', () => validateAdapterRegistry(digestMismatchRegistry, root), 'digest mismatch');

const positiveStructuralRegistry = structuredClone(wrongFirstPartyRegistry);
positiveStructuralRegistry.adapters[0].evidence = [{
  type: 'FIRST_PARTY_DOCUMENTATION',
  publisher: 'Gravity Forms',
  reference: 'https://docs.gravityforms.com/test-only-structural-reference',
  provenance: 'test-only structural record; not an admitted repository adapter',
  contract_section: 'test-only exact selector section',
  accessed_at: '2026-09-09T00:00:00Z',
  artifact_path: snapshot.path,
  artifact_sha256: snapshot.sha256
}];
validateAdapterRegistry(positiveStructuralRegistry, root);

const lifecycleRegistry = structuredClone(positiveStructuralRegistry);
lifecycleRegistry.adapters[0].lifecycle_sensitive = true;
expectFailure('lifecycle without timing evidence', () => validateAdapterRegistry(lifecycleRegistry, root), 'lifecycle/timing semantics');

fs.rmSync(root, { recursive: true, force: true });
console.log('WU3_ADAPTER_GUARD_FALSIFICATION_PASS');
