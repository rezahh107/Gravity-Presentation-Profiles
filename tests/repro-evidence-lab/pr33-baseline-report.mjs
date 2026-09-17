import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!artifactDir) throw new Error('WU21_ARTIFACT_DIR is unavailable.');

const baselinePath = path.join(artifactDir, 'pr33-visual-baseline.json');
const browserPath = path.join(artifactDir, 'browser-results.json');
if (!fs.existsSync(baselinePath)) throw new Error('PR33 baseline measurements are unavailable.');
if (!fs.existsSync(browserPath)) throw new Error('WU21 browser results are unavailable.');

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const browser = JSON.parse(fs.readFileSync(browserPath, 'utf8'));
const screenshots = fs.readdirSync(artifactDir)
  .filter(name => /^pr33-.*\.png$/.test(name))
  .sort()
  .map(name => {
    const bytes = fs.readFileSync(path.join(artifactDir, name));
    return {
      name,
      byte_size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });

const obs = baseline.observations || {};
const actualDesktop = obs['baseline-admin-1440'];
const actualMobile = obs['baseline-admin-414'];
const actualText200 = obs['baseline-admin-414-text-200'];
const referenceA = obs['reference-A-1440'];
const referenceB = obs['reference-B-414'];

for (const [label, value] of Object.entries({ actualDesktop, actualMobile, actualText200, referenceA, referenceB })) {
  assert.ok(value, `PR33 required measurement is missing: ${label}`);
}

const normalizeFamily = value => String(value || '').replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const numericPx = value => Number.parseFloat(String(value || '').replace('px', ''));
const assertClose = (actual, expected, tolerance, message) => {
  const a = Number(actual);
  const e = Number(expected);
  assert.ok(Number.isFinite(a) && Number.isFinite(e) && Math.abs(a - e) <= tolerance, `${message}: ${a} vs ${e}`);
};
const assertPxClose = (actual, expected, tolerance, message) => assertClose(numericPx(actual), numericPx(expected), tolerance, message);
const assertStyleEqual = (actual, reference, property, message) => {
  assert.equal(actual?.style?.[property], reference?.style?.[property], message);
};

function assertVisualFidelity(actual, reference, label) {
  assert.ok(actual.card1?.rect?.width > 0 && actual.card1?.rect?.height > 0, `${label}: production card must render.`);
  assert.ok(actual.name?.rect?.width > 0 && actual.openAction?.rect?.height > 0, `${label}: production card descendants must render.`);

  for (const property of ['backgroundColor', 'borderColor', 'borderRadius', 'boxShadow']) {
    assertStyleEqual(actual.card1, reference.card1, property, `${label}: card ${property} must follow locked A/B evidence.`);
  }
  assert.equal(normalizeFamily(actual.card1.style.fontFamily), normalizeFamily(reference.card1.style.fontFamily), `${label}: card font family must declare admitted Vazir stack.`);
  assertStyleEqual(actual.card1, reference.card1, 'fontSize', `${label}: card base font size must follow locked A/B evidence.`);
  assertStyleEqual(actual.card1, reference.card1, 'fontWeight', `${label}: card base font weight must follow locked A/B evidence.`);
  assertStyleEqual(actual.card1, reference.card1, 'lineHeight', `${label}: card line height must follow locked A/B evidence.`);

  for (const property of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
    assertStyleEqual(actual.card1, reference.card1, property, `${label}: card ${property} must follow locked A/B evidence.`);
  }

  assertStyleEqual(actual.name, reference.name, 'fontSize', `${label}: identity name size must match A/B.`);
  assertStyleEqual(actual.name, reference.name, 'fontWeight', `${label}: identity name weight must match A/B.`);
  assertStyleEqual(actual.name, reference.name, 'lineHeight', `${label}: identity name line height must match A/B.`);
  assertStyleEqual(actual.identifier, reference.identifier, 'fontSize', `${label}: national-ID size must match A/B.`);
  assertStyleEqual(actual.identifier, reference.identifier, 'fontWeight', `${label}: national-ID weight must match A/B.`);
  assertStyleEqual(actual.detailLabel, reference.detailLabel, 'fontSize', `${label}: detail-label size must match A/B.`);
  assertStyleEqual(actual.detailLabel, reference.detailLabel, 'fontWeight', `${label}: detail-label weight must match A/B.`);
  assertStyleEqual(actual.detailValue, reference.detailValue, 'fontSize', `${label}: detail-value size must match A/B.`);
  assertStyleEqual(actual.detailValue, reference.detailValue, 'fontWeight', `${label}: detail-value must use admitted 500 weight.`);
  assertStyleEqual(actual.openAction, reference.action, 'fontSize', `${label}: action text size must match A/B.`);
  assertStyleEqual(actual.openAction, reference.action, 'fontWeight', `${label}: action must use admitted 500 weight.`);
  assertStyleEqual(actual.openAction, reference.action, 'backgroundColor', `${label}: action background must match A/B primary.`);
  assertStyleEqual(actual.openAction, reference.action, 'borderRadius', `${label}: action radius must match A/B.`);
  assertClose(actual.openAction.rect.height, reference.action.rect.height, 0.01, `${label}: action rendered height must match A/B`);

  assertStyleEqual(actual.photo, reference.photo, 'backgroundColor', `${label}: photo/fallback neutral surface must match A/B.`);
  assertStyleEqual(actual.photo, reference.photo, 'borderColor', `${label}: photo border must match A/B.`);
  assertStyleEqual(actual.photo, reference.photo, 'borderRadius', `${label}: photo radius must match A/B.`);
  assertClose(actual.photo.rect.width, reference.photo.rect.width, 0.01, `${label}: photo width must match A/B`);
  assertClose(actual.photo.rect.height, reference.photo.rect.height, 0.01, `${label}: photo height must match A/B`);

  assertStyleEqual(actual.search, reference.search, 'backgroundColor', `${label}: native search surface must use the A/B white control surface.`);
  assertStyleEqual(actual.search, reference.search, 'borderColor', `${label}: native search border must use the admitted control color.`);
  assertStyleEqual(actual.search, reference.search, 'borderRadius', `${label}: native search radius must match A/B.`);
  for (const property of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
    assertStyleEqual(actual.search, reference.search, property, `${label}: native search ${property} must match A/B.`);
  }
  assert.equal(normalizeFamily(actual.search.style.fontFamily), normalizeFamily(reference.search.style.fontFamily), `${label}: native search must declare the admitted Vazir stack.`);
  assertStyleEqual(actual.search, reference.search, 'fontSize', `${label}: native search text size must match A/B.`);
  assertStyleEqual(actual.search, reference.search, 'fontWeight', `${label}: native search weight must match A/B.`);
  assertStyleEqual(actual.search, reference.search, 'lineHeight', `${label}: native search line height must match A/B.`);
  assert.ok(actual.search.rect.height >= 48, `${label}: native search must retain a usable A/B-scale rendered height.`);
}

assertVisualFidelity(actualDesktop, referenceA, 'desktop-A');
assertVisualFidelity(actualMobile, referenceB, 'mobile-B');

assertPxClose(actualDesktop.grid.style.gap, referenceA.grid.style.gap, 0.01, 'desktop-A: two-column card gap must match A/B');
assertPxClose(actualMobile.grid.style.gap, referenceB.grid.style.gap, 0.01, 'mobile-B: one-column card gap must match A/B');
assert.equal(actualDesktop.grid.style.backgroundColor, 'rgb(246, 248, 251)', 'desktop-A: operational card region must use the admitted light-gray hierarchy.');
assert.equal(actualMobile.grid.style.backgroundColor, 'rgb(246, 248, 251)', 'mobile-B: operational card region must use the admitted light-gray hierarchy.');

// Fixed media crops and radii remain pixel-based by contract, but their values
// now follow the explicit A/B visual authority instead of the earlier compact
// production placeholders.
assert.equal(actualDesktop.photo.rect.width, 62, 'desktop-A: photo crop width must be 62px.');
assert.equal(actualDesktop.photo.rect.height, 62, 'desktop-A: photo crop height must be 62px.');
assert.equal(actualMobile.photo.rect.width, 62, 'mobile-B: photo crop width must be 62px.');
assert.equal(actualMobile.photo.rect.height, 62, 'mobile-B: photo crop height must be 62px.');

// Text-relative sizing must still scale under the existing 200% browser-text
// scenario; fixed media crops/radii are intentionally not converted to rem.
assertPxClose(actualText200.name.style.fontSize, 40, 0.01, '200%-text: identity name must scale from 20px to 40px');
assertPxClose(actualText200.detailLabel.style.fontSize, 28, 0.01, '200%-text: detail label must scale from 14px to 28px');
assertPxClose(actualText200.detailValue.style.fontSize, 30, 0.01, '200%-text: detail value must scale from 15px to 30px');
assertPxClose(actualText200.openAction.style.fontSize, 30, 0.01, '200%-text: action text must scale from 15px to 30px');
assert.equal(actualText200.photo.rect.width, 62, '200%-text: fixed photo crop remains 62px by contract.');
assert.equal(actualText200.photo.rect.height, 62, '200%-text: fixed photo crop remains 62px by contract.');
assert.ok(actualText200.card1.rect.scrollWidth <= actualText200.card1.rect.clientWidth + 1, '200%-text: card must not overflow horizontally.');

browser.pr33_visual_baseline = {
  ...baseline,
  screenshots,
  visual_fidelity_assertions: {
    status: 'PASS',
    compared_surfaces: ['A_1440', 'B_414'],
    preserved_runtime_constraints: {
      card_radius_px: 14,
      photo_crop_px: 62,
      photo_radius_px: 12,
      action_radius_px: 8,
      host_search_radius_px: 8,
      breakpoint_px: 782,
      max_width_added: false,
      container_query_added: false,
    },
  },
};
fs.writeFileSync(browserPath, `${JSON.stringify(browser, null, 2)}\n`);

const compactActual = value => value ? {
  viewport: value.viewport,
  document_overflow: value.documentOverflow,
  inbox: value.inbox?.rect || null,
  inbox_style: value.inbox?.style || null,
  ancestors: (value.inboxAncestors || []).map(item => ({
    tag: item.tag,
    id: item.id,
    classes: item.classes,
    rect: item.rect,
    maxWidth: item.style?.maxWidth,
    width: item.style?.width,
    marginInlineStart: item.style?.marginInlineStart,
    marginInlineEnd: item.style?.marginInlineEnd,
  })),
  grid: value.grid?.rect || null,
  grid_style: value.grid?.style || null,
  card1: value.card1?.rect || null,
  card1_style: value.card1?.style || null,
  card2: value.card2?.rect || null,
  card_delta: value.cardDelta || null,
  photo: value.photo || null,
  name: value.name || null,
  identifier: value.identifier || null,
  detail_label: value.detailLabel || null,
  detail_value: value.detailValue || null,
  open_action: value.openAction || null,
  search: value.search || null,
  toolbar: value.toolbar || null,
} : null;
const compactReference = value => value ? {
  viewport: value.viewport,
  stage: value.stage,
  inbox_view: value.inboxView,
  search: value.search,
  grid: value.grid,
  card1: value.card1,
  card2: value.card2,
  photo: value.photo,
  identity: value.identity,
  name: value.name,
  identifier: value.identifier,
  meta: value.meta,
  detail_row: value.detailRow,
  detail_label: value.detailLabel,
  detail_value: value.detailValue,
  action: value.action,
} : null;

const summary = {
  repository_sha: baseline.repository_sha,
  screenshots,
  visual_fidelity_assertions: browser.pr33_visual_baseline.visual_fidelity_assertions,
  actual: {
    admin_1440: compactActual(obs['baseline-admin-1440']),
    admin_414: compactActual(obs['baseline-admin-414']),
    admin_375: compactActual(obs['baseline-admin-375']),
    admin_320: compactActual(obs['baseline-admin-320']),
    admin_414_text_200: compactActual(obs['baseline-admin-414-text-200']),
    frontend_2200: compactActual(obs['baseline-frontend-2200']),
  },
  reference: {
    A_1440: compactReference(obs['reference-A-1440']),
    B_414: compactReference(obs['reference-B-414']),
  },
};

process.stdout.write(`PR33_VISUAL_FIDELITY_ASSERTIONS_PASS=${baseline.repository_sha}\n`);
process.stdout.write(`PR33_BASELINE_RETAINED=${browserPath}\n`);
process.stdout.write(`PR33_BASELINE_SUMMARY=${JSON.stringify(summary)}\n`);