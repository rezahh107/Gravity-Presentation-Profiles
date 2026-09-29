import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import {
  BROWSER_TAB_ZOOM_MECHANISM,
  getBrowserTabZoom,
  launchBrowserZoomContext,
  setBrowserTabZoom,
} from '../visual-regression/browser-tab-zoom.mjs';

const require = createRequire(import.meta.url);
const playwrightVersion = require('playwright/package.json').version;
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const repositorySha = process.env.GPP_WU21_REPOSITORY_SHA;

for (const [name, value] of Object.entries({ artifactDir, wpCli, wpPath, repositorySha })) {
  if (!value) throw new Error(`NATIVE_BASELINE_INFRASTRUCTURE_FAILURE: ${name} is required.`);
}

const outputRoot = path.join(artifactDir, 'visual-regression-diagnostics', 'native-inbox-baseline');
fs.mkdirSync(outputRoot, { recursive: true });
const outputManifest = path.join(outputRoot, 'manifest.json');

function readJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object') throw new Error(`Invalid JSON evidence dependency: ${file}`);
  return data;
}

function wp(code) {
  return execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], {
    encoding: 'utf8',
    env: process.env,
  }).trim();
}

const fixture = readJson(path.join(artifactDir, 'fixture-manifest.json'));
const runtime = readJson(path.join(artifactDir, 'runtime.json'));
const visualHost = readJson(path.join(artifactDir, 'integrated-visual-host.json'));
if (runtime?.repository?.commit_sha !== repositorySha) throw new Error('NATIVE_BASELINE_INFRASTRUCTURE_FAILURE: runtime exact-Head identity mismatch.');
if (fixture?.data_class !== 'SYNTHETIC_NON_PII') throw new Error('NATIVE_BASELINE_INFRASTRUCTURE_FAILURE: fixture is not declared synthetic/non-PII.');
if (visualHost?.classification !== 'INTEGRATED_SRWF_VISUAL_HOST') throw new Error('NATIVE_BASELINE_INFRASTRUCTURE_FAILURE: integrated visual host identity is unavailable.');
if (!fixture?.frontend_inbox_url) throw new Error('NATIVE_BASELINE_INFRASTRUCTURE_FAILURE: frontend Inbox route is unavailable.');

const dependencyIdentity = {
  repository: runtime.repository,
  wordpress: runtime.wordpress,
  php: runtime.php,
  database: runtime.database,
  gravity_forms: runtime.plugins?.gravity_forms ?? null,
  gravity_flow: runtime.plugins?.gravity_flow ?? null,
  playwright: { version: playwrightVersion, node: process.version },
  integrated_visual_host: {
    classification: visualHost.classification,
    composition_authority: visualHost.composition_authority,
    host_fixture: visualHost.host_fixture,
    hello_elementor: visualHost.hello_elementor,
    elementor: visualHost.elementor,
    elementor_pro: visualHost.elementor_pro,
    page_template: visualHost.page_template,
    vazir_font: visualHost.vazir_font,
    srwf_host_companion_active: visualHost.srwf_host_companion_active,
    srwf_host_companion_registered: visualHost.srwf_host_companion_registered,
  },
};

const cookies = JSON.parse(wp(`
$u=get_user_by('login','bootstrap_admin');
if (!$u) { throw new RuntimeException('Synthetic WU21 operator unavailable.'); }
$e=time()+1800;
echo wp_json_encode(array(
  array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),
  array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))
));
`));

const scenarios = [
  { id: 'desktop-1440', label: 'Desktop 1440 CSS px', kind: 'viewport', viewport: { width: 1440, height: 1000 }, requested_zoom: 1 },
  { id: 'mobile-390', label: 'Mobile 390 CSS px', kind: 'viewport', viewport: { width: 390, height: 844 }, requested_zoom: 1 },
  { id: 'narrow-mobile-320', label: 'Narrow mobile 320 CSS px', kind: 'viewport', viewport: { width: 320, height: 720 }, requested_zoom: 1 },
  { id: 'browser-zoom-200', label: 'Genuine Chromium tab zoom 200%', kind: 'browser_zoom', window: { width: 1440, height: 1000 }, requested_zoom: 2 },
];

const selectors = {
  native_inbox: '[data-js="gflow-inbox"]',
  search: '[data-js="gflow-inbox-search"]',
  settings: '.gflow-grid__button--settings',
  settings_flyout: '.gform-flyout--inbox-settings',
  push_control: 'input[name="inbox-setting--push-enabled"][data-js="inbox-setting"]',
  fullscreen: '.gflow-grid__button--fullscreen',
  grid: '[data-js="gflow-inbox"] .ag-root-wrapper',
  pager: '[data-js="gflow-inbox"] .ag-paging-panel',
  rows: '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row',
  gpp_surface: '[data-gpp-inbox-surface="gravity_flow.inbox"]',
  manual_refresh: '[data-gpp-inbox-manual-refresh]',
};

