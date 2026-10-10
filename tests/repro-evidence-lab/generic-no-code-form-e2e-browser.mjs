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
  return execFileSync('php', [cli, '--path=' + wp, 'eval', code], { encoding: 'utf8', env: process.env });
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
  // The GF Add-On Framework's checkbox may not expose its choice caption as
  // the HTML accessible name. Address the actual canonical enabled field,
  // rather than relying on presentation-only label text.
  const toggle = page.locator('input[type="checkbox"][name*="enabled"], input[type="checkbox"][id*="enabled"]');
  await select.waitFor({ state: 'visible', timeout: 30000 });
  const count = await toggle.count();
  if (count !== 1) {
    const checkboxes = await page.locator('input[type="checkbox"]').evaluateAll(nodes =>
      nodes.map(n => ({ id: n.id, name: n.name, visible: n.getClientRects().length > 0 })));
    throw new Error('Expected one native GPP enabled checkbox; found ' + count + ' candidates=' + JSON.stringify(checkboxes));
  }
  await toggle.waitFor({ state: 'visible', timeout: 20000 });
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
    const controlSelectors = {
      text: 'input[type="text"]',
      email: 'input[type="email"]',
      select: 'select',
      textarea: 'textarea'
    };
    const controls = Object.fromEntries(Object.entries(controlSelectors).map(([kind, selector]) => {
      const element = wrapper.querySelector(selector);
      if (!element) return [kind, null];
      const computed = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return [kind, {
        tag: element.tagName.toLowerCase(),
        inputType: element instanceof HTMLInputElement ? element.type : null,
        borderColor: computed.borderColor,
        borderWidth: computed.borderWidth,
        borderStyle: computed.borderStyle,
        nativeBorderVariable: computed.getPropertyValue('--gf-ctrl-border-color').trim(),
        focusBorderVariable: computed.getPropertyValue('--gf-ctrl-border-color-focus').trim(),
        declaredBorderToken: computed.getPropertyValue('--gpp-control-border').trim(),
        declaredFocusToken: computed.getPropertyValue('--gpp-control-focus-border').trim(),
        bounds: { left: bounds.left, right: bounds.right }
      }];
    }));
    return {
      controls,
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


const nativeSelectors = {
  text: 'input[type="text"]',
  email: 'input[type="email"]',
  select: 'select',
  textarea: 'textarea'
};

async function focusedNativePaint(page, form, kind) {
  const selector = '#gform_' + form.id + ' ' + nativeSelectors[kind];
  const control = page.locator(selector).first();
  await control.focus();
  return control.evaluate(async element => {
    const initialBorderColor = getComputedStyle(element).borderColor;
    // Gravity Forms Orbital animates focus paint. Sampling immediately after
    // focus() captures a transition frame, not the settled visual result.
    const transitions = element.getAnimations().filter(animation => animation instanceof CSSTransition);
    await Promise.all(transitions.map(animation => animation.finished.catch(() => null)));
    const style = getComputedStyle(element);
    return {
      initialBorderColor,
      focusTransitionCount: transitions.length,
      nativeTag: element.tagName.toLowerCase(),
      isFocused: document.activeElement === element && element.matches(':focus'),
      borderColor: style.borderColor,
      borderWidth: style.borderWidth,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
      focusToken: style.getPropertyValue('--gpp-control-focus-border').trim(),
      nativeFocusVariable: style.getPropertyValue('--gf-ctrl-border-color-focus').trim(),
      nativeNormalVariable: style.getPropertyValue('--gf-ctrl-border-color').trim()
    };
  });
}

async function nativeValidationPaint(page, form) {
  const selector = '#gform_wrapper_' + form.id;
  return page.locator(selector).evaluate(wrapper => {
    const fields = {};
    for (const [kind, controlSelector] of Object.entries({
      text: 'input[type="text"]', email: 'input[type="email"]',
      select: 'select', textarea: 'textarea'
    })) {
      const nativeControl = wrapper.querySelector(controlSelector);
      const field = nativeControl?.closest('.gfield');
      const message = field?.querySelector('.gfield_validation_message');
      const computed = nativeControl ? getComputedStyle(nativeControl) : null;
      fields[kind] = {
        tag: nativeControl?.tagName.toLowerCase() ?? null,
        fieldError: Boolean(field?.classList.contains('gfield_error')),
        messageVisible: Boolean(message && message.getClientRects().length > 0 && getComputedStyle(message).visibility !== 'hidden'),
        borderColor: computed?.borderColor ?? null,
        nativeErrorVariable: computed?.getPropertyValue('--gf-ctrl-border-color-error').trim() ?? null,
        ariaInvalid: nativeControl?.getAttribute('aria-invalid') ?? null
      };
    }
    return fields;
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
  const controlNative = {};
  for (const width of [1440, 390, 320]) {
    controlNative[width] = await capture(frontend, fixtures.control, width);
  }
  const controlBefore = controlNative[1440];
  const nativeFocusBaseline = {};
  for (const width of [1440, 390, 320]) {
    await capture(frontend, fixtures.control, width);
    nativeFocusBaseline[width] = {};
    for (const kind of Object.keys(nativeSelectors)) {
      nativeFocusBaseline[width][kind] = await focusedNativePaint(frontend, fixtures.control, kind);
    }
  }
  artifact.phases.native_focus_baseline = nativeFocusBaseline;
  const targetBefore = await capture(frontend, fixtures.target, 390);
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

  artifact.phases.unrelated_while_active = {};
  for (const width of [1440, 390, 320]) {
    const unaffected = await capture(frontend, fixtures.control, width);
    expect(same(controlNative[width], unaffected),
      'Unrelated native form changed while target profile was ACTIVE at ' + width);
    const unaffectedFocus = {};
    for (const kind of Object.keys(nativeSelectors)) {
      unaffectedFocus[kind] = await focusedNativePaint(frontend, fixtures.control, kind);
      const paintProperties = ['borderColor', 'outlineColor', 'outlineStyle',
        'outlineWidth', 'boxShadow', 'nativeFocusVariable', 'nativeNormalVariable'];
      expect(paintProperties.every(property => nativeFocusBaseline[width][kind][property] === unaffectedFocus[kind][property]),
        'Unrelated native ' + kind + ' settled focus paint changed while target ACTIVE at ' + width + ': ' +
        JSON.stringify({ before: nativeFocusBaseline[width][kind], during: unaffectedFocus[kind] }));
    }
    artifact.phases.unrelated_while_active[width] = { status: 'PASS', computed: unaffected, focus: unaffectedFocus };
  }

  const discoveredPaintGaps = [];
  artifact.phases.responsive = {};
  for (const width of [1440, 390, 320]) {
    const observed = await capture(frontend, fixtures.target, width);
    artifact.phases.responsive[width] = { status: 'CHECKING', computed: observed };
    for (const [kind, expectedTag] of Object.entries({ text: 'input', email: 'input', select: 'select', textarea: 'textarea' })) {
      const control = observed.controls[kind];
      expect(control && control.tag === expectedTag, 'Native ' + kind + ' control missing or replaced at ' + width);
      expect(control.borderColor === 'rgb(21, 94, 117)' &&
        control.declaredBorderToken === '#155E75',
        'Normal-state computed ' + kind + ' border does not match package at ' + width + ': ' + JSON.stringify(control));
      expect(control.borderStyle !== 'none' && control.borderWidth !== '0px',
        'Native ' + kind + ' has no painted border at ' + width);
      expect(control.bounds.left >= -1 && control.bounds.right <= width + 1,
        'Native ' + kind + ' overflows at ' + width + ': ' + JSON.stringify(control.bounds));
    }
    expect(observed.classes.includes('gpp-declarative_wrapper'), 'Missing generic declaration class at ' + width);
    expect(observed.background === 'rgb(231, 243, 255)' && observed.surfaceToken === '#E7F3FF',
      'Distinct surface paint not computed at ' + width);
    expect(observed.actionToken === '#D4571B' && observed.actionBackground === 'rgb(212, 87, 27)',
      'Distinct action paint not computed at ' + width);
    expect(observed.borderToken === '#155E75' && observed.controlBorder === 'rgb(21, 94, 117)',
      'Control border paint not computed at ' + width + ': token=' + observed.borderToken + ' computed=' + observed.controlBorder);
    expect(observed.direction === 'rtl', 'Declared RTL direction not applied at ' + width);
    expect(observed.bounds.left >= -1 && observed.bounds.right <= width + 1 &&
      observed.inputBounds.left >= -1 && observed.inputBounds.right <= width + 1,
      'Form or control overflows viewport at ' + width);
    artifact.phases.responsive[width].focus = {};
    for (const kind of Object.keys(nativeSelectors)) {
      const paint = await focusedNativePaint(frontend, fixtures.target, kind);
      artifact.phases.responsive[width].focus[kind] = paint;
      if (!paint.isFocused || paint.focusToken !== '#2563EB') {
        discoveredPaintGaps.push('Focus state/token ' + kind + ' at ' + width + ': ' + JSON.stringify(paint));
      }
      if (paint.borderColor !== 'rgb(37, 99, 235)') {
        discoveredPaintGaps.push('Focus border paint ' + kind + ' at ' + width + ': ' + JSON.stringify(paint));
      }
    }
    const form = frontend.locator('#gform_' + fixtures.target.id);
    await form.locator('input[type=text]').first().focus();
    for (const kind of ['email', 'select', 'textarea']) {
      await frontend.keyboard.press('Tab');
      expect(await form.locator(nativeSelectors[kind]).first().evaluate(el => el === document.activeElement),
        'Native keyboard tab order did not reach ' + kind + ' at ' + width);
    }
    artifact.phases.responsive[width].status = 'PASS';
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
  const validationPaint = await nativeValidationPaint(frontend, fixtures.target);
  artifact.phases.native_required_validation = { status: 'CHECKING', computed: validationPaint };
  for (const kind of Object.keys(nativeSelectors)) {
    const error = validationPaint[kind];
    if (!error || !error.fieldError || !error.messageVisible) {
      discoveredPaintGaps.push('Native required-field error/message ' + kind + ': ' + JSON.stringify(error));
    }
    if (!error?.borderColor || error.borderColor === 'rgb(21, 94, 117)') {
      discoveredPaintGaps.push('Native error border paint ' + kind + ': ' + JSON.stringify(error));
    }
  }
  artifact.phases.native_required_validation.status = 'PASS';

  const validForm = frontend.locator('#gform_' + fixtures.target.id);
  await validForm.locator('input[type=text]').fill('Synthetic E2E');
  await validForm.locator('input[type=email]').fill('test@example.invalid');
  await validForm.locator('select').selectOption('blue');
  await validForm.locator('textarea').fill('Synthetic non-PII notes');
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
  artifact.phases.native_fallback_computed_controls = {};
  for (const kind of Object.keys(nativeSelectors)) {
    const nativeBefore = targetBefore.controls[kind];
    const nativeAfter = targetAfter.controls[kind];
    expect(nativeBefore && nativeAfter && nativeBefore.borderColor === nativeAfter.borderColor &&
      nativeBefore.nativeBorderVariable === nativeAfter.nativeBorderVariable &&
      !nativeAfter.declaredBorderToken && !nativeAfter.declaredFocusToken,
      'Native fallback ' + kind + ' border paint/variables failed to restore: ' +
      JSON.stringify({ nativeBefore, nativeAfter }));
    const focusNativeAfter = await focusedNativePaint(frontend, fixtures.target, kind);
    expect(focusNativeAfter.borderColor === nativeFocusBaseline[390][kind].borderColor &&
      focusNativeAfter.nativeFocusVariable === nativeFocusBaseline[390][kind].nativeFocusVariable,
      'Disabling GPP did not restore native ' + kind + ' focused paint/variables: ' +
      JSON.stringify({ after: focusNativeAfter, nativeBaseline: nativeFocusBaseline[390][kind] }));
    artifact.phases.native_fallback_computed_controls[kind] = {
      before: nativeBefore.borderColor,
      after: nativeAfter.borderColor,
      focusAfter: focusNativeAfter,
      status: 'PASS'
    };
  }
  expect(Boolean(lifecycle()?.installed?.[packageData.package_id]?.[packageData.package_version]),
    'Opt-out removed immutable installed package.');
  artifact.phases.native_fallback_and_persistence = 'PASS';

  const controlAfter = await capture(frontend, fixtures.control, 1440);
  expect(same(controlBefore, controlAfter) && !formState(fixtures.control.id).active,
    'Unrelated form changed during the connected journey.');
  expect(same(lifecycle().activations || {}, initialActivations),
    'Connected form journey changed Gravity Flow operational surface activations.');
  artifact.phases.other_form_and_operational_isolation = 'PASS';
  artifact.phases.focus_and_error_paint_findings = discoveredPaintGaps;
  expect(discoveredPaintGaps.length === 0,
    'Pinned-host native focus/error paint did not satisfy declared behavior: ' + discoveredPaintGaps.join(' | '));
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
