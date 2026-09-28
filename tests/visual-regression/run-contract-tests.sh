#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

before="$(sha256sum tests/visual-regression/references/manifest.json tests/visual-regression/inbox-visual-contract.json)"
node tests/visual-regression/comparator-falsification.mjs
node tests/visual-regression/computed-styles-handoff-falsification.mjs
node tests/visual-regression/design-authority-contract.mjs
node tests/visual-regression/integrated-host-design-falsification.mjs
node tests/visual-regression/host-fixture-falsification.mjs
node tests/visual-regression/design-convergence-falsification.mjs
node tests/visual-regression/state-visual-falsification.mjs
node tests/visual-regression/font-authority-falsification.mjs
node tests/visual-regression/geometry-relations-falsification.mjs
node tests/visual-regression/coverage-truth-falsification.mjs
node tests/visual-regression/matrix-j-semantic-falsification.mjs
node tests/visual-regression/reference-identity-falsification.mjs
node tests/visual-regression/scenario-state-falsification.mjs
node tests/visual-regression/trigger-coverage-falsification.mjs
node tests/visual-regression/wu21-package-source-falsification.mjs
php tests/repro-evidence-lab/visual-diagnostics-digest-falsification.php

doc="docs/evidence/INBOX_VISUAL_REGRESSION_DIAGNOSTICS_V1.md"
if grep -Eq '\*\*J\*\*.*`NOT_EXECUTED`|`NOT_EXECUTED`.*\*\*J\*\*' "$doc"; then
  echo 'Matrix J documentation still claims NOT_EXECUTED.' >&2
  exit 1
fi
grep -Fq 'tests/visual-regression/inbox-visual-contract.json' "$doc"
grep -Fq 'matrix-j-browser-zoom.json' "$doc"

bash tests/visual-regression/repository-package-source-falsification.sh
bash tests/visual-regression/archive-policy-falsification.sh
after="$(sha256sum tests/visual-regression/references/manifest.json tests/visual-regression/inbox-visual-contract.json)"
test "$before" = "$after"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if node --input-type=module - "$tmp" <<'NODE'
import path from 'node:path';
import { comparePng } from './tests/visual-regression/visual-diagnostics-lib.mjs';
comparePng(path.join(process.argv[2], 'missing.png'), path.join(process.argv[2], 'actual.png'), path.join(process.argv[2], 'diff.png'), { pixel_threshold: .1, warning_ratio: .0001 });
NODE
then
  echo 'Missing required reference unexpectedly passed.' >&2
  exit 1
fi

# Native-First validator negative control. The old staged Card Mode failure schema
# is intentionally retired; prove instead that a structurally plausible artifact
# with the wrong exact-head identity still fails closed.
mkdir -p "$tmp/diagnostics"
cat > "$tmp/diagnostics/manifest.json" <<'JSON'
{"schema_version":"2.0.0","evidence_kind":"NATIVE_FIRST_STRUCTURAL_DIAGNOSTIC","repository_sha":"synthetic-invalid-head","architecture":"NATIVE_FIRST","superseded_architecture":"CARD_MODE","visual_golden_admission":"NOT_ATTEMPTED_OUT_OF_SCOPE","status":"PASS","failure":null,"scenarios":[]}
JSON
if node tests/visual-regression/validate-diagnostic-artifact.mjs "$tmp/diagnostics" 2> "$tmp/validator-error.log"; then
  echo 'Wrong-head Native-First diagnostic unexpectedly validated as PASS.' >&2
  exit 1
fi
grep -Fq 'exact-head identity mismatch' "$tmp/validator-error.log"

node - "$tmp" <<'NODE'
const fs=require('fs');const path=require('path');const root=process.argv[2];
const source=JSON.parse(fs.readFileSync('tests/visual-regression/references/manifest.json','utf8'));
const missing=structuredClone(source);missing.references[0].repository_path=path.join(root,'missing-design-authority.html');
fs.writeFileSync(path.join(root,'missing-authority.json'),JSON.stringify(missing));
const changed=structuredClone(source);changed.references[0].source_sha256='0'.repeat(64);
fs.writeFileSync(path.join(root,'changed-authority.json'),JSON.stringify(changed));
NODE
if node tests/visual-regression/design-authority-contract.mjs "$tmp/missing-authority.json" >/dev/null 2>&1; then
  echo 'Missing design authority unexpectedly passed.' >&2; exit 1
fi
if node tests/visual-regression/design-authority-contract.mjs "$tmp/changed-authority.json" >/dev/null 2>&1; then
  echo 'Modified design-authority hash unexpectedly passed.' >&2; exit 1
fi

echo 'VISUAL_DIAGNOSTIC_CONTRACT_TESTS_PASS baseline_immutability=true missing_reference_fails=true native_first_wrong_head_fails=true design_authority_fail_closed=true matrix_j_semantic_falsification=true visual_diagnostics_digest_falsification=true matrix_j_documentation_current=true'