function captureUrl(mode) {
  const url = new URL(fixture.frontend_inbox_url);
  if (mode === 'RAW_NATIVE') url.searchParams.set('wu21_native_inbox_baseline', 'raw_native');
  return url.toString();
}

async function addAuthCookies(context) {
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
}

async function waitForNativeInbox(page) {
  await page.waitForSelector(selectors.grid, { timeout: 30000 });
  await page.waitForFunction(selector => document.querySelectorAll(selector).length > 0, selectors.rows, { timeout: 15000 });
}

async function measureRuntimeFacts(page) {
  return page.evaluate((s) => {
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
    };
    const visibleCount = (selector) => [...document.querySelectorAll(selector)].filter(visible).length;
    const inbox = document.querySelector(s.native_inbox);
    const grid = document.querySelector(s.grid);
    const search = document.querySelector(s.search);
    const pager = document.querySelector(s.pager);
    const gppSurface = document.querySelector(s.gpp_surface);
    const shell = inbox?.closest('[data-elementor-type="wp-page"], main, article, .site-main, #content') || document.body;
    const describe = (el) => {
      if (!el) return null;
      const className = typeof el.className === 'string' ? el.className.trim().replace(/\s+/g, '.') : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${className ? `.${className}` : ''}`;
    };
    const direction = (el) => el ? getComputedStyle(el).direction : null;
    const pagingCurrent = document.querySelector(`${s.pager} [ref="lbCurrent"]`)?.textContent?.trim() ?? null;
    const paint = (el) => {
      if (!el) return null;
      const style = getComputedStyle(el);
      return { background_color: style.backgroundColor, color: style.color, font_weight: style.fontWeight, box_shadow: style.boxShadow };
    };
    const styles = [...document.querySelectorAll('link[rel="stylesheet"],style')].map(el => ({
      id: el.id || null,
      href: el.tagName === 'LINK' ? el.href : null,
    })).filter(item => /srwf-gravity-flow-inbox/i.test(`${item.id || ''} ${item.href || ''}`));
    const scripts = [...document.scripts].map(el => ({ id: el.id || null, src: el.src || null }))
      .filter(item => /gravity-flow-inbox-manual-refresh/i.test(`${item.id || ''} ${item.src || ''}`));

    return {
      viewport: {
        inner_width: window.innerWidth,
        inner_height: window.innerHeight,
        outer_width: window.outerWidth,
        outer_height: window.outerHeight,
        device_pixel_ratio: window.devicePixelRatio,
        visual_viewport_scale: window.visualViewport?.scale ?? null,
      },
      document_horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      native_inbox_count: document.querySelectorAll(s.native_inbox).length,
      native_search_count: document.querySelectorAll(s.search).length,
      native_search_visible_count: visibleCount(s.search),
      native_settings_count: document.querySelectorAll(s.settings).length,
      native_settings_visible_count: visibleCount(s.settings),
      native_fullscreen_count: document.querySelectorAll(s.fullscreen).length,
      native_fullscreen_visible_count: visibleCount(s.fullscreen),
      native_grid_count: document.querySelectorAll(s.grid).length,
      native_grid_visible_count: visibleCount(s.grid),
      native_pager_count: document.querySelectorAll(s.pager).length,
      native_pager_visible_count: visibleCount(s.pager),
      visible_native_row_count: visibleCount(s.rows),
      gpp_surface_count: document.querySelectorAll(s.gpp_surface).length,
      gpp_manual_refresh_count: document.querySelectorAll(s.manual_refresh).length,
      gpp_card_node_count: document.querySelectorAll('.gpp-inbox-card').length,
      gpp_case_card_column_count: document.querySelectorAll('[col-id="gpp_case_card"]').length,
      replacement_widget_count: document.querySelectorAll('[data-gpp-replacement-inbox],.gpp-custom-inbox-app').length,
      gpp_inbox_stylesheet_count: styles.length,
      gpp_manual_refresh_script_count: scripts.length,
      gpp_inbox_assets: { styles, scripts },
      geometry: {
        search: rect(search),
        grid: rect(grid),
        pager: rect(pager),
        inbox: rect(inbox),
      },
      direction_observations: {
        outer_shell: { node: describe(shell), computed_direction: direction(shell), dir_attribute: shell?.getAttribute('dir') ?? null },
        native_inbox: { node: describe(inbox), computed_direction: direction(inbox), dir_attribute: inbox?.getAttribute('dir') ?? null, class_name: inbox?.className ?? null },
        native_grid: { node: describe(grid), computed_direction: direction(grid), dir_attribute: grid?.getAttribute('dir') ?? null, class_name: grid?.className ?? null },
        gpp_surface: { node: describe(gppSurface), computed_direction: direction(gppSurface), dir_attribute: gppSurface?.getAttribute('dir') ?? null },
      },
      grid_state_observations: {
        current_page_text: pagingCurrent,
        aria_row_count: grid?.getAttribute('aria-rowcount') ?? null,
        aria_col_count: grid?.getAttribute('aria-colcount') ?? null,
      },
      native_presentation: {
        header: paint(document.querySelector(`${s.grid} .ag-header`)),
        form_cell: paint(document.querySelector(`${s.rows} .ag-cell[col-id="form_title"]`)),
        entry_link: paint(document.querySelector(`${s.rows} .gflow-inbox__entry-cell-link`)),
        pager_button: paint(document.querySelector(`${s.pager} .ag-paging-button:not(.ag-disabled)`)),
      },
    };
  }, selectors);
}

async function captureSettingsFacts(page, initialFacts) {
  const settingsCount = initialFacts.native_settings_count;
  const visibleSettingsCount = initialFacts.native_settings_visible_count;
  if (settingsCount !== 1 || visibleSettingsCount !== 1) {
    return {
      settings_identity: 'NOT_PROVEN',
      reason: settingsCount > 1 || visibleSettingsCount > 1 ? 'AMBIGUOUS_NATIVE_SETTINGS_CONTROL_IDENTITY' : 'NATIVE_SETTINGS_CONTROL_NOT_AUTHENTICALLY_EXPOSED',
      settings_count: settingsCount,
      settings_visible_count: visibleSettingsCount,
      settings_flyout: { status: 'NOT_PROVEN', count: null, visible_count: null, candidates: [] },
      push_control: { status: 'NOT_PROVEN', count: null, structural_count: null, candidates: [] },
    };
  }

  const button = page.locator(selectors.settings).first();
  const buttonIdentity = await button.evaluate(el => ({
    text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    title: el.getAttribute('title'),
    aria_label: el.getAttribute('aria-label'),
    class_name: el.className,
  }));
  await button.click();
  await page.waitForTimeout(150);

  let panelFacts;
  try {
    panelFacts = await page.evaluate((s) => {
      const visible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
      const notificationMarker = /push|notification|notify|browser notification|اعلان|اطلاع/i;
      const settingsMarker = /settings|setting|notification|push/i;
      const describeElement = (el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        value: 'value' in el ? el.value : null,
        checked: 'checked' in el ? el.checked : null,
        text: text(el).slice(0, 220),
        title: el.getAttribute('title'),
        aria_label: el.getAttribute('aria-label'),
        id: el.id || null,
        class_name: typeof el.className === 'string' ? el.className : null,
        data_js: el.getAttribute('data-js'),
        role: el.getAttribute('role'),
      });
      const describeFlyout = (el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class_name: typeof el.className === 'string' ? el.className : null,
        data_js: el.getAttribute('data-js'),
        role: el.getAttribute('role'),
        text: text(el).slice(0, 260),
      });
      const inspect = () => {
        const flyouts = [...document.querySelectorAll(s.settings_flyout)];
        const visibleFlyouts = flyouts.filter(visible);
        const admittedFlyout = flyouts.length === 1 && visibleFlyouts.length === 1 ? visibleFlyouts[0] : null;
        const structuralPushControls = admittedFlyout ? [...admittedFlyout.querySelectorAll(s.push_control)] : [];
        const visiblePushControls = structuralPushControls.filter(visible);
        const diagnosticCandidates = [...document.querySelectorAll('body *')].filter(el => {
          if (!visible(el)) return false;
          const identity = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('data-js') || ''} ${el.getAttribute('role') || ''}`;
          const body = text(el);
          return settingsMarker.test(identity) || (body.length > 0 && body.length <= 260 && notificationMarker.test(body));
        }).slice(0, 80).map(describeFlyout);
        const diagnosticNotificationLikeControls = [...document.querySelectorAll('input,button,select,textarea,label')]
          .filter(el => visible(el) && notificationMarker.test([
            el.id || '',
            typeof el.className === 'string' ? el.className : '',
            el.getAttribute('data-js') || '',
            el.getAttribute('name') || '',
            el.getAttribute('title') || '',
            el.getAttribute('aria-label') || '',
            text(el),
          ].join(' ')))
          .map(describeElement);

        let flyoutStatus = 'NOT_PROVEN';
        let flyoutReason = 'NATIVE_SETTINGS_FLYOUT_NOT_AUTHENTICALLY_EXPOSED';
        if (flyouts.length === 1 && visibleFlyouts.length === 1) {
          flyoutStatus = 'OBSERVED_UNAMBIGUOUS_NATIVE_SURFACE';
          flyoutReason = null;
        } else if (flyouts.length > 1 || visibleFlyouts.length > 1) {
          flyoutReason = 'AMBIGUOUS_NATIVE_SETTINGS_FLYOUT_IDENTITY';
        }

        let pushStatus = 'NOT_PROVEN';
        let pushReason = admittedFlyout ? 'NATIVE_PUSH_CONTROL_NOT_AUTHENTICALLY_EXPOSED' : 'NATIVE_SETTINGS_FLYOUT_NOT_PROVEN';
        if (admittedFlyout && structuralPushControls.length === 1 && visiblePushControls.length === 1) {
          pushStatus = 'OBSERVED_UNAMBIGUOUS_NATIVE_CONTROL';
          pushReason = null;
        } else if (admittedFlyout && (structuralPushControls.length > 1 || visiblePushControls.length > 1)) {
          pushReason = 'AMBIGUOUS_NATIVE_PUSH_CONTROL_IDENTITY';
        }

        return {
          browser_notification_supported: 'Notification' in window,
          browser_notification_permission: 'Notification' in window ? Notification.permission : null,
          settings_flyout: {
            status: flyoutStatus,
            reason: flyoutReason,
            selector: s.settings_flyout,
            count: flyouts.length,
            visible_count: visibleFlyouts.length,
            candidates: flyouts.map(describeFlyout),
          },
          push_control: {
            status: pushStatus,
            reason: pushReason,
            provenance: 'NATIVE_SETTINGS_FLYOUT_STRUCTURAL_SELECTOR',
            selector: s.push_control,
            count: visiblePushControls.length,
            structural_count: structuralPushControls.length,
            candidates: visiblePushControls.map(describeElement),
          },
          diagnostic_candidates: diagnosticCandidates,
          diagnostic_notification_like_controls: diagnosticNotificationLikeControls,
          external_decoy_visible_count: [...document.querySelectorAll('[data-wu21-external-notification-decoy]')].filter(visible).length,
        };
      };

      const authentic = inspect();
      let decoy = null;
      let authenticPush = null;
      let originalStyle = null;
      let ambiguousClone = null;
      let externalDecoy = null;
      let missingPushWithExternalDecoy = null;
      let ambiguousPush = null;

      try {
        decoy = document.createElement('label');
        decoy.setAttribute('data-wu21-external-notification-decoy', 'true');
        decoy.setAttribute('style', 'position:fixed;left:4px;top:4px;display:block;width:180px;height:32px;visibility:visible;z-index:2147483647;background:#fff;');
        decoy.textContent = 'External Notification decoy';
        const decoyInput = document.createElement('input');
        decoyInput.type = 'checkbox';
        decoyInput.name = 'wu21-external-notification-decoy';
        decoyInput.setAttribute('aria-label', 'External Notification decoy');
        decoy.appendChild(decoyInput);
        document.body.appendChild(decoy);
        externalDecoy = inspect();

        const admittedFlyout = [...document.querySelectorAll(s.settings_flyout)].filter(visible);
        if (admittedFlyout.length === 1) {
          authenticPush = admittedFlyout[0].querySelector(s.push_control);
        }

        if (authenticPush) {
          originalStyle = authenticPush.getAttribute('style');
          authenticPush.style.setProperty('display', 'none', 'important');
          missingPushWithExternalDecoy = inspect();
          if (originalStyle === null) authenticPush.removeAttribute('style');
          else authenticPush.setAttribute('style', originalStyle);

          ambiguousClone = authenticPush.cloneNode(true);
          ambiguousClone.id = `${authenticPush.id || 'inbox-setting--push-enabled'}--wu21-ambiguous`;
          ambiguousClone.setAttribute('data-wu21-native-push-clone', 'true');
          ambiguousClone.setAttribute('style', 'position:fixed;left:4px;top:44px;display:block;width:16px;height:16px;visibility:visible;opacity:1;z-index:2147483647;');
          admittedFlyout[0].appendChild(ambiguousClone);
          ambiguousPush = inspect();
        }
      } finally {
        if (ambiguousClone?.isConnected) ambiguousClone.remove();
        if (authenticPush) {
          if (originalStyle === null) authenticPush.removeAttribute('style');
          else authenticPush.setAttribute('style', originalStyle);
        }
        if (decoy?.isConnected) decoy.remove();
      }

      return {
        authentic,
        external_decoy: externalDecoy,
        missing_push_with_external_decoy: missingPushWithExternalDecoy,
        ambiguous_native_push: ambiguousPush,
      };
    }, selectors);
  } finally {
    await page.keyboard.press('Escape').catch(() => {});
  }

  const asSettingsFacts = (observed) => ({
    settings_identity: 'OBSERVED_UNAMBIGUOUS_NATIVE_CONTROL',
    reason: null,
    settings_count: settingsCount,
    settings_visible_count: visibleSettingsCount,
    button: buttonIdentity,
    browser_notification_supported: observed?.browser_notification_supported ?? null,
    browser_notification_permission: observed?.browser_notification_permission ?? null,
    panel_candidates: observed?.diagnostic_candidates ?? [],
    diagnostic_notification_like_controls: observed?.diagnostic_notification_like_controls ?? [],
    settings_flyout: observed?.settings_flyout ?? { status: 'NOT_PROVEN', count: null, visible_count: null, candidates: [] },
    push_control: observed?.push_control ?? { status: 'NOT_PROVEN', count: null, structural_count: null, candidates: [] },
  });

  const authenticSettings = asSettingsFacts(panelFacts.authentic);
  const decoySettings = asSettingsFacts(panelFacts.external_decoy);
  assertSettingsFactsProven(decoySettings, 'push-provenance/external-decoy');
  assert.equal(decoySettings.push_control.candidates[0]?.id, authenticSettings.push_control.candidates[0]?.id, 'External notification-like decoy changed admitted native Push identity.');
  assert.equal(panelFacts.external_decoy?.external_decoy_visible_count, 1, 'External notification-like decoy was not visibly established for falsification.');

  const missingSettings = asSettingsFacts(panelFacts.missing_push_with_external_decoy);
  const missingRejection = assertSettingsFactsRejected(missingSettings, 'push-provenance/native-push-missing-with-external-decoy');
  assert.equal(panelFacts.missing_push_with_external_decoy?.external_decoy_visible_count, 1, 'Missing-Push falsification lost its external notification-like decoy.');
  assert.equal(missingSettings.push_control.status, 'NOT_PROVEN', 'Missing native Push must remain NOT_PROVEN even with an external notification-like decoy.');

  assert.ok(panelFacts.ambiguous_native_push, 'Ambiguous native Push falsification did not execute despite an authentic Push precondition.');
  const ambiguousSettings = asSettingsFacts(panelFacts.ambiguous_native_push);
  const ambiguousRejection = assertSettingsFactsRejected(ambiguousSettings, 'push-provenance/ambiguous-native-push');
  assert.equal(ambiguousSettings.push_control.status, 'NOT_PROVEN', 'Two qualifying native Push candidates must fail closed.');

  authenticSettings.provenance_falsification = {
    external_decoy: {
      status: 'PASS_AUTHENTIC_PUSH_UNCHANGED',
      external_decoy_visible_count: panelFacts.external_decoy.external_decoy_visible_count,
      admitted_push_id: decoySettings.push_control.candidates[0]?.id ?? null,
      admitted_push_provenance: decoySettings.push_control.provenance,
    },
    native_push_missing_with_external_decoy: {
      ...missingRejection,
      push_status: missingSettings.push_control.status,
      external_decoy_visible_count: panelFacts.missing_push_with_external_decoy.external_decoy_visible_count,
    },
    ambiguous_native_push: {
      ...ambiguousRejection,
      push_status: ambiguousSettings.push_control.status,
      structural_count: ambiguousSettings.push_control.structural_count,
      visible_count: ambiguousSettings.push_control.count,
    },
  };

  return authenticSettings;
}

