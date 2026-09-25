import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=path.resolve('tests/fixtures/wu21-packages');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const expected={
  gravityforms:{version:'3.1.1.1',filename:'gravityforms-3.1.1.1-owner-supplied-source-package.zip',classification:'OWNER_SUPPLIED_SOURCE_PACKAGE',size_bytes:5300290,sha256:'542f56ae0747f3661d1474996527298027db3fb8ed3e6469a6391aaabf61069b'},
  gravityflow:{version:'3.1.0',filename:'gravityflow-3.1.0-owner-supplied-source-package.zip',classification:'OWNER_SUPPLIED_SOURCE_PACKAGE',size_bytes:2603034,sha256:'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404'},
  elementor:{version:'4.3.1',filename:'elementor-4.3.1-owner-supplied-source-package.zip',classification:'OWNER_SUPPLIED_SOURCE_PACKAGE',size_bytes:23188841,sha256:'9e947ce507a6c76d22ec7c710da96b65ecc7da18703dc662a6940f5443491c8d'},
  'elementor-pro':{version:'4.3.0',filename:'elementor-pro-4.3.0-owner-supplied-modified-package.zip',classification:'OWNER_SUPPLIED_MODIFIED_PACKAGE',size_bytes:3446055,sha256:'4745d1688b8533aed8d4bfadbfa03f5ab007bbdfc6cfe705a01a48fbdf82bbe0'},
};

assert.equal(manifest.schema_version,'1.0.0');
assert.deepEqual(manifest.packages.map(p=>p.id),Object.keys(expected));

for(const pkg of manifest.packages){
  assert.deepEqual(
    {version:pkg.version,filename:pkg.filename,classification:pkg.classification,size_bytes:pkg.size_bytes,sha256:pkg.sha256},
    expected[pkg.id],
    `manifest identity drift for ${pkg.id}`
  );
  const file=path.join(root,pkg.filename);
  assert.equal(fs.statSync(file).size,pkg.size_bytes,`size mismatch for ${pkg.id}`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),pkg.sha256,`SHA-256 mismatch for ${pkg.id}`);
}

const verify=dir=>spawnSync('php',['tests/repro-evidence-lab/verify-wu21-package-fixtures.php',dir],{encoding:'utf8'});
assert.equal(verify(root).status,0,'repository package fixtures must validate');

const workflow=fs.readFileSync('.github/workflows/wu21-repro-evidence-lab.yml','utf8');
assert.doesNotMatch(workflow,/drive\.google\.com|drive\.usercontent\.google\.com/,'WU21 must not acquire packages from Google Drive');
assert.match(workflow,/WU21_PACKAGE_FIXTURE_DIR: tests\/fixtures\/wu21-packages/);
for(const spec of Object.values(expected)) {
  assert.ok(workflow.includes(spec.filename),`workflow does not consume ${spec.filename}`);
}
assert.doesNotMatch(workflow,/download if missing|package fallback/i,'workflow must not declare a package network fallback');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wu21-package-falsification-'));
const payload=Buffer.from('fixture-bytes');
const sha=crypto.createHash('sha256').update(payload).digest('hex');
const synthetic={schema_version:'1.0.0',packages:[
  {id:'gravityforms',version:'1',filename:'a.zip',classification:'TEST',size_bytes:payload.length,sha256:sha},
  {id:'gravityflow',version:'1',filename:'b.zip',classification:'TEST',size_bytes:payload.length,sha256:sha},
  {id:'elementor',version:'1',filename:'c.zip',classification:'TEST',size_bytes:payload.length,sha256:sha},
  {id:'elementor-pro',version:'1',filename:'d.zip',classification:'TEST',size_bytes:payload.length,sha256:sha},
]};
fs.writeFileSync(path.join(tmp,'manifest.json'),JSON.stringify(synthetic));
for(const pkg of synthetic.packages) fs.writeFileSync(path.join(tmp,pkg.filename),payload);
assert.equal(verify(tmp).status,0,'synthetic valid package set should validate');
fs.unlinkSync(path.join(tmp,'b.zip'));
assert.notEqual(verify(tmp).status,0,'missing package must fail closed');
fs.writeFileSync(path.join(tmp,'b.zip'),payload);
fs.writeFileSync(path.join(tmp,'c.zip'),Buffer.from('corrupt-bytes'));
assert.notEqual(verify(tmp).status,0,'corrupted package must fail closed');
fs.rmSync(tmp,{recursive:true,force:true});

console.log('WU21_PACKAGE_SOURCE_FALSIFICATION_PASS repository_bytes_verified=true no_google_drive=true missing_fails=true corrupt_fails=true no_network_fallback=true');
