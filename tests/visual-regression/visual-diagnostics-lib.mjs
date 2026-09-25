import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// Qualification-only hook: once the authentic integrated WU21 host exists,
// execute the supplementary PR87 native-height counterfactual before the
// pre-existing visual diagnostics reach the already-known 20->5 failure.
// The hook is inert on canonical branches because the qualification harness
// does not exist there, and it is inert during contract tests before host setup.
const qualificationHarness = path.join(process.env.GITHUB_WORKSPACE || '.', 'tests/repro-evidence-lab/pr87-native-height-restoration-counterfactual-v2.mjs');
const integratedHostManifest = path.join(process.env.WU21_ARTIFACT_DIR || '/tmp/wu21-artifacts', 'integrated-visual-host.json');
if (fs.existsSync(qualificationHarness) && fs.existsSync(integratedHostManifest)) {
  await import('../repro-evidence-lab/pr87-native-height-restoration-counterfactual-v2.mjs');
}

export function comparePng(referencePath, actualPath, diffPath, config) {
  if (!fs.existsSync(referencePath)) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: required reference missing: ${referencePath}`);
  if (!fs.existsSync(actualPath)) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: actual capture missing: ${actualPath}`);
  const reference = PNG.sync.read(fs.readFileSync(referencePath));
  const actual = PNG.sync.read(fs.readFileSync(actualPath));
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: image dimensions differ (${reference.width}x${reference.height} vs ${actual.width}x${actual.height})`);
  }
  const diff = new PNG({ width: reference.width, height: reference.height });
  const differingPixels = pixelmatch(reference.data, actual.data, diff.data, reference.width, reference.height, {
    threshold: config.pixel_threshold,
    includeAA: false,
  });
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  const totalPixels = reference.width * reference.height;
  const differingPixelRatio = differingPixels / totalPixels;
  return {
    image_dimensions: { width: reference.width, height: reference.height },
    differing_pixel_count: differingPixels,
    differing_pixel_ratio: differingPixelRatio,
    configured_tolerance: config,
    comparator_result: differingPixelRatio > config.warning_ratio ? 'VISUAL_DIFFERENCE_FOUND' : 'PASS',
  };
}

const divergenceOrder = [
  'relationships.surface_to_inner_offset', 'anchors.surface.width', 'anchors.inner.width',
  'anchors.gridRoot.height', 'anchors.firstCard.width', 'relationships.two_card_horizontal_gap',
  'relationships.last_card_to_pager_gap', 'relationships.visual_card_flow_height',
  'relationships.native_grid_body_height', 'relationships.visual_vs_native_height_delta',
  'relationships.document_horizontal_overflow',
];

function read(object, dotted) {
  return dotted.split('.').reduce((value, key) => value?.[key], object);
}

export function firstMeaningfulDivergence(reference, actual, epsilon = 1) {
  for (const metric of divergenceOrder) {
    const before = read(reference, metric);
    const after = read(actual, metric);
    if (typeof before === 'number' && typeof after === 'number' && Math.abs(after - before) > epsilon) {
      return { metric, reference: before, actual: after, delta: after - before };
    }
    if (before !== undefined && after !== undefined && before !== after) return { metric, reference: before, actual: after };
  }
  return null;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
