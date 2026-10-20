#!/usr/bin/env python3
"""Strict, fail-closed admission for GitHub's current immutable-releases API reply.

Used only by the mandatory production publication gate. It cannot authorize
release creation itself and deliberately has no network or cached-success path.
"""

import json
import os
import re
import sys
from pathlib import Path


class InvalidAPIResponse(ValueError):
    pass


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InvalidAPIResponse("duplicate JSON object member")
        result[key] = value
    return result


def reject_non_json_number(value):
    raise InvalidAPIResponse("non-JSON numeric constant")


def strict_json(path):
    try:
        if Path(path).stat().st_size > 65536:
            raise InvalidAPIResponse("API reply exceeds permitted bounds")
        return json.loads(
            Path(path).read_text(encoding="utf-8"),
            object_pairs_hook=unique_pairs,
            parse_constant=reject_non_json_number,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, InvalidAPIResponse) as exc:
        raise InvalidAPIResponse("missing, invalid, duplicated or unreadable JSON") from exc


def safe_hint(value, limit=180):
    if not isinstance(value, str):
        return "not supplied"
    secret = os.environ.get("GPP_RELEASE_ADMIN_READ_TOKEN", "")
    if secret:
        value = value.replace(secret, "[redacted]")
    value = re.sub(
        r"(?i)\b(?:authorization|bearer)\s*[:= ]+\s*(?:bearer\s+)?\S+",
        "[redacted authorization]",
        value,
    )
    value = re.sub(
        r"(?i)\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+",
        "[redacted credential]",
        value,
    )
    # Only inert characters: never emit arbitrary command syntax or newlines.
    value = re.sub(r"[^A-Za-z0-9 _.,/()=;-]", " ", value)
    value = " ".join(value.split())[:limit]
    return value or "not supplied"


def header_hint(path, wanted):
    try:
        if Path(path).stat().st_size > 65536:
            return "not supplied"
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        return "not supplied"
    values = []
    for line in lines:
        name, sep, value = line.partition(":")
        if sep and name.strip().lower() == wanted:
            values.append(value.strip())
    return safe_hint(values[-1]) if values else "not supplied"


def fail(message):
    print("::error::" + message + " Publication remains blocked.", file=sys.stderr)
    return 1


def main(argv):
    if len(argv) != 4:
        return fail("Immutable-release admission requires HTTP status, body and headers.")
    _, status, body_path, header_path = argv
    if not re.fullmatch(r"[0-9]{3}", status):
        return fail("Invalid immutable-release HTTP status.")
    if status != "200":
        try:
            response = strict_json(body_path)
            message = safe_hint(response.get("message")) if type(response) is dict else "not supplied"
        except InvalidAPIResponse:
            message = "unreadable GitHub API response"
        permissions = header_hint(header_path, "x-accepted-github-permissions")
        retry = header_hint(header_path, "retry-after")
        return fail(
            "GitHub immutable-release verification blocked: "
            f"HTTP {status}; message={message}; "
            f"accepted_permissions={permissions}; retry_after={retry}."
        )
    try:
        response = strict_json(body_path)
    except InvalidAPIResponse:
        return fail("GitHub immutable-release admission rejected invalid or ambiguous JSON.")
    if type(response) is not dict:
        return fail("GitHub immutable-release admission requires one JSON object.")
    if response.get("enabled") is not True:
        return fail("GitHub immutable-release admission requires JSON boolean enabled=true.")
    print("GPP_IMMUTABLE_RELEASE_ADMISSION_PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
