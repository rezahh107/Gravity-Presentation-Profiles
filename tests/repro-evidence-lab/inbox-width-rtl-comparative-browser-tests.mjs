import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const repoRoot = process.env.GITHUB_WORKSPACE;
const repositorySha = process.env.GPP_WU21_REPOSITORY_SHA;
const baselineSha = '8265507e7330a1e444ee10eec0592e816e03fad3';
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const browserUser = process.env.GPP_RP_BROWSER_USER;
const browserPassword = process.env.GPP_RP_BROWSER_PASSWORD;
const tolerance = 3;

if (!artifactDir || !repoRoot || !repositorySha) {
  throw new Error('WU21 comparative environment is incomplete.');
}

const runtime = JSON.parse(fs.readFileSync(path.join(artifactDir, 'inbox-width-rtl-runtime.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'inbox-width-rtl-fixture.json'), 'utf8'));

function gitBlob(file) {
  const cp = spawnSync('git', ['hash-object', file], { cwd: repoRoot, encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout || `git hash-object failed: ${file}`);
  return cp.stdout.trim();
}

function fileSha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, file))).digest('hex');
}

const controlFiles = {
  'assets/css/srwf-gravity-flow-inbox.css': '2b0ed958c37471b1f5ffbf2aab22c13798596924',
  'assets/css/srwf-gravity-flow-inbox-native.css': '87549fc51b33888cd58c0242b9397cf5e67172d8',
};
for (const [file, expected] of Object.entries(controlFiles)) {
  const actual = gitBlob(file);
  if (actual !== expected) throw new Error(`CONTROL identity mismatch for ${file}: ${actual}`);
  controlFiles[file] = {
    expected_git_blob_sha: expected,
    actual_git_blob_sha: actual,
    sha256: fileSha256(file),
  };
}

const hostOwnedCss = `.gpp-inbox-surface.gpp-inbox-surface--full-width{box-sizing:border-box!important;inline-size:100%!important;width:100%!important;max-inline-size:none!important;max-width:none!important;margin-inline:0!important;position:static!important;inset:auto!important;left:auto!important;right:auto!important;transform:none!important}`;
const candidates = Object.freeze([
  {
    id: 'CONTROL',
    kind: 'production_control',
    authority_compatible_candidate: false,
    css: null,
    identity: { baseline_sha: baselineSha, files: controlFiles },
  },
  {
    id: 'CANDIDATE_HOST_OWNED',
    kind: 'test_only_prototype',
    authority_compatible_candidate: true,
    css: hostOwnedCss,
    identity: {
      css_sha256: crypto.createHash('sha256').update(hostOwnedCss).digest('hex'),
      description: 'Host owns page width; GPP keeps only the bounded inner Inbox axis.',
    },
  },
]);

const hardGates = Object.freeze({
  G1: 'NO DOCUMENT HORIZONTAL OVERFLOW',
  G2: 'NO VISIBLE GRID HORIZONTAL OVERFLOW',
  G3: 'RTL PHYSICAL GEOMETRY CORRECTNESS',
  G4: 'LTR SMOKE',
  G5: 'FULL_WIDTH_HOST OWNERSHIP',
  G6: 'BOUNDED INNER AXIS',
  G7: 'CONSTRAINED_HOST TRUTHFULNESS',
  G8: 'RESPONSIVE',
  G9: 'HOST BEHAVIOR UNCHANGED',
  G10: 'FAIL-CLOSED EVIDENCE',
});

const contexts = ['FULL_WIDTH_HOST', 'CONSTRAINED_HOST'];
const directions = ['rtl', 'ltr'];
const viewports = [
  { id: 'desktop_1440', width: 1440, height: 1000 },
  { id: 'mobile_390', width: 390, height: 844 },
];
const scenarioId = (candidate, host, direction, viewport, textScale = 100) =>
  `${candidate}__${host}__${direction}__${viewport}__text_${textScale}`;