function assertCommonNativeFacts(facts, label) {
  assert.equal(facts.native_inbox_count, 1, `${label}: expected one authentic native Inbox root.`);
  assert.equal(facts.native_grid_count, 1, `${label}: expected one native AG Grid.`);
  assert.equal(facts.native_grid_visible_count, 1, `${label}: native AG Grid is not visibly exposed.`);
  assert.equal(facts.native_search_count, 1, `${label}: native Search identity changed.`);
  assert.equal(facts.native_search_visible_count, 1, `${label}: native Search is not visibly exposed.`);
  assert.equal(facts.native_settings_count, 1, `${label}: native Settings identity is missing or ambiguous.`);
  assert.equal(facts.native_settings_visible_count, 1, `${label}: native Settings is not visibly exposed.`);
  assert.equal(facts.native_fullscreen_count, 1, `${label}: native Fullscreen identity is missing or ambiguous.`);
  assert.equal(facts.native_fullscreen_visible_count, 1, `${label}: native Fullscreen is not visibly exposed.`);
  assert.equal(facts.native_pager_count, 1, `${label}: native pager identity changed.`);
  assert.equal(facts.native_pager_visible_count, 1, `${label}: native pager is not visibly exposed.`);
  assert.ok(facts.visible_native_row_count > 0, `${label}: synthetic native rows are unavailable.`);
  assert.equal(facts.gpp_card_node_count, 0, `${label}: Card Mode node resurrected.`);
  assert.equal(facts.gpp_case_card_column_count, 0, `${label}: gpp_case_card resurrected.`);
  assert.equal(facts.replacement_widget_count, 0, `${label}: structural Inbox replacement appeared.`);
}

