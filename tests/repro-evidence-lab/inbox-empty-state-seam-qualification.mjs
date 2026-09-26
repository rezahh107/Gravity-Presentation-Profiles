import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { applyScenarioAction } from '../visual-regression/scenario-state.mjs';

const qualificationId='GPP-INBOX-EMPTY-STATE-SEAM-V1';
const limitationOutcome='NO_SUPPORTED_SEARCH_NO_RESULT_PRESENTATION_SEAM';
const artifactRoot=path.join(process.env.WU21_ARTIFACT_DIR,'visual-regression-diagnostics');
fs.mkdirSync(artifactRoot,{recursive:true});
const outputPath=path.join(artifactRoot,'empty-state-seam.json');
const configCapturePath=path.join(artifactRoot,'empty-state-native-grid-config.jsonl');
const capturePluginPath=path.join(process.env.WU21_WP_PATH,'wp-content','mu-plugins','gpp-empty-state-native-config-capture.php');
const wp=(code)=>execFileSync('php',[process.env.WU21_WP_CLI,`--path=${process.env.WU21_WP_PATH}`,'eval',code],{encoding:'utf8'}).trim();
const fixture=JSON.parse(fs.readFileSync(path.join(process.env.WU21_ARTIFACT_DIR,'fixture-manifest.json'),'utf8'));
const p06=JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"), JSON_UNESCAPED_SLASHES);'));
const routes={
  shortcode:{url:fixture.frontend_inbox_url,page_id:Number(fixture.frontend_inbox_page_id)},
  block:{url:p06?.authentic_block_page?.url,page_id:Number(p06?.authentic_block_page?.page_id)},
};
for(const [route,target] of Object.entries(routes)){
  assert.ok(target.url,`Empty-state qualification ${route} route is unavailable.`);
  assert.ok(Number.isInteger(target.page_id)&&target.page_id>0,`Empty-state qualification ${route} page identity is unavailable.`);
}

const flowRoot=process.env.WU21_GRAVITYFLOW_SOURCE || path.join(process.env.WU21_WP_PATH,'wp-content/plugins/gravityflow');
const dist=path.join(flowRoot,'assets/js/dist');
const pick=(prefix)=>fs.readdirSync(dist).filter(name=>name.startsWith(prefix)&&name.endsWith('.js')).sort();
const vendorFiles=pick('vendor-theme.');
const inboxFiles=pick('common-inbox.');
assert.ok(vendorFiles.length>0,'Pinned Gravity Flow vendor-theme bundle is unavailable.');
assert.ok(inboxFiles.length>0,'Pinned Gravity Flow common-inbox bundle is unavailable.');
const readCombined=files=>files.map(file=>fs.readFileSync(path.join(dist,file),'utf8')).join('\n');
const vendorSource=readCombined(vendorFiles);
const inboxSource=readCombined(inboxFiles);
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const sourceEvidence={
  gravity_flow_version:wp("$d=get_file_data(WP_PLUGIN_DIR.'/gravityflow/gravityflow.php',['v'=>'Version']); echo $d['v'];"),
  package_sha256:process.env.WU21_FLOW_SHA256||null,
  vendor_files:vendorFiles.map(file=>({file,sha256:hash(fs.readFileSync(path.join(dist,file)))})),
  inbox_files:inboxFiles.map(file=>({file,sha256:hash(fs.readFileSync(path.join(dist,file)))})),
  generic_ag_grid_capability:{
    exact_25_2_0_banner:vendorSource.includes('AG Grid v25.2.0'),
    no_rows_center_class:vendorSource.includes('ag-overlay-no-rows-center'),
    show_no_rows_overlay_api:vendorSource.includes('showNoRowsOverlay'),
    overlay_no_rows_template:vendorSource.includes('overlayNoRowsTemplate'),
    no_rows_overlay_component:vendorSource.includes('noRowsOverlayComponent'),
  },
  gravity_flow_inbox_bundle_symbols:{
    native_quick_filter:inboxSource.includes('setQuickFilter'),
    show_no_rows_overlay_symbol:inboxSource.includes('showNoRowsOverlay'),
    hide_overlay_symbol:inboxSource.includes('hideOverlay'),
    overlay_no_rows_template_symbol:inboxSource.includes('overlayNoRowsTemplate'),
    no_rows_overlay_component_symbol:inboxSource.includes('noRowsOverlayComponent'),
    suppress_no_rows_overlay_symbol:inboxSource.includes('suppressNoRowsOverlay'),
    no_rows_center_class_symbol:inboxSource.includes('ag-overlay-no-rows-center'),
    interpretation:'Bundle symbol occurrence is source provenance only. It is not treated as proof that Gravity Flow configures or exposes that option in the supported Inbox integration.',
  },
};
assert.equal(sourceEvidence.gravity_flow_version,'3.1.0','Empty-state qualification requires exact Gravity Flow 3.1.0.');
assert.equal(sourceEvidence.generic_ag_grid_capability.exact_25_2_0_banner,true,'Empty-state qualification requires exact bundled AG Grid 25.2.0.');
assert.equal(sourceEvidence.gravity_flow_inbox_bundle_symbols.native_quick_filter,true,'Gravity Flow Inbox quick-filter source seam is unavailable.');

