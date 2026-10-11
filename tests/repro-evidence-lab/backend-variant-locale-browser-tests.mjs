import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

// Reuse the existing WU21 pinned WordPress/GF/Flow lab. No extra installation.
const base = process.env.WU21_BASE_URL;
const wp = process.env.WU21_WP_PATH;
const cli = process.env.WU21_WP_CLI;
const artifacts = process.env.WU21_ARTIFACT_DIR;
if (![base, wp, cli, artifacts].every(Boolean)) {
  throw new Error('Existing WU21 pinned WordPress environment is required.');
}
const domain = 'gpp_visual_package_lifecycle_v1';
const settings = base + '/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles';
const report = { scenario: 'GPP_BACKEND_VARIANT_NATIVE_LOCALES', status: 'FAIL', locales: {}, boundaries: [] };
function wpEval(php) {
  return execFileSync('php', [cli, '--path=' + wp, 'eval', php], { encoding: 'utf8', env: process.env }).trim();
}
function setLocale(locale) {
  const got = wpEval('$u=get_user_by("login","bootstrap_admin"); if(!$u) throw new Exception("Missing admin"); update_user_meta($u->ID,"locale",' + JSON.stringify(locale) + '); echo get_user_locale($u);');
  if (got !== locale) throw new Error('WordPress user locale readback failed: ' + locale);
}
function activationState() {
  return JSON.parse(wpEval('$s=\\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress(); echo wp_json_encode($s->activeFacts(),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);'));
}
function lifecycleDigest() {
  return wpEval('echo hash("sha256",serialize(get_option("' + domain + '")));');
}
function assert(ok, message) { if (!ok) throw new Error(message); }