function assertSettingsFactsProven(settings, label) {
  assert.equal(settings.settings_identity, 'OBSERVED_UNAMBIGUOUS_NATIVE_CONTROL', `${label}: native Settings identity is not proven.`);
  assert.equal(settings.settings_count, 1, `${label}: native Settings count is not singular.`);
  assert.equal(settings.settings_visible_count, 1, `${label}: native Settings is not visibly exposed.`);
  assert.equal(settings.settings_flyout?.status, 'OBSERVED_UNAMBIGUOUS_NATIVE_SURFACE', `${label}: native Inbox Settings flyout provenance is not proven.`);
  assert.equal(settings.settings_flyout?.count, 1, `${label}: native Inbox Settings flyout is missing or ambiguous.`);
  assert.equal(settings.settings_flyout?.visible_count, 1, `${label}: native Inbox Settings flyout is not visibly exposed.`);
  assert.equal(settings.push_control?.status, 'OBSERVED_UNAMBIGUOUS_NATIVE_CONTROL', `${label}: native Push control identity is not proven.`);
  assert.equal(settings.push_control?.provenance, 'NATIVE_SETTINGS_FLYOUT_STRUCTURAL_SELECTOR', `${label}: native Push provenance is not structurally bound to the admitted Settings flyout.`);
  assert.equal(settings.push_control?.selector, selectors.push_control, `${label}: native Push selector identity changed.`);
  assert.equal(settings.push_control?.structural_count, 1, `${label}: native Push structural identity is missing or ambiguous.`);
  assert.equal(settings.push_control?.count, 1, `${label}: native Push control is not singular and visible.`);
  assert.equal(settings.push_control?.candidates?.[0]?.name, 'inbox-setting--push-enabled', `${label}: native Push name identity changed.`);
  assert.equal(settings.push_control?.candidates?.[0]?.data_js, 'inbox-setting', `${label}: native Push data-js identity changed.`);
}

