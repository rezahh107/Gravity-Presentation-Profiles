import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const repoRoot = process.env.GITHUB_WORKSPACE;
const repositorySha = process.env.GPP_WU21_REPOSITORY_SHA;
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;

if (!artifactDir || !repoRoot || !repositorySha || !wpCli || !wpPath) {
  throw new Error('DIRECTION_CASCADE_VERIFICATION_INFRASTRUCTURE_FAILURE: incomplete WU21 environment.');
}

const fixturePath = path.join(artifactDir, 'fixture-manifest.json');
if (!fs.existsSync(fixturePath)) throw new Error('DIRECTION_CASCADE_VERIFICATION_INFRASTRUCTURE_FAILURE: fixture unavailable.');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!fixture.frontend_inbox_url || !fixture.forms?.[0]?.form_id) throw new Error('DIRECTION_CASCADE_VERIFICATION_INFRASTRUCTURE_FAILURE: Inbox fixture identity unavailable.');

function wpEval(code) {
  return execFileSync('php', [wpCli, '--path=' + wpPath, 'eval', code], { cwd: repoRoot, env: process.env, encoding: 'utf8' }).trim();
}

const p06Manifest = JSON.parse(wpEval("echo wp_json_encode(get_option('gpp_p06_fixture_manifest'), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);") || 'null');
const blockUrl = p06Manifest?.authentic_block_page?.url || null;
const formId = Number(fixture.forms[0].form_id);
const scopedCode =
  "$existing=get_page_by_path('wu21-direction-cascade-form-scoped',OBJECT,'page');" +
  "if($existing instanceof WP_Post){wp_delete_post($existing->ID,true);}" +
  "$page_id=wp_insert_post(array('post_title'=>'WU21 Direction Cascade Form Scoped Inbox','post_status'=>'publish','post_type'=>'page','post_name'=>'wu21-direction-cascade-form-scoped','post_content'=>'[gravityflow page=\"inbox\" form=\"" + formId + "\"]'),true);" +
  "if(is_wp_error($page_id)){throw new RuntimeException($page_id->get_error_message());}" +
  "echo wp_json_encode(array('page_id'=>(int)$page_id,'url'=>get_permalink($page_id)),JSON_UNESCAPED_SLASHES);";
const scopedSetup = JSON.parse(wpEval(scopedCode));
if (!scopedSetup?.page_id || !scopedSetup?.url) throw new Error('DIRECTION_CASCADE_VERIFICATION_INFRASTRUCTURE_FAILURE: form-scoped route setup failed.');

const muDir = path.join(wpPath, 'wp-content/mu-plugins');
const muPath = path.join(muDir, 'inbox-direction-cascade-root-cause-mu.php');
const muSource = path.join(repoRoot, 'tests/repro-evidence-lab/inbox-visual-design-v2-qualification-mu.php');
fs.mkdirSync(muDir, { recursive: true });
fs.copyFileSync(muSource, muPath);

const authCode =
  "$u=get_user_by('login','bootstrap_admin');" +
  "if(!$u)throw new RuntimeException('Synthetic WU21 admin unavailable.');" +
  "$e=time()+900;" +
  "echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))),JSON_UNESCAPED_SLASHES);";
const authCookies = JSON.parse(wpEval(authCode));

const nodeSelectors = {
  html: 'html',
  body: 'body',
  surface: '.gpp-inbox-surface',
  inner: '.gpp-inbox-surface__inner',
  host: '.gpp-inbox-surface__host',
  gravityflow_wrap: '.gravityflow_wrap',
  inbox: '.gflow-inbox.gflow-grid.gflow-common',
  ag_root_wrapper: '[data-js="gflow-inbox"] .ag-root-wrapper',
  ag_header_viewport: '[data-js="gflow-inbox"] .ag-header-viewport',
  ag_center_cols_viewport: '[data-js="gflow-inbox"] .ag-center-cols-viewport',
  ag_body_viewport: '[data-js="gflow-inbox"] .ag-body-viewport',
  ag_body_horizontal_scroll_viewport: '[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport',
};
const chainNames = ['html','body','surface','inner','host','gravityflow_wrap','inbox','ag_root_wrapper','ag_header_viewport','ag_center_cols_viewport','ag_body_viewport','ag_body_horizontal_scroll_viewport'];

