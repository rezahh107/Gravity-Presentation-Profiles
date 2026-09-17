import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const repoRoot = process.env.GITHUB_WORKSPACE;
const inboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;
const referencePath = path.join(repoRoot, 'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html');

if (!artifactDir || !wpCli || !wpPath || !repoRoot) {
  throw new Error('PR33 baseline requires the admitted WU21 runtime environment.');
}
if (!fs.existsSync(referencePath)) {
  throw new Error('PR33 canonical Owner A/B fixture is unavailable.');
}

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.frontend_inbox_url) throw new Error('PR33 frontend Inbox fixture URL is unavailable.');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const observations = {};

function rounded(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

async function waitForInbox(expectedRows = null) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length > 0, null, { timeout: 30000 });
  if (expectedRows !== null) {
    await page.waitForFunction(count => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length === count, expectedRows, { timeout: 30000 });
  }
}

async function measureActual(label) {
  return page.evaluate(labelText => {
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return {
        x: Math.round(r.x * 100) / 100,
        y: Math.round(r.y * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    };
    const style = element => {
      if (!element) return null;
      const c = getComputedStyle(element);
      return {
        display: c.display,
        position: c.position,
        boxSizing: c.boxSizing,
        width: c.width,
        maxWidth: c.maxWidth,
        minWidth: c.minWidth,
        marginInlineStart: c.marginInlineStart,
        marginInlineEnd: c.marginInlineEnd,
        paddingTop: c.paddingTop,
        paddingRight: c.paddingRight,
        paddingBottom: c.paddingBottom,
        paddingLeft: c.paddingLeft,
        gap: c.gap,
        rowGap: c.rowGap,
        columnGap: c.columnGap,
        gridTemplateColumns: c.gridTemplateColumns,
        backgroundColor: c.backgroundColor,
        borderRadius: c.borderRadius,
        borderColor: c.borderColor,
        boxShadow: c.boxShadow,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
        fontWeight: c.fontWeight,
        lineHeight: c.lineHeight,
        overflowX: c.overflowX,
        transform: c.transform,
      };
    };
    const describe = element => {
      if (!element) return null;
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: [...element.classList].slice(0, 10),
        rect: rect(element),
        style: style(element),
      };
    };
    const inbox = document.querySelector('[data-js="gflow-inbox"]');
    const ancestors = [];
    let current = inbox?.parentElement || null;
    while (current && ancestors.length < 8) {
      ancestors.push(describe(current));
      current = current.parentElement;
    }
    const rows = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row')];
    const cards = rows.map(row => row.querySelector('.gpp-inbox-card')).filter(Boolean);
    const firstCard = cards[0] || null;
    const secondCard = cards[1] || null;
    const search = document.querySelector('[data-js="gflow-inbox-search"]');
    const firstDetail = firstCard?.querySelector('.gpp-inbox-card__detail') || null;
    return {
      label: labelText,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      htmlFontSize: getComputedStyle(document.documentElement).fontSize,
      documentOverflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      body: describe(document.body),
      inbox: describe(inbox),
      inboxAncestors: ancestors,
      agRoot: describe(document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper')),
      grid: describe(document.querySelector('[data-js="gflow-inbox"] .ag-center-cols-container')),
      card1: describe(firstCard),
      card2: describe(secondCard),
      cardDelta: firstCard && secondCard ? {
        width: Math.round((firstCard.getBoundingClientRect().width - secondCard.getBoundingClientRect().width) * 100) / 100,
        y: Math.round((firstCard.getBoundingClientRect().y - secondCard.getBoundingClientRect().y) * 100) / 100,
        inlineGap: Math.round(Math.abs(secondCard.getBoundingClientRect().x - firstCard.getBoundingClientRect().x) - firstCard.getBoundingClientRect().width),
      } : null,
      photo: describe(firstCard?.querySelector('.gpp-inbox-card__photo-image, .gpp-inbox-card__photo-fallback')),
      identity: describe(firstCard?.querySelector('.gpp-inbox-card__identity')),
      name: describe(firstCard?.querySelector('.gpp-inbox-card__name')),
      identifier: describe(firstCard?.querySelector('.gpp-inbox-card__meta')),
      details: describe(firstCard?.querySelector('.gpp-inbox-card__details')),
      detail: describe(firstDetail),
      detailLabel: describe(firstDetail?.querySelector('dt')),
      detailValue: describe(firstDetail?.querySelector('dd')),
      openAction: describe(firstCard?.querySelector('.gpp-inbox-card__open')),
      search: describe(search),
      toolbar: describe(search?.parentElement || null),
    };
  }, label);
}

async function captureActual({ label, url, width, height = 1100, zoom200 = false, expectedRows = null }) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitForInbox(expectedRows);
  if (zoom200) {
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.waitForTimeout(250);
  }
  const measurement = await measureActual(label);
  observations[label] = measurement;
  await page.screenshot({ path: path.join(artifactDir, `pr33-${label}.png`), fullPage: true });
  return measurement;
}

