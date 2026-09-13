import fs from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SRWF_BASE_URL;
const manifestPath = process.env.SRWF_MANIFEST_PATH;
const artifactDir = process.env.SRWF_ARTIFACT_DIR;
if (!baseUrl || !manifestPath || !artifactDir) {
  throw new Error('SRWF_BASE_URL, SRWF_MANIFEST_PATH, and SRWF_ARTIFACT_DIR are required.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const selectedId = manifest.selected_form.id;
const plainId = manifest.plain_form.id;
const pageUrl = `${baseUrl}/?page_id=${manifest.page_id}`;
const selectedWrapper = `#gform_wrapper_${selectedId}`;
const selectedForm = `#gform_${selectedId}`;
const plainWrapper = `#gform_wrapper_${plainId}`;
const plainForm = `#gform_${plainId}`;
const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function parseRgb(value) {
  const match = String(value).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function relativeLuminance(rgb) {
  const channels = rgb.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) return null;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const gppCssResponses = [];
page.on('response', (response) => {
  if (response.url().includes('gravity-presentation-profiles') && response.url().includes('.css')) {
    gppCssResponses.push({ url: response.url(), status: response.status() });
  }
});

try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.locator(selectedWrapper).waitFor();
  await page.locator(plainWrapper).waitFor();

  const initial = await page.evaluate(({ selectedWrapper, selectedForm, plainWrapper, plainForm }) => {
    const sw = document.querySelector(selectedWrapper);
    const sf = document.querySelector(selectedForm);
    const pw = document.querySelector(plainWrapper);
    const pf = document.querySelector(plainForm);
    const heading = sw?.querySelector('.gform_heading');
    const pgr = sf?.querySelector('input.pgr_jalali_date');
    const plainPgr = pf?.querySelector('input.pgr_jalali_date');
    const wrapperStyle = sw ? getComputedStyle(sw) : null;
    const pgrStyle = pgr ? getComputedStyle(pgr) : null;
    const plainPgrStyle = plainPgr ? getComputedStyle(plainPgr) : null;
    const readableStyleSheets = [...document.styleSheets]
      .filter((sheet) => sheet.href && sheet.href.includes('gravity-presentation-profiles'))
      .map((sheet) => {
        let ruleCount = null;
        try {
          ruleCount = sheet.cssRules.length;
        } catch (error) {
          ruleCount = null;
        }
        return { href: sheet.href, ruleCount };
      });

    return {
      wrapperClass: sw?.className ?? null,
      formClass: sf?.className ?? null,
      plainWrapperClass: pw?.className ?? null,
      plainFormClass: pf?.className ?? null,
      headingInsideWrapper: Boolean(sw && heading && sw.contains(heading)),
      headingInsideForm: Boolean(sf && heading && sf.contains(heading)),
      wrapper: wrapperStyle ? {
        direction: wrapperStyle.direction,
        paddingInlineStart: wrapperStyle.paddingInlineStart,
        paddingInlineEnd: wrapperStyle.paddingInlineEnd,
        maxWidth: wrapperStyle.maxWidth,
        borderRadius: wrapperStyle.borderRadius,
        backgroundColor: wrapperStyle.backgroundColor,
        controlRadiusToken: wrapperStyle.getPropertyValue('--gf-ctrl-radius').trim(),
        controlSizeToken: wrapperStyle.getPropertyValue('--gf-ctrl-size').trim(),
      } : null,
      pgr: pgr && pgrStyle ? {
        type: pgr.getAttribute('type'),
        inputmode: pgr.getAttribute('inputmode'),
        autocomplete: pgr.getAttribute('autocomplete'),
        ariaInvalid: pgr.getAttribute('aria-invalid'),
        ariaDescribedby: pgr.getAttribute('aria-describedby'),
        height: pgrStyle.height,
        minHeight: pgrStyle.minHeight,
        borderRadius: pgrStyle.borderRadius,
        borderColor: pgrStyle.borderColor,
        backgroundColor: pgrStyle.backgroundColor,
        color: pgrStyle.color,
      } : null,
      plainPgr: plainPgr && plainPgrStyle ? {
        ariaDescribedby: plainPgr.getAttribute('aria-describedby'),
        height: plainPgrStyle.height,
        borderRadius: plainPgrStyle.borderRadius,
        borderColor: plainPgrStyle.borderColor,
      } : null,
      styleSheets: readableStyleSheets,
    };
  }, { selectedWrapper, selectedForm, plainWrapper, plainForm });

  console.log('SRWF_INITIAL_OBSERVATION=' + JSON.stringify(initial));
  console.log('SRWF_CSS_RESPONSES=' + JSON.stringify(gppCssResponses));

  check(initial.formClass?.split(/\s+/).includes('gpp-enabled'), 'Selected authentic Gravity Form did not receive gpp-enabled.');
  check(initial.formClass?.split(/\s+/).includes('gpp-profile-srwf-registration'), 'Selected authentic Gravity Form did not receive the SRWF profile class.');
  check(initial.wrapperClass?.split(/\s+/).includes('gpp-enabled_wrapper'), 'Selected Gravity Forms wrapper lacks derived GPP runtime identity.');
  check(initial.wrapperClass?.split(/\s+/).includes('gpp-profile-srwf-registration_wrapper'), 'Selected Gravity Forms wrapper lacks derived SRWF profile identity.');
  check(initial.wrapperClass?.split(/\s+/).includes('host-selected-class_wrapper'), 'Existing host form CSS class was not preserved on the selected wrapper.');
  check(initial.formClass?.split(/\s+/).includes('host-selected-class'), 'Existing host form CSS class was not preserved on the selected form.');
  check(!initial.plainFormClass?.split(/\s+/).includes('gpp-enabled'), 'Unselected Gravity Form received gpp-enabled.');
  check(!initial.plainWrapperClass?.split(/\s+/).includes('gpp-enabled_wrapper'), 'Unselected Gravity Forms wrapper received GPP runtime identity.');
  check(initial.plainWrapperClass?.split(/\s+/).includes('host-unselected-class_wrapper'), 'Existing host form CSS class was not preserved on the unrelated wrapper.');
  check(initial.headingInsideWrapper === true && initial.headingInsideForm === false, 'Authentic Gravity Forms heading relationship was not observed.');

  check(gppCssResponses.length >= 2, 'GPP Base + profile stylesheet network responses were not observed.');
  check(gppCssResponses.every((item) => item.status === 200), `A GPP stylesheet failed to load: ${JSON.stringify(gppCssResponses)}.`);
  check(initial.styleSheets.length >= 2, 'GPP Base + profile stylesheets were not attached to the document.');
  check(initial.styleSheets.some((sheet) => Number(sheet.ruleCount) > 0), 'SRWF profile stylesheet contains no readable runtime rules.');

  check(initial.wrapper?.direction === 'rtl', `Selected wrapper direction is ${initial.wrapper?.direction}, expected rtl.`);
  check(initial.wrapper?.paddingInlineStart === '16px' && initial.wrapper?.paddingInlineEnd === '16px', 'Canonical 16px horizontal padding is not applied at the authentic wrapper boundary.');
  check(initial.wrapper?.maxWidth === '840px', `Selected wrapper max-width is ${initial.wrapper?.maxWidth}, expected 840px.`);
  check(initial.wrapper?.borderRadius === '16px', `Selected wrapper radius is ${initial.wrapper?.borderRadius}, expected 16px.`);
  check(initial.wrapper?.backgroundColor === 'rgb(255, 255, 255)', 'Selected wrapper is not the canonical white SRWF surface.');
  check(initial.wrapper?.controlRadiusToken === '10px', `Wrapper control-radius token is ${initial.wrapper?.controlRadiusToken}, expected 10px.`);
  check(initial.wrapper?.controlSizeToken === '52px', `Wrapper control-size token is ${initial.wrapper?.controlSizeToken}, expected 52px.`);

  check(initial.pgr !== null, 'Authentic PersianGravity Jalali input did not render.');
  check(initial.pgr?.type === 'text' && initial.pgr?.inputmode === 'numeric' && initial.pgr?.autocomplete === 'off', 'PersianGravity Jalali input behavior attributes changed unexpectedly.');
  check(parseFloat(initial.pgr?.height || '0') >= 52, `SRWF Jalali control rendered below 52px (${initial.pgr?.height}).`);
  check(initial.pgr?.borderRadius === '10px', `SRWF Jalali control radius is ${initial.pgr?.borderRadius}, expected 10px.`);
  check(initial.plainPgr !== null, 'Unrelated authentic PersianGravity control did not render for isolation comparison.');
  check(initial.plainPgr?.borderRadius !== '10px' || initial.plainPgr?.height !== initial.pgr?.height, 'Unrelated PersianGravity control appears to have received the selected SRWF presentation.');

  const ariaAudit = await page.evaluate(({ selectedForm, plainForm }) => {
    function audit(formSelector) {
      const form = document.querySelector(formSelector);
      const controls = form ? [...form.querySelectorAll('input:not([type="hidden"]), select, textarea')] : [];
      return controls.map((control) => {
        const described = (control.getAttribute('aria-describedby') || '').trim().split(/\s+/).filter(Boolean);
        return {
          id: control.id,
          type: control.getAttribute('type') || control.tagName.toLowerCase(),
          hasLabel: Boolean(control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)),
          describedbyCount: described.length,
          describedbyAllResolve: described.every((id) => Boolean(document.getElementById(id))),
          ariaInvalid: control.getAttribute('aria-invalid'),
          isPgr: control.classList.contains('pgr_jalali_date'),
        };
      });
    }
    return { selected: audit(selectedForm), plain: audit(plainForm) };
  }, { selectedForm, plainForm });

  for (const control of [...ariaAudit.selected, ...ariaAudit.plain]) {
    check(control.hasLabel, `Visible control ${control.id || control.type} is missing its authentic label relation.`);
    check(control.describedbyAllResolve, `aria-describedby on ${control.id || control.type} points to a missing node.`);
  }

  const selectedPgrAria = ariaAudit.selected.find((item) => item.isPgr);
  const plainPgrAria = ariaAudit.plain.find((item) => item.isPgr);
  if (selectedPgrAria && plainPgrAria) {
    check(selectedPgrAria.describedbyCount === plainPgrAria.describedbyCount, 'GPP changed PersianGravity aria-describedby structure relative to the unrelated host control.');
    if (selectedPgrAria.describedbyCount === 0) {
      notes.push('PersianGravity 4.2.0 exposes no aria-describedby relation for this Jalali field in either selected or unrelated authentic rendering; GPP does not add or replace host semantics.');
    }
  }

  const baselineFocus = await page.evaluate((selectedForm) => {
    const form = document.querySelector(selectedForm);
    const controls = form ? [...form.querySelectorAll('input:not([type="hidden"]), select, textarea, button')] : [];
    return controls
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && !element.disabled && element.getClientRects().length > 0;
      })
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          key: element.id || `${element.tagName.toLowerCase()}:${element.getAttribute('type') || ''}`,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
          borderColor: style.borderColor,
        };
      });
  }, selectedForm);

  const baselineByKey = new Map(baselineFocus.map((item) => [item.key, item]));
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const reached = new Map();
  for (let i = 0; i < 30 && reached.size < baselineFocus.length; i += 1) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate((selectedForm) => {
      const element = document.activeElement;
      if (!(element instanceof Element) || !element.closest(selectedForm)) return null;
      const style = getComputedStyle(element);
      return {
        key: element.id || `${element.tagName.toLowerCase()}:${element.getAttribute('type') || ''}`,
        focusVisible: element.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        borderColor: style.borderColor,
      };
    }, selectedForm);
    if (focus) reached.set(focus.key, focus);
  }

  for (const expected of baselineFocus) {
    const focused = reached.get(expected.key);
    check(Boolean(focused), `Keyboard Tab traversal did not reach ${expected.key}.`);
    if (focused) {
      const baseline = baselineByKey.get(expected.key);
      const changed = focused.outlineStyle !== baseline.outlineStyle
        || focused.outlineWidth !== baseline.outlineWidth
        || focused.boxShadow !== baseline.boxShadow
        || focused.borderColor !== baseline.borderColor;
      const hasOutline = focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) > 0;
      check(focused.focusVisible && (changed || hasOutline), `Keyboard focus on ${expected.key} has no observable focus-visible cue.`);
    }
  }

  await page.locator(`${selectedForm} input[type="text"]:not(.pgr_jalali_date)`).fill('Runtime Student');
  await page.locator(`${selectedForm} select`).selectOption('alpha');
  await page.locator(`${selectedForm} input.pgr_jalali_date`).fill('1405/13/40');
  await page.locator(`${selectedForm} input[type="submit"], ${selectedForm} button[type="submit"]`).first().click();
  await page.waitForLoadState('networkidle');
  await page.locator(selectedWrapper).waitFor();

  const invalidState = await page.evaluate(({ selectedWrapper }) => {
    const wrapper = document.querySelector(selectedWrapper);
    const pgr = wrapper?.querySelector('input.pgr_jalali_date');
    const input = wrapper?.querySelector('input[type="text"]:not(.pgr_jalali_date)');
    const error = pgr?.closest('.gfield')?.querySelector('.gfield_validation_message');
    const summary = wrapper?.querySelector('.gform_validation_errors');
    const description = pgr?.closest('.gfield')?.querySelector('.gfield_description:not(.gfield_validation_message)');
    const pgrRect = pgr?.getBoundingClientRect();
    const descriptionRect = description?.getBoundingClientRect();
    const errorRect = error?.getBoundingClientRect();
    const described = (pgr?.getAttribute('aria-describedby') || '').trim().split(/\s+/).filter(Boolean);
    return {
      wrapperClass: wrapper?.className || '',
      summaryPresent: Boolean(summary),
      fieldErrorPresent: Boolean(error),
      pgrAriaInvalid: pgr?.getAttribute('aria-invalid'),
      pgrDescribedby: described,
      pgrDescribedbyAllResolve: described.every((id) => Boolean(document.getElementById(id))),
      pgrValue: pgr?.value,
      nameValue: input?.value,
      helpBelowInput: Boolean(pgrRect && descriptionRect && descriptionRect.top >= pgrRect.bottom),
      errorBelowInput: Boolean(pgrRect && errorRect && errorRect.top >= pgrRect.bottom),
    };
  }, { selectedWrapper });

  check(invalidState.wrapperClass.split(/\s+/).includes('gpp-enabled_wrapper'), 'GPP wrapper identity was lost after authentic server validation re-render.');
  check(invalidState.summaryPresent, 'Authentic Gravity Forms validation summary did not render.');
  check(invalidState.fieldErrorPresent, 'Authentic PersianGravity field validation message did not render.');
  check(invalidState.pgrAriaInvalid === 'true', 'PersianGravity invalid Jalali state did not retain aria-invalid=true.');
  check(invalidState.pgrDescribedbyAllResolve, 'Invalid PersianGravity aria-describedby contains a missing target.');
  check(invalidState.pgrValue === '1405/13/40', 'PersianGravity invalid value was not preserved after host validation.');
  check(invalidState.nameValue === 'Runtime Student', 'Gravity Forms did not preserve the entered student name after validation.');
  check(invalidState.helpBelowInput, 'Canonical help placement is not below the authentic PersianGravity input.');
  check(invalidState.errorBelowInput, 'Canonical validation-message placement is not below the authentic PersianGravity input.');

  await page.setViewportSize({ width: 320, height: 1000 });
  const reflow = await page.evaluate(({ selectedWrapper }) => {
    const wrapper = document.querySelector(selectedWrapper);
    const controls = wrapper ? [...wrapper.querySelectorAll('input:not([type="hidden"]), select, textarea, button')] : [];
    const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
    return {
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : null,
      viewportWidth: window.innerWidth,
      paddingInlineStart: wrapperStyle?.paddingInlineStart ?? null,
      paddingInlineEnd: wrapperStyle?.paddingInlineEnd ?? null,
      controls: controls.filter((element) => element.getClientRects().length > 0).map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.id, left: rect.left, right: rect.right, width: rect.width };
      }),
    };
  }, { selectedWrapper });

  check(reflow.htmlScrollWidth <= 320 && Number(reflow.bodyScrollWidth) <= 320, `320px runtime reflow overflows: html=${reflow.htmlScrollWidth}, body=${reflow.bodyScrollWidth}.`);
  check(reflow.paddingInlineStart === '16px' && reflow.paddingInlineEnd === '16px', 'Selected wrapper lost canonical 16px padding at 320px.');
  for (const control of reflow.controls) {
    check(control.left >= 0 && control.right <= 320.5, `Control ${control.id || '(anonymous)'} overflows the 320px viewport.`);
  }

  await page.setViewportSize({ width: 1280, height: 1000 });
  const contrast = await page.evaluate(({ selectedWrapper }) => {
    const wrapper = document.querySelector(selectedWrapper);
    const label = wrapper?.querySelector('.gfield_label');
    const description = wrapper?.querySelector('.gfield_description:not(.gfield_validation_message)');
    const error = wrapper?.querySelector('.gfield_validation_message');
    const control = wrapper?.querySelector('input.pgr_jalali_date');
    const submit = wrapper?.querySelector('input[type="submit"], button[type="submit"]');
    const read = (element) => element instanceof Element ? getComputedStyle(element) : null;
    const ls = read(label), ds = read(description), es = read(error), cs = read(control), ss = read(submit);
    return {
      label: ls ? { fg: ls.color } : null,
      description: ds ? { fg: ds.color } : null,
      error: es ? { fg: es.color } : null,
      control: cs ? { border: cs.borderColor, bg: cs.backgroundColor, fg: cs.color } : null,
      submit: ss ? { fg: ss.color, bg: ss.backgroundColor } : null,
    };
  }, { selectedWrapper });

  const white = 'rgb(255, 255, 255)';
  const ratios = {
    label: contrast.label ? contrastRatio(contrast.label.fg, white) : null,
    description: contrast.description ? contrastRatio(contrast.description.fg, white) : null,
    error: contrast.error ? contrastRatio(contrast.error.fg, white) : null,
    controlBorder: contrast.control ? contrastRatio(contrast.control.border, contrast.control.bg) : null,
    submit: contrast.submit ? contrastRatio(contrast.submit.fg, contrast.submit.bg) : null,
  };
  check(ratios.label !== null && ratios.label >= 4.5, `Label contrast is ${ratios.label}, expected >= 4.5.`);
  check(ratios.description !== null && ratios.description >= 4.5, `Description contrast is ${ratios.description}, expected >= 4.5.`);
  check(ratios.error !== null && ratios.error >= 4.5, `Error contrast is ${ratios.error}, expected >= 4.5.`);
  check(ratios.controlBorder !== null && ratios.controlBorder >= 3, `Control border contrast is ${ratios.controlBorder}, expected >= 3.`);
  check(ratios.submit !== null && ratios.submit >= 4.5, `Submit text contrast is ${ratios.submit}, expected >= 4.5.`);

  if (failures.length === 0) {
    await page.locator(`${selectedForm} input.pgr_jalali_date`).fill('1405/06/22');
    await page.locator(`${selectedForm} input[type="submit"], ${selectedForm} button[type="submit"]`).first().click();
    await page.waitForLoadState('networkidle');
  }

  const results = {
    schema_version: '1.0.0',
    page_url: pageUrl,
    runtime: manifest.runtime,
    cssResponses: gppCssResponses,
    initial,
    ariaAudit,
    keyboard: { expected: baselineFocus, reached: [...reached.values()] },
    invalidState,
    reflow,
    contrast: { computed: contrast, ratios },
    notes,
    failures,
  };
  fs.writeFileSync(`${artifactDir}/browser-results.json`, JSON.stringify(results, null, 2) + '\n');
  console.log('SRWF_BROWSER_RESULTS=' + JSON.stringify(results));

  if (failures.length) {
    throw new Error(`Authentic SRWF runtime assertions failed:\n- ${failures.join('\n- ')}`);
  }
} finally {
  await browser.close();
}
