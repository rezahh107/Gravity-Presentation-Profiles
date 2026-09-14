#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

ENTRYPOINT="gravity-presentation-profiles.php"
SOURCE_DIR="src"
EXTRACTOR="scripts/extract-production-references.php"

# Exact file-level exceptions only. These are admitted source contracts/helpers
# that remain intentionally non-rooted in the current production activation graph.
DEFERRED_UNREACHABLE=(
)

# Production invariants. These files must both exist and be reached from the real
# plugin entrypoint. Keeping this separate from the general orphan check prevents
# a required runtime/contract dependency from disappearing and turning the graph falsely green.
REQUIRED_REACHABLE=(
  "src/SRWF/GravityFlow/InboxPresentationAdapter.php"
  "src/SRWF/GravityFlow/InboxPresentationModel.php"
  "src/SRWF/GravityFlow/PersianDateFormatter.php"
  "src/Core/Lifecycle/BindingEvidenceGate.php"
  "src/Core/Lifecycle/BindingSetLifecycle.php"
  "src/Core/Lifecycle/EvidenceReferenceGate.php"
  "src/Core/Lifecycle/InstalledVisualProfileCatalog.php"
  "src/Core/Lifecycle/LifecycleException.php"
  "src/Core/Lifecycle/SettingsLifecycleWorkflow.php"
  "src/Core/Lifecycle/StateStore.php"
  "src/Core/Lifecycle/VisualPackageLifecycle.php"
  "src/Core/Lifecycle/WordPressOptionStateStore.php"
  "src/Core/Portable/CanonicalJson.php"
  "src/Core/Portable/ContractViolation.php"
  "src/Core/Portable/EnvironmentBindingSet.php"
  "src/Core/Portable/SemanticBindingResolver.php"
  "src/Core/Portable/VisualProfilePackage.php"
  "src/Core/Portable/VisualProfilePackageV11.php"
  "src/Core/Portable/VisualProfileResolver.php"
  "src/GravityForms/DeclarativePresentationResolver.php"
  "src/GravityForms/DeclarativeProfileDefinition.php"
)

fail() {
  echo "GPP_PRODUCTION_REACHABILITY_FAIL: $*" >&2
  exit 1
}

[[ -f "$ENTRYPOINT" ]] || fail "missing production entrypoint: $ENTRYPOINT"
[[ -d "$SOURCE_DIR" ]] || fail "missing production source directory: $SOURCE_DIR"
[[ -f "$EXTRACTOR" ]] || fail "missing token-aware dependency extractor: $EXTRACTOR"
command -v php >/dev/null 2>&1 || fail "PHP CLI is required for token-aware dependency extraction"

declare -a source_files=()
declare -A source_file_set=()
while IFS= read -r file; do
  source_files+=("$file")
  source_file_set["$file"]=1
done < <(find "$SOURCE_DIR" -type f -name '*.php' -print | LC_ALL=C sort)

((${#source_files[@]} > 0)) || fail "no production PHP files found under $SOURCE_DIR"

declare -A reachable=()
declare -A queued=()
declare -A deferred=()

for file in "${DEFERRED_UNREACHABLE[@]}"; do
  [[ "$file" == src/*.php ]] || fail "deferred entry must be an exact src/*.php file: $file"
  [[ -f "$file" ]] || fail "deferred entry does not exist: $file"
  deferred["$file"]=1
done

for file in "${REQUIRED_REACHABLE[@]}"; do
  [[ "$file" == src/*.php ]] || fail "required reachable entry must be an exact src/*.php file: $file"
  [[ -f "$file" ]] || fail "required production file is missing: $file"
done

extract_references() {
  local source_file="$1"
  local output
  if ! output="$(php "$EXTRACTOR" . "$source_file" 2>&1)"; then
    printf '%s\n' "$output" >&2
    fail "token-aware dependency extraction failed for $source_file"
  fi
  printf '%s\n' "$output"
}

declare -a queue=("$ENTRYPOINT")
queued["$ENTRYPOINT"]=1

while ((${#queue[@]} > 0)); do
  current="${queue[0]}"
  queue=("${queue[@]:1}")

  if [[ "$current" == src/*.php ]]; then
    reachable["$current"]=1
  fi

  references="$(extract_references "$current")"
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    [[ -n "${source_file_set[$candidate]:-}" ]] || fail "extractor returned non-production target from $current: $candidate"
    [[ -n "${reachable[$candidate]:-}" || -n "${queued[$candidate]:-}" ]] && continue
    queue+=("$candidate")
    queued["$candidate"]=1
  done <<<"$references"
done

for file in "${REQUIRED_REACHABLE[@]}"; do
  [[ -n "${reachable[$file]:-}" ]] || fail "required production file is not reachable from $ENTRYPOINT: $file"
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

for file in "${source_files[@]}"; do
  if [[ -n "${reachable[$file]:-}" ]]; then
    printf 'REACHABLE_PRODUCTION %s\n' "$file"
  else
    printf 'DEFERRED_UNREACHABLE %s\n' "$file"
  fi
done

echo "GPP_PRODUCTION_REACHABILITY_PASS total=${#source_files[@]} reachable=${#reachable[@]} deferred=${#deferred[@]}"