async function waitInbox(page) {
  await page.waitForSelector('[data-gpp-inbox-surface="gravity_flow.inbox"]', { timeout: 30000 });
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length > 1,
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(() => document.querySelectorAll('.gpp-inbox-card').length > 1, null, { timeout: 30000 });
}

async function prepare(page, candidate, host, direction, viewport, textScale = 100) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(fixture.contexts[host].url, { waitUntil: 'domcontentloaded' });

  if (candidate.css) await page.addStyleTag({ content: candidate.css });
  await page.evaluate(dir => {
    document.documentElement.dir = dir;
    document.body.dir = dir;
    document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]')?.setAttribute('dir', dir);
  }, direction);
  await page.addStyleTag({
    content: `[data-gpp-inbox-surface="gravity_flow.inbox"]{direction:${direction}!important}${textScale === 100 ? '' : `html{font-size:${textScale}%!important}`}`,
  });

  await waitInbox(page);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(150);
}

async function measure(page, meta) {
  return page.evaluate(({ meta, tolerance }) => {
    const computed = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        display: style.display,
        visibility: style.visibility,
        direction: style.direction,
        boxSizing: style.boxSizing,
        width: style.width,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        marginLeft: style.marginLeft,
        marginRight: style.marginRight,
        marginInlineStart: style.marginInlineStart,
        marginInlineEnd: style.marginInlineEnd,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        position: style.position,
        left: style.left,
        right: style.right,
        insetInlineStart: style.insetInlineStart,
        insetInlineEnd: style.insetInlineEnd,
        transform: style.transform,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        gridTemplateColumns: style.gridTemplateColumns,
      };
    };
    const describe = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        rect: {
          left: +rect.left.toFixed(2),
          right: +rect.right.toFixed(2),
          top: +rect.top.toFixed(2),
          bottom: +rect.bottom.toFixed(2),
          width: +rect.width.toFixed(2),
          height: +rect.height.toFixed(2),
          logicalStart: +(meta.direction === 'rtl' ? rect.right : rect.left).toFixed(2),
          logicalEnd: +(meta.direction === 'rtl' ? rect.left : rect.right).toFixed(2),
        },
        scroll: {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollLeft: element.scrollLeft,
        },
        style: computed(element),
      };
    };
    const query = selector => document.querySelector(selector);
    const cards = [...document.querySelectorAll('.gpp-inbox-card')];
    const rows = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row')];
    const nodes = {
      host: query(`[data-gpp-comparative-host="${meta.context}"]`),
      surface: query('[data-gpp-inbox-surface="gravity_flow.inbox"]'),
      inner: query('.gpp-inbox-surface__inner'),
      inbox: query('.gflow-inbox.gflow-grid.gflow-common'),
      agRoot: query('[data-js="gflow-inbox"] .ag-root-wrapper'),
      center: query('[data-js="gflow-inbox"] .ag-center-cols-viewport'),
      grid: query('[data-js="gflow-inbox"] .ag-center-cols-container'),
      first: cards[0],
      second: cards[1],
      search: query('[data-js="gflow-inbox-search"]'),
      scrollbar: query('[data-js="gflow-inbox"] .ag-body-horizontal-scroll'),
    };
    const missing = ['host', 'surface', 'inner', 'inbox', 'agRoot', 'center', 'grid', 'first', 'second', 'search']
      .filter(key => !nodes[key]);
    const root = document.documentElement;
    const centerRect = nodes.center?.getBoundingClientRect();
    const gridRect = nodes.grid?.getBoundingClientRect();
    const firstRect = cards[0]?.getBoundingClientRect();
    const secondRect = cards[1]?.getBoundingClientRect();
    const scrollbarRect = nodes.scrollbar?.getBoundingClientRect();
    const scrollbarStyle = nodes.scrollbar ? getComputedStyle(nodes.scrollbar) : null;

    return {
      ...meta,
      established: missing.length === 0,
      missing_required_measurements: missing,
      viewport: { innerWidth, innerHeight, clientWidth: root.clientWidth },
      document: {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        rootFontSize: parseFloat(getComputedStyle(root).fontSize),
      },
      elements: Object.fromEntries(Object.entries(nodes).map(([key, element]) => [key, describe(element)])),
      card_mode: {
        row_count: rows.length,
        card_count: cards.length,
        ready_count: document.querySelectorAll('.gpp-inbox-card__readiness--ready').length,
        unready_count: document.querySelectorAll('.gpp-inbox-card__readiness--unready').length,
      },
      derived: {
        document_overflow_px: root.scrollWidth - root.clientWidth,
        center_overflow_px: nodes.center ? nodes.center.scrollWidth - nodes.center.clientWidth : null,
        horizontal_scrollbar_rendered: Boolean(
          scrollbarRect && scrollbarStyle && scrollbarStyle.display !== 'none' &&
          scrollbarStyle.visibility !== 'hidden' && scrollbarRect.height > tolerance
        ),
        grid_inside_center: Boolean(
          centerRect && gridRect && gridRect.left >= centerRect.left - tolerance &&
          gridRect.right <= centerRect.right + tolerance
        ),
        two_cards_vertical: Boolean(firstRect && secondRect && secondRect.top >= firstRect.bottom - tolerance),
        two_cards_same_row: Boolean(firstRect && secondRect && Math.abs(firstRect.top - secondRect.top) <= tolerance),
      },
    };
  }, { meta, tolerance });
}