function assertSettingsFactsRejected(settings, label) {
  try {
    assertSettingsFactsProven(settings, label);
  } catch (error) {
    return {
      status: 'REJECTED_AS_EXPECTED',
      positive_scenario_status_allowed: false,
      failure_message: String(error?.message || error),
    };
  }
  throw new Error(`${label}: falsification unexpectedly satisfied the positive native Settings/Push admission gate.`);
}

function assertModeBoundary(mode, facts, label) {
  if (mode === 'RAW_NATIVE') {
    assert.equal(facts.gpp_surface_count, 0, `${label}: GPP surface wrapper leaked into RAW_NATIVE.`);
    assert.equal(facts.gpp_manual_refresh_count, 0, `${label}: GPP Manual Refresh leaked into RAW_NATIVE.`);
    assert.equal(facts.gpp_inbox_stylesheet_count, 0, `${label}: GPP Inbox stylesheet leaked into RAW_NATIVE.`);
    assert.equal(facts.gpp_manual_refresh_script_count, 0, `${label}: GPP Manual Refresh script leaked into RAW_NATIVE.`);
  } else {
    assert.equal(facts.gpp_surface_count, 1, `${label}: ordinary Native-First GPP surface is unavailable after RAW_NATIVE request.`);
    assert.equal(facts.gpp_manual_refresh_count, 1, `${label}: ordinary GPP Manual Refresh is unavailable after RAW_NATIVE request.`);
    assert.equal(facts.native_presentation.header?.background_color, 'rgb(243, 246, 251)', `${label}: native header presentation was not applied.`);
    assert.equal(facts.native_presentation.form_cell?.font_weight, '700', `${label}: existing form column lost its primary text hierarchy.`);
    assert.equal(facts.native_presentation.entry_link?.color, 'rgb(29, 78, 216)', `${label}: native Open link lost its blue action treatment.`);
    assert.equal(facts.native_presentation.pager_button?.background_color, 'rgb(240, 246, 255)', `${label}: METHOD B native pager paint was not applied.`);
  }
}