const initial = wpEval('echo base64_encode(serialize(get_option("' + domain + '",false)));');
const initialLocale = wpEval('$u=get_user_by("login","bootstrap_admin"); echo get_user_locale($u);');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  // An actual installed operations artifact provides Current/Safe identity.
  // This test owns only its temporary visual lifecycle changes, restored below.
  wpEval('$v=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore("' + domain + '"));' +
    '$s=\\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress();' +
    '$v->import(\\GravityPresentationProfiles\\GravityForms\\OperationsSetupService::forWordPress()->packageArtifact());' +
    '$id=$s->currentSafeIdentity();$v->activate(array_merge(array("surface"=>"gravity_flow.entry_detail"),$id));');
  assert(activationState().variant === 'current_safe', 'Current/Safe lifecycle setup was not established');

  setLocale('en_US');
  await page.goto(base + '/wp-login.php', { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

  const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"));'));
  const formId = manifest.forms[0].form_id;
  assert(Boolean(manifest.frontend_inbox_url), 'Existing synthetic Frontend Inbox URL is unavailable');
  const english = {};
  const persian = {};
  for (const locale of ['en_US', 'fa_IR']) {
    setLocale(locale);
    await page.goto(settings, { waitUntil: 'networkidle' });
    const fa = locale === 'fa_IR';
    const selector = page.locator('#entry_detail_visual_variant_action');
    assert(await selector.count() === 1, 'Authentic GF settings variant selector missing: ' + locale);
    const choices = await selector.locator('option').evaluateAll(nodes =>
      nodes.map(el => ({ label: (el.textContent || '').trim(), value: el.value })));
    assert(choices.length === 2, 'Known variant should have two choices: ' + locale);
    const active = choices.find(x => x.value === '');
    const inactive = choices.find(x => x.value !== '');
    assert(Boolean(active && inactive), 'Missing no-op or actionable variant: ' + locale);
    assert(active.label === (fa ? 'Current / Safe — طرح فعلی و پایدار — فعال' : 'Current / Safe — stable design — active'),
      'Localized active variant label is incorrect: ' + JSON.stringify(choices));
    assert(inactive.label === (fa ? 'Full Width — طرح جدید تمام‌عرض' : 'Full Width — expanded design'),
      'Localized alternate design is incorrect: ' + locale);
    assert(!fa ? !/[\u0600-\u06ff]/u.test(choices.map(x => x.label).join(' ')) : /[\u0600-\u06ff]/u.test(active.label),
      'Unexpected variant selector language: ' + locale);
    assert(await page.getByText(fa ? 'طرح فعال جزئیات پرونده' : 'Active Entry Detail design', { exact: true }).count() > 0,
      'Localized variant feedback label missing: ' + locale);

    // Exercise actual browser focus and the native GF save callback with a
    // selected no-op. No lifecycle or binding mutation is allowed.
    await selector.focus();
    assert(await selector.evaluate(el => document.activeElement === el), 'Keyboard focus failed: ' + locale);
    await selector.selectOption('');
    const beforeSave = lifecycleDigest();
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.click('#gform-settings-save')]);
    assert(beforeSave === lifecycleDigest() && activationState().variant === 'current_safe',
      'Saving active no-op unexpectedly mutated activation: ' + locale);

    await page.setViewportSize({ width: 390, height: 844 });
    const rect = await selector.evaluate(el => {
      const r = el.getBoundingClientRect();
      // Gravity Forms owns the fixed-width wp-admin Settings control layout.
      // Compare with a sibling native control rather than assuming the host
      // reduces its entire Settings renderer to the narrow mobile viewport.
      const peer = document.querySelector('#entry_detail_setup_action');
      const host = peer?.getBoundingClientRect();
      return {
        left: r.left, right: r.right, width: r.width,
        clientWidth: document.documentElement.clientWidth,
        hostPeerWidth: host?.width ?? null,
        hostPeerRight: host?.right ?? null,
        pageScrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      };
    });
    assert(rect.width > 0 && rect.hostPeerWidth !== null &&
      rect.width <= rect.hostPeerWidth + 2,
      'GPP selector exceeds native GF Settings control width at narrow viewport: ' + locale + ': ' + JSON.stringify(rect));
    await page.setViewportSize({ width: 1440, height: 900 });

    // Actual per-form GF Add-On settings, not an invented settings mock.
    await page.goto(base + '/wp-admin/admin.php?page=gf_edit_forms&view=settings&subview=gravity-presentation-profiles&id=' + formId, { waitUntil: 'networkidle' });
    assert(await page.getByLabel(fa ? 'پروفایل اعلانی نصب‌شده' : 'Installed declarative profile', { exact: true }).count() === 1,
      'Per-form native profile selector missing/incorrect: ' + locale);
    const formText = await page.locator('body').innerText();
    assert(formText.includes(fa ? 'فعال‌کردن نمایش Gravity Presentation Profiles برای این فرم' : 'Enable Gravity Presentation Profiles for this form'),
      'Real per-form enable caption not localized: ' + locale);
    assert(formText.includes(fa ? 'پروفایل قدیمی' : 'Legacy profile'), 'Legacy profile control not localized: ' + locale);
    assert(lifecycleDigest() === beforeSave, 'Reading locale-specific form settings unexpectedly mutated visual state');
    // This is an operational Frontend route despite the administrator's locale.
    // Assert the GPP-owned Persian copy is retained; host-owned labels are excluded.
    await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
    const ownedTitle = page.locator('.gpp-inbox-surface__title');
    assert(await ownedTitle.count() === 1 && (await ownedTitle.innerText()).trim() === 'کارهای من',
      'Switching admin locale changed Persian-only GPP operational Frontend copy: ' + locale);
    assert(await page.locator('.gpp-inbox-surface__helper').innerText() ===
      'پرونده‌هایی که اکنون نیاز به اقدام شما دارند در این صفحه نمایش داده می‌شوند. برای شروع، یکی از پرونده‌های زیر را باز کنید.',
      'GPP-owned Frontend helper changed across administrator locales: ' + locale);
    assert(lifecycleDigest() === beforeSave, 'Admin locale changed product state while rendering Frontend Inbox');
    report.locales[locale] = { variantOptions: choices.map(x => ({ label: x.label, noOp: x.value === '' })),
      nativeFormSettings: true, noOpSave: true, focus: true, narrowViewport: rect, localized: true, persianFrontendPreserved: true };
    if (fa) persian.active = choices[0].label;
    else english.active = choices[0].label;
  }
  assert(english.active !== persian.active, 'Administrator locale did not change display labels');

  // A deliberately unresolved state in the synthetic lab. Never fabricate a
  // completed activation or let a dangerous selector overwrite it.
  wpEval('$s=get_option("' + domain + '");$s["activations"]["gravity_flow.entry_detail"]=array(' +
    '"package_id"=>"gpp.unknown.fixture","package_version"=>"0.0.0","profile_id"=>"gpp.unknown.fixture");' +
    'update_option("' + domain + '",$s,false);');
  assert(activationState().state === 'unknown_activation', 'Real unrecognized activation fixture was not reached');
  const unresolvedDigest = lifecycleDigest();
  for (const locale of ['en_US', 'fa_IR']) {
    setLocale(locale);
    await page.goto(settings, { waitUntil: 'networkidle' });
    const fa = locale === 'fa_IR';
    const options = await page.locator('#entry_detail_visual_variant_action option').evaluateAll(nodes =>
      nodes.map(el => ({ text: el.textContent.trim(), value: el.value })));
    const expected = fa ? 'طرح فعال جزئیات پرونده شناخته نشد — بدون تغییر نمایش' :
      'Active Entry Detail design is not recognized — no visual change';
    assert(options.length === 1 && options[0].value === '' && options[0].text === expected,
      'Unresolved state must show localized non-mutating selector: ' + JSON.stringify(options));
    assert(await page.getByText(fa ?
      'طرح فعلی جزئیات پرونده یکی از دو طرح انتخابی نیست. وضعیت را اصلاح و صفحه را تازه کنید؛ GPP آن را خودکار بازنویسی نمی‌کند.' :
      'The current Entry Detail visual activation is not one of the two Owner-selectable designs. Refresh after resolving that lifecycle state; GPP will not overwrite it silently.',
      { exact: true }).count() > 0, 'Localized unresolved-state feedback missing: ' + locale);
    assert(lifecycleDigest() === unresolvedDigest, 'Read-only unresolved selector changed activation: ' + locale);
    report.locales[locale].unrecognizedState = true;
  }
  report.boundaries.push('Only GPP-owned Frontend shell copy is compared across admin locales; native Gravity Flow copy is host-owned.');
  report.status = 'PASS';
} catch (error) {
  report.error = String(error?.stack || error);
  throw error;
} finally {
  try {
    // Restore the exact prior option, not a guessed Current/Safe activation.
    const restore = '$old=unserialize(base64_decode(' + JSON.stringify(initial) + '));' +
      'if($old===false){delete_option("' + domain + '");}else{update_option("' + domain + '",$old,false);}';
    wpEval(restore);
    assert(wpEval('echo base64_encode(serialize(get_option("' + domain + '",false)));') === initial,
      'Synthetic visual state was not restored byte-for-byte');
    setLocale(initialLocale);
  } catch (error) {
    report.restoreError = String(error);
    report.status = 'FAIL';
  }
  writeFileSync(path.join(artifacts, 'backend-variant-native-locale-results.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.status !== 'PASS') throw new Error('Backend variant acceptance failed or baseline restoration did not complete');
console.log('GPP_BACKEND_VARIANT_NATIVE_LOCALES_PASS');
