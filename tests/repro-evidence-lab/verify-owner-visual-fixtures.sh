#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-.}"
fixture_dir="$repo_root/tests/fixtures/owner-visual"
legacy_html="$fixture_dir/PersianGravity-Visual-Reference-Final.html"
entry_html="$fixture_dir/PersianGravity-Visual-Reference-Final-vNext.html"
pdf="$fixture_dir/PersianGravity-Final-Print-Sample.pdf"
legacy_html_size='115728'
entry_html_size='119765'
pdf_size='321990'
legacy_html_sha='666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81'
entry_html_sha='1934967b81d82ee77c60ffd547dde6fa7c8a310dbde94556686bd3d515d62a69'
pdf_sha='34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5'

matches_identity() {
  local file="$1" expected_size="$2" expected_sha="$3"
  [[ -f "$file" ]] || return 1
  [[ "$(stat -c '%s' "$file")" = "$expected_size" ]] || return 1
  [[ "$(sha256sum "$file" | awk '{print $1}')" = "$expected_sha" ]]
}

matches_identity "$legacy_html" "$legacy_html_size" "$legacy_html_sha"
matches_identity "$entry_html" "$entry_html_size" "$entry_html_sha"
matches_identity "$pdf" "$pdf_size" "$pdf_sha"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for pair in \
  "$legacy_html|$legacy_html_size|$legacy_html_sha|legacy-html" \
  "$entry_html|$entry_html_size|$entry_html_sha|entry-vnext-html" \
  "$pdf|$pdf_size|$pdf_sha|print-pdf"; do
  IFS='|' read -r source size sha label <<<"$pair"
  cp "$source" "$tmp/$label-corrupt"
  printf 'x' >> "$tmp/$label-corrupt"
  if matches_identity "$tmp/$label-corrupt" "$size" "$sha"; then
    echo "Corrupted $label unexpectedly passed identity verification." >&2
    exit 1
  fi
done

if matches_identity "$legacy_html" "$entry_html_size" "$entry_html_sha"; then
  echo 'Legacy combined HTML unexpectedly satisfies Entry Detail vNext authority.' >&2
  exit 1
fi
if matches_identity "$entry_html" "$legacy_html_size" "$legacy_html_sha"; then
  echo 'Entry Detail vNext HTML unexpectedly satisfies legacy combined authority.' >&2
  exit 1
fi

printf 'OWNER_VISUAL_FIXTURE_IDENTITY_PASS legacy_html_size=%s legacy_html_sha256=%s entry_vnext_size=%s entry_vnext_sha256=%s pdf_size=%s pdf_sha256=%s\n' \
  "$legacy_html_size" "$legacy_html_sha" "$entry_html_size" "$entry_html_sha" "$pdf_size" "$pdf_sha"
