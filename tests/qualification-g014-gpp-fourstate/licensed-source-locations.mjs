/**
 * READ-ONLY source-location inventory on the exact licensed Gravity Flow 3.1.0
 * in ephemeral CI. NEVER export source snippets, bundled assets, code bytes,
 * tokens, or database records. JSON contains source digests, positions and
 * vocabulary of known API invocations only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.join(process.env.WU008_WP_PATH||'', 'wp-content/plugins/gravityflow');
const out=process.env.G014_OUTPUT_DIR;
const expected='ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404';
if(!process.env.WU008_WP_PATH||!out||!fs.statSync(root).isDirectory())
  throw Error('SOURCE_AUTHORITY_UNAVAILABLE');
const actualArchive=path.join(process.env.WU008_PACKAGE_DIR||'','gravityflow-3.1.0-owner-supplied-source-package.zip');
const artifacts=fs.readdirSync(process.env.WU008_PACKAGE_DIR||'').filter(x=>x.startsWith('gravityflow')&&x.endsWith('.zip'));
if(artifacts.length!==1)throw Error('LICENSED_FIXTURE_AMBIGUOUS');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const zipDigest=sha(fs.readFileSync(path.join(process.env.WU008_PACKAGE_DIR,artifacts[0])));
if(zipDigest!==expected)throw Error('GRAVITY_FLOW_PINNED_ZIP_SHA_MISMATCH');
const tokens=['localStorage','sessionStorage','getItem(','setItem(','removeItem(',
  'applyColumnState','getColumnState','moveColumn','moveColumns','sizeColumnsToFit',
  'columnMoved','onGridReady','onColumnEverythingChanged','gridOptions','columnState'];
const rules=tokens.map(x=>({token:x,pattern:x.toLowerCase()}));
const report={schema:'g014-licensed-source-inventory-v1',runtime:'Gravity Flow 3.1.0',
   pinned_sha256:zipDigest,files_scanned:0,matches:[],source_exported:false,
   limitations:['Source paths and symbol locations are evidence, not proof of runtime execution',
   'Function-context labels from nearby declarations are heuristic, not a parsed call graph']};
let byteCount=0;
const deny=new Set(['vendor','node_modules','.git','cache','tests','fixtures']);
const accepted=new Set(['.js','.php']);
function visit(folder,depth=0){
  if(depth>16)return;
  for(const e of fs.readdirSync(folder,{withFileTypes:true})){
    if(e.isSymbolicLink())continue;
    const full=path.join(folder,e.name);
    if(e.isDirectory()){
      if(!deny.has(e.name))visit(full,depth+1);
      continue;
    }
    if(!e.isFile()||!accepted.has(path.extname(e.name))||e.name.endsWith('.map'))continue;
    const stat=fs.statSync(full);
    if(stat.size>9*1024*1024)continue;
    report.files_scanned++;byteCount+=stat.size;
    const content=fs.readFileSync(full,'utf8');
    const lines=content.split(/\r?\n/), relative=path.relative(root,full).replaceAll(path.sep,'/');
    const found=[];
    for(let i=0;i<lines.length;i++){
      const lower=lines[i].toLowerCase();
      for(const rule of rules){
        let from=0;
        while(true){
          const pos=lower.indexOf(rule.pattern,from);
          if(pos<0)break;
          found.push({line:i+1,column:pos+1,symbol:rule.token});
          from=pos+rule.pattern.length;
          if(found.length>=100)break;
        }
        if(found.length>=100)break;
      }
      if(found.length>=100)break;
    }
    if(found.length)report.matches.push({path:relative,sha256:sha(fs.readFileSync(full)),
      file_bytes:stat.size,positions:found,truncated:found.length>=100});
  }
}
visit(root);
report.bytes_scanned=byteCount;
report.match_files=report.matches.length;
report.matches.sort((a,b)=>a.path.localeCompare(b.path));
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'licensed-source-locations.json'),JSON.stringify(report,null,2)+'\n');
if(!report.matches.some(m=>m.positions.some(p=>p.symbol==='localStorage'||p.symbol==='applyColumnState')))
 throw Error('SOURCE_LOCATIONS_NOT_DETECTED');
console.log('LICENSED_SOURCE_LOCATIONS_CAPTURED files='+report.files_scanned+' matches='+report.match_files+' vendor_sha256=PASS');