function assertPairedHostParity(raw, gpp, scenarioId) {
  for (const key of ['native_inbox_count', 'native_grid_count', 'native_grid_visible_count', 'native_search_count', 'native_search_visible_count', 'native_settings_count', 'native_settings_visible_count', 'native_fullscreen_count', 'native_fullscreen_visible_count', 'native_pager_count', 'native_pager_visible_count', 'visible_native_row_count']) {
    assert.equal(gpp.runtime[key], raw.runtime[key], `${scenarioId}: paired host fact ${key} diverged between RAW_NATIVE and NATIVE_FIRST_GPP.`);
  }
  return {
    status: 'PASS',
    compared_facts: ['native_inbox_count', 'native_grid_count', 'native_grid_visible_count', 'native_search_count', 'native_search_visible_count', 'native_settings_count', 'native_settings_visible_count', 'native_fullscreen_count', 'native_fullscreen_visible_count', 'native_pager_count', 'native_pager_visible_count', 'visible_native_row_count'],
  };
}

async function captureMode({ page, scenario, mode, zoomEvidence, navigate = true }) {
  const url = captureUrl(mode);
  if (navigate) {
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    if (!response || !response.ok()) throw new Error(`${scenario.id}/${mode}: Inbox route HTTP status ${response?.status() ?? 'unknown'}.`);
  } else if (page.url() !== url) {
    throw new Error(`${scenario.id}/${mode}: capture tab is not on the qualified route.`);
  }
  await waitForNativeInbox(page);
  const runtimeFacts = await measureRuntimeFacts(page);
  assertCommonNativeFacts(runtimeFacts, `${scenario.id}/${mode}`);
  assertModeBoundary(mode, runtimeFacts, `${scenario.id}/${mode}`);

  const screenshotName = `${scenario.id}__${mode}.png`;
  await page.screenshot({ path: path.join(outputRoot, screenshotName), fullPage: scenario.kind === 'viewport' });
  const settings = await captureSettingsFacts(page, runtimeFacts);
  assertSettingsFactsProven(settings, `${scenario.id}/${mode}`);
  const browserIdentity = await page.evaluate(() => ({ user_agent: navigator.userAgent, platform: navigator.platform }));
  browserIdentity.chromium_version = page.context().browser()?.version() ?? null;
  const evidence = {
    schema_version: '1.0.0',
    evidence_kind: 'GPP_INBOX_NATIVE_BASELINE_SCENARIO',
    maximum_positive_evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    status: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    scenario: scenario.id,
    scenario_label: scenario.label,
    capture_mode: mode,
    data_class: fixture.data_class,
    route: {
      family: 'frontend_shortcode_on_integrated_visual_host',
      source_url: fixture.frontend_inbox_url,
      requested_url: url,
      final_url: page.url(),
      native_surface_selector: selectors.native_inbox,
    },
    browser: browserIdentity,
    browser_zoom: zoomEvidence,
    runtime: runtimeFacts,
    native_settings_push: settings,
    screenshot: screenshotName,
    dependencies: dependencyIdentity,
    evidence_ceiling: {
      proven: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
      target_production_equivalence: 'NOT_PROVEN',
      owner_site_visual_acceptance: 'NOT_PROVEN',
      runtime_golden_approval: 'NOT_ACTIVATED',
      approved_visual_contract: 'NOT_ACTIVATED',
    },
  };
  const jsonName = `${scenario.id}__${mode}.json`;
  fs.writeFileSync(path.join(outputRoot, jsonName), `${JSON.stringify(evidence, null, 2)}\n`);
  return { ...evidence, json: jsonName };
}