const inside = (outer, inner) => Boolean(
  outer?.rect && inner?.rect &&
  inner.rect.left >= outer.rect.left - tolerance &&
  inner.rect.right <= outer.rect.right + tolerance
);
const inViewport = measurement => Boolean(
  measurement.elements.surface?.rect &&
  measurement.elements.surface.rect.left >= -tolerance &&
  measurement.elements.surface.rect.right <= measurement.viewport.clientWidth + tolerance
);
const noDocumentOverflow = measurement => measurement.document.scrollWidth <= measurement.viewport.clientWidth + tolerance;
const noVisibleGridOverflow = measurement => Boolean(
  measurement.elements.center?.style &&
  !measurement.derived.horizontal_scrollbar_rendered &&
  measurement.derived.grid_inside_center &&
  !(
    measurement.elements.center.scroll.scrollWidth > measurement.elements.center.scroll.clientWidth + tolerance &&
    ['auto', 'scroll'].includes(measurement.elements.center.style.overflowX)
  )
);
const boundedInnerAxis = measurement => {
  const surface = measurement.elements.surface?.rect;
  const inner = measurement.elements.inner?.rect;
  const rootFontSize = measurement.document.rootFontSize;
  if (!surface || !inner || !rootFontSize) return false;
  return inner.width <= surface.width + tolerance &&
    inner.width <= 70 * rootFontSize + tolerance &&
    Math.abs((inner.left + inner.right - surface.left - surface.right) / 2) <= tolerance;
};
const staticSurface = measurement => {
  const style = measurement.elements.surface?.style;
  return Boolean(style && style.position === 'static' && style.left === 'auto' && style.right === 'auto');
};
const hostOwned = measurement => Boolean(
  inside(measurement.elements.host, measurement.elements.surface) &&
  Math.abs(measurement.elements.host.rect.width - measurement.elements.surface.rect.width) <= tolerance &&
  staticSurface(measurement)
);
const fullWidthHostEstablished = measurement => Boolean(
  measurement.elements.host?.rect &&
  measurement.elements.host.rect.width >= measurement.viewport.clientWidth - 8 &&
  measurement.elements.host.rect.left >= -8 &&
  measurement.elements.host.rect.right <= measurement.viewport.clientWidth + 8
);
const constrainedHostEstablished = measurement => Boolean(
  measurement.elements.host?.rect &&
  (measurement.viewport.clientWidth <= 500
    ? measurement.elements.host.rect.width <= measurement.viewport.clientWidth + tolerance
    : measurement.elements.host.rect.width < measurement.viewport.clientWidth - 100)
);
const oneColumn = measurement => Boolean(
  measurement.derived.two_cards_vertical &&
  measurement.elements.first?.rect &&
  measurement.elements.second?.rect &&
  measurement.elements.grid?.rect &&
  measurement.elements.first.rect.width <= measurement.elements.grid.rect.width + tolerance &&
  measurement.elements.second.rect.width <= measurement.elements.grid.rect.width + tolerance
);