function withRtlProbe(raw) {
  const url = new URL(raw);
  url.searchParams.set('wu21_header_rtl_probe', '1');
  return url.toString();
}

const routes = [
  { id:'form_scoped_shortcode_rtl', kind:'AUTHENTIC_FORM_SCOPED_SHORTCODE', url:withRtlProbe(scopedSetup.url), rtl_probe:true, required:true },
  { id:'unscoped_shortcode_rtl', kind:'AUTHENTIC_UNSCOPED_SHORTCODE', url:withRtlProbe(fixture.frontend_inbox_url), rtl_probe:true, required:true },
  { id:'registered_block_rtl', kind:'AUTHENTIC_REGISTERED_GRAVITYFLOW_INBOX_BLOCK', url:blockUrl ? withRtlProbe(blockUrl) : null, rtl_probe:true, required:Boolean(blockUrl) },
  { id:'admin_q2_ltr_control', kind:'AUTHENTIC_ADMIN_INBOX_Q2_CONTROL', url:baseUrl + '/wp-admin/admin.php?page=gravityflow-inbox', rtl_probe:false, required:true },
];

async function waitForInbox(page) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout:30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout:30000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(150);
}

async function capture(page, route) {
  await page.setViewportSize({ width:1200, height:900 });
  await page.goto(route.url, { waitUntil:'networkidle' });
  await waitForInbox(page);

  return page.evaluate(({ route, nodeSelectors, chainNames }) => {
    function ownerIdentity(sheet) {
      const owner = sheet.ownerNode;
      return {
        href: sheet.href || null,
        owner_tag: owner?.tagName?.toLowerCase?.() || null,
        owner_id: owner?.id || null,
        owner_media: owner?.media || null,
        owner_text_prefix: owner?.tagName?.toLowerCase?.() === 'style' ? (owner.textContent || '').trim().slice(0,180) : null,
      };
    }

    function selectorSpecificity(selector) {
      const cleaned = selector.replace(/:where\([^)]*\)/g,'').replace(/::[\w-]+/g,' TYPEPSEUDO ');
      const ids = (cleaned.match(/#[\w-]+/g) || []).length;
      const classes = (cleaned.match(/\.[\w-]+/g) || []).length;
      const attrs = (cleaned.match(/\[[^\]]+\]/g) || []).length;
      const pseudos = (cleaned.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
      const types = (cleaned.replace(/#[\w-]+/g,' ').replace(/\.[\w-]+/g,' ').replace(/\[[^\]]+\]/g,' ').replace(/:(?!:)[\w-]+(?:\([^)]*\))?/g,' ').match(/(^|[\s>+~,(])([a-zA-Z][\w-]*|\*)/g) || []).filter(token => !token.includes('*')).length;
      return [ids, classes + attrs + pseudos, types];
    }

    function compareSpecificity(a,b) {
      for (let i=0;i<3;i+=1) if (a[i] !== b[i]) return a[i] - b[i];
      return 0;
    }

    function splitSelectors(selectorText) {
      const parts=[]; let depth=0; let start=0;
      for (let i=0;i<selectorText.length;i+=1) {
        const ch=selectorText[i];
        if (ch==='(' || ch==='[') depth+=1;
        else if (ch===')' || ch===']') depth=Math.max(0,depth-1);
        else if (ch===',' && depth===0) { parts.push(selectorText.slice(start,i).trim()); start=i+1; }
      }
      parts.push(selectorText.slice(start).trim());
      return parts.filter(Boolean);
    }

    let sourceOrder=0;
    const activeDirectionRules=[];
    const stylesheetInventory=[];

    function visitRules(rules,sheetIdentity,context=[]) {
      for (const rule of [...rules]) {
        if (rule instanceof CSSStyleRule) {
          const value=rule.style.getPropertyValue('direction');
          if (value) {
            sourceOrder+=1;
            activeDirectionRules.push({
              selector_text:rule.selectorText,
              value:value.trim(),
              important:rule.style.getPropertyPriority('direction')==='important',
              source_order:sourceOrder,
              stylesheet:sheetIdentity,
              context:[...context],
              css_text:rule.cssText.slice(0,1000),
            });
          }
          continue;
        }
        if (!('cssRules' in rule) || !rule.cssRules) continue;
        let active=true;
        let descriptor=rule.constructor?.name || 'CSSGroupingRule';
        if (rule instanceof CSSMediaRule) {
          descriptor='@media ' + rule.conditionText;
          active=matchMedia(rule.conditionText).matches;
        } else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule) {
          descriptor='@supports ' + rule.conditionText;
          try { active=CSS.supports(rule.conditionText); } catch { active=true; }
        }
        if (active) visitRules(rule.cssRules,sheetIdentity,[...context,descriptor]);
      }
    }

    for (const sheet of [...document.styleSheets]) {
      const identity=ownerIdentity(sheet);
      const record={...identity,accessible:true,rule_count:null};
      try {
        record.rule_count=sheet.cssRules.length;
        visitRules(sheet.cssRules,identity);
      } catch (error) {
        record.accessible=false;
        record.error=String(error);
      }
      stylesheetInventory.push(record);
    }

    function matchedDirectionRules(el) {
      const matches=[];
      for (const rule of activeDirectionRules) {
        for (const selector of splitSelectors(rule.selector_text)) {
          let matched=false;
          try { matched=el.matches(selector); } catch { matched=false; }
          if (!matched) continue;
          matches.push({...rule,matched_selector:selector,specificity:selectorSpecificity(selector)});
        }
      }
      return matches;
    }

    function rankWinner(matches) {
      if (!matches.length) return null;
      return [...matches].sort((a,b) => {
        if (a.important !== b.important) return Number(a.important) - Number(b.important);
        const s=compareSpecificity(a.specificity,b.specificity);
        if (s!==0) return s;
        return a.source_order - b.source_order;
      }).at(-1);
    }

    function identity(el) {
      if (!el) return null;
      return {
        tag:el.tagName.toLowerCase(),
        id:el.id || null,
        classes:typeof el.className==='string' ? el.className.trim().split(/\s+/).filter(Boolean) : [],
        dir_attribute:el.getAttribute('dir'),
        inline_style_attribute:el.getAttribute('style'),
      };
    }

    function describe(name,selector) {
      const el=document.querySelector(selector);
      if (!el) return null;
      const computed=getComputedStyle(el);
      const parent=el.parentElement;
      const directMatches=matchedDirectionRules(el);
      const authorWinner=rankWinner(directMatches);
      const dirAttribute=el.getAttribute('dir');
      const inlineDirection=el.style?.getPropertyValue('direction')?.trim() || null;
      const inlineImportant=el.style?.getPropertyPriority('direction')==='important';

      let establishment='INHERITED_OR_UA';
      let winningMechanism=null;
      if (inlineDirection) {
        establishment='EXPLICIT_INLINE_STYLE';
        winningMechanism={kind:'INLINE_STYLE',value:inlineDirection,important:inlineImportant,style_attribute:el.getAttribute('style')};
      } else if (authorWinner) {
        establishment='EXPLICIT_AUTHOR_CSS';
        winningMechanism={kind:'AUTHOR_CSS_RULE',value:authorWinner.value,selector:authorWinner.matched_selector,important:authorWinner.important,specificity:authorWinner.specificity,source_order:authorWinner.source_order,stylesheet:authorWinner.stylesheet,context:authorWinner.context,css_text:authorWinner.css_text};
      } else if (dirAttribute) {
        establishment='EXPLICIT_DIR_ATTRIBUTE_PRESENTATION_HINT';
        winningMechanism={kind:'DIR_ATTRIBUTE',value:dirAttribute};
      } else if (parent && computed.direction===getComputedStyle(parent).direction) {
        establishment='INHERITED_FROM_PARENT';
        winningMechanism={kind:'INHERITED',from_parent:identity(parent),value:getComputedStyle(parent).direction};
      }

      return {
        name,selector,identity:identity(el),
        computed_direction:computed.direction,
        parent_identity:identity(parent),
        parent_computed_direction:parent ? getComputedStyle(parent).direction : null,
        inline_direction:inlineDirection,
        direct_direction_rules:directMatches,
        mechanically_ranked_author_winner:authorWinner,
        establishment,
        winning_mechanism:winningMechanism,
      };
    }

    const nodes=Object.fromEntries(Object.entries(nodeSelectors).map(([name,selector]) => [name,describe(name,selector)]));
    const presentChain=chainNames.map(name => nodes[name]).filter(Boolean);
    const hostIndex=presentChain.findIndex(node => node.name==='host');
    const postHost=hostIndex>=0 ? presentChain.slice(hostIndex) : presentChain;
    let firstLtr=null;
    let firstRtlAfterLtr=null;
    for (const node of postHost) {
      if (!firstLtr && node.computed_direction==='ltr') firstLtr=node;
      if (firstLtr && node.computed_direction==='rtl') { firstRtlAfterLtr=node; break; }
    }

    return {
      route,
      page_url:location.href,
      document_direction:getComputedStyle(document.documentElement).direction,
      body_classes:[...document.body.classList],
      style_links:[...document.querySelectorAll('link[rel="stylesheet"]')].map(link => ({id:link.id || null,href:link.href,media:link.media || null})),
      stylesheet_inventory:stylesheetInventory,
      nodes,
      chain_order:presentChain.map(node => ({name:node.name,computed_direction:node.computed_direction,establishment:node.establishment,winning_mechanism:node.winning_mechanism})),
      ltr_seam_analysis:{
        host_present:Boolean(nodes.host),
        host_computed_direction:nodes.host?.computed_direction || null,
        first_ltr_at_or_after_host:firstLtr?.name || null,
        first_rtl_after_ltr:firstRtlAfterLtr?.name || null,
        first_rtl_node:firstRtlAfterLtr || null,
      },
      grid_identity:{
        root_classes:nodes.ag_root_wrapper?.identity?.classes || [],
        ag_ltr:nodes.ag_root_wrapper?.identity?.classes?.includes('ag-ltr') || false,
        ag_rtl:nodes.ag_root_wrapper?.identity?.classes?.includes('ag-rtl') || false,
      },
    };
  }, { route,nodeSelectors,chainNames });
}

const evidence={
  schema:'gpp.pr126_direction_cascade_root_cause.v1',
  repository:'rezahh107/Gravity-Presentation-Profiles',
  exact_starting_head:'6c4386eda537cd8ab4a1ccd25484af00911d52a9',
  executed_repository_sha:repositorySha,
  runtime_source:'PINNED_WU21',
  production_files_modified_by_verification:[],
  routes:{},
  mechanically_demonstrated_instances:[],
  root_cause_anchor:null,
  validation_gate_assessment:{current_workflow_accepts_diagnostic_dispositions:null,required_future_success_disposition:'PRODUCTION_REPAIR_VERIFIED'},
};

let browser=null;
let fatal=null;
try {
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce'});
  await context.addCookies(authCookies.map(cookie => ({...cookie,url:baseUrl})));
  const page=await context.newPage();

  for (const route of routes) {
    if (!route.url) {
      evidence.routes[route.id]={route,status:route.required?'NOT_ASSESSABLE':'NOT_APPLICABLE',reason:'Route URL unavailable from authoritative WU21 fixture.'};
      continue;
    }
    try {
      evidence.routes[route.id]={status:'CAPTURED',...(await capture(page,route))};
    } catch (error) {
      evidence.routes[route.id]={route,status:'ERROR',error:String(error?.stack || error).slice(0,12000)};
    }
  }

  const scoped=evidence.routes.form_scoped_shortcode_rtl;
  const unscoped=evidence.routes.unscoped_shortcode_rtl;
  const block=evidence.routes.registered_block_rtl;

  const instance=entry => {
    const a=entry?.ltr_seam_analysis;
    if (entry?.status!=='CAPTURED' || !a?.first_rtl_node) return null;
    const node=a.first_rtl_node;
    return {
      route_id:entry.route.id,
      route_kind:entry.route.kind,
      first_rtl_boundary:node.name,
      selector:node.selector,
      computed_direction:node.computed_direction,
      parent_computed_direction:node.parent_computed_direction,
      establishment:node.establishment,
      winning_mechanism:node.winning_mechanism,
      grid_identity:entry.grid_identity,
    };
  };

  evidence.mechanically_demonstrated_instances=[instance(scoped),instance(unscoped),instance(block)].filter(Boolean);
  const scopedInstance=instance(scoped);
  evidence.root_cause_anchor=scopedInstance ? {
    status:'ESTABLISHED',
    route_id:scopedInstance.route_id,
    first_rtl_boundary:scopedInstance.first_rtl_boundary,
    selector:scopedInstance.selector,
    establishment:scopedInstance.establishment,
    winning_mechanism:scopedInstance.winning_mechanism,
    statement:'The intended physical LTR seam is re-entered into RTL at this first captured node; downstream native Grid direction follows from that boundary.',
  } : {
    status:'NOT_ASSESSABLE',
    reason:'The form-scoped route did not expose a mechanically identifiable LTR-to-RTL transition in the required node chain.',
  };

  evidence.reproduction={
    form_scoped_root_direction:scoped?.nodes?.ag_root_wrapper?.computed_direction || null,
    form_scoped_ag_ltr:scoped?.grid_identity?.ag_ltr ?? null,
    unscoped_root_direction:unscoped?.nodes?.ag_root_wrapper?.computed_direction || null,
    unscoped_ag_ltr:unscoped?.grid_identity?.ag_ltr ?? null,
    block_root_direction:block?.nodes?.ag_root_wrapper?.computed_direction || null,
    block_ag_ltr:block?.grid_identity?.ag_ltr ?? null,
    admin_q2_root_direction:evidence.routes.admin_q2_ltr_control?.nodes?.ag_root_wrapper?.computed_direction || null,
    admin_q2_ag_ltr:evidence.routes.admin_q2_ltr_control?.grid_identity?.ag_ltr ?? null,
  };

  const requiredRoutes=routes.filter(route => route.required);
  const incomplete=requiredRoutes.filter(route => evidence.routes[route.id]?.status!=='CAPTURED').map(route => route.id);
  evidence.completeness={required_routes:requiredRoutes.map(route => route.id),incomplete_routes:incomplete,complete:incomplete.length===0};

  const workflow=fs.readFileSync(path.join(repoRoot,'.github/workflows/wu21-repro-evidence-lab.yml'),'utf8');
  const diagnosticGate=/PRODUCTION_REPAIR_VERIFIED\|HYPOTHESIS_SUPPORTED\|HYPOTHESIS_FALSIFIED\|NOT_PROVEN/.test(workflow);
  evidence.validation_gate_assessment.current_workflow_accepts_diagnostic_dispositions=diagnosticGate;
  evidence.validation_gate_assessment.current_gate_status=diagnosticGate?'INSUFFICIENT_FOR_PRODUCTION_REPAIR_ACCEPTANCE':'DIAGNOSTIC_DISPOSITIONS_NOT_ACCEPTED';

  fs.writeFileSync(path.join(artifactDir,'pr126-direction-cascade-root-cause.json'),JSON.stringify(evidence,null,2)+'\n');

  console.log('PR126_DIRECTION_CASCADE_REPRODUCTION='+JSON.stringify(evidence.reproduction));
  console.log('PR126_DIRECTION_CASCADE_ROOT='+JSON.stringify(evidence.root_cause_anchor));
  console.log('PR126_DIRECTION_CASCADE_INSTANCES='+JSON.stringify(evidence.mechanically_demonstrated_instances));
  console.log('PR126_DIRECTION_CASCADE_GATE='+JSON.stringify(evidence.validation_gate_assessment));
  console.log('PR126_DIRECTION_CASCADE_COMPLETE='+evidence.completeness.complete);

  if (!evidence.completeness.complete) throw new Error('DIRECTION_CASCADE_VERIFICATION_INCOMPLETE: '+evidence.completeness.incomplete_routes.join(','));
} catch (error) {
  fatal=error;
  throw error;
} finally {
  if (browser) await browser.close().catch(()=>{});
  fs.rmSync(muPath,{force:true});
  try { wpEval('wp_delete_post('+Number(scopedSetup.page_id)+',true);'); }
  catch (cleanupError) {
    if (!fatal) throw cleanupError;
    console.error('DIRECTION_CASCADE_CLEANUP_FAILURE='+String(cleanupError));
  }
}
