"""Read-only qualification of the exact owner-supplied WU21 package.
Byte offsets refer to UTF-8 source bytes; snippets are source evidence, not runtime APIs.
"""
import hashlib, json, os, pathlib, re, sys, zipfile
root = pathlib.Path(__file__).resolve().parents[2]
package = pathlib.Path(os.environ.get('WU21_FLOW_ZIP', root / 'tests/fixtures/wu21-packages/gravityflow-3.1.0-owner-supplied-source-package.zip'))
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha(package.read_bytes()) == 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404'
z = zipfile.ZipFile(package)
files = {n:z.read(n) for n in z.namelist() if not n.endswith('/')}
common = 'gravityflow/assets/js/dist/common-inbox.4181e438e8373cc50e14.js'
vendor = 'gravityflow/assets/js/dist/vendor-theme.js'
s, v = files[common], files[vendor]
assert sha(s) == 'f5866f71b6cf2dabf62f586998eddc382a2a6a49801ccee7e87536043acfbce4'
assert sha(v) == 'd5179d650539d6c663cdaab6e81503164b608e2a26b911f24f4d96392975ef43'
def fragment(file, begin, end):
    b=files[file]; i=b.index(begin.encode()); j=b.index(end.encode(),i)+len(end.encode())
    return dict(file=file,sha256=sha(b),start_byte=i,end_byte_exclusive=j,source=b[i:j].decode())
fragments = {
 'host_ready_restore':fragment(common,'r.gridOptions[t].onGridReady=function','}(0,t)}'),
 'host_save_callbacks':fragment(common,'O.gridMutationEvents.forEach','{wait:200})})'),
 'host_live_refresh':fragment(common,'Bt=function','return function(e){return t.apply(this,arguments)}}()'),
 'host_construct':fragment(common,'Vt=function','r.grids[n]=new k.xA(t,r.gridOptions[n])'),
 'grid_ready_dispatch':fragment(vendor,'t.prototype.dispatchGridReadyEvent=function','o.dispatchEvent(n)}'),
 'grid_first_render_guard':fragment(vendor,'if(this.paginationProxy.isRowsToRender())','dispatchEventOnce(P)},50)}'),
 'grid_generic_api_state':fragment(vendor,'t.prototype.applyColumnState=function(t){return this.columnController.applyColumnState(t,"api")}','t.prototype.getColumnState=function(){return this.columnController.getColumnState()}'),
 'grid_generic_everything':fragment(vendor,'e.prototype.dispatchEverythingChanged=function','this.eventService.dispatchEvent(e)}'),
}
ready=fragments['host_ready_restore']['source']
assert ready.count('applyColumnState')==1 and 'applyOrder:!0' in ready
assert ready.count('sizeColumnsToFit')==2 # Native existing branches, never invoked by our code.
assert not re.search('dispatchEvent|addAction|applyFilters|post_init|afterRestore',ready)
php_hooks=[]
for file,b in files.items():
 if file.endswith('.php'):
  for match in re.finditer(rb'(?:apply_filters|do_action)\s*\(\s*[\'\"](gravityflow[^\'\"]+)',b):
   php_hooks.append(dict(file=file,line=b[:match.start()].count(b'\n')+1,hook=match.group(1).decode()))
js_notifications=[]
for file,b in files.items():
 if '/assets/js/dist/' in file and file.endswith('.js'):
  for match in re.finditer(rb'[\'\"]((?:gravityflow|gflow|gform)[^\'\"\n]{0,100})[\'\"]',b):
   token=match.group(1).decode(errors='replace')
   if '/' in token or re.search('restore|ready|init|state|column',token,re.I):
    js_notifications.append(dict(file=file,byte=match.start(),token=token))
report=dict(schema_version=1,repo_base='24c29c9dfeda5c38d8ff021526da65ddaa301a6b',repo_head=os.environ.get('GPP_WU21_REPOSITORY_SHA'),
 package_sha256=sha(package.read_bytes()),package_member_count=len(files),
 identities={file:sha(files[file]) for file in [common,vendor,'gravityflow/assets/js/dist/scripts-theme.js','gravityflow/includes/config/class-js-config.php','gravityflow/includes/inbox/class-inbox-service-provider.php']},
 ag_grid_semver='NOT_PROVEN: no AG Grid dependency manifest or numeric version declaration established in supplied package; exact bundled bytes identified',
 fragments=fragments,php_hooks=php_hooks,js_notification_token_inventory=js_notifications,
 modern_state_tokens={t:v.count(t.encode()) for t in ['stateUpdated','initialState','gridPreDestroyed']},
 disposition='CANDIDATE_D_PUBLIC_SEAM_NOT_PROVEN',phase2_executed=False,production_repair_executed=False,
 upstream_boundary='Host-owned initial restore routine, immediately after matching-ID applyColumnState returns, with distinct no-state/mismatched-ID outcomes and once-per-native-Grid lifecycle identity. This proposed notification does not yet exist; geometry readiness and policy still require qualification.')
if out:
 out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('CANDIDATE_D_EXACT_PACKAGE_SOURCE_QUALIFICATION_PASS',len(php_hooks),'PHP hook invocations inventoried')
