import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { artifactDir, wpCli, wpPath, repoRoot, baseUrl, login, waitForGrid } from './inbox-visual-design-v2-browser-lib.mjs';

if (!artifactDir || !wpCli || !wpPath || !repoRoot) throw new Error('Pinned WU21 lab unavailable');
const baseline = '24c29c9dfeda5c38d8ff021526da65ddaa301a6b';
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json')));
const form = fixture.forms.find(f => f.key === 'alpha');
const fields = ['id', 'date_created', String(form.school_field_id), String(form.national_id_field_id), String(form.first_name_field_id)];
const muPath = path.join(wpPath, 'wp-content/mu-plugins/inbox-width-candidate-a-mu.php');
const evidencePath = path.join(artifactDir, 'inbox-width-candidate-a-phase1.json');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function wp(code) {
    const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], {encoding:'utf8'});
    if (result.status !== 0) throw new Error(`${result.stderr}\n${result.stdout}`);
    return result.stdout.trim();
}
const evidence = {schema_version:1, decision:'REQUIRES_FURTHER_BOUNDED_PROTOTYPE', phase:'OBSERVATION_ONLY',
    repo_baseline:baseline, repo_head:process.env.GPP_WU21_REPOSITORY_SHA,
    gravity_flow_package_sha256:sha256(process.env.WU21_FLOW_ZIP),
    runtime:JSON.parse(fs.readFileSync(path.join(artifactDir,'runtime.json'))),
    bundles:{}, scenarios:[], gates:{}, phase2_executed:false, production_files_changed:false};
