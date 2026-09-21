import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';
const timelineRefinementPath = 'assets/css/srwf-gravity-flow-entry-detail-full-width-timeline.css';

if (!artifactDir || !wpPath || !wpCli) throw new Error('WU18 Full Width browser environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function lifecycleFacts() {
  return JSON.parse(wpEval(`
    $v=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME));
    $b=get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME);
    echo wp_json_encode(array('activations'=>$v->snapshot()['activations'],'binding_hash'=>hash('sha256',wp_json_encode($b))),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function activeVariantFacts() {
  return JSON.parse(wpEval(`
    $s=\\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress();
    echo wp_json_encode($s->activeFacts(),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function staleCommandResult(command) {
  const encoded = Buffer.from(command, 'utf8').toString('base64');
  return JSON.parse(wpEval(`
    $value=base64_decode('${encoded}');
    try { \\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress()->applySettingsValue($value); echo wp_json_encode(array('status'=>'UNEXPECTED_SUCCESS')); }
    catch (\\GravityPresentationProfiles\\Core\\Lifecycle\\LifecycleException $e) { echo wp_json_encode(array('status'=>'REJECTED','reason'=>$e->reasonCode())); }
  `));
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.alpha?.form_id || !manifest?.alpha?.entry_id || !manifest?.transition?.form_id || !manifest?.transition?.entry_id) {
  throw new Error('WU18 fixture manifest is incomplete for visual variant qualification.');
}

const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
const fullProfile = 'srwf.operations.entry-detail.full-width.v1';
const safeProfile = 'srwf.operations.entry-detail.v1';
const raw = name => path.join(artifactDir, `wu18-variant-${name}.raw.png`);

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', adminPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}

async function waitDossier(page, profile) {
  await page.waitForSelector(`.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-profile-id="${profile}"]`, { timeout: 30000 });
}

async function gotoReview(page, viewport, profile) {
  await page.setViewportSize(viewport);
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(page, profile);
}

async function selectVariantThroughSettings(page, labelFragment) {
  await page.goto(settingsUrl, { waitUntil: 'networkidle' });
  const select = page.locator('#entry_detail_visual_variant_action');
  if (await select.count() !== 1) throw new Error('Entry Detail design selector is not reachable in the authentic GPP settings renderer.');
  const options = await select.locator('option').evaluateAll(items => items.map(item => ({ label: item.textContent?.trim() || '', value: item.value })));
  const choice = options.find(item => item.label.includes(labelFragment) && item.value);
  if (!choice) throw new Error(`Selectable visual variant missing from settings: ${labelFragment}; options=${JSON.stringify(options)}`);
  await select.selectOption(choice.value);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#gform-settings-save'),
  ]);
  return { choice, options };
}

async function inspectReview(page) {
  return page.evaluate((timelinePath) => {
    const visible = node => Boolean(node && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden');
    const rect = node => node ? (() => { const r=node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; })() : null;
    const text = node => node?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const postBody = document.querySelector('#post-body');
    const main = document.querySelector('#post-body-content');
    const workflow = document.querySelector('#postbox-container-1');
    const timelineContainer = document.querySelector('#postbox-container-2');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const notes = Array.from(document.querySelectorAll('.gravityflow-timeline .gravityflow-note'));
    const firstNote = notes[0] || null;
    const firstTitle = firstNote?.querySelector('.gravityflow-note-title') || null;
    const firstWrap = firstNote?.querySelector('.gravityflow-note-body-wrap') || null;
    const firstOuterBody = firstWrap?.querySelector(':scope > .gravityflow-note-body') || null;
    const firstHeader = firstOuterBody?.querySelector(':scope > .gravityflow-note-header') || null;
    const firstEventBody = firstOuterBody?.querySelector(':scope > .gravityflow-note-body') || null;
    const firstAvatar = firstNote?.querySelector('.gravityflow-note-avatar') || null;
    const headingLabel = timeline?.querySelector(':scope > h3 > label') || null;
    const nativePrint = document.querySelector('.detail-view-print');
    const gppPrint = document.querySelector('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]');
    const table = document.querySelector('.entry-detail-view');
    const actions = Array.from(document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button')).map(button => {
      const style = getComputedStyle(button);
      const r = button.getBoundingClientRect();
      return { value: button.value, height: r.height, background: style.backgroundColor, color: style.color, border: style.borderColor, disabled: button.disabled || button.getAttribute('aria-disabled') === 'true' };
    });
    const noteStyle = firstNote ? getComputedStyle(firstNote) : null;
    const inside = timeline?.querySelector(':scope > .inside') || null;
    const titlePseudo = firstTitle ? getComputedStyle(firstTitle, '::before') : null;
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    const fullStyle = stylesheets.find(link => (link.id || '').includes('entry-detail-full-width'));
    const timelineStyle = stylesheets.find(link => (link.getAttribute('href') || '').includes(timelinePath));
    const rootStyle = document.querySelector('.gravityflow_workflow_detail') ? getComputedStyle(document.querySelector('.gravityflow_workflow_detail')) : null;
    const outerStyle = firstOuterBody ? getComputedStyle(firstOuterBody) : null;
    const headerStyle = firstHeader ? getComputedStyle(firstHeader) : null;
    const eventBodyStyle = firstEventBody ? getComputedStyle(firstEventBody) : null;
    const avatarStyle = firstAvatar ? getComputedStyle(firstAvatar) : null;
    const railStyle = firstOuterBody ? getComputedStyle(firstOuterBody, '::before') : null;
    const centerMarkerStyle = firstOuterBody ? getComputedStyle(firstOuterBody, '::after') : null;
    const headingStyle = headingLabel ? getComputedStyle(headingLabel) : null;
    const headingPseudo = headingLabel ? getComputedStyle(headingLabel, '::before') : null;
    const nativeEventSignature = notes.map(note => {
      const wrap = note.querySelector('.gravityflow-note-body-wrap');
      const outer = wrap?.querySelector(':scope > .gravityflow-note-body') || null;
      const header = outer?.querySelector(':scope > .gravityflow-note-header') || null;
      const body = outer?.querySelector(':scope > .gravityflow-note-body') || null;
      return {
        classes: [...note.classList],
        actor: text(header?.querySelector('.gravityflow-note-title')),
        meta: text(header?.querySelector('.gravityflow-note-meta')),
        body: text(body),
      };
    });
    const nestedNativeEventCount = notes.filter(note => {
      const wrap = note.querySelector('.gravityflow-note-body-wrap');
      const outer = wrap?.querySelector(':scope > .gravityflow-note-body') || null;
      return Boolean(outer?.querySelector(':scope > .gravityflow-note-header') && outer?.querySelector(':scope > .gravityflow-note-body'));
    }).length;
    const viewportWidth = document.documentElement.clientWidth;
    const overflowers = Array.from(document.querySelectorAll('body *'))
      .map(node => {
        const style = getComputedStyle(node);
        const bounds = node.getBoundingClientRect();
        return { node, style, bounds };
      })
      .filter(({ style, bounds }) => style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0)
      .filter(({ bounds }) => bounds.left < -1 || bounds.right > viewportWidth + 1)
      .sort((a, b) => Math.max(b.bounds.right - viewportWidth, -b.bounds.left) - Math.max(a.bounds.right - viewportWidth, -a.bounds.left))
      .slice(0, 20)
      .map(({ node, style, bounds }) => ({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        class: typeof node.className === 'string' ? node.className : null,
        rect: { left: bounds.left, right: bounds.right, width: bounds.width },
        scroll_width: node.scrollWidth,
        client_width: node.clientWidth,
        box_sizing: style.boxSizing,
        width: style.width,
        min_width: style.minWidth,
        max_width: style.maxWidth,
        margin_left: style.marginLeft,
        margin_right: style.marginRight,
        padding_left: style.paddingLeft,
        padding_right: style.paddingRight,
        overflow_x: style.overflowX,
        position: style.position,
      }));
    return {
      profile: dossier?.dataset.gppProfileId || null,
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      dossier_rect: rect(dossier),
      post_body_display: postBody ? getComputedStyle(postBody).display : null,
      post_body_grid_columns: postBody ? getComputedStyle(postBody).gridTemplateColumns : null,
      post_body_rect: rect(postBody),
      main_parent: main?.parentElement?.id || null,
      workflow_parent: workflow?.parentElement?.id || null,
      timeline_parent: timelineContainer?.parentElement?.id || null,
      main_rect: rect(main),
      workflow_rect: rect(workflow),
      timeline_container_rect: rect(timelineContainer),
      status_count: document.querySelectorAll('.gravityflow-status-box').length,
      status_visible: visible(status),
      status_inside_dossier: Boolean(status?.closest('.gpp-entry-dossier')),
      timeline_count: document.querySelectorAll('.gravityflow-timeline').length,
      timeline_visible: visible(timeline),
      timeline_inside_dossier: Boolean(timeline?.closest('.gpp-entry-dossier')),
      event_count: notes.length,
      event_classes: notes.map(note => [...note.classList]),
      event_border: noteStyle?.borderTopWidth || null,
      event_radius: noteStyle?.borderRadius || null,
      event_background: noteStyle?.backgroundColor || null,
      event_shadow: noteStyle?.boxShadow || null,
      timeline_spine_width: inside ? getComputedStyle(inside).borderInlineStartWidth : null,
      marker_content: titlePseudo?.content || null,
      marker_border: titlePseudo?.borderTopWidth || null,
      timeline_refinement: {
        exact_stylesheet_present: Boolean(timelineStyle),
        exact_stylesheet_effective: Boolean(timelineStyle && !timelineStyle.disabled && timelineStyle.sheet),
        exact_stylesheet_id: timelineStyle?.id || null,
        exact_stylesheet_href: timelineStyle?.getAttribute('href') || null,
        native_event_signature: nativeEventSignature,
        nested_native_event_count: nestedNativeEventCount,
        heading: {
          native_label_present: Boolean(headingLabel),
          native_label_text: text(headingLabel),
          native_label_font_size: headingStyle?.fontSize || null,
          pseudo_content: headingPseudo?.content || null,
          pseudo_display: headingPseudo?.display || null,
        },
        avatar: {
          native_node_present: Boolean(firstAvatar),
          display: avatarStyle?.display || null,
        },
        outer_body: {
          native_node_present: Boolean(firstOuterBody),
          display: outerStyle?.display || null,
          grid_template_columns: outerStyle?.gridTemplateColumns || null,
          grid_template_rows: outerStyle?.gridTemplateRows || null,
          rect: rect(firstOuterBody),
        },
        metadata: {
          native_node_present: Boolean(firstHeader),
          display: headerStyle?.display || null,
          grid_column_start: headerStyle?.gridColumnStart || null,
          grid_row_start: headerStyle?.gridRowStart || null,
          rect: rect(firstHeader),
        },
        content: {
          native_node_present: Boolean(firstEventBody),
          display: eventBodyStyle?.display || null,
          grid_column_start: eventBodyStyle?.gridColumnStart || null,
          grid_row_start: eventBodyStyle?.gridRowStart || null,
          rect: rect(firstEventBody),
        },
        rail: {
          content: railStyle?.content || null,
          grid_column_start: railStyle?.gridColumnStart || null,
          grid_row_start: railStyle?.gridRowStart || null,
          grid_row_end: railStyle?.gridRowEnd || null,
          width: railStyle?.width || null,
          background_image: railStyle?.backgroundImage || null,
        },
        marker: {
          content: centerMarkerStyle?.content || null,
          grid_column_start: centerMarkerStyle?.gridColumnStart || null,
          grid_row_start: centerMarkerStyle?.gridRowStart || null,
          grid_row_end: centerMarkerStyle?.gridRowEnd || null,
          width: centerMarkerStyle?.width || null,
          height: centerMarkerStyle?.height || null,
          border_radius: centerMarkerStyle?.borderRadius || null,
          background_image: centerMarkerStyle?.backgroundImage || null,
        },
        legacy_title_marker: {
          content: titlePseudo?.content || null,
          display: titlePseudo?.display || null,
        },
      },
      native_table_display: table ? getComputedStyle(table).display : null,
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      gpp_print_count: document.querySelectorAll('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]').length,
      gpp_print_visible: visible(gppPrint),
      actions,
      workflow_content: {
        heading: Boolean(document.querySelector('#gravityflow-status-box-container > h3.hndle')),
        step_status: Boolean(document.querySelector('.gravityflow-status-box-field-step-status')),
        assignee: Boolean(document.querySelector('.gravityflow-status-box-field-assignees')),
        note_textarea: Boolean(document.querySelector('textarea[name="gravityflow_note"]')),
        approve: Boolean(document.querySelector('.gravityflow-action-buttons button[value="approved"]')),
        reject: Boolean(document.querySelector('.gravityflow-action-buttons button[value="rejected"]')),
        revert: Boolean(document.querySelector('.gravityflow-action-buttons button[value="revert"]')),
        instructions: Boolean(document.querySelector('.gravityflow-instructions')),
        due_known_selector: Boolean(document.querySelector('.gravityflow-status-box-field-due, [data-gravityflow-due-date]')),
      },
      full_width_stylesheet_loaded: Boolean(fullStyle),
      root_background: rootStyle?.backgroundColor || null,
      viewport_width: viewportWidth,
      document_scroll_width: document.documentElement.scrollWidth,
      overflowers,
      tab_order_signature: Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'))
        .filter(node => !node.disabled && node.getAttribute('tabindex') !== '-1' && visible(node))
        .slice(0, 80)
        .map(node => `${node.tagName.toLowerCase()}:${node.id || node.getAttribute('name') || node.getAttribute('value') || node.className || ''}`),
    };
  }, timelineRefinementPath);
}

function assertNoHorizontalOverflow(state, label) {
  if (state.document_scroll_width > state.viewport_width + 1) {
    throw new Error(`${label} horizontal overflow: ${JSON.stringify({ viewport: state.viewport_width, scroll: state.document_scroll_width, overflowers: state.overflowers })}`);
  }
}

function assertOnePrintAndNativeOwnership(state, label) {
  if (state.dossier_count !== 1 || state.status_count !== 1 || !state.status_visible || state.status_inside_dossier || state.timeline_count !== 1 || !state.timeline_visible || state.timeline_inside_dossier) {
    throw new Error(`${label} native ownership changed: ${JSON.stringify(state)}`);
  }
  if (state.native_table_display !== 'none' || state.native_print_display !== 'none' || state.gpp_print_count !== 1 || !state.gpp_print_visible) {
    throw new Error(`${label} duplicate suppression/Print contract failed: ${JSON.stringify(state)}`);
  }
}

function sameNativeEvents(left, right) {
  const payload = state => state.timeline_refinement.native_event_signature.map(event => ({
    classes: event.classes,
    actor: event.actor,
    body: event.body,
  }));
  return JSON.stringify(payload(left)) === JSON.stringify(payload(right));
}

function historicalGenericTimelineSatisfied(state) {
  return Boolean(
    state.full_width_stylesheet_loaded
    && state.event_count >= 1
    && state.event_radius !== '0px'
    && state.timeline_spine_width === '2px'
    && state.marker_content !== 'none'
  );
}

function assertTimelineRefinementCommon(state, label) {
  const t = state.timeline_refinement;
  if (state.profile !== fullProfile) throw new Error(`${label}: Full Width profile is not active.`);
  if (!t.exact_stylesheet_present || !t.exact_stylesheet_effective || !String(t.exact_stylesheet_href || '').includes(timelineRefinementPath)) {
    throw new Error(`${label}: exact PR55 Timeline refinement stylesheet is not effective: ${JSON.stringify(t)}`);
  }
  if (state.event_count < 1 || t.nested_native_event_count !== state.event_count) {
    throw new Error(`${label}: authentic nested Gravity Flow event ownership changed: ${JSON.stringify({ event_count: state.event_count, nested: t.nested_native_event_count })}`);
  }
  if (!t.heading.native_label_present || !String(t.heading.pseudo_content || '').includes('تاریخچه') || t.heading.pseudo_display === 'none') {
    throw new Error(`${label}: visible History heading presentation is not applied: ${JSON.stringify(t.heading)}`);
  }
  if (!t.avatar.native_node_present || t.avatar.display !== 'none') {
    throw new Error(`${label}: native avatar node must remain present but be visually suppressed: ${JSON.stringify(t.avatar)}`);
  }
  if (!t.outer_body.native_node_present || t.outer_body.display !== 'grid') {
    throw new Error(`${label}: authentic outer native event body is not the PR55 grid owner: ${JSON.stringify(t.outer_body)}`);
  }
  if (!t.metadata.native_node_present || !t.content.native_node_present) {
    throw new Error(`${label}: authentic header/body zones are missing.`);
  }
  if (t.legacy_title_marker.display !== 'none') {
    throw new Error(`${label}: legacy title marker is still visually active: ${JSON.stringify(t.legacy_title_marker)}`);
  }
  if (!String(t.rail.content || '').includes('""') || !String(t.rail.background_image || '').includes('repeating-linear-gradient')) {
    throw new Error(`${label}: PR55 neutral dashed rail is not computed: ${JSON.stringify(t.rail)}`);
  }
  if (!String(t.marker.content || '').includes('""') || !String(t.marker.background_image || '').includes('radial-gradient')) {
    throw new Error(`${label}: PR55 neutral center marker is not computed: ${JSON.stringify(t.marker)}`);
  }
}

function assertTimelineRefinementDesktopComputed(state, label) {
  const t = state.timeline_refinement;
  if (!t.outer_body.native_node_present || t.outer_body.display !== 'grid') throw new Error(`${label}: outer native event body is not a grid.`);
  if (t.metadata.grid_column_start !== '3' || t.metadata.grid_row_start !== '1') throw new Error(`${label}: native metadata header is not in desktop metadata zone: ${JSON.stringify(t.metadata)}`);
  if (t.content.grid_column_start !== '1' || t.content.grid_row_start !== '1') throw new Error(`${label}: native event body is not in desktop content zone: ${JSON.stringify(t.content)}`);
  if (t.rail.grid_column_start !== '2' || t.rail.grid_row_start !== '1' || !String(t.rail.background_image || '').includes('repeating-linear-gradient')) {
    throw new Error(`${label}: neutral rail is not in the desktop center zone: ${JSON.stringify(t.rail)}`);
  }
  if (t.marker.grid_column_start !== '2' || t.marker.grid_row_start !== '1' || !String(t.marker.background_image || '').includes('radial-gradient')) {
    throw new Error(`${label}: neutral marker is not in the desktop center zone: ${JSON.stringify(t.marker)}`);
  }
  if (!t.metadata.rect || !t.content.rect || t.content.rect.x <= t.metadata.rect.x) {
    throw new Error(`${label}: computed RTL content/metadata zone geometry is not the PR55 three-zone layout: ${JSON.stringify({ metadata: t.metadata.rect, content: t.content.rect })}`);
  }
}

function assertTimelineRefinementDesktop(state, label) {
  assertTimelineRefinementCommon(state, label);
  assertTimelineRefinementDesktopComputed(state, label);
}

function assertTimelineRefinementNarrow(state, label) {
  assertTimelineRefinementCommon(state, label);
  const t = state.timeline_refinement;
  if (t.metadata.grid_column_start !== '2' || t.metadata.grid_row_start !== '1') throw new Error(`${label}: narrow native metadata zone is not stacked first: ${JSON.stringify(t.metadata)}`);
  if (t.content.grid_column_start !== '2' || t.content.grid_row_start !== '2') throw new Error(`${label}: narrow native event content is not stacked second: ${JSON.stringify(t.content)}`);
  if (t.rail.grid_column_start !== '1' || t.rail.grid_row_start !== '1' || t.rail.grid_row_end !== '3') throw new Error(`${label}: narrow rail does not span stacked rows: ${JSON.stringify(t.rail)}`);
  if (t.marker.grid_column_start !== '1' || t.marker.grid_row_start !== '1' || t.marker.grid_row_end !== '3') throw new Error(`${label}: narrow marker does not occupy the rail column: ${JSON.stringify(t.marker)}`);
  if (!t.metadata.rect || !t.content.rect || t.metadata.rect.bottom > t.content.rect.y + 1) throw new Error(`${label}: narrow metadata/content geometry is not stacked: ${JSON.stringify({ metadata: t.metadata.rect, content: t.content.rect })}`);
}

function assertTimelineRefinementExcluded(state, label) {
  const t = state.timeline_refinement;
  if (t.exact_stylesheet_present || t.exact_stylesheet_effective) throw new Error(`${label}: PR55 Timeline stylesheet leaked outside Full Width.`);
  if (t.outer_body.display === 'grid' && t.avatar.display === 'none' && String(t.heading.pseudo_content || '').includes('تاریخچه')) {
    throw new Error(`${label}: PR55 computed Timeline presentation leaked outside Full Width.`);
  }
}

async function setTimelineRefinementDisabled(page, disabled) {
  const result = await page.evaluate(({ timelinePath, disabledState }) => {
    const link = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(item => (item.getAttribute('href') || '').includes(timelinePath));
    if (!link) throw new Error(`Exact Timeline refinement stylesheet not found: ${timelinePath}`);
    link.disabled = disabledState;
    return { id: link.id || null, href: link.getAttribute('href') || null, disabled: link.disabled };
  }, { timelinePath: timelineRefinementPath, disabledState: disabled });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return result;
}

async function screenshot(page, file) {
  await page.screenshot({ path: file, fullPage: true });
  if (!fs.statSync(file).size) throw new Error(`Empty screenshot: ${file}`);
}

async function makeComposite(browser, entries, output, columns = 2) {
  const composite = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
  const cards = entries.map(entry => {
    const data = fs.readFileSync(entry.file).toString('base64');
    return `<figure><figcaption>${entry.label}</figcaption><img src="data:image/png;base64,${data}"></figure>`;
  }).join('');
  await composite.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#eef2f7;font-family:Arial,sans-serif;color:#172033}
    main{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:18px;align-items:start}
    figure{margin:0;background:white;border:1px solid #d7dee8;border-radius:12px;padding:10px;overflow:hidden}
    figcaption{font-size:16px;font-weight:700;padding:4px 6px 10px;text-align:center}
    img{display:block;width:100%;height:auto;border:1px solid #e5e7eb}
  </style><main>${cards}</main>`);
  await composite.screenshot({ path: output, fullPage: true });
  await composite.close();
}

fs.mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);

const before = lifecycleFacts();
const initial = activeVariantFacts();
if (initial.state !== 'active' || initial.variant !== 'current_safe' || initial.activation?.profile_id !== safeProfile) {
  throw new Error(`Current / Safe baseline activation unavailable: ${JSON.stringify(initial)}`);
}

await gotoReview(page, { width: 1440, height: 1000 }, safeProfile);
const safeDesktop = await inspectReview(page);
assertOnePrintAndNativeOwnership(safeDesktop, 'Current / Safe desktop');
assertNoHorizontalOverflow(safeDesktop, 'Current / Safe desktop');
if (safeDesktop.full_width_stylesheet_loaded) throw new Error('Full Width stylesheet leaked into Current / Safe.');
assertTimelineRefinementExcluded(safeDesktop, 'Current / Safe desktop');
await screenshot(page, raw('current-safe-desktop'));

await gotoReview(page, { width: 390, height: 844 }, safeProfile);
const safeNarrow = await inspectReview(page);
assertOnePrintAndNativeOwnership(safeNarrow, 'Current / Safe narrow');
assertNoHorizontalOverflow(safeNarrow, 'Current / Safe narrow');
assertTimelineRefinementExcluded(safeNarrow, 'Current / Safe narrow');
await screenshot(page, raw('current-safe-narrow'));

// Use the authentic native Gravity Forms Add-On settings page to switch.
await page.goto(settingsUrl, { waitUntil: 'networkidle' });
const selector = page.locator('#entry_detail_visual_variant_action');
if (await selector.count() !== 1) throw new Error('Entry Detail design selector was not rendered in the existing GPP settings page.');
const optionsBefore = await selector.locator('option').evaluateAll(items => items.map(item => ({ label: item.textContent?.trim() || '', value: item.value })));
const fullChoiceBefore = optionsBefore.find(item => item.label.includes('Full Width') && item.label.includes('طرح جدید تمام‌عرض') && item.value);
if (!fullChoiceBefore) throw new Error(`Owner-readable Full Width choice unavailable: ${JSON.stringify(optionsBefore)}`);
const staleFullCommand = fullChoiceBefore.value;
await selector.selectOption(staleFullCommand);
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.click('#gform-settings-save')]);
await page.waitForSelector('[data-gpp-entry-detail-visual-variant="full_width"]', { timeout: 30000 });
if (await page.locator('[data-gpp-entry-detail-visual-switch="completed"]').count() !== 1) throw new Error('Successful Full Width switch did not provide truthful settings feedback.');

const afterSwitch = activeVariantFacts();
if (afterSwitch.state !== 'active' || afterSwitch.variant !== 'full_width' || afterSwitch.activation?.profile_id !== fullProfile) {
  throw new Error(`Settings save did not activate Full Width through lifecycle: ${JSON.stringify(afterSwitch)}`);
}
const afterFullLifecycle = lifecycleFacts();
for (const surface of ['gravity_flow.inbox', 'print.dossier']) {
  if (JSON.stringify(before.activations[surface]) !== JSON.stringify(afterFullLifecycle.activations[surface])) throw new Error(`${surface} activation changed during Entry Detail visual switch.`);
}
if (before.binding_hash !== afterFullLifecycle.binding_hash) throw new Error('EnvironmentBindingSet changed during Entry Detail visual switch.');

// The command captured before switching is now stale and must fail clearly.
const stale = staleCommandResult(staleFullCommand);
if (stale.status !== 'REJECTED' || stale.reason !== 'visual_activation_conflict') throw new Error(`Stale visual action was not conflict-rejected: ${JSON.stringify(stale)}`);
if (activeVariantFacts().variant !== 'full_width') throw new Error('Stale action changed the newer Full Width activation.');

await gotoReview(page, { width: 1600, height: 1000 }, fullProfile);
const fullWide = await inspectReview(page);
assertOnePrintAndNativeOwnership(fullWide, 'Full Width wide');
assertNoHorizontalOverflow(fullWide, 'Full Width wide');
if (!fullWide.full_width_stylesheet_loaded || fullWide.post_body_display !== 'grid') throw new Error(`Full Width stylesheet/grid not active: ${JSON.stringify(fullWide)}`);
if (fullWide.main_parent !== 'post-body' || fullWide.workflow_parent !== 'post-body' || fullWide.timeline_parent !== 'post-body') throw new Error(`CSS-only sibling seam changed: ${JSON.stringify(fullWide)}`);
if (!fullWide.main_rect || !fullWide.workflow_rect || fullWide.main_rect.width <= fullWide.workflow_rect.width * 2) throw new Error(`Wide dominant-main/bounded-workflow geometry not achieved: ${JSON.stringify(fullWide)}`);
if (Math.abs(fullWide.main_rect.y - fullWide.workflow_rect.y) > 3 || fullWide.timeline_container_rect?.y <= fullWide.main_rect.y) throw new Error(`Wide grid row placement differs from approved two-region structure: ${JSON.stringify(fullWide)}`);
if (!historicalGenericTimelineSatisfied(fullWide)) throw new Error(`Historical generic Full Width Timeline baseline unexpectedly failed: ${JSON.stringify(fullWide)}`);
assertTimelineRefinementDesktop(fullWide, 'Full Width wide');
if (!sameNativeEvents(safeDesktop, fullWide)) throw new Error('Full Width presentation changed native Timeline event order/content.');
if (fullWide.actions.length < 2 || fullWide.actions.some(action => action.height + 0.01 < 44)) throw new Error(`Full Width native actions are not usable: ${JSON.stringify(fullWide.actions)}`);
if (!fullWide.workflow_content.heading || !fullWide.workflow_content.step_status || !fullWide.workflow_content.note_textarea || !fullWide.workflow_content.approve || !fullWide.workflow_content.reject) throw new Error(`Authentic workflow-panel content inventory incomplete: ${JSON.stringify(fullWide.workflow_content)}`);
await screenshot(page, raw('full-width-wide'));

// Original-defect falsification: disable only the exact PR55 stylesheet at the
// authentic browser boundary. The older Full Width Timeline must still satisfy
// the historical generic checks, while the new computed PR55 guard rejects it.
const disabledTimelineAsset = await setTimelineRefinementDisabled(page, true);
const oldFullWidthFallback = await inspectReview(page);
assertOnePrintAndNativeOwnership(oldFullWidthFallback, 'Controlled old Full Width fallback');
assertNoHorizontalOverflow(oldFullWidthFallback, 'Controlled old Full Width fallback');
if (oldFullWidthFallback.timeline_refinement.exact_stylesheet_effective) throw new Error('Controlled falsification did not disable the exact PR55 Timeline stylesheet.');
if (!historicalGenericTimelineSatisfied(oldFullWidthFallback)) throw new Error(`Old Full Width fallback no longer satisfies the historical generic Timeline guard: ${JSON.stringify(oldFullWidthFallback)}`);
if (!sameNativeEvents(fullWide, oldFullWidthFallback)) throw new Error('Test-only stylesheet falsification changed native Timeline event order/content.');
let fallbackRejection = null;
try {
  assertTimelineRefinementDesktopComputed(oldFullWidthFallback, 'Controlled old Full Width fallback');
} catch (error) {
  fallbackRejection = String(error?.message || error);
}
if (!fallbackRejection) throw new Error('PR55 computed Timeline guard accepted the previous Full Width Timeline presentation.');
await setTimelineRefinementDisabled(page, false);
const fullWideRestored = await inspectReview(page);
assertTimelineRefinementDesktop(fullWideRestored, 'Full Width wide after falsification restore');
if (!sameNativeEvents(fullWide, fullWideRestored)) throw new Error('Restoring the PR55 stylesheet changed native Timeline event order/content.');

await gotoReview(page, { width: 1024, height: 900 }, fullProfile);
const fullMedium = await inspectReview(page);
assertOnePrintAndNativeOwnership(fullMedium, 'Full Width medium');
assertNoHorizontalOverflow(fullMedium, 'Full Width medium');
if (fullMedium.post_body_display !== 'grid' || !fullMedium.main_rect || !fullMedium.workflow_rect || fullMedium.main_rect.width <= fullMedium.workflow_rect.width) throw new Error(`Full Width medium grid did not remain bounded and readable: ${JSON.stringify(fullMedium)}`);
assertTimelineRefinementDesktop(fullMedium, 'Full Width medium');
if (!sameNativeEvents(fullWide, fullMedium)) throw new Error('Medium Full Width rendering changed native Timeline event order/content.');
await screenshot(page, raw('full-width-medium'));

await gotoReview(page, { width: 390, height: 844 }, fullProfile);
const fullNarrow = await inspectReview(page);
assertOnePrintAndNativeOwnership(fullNarrow, 'Full Width narrow');
assertNoHorizontalOverflow(fullNarrow, 'Full Width narrow');
if (!fullNarrow.main_rect || !fullNarrow.workflow_rect || !fullNarrow.timeline_container_rect || !(fullNarrow.main_rect.y < fullNarrow.workflow_rect.y && fullNarrow.workflow_rect.y < fullNarrow.timeline_container_rect.y)) {
  throw new Error(`Full Width narrow layout did not collapse in logical source order: ${JSON.stringify(fullNarrow)}`);
}
assertTimelineRefinementNarrow(fullNarrow, 'Full Width narrow');
if (!sameNativeEvents(fullWide, fullNarrow)) throw new Error('Narrow Full Width rendering changed native Timeline event order/content.');
if (fullNarrow.actions.some(action => action.height + 0.01 < 44)) throw new Error(`Full Width narrow actions violate interaction size: ${JSON.stringify(fullNarrow.actions)}`);
await screenshot(page, raw('full-width-narrow'));

// Full Width must not depend on Entry Detail progressive-enhancement JS.
const blockedContext = await browser.newContext();
let scriptBlocked = false;
await blockedContext.route('**/assets/js/srwf-gravity-flow-entry-detail.js*', route => {
  scriptBlocked = true;
  return route.abort();
});
const blockedPage = await blockedContext.newPage();
await login(blockedPage);
await gotoReview(blockedPage, { width: 1600, height: 1000 }, fullProfile);
const fullBlocked = await inspectReview(blockedPage);
assertOnePrintAndNativeOwnership(fullBlocked, 'Full Width JS-blocked');
assertNoHorizontalOverflow(fullBlocked, 'Full Width JS-blocked');
if (!scriptBlocked || fullBlocked.post_body_display !== 'grid' || !fullBlocked.full_width_stylesheet_loaded) throw new Error(`Full Width structural geometry depended on Entry Detail JS: ${JSON.stringify({ scriptBlocked, fullBlocked })}`);
assertTimelineRefinementDesktop(fullBlocked, 'Full Width JS-blocked');
if (!sameNativeEvents(fullWide, fullBlocked)) throw new Error('JS-blocked Full Width rendering changed native Timeline event order/content.');
const previewBound = await blockedPage.locator('.gpp-entry-dossier').getAttribute('data-gpp-preview-bound');
if (previewBound === '1') throw new Error('Blocked progressive-enhancement JS unexpectedly executed.');
await screenshot(blockedPage, raw('full-width-js-blocked'));
await blockedContext.close();

// Native User Input/editor fallback remains outside Full Width selector scope.
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(entryUrl(manifest.transition), { waitUntil: 'networkidle' });
const fallback = await page.evaluate(() => {
  const postBody = document.querySelector('#post-body');
  const table = document.querySelector('.entry-detail-view');
  return {
    dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
    full_profile_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-profile-id="srwf.operations.entry-detail.full-width.v1"]').length,
    native_editor_visible: Boolean(table?.querySelector('.gform_wrapper') && getComputedStyle(table.querySelector('.gform_wrapper')).display !== 'none'),
    native_table_display: table ? getComputedStyle(table).display : null,
    post_body_grid_columns: postBody ? getComputedStyle(postBody).gridTemplateColumns : null,
  };
});
if (fallback.dossier_count !== 0 || fallback.full_profile_count !== 0 || !fallback.native_editor_visible || fallback.native_table_display === 'none') throw new Error(`Full Width leaked into native User Input fallback: ${JSON.stringify(fallback)}`);

// Roll back through the same authentic settings selector.
const rollbackSelection = await selectVariantThroughSettings(page, 'Current / Safe');
await page.waitForSelector('[data-gpp-entry-detail-visual-variant="current_safe"]', { timeout: 30000 });
if (await page.locator('[data-gpp-entry-detail-visual-switch="completed"]').count() !== 1) throw new Error('Current / Safe rollback did not provide truthful settings feedback.');
const finalVariant = activeVariantFacts();
if (finalVariant.variant !== 'current_safe' || finalVariant.activation?.profile_id !== safeProfile) throw new Error(`Current / Safe rollback did not restore exact baseline activation: ${JSON.stringify(finalVariant)}`);
const finalLifecycle = lifecycleFacts();
for (const surface of ['gravity_flow.inbox', 'print.dossier']) {
  if (JSON.stringify(before.activations[surface]) !== JSON.stringify(finalLifecycle.activations[surface])) throw new Error(`${surface} activation changed after visual rollback.`);
}
if (before.binding_hash !== finalLifecycle.binding_hash) throw new Error('EnvironmentBindingSet changed after visual rollback.');

await gotoReview(page, { width: 1440, height: 1000 }, safeProfile);
const safeRestored = await inspectReview(page);
assertOnePrintAndNativeOwnership(safeRestored, 'Restored Current / Safe');
if (safeRestored.full_width_stylesheet_loaded) throw new Error('Full Width stylesheet remained active after Current / Safe rollback.');
assertTimelineRefinementExcluded(safeRestored, 'Restored Current / Safe');
if (!sameNativeEvents(safeDesktop, safeRestored) || !sameNativeEvents(fullWide, safeRestored)) throw new Error('Current / Safe rollback changed native Timeline event order/content.');
if (safeRestored.event_radius !== '0px' || safeRestored.event_background !== 'rgba(0, 0, 0, 0)') throw new Error(`Current / Safe Timeline did not return to PR47 neutral chronology: ${JSON.stringify(safeRestored)}`);

// Preserve all required exact-path WU18 screenshot evidence without workflow YAML changes.
await makeComposite(browser, [
  { label: 'Current / Safe — desktop', file: raw('current-safe-desktop') },
  { label: 'Full Width — wide desktop', file: raw('full-width-wide') },
  { label: 'Full Width — medium', file: raw('full-width-medium') },
  { label: 'Full Width — wide / Entry Detail JS blocked', file: raw('full-width-js-blocked') },
], path.join(artifactDir, 'wu18-entry-detail-native-chrome-desktop.png'), 2);
await makeComposite(browser, [
  { label: 'Current / Safe — narrow', file: raw('current-safe-narrow') },
  { label: 'Full Width — narrow', file: raw('full-width-narrow') },
], path.join(artifactDir, 'wu18-entry-detail-native-chrome-mobile.png'), 2);

const browserResultsPath = path.join(artifactDir, 'wu18-browser-results.json');
const browserResults = JSON.parse(fs.readFileSync(browserResultsPath, 'utf8'));
browserResults.entry_detail_visual_variants = {
  status: 'PASS',
  settings_selector_reached: true,
  current_safe: { desktop: safeDesktop, narrow: safeNarrow, restored: safeRestored },
  full_width: { wide: fullWide, medium: fullMedium, narrow: fullNarrow, js_blocked: fullBlocked },
  structural_feasibility: {
    result: 'PASS',
    common_ancestor: '#post-body',
    direct_siblings: ['#post-body-content', '#postbox-container-1', '#postbox-container-2'],
    layout_method: 'CSS Grid normal flow',
    display_contents_required: false,
    absolute_fixed_transform_relocation_required: false,
    dom_reparenting_required: false,
  },
  workflow_content_truth: {
    heading: fullWide.workflow_content.heading ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    current_status_step: fullWide.workflow_content.step_status ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    assignee: fullWide.workflow_content.assignee ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    note_textarea: fullWide.workflow_content.note_textarea ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    approve: fullWide.workflow_content.approve ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    reject: fullWide.workflow_content.reject ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    revert: fullWide.workflow_content.revert ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    instructions: fullWide.workflow_content.instructions ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    due_date: 'NOT_AVAILABLE_IN_CURRENT_DOM',
  },
  timeline_feasibility: {
    event_wrapper: '.gravityflow-note',
    avatar: '.gravityflow-note-avatar',
    title: '.gravityflow-note-title',
    metadata: '.gravityflow-note-meta',
    body: '.gravityflow-note-body',
    stable_machine_readable_outcome: false,
    semantic_tinting: 'NOT_ACHIEVABLE_WITHIN_CSS_ONLY_BOUNDARY',
    neutral_event_cards: true,
  },
  timeline_runtime_guard: {
    enforcement_boundary: 'authentic WU18 Playwright computed styles on lifecycle-activated Full Width Entry Detail',
    exact_stylesheet: timelineRefinementPath,
    exact_asset_runtime_proof: fullWide.timeline_refinement.exact_stylesheet_effective,
    wide_computed_contract: 'PASS',
    medium_computed_contract: 'PASS',
    narrow_390_computed_contract: 'PASS',
    js_blocked_computed_contract: 'PASS',
    current_safe_exclusion: 'PASS',
    native_event_order_content_preserved: sameNativeEvents(safeDesktop, fullWide) && sameNativeEvents(fullWide, fullMedium) && sameNativeEvents(fullWide, fullNarrow) && sameNativeEvents(fullWide, fullBlocked) && sameNativeEvents(fullWide, safeRestored),
    original_defect_falsification: {
      result: 'PASS',
      exact_asset_disabled_test_only: disabledTimelineAsset,
      historical_generic_guard_still_satisfied: historicalGenericTimelineSatisfied(oldFullWidthFallback),
      pr55_computed_guard_rejected: Boolean(fallbackRejection),
      rejection: fallbackRejection,
      native_event_order_content_unchanged: sameNativeEvents(fullWide, oldFullWidthFallback),
    },
  },
  stale_action: stale,
  lifecycle_preservation: {
    inbox_unchanged: true,
    print_unchanged: true,
    environment_binding_set_unchanged: true,
    restored_exact_current_safe_activation: true,
  },
  raw_screenshots_generated_in_job: [
    path.basename(raw('current-safe-desktop')),
    path.basename(raw('current-safe-narrow')),
    path.basename(raw('full-width-wide')),
    path.basename(raw('full-width-medium')),
    path.basename(raw('full-width-narrow')),
    path.basename(raw('full-width-js-blocked')),
  ],
  uploaded_composites: [
    'wu18-entry-detail-native-chrome-desktop.png',
    'wu18-entry-detail-native-chrome-mobile.png',
  ],
  rollback_choice: rollbackSelection.choice.label,
};
fs.writeFileSync(browserResultsPath, `${JSON.stringify(browserResults, null, 2)}\n`);

await browser.close();
console.log(JSON.stringify({
  status: 'PASS',
  full_width_profile: fullProfile,
  restored_profile: finalVariant.activation.profile_id,
  settings_selector_reached: true,
  stale_action_conflict_proven: true,
  css_only_grid_proven: true,
  js_blocked_proven: true,
  timeline_computed_guard_proven: true,
  timeline_original_defect_falsification_proven: true,
  timeline_exact_asset_proven: true,
  timeline_medium_narrow_proven: true,
  timeline_current_safe_exclusion_proven: true,
  timeline_native_content_order_proven: true,
  screenshots: ['wu18-entry-detail-native-chrome-desktop.png', 'wu18-entry-detail-native-chrome-mobile.png'],
}));
