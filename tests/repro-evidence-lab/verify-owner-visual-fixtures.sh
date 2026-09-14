#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-.}"
fixture_dir="$repo_root/tests/fixtures/owner-visual"
html="$fixture_dir/PersianGravity-Visual-Reference-Final.html"
pdf="$fixture_dir/PersianGravity-Final-Print-Sample.pdf"
html_size='115728'
pdf_size='321990'
html_sha='666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81'
pdf_sha='34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5'

matches_identity() {
  local file="$1" expected_size="$2" expected_sha="$3"
  [[ -f "$file" ]] || return 1
  [[ "$(stat -c '%s' "$file")" = "$expected_size" ]] || return 1
  [[ "$(sha256sum "$file" | awk '{print $1}')" = "$expected_sha" ]]
}

matches_identity "$html" "$html_size" "$html_sha"
matches_identity "$pdf" "$pdf_size" "$pdf_sha"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp "$html" "$tmp/html-corrupt"
printf 'x' >> "$tmp/html-corrupt"
if matches_identity "$tmp/html-corrupt" "$html_size" "$html_sha"; then
  echo 'Corrupted Owner HTML unexpectedly passed identity verification.' >&2
  exit 1
fi

cp "$pdf" "$tmp/pdf-corrupt"
printf 'x' >> "$tmp/pdf-corrupt"
if matches_identity "$tmp/pdf-corrupt" "$pdf_size" "$pdf_sha"; then
  echo 'Corrupted Owner PDF unexpectedly passed identity verification.' >&2
  exit 1
fi

cp "$pdf" "$tmp/html-substitute"
if matches_identity "$tmp/html-substitute" "$html_size" "$html_sha"; then
  echo 'Substituted Owner HTML unexpectedly passed identity verification.' >&2
  exit 1
fi

cp "$html" "$tmp/pdf-substitute"
if matches_identity "$tmp/pdf-substitute" "$pdf_size" "$pdf_sha"; then
  echo 'Substituted Owner PDF unexpectedly passed identity verification.' >&2
  exit 1
fi

printf 'OWNER_VISUAL_FIXTURE_IDENTITY_PASS html_size=%s html_sha256=%s pdf_size=%s pdf_sha256=%s\n' \
  "$html_size" "$html_sha" "$pdf_size" "$pdf_sha"
