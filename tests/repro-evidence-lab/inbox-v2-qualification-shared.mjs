import { spawnSync } from 'node:child_process';

export const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
export const artifactDir = process.env.WU21_ARTIFACT_DIR;
export const wpPath = process.env.WU21_WP_PATH;
export const wpCli = process.env.WU21_WP_CLI;
export const repoRoot = process.env.GITHUB_WORKSPACE;
export const inboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;

if (!artifactDir || !wpPath || !wpCli || !repoRoot) throw new Error('WU21 qualification environment is incomplete.');

export function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`wp eval failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
export function jsonEval(code) { return JSON.parse(wpEval(code)); }
export function bounded(value, max = 4000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
export async function waitForGrid(page) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
}
export async function visibleRows(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').evaluateAll(rows => rows.map(row => ({ id: row.getAttribute('row-id'), text: row.innerText })));
}
async function isDisabled(locator) {
  return locator.evaluate(el => el.classList.contains('ag-disabled') || el.getAttribute('aria-disabled') === 'true');
}
export async function pagerState(page) {
  const panel = page.locator('[data-js="gflow-inbox"] .ag-paging-panel');
  return {
    count: await panel.count(),
    text: bounded(await panel.innerText().catch(() => '')),
    current: await panel.locator('[ref="lbCurrent"]').innerText().catch(() => null),
    total_pages: await panel.locator('[ref="lbTotal"]').innerText().catch(() => null),
    previous_disabled: await isDisabled(panel.locator('[ref="btPrevious"]')).catch(() => null),
    next_disabled: await isDisabled(panel.locator('[ref="btNext"]')).catch(() => null),
  };
}
export async function activeElement(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return {
      tag: el.tagName, id: el.id || null, class: el.className || null,
      ref: el.getAttribute?.('ref') || null,
      col_id: el.getAttribute?.('col-id') || el.closest?.('[col-id]')?.getAttribute('col-id') || null,
      href: el.getAttribute?.('href') || null,
      text: (el.textContent || '').trim().slice(0, 160),
    };
  });
}
export async function gridScrollState(page) {
  return page.evaluate(() => {
    const target = document.querySelector('[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport') || document.querySelector('[data-js="gflow-inbox"] .ag-center-cols-viewport');
    return target ? { scrollLeft: target.scrollLeft, scrollWidth: target.scrollWidth, clientWidth: target.clientWidth } : null;
  });
}
export function attachPolling(page) {
  const polling = [];
  page.on('response', async response => {
    if (!response.url().includes('/wp-json/gravityflow/internal/inbox/changes')) return;
    let body = '';
    try { body = await response.text(); } catch {}
    polling.push({ status: response.status(), body: bounded(body, 12000), observed_at: new Date().toISOString() });
  });
  return polling;
}
export async function waitForPollingTransaction(page, polling, startIndex, action, entryId, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = polling.slice(startIndex).find(p => p.body.includes(action) && p.body.includes(String(entryId)));
    if (found) return found;
    await page.waitForTimeout(500);
  }
  return null;
}
