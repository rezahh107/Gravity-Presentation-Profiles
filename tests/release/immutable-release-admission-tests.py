#!/usr/bin/env python3
"""Deterministic mocked-HTTP tests of the EXACT release-workflow admission step.

No API call, secret, tag, release, publication, or repository write is made.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/release.yml"
TOKEN = "github_pat_TEST_ONLY_123456789_SECRET"


def extract_actual_gate():
    text = WORKFLOW.read_text(encoding="utf-8")
    start_marker = "      - name: Verify GitHub immutable-release protection before publication\n"
    next_marker = "      - name: Resolve future version and reject existing immutable identity conflicts\n"
    assert text.count(start_marker) == 1, "exactly one publication gate required"
    start = text.index(start_marker)
    end = text.index(next_marker, start)
    step = text[start:end]
    assert "        run: |\n" in step, "shell gate not found"
    assert step.count("        run: |\n") == 1, "ambiguous shell blocks"
    source = step.split("        run: |\n", 1)[1]
    lines = []
    for line in source.splitlines():
        if line.startswith("          "):
            lines.append(line[10:])
        elif line.strip():
            raise AssertionError("unexpected workflow indentation")
        else:
            lines.append("")
    command = "\n".join(lines) + "\n"
    assert "set -euo pipefail" in command
    assert "python3 scripts/release/immutable-release-admission.py" in command
    assert "GPP_RELEASE_ADMIN_READ_TOKEN" in command
    assert "https://api.github.com/repos/$GITHUB_REPOSITORY/immutable-releases" in command
    assert "jq -r '.enabled" not in command
    return command


MOCK_CURL = r'''#!/usr/bin/env python3
import os
import pathlib
import sys

args = sys.argv[1:]
values = {}
for flag in ("--output", "--dump-header", "--write-out"):
    if args.count(flag) != 1:
        sys.exit(42)
    values[flag] = args[args.index(flag) + 1]

target = args[-1]
expected = "https://api.github.com/repos/" + os.environ["GITHUB_REPOSITORY"] + "/immutable-releases"
if target != expected:
    sys.exit(43)
if args.count("-H") != 3:
    sys.exit(44)
if os.environ["GPP_RELEASE_ADMIN_READ_TOKEN"] not in " ".join(args):
    sys.exit(45)
if os.environ.get("MOCK_TRANSPORT_FAIL") == "yes":
    sys.exit(7)
pathlib.Path(values["--output"]).write_bytes(pathlib.Path(os.environ["MOCK_BODY_FILE"]).read_bytes())
pathlib.Path(values["--dump-header"]).write_bytes(pathlib.Path(os.environ["MOCK_HEADER_FILE"]).read_bytes())
sys.stdout.write(os.environ["MOCK_STATUS"])
'''


def run_case(tmp, gate, label, status, body, expected, headers="", transport=False):
    case = tmp / label
    case.mkdir()
    body_file = case / "body.json"
    headers_file = case / "headers.txt"
    admitted = case / "candidate-was-reached"
    body_file.write_bytes(body if isinstance(body, bytes) else body.encode("utf-8"))
    headers_file.write_text(headers or "HTTP/2 200\r\n\r\n", encoding="utf-8")
    env = os.environ.copy()
    env.update(
        PATH=str(tmp / "bin") + os.pathsep + env.get("PATH", ""),
        GITHUB_REPOSITORY="rezahh107/Gravity-Presentation-Profiles",
        GPP_RELEASE_ADMIN_READ_TOKEN=TOKEN,
        MOCK_STATUS=status,
        MOCK_BODY_FILE=str(body_file),
        MOCK_HEADER_FILE=str(headers_file),
        MOCK_TRANSPORT_FAIL="yes" if transport else "no",
        ADMITTED_PROBE=str(admitted),
    )
    script = case / "actual-gate.sh"
    script.write_text(
        gate + '\nprintf "UNAUTHORIZED_NEXT_STAGE" > "$ADMITTED_PROBE"\n',
        encoding="utf-8",
    )
    result = subprocess.run(
        ["bash", str(script)], cwd=ROOT, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    output = result.stdout + result.stderr
    if expected:
        assert result.returncode == 0, (label, result.returncode, output[-1000:])
        assert admitted.read_text(encoding="utf-8") == "UNAUTHORIZED_NEXT_STAGE"
        assert "GPP_IMMUTABLE_RELEASE_ADMISSION_PASS" in output
    else:
        assert result.returncode != 0, (label, "unexpected admission")
        assert not admitted.exists(), (label, "reached next stage after rejection")
        assert "Publication remains blocked" in output or "failed before a valid HTTP response" in output, label
    assert TOKEN not in output, (label, "credential leaked")
    assert "Authorization:" not in output, (label, "raw Authorization header leaked")
    return output


def run():
    gate = extract_actual_gate()
    with tempfile.TemporaryDirectory(prefix="gpp-immutable-admission-") as temporary:
        tmp = Path(temporary)
        bin_dir = tmp / "bin"
        bin_dir.mkdir()
        curl = bin_dir / "curl"
        curl.write_text(MOCK_CURL, encoding="utf-8")
        curl.chmod(0o755)

        accepted = run_case(tmp, gate, "true_boolean", "200", '{"enabled":true,"other":{"value":123}}', True)
        assert "GPP_IMMUTABLE_RELEASE_ADMISSION_PASS" in accepted

        invalid = {
            "true_string": '{"enabled":"true"}',
            "false_boolean": '{"enabled":false}',
            "null_enabled": '{"enabled":null}',
            "missing_enabled": '{"other":true}',
            "numeric_enabled": '{"enabled":1}',
            "root_array": '[{"enabled":true}]',
            "root_string": '"true"',
            "root_null": 'null',
            "malformed_json": '{"enabled":',
            "multiple_documents": '{"enabled":true}\n{"enabled":true}',
            "duplicate_enabled": '{"enabled":false,"enabled":true}',
            "duplicate_other_key": '{"enabled":true,"k":1,"k":2}',
            "nested_duplicate": '{"enabled":true,"obj":{"a":1,"a":2}}',
            "non_json_nan": '{"enabled":true,"extra":NaN}',
            "empty": "",
        }
        for label, payload in invalid.items():
            run_case(tmp, gate, label, "200", payload, False)

        headers = (
            "HTTP/2 403\r\n"
            "X-Accepted-GitHub-Permissions: administration=read\r\n"
            "Retry-After: 300\r\n\r\n"
        )
        for status in ("401", "403"):
            error = json.dumps({"message": "Resource not accessible by personal access token"})
            output = run_case(tmp, gate, "http_" + status, status, error, False, headers=headers)
            assert "HTTP " + status in output
            assert "Resource not accessible by personal access token" in output
            assert "administration=read" in output and "300" in output
        evil = json.dumps({"message": "Authorization: Bearer " + TOKEN})
        output = run_case(tmp, gate, "error_secret_in_message", "403", evil, False, headers=headers)
        assert TOKEN not in output and "Authorization:" not in output
        run_case(tmp, gate, "non_json_http_error", "403", "<server error>", False)
        run_case(tmp, gate, "transport_failure", "000", "", False, transport=True)

        old = subprocess.run(
            ["jq", "-r", ".enabled // false"],
            input='{"enabled":"true"}', text=True, capture_output=True, check=True,
        )
        assert old.stdout.strip() == "true", "old predicate no longer reproduces type erasure"
        print("OLD_STRING_PREDICATE_FALSIFIED: JSON string true was admitted by jq -r comparison")
        print("STRICT_TYPED_IMMUTABLE_RELEASE_ADMISSION: 1 positive, " +
              str(len(invalid) + 5) + " negative mocked gate cases PASS")
        print("REJECTED_STAGES_UNREACHED_AND_NO_CREDENTIAL_LOGGING: PASS")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print("IMMUTABLE_RELEASE_ADMISSION_TEST_FAIL:", error, file=sys.stderr)
        sys.exit(1)
