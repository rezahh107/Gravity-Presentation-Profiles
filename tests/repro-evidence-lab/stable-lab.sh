#!/usr/bin/env bash
set -euo pipefail
test "$SLA_DISPOSABLE" = 1
test "$WU21_WP_PATH" = /tmp/wu21-wordpress
test "$SLA_SOURCE_HEAD" = 34fe6da2bde580869d357ddab82b13fbec6bb846
root="$GITHUB_WORKSPACE"
cd "$root"
source "$SLA_PRODUCT_ROOT/scripts/release/release-lib.sh"
release_assert_version_mirrors "$SLA_PRODUCT_ROOT"
test "$(release_plugin_version "$SLA_PRODUCT_ROOT")" = 0.0.0-dev
work="$(mktemp -d)"
chmod 700 "$work"
stable="$work/prepared"
dev="$work/dev"
out="$work/out"
mkdir -p "$dev" "$out"
# Tags from the complete fetched checkout; releases (including asset names)
# from the live read-only API, paginated. No write or publish API is used.
git tag --list | jq -Rn '[inputs|{name:.}]' > "$WU21_ARTIFACT_DIR/stable-tags.json"
gh api --paginate "/repos/$GITHUB_REPOSITORY/releases?per_page=100" --jq '.[] | {tag_name,draft,prerelease,assets:[.assets[]|{name}]}' | jq -s . > "$WU21_ARTIFACT_DIR/stable-releases.json"
version="$(php "$SLA_PRODUCT_ROOT/scripts/release/resolve-version.php" --intent=minor --tags-json="$WU21_ARTIFACT_DIR/stable-tags.json")"
test "$version" = 0.6.0
php "$SLA_PRODUCT_ROOT/scripts/release/check-conflicts.php" --version="$version" --source-sha="$SLA_SOURCE_HEAD" --tags-json="$WU21_ARTIFACT_DIR/stable-tags.json" --releases-json="$WU21_ARTIFACT_DIR/stable-releases.json"
git worktree add --detach "$stable" "$STABLE_FIX_HEAD"
php "$SLA_PRODUCT_ROOT/scripts/release/prepare-candidate.php" --root="$stable" --version="$version" --date=2026-11-24
test "$(git -C "$stable" diff --name-only | LC_ALL=C sort | tr '\n' ' ')" = 'CHANGELOG.md gravity-presentation-profiles.php src/GravityForms/AddOn.php '
php "$SLA_PRODUCT_ROOT/scripts/release/extract-release-notes.php" --changelog="$stable/CHANGELOG.md" --version="$version" --output="$WU21_ARTIFACT_DIR/stable-release-notes.md"
while IFS= read -r f; do
 mkdir -p "$dev/$(dirname "$f")"; cp "$SLA_PRODUCT_ROOT/$f" "$dev/$f"
done < <(release_runtime_files "$SLA_PRODUCT_ROOT")
sed -i 's/Version: 0.0.0-dev/Version: 9999.0.0/' "$dev/gravity-presentation-profiles.php"
sed -i "s/'0.0.0-dev'/'9999.0.0'/" "$dev/src/GravityForms/AddOn.php"
for pair in "$dev:9999.0.0" "$stable:$version"; do
 src="${pair%:*}"; v="${pair##*:}"
 bash "$SLA_PRODUCT_ROOT/scripts/release/build-release.sh" "$src" "$v" "$out"
 bash "$SLA_PRODUCT_ROOT/scripts/release/validate-release.sh" "$src" "$out/gravity-presentation-profiles-$v.zip" "$v"
done
oldzip="$out/gravity-presentation-profiles-9999.0.0.zip"
newzip="$out/gravity-presentation-profiles-$version.zip"
test "$(sha256sum "$oldzip"|cut -d' ' -f1)" = 447eaabd67a64ca2f3ea5cda1bf06166dc21706b63e3d8631c0966931216a492
python3 - "$oldzip" "$newzip" "$WU21_ARTIFACT_DIR/stable-package.json" "$SLA_SOURCE_HEAD" "$STABLE_FIX_HEAD" <<'PY'
import sys,zipfile,hashlib,json
old,new,dest,source,fix=sys.argv[1:]
sha=lambda x:hashlib.sha256(x).hexdigest()
with zipfile.ZipFile(old) as a,zipfile.ZipFile(new) as b:
 assert a.testzip() is None and b.testzip() is None
 assert a.namelist()==b.namelist()
 changed=[]; files=[]
 for name in a.namelist():
  x,y=a.read(name),b.read(name)
  if x!=y:
   assert name in ('gravity-presentation-profiles/gravity-presentation-profiles.php','gravity-presentation-profiles/src/GravityForms/AddOn.php')
   assert x.count(b'9999.0.0')==1 and x.replace(b'9999.0.0',b'0.6.0',1)==y
   changed.append(name)
  files.append({'path':name,'bytes':len(y),'sha256':sha(y),'oldSha256':sha(x)})
 assert len(changed)==2 and len(files)==116
 assert any(x['path']=='gravity-presentation-profiles/LICENSE' for x in files)
 json.dump({'source':source,'testFix':fix,'version':'0.6.0','oldSha256':sha(open(old,'rb').read()),'sha256':sha(open(new,'rb').read()),'changed':changed,'files':files,'status':'PRIVATE PREPARATION ONLY'},open(dest,'w'),indent=2)
