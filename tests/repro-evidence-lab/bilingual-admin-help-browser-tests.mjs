import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.WU21_BASE_URL;
const wp = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const evidence = process.env.WU21_ARTIFACT_DIR;
if (![base, wp, wpCli, evidence].every(Boolean)) {
  throw new Error('Bilingual admin acceptance requires the existing pinned WU21 WordPress environment.');
}

function wpEval(code) {
  return execFileSync('php', [wpCli, '--path=' + wp, 'eval', code], {
    encoding: 'utf8',
    env: process.env,
  }).trim();
}
function setUserLocale(locale) {
  const readback = wpEval(
    '$u=get_user_by("login","bootstrap_admin");' +
    'if (!$u) { throw new Exception("Missing WU21 admin"); }' +
    'update_user_meta($u->ID, "locale", ' + JSON.stringify(locale) + ');' +
    'echo get_user_locale($u);'
  );
  if (readback !== locale) throw new Error('Native WordPress locale readback differs from requested ' + locale + ': ' + readback);
}

const settingsUrl = base + '/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles';
const report = { id: 'GPP-BILINGUAL-ADMIN-HELP-001', status: 'FAIL', locales: {}, browser: 'chromium' };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  setUserLocale('en_US');
  await page.goto(base + '/wp-login.php', { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  for (const locale of ['en_US', 'fa_IR']) {
    setUserLocale(locale);
    await page.goto(settingsUrl, { waitUntil: 'networkidle' });
    const guide = page.locator('.gpp-in-plugin-help');
    await guide.waitFor({ state: 'visible', timeout: 30000 });
    if (await guide.getAttribute('data-gpp-help-locale') !== locale) {
      throw new Error('Wrong Help language for native user locale ' + locale);
    }

    const fa = locale === 'fa_IR';
    const direction = fa ? 'rtl' : 'ltr';
    if (await guide.getAttribute('dir') !== direction) {
      throw new Error('Help direction mismatch for ' + locale);
    }
    if (await page.getByText(fa ? 'بسته‌های پروفایل اعلانی' : 'Declarative Profile Packages', { exact: true }).count() < 1) {
      throw new Error('Native gettext did not translate the GPP settings heading for ' + locale);
    }
    if (await page.getByText(fa ? 'راهنمای محصول' : 'Product Guide', { exact: true }).count() < 1) {
      throw new Error('Native gettext did not translate GPP Help heading for ' + locale);
    }
    const topics = guide.locator('details.gpp-help-topic');
    const count = await topics.count();
    if (count !== 17) throw new Error('Missing shipped feature topics for ' + locale + ': ' + count);
    const summary = topics.first().locator('summary');
    const targetId = await summary.getAttribute('id');
    if (!targetId || await guide.locator('nav a[href="#' + targetId + '"]').count() !== 1) {
      throw new Error('Help navigation target is not reachable for ' + locale);
    }
    await summary.focus();
    await page.keyboard.press('Enter');
    if (!(await topics.first().evaluate(el => el.open))) throw new Error('Help keyboard disclosure failed for ' + locale);
    if (await guide.locator('code[dir="ltr"]').count() < 1) {
      throw new Error('Technical identifiers are not directionally isolated for ' + locale);
    }
    if (await guide.locator('select[data-gpp-locale-toggle]').count() !== 0) {
      throw new Error('Unexpected GPP-owned language selector');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const geometry = await guide.evaluate(el => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      clientHeight: el.clientHeight,
    }));
    if (geometry.scrollWidth > geometry.clientWidth + 2) {
      throw new Error('Help causes horizontal overflow at 390px in ' + locale + ': ' + JSON.stringify(geometry));
    }
    report.locales[locale] = { gettext: true, topicCount: count, direction, keyboard: true, viewport: 390, geometry };
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  report.status = 'PASS';
} catch (error) {
  report.error = String(error?.stack || error);
  throw error;
} finally {
  try { setUserLocale('en_US'); } catch (error) { report.restore_error = String(error); report.status = 'FAIL'; }
  writeFileSync(path.join(evidence, 'bilingual-admin-help-browser-results.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.status !== 'PASS') throw new Error('Bilingual acceptance could not restore the initial native WordPress language state');
console.log('GPP_BILINGUAL_ADMIN_HELP_BROWSER_PASS');
