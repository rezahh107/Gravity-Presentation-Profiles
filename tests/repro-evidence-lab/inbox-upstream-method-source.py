"""Focused A admission check; reuse the closed PR131 boundary, no broad hook discovery."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[2]
package = Path(os.environ.get('WU21_FLOW_ZIP', root / 'tests/fixtures/wu21-packages/gravityflow-3.1.0-owner-supplied-source-package.zip'))
digest = lambda b: hashlib.sha256(b).hexdigest()
assert digest(package.read_bytes()) == 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404'
bundle = 'gravityflow/assets/js/dist/common-inbox.4181e438e8373cc50e14.js'
with zipfile.ZipFile(package) as archive:
    b = archive.read(bundle)
    assert digest(b) == 'f5866f71b6cf2dabf62f586998eddc382a2a6a49801ccee7e87536043acfbce4'
    fragments = {}
    for name, start, end in [('initial_restore',14761,15231),('native_persistence',15660,16108),('construction',34574,35879),('live_refresh',39040,39671)]:
        fragments[name] = dict(file=bundle,sha256=digest(b),start_byte=start,end_byte_exclusive=end,source=b[start:end].decode())
    restore=fragments['initial_restore']['source']
    assert restore.startswith('r.gridOptions[t].onGridReady=function')
    assert 'columnApi.applyColumnState({state:e,applyOrder:!0})' in restore
    assert restore.count('sizeColumnsToFit')==2  # Existing clean/mismatch branches only; never invoked by this audit.
    assert 'applyFilters' not in restore and 'dispatchEvent' not in restore
    excerpts=[]
    for file,first,last in [('gravityflow/includes/config/class-js-config.php',46,65),('gravityflow/includes/config/class-js-config.php',93,105),('gravityflow/includes/inbox/class-inbox-service-provider.php',239,260)]:
        data=archive.read(file)
        excerpts.append(dict(file=file,sha256=digest(data),first_line=first,last_line=last,source='\n'.join(data.decode().splitlines()[first-1:last])))
report=dict(schema_version=1,repo_base='24c29c9dfeda5c38d8ff021526da65ddaa301a6b',
            repo_head=os.environ.get('GPP_WU21_REPOSITORY_SHA') or subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(),
            package_sha256=digest(package.read_bytes()),fragments=fragments,config_excerpts=excerpts,
            policy=dict(saved_manual_overflow='NORMALIZE_IF_FIT_CAPABLE',live_shrink='DEFER_UNTIL_NEXT_INITIAL_RESTORE'),
            candidate_a=dict(supported_scope_config=True,supported_scoped_host_width_policy='NOT_PROVEN',
                             blocker='Configuration scopes a grid but host overwrites ready and matching restore has no policy/extension call. Do not replace this routine.'),
            candidate_b=dict(new_restore_completion_contract='NOT_IMPLEMENTED_OR_VENDOR_SUPPORTED_IN_THIS_PACKAGE',
                             blocker='A new notification could carry provenance, but vendor authority, effective geometry readiness and delivery/error semantics are not established.'),
            disposition='UPSTREAM_METHOD_SELECTION_NOT_PROVEN',phase2_executed=False,production_repair_executed=False,
            evidence_limit='Source-bound admission blocker only, not a claim of repair efficacy or exhaustive future vendor capability.')
target=Path(sys.argv[1]);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,indent=2)+'\n')
print('UPSTREAM_METHOD_FOCUSED_SOURCE_CHECK_PASS_NO_REPAIR')
