#!/usr/bin/env bash
set -euo pipefail
zip_path="${1:?usage: verify-checksum.sh ZIP CHECKSUM_FILE}"
checksum_file="${2:?missing checksum file}"
cd "$(dirname "$zip_path")"
expected_name="$(basename "$zip_path")"
line="$(cat "$checksum_file")"
[[ "$line" == *"  $expected_name" ]] || { echo "checksum filename mismatch" >&2; exit 1; }
echo "$line" | sha256sum -c -
echo GPP_RELEASE_CHECKSUM_PASS
