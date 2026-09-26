import assert from 'node:assert/strict';
import { MATRIX_J_CASES, MATRIX_J_ROUTES, MATRIX_J_QUALIFICATION_ID, assertSerializedMatrixJProvenEvidence } from './matrix-j-evidence-contract.mjs';

const clone = value => structuredClone(value);
const observation = (caseName, route) => {
  const spec=MATRIX_J_CASES[caseName];
  const afterWidth=spec.window_width/2;
  const state={
    inner_width:afterWidth,
    narrow_media_matches:spec.expected_narrow_media,
    cards_per_visual_row:spec.expected_cards_per_visual_row,
    document_horizontal_overflow:0,
    surface_count:1,
    grid_count:1,
    replacement_grid_count:0,
    pager_count:1,
    search_count:1,
    manual_refresh_count:1,
    search_reachable:true,
    pager_reachable:true,
    manual_refresh_reachable:true,
    grid_visible:true,
    card_details_within_card:true,
    last_card_pager_overlap:false,
  };
  return {
    case:caseName,
    route,
    requested_window:{width:spec.window_width,height:spec.window_height},
    zoom_api:{requested:2,actual:2,settings:{mode:'automatic',scope:'per-origin'}},
    before:{inner_width:spec.window_width},
    after:state,
    restored:{...state},
    layout_width_ratio:2,
    pagination:{page_after:'2',second_page_rows:6},
    search:{observed_rows:1,unique_fixture_present:true},
  };
};

const valid={
  qualification_id:MATRIX_J_QUALIFICATION_ID,
  matrix:'J',
  requested_zoom_factor:2,
  status:'PROVEN',
  conclusion:'GENUINE_BROWSER_ZOOM_200_EXECUTED_AND_QUALIFIED',
  mechanism:{kind:'CHROMIUM_EXTENSION_TABS_SET_ZOOM',api:'chrome.tabs.setZoom(tabId, 2)',verification_api:'chrome.tabs.getZoom(tabId)'},
  observations:Object.keys(MATRIX_J_CASES).flatMap(caseName=>MATRIX_J_ROUTES.map(route=>observation(caseName,route))),
  block_shortcode_parity:Object.entries(MATRIX_J_CASES).map(([caseName,spec])=>({
    case:caseName,
    shortcode_effective_width:spec.window_width/2,
    block_effective_width:spec.window_width/2,
    shortcode_cards_per_row:spec.expected_cards_per_visual_row,
    block_cards_per_row:spec.expected_cards_per_visual_row,
    shortcode_narrow:spec.expected_narrow_media,
    block_narrow:spec.expected_narrow_media,
  })),
};
assert.doesNotThrow(()=>assertSerializedMatrixJProvenEvidence(valid));

const mutateCards=(source,caseName,route,count)=>{
  const next=clone(source);
  const item=next.observations.find(entry=>entry.case===caseName&&entry.route===route);
  item.after.cards_per_visual_row=count;
  item.restored.cards_per_visual_row=count;
  return next;
};
let wrong=clone(valid);
for(const route of MATRIX_J_ROUTES) wrong=mutateCards(wrong,'desktop_effective',route,1);
wrong.block_shortcode_parity.find(item=>item.case==='desktop_effective').shortcode_cards_per_row=1;
wrong.block_shortcode_parity.find(item=>item.case==='desktop_effective').block_cards_per_row=1;
assert.throws(()=>assertSerializedMatrixJProvenEvidence(wrong),/Card Mode composition/,'Same wrong desktop parity must not qualify Matrix J.');

wrong=clone(valid);
for(const route of MATRIX_J_ROUTES) wrong=mutateCards(wrong,'narrow_effective',route,2);
wrong.block_shortcode_parity.find(item=>item.case==='narrow_effective').shortcode_cards_per_row=2;
wrong.block_shortcode_parity.find(item=>item.case==='narrow_effective').block_cards_per_row=2;
assert.throws(()=>assertSerializedMatrixJProvenEvidence(wrong),/Card Mode composition/,'Same wrong narrow parity must not qualify Matrix J.');

const oneRoute=mutateCards(valid,'desktop_effective','block',1);
assert.throws(()=>assertSerializedMatrixJProvenEvidence(oneRoute),/Card Mode composition/,'One-route-only mismatch must fail Matrix J.');

const serializedWrong=mutateCards(valid,'narrow_effective','shortcode',2);
assert.throws(()=>assertSerializedMatrixJProvenEvidence(JSON.parse(JSON.stringify(serializedWrong))),/Card Mode composition/,'Serialized PROVEN evidence with wrong Card Mode composition must be rejected.');

const mutations=[
  evidence=>{evidence.observations[0].zoom_api.actual=1.5;},
  evidence=>{evidence.observations[0].after.inner_width=evidence.observations[0].before.inner_width; evidence.observations[0].layout_width_ratio=1;},
  evidence=>{evidence.observations[0].after.narrow_media_matches=true;},
  evidence=>{evidence.observations[0].after.document_horizontal_overflow=12;},
  evidence=>{evidence.observations[0].after.grid_count=2;},
  evidence=>{evidence.observations[0].after.replacement_grid_count=1;},
  evidence=>{evidence.observations[0].after.pager_count=0;},
  evidence=>{evidence.observations[0].after.search_count=0;},
  evidence=>{evidence.observations[0].after.search_reachable=false;},
  evidence=>{evidence.observations[0].pagination.page_after='1';},
  evidence=>{evidence.observations[0].search.observed_rows=0;},
  evidence=>{evidence.block_shortcode_parity[0].block_effective_width+=20;},
];
for(const mutate of mutations){
  const candidate=clone(valid);mutate(candidate);
  assert.throws(()=>assertSerializedMatrixJProvenEvidence(candidate));
}
console.log('MATRIX_J_SEMANTIC_FALSIFICATION_PASS correct_absolute_layout=true same_wrong_parity_rejected=true one_route_mismatch_rejected=true serialized_wrong_card_count_rejected=true genuine_zoom_and_lifecycle_requirements_preserved=true');