async function capture(page, candidate, host, direction, viewport, textScale = 100) {
  const id = scenarioId(candidate.id, host, direction, viewport.id, textScale);
  try {
    await prepare(page, candidate, host, direction, viewport, textScale);
    const measurement = await measure(page, {
      id,
      candidate: candidate.id,
      context: host,
      direction,
      viewport_id: viewport.id,
      text_scale_percent: textScale,
    });
    if (host === 'CONSTRAINED_HOST' && direction === 'rtl' && viewport.id === 'desktop_1440' && textScale === 100) {
      await page.screenshot({
        path: path.join(artifactDir, `inbox-width-rtl-${candidate.id.toLowerCase()}-constrained-rtl-1440.png`),
        fullPage: true,
      });
    }
    return measurement;
  } catch (error) {
    return {
      id,
      candidate: candidate.id,
      context: host,
      direction,
      viewport_id: viewport.id,
      text_scale_percent: textScale,
      established: false,
      missing_required_measurements: ['scenario_execution'],
      error: String(error?.stack || error),
    };
  }
}

async function behaviorProbe(page, candidate) {
  const output = { candidate: candidate.id, status: 'NOT_PROVEN', checks: {} };
  try {
    await prepare(page, candidate, 'FULL_WIDTH_HOST', 'rtl', viewports[0]);
    const rows = '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row';
    const initial = await page.locator(rows).count();
    const first = page.locator(rows).first();

    output.checks.card_mode =
      (await page.locator('.gpp-inbox-card__readiness--ready').count()) >= initial &&
      (await page.locator('.gpp-inbox-card__readiness--unready').count()) === 0;
    output.checks.row_identity = Boolean(await first.getAttribute('row-id'));
    output.checks.navigation = Boolean(
      (await first.locator('.gflow-inbox__entry-cell-link').first().getAttribute('href'))?.match(/(?:lid|id)=/)
    );

    const search = page.locator('[data-js="gflow-inbox-search"]');
    await search.fill('00:24:00');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 1, rows, { timeout: 15000 });
    output.checks.search = true;
    await search.fill('');
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 20, rows, { timeout: 15000 });

    const header = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="gpp_case_card"]').first();
    await header.click();
    const sort1 = await header.getAttribute('aria-sort');
    await header.click();
    const sort2 = await header.getAttribute('aria-sort');
    output.checks.sorting = Boolean(sort1 && sort2 && sort1 !== sort2);

    const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
    await next.click();
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 5, rows, { timeout: 15000 });
    output.checks.pagination = true;
    output.status = Object.values(output.checks).every(Boolean) ? 'PASS' : 'FAIL';
  } catch (error) {
    output.error = String(error?.stack || error);
  }
  return output;
}

const gateResult = (status, evidence, detail = {}) => ({ status, evidence, detail });

