#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

before="$(sha256sum tests/visual-regression/references/manifest.json tests/visual-regression/inbox-visual-contract.json)"
node tests/visual-regression/comparator-falsification.mjs
node tests/visual-regression/computed-styles-handoff-falsification.mjs
node tests/visual-regression/design-authority-contract.mjs
node tests/visual-regression/integrated-host-design-falsification.mjs
node tests/visual-regression/reference-identity-falsification.mjs
node tests/visual-regression/scenario-state-falsification.mjs
node tests/visual-regression/trigger-coverage-falsification.mjs
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

mkdir -p "$tmp/diagnostics/shortcode-desktop"
cat > "$tmp/diagnostics/manifest.json" <<'JSON'
{"mode":"PREVIEW_DIAGNOSTIC","status":"VISUAL_TEST_INFRASTRUCTURE_FAILURE","infrastructure_failure":{"scenario":"shortcode-desktop","failed_stage":"geometry_capture","error":{"stack":"SyntheticStageError: diagnostic probe"}}}
JSON
printf '%s\n' '{"status":"VISUAL_TEST_INFRASTRUCTURE_FAILURE"}' > "$tmp/diagnostics/shortcode-desktop/infrastructure-failure.json"
printf '%s\n' '{"active_stage":"geometry_capture"}' > "$tmp/diagnostics/shortcode-desktop/capture-state.json"
if node tests/visual-regression/validate-diagnostic-artifact.mjs "$tmp/diagnostics" 2> "$tmp/validator-error.log"; then
  echo 'Infrastructure-failure artifact unexpectedly validated as PASS.' >&2
  exit 1
fi
grep -Fq 'shortcode-desktop failed at geometry_capture: SyntheticStageError: diagnostic probe' "$tmp/validator-error.log"

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

echo 'VISUAL_DIAGNOSTIC_CONTRACT_TESTS_PASS baseline_immutability=true missing_reference_fails=true staged_failure_provenance=true design_authority_fail_closed=true'
