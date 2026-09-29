import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, inboxUrl, assertEnv, login, waitForGrid, focusVisible, openByEnter, scrollState } from './inbox-visual-design-v2-browser-lib.mjs';
import { evaluateQ2Qualification } from './inbox-visual-design-v2-contract-evaluation.mjs';

assertEnv();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function scrollSnapshot(locator) {
  return locator.evaluate(el => ({
    scroll_top: el.scrollTop,
    scroll_left: el.scrollLeft,
    client_width: el.clientWidth,
    scroll_width: el.scrollWidth,
    client_height: el.clientHeight,
    scroll_height: el.scrollHeight,
  }));
}

async function capture(width, height, label) {
  await page.setViewportSize({ width, height });
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);
  const root = page.locator('[data-js="gflow-inbox"] .ag-root-wrapper');
  const agRtl = await root.evaluate(el => el.classList.contains('ag-rtl'));
  const rootDirection = await root.evaluate(el => getComputedStyle(el).direction);
  const rootBounds = await root.evaluate(el => {
    const box = el.getBoundingClientRect();
    return { left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
  });
  const columns = await page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { col_id: node.getAttribute('col-id'), text: (node.textContent || '').trim().replace(/\s+/g, ' '), x: Math.round(box.x), width: Math.round(box.width), right: Math.round(box.right) };
  }).sort((a, b) => a.x - b.x));
  const cells = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().locator('.ag-cell').evaluateAll(nodes => nodes.slice(0, 6).map(node => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return { col_id: node.getAttribute('col-id'), text: (node.textContent || '').trim().slice(0, 100), direction: style.direction, text_align: style.textAlign, x: Math.round(box.x), width: Math.round(box.width), right: Math.round(box.right) };
  }));
  const persianTextSamples = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-cell').evaluateAll(nodes => nodes.map(node => {
    const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
    if (!/[\u0600-\u06FF]/u.test(text)) return null;
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return { col_id: node.getAttribute('col-id'), text: text.slice(0, 160), direction: style.direction, text_align: style.textAlign, x: Math.round(box.x), width: Math.round(box.width), right: Math.round(box.right) };
  }).filter(Boolean).slice(0, 20));
  const pager = await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').evaluate(el => {
    const style = getComputedStyle(el);
    return {
      direction: style.direction,
      text_align: style.textAlign,
      children: [...el.children].map(child => ({ ref: child.getAttribute('ref'), text: (child.textContent || '').trim().replace(/\s+/g, ' '), x: Math.round(child.getBoundingClientRect().x) })).sort((a, b) => a.x - b.x),
    };
  });

  const bodyBefore = await scrollState(page);
  const centerViewport = page.locator('[data-js="gflow-inbox"] .ag-center-cols-viewport').first();
  const centerBefore = await scrollSnapshot(centerViewport);
  if (centerBefore.scroll_width > centerBefore.client_width) {
    await centerViewport.evaluate(el => { el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2); });
  } else if (bodyBefore.scroll_width > bodyBefore.client_width) {
    await page.locator('[data-js="gflow-inbox"] .ag-body-viewport').first().evaluate(el => { el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2); });
  }
  const bodyAfter = await scrollState(page);
  const centerAfter = await scrollSnapshot(centerViewport);
  const horizontalOverflow = centerBefore.scroll_width > centerBefore.client_width || bodyBefore.scroll_width > bodyBefore.client_width;
  const horizontalMoved = !horizontalOverflow
    || centerAfter.scroll_left !== centerBefore.scroll_left
    || bodyAfter.scroll_left !== bodyBefore.scroll_left;
  const columnsOutsideRoot = columns.filter(column => column.x < rootBounds.left || column.right > rootBounds.right).map(column => column.col_id);

  await page.screenshot({ path: path.join(artifactDir, `inbox-visual-design-v2-q2-${label}.png`), fullPage: true });
  const navigation = await openByEnter(page, page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first());
  const observationsValid = columns.length > 0
    && cells.length > 0
    && pager.children.length > 0
    && Number.isFinite(centerBefore.client_width)
    && Number.isFinite(centerBefore.scroll_width)
    && centerBefore.scroll_width >= centerBefore.client_width
    && Number.isFinite(bodyBefore.client_width)
    && Number.isFinite(bodyBefore.scroll_width);
  return {
    viewport: { width, height },
    ag_rtl: agRtl,
    root_direction: rootDirection,
    root_bounds: rootBounds,
    visual_column_order: columns,
    representative_cells: cells,
    persian_text_samples: persianTextSamples,
    pager,
    horizontal_scroll: {
      body_before: bodyBefore,
      body_after: bodyAfter,
      center_before: centerBefore,
      center_after: centerAfter,
      overflow_present: horizontalOverflow,
      moved_when_available: horizontalMoved,
      columns_outside_root: columnsOutsideRoot,
    },
    navigation,
    observations_valid: observationsValid,
    usable: observationsValid && horizontalMoved && focusVisible(navigation.focus) && /view=entry/.test(navigation.url),
  };
}

let out = { contract: 'Q2_RTL_NATIVE_BEHAVIOR', execution_status: 'CAPTURED' };
let failed = false;
try {
  await login(page);
  const desktop = await capture(1440, 900, '1440');
  const mobile = await capture(360, 800, '360');
  const evaluation = evaluateQ2Qualification(desktop, mobile);
  out = {
    ...out,
    status: evaluation.status,
    evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    flags: {
      ...evaluation.required_evaluation_flags,
      ...evaluation.usability_flags,
    },
    contract_evaluation: evaluation,
    narrower_observation: evaluation.narrower_observation,
    enable_rtl_tested: false,
    enable_rtl_reason: evaluation.status === 'NOT_PROVEN'
      ? 'The canonical Q2 Persian-layout requirement was not fully evaluable in this fixture. The lab records the narrower native direction/pager/scroll/focus observation instead of forcing enableRtl or emitting PASS.'
      : 'No selected design dependency required enableRtl. Native behavior was evaluated against the complete canonical Q2 predicate at both required viewports.',
    desktop_1440: desktop,
    mobile_360: mobile,
  };
} catch (error) {
  failed = true;
  out = { ...out, execution_status: 'ERROR', error: String(error?.stack || error).slice(0, 12000) };
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-q2-error.png'), fullPage: true }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q2.json'), JSON.stringify(out, null, 2) + '\n');
  await browser.close();
}
if (failed) process.exit(1);
