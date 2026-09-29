import { spawnSync } from 'node:child_process';
import path from 'node:path';

export const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
export const artifactDir = process.env.WU21_ARTIFACT_DIR;
export const wpPath = process.env.WU21_WP_PATH;
export const wpCli = process.env.WU21_WP_CLI;
export const repoRoot = process.env.GITHUB_WORKSPACE;
export const inboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;

export function assertEnv() {
  if (!artifactDir || !wpPath || !wpCli || !repoRoot || !process.env.IVD2_ADMIN_USER || !process.env.IVD2_ADMIN_PASSWORD) {
    throw new Error('Incomplete Inbox V2 qualification environment.');
  }
}

export function control(action, extra = {}) {
  const env = { ...process.env, IVD2_CONTROL: action, ...extra };
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/inbox-visual-design-v2-control.php')], { env, encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`Control ${action} failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

export async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.IVD2_ADMIN_USER);
  await page.fill('#user_pass', process.env.IVD2_ADMIN_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}

export async function waitForGrid(page) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
}

export async function rowIds(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').evaluateAll(rows => rows.map(row => Number(row.getAttribute('row-id'))));
}

export async function waitForRow(page, id, present = true, timeout = 45000) {
  await page.waitForFunction(({ id, present }) => Boolean(document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${CSS.escape(String(id))}"]`)) === present, { id, present }, { timeout });
}

export async function nativeSearch(page, text) {
  const input = page.locator('[data-js="gflow-inbox-search"]');
  await input.fill(text);
  await input.dispatchEvent('keyup');
  await page.waitForTimeout(400);
  return rowIds(page);
}

export async function focusInfo(locator) {
  await locator.focus();
  return locator.evaluate(el => {
    const style = getComputedStyle(el);
    return { active: document.activeElement === el, outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow, href: el.getAttribute('href') };
  });
}

export function focusVisible(info) {
  return info.active && ((info.outline !== 'none' && Number.parseFloat(info.width) > 0) || (info.shadow && info.shadow !== 'none'));
}

export async function openByEnter(page, link) {
  const href = await link.getAttribute('href');
  const focus = await focusInfo(link);
  await Promise.all([page.waitForURL(/page=gravityflow-inbox.*view=entry/, { timeout: 30000 }), page.keyboard.press('Enter')]);
  return { href, focus, url: page.url() };
}

export async function pagerState(page) {
  const panel = page.locator('[data-js="gflow-inbox"] .ag-paging-panel');
  return {
    count: await panel.count(),
    text: (await panel.first().innerText()).trim(),
    current: (await page.locator('[data-js="gflow-inbox"] [ref="lbCurrent"]').first().innerText()).trim(),
    previous_disabled: await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').first().evaluate(el => el.classList.contains('ag-disabled')),
    next_disabled: await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').first().evaluate(el => el.classList.contains('ag-disabled')),
  };
}

export async function scrollState(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-body-viewport').first().evaluate(el => ({ scroll_top: el.scrollTop, scroll_left: el.scrollLeft, client_width: el.clientWidth, scroll_width: el.scrollWidth, client_height: el.clientHeight, scroll_height: el.scrollHeight }));
}

export async function activeElementState(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const row = el.closest?.('.ag-row');
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const href = el.getAttribute?.('href') || null;
    const outlineVisible = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    const shadowVisible = Boolean(style.boxShadow && style.boxShadow !== 'none');
    return {
      tag: el.tagName,
      row_id: row ? row.getAttribute('row-id') : null,
      href,
      text: (el.textContent || '').trim().slice(0, 120),
      native_entry_link: el.matches?.('.gflow-inbox__entry-cell-link') === true && typeof href === 'string' && href.includes('view=entry'),
      visible: box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      focus_indicator_visible: document.activeElement === el && (outlineVisible || shadowVisible),
    };
  });
}
