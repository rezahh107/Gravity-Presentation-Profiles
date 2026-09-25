import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = process.env.WU21_GRAVITYFLOW_SOURCE;
const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!sourceRoot || !artifactDir) throw new Error('PR87 row-buffer source probe requires pinned WU21 source and artifact paths.');
assert.equal(fs.existsSync(sourceRoot), true, `Pinned Gravity Flow source is unavailable: ${sourceRoot}`);

const terms = ['rowBuffer','suppressMaxRenderedRowRestriction','rowModelType','domLayout','gravityflow_js_config_shared'];
const extensions = new Set(['.js','.php','.json','.ts','.tsx','.jsx']);
const occurrences = [];
let scannedFiles = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(full);continue;}
    if(!entry.isFile()||!extensions.has(path.extname(entry.name).toLowerCase())) continue;
    const stat=fs.statSync(full); if(stat.size>8*1024*1024) continue;
    const bytes=fs.readFileSync(full); if(bytes.includes(0)) continue;
    const text=bytes.toString('utf8'); scannedFiles+=1;
    const file=path.relative(sourceRoot,full).replaceAll(path.sep,'/');
    for(const term of terms){
      let cursor=0;
      while(cursor<text.length){
        const index=text.indexOf(term,cursor); if(index===-1) break;
        const start=Math.max(0,index-650), end=Math.min(text.length,index+term.length+650);
        occurrences.push({file,term,index,context:text.slice(start,end)});
        cursor=index+term.length;
      }
    }
  }
}
walk(sourceRoot);
const counts=Object.fromEntries(terms.map(term=>[term,occurrences.filter(x=>x.term===term).length]));
const rowBufferFiles=[...new Set(occurrences.filter(x=>x.term==='rowBuffer').map(x=>x.file))].sort();
const sharedConfig=occurrences.filter(x=>x.term==='gravityflow_js_config_shared');
const report={
  schema_version:'1.0.0',
  source_identity:{runtime_version:'3.1.0',package_sha256:'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404',source_root:sourceRoot},
  scanned_files:scannedFiles,counts_by_term:counts,row_buffer_files:rowBufferFiles,
  row_buffer_occurrences:occurrences.filter(x=>x.term==='rowBuffer'),
  shared_config_occurrences:sharedConfig,
  adjacent_grid_option_occurrences:occurrences.filter(x=>['suppressMaxRenderedRowRestriction','rowModelType','domLayout'].includes(x.term)),
};
report.evidence_sha256=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
assert.ok(counts.rowBuffer>0,'Pinned Gravity Flow/AG Grid source contains no rowBuffer option.');
assert.ok(counts.gravityflow_js_config_shared>0,'Pinned Gravity Flow source contains no gravityflow_js_config_shared seam.');
fs.writeFileSync(path.join(artifactDir,'pr87-row-buffer-source-probe.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PR87_ROW_BUFFER_SOURCE_PROBE rowBuffer=${counts.rowBuffer} sharedConfig=${counts.gravityflow_js_config_shared}`);
console.log(JSON.stringify({counts_by_term:counts,row_buffer_files:rowBufferFiles},null,2));
