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

browser.pr33_visual_baseline = {
  ...baseline,
  screenshots,
};
fs.writeFileSync(browserPath, `${JSON.stringify(browser, null, 2)}\n`);

const obs = baseline.observations || {};
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

process.stdout.write(`PR33_BASELINE_RETAINED=${browserPath}\n`);
process.stdout.write(`PR33_BASELINE_SUMMARY=${JSON.stringify(summary)}\n`);
