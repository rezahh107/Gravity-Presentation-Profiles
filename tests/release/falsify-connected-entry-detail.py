#!/usr/bin/env python3
"""Mutation challenges against a positive installed-ZIP Entry Detail witness.

Runs the actual independent PHP acceptance validator on copied real runtime
evidence, never synthetic all-green fixture JSON and never production state.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

if len(sys.argv) != 3:
    raise SystemExit("usage: falsify-connected-entry-detail.py <repo-root> <positive-evidence-dir>")
root, evidence = map(Path, sys.argv[1:])
validator = root / "tests/release/validate-connected-entry-detail.php"

def validate(folder):
    return subprocess.run(["php", str(validator), str(folder)], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

original = validate(evidence)
if original.returncode or "GPP_CONNECTED_ENTRY_ACCEPTANCE_PASS" not in original.stdout:
    raise SystemExit("BLOCKED: authentic unmodified evidence does not pass: " + original.stdout[-900:])

cases = [
    ("wrong_displayed_creation_date", "connected-entry-initial.json",
     lambda d: d["host"].__setitem__("entryCreated", "G5_MUTANT_WRONG_DATE")),
    ("forged_date_provider", "connected-entry-host-initial.json",
     lambda d: d.__setitem__("date_display_provenance", "FABRICATED_PROVIDER")),
    ("wrong_visible_native_status", "connected-entry-initial.json",
     lambda d: d.__setitem__("workflow_status_evidence",
          {"result":"COMPARABLE_VISIBLE_MATCH",
           "native_raw":d["workflow_status_evidence"]["native_raw"],
           "source":"actual_native_browser_dom",
           "inspection":{"statusBoxPresent":True,"nativeStatusLineCount":1,
                         "source":"native_status_box_visible_innerText"},
           "candidates":[{"selector":".gravityflow-status-box",
                          "label":"Status","text":"G5_MUTANT_WRONG_STATUS"}]})),
    ("surname_only_exposure", "connected-entry-requalified.json",
     lambda d: d["unauthorized_viewer"].__setitem__("exposed_sentinel_keys", ["last_name"])),
    ("incomplete_denied_value_coverage", "connected-entry-requalified.json",
     lambda d: d["unauthorized_viewer"].__setitem__("tested_sentinel_keys", ["first_name"])),
    ("forged_binding_identity", "connected-entry-host-stale.json",
     lambda d: d["binding_identity"].__setitem__("binding_set_version", "FABRICATED_VERSION")),
    ("fabricated_browser_route", "connected-entry-initial.json",
     lambda d: (d.__setitem__("connected",True),
                d["native"].__setitem__("nativeUrl","http://invalid.local/not-native"))),
    ("mismatched_stage", "connected-entry-empty.json",
     lambda d: d.__setitem__("stage","initial")),
    ("missing_date_host_witness", "connected-entry-host-empty.json",
     lambda d: d.pop("native_created_display")),
    ("missing_native_control_witness", "connected-entry-stale.json",
     lambda d: d["native"].__setitem__("nativeNonce",False)),
]
with tempfile.TemporaryDirectory(prefix="gpp-goal5-mutations-") as tmp:
    destination = Path(tmp)
    files = list(evidence.glob("*.json"))
    if not files:
        raise SystemExit("BLOCKED: no authentic evidence files")
    for name, target, mutate in cases:
        for file in files:
            shutil.copy2(file, destination / file.name)
        path = destination / target
        if not path.is_file():
            raise SystemExit("BLOCKED: authentic evidence missing " + target)
        obj = json.loads(path.read_text())
        mutate(obj)
        path.write_text(json.dumps(obj, ensure_ascii=False))
        result = validate(destination)
        if not result.returncode or "GPP_CONNECTED_ENTRY_FAIL" not in result.stdout:
            raise SystemExit("FALSIFICATION_FAIL " + name + ": " + result.stdout[-800:])
        print("G5_EXPECTED_REJECTION_PASS " + name)
    for file in files:
        shutil.copy2(file, destination / file.name)
    (destination / "connected-entry-stale.json").unlink()
    result = validate(destination)
    if not result.returncode or "GPP_CONNECTED_ENTRY_FAIL" not in result.stdout:
        raise SystemExit("FALSIFICATION_FAIL missing_stage: " + result.stdout[-800:])
    print("G5_EXPECTED_REJECTION_PASS missing_stage")
print("G5_CONNECTED_ENTRY_FALSIFICATIONS_PASS authentic_positive=1 negative=11")
