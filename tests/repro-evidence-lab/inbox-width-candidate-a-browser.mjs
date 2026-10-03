import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { artifactDir, wpCli, wpPath, repoRoot, baseUrl, login, waitForGrid } from './inbox-visual-design-v2-browser-lib.mjs';
import { annotate, evaluate } from './inbox-width-candidate-a-discriminator.mjs';

if (!artifactDir || !wpCli || !wpPath || !repoRoot) throw new Error('Pinned WU21 lab unavailable');
const baseline = '24c29c9dfeda5c38d8ff021526da65ddaa301a6b';
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json')));
const form = fixture.forms.find(f => f.key === 'alpha');
const fields = ['id', 'date_created', String(form.school_field_id), String(form.national_id_field_id), String(form.first_name_field_id)];
const muPath = path.join(wpPath, 'wp-content/mu-plugins/inbox-width-candidate-a-mu.php');
const discriminatorOnly = process.env.GPP_WIDTH_DISCRIMINATOR_ONLY === '1';
const evidencePath = path.join(artifactDir, discriminatorOnly ? 'inbox-width-candidate-a-discriminator.json' : 'inbox-width-candidate-a-phase1.json');
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
    if (discriminatorOnly) {
        url.searchParams.set('width_lab_discriminator','1');
        if (saved) url.searchParams.set('width_lab_seeded','1');
        if (options.startup) url.searchParams.set('width_lab_startup','1');
        wp(`$lab=get_option('gpp_width_candidate_a_lab');$lab['control_state']=json_decode(${JSON.stringify(JSON.stringify(options.startup ? saved : null))},true);update_option('gpp_width_candidate_a_lab',$lab,false);`);
    }
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
    entry.physical_order = report.events[0].displayed.map(c=>c.id);
    assert.deepEqual(entry.physical_order,fields,'Accepted five-column physical order must remain native');
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
    if (discriminatorOnly) {
        entry.control_trace = await page.evaluate(()=>window.__gppWidthControl.trace);
        annotate(entry);
    }
    return entry;
}

async function refreshControlEvidence(page, entry) {
    await page.waitForTimeout(150);
    Object.assign(entry, await page.evaluate(()=>JSON.parse(JSON.stringify(window.__gppWidthQualification))));
    entry.control_trace = await page.evaluate(()=>window.__gppWidthControl.trace);
    entry.final_public_state = await page.evaluate(()=>window.__gppWidthControl.inspect());
    annotate(entry);
}

async function discriminatorCases(page, context) {
    const fitting = state([80,200,200,200,200]);
    const stale = state([165,528,414,355,410]);
    const clean = await capture(page,context,null,{name:'clean_no_restore'});
    assert.equal(clean.events.filter(e=>e.source==='api').length,0);
    await capture(page,context,stale,{name:'stale_restore'});
    await capture(page,context,fitting,{name:'fitting_restore'});
    await capture(page,context,stale,{name:'empty_restore',empty:true});
    const late = await capture(page,context,stale,{name:'unrelated_after_startup'});
    assert.equal(await page.evaluate(()=>window.__gppWidthControl.run('unrelated_after_startup')),true);
    await refreshControlEvidence(page,late);
    assert.ok(late.events.some(e=>e.source==='api' && e.fixture_origin==='unrelated_after_startup'));
    for (const [name, saved] of [['startup_clean',null],['startup_stale',stale],['startup_fitting',fitting],['startup_empty',stale]]) {
        const startup = await capture(page,context,saved,{name, startup:true, empty:name==='startup_empty'});
        assert.ok(startup.events.some(e=>e.source==='api' && e.fixture_origin==='unrelated_startup'),`${name}: synchronous public control did not emit`);
        const action = startup.control_trace.find(t=>t.kind==='end' && t.origin==='unrelated_startup');
        assert.equal(action.accepted,true);
        assert.equal(startup.events.filter(e=>e.fixture_origin==='unrelated_startup').length,1);
        assert.equal(startup.events.filter(e=>e.source==='api').length,saved ? 2 : 1,'Control/native delivery counts must be unambiguous');
    }
    const manual = await capture(page,context,stale,{name:'manual_resize'});
    const before = await page.evaluate(()=>window.__gppWidthControl.inspect());
    const handle = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"] .ag-header-cell-resize').first();
    const point = await handle.evaluate(node => {
        const box = node.getBoundingClientRect();
        // The native handle straddles a clipped header-cell edge. Its midpoint
        // can hit the adjacent header instead; select an actually exposed point.
        for (const fraction of [0.1,0.25,0.4,0.6,0.8,0.9]) {
            const x=box.x+box.width*fraction, y=box.y+box.height/2;
            const hit=document.elementFromPoint(x,y);
            if (hit && (hit===node || node.contains(hit))) return {x,y,hit_class:hit.className};
        }
        return null;
    });
    assert.ok(point,'Native resize handle has no exposed hit target');
    manual.resize_pointer_target = point;
    await page.mouse.move(point.x,point.y); await page.waitForTimeout(50);
    await page.mouse.down(); await page.waitForTimeout(50);
    await page.mouse.move(point.x+45,point.y,{steps:6}); await page.mouse.up();
    await refreshControlEvidence(page,manual);
    assert.notDeepEqual(manual.final_public_state.state,before.state,'User drag did not change width');
    assert.ok(manual.resize_events.some(e=>e.source==='uiColumnDragged' && e.finished),'Native user resize event missing');
    assert.equal(manual.events.filter(e=>e.source==='api').length,1,'User resize unexpectedly generated an API everything event');
    manual.manual_before = before;
    // Pin/flex only test whether those state facts disambiguate a same-state API call.
    for (const [name, extra] of [['pinned',{[fields[3]]:{pinned:'left'}}],['flex',{[fields[4]]:{flex:1}}]]) {
        const entry = await capture(page,context,state([165,528,414,355,410],extra),{name:`${name}_restore_then_unrelated`});
        assert.equal(await page.evaluate(()=>window.__gppWidthControl.run('unrelated_after_startup')),true);
        await refreshControlEvidence(page,entry);
    }
}