PY
# The affected development/stable smoke and mirror negative passed on run
# 45457298502, exact STABLE_FIX_HEAD. Do not repeat them. Build parity still
# required for these replacement/recovery phases.
test "$(sha256sum "$newzip" | cut -d' ' -f1)" = 90d847c9b4e6e7bedf821bcfdf1af595bbefb26b71f6f239ec7d4cb5cf6d16b2
plugin="$WU21_WP_PATH/wp-content/plugins/gravity-presentation-profiles"
wp(){ php "$WU21_WP_CLI" --path="$WU21_WP_PATH" "$@"; }
test ! -e "$plugin" && test ! -L "$plugin"
wp plugin install "$oldzip" --activate
wp eval-file "$SLA_PRODUCT_ROOT/tests/repro-evidence-lab/setup-fixtures.php"
login_dir="$work/login"; mkdir -m700 "$login_dir"; export SLA_LOGIN_FILE="$login_dir/accounts.json"
wp eval-file tests/repro-evidence-lab/sla-fixture.php
# A wrong independently specified version is rejected before fixture writes.
negative(){
 local expected="$1" name="$2"
 if GPP_INBOX2_EXPECTED_VERSION="$expected" wp eval-file tests/repro-evidence-lab/inbox2-installed-zip-setup.php > "$WU21_ARTIFACT_DIR/stable-$name.txt" 2>&1; then exit 1; fi
 grep -F 'INBOX2_ZIP_SMOKE_VERSION_IDENTITY_MISMATCH' "$WU21_ARTIFACT_DIR/stable-$name.txt"
}
verify_installed(){
 local phase="$1" v="$2" zip="$3"
 local unpack="$work/check-$phase"
 mkdir "$unpack"; unzip -q "$zip" -d "$unpack"
 diff -qr "$unpack/gravity-presentation-profiles" "$plugin"
 test ! -L "$plugin"
 test "$(wp plugin get gravity-presentation-profiles --field=version)" = "$v"
 STABLE_EXPECTED_VERSION="$v" wp eval-file tests/repro-evidence-lab/stable-state.php > "$WU21_ARTIFACT_DIR/stable-$phase-state.json"
 for actor in officer accountant applicant; do
  SLA_ACTOR="$actor" SLA_OPERATION=read wp eval-file tests/repro-evidence-lab/sla-native-read.php > "$WU21_ARTIFACT_DIR/stable-$phase-$actor.json"
 done
 STABLE_PHASE="$phase" node tests/repro-evidence-lab/stable-queue.mjs
 # Record the state after the real browser check as well.
 STABLE_EXPECTED_VERSION="$v" wp eval-file tests/repro-evidence-lab/stable-state.php > "$WU21_ARTIFACT_DIR/stable-$phase-post-state.json"
}
verify_installed before 9999.0.0 "$oldzip"
# Real supported WordPress replacement; no uninstall, no database reset.
wp plugin install "$newzip" --force --activate
negative 9999.0.0 expected-version-mismatch
verify_installed replacement "$version" "$newzip"
wp plugin install "$oldzip" --force --activate
verify_installed recovery 9999.0.0 "$oldzip"
python3 - "$WU21_ARTIFACT_DIR" <<'PY'
import json,sys,pathlib
d=pathlib.Path(sys.argv[1])
def read(s):return json.loads((d/('stable-'+s+'.json')).read_text())
base=read('before-state')['state']
for phase in ('before','replacement','recovery'):
 assert read(phase+'-state')['state']==base,phase+' state divergence'
 assert read(phase+'-post-state')['state']==base,phase+' post-browser state divergence'
 assert read(phase+'-browser')['status']=='PASS'
 for actor in ('officer','accountant','applicant'):
  a,b=read('before-'+actor),read(phase+'-'+actor)
  for key in ('ids','cells','states'):assert a[key]==b[key],phase+' '+actor+' '+key
assert len(read('before-officer')['ids'])==25
assert read('before-accountant')['ids']==read('before-applicant')['ids']==[]
json.dump({'status':'PASS','phases':['9999.0.0','0.6.0','9999.0.0'],'entryWorkflowSettingsBindingPreserved':True,'nativeQueuePreserved':True,'recoveryVerified':True},open(d/'stable-result.json','w'),indent=2)
PY
echo 'STABLE_REPLACEMENT_RECOVERY_PASS'
# Runner-local private package only; no candidate or license is uploaded.
rm -rf "$login_dir"