const targetPageIds=Object.values(routes).map(target=>target.page_id);
const phpCapturePath=configCapturePath.replaceAll('\\','\\\\').replaceAll("'","\\'");
const capturePlugin=`<?php
/* WU21 test-only capture: observe Gravity Flow's native Inbox grid_options at
 * priority 11, immediately after the host's priority-10 config builder and
 * before GPP's priority-99 presentation-only rowBuffer adjustment. */
add_filter( 'gravityflow_js_config_shared', function ( $config ) {
    $page_id = (int) get_queried_object_id();
    if ( ! in_array( $page_id, ${JSON.stringify(targetPageIds)}, true ) || ! is_array( $config ) || empty( $config['grids'] ) || ! is_array( $config['grids'] ) ) {
        return $config;
    }
    $overlay_keys = array( 'overlayNoRowsTemplate', 'noRowsOverlayComponent', 'noRowsOverlayComponentParams', 'suppressNoRowsOverlay' );
    foreach ( $config['grids'] as $grid_id => $grid_config ) {
        if ( empty( $grid_config['grid_options'] ) || ! is_array( $grid_config['grid_options'] ) ) {
            continue;
        }
        $options = $grid_config['grid_options'];
        foreach ( array( 'columnDefs', 'rowData', 'pagination', 'paginationPageSize', 'searchArgs' ) as $required_key ) {
            if ( ! array_key_exists( $required_key, $options ) ) {
                continue 2;
            }
        }
        $overlay = array();
        foreach ( $overlay_keys as $key ) {
            if ( array_key_exists( $key, $options ) ) {
                $value = $options[$key];
                $overlay[$key] = array(
                    'type' => gettype( $value ),
                    'scalar_value' => is_scalar( $value ) || null === $value ? $value : null,
                );
            }
        }
        $record = array(
            'page_id' => $page_id,
            'request_uri' => isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '',
            'grid_id' => (string) $grid_id,
            'grid_option_keys' => array_values( array_map( 'strval', array_keys( $options ) ) ),
            'overlay_options' => $overlay,
        );
        file_put_contents( '${phpCapturePath}', wp_json_encode( $record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\\n", FILE_APPEND | LOCK_EX );
    }
    return $config;
}, 11, 1 );
`;
if(fs.existsSync(configCapturePath)) fs.unlinkSync(configCapturePath);
fs.writeFileSync(capturePluginPath,capturePlugin);

const selectors={
  gridRoot:'[data-js="gflow-inbox"] .ag-root-wrapper',
  centerRows:'[data-js="gflow-inbox"] .ag-center-cols-container',
  searchInput:'[data-js="gflow-inbox-search"]',
};
const baseUrl=process.env.WU21_BASE_URL;
const cookies=JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+900; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce'});
await context.addCookies(cookies.map(cookie=>({...cookie,url:baseUrl})));
const runtimeRoutes=[];
try{
  for(const [route,target] of Object.entries(routes)){
    const page=await context.newPage();
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(target.url,{waitUntil:'networkidle'});
    await page.waitForSelector(selectors.gridRoot,{timeout:30000});
    const state=await applyScenarioAction(page,'search_empty',selectors);
    const observation=await page.evaluate(({gridRoot,centerRows,searchInput})=>{
      const visible=el=>!!el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().height>0;
      const node=document.querySelector('[data-js="gflow-inbox"] .ag-overlay-no-rows-center');
      const overlays=[...document.querySelectorAll('[data-js="gflow-inbox"] [class*="ag-overlay"]')].map(el=>({class_name:el.className,state:visible(el)?'VISIBLE':'HIDDEN',text:(el.textContent||'').trim().slice(0,160)}));
      return {
        zero_rows:document.querySelectorAll(`${centerRows} > .ag-row`).length===0,
        native_grid_count:document.querySelectorAll(gridRoot).length,
        native_pager_count:document.querySelectorAll('[data-js="gflow-inbox"] .ag-paging-panel').length,
        native_search_count:document.querySelectorAll(searchInput).length,
        replacement_grid_count:document.querySelectorAll('[data-gpp-replacement-inbox],.gpp-custom-inbox-app').length,
        no_rows_center_state:node?(visible(node)?'VISIBLE':'HIDDEN'):'ABSENT',
        no_rows_center_text:node?(node.textContent||'').trim():null,
        overlay_nodes:overlays,
        visible_meaningful_overlay_nodes:overlays.filter(item=>item.state==='VISIBLE'&&item.text.length>0).length,
      };
    },selectors);
    assert.equal(state.observed_rows,0,`${route}: quick filter did not reach zero rows.`);
    assert.equal(observation.zero_rows,true,`${route}: zero-row runtime observation failed.`);
    assert.equal(observation.native_grid_count,1,`${route}: native Grid ownership changed.`);
    assert.equal(observation.native_pager_count,1,`${route}: native pager ownership changed.`);
    assert.equal(observation.native_search_count,1,`${route}: native search ownership changed.`);
    assert.equal(observation.replacement_grid_count,0,`${route}: replacement Grid appeared.`);
    runtimeRoutes.push({route,url:target.url,page_id:target.page_id,...observation});
    const search=page.locator(selectors.searchInput);
    await search.fill('');
    await search.dispatchEvent('keyup');
    await page.waitForFunction(selector=>document.querySelectorAll(`${selector} > .ag-row`).length>0,selectors.centerRows,{timeout:15000});
    await page.close();
  }
}finally{
  await context.close();
  await browser.close();
  if(fs.existsSync(capturePluginPath)) fs.unlinkSync(capturePluginPath);
}

