import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = process.env.GITHUB_WORKSPACE;
const dir = process.env.WU21_ARTIFACT_DIR;
const base = process.env.WU21_BASE_URL;
const cli = process.env.WU21_WP_CLI;
const wp = process.env.WU21_WP_PATH;
if (![root, dir, base, cli, wp].every(Boolean)) throw new Error('Existing WU21 runtime is required.');

const packageText = fs.readFileSync(path.join(root, 'tests/repro-evidence-lab/fixtures/generic-no-code-form-e2e.json'), 'utf8');
const packageData = JSON.parse(packageText);
const reference = [packageData.package_id, packageData.package_version, packageData.surface_profiles[0].profile_id].join('|');
const settingsUrl = base + '/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles';
const artifact = { scenario: 'GENERIC_NO_CODE_FORM_E2E', status: 'FAIL', fixture_kind: 'PREPARED_NOT_LIVE_LLM', phases: {}, errors: [] };

function wpEval(code) {
  return execFileSync('php', [cli, '--path=' + wp, 'eval', code], { encoding: 'utf8', env: process.env }).trim();
}
function wpJson(code) {
  const marker = 'GPP_E2E_JSON:';
  const output = wpEval(code);
  const index = output.lastIndexOf(marker);
  if (index < 0) throw new Error('Missing WP readback marker: ' + output);
  return JSON.parse(output.slice(index + marker.length));
}
function lifecycle() {
  return wpJson('echo "GPP_E2E_JSON:" . wp_json_encode(get_option("gpp_visual_package_lifecycle_v1", null));');
}
function formState(id) {
  return wpJson(
    '$form=GFAPI::get_form(' + Number(id) + ');' +
    '$addon=\\GravityPresentationProfiles\\GravityForms\\AddOn::get_instance();' +
    '$s=$addon->get_form_settings($form); $active=$addon->resolve_form_state($form)->isActive();' +
    'echo "GPP_E2E_JSON:" . wp_json_encode(array("settings"=>$s,"active"=>$active));'
  );
}
function entryCount(id) {
  return wpJson('$entries=GFAPI::get_entries(' + Number(id) + ');' +
    'if(is_wp_error($entries)) throw new RuntimeException($entries->get_error_message());' +
    'echo "GPP_E2E_JSON:" . wp_json_encode(count($entries));');
}
function expect(ok, message) {
  if (!ok) throw new Error(message);
}
function same(a, b) {
  const canon = v => Array.isArray(v) ? v.map(canon) :
    v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
async function submitAdminForm(page, field) {
  const form = field.locator('xpath=ancestor::form');
  const button = form.locator('button[type=submit], input[type=submit]').last();
  await button.waitFor({ state: 'visible', timeout: 20000 });
  await button.click();
  await page.waitForLoadState('networkidle');
}
async function formSettings(page, id, enabled) {
  await page.goto(base + '/wp-admin/admin.php?page=gf_edit_forms&view=settings&subview=gravity-presentation-profiles&id=' + id, { waitUntil: 'networkidle' });
  const select = page.getByLabel('Installed declarative profile', { exact: true });
  const toggle = page.getByLabel('Apply GPP presentation to this form', { exact: true });
  await select.waitFor({ state: 'visible', timeout: 30000 });
  await toggle.waitFor({ state: 'visible' });
  if (enabled) {
    await select.selectOption(reference);
    await toggle.check();
  } else {
    expect(await select.inputValue() === reference, 'Form Settings did not retain the installed selection before OFF.');
    await toggle.uncheck();
  }
  await submitAdminForm(page, select);
  await page.reload({ waitUntil: 'networkidle' });
  expect(await select.inputValue() === reference, 'Form Settings select value did not persist.');
  expect(await toggle.isChecked() === enabled, 'Form Settings opt-in checkbox did not persist.');
}
async function capture(page, form, width) {
  await page.setViewportSize({ width, height: 950 });
  await page.goto(form.url, { waitUntil: 'networkidle' });
  const selector = '#gform_wrapper_' + form.id;
  await page.locator(selector).waitFor({ state: 'visible', timeout: 30000 });
  return page.locator(selector).evaluate(wrapper => {
    const style = getComputedStyle(wrapper);
    const action = wrapper.querySelector('input[type=submit], button[type=submit]');
    const control = wrapper.querySelector('input[type=text]');
    const rect = wrapper.getBoundingClientRect();
    const inputRect = control?.getBoundingClientRect();
    return {
      classes: wrapper.className.split(/\s+/),
      background: style.backgroundColor,
      direction: style.direction,
      surfaceToken: style.getPropertyValue('--gpp-form-surface-background').trim(),
      actionToken: style.getPropertyValue('--gpp-primary-action-background').trim(),
      actionBackground: action ? getComputedStyle(action).backgroundColor : null,
      borderToken: style.getPropertyValue('--gpp-control-border').trim(),
      controlBorder: control ? getComputedStyle(control).borderColor : null,
      bounds: { left: rect.left, right: rect.right },
      inputBounds: inputRect ? { left: inputRect.left, right: inputRect.right } : null,
      viewport: window.innerWidth
    };
  });
}

execFileSync('php', [cli, '--path=' + wp, 'eval-file', 'tests/repro-evidence-lab/setup-generic-no-code-form-fixtures.php'], { stdio: 'inherit', env: process.env });
const fixtures = JSON.parse(fs.readFileSync(path.join(dir, 'generic-no-code-form-fixtures.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
const admin = await browser.newPage();
const frontend = await browser.newPage();
try {
  const initialLifecycle = lifecycle();
  const initialActivations = initialLifecycle?.activations || {};
  expect(!formState(fixtures.target.id).active, 'Target form was pre-enabled.');
  expect(!formState(fixtures.control.id).active, 'Control form was pre-enabled.');
  const controlBefore = await capture(frontend, fixtures.control, 1440);
  const targetBefore = await capture(frontend, fixtures.target, 1440);
  artifact.phases.host_fixture = 'PASS';

  await admin.goto(base + '/wp-login.php', { waitUntil: 'domcontentloaded' });
  await admin.fill('#user_login', 'bootstrap_admin');
  await admin.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    admin.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    admin.click('#wp-submit')
  ]);
  await admin.goto(settingsUrl, { waitUntil: 'networkidle' });
  const prompt = admin.locator('[data-gpp-general-llm-authoring-prompt="offline"]');
  await prompt.waitFor({ state: 'visible', timeout: 30000 });
  const canonical = wpEval('echo \\GravityPresentationProfiles\\Core\\Authoring\\GeneralLlmAuthoringPrompt::contents();');
  expect(await prompt.locator('[data-gpp-general-llm-authoring-prompt-copyable]').inputValue() === canonical,
    'Fixed authoring prompt does not match packaged bytes.');
  expect(canonical.includes('["gravity_forms.form"]') && canonical.includes('Do not wrap it in Markdown fences'),
    'Fixed authoring prompt does not carry required restricted output contract.');
  artifact.phases.fixed_prompt_admin_ui = 'PASS';

  const input = admin.getByLabel('Profile Package JSON', { exact: true });
  await input.waitFor({ state: 'visible' });
  await input.fill(packageText);
  await submitAdminForm(admin, input);
  const imported = lifecycle();
  expect(Boolean(imported?.installed?.[packageData.package_id]?.[packageData.package_version]),
    'Authentic UI import did not install independent package.');
  expect(same(imported.activations || {}, initialActivations), 'Import changed operational activations.');
  expect(!formState(fixtures.target.id).active, 'Import silently enabled target form.');
  artifact.phases.ui_import_without_activation = 'PASS';

  await formSettings(admin, fixtures.target.id, true);
  const selected = formState(fixtures.target.id);
  expect(selected.active && selected.settings.declarative_profile === reference,
    'Authentic Form Settings selection not persisted/active.');
  expect(!formState(fixtures.control.id).active, 'Unrelated form was activated.');
  artifact.phases.form_settings_selection = 'PASS';

  artifact.phases.responsive = {};
  for (const width of [1440, 390, 320]) {
    const observed = await capture(frontend, fixtures.target, width);
    expect(observed.classes.includes('gpp-declarative_wrapper'), 'Missing generic declaration class at ' + width);
    expect(observed.background === 'rgb(231, 243, 255)' && observed.surfaceToken === '#E7F3FF',
      'Distinct surface paint not computed at ' + width);
    expect(observed.actionToken === '#D4571B' && observed.actionBackground === 'rgb(212, 87, 27)',
      'Distinct action paint not computed at ' + width);
    expect(observed.borderToken === '#155E75' && observed.controlBorder === 'rgb(21, 94, 117)',
      'Control border paint not computed at ' + width);
    expect(observed.direction === 'rtl', 'Declared RTL direction not applied at ' + width);
    expect(observed.bounds.left >= -1 && observed.bounds.right <= width + 1 &&
      observed.inputBounds.left >= -1 && observed.inputBounds.right <= width + 1,
      'Form or control overflows viewport at ' + width);
    const form = frontend.locator('#gform_' + fixtures.target.id);
    await form.locator('input[type=text]').first().focus();
    await frontend.keyboard.press('Tab');
    expect(await form.locator('input[type=email]').first().evaluate(el => el === document.activeElement),
      'Keyboard Tab did not reach native email control at ' + width);
    artifact.phases.responsive[width] = 'PASS';
  }
  artifact.phases.computed_visual_effect = 'PASS';

  const beforeEntries = entryCount(fixtures.target.id);
  await frontend.goto(fixtures.target.url, { waitUntil: 'networkidle' });
  const form = frontend.locator('#gform_' + fixtures.target.id);
  await form.evaluate(el => el.setAttribute('novalidate', 'novalidate'));
  await Promise.all([
    frontend.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    form.locator('input[type=submit], button[type=submit]').first().click()
  ]);
  await frontend.locator('#gform_wrapper_' + fixtures.target.id + ' .gfield_error').first()
    .waitFor({ state: 'visible', timeout: 20000 });
  artifact.phases.native_required_validation = 'PASS';

  const validForm = frontend.locator('#gform_' + fixtures.target.id);
  await validForm.locator('input[type=text]').fill('Synthetic E2E');
  await validForm.locator('input[type=email]').fill('test@example.invalid');
  await Promise.all([
    frontend.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    validForm.locator('input[type=submit], button[type=submit]').first().click()
  ]);
  expect(entryCount(fixtures.target.id) === beforeEntries + 1,
    'Native Gravity Forms entry count did not increment after real submission.');
  artifact.phases.native_persisted_submission = 'PASS';

  await formSettings(admin, fixtures.target.id, false);
  const disabled = formState(fixtures.target.id);
  expect(!disabled.active && disabled.settings.declarative_profile === reference,
    'GPP OFF discarded selected package reference or left form active.');
  const targetAfter = await capture(frontend, fixtures.target, 390);
  expect(!targetAfter.classes.includes('gpp-declarative_wrapper') && !targetAfter.surfaceToken &&
    !targetAfter.actionToken && targetAfter.background === targetBefore.background,
    'Native fallback did not restore form presentation after opt-out.');
  expect(Boolean(lifecycle()?.installed?.[packageData.package_id]?.[packageData.package_version]),
    'Opt-out removed immutable installed package.');
  artifact.phases.native_fallback_and_persistence = 'PASS';

  const controlAfter = await capture(frontend, fixtures.control, 1440);
  expect(same(controlBefore, controlAfter) && !formState(fixtures.control.id).active,
    'Unrelated form changed during the connected journey.');
  expect(same(lifecycle().activations || {}, initialActivations),
    'Connected form journey changed Gravity Flow operational surface activations.');
  artifact.phases.other_form_and_operational_isolation = 'PASS';
  artifact.status = 'PASS';
} catch (error) {
  artifact.errors.push(String(error?.stack || error).slice(0, 7000));
  try { await frontend.screenshot({ path: path.join(dir, 'generic-no-code-form-e2e-failure.png'), fullPage: true }); } catch (_) {}
} finally {
  await browser.close();
  fs.writeFileSync(path.join(dir, 'generic-no-code-form-e2e-results.json'), JSON.stringify(artifact, null, 2) + '\n');
}
console.log('GPP_GENERIC_NO_CODE_FORM_E2E_' + artifact.status);
if (artifact.status !== 'PASS') process.exit(1);