async function scrollGeometry(page) {
    const stages=[];
    for(const fraction of [0,0.5,1]) {
        await page.locator('[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport').evaluate((n,f)=>{n.scrollLeft=(n.scrollWidth-n.clientWidth)*f;},fraction);
        await page.waitForTimeout(200);
        const geometry=await page.locator('[data-js="gflow-inbox"]').evaluate(root=>{
            const rects=selector=>[...root.querySelectorAll(selector)].map(n=>({id:n.getAttribute('col-id'),left:n.getBoundingClientRect().left,width:n.getBoundingClientRect().width,direction:getComputedStyle(n).direction}));
            const headers=rects('.ag-header-cell'),cells=rects('.ag-center-cols-container .ag-row:first-child .ag-cell');
            const deltas=cells.map(c=>{const h=headers.find(h=>h.id===c.id);return h?Math.max(Math.abs(h.left-c.left),Math.abs(h.width-c.width)):null;}).filter(d=>d!=null);
            return {headers,cells,max_alignment_delta:deltas.length?Math.max(...deltas):null,
                scroll:[...root.querySelectorAll('.ag-header-viewport,.ag-center-cols-viewport,.ag-body-horizontal-scroll-viewport')].map(n=>({class:n.className,left:n.scrollLeft,direction:getComputedStyle(n).direction})),
                text_directions:[...root.querySelectorAll('.ag-header-cell-text,.ag-cell')].map(n=>getComputedStyle(n).direction),ag_ltr:!!root.querySelector('.ag-ltr'),ag_rtl:!!root.querySelector('.ag-rtl')};
        });
        assert.ok(geometry.ag_ltr && !geometry.ag_rtl);assert.ok(geometry.max_alignment_delta!=null && geometry.max_alignment_delta<=1);
        assert.ok(geometry.scroll.every(n=>n.direction==='ltr'));assert.ok(geometry.text_directions.every(d=>d==='rtl'));
        stages.push({fraction,...geometry});
    }
    return stages;
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
        if (discriminatorOnly) { await discriminatorCases(page,context); continue; }
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
            const stale=await capture(page,context,state([165,528,414,355,410]),{name:`stale_${width}`});
            stale.native_scroll_geometry=await scrollGeometry(page);
        }
        await page.setViewportSize({width:1440,height:900});
    }
    evidence.page_errors = errors; assert.deepEqual(errors,[]);
    if (discriminatorOnly) {
        evidence.qualification = evaluate(evidence.scenarios);
        evidence.decision = evidence.qualification.decision;
        evidence.execution_status = 'CAPTURED';
        evidence.phase2_blocker = 'Restore-specific authority is not proven. Only fixture actions mutated columns; no fit or production repair exists.';
        evidence.gates.focused_harness = 'PASS';
    } else {
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
    }
} catch(error) {
    evidence.execution_status='ERROR'; evidence.failure=String(error.stack||error); throw error;
} finally {
    if (browser) await browser.close();
    if (fs.existsSync(muPath)) fs.unlinkSync(muPath);
    if (pages.length) wp(`foreach(${JSON.stringify(pages.map(p=>p.id))} as $id)wp_delete_post($id,true);delete_option('gpp_width_candidate_a_lab');`);
    fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
}
console.log(discriminatorOnly ? 'CANDIDATE_A_DISCRIMINATOR_QUALIFICATION_CAPTURED' : 'CANDIDATE_A_PHASE1_OBSERVATION_CAPTURED');
