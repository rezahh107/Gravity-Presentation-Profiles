import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const wpCli = process.env.SRWF_WP_CLI;
const wpPath = process.env.SRWF_WP_PATH;
const baseUrl = process.env.SRWF_BASE_URL;
const artifactDir = process.env.SRWF_ARTIFACT_DIR;
if (!wpCli || !wpPath || !baseUrl || !artifactDir) {
  throw new Error('SRWF_WP_CLI, SRWF_WP_PATH, SRWF_BASE_URL, and SRWF_ARTIFACT_DIR are required.');
}

execFileSync(
  'php',
  [wpCli, `--path=${wpPath}`, 'eval-file', 'tests/srwf-runtime/setup-presentation-ownership-fixtures.php'],
  { stdio: 'inherit', env: process.env }
);

const manifestPath = `${artifactDir}/presentation-ownership-manifest.json`;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.runtime.gravity_forms_version !== '3.1.1.1') {
  throw new Error(`Expected Gravity Forms 3.1.1.1, observed ${manifest.runtime.gravity_forms_version}.`);
}

const enabledId = manifest.enabled_form.id;
const disabledId = manifest.disabled_form.id;
const pageUrl = `${baseUrl}/?page_id=${manifest.page_id}`;
const enabledWrapper = `#gform_wrapper_${enabledId}`;
const enabledForm = `#gform_${enabledId}`;
const disabledWrapper = `#gform_wrapper_${disabledId}`;
const disabledForm = `#gform_${disabledId}`;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const gppCssResponses = [];
page.on('response', (response) => {
  if (response.url().includes('gravity-presentation-profiles') && response.url().includes('.css')) {
    gppCssResponses.push({ url: response.url(), status: response.status() });
  }
});

