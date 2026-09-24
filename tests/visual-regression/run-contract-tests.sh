#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

before="$(sha256sum tests/visual-regression/references/manifest.json tests/visual-regression/inbox-visual-contract.json)"
node tests/visual-regression/comparator-falsification.mjs
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

echo 'VISUAL_DIAGNOSTIC_CONTRACT_TESTS_PASS baseline_immutability=true missing_reference_fails=true'
