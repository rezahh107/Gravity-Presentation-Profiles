#!/usr/bin/env bash
set -euo pipefail

GPP_RELEASE_SLUG='gravity-presentation-profiles'
GPP_ENTRYPOINT='gravity-presentation-profiles.php'
GPP_ADDON='src/GravityForms/AddOn.php'

release_fail() {
    echo "GPP_RELEASE_FAIL: $*" >&2
    return 1
}

release_require_command() {
    command -v "$1" >/dev/null 2>&1 || release_fail "Required command is unavailable: $1"
}

release_parse_smoke_endpoint() {
    local base_url="${1-}"
    [[ -n "$base_url" ]] || release_fail 'Smoke BASE_URL is required.'
    release_require_command php

    php -r '
        $url = $argv[1];
        $fail = static function (string $reason): void {
            fwrite(STDERR, "GPP_RELEASE_FAIL: Invalid smoke BASE_URL: {$reason}" . PHP_EOL);
            exit(1);
        };

        $parts = parse_url($url);
        if (false === $parts) {
            $fail("unable to parse URL");
        }
        if (isset($parts["user"]) || isset($parts["pass"])) {
            $fail("userinfo is not allowed");
        }

        $scheme = strtolower((string) ($parts["scheme"] ?? ""));
        $host = strtolower((string) ($parts["host"] ?? ""));
        $port = $parts["port"] ?? null;

        if ("http" !== $scheme) {
            $fail("scheme must be http");
        }
        if ("" === $host) {
            $fail("host is required");
        }
        if (!in_array($host, array("127.0.0.1", "localhost"), true)) {
            $fail("host must be local loopback (127.0.0.1 or localhost)");
        }
        if (!is_int($port) || $port < 1 || $port > 65535) {
            $fail("explicit numeric port 1..65535 is required");
        }

        printf("%s\t%d\n", $host, $port);
    ' "$base_url"
}

release_is_production_version() {
    [[ "${1:-}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] && [[ "$1" != '0.0.0' ]]
}

release_plugin_version() {
    local root="${1:-.}"
    sed -n 's/^[[:space:]]*\*[[:space:]]*Version:[[:space:]]*//p' "$root/$GPP_ENTRYPOINT" | head -n1 | tr -d '\r'
}

release_addon_version() {
    local root="${1:-.}"
    awk -F"'" '/protected[[:space:]]+\$_version[[:space:]]*=/{print $2; exit}' "$root/$GPP_ADDON" | tr -d '\r'
}

release_assert_version_mirrors() {
    local root="${1:-.}"
    local plugin addon
    plugin="$(release_plugin_version "$root")"
    addon="$(release_addon_version "$root")"
    [[ -n "$plugin" ]] || release_fail 'Plugin header version is missing.'
    [[ -n "$addon" ]] || release_fail 'Gravity Forms Add-On version mirror is missing.'
    [[ "$plugin" == "$addon" ]] || release_fail "Version mirror mismatch: plugin=$plugin addon=$addon"
}

release_next_version() {
    local current="${1:-}" intent="${2:-}"
    release_is_production_version "$current" || release_fail "Cannot increment invalid production version: $current"
    local major minor patch
    IFS=. read -r major minor patch <<<"$current"
    case "$intent" in
        patch) patch=$((patch + 1)) ;;
        minor) minor=$((minor + 1)); patch=0 ;;
        major) major=$((major + 1)); minor=0; patch=0 ;;
        *) release_fail "Unsupported release intent: $intent"; return 1 ;;
    esac
    printf '%s.%s.%s\n' "$major" "$minor" "$patch"
}

release_runtime_files() {
    local root="${1:-.}"
    (
        cd "$root"
        printf '%s\n' "$GPP_ENTRYPOINT" 'LICENSE'
        find src -type f -name '*.php' -print
        find assets -type f \( -name '*.css' -o -name '*.js' -o -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.svg' -o -name '*.webp' \) -print
        find profiles -type f \( -name '*.php' -o -name '*.css' -o -name '*.json' \) -print
    ) | LC_ALL=C sort -u
}

release_required_runtime_files() {
    cat <<'FILES'
LICENSE
gravity-presentation-profiles.php
src/Autoloader.php
src/Bootstrap.php
src/GravityForms/AddOn.php
src/GravityForms/EntryDetailSetupDiagnosticStore.php
assets/css/base.css
assets/css/gravity-forms-declarative.css
assets/css/srwf-gravity-flow-inbox.css
assets/css/srwf-gravity-flow-entry-detail.css
assets/css/srwf-gravity-flow-print-dossier.css
assets/js/gravity-flow-inbox-manual-refresh.js
profiles/srwf/registration/profile.css
profiles/srwf/registration/profile-package-v1.1.json
profiles/srwf/operations/operations-package-v1.json
assets/images/print/razavi-complex-approved.png
assets/images/print/kanoon-approved.png
FILES
}