async function runViewportScenario(browser, scenario) {
  const context = await browser.newContext({ viewport: scenario.viewport, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
  try {
    await addAuthCookies(context);
    const pair = [];
    for (const mode of ['RAW_NATIVE', 'NATIVE_FIRST_GPP']) {
      const page = await context.newPage();
      try {
        const capture = await captureMode({
          page,
          scenario,
          mode,
          zoomEvidence: {
            requested_factor: 1,
            actual_factor: 1,
            verification: 'FRESH_PLAYWRIGHT_CONTEXT_WITH_NO_ZOOM_MUTATION',
            genuine_tab_zoom_api_used: false,
          },
        });
        assert.equal(capture.runtime.viewport.inner_width, scenario.viewport.width, `${scenario.id}/${mode}: CSS viewport width mismatch.`);
        assert.equal(capture.runtime.viewport.inner_height, scenario.viewport.height, `${scenario.id}/${mode}: CSS viewport height mismatch.`);
        pair.push(capture);
      } finally {
        await page.close().catch(() => {});
      }
    }
    return { raw: pair[0], gpp: pair[1], parity: assertPairedHostParity(pair[0], pair[1], scenario.id) };
  } finally {
    await context.close();
  }
}

async function runBrowserZoomScenario(scenario) {
  const harness = await launchBrowserZoomContext({ windowWidth: scenario.window.width, windowHeight: scenario.window.height });
  try {
    await addAuthCookies(harness.context);
    const pair = [];
    for (const mode of ['RAW_NATIVE', 'NATIVE_FIRST_GPP']) {
      const page = await harness.context.newPage();
      try {
        const url = captureUrl(mode);
        const response = await page.goto(url, { waitUntil: 'networkidle' });
        if (!response || !response.ok()) throw new Error(`${scenario.id}/${mode}: Inbox route HTTP status ${response?.status() ?? 'unknown'}.`);
        await waitForNativeInbox(page);
        const reset = await setBrowserTabZoom(harness.worker, page, 1);
        assert.ok(Math.abs(reset.actual - 1) < 0.001, `${scenario.id}/${mode}: genuine tab zoom did not reset to 100%.`);
        await page.waitForTimeout(250);
        const before = await measureRuntimeFacts(page);
        const zoom = await setBrowserTabZoom(harness.worker, page, scenario.requested_zoom);
        assert.ok(Math.abs(zoom.actual - scenario.requested_zoom) < 0.001, `${scenario.id}/${mode}: chrome.tabs.getZoom did not confirm 200%.`);
        await page.waitForTimeout(500);
        const atCapture = await getBrowserTabZoom(harness.worker, page);
        assert.ok(Math.abs(atCapture.actual - scenario.requested_zoom) < 0.001, `${scenario.id}/${mode}: capture-time browser zoom is not 200%.`);
        const after = await measureRuntimeFacts(page);
        const widthRatio = before.viewport.inner_width / after.viewport.inner_width;
        assert.ok(widthRatio >= 1.8 && widthRatio <= 2.2, `${scenario.id}/${mode}: browser zoom did not contract the effective CSS viewport as expected; ratio=${widthRatio}.`);

        const capture = await captureMode({
          page,
          scenario,
          mode,
          navigate: false,
          zoomEvidence: {
            requested_factor: scenario.requested_zoom,
            actual_factor: atCapture.actual,
            verification: BROWSER_TAB_ZOOM_MECHANISM.verification_api,
            mechanism: BROWSER_TAB_ZOOM_MECHANISM,
            tab_api_set_result: zoom,
            tab_api_capture_time_verification: atCapture,
            reset_api: reset,
            before_effective_viewport: before.viewport,
            after_effective_viewport: after.viewport,
            effective_css_width_ratio: widthRatio,
            genuine_tab_zoom_api_used: true,
          },
        });
        const afterCapture = await getBrowserTabZoom(harness.worker, page);
        assert.ok(Math.abs(afterCapture.actual - scenario.requested_zoom) < 0.001, `${scenario.id}/${mode}: 200% browser zoom did not remain active through screenshot/runtime capture.`);
        capture.browser_zoom.post_capture_verification = afterCapture;
        fs.writeFileSync(path.join(outputRoot, capture.json), `${JSON.stringify(capture, null, 2)}\n`);
        pair.push(capture);
      } finally {
        await page.close().catch(() => {});
      }
    }
    return { raw: pair[0], gpp: pair[1], parity: assertPairedHostParity(pair[0], pair[1], scenario.id) };
  } finally {
    await harness.close();
  }
}

const manifest = {
  schema_version: '1.0.0',
  evidence_kind: 'GPP_INBOX_RAW_NATIVE_BASELINE_CAPTURE',
  owner_decision: 'OWNER_DECISION_GPP_INBOX_NATIVE_BASELINE_CI_CAPTURE_V1',
  architecture: 'NATIVE_FIRST',
  repository_sha: repositorySha,
  data_class: fixture.data_class,
  status: 'RUNNING',
  maximum_positive_evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
  paired_capture: 'RAW_NATIVE_TO_NATIVE_FIRST_GPP',
  raw_native_definition: 'Authentic Gravity Flow Inbox request with only GPP Inbox presentation callbacks detached by the WU21 test-only MU-plugin query seam; Gravity Flow/AG Grid remain active.',
  native_first_gpp_definition: 'The same fixture/route/host conditions through the ordinary current GPP Native-First presentation request.',
  required_scenarios: scenarios,
  browser_zoom_200_mechanism: BROWSER_TAB_ZOOM_MECHANISM,
  dependencies: dependencyIdentity,
  scenarios: [],
  evidence_ceiling: {
    proven: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    target_production_equivalence: 'NOT_PROVEN',
    owner_site_visual_acceptance: 'NOT_PROVEN',
    runtime_golden_approval: 'NOT_ACTIVATED',
    approved_visual_contract: 'NOT_ACTIVATED',
  },
  failure: null,
};

let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const scenario of scenarios.filter(item => item.kind === 'viewport')) {
    const result = await runViewportScenario(browser, scenario);
    manifest.scenarios.push({
      id: scenario.id,
      status: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
      raw_native: { json: result.raw.json, screenshot: result.raw.screenshot, browser_zoom: result.raw.browser_zoom },
      native_first_gpp: { json: result.gpp.json, screenshot: result.gpp.screenshot, browser_zoom: result.gpp.browser_zoom },
      native_host_parity: result.parity,
      push_identity: { raw_native: result.raw.native_settings_push.push_control, native_first_gpp: result.gpp.native_settings_push.push_control },
    });
  }
  await browser.close();
  browser = null;

  for (const scenario of scenarios.filter(item => item.kind === 'browser_zoom')) {
    const result = await runBrowserZoomScenario(scenario);
    manifest.scenarios.push({
      id: scenario.id,
      status: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
      raw_native: { json: result.raw.json, screenshot: result.raw.screenshot, browser_zoom: result.raw.browser_zoom },
      native_first_gpp: { json: result.gpp.json, screenshot: result.gpp.screenshot, browser_zoom: result.gpp.browser_zoom },
      native_host_parity: result.parity,
      push_identity: { raw_native: result.raw.native_settings_push.push_control, native_first_gpp: result.gpp.native_settings_push.push_control },
    });
  }

  assert.deepEqual(manifest.scenarios.map(item => item.id), scenarios.map(item => item.id), 'Required baseline scenario set is incomplete.');
  manifest.status = 'PROVEN_IN_REPRODUCIBLE_RUNTIME';
  fs.writeFileSync(outputManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`NATIVE_INBOX_BASELINE_CAPTURE_PASS scenarios=${manifest.scenarios.length} paired=true zoom200=genuine-tab-api evidence_ceiling=${manifest.maximum_positive_evidence_class}`);
} catch (error) {
  if (browser) await browser.close().catch(() => {});
  manifest.status = 'NOT_PROVEN';
  manifest.failure = { name: error?.name || 'Error', message: String(error?.message || error), stack: String(error?.stack || error).slice(0, 16000) };
  fs.writeFileSync(outputManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`NATIVE_INBOX_BASELINE_CAPTURE_NOT_PROVEN ${manifest.failure.message}`);
  process.exitCode = 1;
}
