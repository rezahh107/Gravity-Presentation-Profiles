import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { artifactDir, baseUrl, repoRoot, attachPolling } from './inbox-v2-qualification-shared.mjs';
import { runQ1 } from './inbox-v2-q1.mjs';
import { runQ2 } from './inbox-v2-q2.mjs';
import { runQ4 } from './inbox-v2-q4.mjs';

const toolboxPath=path.join(repoRoot,'docs/design/GPP_INBOX_DESIGN_TOOLBOX_V1.1.md');
const toolboxSha256=crypto.createHash('sha256').update(fs.readFileSync(toolboxPath)).digest('hex');
if(toolboxSha256!=='d2b50b51b111455a54090de0497fe68b1904897183eeb08dfa07aac6671ee17b'){
  throw new Error(`Toolbox mirror SHA-256 mismatch: ${toolboxSha256}`);
}
const adminPassword=process.env.WU21_ADMIN_PASSWORD;
if(!adminPassword)throw new Error('WU21_ADMIN_PASSWORD is required by the disposable evidence lab.');

const qualification={
  artifact_type:'gpp.inbox_visual_design_v2.bounded_qualification',
  evidence_ceiling:'PROVEN_IN_REPRODUCIBLE_RUNTIME',
  toolbox_mirror_sha256:toolboxSha256,
  runtime_identity:{wordpress:'6.8.3',php:'8.2.34',gravity_forms:'3.1.1.1',gravity_flow:'3.1.0',node:'22.19.0',playwright:'1.55.0'},
  persian_gravity_reuse:{state:'REUSED_EXISTING_EVIDENCE',contract:'docs/architecture/PERSIANGRAVITY_JALALI_CONSUMER_V1.md',provider:'PersianGravity 4.6.0@d134c9ac81b177a32a3138f074fca3d1c1ebfae4',source:'entry.created_at -> Gravity Forms date_created',month_chip_required:false,q1_required_for_month_name:false},
  q1:{status:'NOT_PROVEN',observations:{}},q2:{status:'NOT_PROVEN',observations:{}},q4:{status:'NOT_PROVEN',observations:{}},live_refresh:{status:'NOT_PROVEN'},
  target_bindings:{student_name:{semantic:'student.full_name <- student.first_name + student.last_name',target_state:'NOT_PROVEN',reason:'Concrete target SRWF field IDs are not proven by this lab.'},school:{semantic:'school.name',target_state:'NOT_PROVEN',reason:'Concrete target SRWF field binding remains unproven.'},grade_group:{semantic:'education.grade_group',target_state:'NOT_PROVEN',reason:'Concrete target SRWF field binding remains unproven.'},identity_semantic_source:{semantic:'SRWF_IDENTITY_SEMANTIC',target_state:'NOT_PROVEN',reason:'No authorized field/value mapping is present in the governing toolbox.'},workflow_status_source:{semantic:'SRWF_STATUS',target_state:'NOT_PROVEN',reason:'Exact authoritative workflow/status meaning/source remains unproven.'}},
  mechanism_guards:{custom_renderer_registry:false,mutation_observer_decoration:false,post_render_patch_loop:false,probe_seams:['gravityflow_columns_inbox_table','gravityflow_inbox_field_value']}
};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const polling=attachPolling(page);
try{
  await page.goto(`${baseUrl}/wp-login.php`,{waitUntil:'domcontentloaded'});
  await page.fill('#user_login','bootstrap_admin');
  await page.fill('#user_pass',adminPassword);
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#wp-submit')]);
  await runQ1(page,polling,qualification);
  await runQ2(page,qualification);
  await runQ4(page,polling,qualification);
  qualification.live_refresh.status=qualification.live_refresh.q1==='PASS'&&qualification.live_refresh.q4==='PASS'?'PASS':'FAIL';
  qualification.q3={status:'NOT_EXECUTED_BY_CONTRACT'};
  qualification.design_scope={active:['NATIVE_ROW_DESIGN','NATIVE_PAGINATION_PRESENTATION'],upper_page:'PHASE_FROZEN',sort_filter:'PRESERVE_ONLY'};
  qualification.overall_status=[qualification.q1.status,qualification.q2.status,qualification.q4.status].every(s=>s==='PASS')?'PASS':'QUALIFICATION_FINDINGS';
  fs.writeFileSync(path.join(artifactDir,'inbox-visual-design-v2-qualification.json'),JSON.stringify(qualification,null,2)+'\n');
}finally{
  await browser.close();
}
console.log(`Q1 ${qualification.q1.status}`);
console.log(`Q2 ${qualification.q2.status}`);
console.log(`Q4 ${qualification.q4.status}`);
console.log(`LIVE_REFRESH ${qualification.live_refresh.status}`);
if(!fs.existsSync(path.join(artifactDir,'inbox-visual-design-v2-qualification.json')))process.exit(2);