for (const file of ['scripts-theme.js','vendor-theme.js','common-inbox.4181e438e8373cc50e14.js']) {
    evidence.bundles[file] = sha256(path.join(wpPath,'wp-content/plugins/gravityflow/assets/js/dist',file));
}
assert.equal(evidence.gravity_flow_package_sha256,'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404');
let browser, pages = [];
function state(widths, extra = {}) {
    return fields.map((colId,i) => ({colId,width:widths[i],hide:false,pinned:null,sort:null,sortIndex:null,aggFunc:null,rowGroup:false,rowGroupIndex:null,pivot:false,pivotIndex:null,flex:null,...extra[colId]}));
}
async function capture(page, context, saved, options = {}) {
    const url = new URL(context.url);
    if (options.empty) url.searchParams.set('width_lab_empty','1');
    if (options.compose) url.searchParams.set('width_lab_compose','1');
    // Harness-only fixture setup; the attached observer never reads/writes Storage.
    await page.goto(url.toString(),{waitUntil:'networkidle'}); await waitForGrid(page);
    const id = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
    await page.evaluate(({id,saved}) => {
        localStorage.setItem('width-lab-local-sentinel','keep'); sessionStorage.setItem('width-lab-session-sentinel','keep');
        if (saved) localStorage.setItem(id,JSON.stringify(saved)); else localStorage.removeItem(id);
        sessionStorage.removeItem(id);
    },{id,saved});
    await page.goto(url.toString(),{waitUntil:'networkidle'}); await waitForGrid(page);
    assert.equal(await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id'),id,'Seed and observed mount must have identical native Grid ID');
    await page.waitForTimeout(450);
    const report = await page.evaluate(() => JSON.parse(JSON.stringify(window.__gppWidthQualification)));
    const entry = {route:context.kind,url:url.pathname,viewport:page.viewportSize(),scenario:options.name,
        grid_id:id,seed:saved,...report};
    evidence.scenarios.push(entry);
    assert.equal(report.function_was_attached_before_mount,true,`${context.kind}: delivery before mount`);
    assert.ok(report.events.some(e => e.api_available && e.column_api_available),'Public APIs missing from delivered events');
    assert.ok(report.attachment.every(a=>!a.mounted_before_attachment && !a.failure),'Attachment failed');
    assert.ok(report.attachment.flatMap(a=>a.callbacks).every(c=>!c.observation_error),'Observer error');
    assert.equal(report.repair_count,0);
    const dom = await page.evaluate(() => {
        const ids = ['gravityflow_theme_js-js-extra','gravityflow_theme_js-js-before','gravityflow_theme_js-js'];
        return {script_order:[...document.scripts].map(s=>s.id).filter(id=>ids.includes(id)),
            row_count:document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length};
    });
    entry.dom = dom;
    assert.deepEqual(dom.script_order,['gravityflow_theme_js-js-extra','gravityflow_theme_js-js-before','gravityflow_theme_js-js']);
    if (options.empty) assert.equal(dom.row_count,0);
    const restoreEvents = report.events.filter(e => e.callback==='onColumnEverythingChanged' && e.source==='api');
    entry.api_everything_changed_count = restoreEvents.length;
    if (saved) {
        assert.ok(restoreEvents.length>0,'Matching saved state did not deliver onColumnEverythingChanged');
        entry.native_restored_state = restoreEvents[0].state;
        const keyed = s => [...s].sort((a,b)=>String(a.colId).localeCompare(String(b.colId)));
        if (!saved.some(c=>Number(c.flex)>0)) assert.deepEqual(keyed(restoreEvents[0].state),keyed(saved),'Observer changed saved state');
    }
    if (options.compose) {
        entry.manual_composition_probe = await page.evaluate(() => {
            const opt = Object.values(gflow_config.grids)[0].grid_options;
            const result = opt.onGridSizeChanged.call({probe:'this-preserved'},{type:'compositionProbe'},'argument-preserved');
            return {result,prior:window.__gppWidthPrior,attachment:window.__gppWidthQualification.attachment};
        });
        assert.equal(entry.manual_composition_probe.result,'prior-return');
        assert.ok(entry.manual_composition_probe.prior.at(-1).this_probe);
        assert.ok(entry.manual_composition_probe.prior.at(-1).argument_probe);
        assert.ok(entry.manual_composition_probe.prior.slice(0,-1).every(c=>c.native_this_api),'Native callback receiver/API was not preserved');
        assert.ok(report.attachment.flatMap(a=>a.callbacks).every(c=>c.chained));
    }
    return entry;
}
try {
    const attributes = {selectedFormsJson:JSON.stringify([{value:form.form_id}])};
    pages = JSON.parse(wp(`
$items=array();foreach(array('shortcode'=>'[gravityflow page="inbox" form="${form.form_id}"]','block'=>'<!-- wp:gravityflow/inbox ${JSON.stringify(attributes)} /-->') as $kind=>$content){
 $id=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Width qualification '.$kind,'post_content'=>wp_slash($content)),true);
 if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$items[]=array('id'=>(int)$id,'kind'=>$kind,'url'=>get_permalink($id));}
 update_option('gpp_width_candidate_a_lab',array('pages'=>wp_list_pluck($items,'id'),'observer_path'=>${JSON.stringify(path.join(repoRoot,'tests/repro-evidence-lab/inbox-width-candidate-a-observer.js'))}),false);echo wp_json_encode($items);
`));
    fs.copyFileSync(path.join(repoRoot,'tests/repro-evidence-lab/inbox-width-candidate-a-mu.php'),muPath);
    process.env.IVD2_ADMIN_USER = fixture.operator.login;
    process.env.IVD2_ADMIN_PASSWORD = 'wu21-bootstrap-pass-2026';
    browser = await chromium.launch({headless:true});
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors = []; page.on('pageerror',e=>errors.push(String(e))); await login(page);
    for (const context of pages) {
        await capture(page,context,null,{name:'clean'});
        await capture(page,context,state([165,528,414,355,410]),{name:'stale_wide'});
        await capture(page,context,state([80,190,135,125,120]),{name:'saved_fitting'});
        await capture(page,context,state([165,528,414,355,410]),{name:'empty_stale',empty:true});
        await capture(page,context,state([165,528,414,355,410]),{name:'callback_composition',compose:true});
        const deep = state([165,528,414,355,410],{
            date_created:{sort:'asc',sortIndex:1},[fields[3]]:{sort:'desc',sortIndex:0},[fields[2]]:{hide:true}});
        await capture(page,context,[deep[0],deep[4],deep[3],deep[2],deep[1]],{name:'deep_state'});
        // Browser driver owns the intentional viewport change; observer only records host events.
        await page.setViewportSize({width:1100,height:900}); await page.waitForTimeout(450);
        const shrink = await page.evaluate(()=>JSON.parse(JSON.stringify(window.__gppWidthQualification)));
        await page.setViewportSize({width:1920,height:900}); await page.waitForTimeout(450);
        const grow = await page.evaluate(()=>JSON.parse(JSON.stringify(window.__gppWidthQualification)));
        evidence.scenarios.push({route:context.kind,scenario:'shrink_grow',shrink,grow});
        assert.ok(grow.events.filter(e=>e.callback==='onGridSizeChanged').length > shrink.events.filter(e=>e.callback==='onGridSizeChanged').length);
        await page.setViewportSize({width:1440,height:900});
        await capture(page,context,state([165,528,414,355,410],{[fields[3]]:{pinned:'left'}}),{name:'pinned_observation'});
        await capture(page,context,state([165,528,414,355,410],{[fields[4]]:{flex:1}}),{name:'flex_observation'});
        for(const width of [1920,390,320]) {
            await page.setViewportSize({width,height:900});
            await capture(page,context,null,{name:`clean_${width}`});
            await capture(page,context,state([165,528,414,355,410]),{name:`stale_${width}`});
        }
        await page.setViewportSize({width:1440,height:900});
    }
    evidence.page_errors = errors; assert.deepEqual(errors,[]);
    evidence.gates.delivery = 'RUNTIME_PROVEN'; evidence.gates.composition = 'RUNTIME_PROVEN';
    const restored = evidence.scenarios.filter(s=>s.native_restored_state);
    const readyReceived = restored.every(s=>s.events.some(e=>e.callback==='publicGridReady'));
    evidence.gates.public_ready_corroboration = readyReceived ? 'CAPTURED_REQUIRES_ORDER_REVIEW' : 'MISSED_IN_REAL_RUNTIME';
    evidence.gates.initial_restore_provenance = 'INITIAL_RESTORE_OBSERVED_BUT_UNIQUE_DISCRIMINATOR_NOT_PROVEN';
    evidence.gates.after_restore_timing = 'NOT_PROVEN_FOR_A_SAFE_MUTATION_TRIGGER';
    evidence.gates.usable_width_metric = 'CENTER_CLIENT_WIDTH_MATCHES_NATIVE_CLEAN_FIT_PENDING_MUTATION_VERIFICATION';
    evidence.gates.resize = 'NATIVE_EVENTS_CAPTURED';
    evidence.execution_status = 'CAPTURED';
    evidence.phase2_blocker = 'Initial api-source event matches the seeded restore in controlled cases, but has no restore-specific identity; the public gridReady corroboration subscribed through the surviving callback is not delivered. Source api alone is forbidden as a production discriminator. No mutation phase executed.';
} catch(error) {
    evidence.execution_status='ERROR'; evidence.failure=String(error.stack||error); throw error;
} finally {
    if (browser) await browser.close();
    if (fs.existsSync(muPath)) fs.unlinkSync(muPath);
    if (pages.length) wp(`foreach(${JSON.stringify(pages.map(p=>p.id))} as $id)wp_delete_post($id,true);delete_option('gpp_width_candidate_a_lab');`);
    fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
}
console.log('CANDIDATE_A_PHASE1_OBSERVATION_CAPTURED');