async function measureReference(label, surface, width, height = 1100) {
  await page.setViewportSize({ width, height });
  await page.goto(pathToFileURL(referencePath).href, { waitUntil: 'load' });
  await page.locator(`[data-surface="${surface}"]`).click();
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  const measurement = await page.evaluate(labelText => {
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const style = element => {
      if (!element) return null;
      const c = getComputedStyle(element);
      return {
        display: c.display,
        gap: c.gap,
        gridTemplateColumns: c.gridTemplateColumns,
        paddingTop: c.paddingTop,
        paddingRight: c.paddingRight,
        paddingBottom: c.paddingBottom,
        paddingLeft: c.paddingLeft,
        marginBottom: c.marginBottom,
        backgroundColor: c.backgroundColor,
        borderRadius: c.borderRadius,
        borderColor: c.borderColor,
        boxShadow: c.boxShadow,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
        fontWeight: c.fontWeight,
        lineHeight: c.lineHeight,
        minHeight: c.minHeight,
      };
    };
    const describe = selector => {
      const element = document.querySelector(selector);
      return element ? { selector, rect: rect(element), style: style(element) } : null;
    };
    const cards = [...document.querySelectorAll('#inbox-view .case-card')];
    return {
      label: labelText,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      stage: describe('.stage'),
      inboxView: describe('#inbox-view'),
      pageHeading: describe('#inbox-view .page-heading'),
      searchRow: describe('#inbox-view .search-row'),
      search: describe('#inbox-view input[type="search"]'),
      grid: describe('#inbox-view .case-grid'),
      card1: cards[0] ? { rect: rect(cards[0]), style: style(cards[0]) } : null,
      card2: cards[1] ? { rect: rect(cards[1]), style: style(cards[1]) } : null,
      photo: describe('#inbox-view .avatar'),
      identity: describe('#inbox-view .identity-mini'),
      name: describe('#inbox-view .identity-mini h2'),
      identifier: describe('#inbox-view .identity-mini .idline'),
      meta: describe('#inbox-view .card-meta'),
      detailRow: describe('#inbox-view .card-meta > div'),
      detailLabel: describe('#inbox-view .card-meta dt'),
      detailValue: describe('#inbox-view .card-meta dd'),
      action: describe('#inbox-view .card-footer .btn'),
    };
  }, label);
  observations[label] = measurement;
  await page.screenshot({ path: path.join(artifactDir, `pr33-${label}.png`), fullPage: true });
  return measurement;
}

try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

  await captureActual({ label: 'baseline-admin-1440', url: inboxUrl, width: 1440, height: 1100, expectedRows: 20 });
  await captureActual({ label: 'baseline-admin-414', url: inboxUrl, width: 414, height: 1100, expectedRows: 20 });
  await captureActual({ label: 'baseline-admin-375', url: inboxUrl, width: 375, height: 1100, expectedRows: 20 });
  await captureActual({ label: 'baseline-admin-320', url: inboxUrl, width: 320, height: 1100, expectedRows: 20 });
  await captureActual({ label: 'baseline-admin-414-text-200', url: inboxUrl, width: 414, height: 1200, zoom200: true, expectedRows: 20 });
  await captureActual({ label: 'baseline-frontend-2200', url: manifest.frontend_inbox_url, width: 2200, height: 1200 });

  await measureReference('reference-A-1440', 'inbox-desktop', 1440, 1100);
  await measureReference('reference-B-414', 'inbox-mobile', 414, 1100);

  const resultPath = path.join(artifactDir, 'pr33-visual-baseline.json');
  fs.writeFileSync(resultPath, JSON.stringify({
    repository_sha: process.env.GPP_WU21_REPOSITORY_SHA || null,
    reference_fixture: path.relative(repoRoot, referencePath),
    observations,
  }, null, 2) + '\n');
  process.stdout.write(`PR33_BASELINE_CAPTURE_PASS=${resultPath}\n`);
} finally {
  await browser.close();
}
