import fs from 'node:fs';
const sourceUrl=new URL('./wu17-a11y005-focus-diagnostic.mjs',import.meta.url);
const runtimeUrl=new URL('./.wu17-a11y005-reload-differential.runtime.mjs',import.meta.url);
let s=fs.readFileSync(sourceUrl,'utf8');
const loopNeedle="if (n === 4) applied.a11y004 = await runStage004(page);";
const loopPatch=`${loopNeedle}\n      if (n === 9) { await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' }); await page.waitForSelector(\`${scope} .ag-root-wrapper\`, { timeout: 30000 }); applied.reload = true; }`;
if(!s.includes(loopNeedle))throw new Error('scenario seam changed');
s=s.replace(loopNeedle,loopPatch);
const evidenceNeedle="const hasToolbar = isolated?.inventory?.toolbar && !isolated.inventory.toolbar.missing;";
const evidencePatch=`evidence.scenarios.push(await scenario(browser, 'after_one_reload', [9]));\n  ${evidenceNeedle}`;
if(!s.includes(evidenceNeedle))throw new Error('evidence seam changed');
s=s.replace(evidenceNeedle,evidencePatch);
fs.writeFileSync(runtimeUrl,s);
try{await import(`${runtimeUrl.href}?run=${Date.now()}`);}finally{fs.rmSync(runtimeUrl,{force:true});}