function evaluateGates(candidateId, measurements, behavior) {
  const standard = measurements.filter(item => item.candidate === candidateId && item.text_scale_percent === 100);
  const all = measurements.filter(item => item.candidate === candidateId);
  const missing = all.filter(item => !item.established);
  const rtl = standard.filter(item => item.direction === 'rtl');
  const ltr = standard.filter(item => item.direction === 'ltr');
  const full = standard.filter(item => item.context === 'FULL_WIDTH_HOST');
  const constrained = standard.filter(item => item.context === 'CONSTRAINED_HOST');
  const mobile = all.filter(item => item.viewport_id === 'mobile_390');
  const status = (missingEvidence, failures) => missingEvidence.length ? 'NOT_PROVEN' : failures.length ? 'FAIL' : 'PASS';
  const ids = list => list.map(item => item.id);

  const g1Failures = all.filter(item => item.established && !noDocumentOverflow(item));
  const g2Failures = all.filter(item => item.established && !noVisibleGridOverflow(item));
  const g3Failures = rtl.filter(item => item.established && !inViewport(item));
  const g4Failures = ltr.filter(item => item.established && (!noDocumentOverflow(item) || !noVisibleGridOverflow(item) || !inViewport(item)));
  const g5ContextMissing = full.filter(item => item.established && !fullWidthHostEstablished(item));
  const g5Failures = full.filter(item => item.established && fullWidthHostEstablished(item) && !hostOwned(item));
  const g6Failures = all.filter(item => item.established && !boundedInnerAxis(item));
  const g7ContextMissing = constrained.filter(item => item.established && !constrainedHostEstablished(item));
  const g7Failures = constrained.filter(item => item.established && constrainedHostEstablished(item) && !hostOwned(item));
  const g8Failures = mobile.filter(item => item.established && (!noDocumentOverflow(item) || !inViewport(item) || !oneColumn(item)));
  const contextMissing = [
    ...standard.filter(item => item.context === 'FULL_WIDTH_HOST' && item.viewport_id === 'desktop_1440' && item.established && !fullWidthHostEstablished(item)),
    ...standard.filter(item => item.context === 'CONSTRAINED_HOST' && item.viewport_id === 'desktop_1440' && item.established && !constrainedHostEstablished(item)),
  ];

  return {
    G1: gateResult(status(missing, g1Failures), ids(all), { failures: ids(g1Failures) }),
    G2: gateResult(status(missing, g2Failures), ids(all), { failures: ids(g2Failures) }),
    G3: gateResult(status(rtl.filter(item => !item.established), g3Failures), ids(rtl), { failures: ids(g3Failures) }),
    G4: gateResult(status(ltr.filter(item => !item.established), g4Failures), ids(ltr), { failures: ids(g4Failures) }),
    G5: gateResult(status([...full.filter(item => !item.established), ...g5ContextMissing], g5Failures), ids(full), {
      failures: ids(g5Failures),
      context_not_proven: ids(g5ContextMissing),
    }),
    G6: gateResult(status(missing, g6Failures), ids(all), { failures: ids(g6Failures) }),
    G7: gateResult(status([...constrained.filter(item => !item.established), ...g7ContextMissing], g7Failures), ids(constrained), {
      failures: ids(g7Failures),
      context_not_proven: ids(g7ContextMissing),
    }),
    G8: gateResult(status(mobile.filter(item => !item.established), g8Failures), ids(mobile), { failures: ids(g8Failures) }),
    G9: gateResult(behavior.status, [`behavior:${candidateId}`], behavior.checks),
    G10: gateResult(
      missing.length || contextMissing.length || behavior.status === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'PASS',
      [...ids(all), `behavior:${candidateId}`],
      { missing: ids(missing), context_not_proven: ids(contextMissing), behavior: behavior.status },
    ),
  };
}

const output = {
  schema: 'gpp.comparative_repair_qualification.v1',
  repository_sha: repositorySha,
  authorized_baseline_sha: baselineSha,
  runtime: {
    wordpress: runtime.wordpress,
    php: runtime.php,
    database: runtime.database,
    gravity_forms: runtime.plugins?.gravity_forms,
    gravity_flow: runtime.plugins?.gravity_flow,
    node: { version: process.version },
    playwright: null,
    chromium: null,
  },
  theme: {
    expected: { template: 'twentytwentyfive', stylesheet: 'twentytwentyfive' },
    observed: runtime.theme,
  },
  fixture,
  objective: 'Bounded comparative qualification of Inbox width / RTL / host geometry without production repair.',
  non_goals: [
    'Production repair',
    'Owner preference selection',
    'Production equivalence',
    'Generic benchmark framework',
    'Gravity Flow behavior replacement',
  ],
  contexts,
  directions,
  viewports: [
    ...viewports,
    { id: 'mobile_390_text_200', width: 390, height: 844, direction: 'rtl', context: 'FULL_WIDTH_HOST', text_scale_percent: 200 },
  ],
  candidates: candidates.map(({ css, ...candidate }) => candidate),
  hard_gates: hardGates,
  measurements: [],
  behavior_probes: {},
  per_candidate_gate_results: {},
  control_reproduction: { status: 'NOT_PROVEN', reproduced: null },
  surviving_candidates: [],
  outcome: 'NOT_PROVEN',
  production_equivalence: 'NOT_PROVEN',
};

