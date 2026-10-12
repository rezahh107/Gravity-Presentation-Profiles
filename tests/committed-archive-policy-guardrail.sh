#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/validate-committed-archives.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# An extracted ZIP lacks Git metadata and must never report a pass.
mkdir -p "$TMP/no-git"
if (cd "$TMP/no-git" && bash "$CHECK") >"$TMP/no-git.out" 2>&1; then
  echo 'Missing Git worktree incorrectly passed the archive policy.' >&2
  exit 1
fi
grep -Fq 'COMMITTED_ARCHIVE_POLICY_FAIL:' "$TMP/no-git.out"

# Empty Git index is a valid zero-archive result.
mkdir -p "$TMP/repo"
git -C "$TMP/repo" init -q
(cd "$TMP/repo" && bash "$CHECK") >"$TMP/empty.out" 2>&1
grep -Fq 'COMMITTED_ARCHIVE_POLICY_PASS tracked_zip_count=0' "$TMP/empty.out"

# Exactly one admitted WU21 fixture ZIP passes.
allowed='tests/fixtures/wu21-packages/gravityforms-3.1.1.1-owner-supplied-source-package.zip'
mkdir -p "$TMP/repo/$(dirname "$allowed")"
: >"$TMP/repo/$allowed"
git -C "$TMP/repo" add -- "$allowed"
(cd "$TMP/repo" && bash "$CHECK") >"$TMP/allowed.out" 2>&1
grep -Fq 'COMMITTED_ARCHIVE_POLICY_PASS tracked_zip_count=1' "$TMP/allowed.out"

# An unrelated ZIP is still rejected.
: >"$TMP/repo/unapproved.zip"
git -C "$TMP/repo" add -- unapproved.zip
if (cd "$TMP/repo" && bash "$CHECK") >"$TMP/rejected.out" 2>&1; then
  echo 'Unapproved tracked ZIP incorrectly passed the archive policy.' >&2
  exit 1
fi
grep -Fq 'outside the explicit WU21 fixture allowlist: unapproved.zip' "$TMP/rejected.out"

echo 'GPP_COMMITTED_ARCHIVE_POLICY_GUARDRAIL_PASS'