try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.locator(enabledWrapper).waitFor();
  await page.locator(disabledWrapper).waitFor();

  const observation = await page.evaluate(({ enabledWrapper, enabledForm, disabledWrapper, disabledForm }) => {
    const ew = document.querySelector(enabledWrapper);
    const ef = document.querySelector(enabledForm);
    const dw = document.querySelector(disabledWrapper);
    const df = document.querySelector(disabledForm);
    const enabledStyle = ew instanceof Element ? getComputedStyle(ew) : null;
    const disabledStyle = dw instanceof Element ? getComputedStyle(dw) : null;
    const styleSheets = [...document.styleSheets]
      .filter((sheet) => sheet.href && sheet.href.includes('gravity-presentation-profiles'))
      .map((sheet) => sheet.href);

    return {
      enabledWrapperClass: ew?.className ?? null,
      enabledFormClass: ef?.className ?? null,
      disabledWrapperClass: dw?.className ?? null,
      disabledFormClass: df?.className ?? null,
      enabledTokens: enabledStyle ? {
        controlMinHeight: enabledStyle.getPropertyValue('--gpp-control-min-height').trim(),
        primaryBackground: enabledStyle.getPropertyValue('--gpp-primary-action-background').trim(),
        direction: enabledStyle.getPropertyValue('--gpp-form-direction').trim(),
      } : null,
      disabledTokens: disabledStyle ? {
        controlMinHeight: disabledStyle.getPropertyValue('--gpp-control-min-height').trim(),
        primaryBackground: disabledStyle.getPropertyValue('--gpp-primary-action-background').trim(),
        direction: disabledStyle.getPropertyValue('--gpp-form-direction').trim(),
      } : null,
      styleSheets,
      disabledRequired: Boolean(df?.querySelector('input[type="text"]')?.matches(':required')),
      disabledLabelled: Boolean(
        df?.querySelector('input[type="text"]')?.id &&
        document.querySelector(`label[for="${CSS.escape(df.querySelector('input[type="text"]').id)}"]`)
      ),
    };
  }, { enabledWrapper, enabledForm, disabledWrapper, disabledForm });

  console.log('GPP_PRESENTATION_OWNERSHIP_OBSERVATION=' + JSON.stringify(observation));
  console.log('GPP_PRESENTATION_OWNERSHIP_CSS_RESPONSES=' + JSON.stringify(gppCssResponses));

  const enabledFormClasses = observation.enabledFormClass?.split(/\s+/).filter(Boolean) ?? [];
  const enabledWrapperClasses = observation.enabledWrapperClass?.split(/\s+/).filter(Boolean) ?? [];
  const disabledFormClasses = observation.disabledFormClass?.split(/\s+/).filter(Boolean) ?? [];
  const disabledWrapperClasses = observation.disabledWrapperClass?.split(/\s+/).filter(Boolean) ?? [];

  check(enabledFormClasses.includes('gpp-enabled'), 'GPP-enabled authentic form lacks gpp-enabled identity.');
  check(enabledFormClasses.includes('gpp-declarative'), 'GPP-enabled authentic form lacks declarative identity.');
  check(enabledWrapperClasses.includes('gpp-enabled_wrapper'), 'GPP-enabled authentic wrapper lacks GPP identity.');
  check(observation.enabledTokens?.controlMinHeight === '52px', `Enabled wrapper GPP control token is ${observation.enabledTokens?.controlMinHeight}, expected 52px.`);
  check(observation.enabledTokens?.primaryBackground === '#1D4ED8', `Enabled wrapper primary token is ${observation.enabledTokens?.primaryBackground}, expected #1D4ED8.`);

  check(disabledFormClasses.includes('ownership-disabled-host'), 'Disabled form lost its ordinary host CSS class.');
  check(disabledFormClasses.includes('srwf-registration-theme'), 'Disabled form lost the exact external GTB opt-in class.');
  check(disabledWrapperClasses.includes('ownership-disabled-host_wrapper'), 'Disabled wrapper lost its ordinary host wrapper class.');
  check(disabledWrapperClasses.includes('srwf-registration-theme_wrapper'), 'Disabled wrapper lost the external presentation owner identity.');
  check(disabledFormClasses.every((className) => !className.startsWith('gpp-')), `Disabled form received GPP presentation class(es): ${JSON.stringify(disabledFormClasses)}.`);
  check(disabledWrapperClasses.every((className) => !className.startsWith('gpp-')), `Disabled wrapper received GPP presentation class(es): ${JSON.stringify(disabledWrapperClasses)}.`);
  check(observation.disabledTokens?.controlMinHeight === '', `Disabled wrapper inherited --gpp-control-min-height=${observation.disabledTokens?.controlMinHeight}.`);
  check(observation.disabledTokens?.primaryBackground === '', `Disabled wrapper inherited --gpp-primary-action-background=${observation.disabledTokens?.primaryBackground}.`);
  check(observation.disabledTokens?.direction === '', `Disabled wrapper inherited --gpp-form-direction=${observation.disabledTokens?.direction}.`);

  check(gppCssResponses.length >= 2, 'The mixed page did not load GPP styles for the enabled neighbor form.');
  check(gppCssResponses.every((item) => item.status === 200), `A GPP stylesheet failed on the mixed page: ${JSON.stringify(gppCssResponses)}.`);
  check(observation.styleSheets.length >= 2, 'The mixed document lacks expected GPP stylesheets for the enabled form.');
  check(observation.disabledRequired === true, 'Disabled form lost Gravity Forms required-control behavior.');
  check(observation.disabledLabelled === true, 'Disabled form lost its native label relationship.');

  const disabledSubmit = page.locator(`${disabledForm} input[type="submit"], ${disabledForm} button[type="submit"]`).first();
  await disabledSubmit.click();
  await page.waitForLoadState('networkidle');
  await page.locator(disabledWrapper).waitFor();
  const validationCount = await page.locator(`${disabledWrapper} .gform_validation_errors, ${disabledWrapper} .validation_error`).count();
  check(validationCount > 0, 'Disabled form did not preserve ordinary Gravity Forms required-field validation.');

  const requiredInput = page.locator(`${disabledForm} input[type="text"]`).first();
  await requiredInput.fill('Synthetic Runtime Name');
  await page.locator(`${disabledForm} input[type="submit"], ${disabledForm} button[type="submit"]`).first().click();
  await page.waitForLoadState('networkidle');
  const confirmationCount = await page.locator(`#gform_confirmation_wrapper_${disabledId}, #gform_confirmation_message_${disabledId}, .gform_confirmation_message`).count();
  check(confirmationCount > 0, 'Disabled form did not complete ordinary Gravity Forms submission/confirmation behavior.');

  fs.writeFileSync(
    `${artifactDir}/presentation-ownership-browser-results.json`,
    JSON.stringify({
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      gravity_forms_version: manifest.runtime.gravity_forms_version,
      external_presentation_class: manifest.disabled_form.external_presentation_class,
      observation,
      gppCssResponses,
      validationCount,
      confirmationCount,
      failures,
    }, null, 2) + '\n'
  );

  if (failures.length > 0) {
    throw new Error(`GPP presentation ownership runtime failed:\n- ${failures.join('\n- ')}`);
  }

  console.log('GPP_PRESENTATION_OWNERSHIP_BROWSER_PASS');
} finally {
  await browser.close();
}
