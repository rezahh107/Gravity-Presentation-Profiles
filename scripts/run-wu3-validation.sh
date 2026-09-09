#!/usr/bin/env bash
set -euo pipefail

printf 'node_version=%s\n' "$(node --version)"

if [[ -n "${CHROME_BIN:-}" ]]; then
  if [[ ! -x "${CHROME_BIN}" ]]; then
    echo "CHROME_BIN is set but is not executable: ${CHROME_BIN}" >&2
    exit 1
  fi
  printf 'browser=%s\n' "$("${CHROME_BIN}" --version)"
elif command -v google-chrome >/dev/null 2>&1; then
  printf 'browser=%s\n' "$(google-chrome --version)"
elif command -v google-chrome-stable >/dev/null 2>&1; then
  printf 'browser=%s\n' "$(google-chrome-stable --version)"
elif command -v chromium >/dev/null 2>&1; then
  printf 'browser=%s\n' "$(chromium --version)"
elif command -v chromium-browser >/dev/null 2>&1; then
  printf 'browser=%s\n' "$(chromium-browser --version)"
else
  echo 'No Chrome/Chromium browser found for WU3 validation.' >&2
  exit 1
fi

node scripts/validate-wu3-evidence.mjs
node tests/wu3/evidence-guard-falsification.mjs
node tests/wu3/run-browser-validation.mjs
