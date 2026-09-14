import fs from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.SRWF_BASE_URL;
const manifestPath = process.env.SRWF_MANIFEST_PATH;
const artifactDir = process.env.SRWF_ARTIFACT_DIR;
if (!baseUrl || !manifestPath || !artifactDir) {
  throw new Error('SRWF_BASE_URL, SRWF_MANIFEST_PATH, and SRWF_ARTIFACT_DIR are required.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const plainId = manifest.plain_form?.id;
const controlId = manifest.sparse_control_form?.id;
const compositionId = manifest.sparse_composition_form?.id;
const capabilityId = manifest.sparse_capability_form?.id;
if (!plainId || !controlId || !compositionId || !capabilityId) {
  throw new Error('Sparse authentic runtime fixtures are missing from the manifest.');
}

const pageUrl = `${baseUrl}/?page_id=${manifest.page_id}`;
const selectors = {
  plain: `#gform_wrapper_${plainId}`,
  control: `#gform_wrapper_${controlId}`,
  composition: `#gform_wrapper_${compositionId}`,
  capability: `#gform_wrapper_${capabilityId}`,
};
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function equalPresentation(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${message}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });

try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  for (const selector of Object.values(selectors)) {
    await page.locator(selector).waitFor();
  }

  const snapshots = await page.evaluate((selectors) => {
    const styleValues = (element, properties) => {
      if (!(element instanceof Element)) return null;
      const style = getComputedStyle(element);
      const values = {};
      for (const property of properties) {
        values[property] = style[property];
      }
      return values;
    };

    const customValues = (element, properties) => {
      if (!(element instanceof Element)) return null;
      const style = getComputedStyle(element);
      const values = {};
      for (const property of properties) {
        values[property] = style.getPropertyValue(property).trim();
      }
      return values;
    };

    const snapshot = (selector) => {
      const wrapper = document.querySelector(selector);
      if (!(wrapper instanceof Element)) return null;
      const text = wrapper.querySelector('input[type="text"]:not(.pgr_jalali_date)');
      const label = wrapper.querySelector('.gfield_label');
      const description = wrapper.querySelector('.gfield_description:not(.validation_message)');
      const sectionTitle = wrapper.querySelector('.gsection_title');
      const sectionDescription = wrapper.querySelector('.gsection_description');
      const submit = wrapper.querySelector('input[type="submit"], button[type="submit"]');

      return {
        className: wrapper.className,
        presenceClasses: wrapper.className.split(/\s+/).filter((item) => item.startsWith('gpp-has-')).sort(),
        wrapper: styleValues(wrapper, [
          'direction',
          'maxWidth',
          'paddingInlineStart',
          'paddingInlineEnd',
          'borderRadius',
          'backgroundColor',
          'fontFamily',
        ]),
        text: styleValues(text, [
          'backgroundColor',
          'color',
          'borderColor',
          'borderRadius',
          'height',
          'fontSize',
          'fontWeight',
          'fontFamily',
        ]),
        label: styleValues(label, ['color', 'fontSize', 'fontWeight', 'fontFamily']),
        description: styleValues(description, ['color', 'fontSize', 'fontWeight', 'fontFamily']),
        sectionTitle: styleValues(sectionTitle, ['color', 'fontSize', 'fontWeight', 'fontFamily']),
        sectionDescription: styleValues(sectionDescription, ['color', 'fontSize', 'fontWeight', 'fontFamily']),
        submit: styleValues(submit, ['backgroundColor', 'color', 'height', 'fontSize', 'fontWeight', 'fontFamily']),
        hostVars: {
          wrapper: customValues(wrapper, [
            '--gf-ctrl-bg-color',
            '--gf-ctrl-color',
            '--gf-ctrl-border-color',
            '--gf-ctrl-border-color-focus',
            '--gf-ctrl-border-color-error',
            '--gf-ctrl-radius',
            '--gf-ctrl-size',
            '--gf-ctrl-font-family',
            '--gf-ctrl-font-size',
            '--gf-ctrl-font-weight',
            '--gf-ctrl-label-color-primary',
            '--gf-ctrl-label-font-size-primary',
            '--gf-ctrl-label-font-weight-primary',
            '--gf-ctrl-label-color-req',
            '--gf-ctrl-desc-color',
            '--gf-ctrl-desc-color-error',
            '--gf-field-section-border-color',
            '--gf-ctrl-btn-bg-color-primary',
            '--gf-ctrl-btn-size',
            '--gf-ctrl-btn-font-size',
            '--gf-ctrl-btn-font-weight',
            '--gf-form-validation-color',
          ]),
          text: customValues(text, [
            '--gf-ctrl-size',
            '--gf-ctrl-border-color-focus',
          ]),
          submit: customValues(submit, [
            '--gf-ctrl-btn-size',
            '--gf-ctrl-btn-border-color-focus-primary',
          ]),
        },
        gppVars: customValues(wrapper, [
          '--gpp-control-background',
          '--gpp-control-text',
          '--gpp-control-border',
          '--gpp-control-focus-border',
          '--gpp-control-radius',
          '--gpp-control-min-height',
          '--gpp-control-font-size',
          '--gpp-control-font-weight',
          '--gpp-form-direction',
          '--gpp-form-max-inline-size',
          '--gpp-form-inline-padding',
          '--gpp-form-surface-background',
          '--gpp-form-surface-radius',
          '--gpp-form-font-family',
          '--gpp-primary-action-background',
          '--gpp-primary-action-focus-border',
          '--gpp-primary-action-min-height',
          '--gpp-validation-error-color',
        ]),
      };
    };

    return {
      plain: snapshot(selectors.plain),
      control: snapshot(selectors.control),
      composition: snapshot(selectors.composition),
      capability: snapshot(selectors.capability),
    };
  }, selectors);

  console.log('GPP_SPARSE_DECLARATIVE_INITIAL=' + JSON.stringify(snapshots));

  for (const [name, snapshot] of Object.entries(snapshots)) {
    check(snapshot !== null, `${name} sparse-comparison form was not rendered.`);
  }

  check(
    JSON.stringify(snapshots.control?.presenceClasses) === JSON.stringify(['gpp-has-controls-background_wrapper']),
    `Sparse control profile emitted unexpected preference markers: ${JSON.stringify(snapshots.control?.presenceClasses)}.`
  );
  check(
    JSON.stringify(snapshots.composition?.presenceClasses) === JSON.stringify(['gpp-has-composition-direction_wrapper']),
    `Sparse composition profile emitted unexpected preference markers: ${JSON.stringify(snapshots.composition?.presenceClasses)}.`
  );
  check(
    JSON.stringify(snapshots.capability?.presenceClasses) === JSON.stringify([]),
    `Capability-only profile must emit no optional preference marker: ${JSON.stringify(snapshots.capability?.presenceClasses)}.`
  );
  check(
    snapshots.capability?.className?.split(/\s+/).includes(manifest.sparse_capability_form.expected_capability_class),
    'Capability-only profile lost its admitted structural capability marker.'
  );

  check(snapshots.control?.gppVars?.['--gpp-control-background'] === manifest.sparse_control_form.expected_control_background,
    'Sparse control profile did not emit its declared control background token.');
  check(snapshots.control?.text?.backgroundColor === 'rgb(224, 242, 254)',
    `Sparse control background did not apply to the authentic Gravity Forms control: ${snapshots.control?.text?.backgroundColor}.`);

  for (const [property, value] of Object.entries(snapshots.control?.gppVars || {})) {
    if (property === '--gpp-control-background') continue;
    check(value === '', `Sparse control profile unexpectedly emitted undeclared ${property}=${value}.`);
  }

  const controlComparable = clone(snapshots.control);
  const controlBaseline = clone(snapshots.plain);
  delete controlComparable.className;
  delete controlComparable.presenceClasses;
  delete controlBaseline.className;
  delete controlBaseline.presenceClasses;
  controlComparable.text.backgroundColor = controlBaseline.text.backgroundColor;
  controlComparable.hostVars.wrapper['--gf-ctrl-bg-color'] = controlBaseline.hostVars.wrapper['--gf-ctrl-bg-color'];
  controlComparable.gppVars['--gpp-control-background'] = controlBaseline.gppVars['--gpp-control-background'];
  equalPresentation(
    controlComparable,
    controlBaseline,
    'Sparse controls.background changed presentation outside the one declared control-background preference.'
  );

  check(snapshots.composition?.wrapper?.direction === manifest.sparse_composition_form.expected_direction,
    `Sparse composition direction is ${snapshots.composition?.wrapper?.direction}, expected ${manifest.sparse_composition_form.expected_direction}.`);
  check(snapshots.composition?.gppVars?.['--gpp-form-direction'] === manifest.sparse_composition_form.expected_direction,
    'Sparse composition profile did not emit its declared direction value.');
  for (const [property, value] of Object.entries(snapshots.composition?.gppVars || {})) {
    if (property === '--gpp-form-direction') continue;
    check(value === '', `Sparse composition profile unexpectedly emitted undeclared ${property}=${value}.`);
  }

  const compositionComparable = clone(snapshots.composition);
  const compositionBaseline = clone(snapshots.plain);
  delete compositionComparable.className;
  delete compositionComparable.presenceClasses;
  delete compositionBaseline.className;
  delete compositionBaseline.presenceClasses;
  compositionComparable.wrapper.direction = compositionBaseline.wrapper.direction;
  compositionComparable.gppVars['--gpp-form-direction'] = compositionBaseline.gppVars['--gpp-form-direction'];
  equalPresentation(
    compositionComparable,
    compositionBaseline,
    'Sparse composition.direction changed undeclared host composition/control/action presentation.'
  );

  for (const [property, value] of Object.entries(snapshots.capability?.gppVars || {})) {
    check(value === '', `Capability-only profile unexpectedly emitted optional ${property}=${value}.`);
  }
  const capabilityComparable = clone(snapshots.capability);
  const capabilityBaseline = clone(snapshots.plain);
  delete capabilityComparable.className;
  delete capabilityComparable.presenceClasses;
  delete capabilityBaseline.className;
  delete capabilityBaseline.presenceClasses;
  equalPresentation(
    capabilityComparable,
    capabilityBaseline,
    'Capability-only profile reset or changed host metrics/focus/presentation without corresponding preference evidence.'
  );

  const evidence = { pageUrl, snapshots, failures };
  fs.writeFileSync(`${artifactDir}/sparse-declarative-runtime.json`, JSON.stringify(evidence, null, 2) + '\n');

  if (failures.length) {
    throw new Error(`Sparse declarative runtime failures:\n- ${failures.join('\n- ')}`);
  }

  console.log('GPP_SPARSE_DECLARATIVE_RUNTIME_PASS');
} finally {
  await browser.close();
}
