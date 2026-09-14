#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

ENTRYPOINT="gravity-presentation-profiles.php"
SOURCE_DIR="src"

# Exact file-level exceptions only. Every entry must name one existing src/*.php file.
DEFERRED_UNREACHABLE=(
)

fail() {
  echo "GPP_PRODUCTION_REACHABILITY_FAIL: $*" >&2
  exit 1
}

[[ -f "$ENTRYPOINT" ]] || fail "missing production entrypoint: $ENTRYPOINT"
[[ -d "$SOURCE_DIR" ]] || fail "missing production source directory: $SOURCE_DIR"

declare -a source_files=()
while IFS= read -r file; do
  source_files+=("$file")
done < <(find "$SOURCE_DIR" -type f -name '*.php' -print | LC_ALL=C sort)

((${#source_files[@]} > 0)) || fail "no production PHP files found under $SOURCE_DIR"

declare -A class_for_file=()
declare -A namespace_for_file=()
declare -A reachable=()
declare -A queued=()
declare -A deferred=()

for file in "${source_files[@]}"; do
  relative="${file#src/}"
  without_ext="${relative%.php}"
  class="GravityPresentationProfiles\\${without_ext//\//\\}"
  class_for_file["$file"]="$class"

  class_tail="${class#GravityPresentationProfiles\\}"
  if [[ "$class_tail" == *\\* ]]; then
    namespace_for_file["$file"]="${class%\\*}"
  else
    namespace_for_file["$file"]="GravityPresentationProfiles"
  fi
done

for file in "${DEFERRED_UNREACHABLE[@]}"; do
  [[ "$file" == src/*.php ]] || fail "deferred entry must be an exact src/*.php file: $file"
  [[ -f "$file" ]] || fail "deferred entry does not exist: $file"
  deferred["$file"]=1
done

references_class() {
  local source_file="$1"
  local candidate_file="$2"
  local class="${class_for_file[$candidate_file]}"
  local doubled="${class//\\/\\\\}"

  if grep -Fq -- "$class" "$source_file" || grep -Fq -- "$doubled" "$source_file"; then
    return 0
  fi

  [[ "$source_file" == src/*.php ]] || return 1

  local source_namespace="${namespace_for_file[$source_file]}"
  local candidate_namespace="${namespace_for_file[$candidate_file]}"
  [[ "$source_namespace" == "$candidate_namespace" ]] || return 1

  local short="${class##*\\}"
  grep -Fq -- "${short}::" "$source_file" \
    || grep -Fq -- "new ${short}" "$source_file" \
    || grep -Fq -- "instanceof ${short}" "$source_file"
}

declare -a queue=("$ENTRYPOINT")
queued["$ENTRYPOINT"]=1

while ((${#queue[@]} > 0)); do
  current="${queue[0]}"
  queue=("${queue[@]:1}")

  if [[ "$current" == src/*.php ]]; then
    reachable["$current"]=1
  fi

  for candidate in "${source_files[@]}"; do
    [[ -n "${reachable[$candidate]:-}" || -n "${queued[$candidate]:-}" ]] && continue
    if references_class "$current" "$candidate"; then
      queue+=("$candidate")
      queued["$candidate"]=1
    fi
  done
done

declare -a unexplained=()
for file in "${source_files[@]}"; do
  if [[ -n "${reachable[$file]:-}" ]]; then
    if [[ -n "${deferred[$file]:-}" ]]; then
      fail "deferred allowlist entry is now production-reachable and should be removed: $file"
    fi
    continue
  fi

  [[ -n "${deferred[$file]:-}" ]] || unexplained+=("$file")
done

if ((${#unexplained[@]} > 0)); then
  echo "GPP_PRODUCTION_REACHABILITY_FAIL: unexplained unreachable production PHP files:" >&2
  printf '  - %s\n' "${unexplained[@]}" >&2
  exit 1
fi

echo "GPP_PRODUCTION_REACHABILITY_PASS total=${#source_files[@]} reachable=${#reachable[@]} deferred=${#deferred[@]}"