let browser;
try {
  if (runtime.theme?.template !== 'twentytwentyfive' || runtime.theme?.stylesheet !== 'twentytwentyfive') {
    throw new Error(`Theme identity mismatch: ${JSON.stringify(runtime.theme)}`);
  }
  if (!browserUser || !browserPassword) {
    throw new Error('Comparative browser credentials were not provisioned by WU21.');
  }

  output.runtime.playwright = {
    version: JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules/playwright/package.json'), 'utf8')).version,
  };
  browser = await chromium.launch({ headless: true });
  output.runtime.chromium = { version: browser.version() };
  const page = await browser.newPage();

  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', browserUser);
  await page.fill('#user_pass', browserPassword);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  // CONTROL is frozen first and always executes before any candidate.
  for (const candidate of candidates) {
    for (const host of contexts) {
      for (const direction of directions) {
        for (const viewport of viewports) {
          output.measurements.push(await capture(page, candidate, host, direction, viewport));
        }
      }
    }
    output.measurements.push(await capture(page, candidate, 'FULL_WIDTH_HOST', 'rtl', viewports[1], 200));
    output.behavior_probes[candidate.id] = await behaviorProbe(page, candidate);
  }

  for (const candidate of candidates) {
    output.per_candidate_gate_results[candidate.id] = evaluateGates(
      candidate.id,
      output.measurements,
      output.behavior_probes[candidate.id],
    );
  }

  const control = output.measurements.find(item =>
    item.id === scenarioId('CONTROL', 'CONSTRAINED_HOST', 'rtl', 'desktop_1440')
  );
  if (control?.established) {
    const parentEscaped = !hostOwned(control);
    const physicalViewportFailure = !inViewport(control);
    const documentOverflow = !noDocumentOverflow(control);
    const reproduced = parentEscaped || physicalViewportFailure || documentOverflow;
    output.control_reproduction = {
      status: reproduced ? 'REPRODUCED' : 'NOT_REPRODUCED',
      reproduced,
      evidence: control.id,
      observed: {
        constrained_parent_escaped: parentEscaped,
        rtl_physical_viewport_failure: physicalViewportFailure,
        document_horizontal_overflow: documentOverflow,
        host_rect: control.elements.host?.rect,
        surface_rect: control.elements.surface?.rect,
        surface_style: control.elements.surface?.style,
        document_overflow_px: control.derived?.document_overflow_px,
      },
    };
  }

  output.surviving_candidates = candidates
    .filter(candidate =>
      candidate.authority_compatible_candidate &&
      Object.values(output.per_candidate_gate_results[candidate.id]).every(gate => gate.status === 'PASS')
    )
    .map(candidate => candidate.id);

  output.outcome = output.surviving_candidates.length === 1
    ? 'METHOD_CLOSED_IN_REPRODUCIBLE_SIMULATION'
    : output.surviving_candidates.length > 1
      ? 'OWNER_GATE_REQUIRED'
      : 'NOT_PROVEN';
} catch (error) {
  output.fatal = String(error?.stack || error);
  output.outcome = 'NOT_PROVEN';
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(
    path.join(artifactDir, 'inbox-width-rtl-comparative.json'),
    JSON.stringify(output, null, 2) + '\n',
  );
  console.log(`GPP_RP_WU01_OUTCOME=${output.outcome}`);
  console.log(`GPP_RP_WU01_CONTROL_REPRODUCTION=${output.control_reproduction.status}`);
  console.log(`GPP_RP_WU01_SURVIVORS=${output.surviving_candidates.join(',') || 'NONE'}`);
}

if (output.fatal) throw new Error(output.fatal);
