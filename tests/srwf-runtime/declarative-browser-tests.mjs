import fs from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SRWF_BASE_URL;
const manifestPath = process.env.SRWF_MANIFEST_PATH;
const artifactDir = process.env.SRWF_ARTIFACT_DIR;
if (!baseUrl || !manifestPath || !artifactDir) {
  throw new Error('SRWF_BASE_URL, SRWF_MANIFEST_PATH, and SRWF_ARTIFACT_DIR are required.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const declarativeId = manifest.declarative_form.id;
const alternateId = manifest.alternate_form.id;
const plainId = manifest.plain_form.id;
const pageUrl = `${baseUrl}/?page_id=${manifest.page_id}`;
const declarativeWrapper = `#gform_wrapper_${declarativeId}`;
const declarativeForm = `#gform_${declarativeId}`;
const alternateWrapper = `#gform_wrapper_${alternateId}`;
const plainWrapper = `#gform_wrapper_${plainId}`;
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.locator(declarativeWrapper).waitFor();
  await page.locator(alternateWrapper).waitFor();
  await page.locator(plainWrapper).waitFor();

  const initial = await page.evaluate(({ declarativeWrapper, alternateWrapper, plainWrapper }) => {
    const snapshot = (selector) => {
      const wrapper = document.querySelector(selector);
      if (!(wrapper instanceof Element)) return null;
      const style = getComputedStyle(wrapper);
      const text = wrapper.querySelector('input[type="text"]:not(.pgr_jalali_date)');
      const jalali = wrapper.querySelector('input.pgr_jalali_date');
      const submit = wrapper.querySelector('input[type="submit"], button[type="submit"]');
      const read = (element) => element instanceof Element ? getComputedStyle(element) : null;
      const textStyle = read(text);
      const jalaliStyle = read(jalali);
      const submitStyle = read(submit);
      return {
        className: wrapper.className,
        direction: style.direction,
        backgroundColor: style.backgroundColor,
        primary: style.getPropertyValue('--gpp-primary-action-background').trim(),
        surface: style.getPropertyValue('--gpp-form-surface-background').trim(),
        controlHeightToken: style.getPropertyValue('--gpp-control-min-height').trim(),
        submitHeightToken: style.getPropertyValue('--gpp-primary-action-min-height').trim(),
        textHeight: textStyle?.height ?? null,
        textCtrlSize: textStyle?.getPropertyValue('--gf-ctrl-size').trim() ?? null,
        jalaliHeight: jalaliStyle?.height ?? null,
        jalaliCtrlSize: jalaliStyle?.getPropertyValue('--gf-ctrl-size').trim() ?? null,
        submitHeight: submitStyle?.height ?? null,
        submitSize: submitStyle?.getPropertyValue('--gf-ctrl-btn-size').trim() ?? null,
      };
    };

    return {
      declarative: snapshot(declarativeWrapper),
      alternate: snapshot(alternateWrapper),
      plain: snapshot(plainWrapper),
      genericStyleSheets: [...document.styleSheets]
        .filter((sheet) => sheet.href && sheet.href.includes('gravity-forms-declarative.css'))
        .map((sheet) => sheet.href),
    };
  }, { declarativeWrapper, alternateWrapper, plainWrapper });

  console.log('GPP_DECLARATIVE_INITIAL=' + JSON.stringify(initial));

  check(initial.declarative !== null, 'Canonical declarative Gravity Form was not rendered.');
  check(initial.alternate !== null, 'Alternate declarative Gravity Form was not rendered.');
  check(initial.plain !== null, 'Plain Gravity Form was not rendered for isolation comparison.');
  check(initial.genericStyleSheets.length >= 1, 'Repository-owned generic declarative Gravity Forms stylesheet was not attached.');

  for (const [name, snapshot] of [['canonical', initial.declarative], ['alternate', initial.alternate]]) {
    const classes = snapshot?.className?.split(/\s+/) || [];
    check(classes.includes('gpp-enabled_wrapper'), `${name} declarative wrapper lacks gpp-enabled identity.`);
    check(classes.includes('gpp-declarative_wrapper'), `${name} declarative wrapper lacks generic declarative identity.`);
    check(classes.includes('gpp-field-layout-single-column_wrapper'), `${name} declarative wrapper lacks controlled single-column composition class.`);
    check(classes.includes('gpp-cap-gf-orbital-control-metric-projection_wrapper'), `${name} declarative wrapper lacks the admitted Orbital adapter class.`);
    check(classes.includes('gpp-cap-pgr-jalali-validation-message-after-control_wrapper'), `${name} declarative wrapper lacks the admitted PersianGravity adapter class.`);
    check(classes.some((item) => /^gpp-profile-declarative-[a-f0-9]{16}_wrapper$/.test(item)), `${name} declarative wrapper lacks deterministic selection scope identity.`);
    check(snapshot?.direction === 'rtl', `${name} declarative wrapper did not consume controlled RTL composition.`);
    check(snapshot?.controlHeightToken === '52px', `${name} declarative control token is ${snapshot?.controlHeightToken}, expected 52px.`);
    check(snapshot?.submitHeightToken === '56px', `${name} declarative submit token is ${snapshot?.submitHeightToken}, expected 56px.`);
    check(snapshot?.textCtrlSize === '52px' && parseFloat(snapshot?.textHeight || '0') >= 52, `${name} text control did not consume the fixed Orbital metric adapter.`);
    check(snapshot?.jalaliCtrlSize === '52px' && parseFloat(snapshot?.jalaliHeight || '0') >= 52, `${name} Jalali control did not consume its admitted fixed adapter.`);
    check(snapshot?.submitSize === '56px' && parseFloat(snapshot?.submitHeight || '0') >= 56, `${name} submit control did not consume the fixed Orbital metric adapter.`);
  }

  check(initial.declarative.primary === '#1D4ED8', `Canonical declarative primary token is ${initial.declarative?.primary}, expected #1D4ED8.`);
  check(initial.declarative.surface === '#FFFFFF', `Canonical declarative surface token is ${initial.declarative?.surface}, expected #FFFFFF.`);
  check(initial.declarative.backgroundColor === 'rgb(255, 255, 255)', 'Canonical declarative surface background did not apply.');
  check(initial.alternate.primary === '#7C3AED', `Alternate declarative primary token is ${initial.alternate?.primary}, expected #7C3AED.`);
  check(initial.alternate.surface === '#F8FAFC', `Alternate declarative surface token is ${initial.alternate?.surface}, expected #F8FAFC.`);
  check(initial.alternate.backgroundColor === 'rgb(248, 250, 252)', 'Alternate declarative surface background did not apply.');
  check(initial.declarative.primary !== initial.alternate.primary, 'Two declarative forms leaked one mutable primary token scope into each other.');

  const plainClasses = initial.plain?.className?.split(/\s+/) || [];
  check(!plainClasses.includes('gpp-enabled_wrapper'), 'Ordinary unselected form was contaminated by declarative runtime identity.');
  check(initial.plain?.primary === '', 'Ordinary unselected form inherited declarative custom properties.');
  check(initial.plain?.controlHeightToken === '', 'Ordinary unselected form inherited declarative control metrics.');

  // Force an authentic AJAX validation re-render on the canonical declarative form.
  await page.locator(`${declarativeForm} input[type="text"]:not(.pgr_jalali_date)`).fill('Declarative Student');
  await page.locator(`${declarativeForm} select`).selectOption('alpha');
  await page.locator(`${declarativeForm} input.pgr_jalali_date`).fill('1405/13/40');
  await page.locator(`${declarativeForm} input[type="submit"], ${declarativeForm} button[type="submit"]`).first().click();
  await page.locator(`${declarativeWrapper} .gfield_error`).waitFor({ timeout: 15000 });

  const rerender = await page.evaluate(({ declarativeWrapper, plainWrapper }) => {
    const selected = document.querySelector(declarativeWrapper);
    const plain = document.querySelector(plainWrapper);
    const selectedStyle = selected instanceof Element ? getComputedStyle(selected) : null;
    const plainStyle = plain instanceof Element ? getComputedStyle(plain) : null;
    const jalali = selected?.querySelector('input.pgr_jalali_date');
    return {
      selectedClass: selected?.className ?? null,
      selectedPrimary: selectedStyle?.getPropertyValue('--gpp-primary-action-background').trim() ?? null,
      selectedError: Boolean(selected?.querySelector('.gfield_validation_message')),
      jalaliAriaInvalid: jalali?.getAttribute('aria-invalid') ?? null,
      jalaliValue: jalali?.value ?? null,
      plainClass: plain?.className ?? null,
      plainPrimary: plainStyle?.getPropertyValue('--gpp-primary-action-background').trim() ?? null,
    };
  }, { declarativeWrapper, plainWrapper });

  console.log('GPP_DECLARATIVE_AJAX_RERENDER=' + JSON.stringify(rerender));
  check(rerender.selectedClass?.split(/\s+/).includes('gpp-declarative_wrapper'), 'AJAX validation re-render lost the selected declarative profile identity.');
  check(rerender.selectedPrimary === '#1D4ED8', 'AJAX validation re-render lost the canonical declarative token scope.');
  check(rerender.selectedError, 'Native Gravity Forms/PersianGravity validation did not remain authoritative on the declarative AJAX form.');
  check(rerender.jalaliAriaInvalid === 'true', 'Declarative presentation bypassed native invalid-state semantics.');
  check(rerender.jalaliValue === '1405/13/40', 'Native host did not preserve invalid Jalali input through declarative AJAX re-render.');
  check(!rerender.plainClass?.split(/\s+/).includes('gpp-enabled_wrapper'), 'Failure/re-render of declarative form contaminated the ordinary form.');
  check(rerender.plainPrimary === '', 'Failure/re-render of declarative form leaked tokens into the ordinary form.');

  const evidence = { initial, rerender, failures };
  fs.writeFileSync(`${artifactDir}/declarative-runtime.json`, JSON.stringify(evidence, null, 2) + '\n');

  if (failures.length) {
    throw new Error(`Declarative Gravity Forms runtime failures:\n- ${failures.join('\n- ')}`);
  }

  console.log('GPP_DECLARATIVE_GF_RUNTIME_PASS');
} finally {
  await browser.close();
}