assert.ok(fs.existsSync(configCapturePath),'Gravity Flow native Inbox grid config capture was not produced.');
const configCaptures=fs.readFileSync(configCapturePath,'utf8').split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
const nativeConfigByRoute={};
for(const [route,target] of Object.entries(routes)){
  const captures=configCaptures.filter(item=>Number(item.page_id)===target.page_id);
  assert.ok(captures.length>0,`${route}: native Gravity Flow grid_options were not captured before the GPP presentation filter.`);
  nativeConfigByRoute[route]=captures;
}
const configuredOverlayOptions=configCaptures.flatMap(item=>Object.keys(item.overlay_options||{}));
const hostConfiguredNoResultOverlay=configuredOverlayOptions.length>0;
const runtimeSeamExposed=runtimeRoutes.some(route=>route.no_rows_center_state!=='ABSENT'||route.visible_meaningful_overlay_nodes>0);
const conclusion=!hostConfiguredNoResultOverlay&&!runtimeSeamExposed?limitationOutcome:'SUPPORTED_OR_AMBIGUOUS_NATIVE_PRESENTATION_SEAM_REQUIRES_REVIEW';
const evidence={
  qualification_id:qualificationId,
  status:conclusion===limitationOutcome?'PROVEN':'NOT_PROVEN',
  classification:conclusion===limitationOutcome?'NATIVE_HOST_LIMITATION':'EVIDENCE_REVIEW_REQUIRED',
  conclusion,
  scope:'Gravity Flow 3.1.0 Inbox quick-search no-result / zero displayed rows',
  source_identity:sourceEvidence,
  supported_integration_config:{
    capture_hook:'gravityflow_js_config_shared',
    capture_priority:11,
    gpp_presentation_filter_priority:99,
    timing:'AFTER_GRAVITY_FLOW_NATIVE_CONFIG__BEFORE_GPP_PRESENTATION_ADJUSTMENT',
    routes:nativeConfigByRoute,
    configured_no_result_overlay_option_keys:[...new Set(configuredOverlayOptions)].sort(),
  },
  runtime_observations:{routes:runtimeRoutes},
  interpretation:{
    generic_ag_grid_capability_is_not_supported_integration_seam:true,
    bundle_symbol_occurrence_is_not_configuration_proof:true,
    gravity_flow_inbox_native_config_exposes_no_result_overlay_option:hostConfiguredNoResultOverlay,
    supported_existing_no_result_presentation_node_exposed:runtimeSeamExposed,
    synthetic_empty_state_forbidden:true,
    note:conclusion===limitationOutcome?'AG Grid 25.2.0 contains generic no-row overlay capability, but the exact Gravity Flow 3.1.0 Inbox grid_options captured before GPP contain no no-result overlay option, and authentic shortcode/Block quick-filter zero-row runtime exposes no native no-rows presentation node or visible meaningful overlay. This is a pinned native-host limitation for the exercised search-empty state, not authority to fabricate replacement state.':'The supported integration config or authentic runtime exposes a possible native no-result presentation seam; do not classify the design relation as a host limitation until reviewed.',
  },
};
fs.writeFileSync(outputPath,JSON.stringify(evidence,null,2)+'\n');
console.log(`INBOX_EMPTY_STATE_SEAM_QUALIFICATION=${evidence.status} conclusion=${evidence.conclusion}`);
