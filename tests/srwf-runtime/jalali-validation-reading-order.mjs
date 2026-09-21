import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const baseUrl = process.env.SRWF_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.SRWF_ARTIFACT_DIR;
const manifestPath = process.env.SRWF_MANIFEST_PATH;
if (!artifactDir || !manifestPath) throw new Error('SRWF artifact/manifest environment is required.');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const repoSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const playwrightVersion = JSON.parse(fs.readFileSync('node_modules/playwright/package.json', 'utf8')).version;

function focusKind(id, className, tagName) {
  if (String(className || '').includes('gform_validation_errors')) return 'validation_summary';
  if (String(className || '').includes('pgr_jalali_date')) return 'jalali_control';
  if (String(id || '').includes('gform_submit_button')) return 'submit';
  return tagName ? String(tagName).toLowerCase() : 'none';
}

function deriveAssociationState(observation) {
  const errorId = observation.error_id || null;
  const errorIdUnique = observation.error_id_unique === true;
  const descriptionId = observation.description_id || null;
  const describedByReferences = observation.aria_describedby_references || [];
  const errorMessageReferences = observation.aria_errormessage_references || [];

  const resolvesToError = reference => Boolean(
    errorId &&
    errorIdUnique &&
    reference?.id === errorId &&
    reference?.match_count === 1 &&
    reference?.resolves_to_error === true
  );
  const resolvesToDescription = reference => Boolean(
    descriptionId &&
    reference?.id === descriptionId &&
    reference?.match_count === 1 &&
    reference?.resolves_to_description === true
  );

  const viaDescribedBy = describedByReferences.some(resolvesToError);
  const viaErrorMessage = errorMessageReferences.some(resolvesToError);

  return {
    error_associated: viaDescribedBy || viaErrorMessage,
    error_association_mechanisms: {
      aria_describedby: viaDescribedBy,
      aria_errormessage: viaErrorMessage,
    },
    description_associated: describedByReferences.some(resolvesToDescription),
  };
}

function hostSemanticsPreservedFor(selected, nativeControl) {
  return selected.label_relationship === nativeControl.label_relationship &&
    selected.error_associated === nativeControl.error_associated &&
    selected.aria_invalid === nativeControl.aria_invalid &&
    selected.field_error_count === nativeControl.field_error_count;
}

function runAssociationModelControls() {
  const baseObservation = {
    error_id: 'validation_1',
    error_id_unique: true,
    description_id: 'description_1',
    aria_describedby_references: [],
    aria_errormessage_references: [],
  };
  const resolvedError = {
    id: 'validation_1',
    match_count: 1,
    resolves_to_error: true,
    resolves_to_description: false,
  };
  const resolvedDescription = {
    id: 'description_1',
    match_count: 1,
    resolves_to_error: false,
    resolves_to_description: true,
  };

  const describedByOnly = deriveAssociationState({
    ...baseObservation,
    aria_describedby_references: [resolvedError],
  });
  assert.equal(describedByOnly.error_associated, true);
  assert.equal(describedByOnly.error_association_mechanisms.aria_describedby, true);
  assert.equal(describedByOnly.error_association_mechanisms.aria_errormessage, false);

  const errorMessageOnly = deriveAssociationState({
    ...baseObservation,
    aria_errormessage_references: [resolvedError],
  });
  assert.equal(errorMessageOnly.error_associated, true);
  assert.equal(errorMessageOnly.error_association_mechanisms.aria_describedby, false);
  assert.equal(errorMessageOnly.error_association_mechanisms.aria_errormessage, true);

  const noAssociation = deriveAssociationState(baseObservation);
  assert.equal(noAssociation.error_associated, false);

  const danglingReference = deriveAssociationState({
    ...baseObservation,
    aria_describedby_references: [{
      id: 'validation_1',
      match_count: 0,
      resolves_to_error: false,
      resolves_to_description: false,
    }],
  });
  assert.equal(danglingReference.error_associated, false);

  const differentNodeReference = deriveAssociationState({
    ...baseObservation,
    aria_errormessage_references: [{
      id: 'different_node',
      match_count: 1,
      resolves_to_error: false,
      resolves_to_description: false,
    }],
  });
  assert.equal(differentNodeReference.error_associated, false);

  const descriptionOnly = deriveAssociationState({
    ...baseObservation,
    aria_describedby_references: [resolvedDescription],
  });
  assert.equal(descriptionOnly.description_associated, true);
  assert.equal(descriptionOnly.error_associated, false);

  const selected = {
    label_relationship: true,
    aria_invalid: 'true',
    field_error_count: 1,
    ...errorMessageOnly,
  };
  const nativeControl = {
    label_relationship: true,
    aria_invalid: 'true',
    field_error_count: 1,
    ...describedByOnly,
  };
  assert.equal(hostSemanticsPreservedFor(selected, nativeControl), true);
  assert.equal(hostSemanticsPreservedFor({ ...selected, ...danglingReference }, nativeControl), false);

  return {
    aria_describedby_positive: 'PASS',
    aria_errormessage_positive: 'PASS',
    missing_association_negative: 'PASS',
    dangling_reference_negative: 'PASS',
    different_node_negative: 'PASS',
    description_independent: 'PASS',
    selected_native_corrected_model: 'PASS',
  };
}

async function submitInvalidJalali(page, formId, expectedGpp) {
  await page.goto(`${baseUrl}/?page_id=${manifest.page_id}`, { waitUntil: 'networkidle' });
  const wrapper = page.locator(`#gform_wrapper_${formId}`);
  await wrapper.waitFor({ state: 'visible' });

  const text = wrapper.locator('input[type="text"]:not(.pgr_jalali_date)').first();
  const select = wrapper.locator('select').first();
  if (await text.count()) await text.fill('Synthetic Student');
  if (await select.count()) await select.selectOption({ index: 1 });

  const jalali = wrapper.locator('input.pgr_jalali_date').first();
  if (await jalali.count() !== 1) throw new Error(`Jalali control unavailable for form ${formId}.`);
  await jalali.fill('');

  const submit = wrapper.locator('input[type="submit"], button[type="submit"]').last();
  if (await submit.count() !== 1) throw new Error(`Submit control unavailable for form ${formId}.`);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    submit.click(),
  ]);

  const result = await page.evaluate(({ formId, expectedGpp }) => {
    const wrapper = document.querySelector(`#gform_wrapper_${formId}`);
    const field = wrapper?.querySelector('.gfield--type-pgr_jalali_date.gfield_error');
    const input = field?.querySelector('input.pgr_jalali_date');
    const label = field?.querySelector('.gfield_label');
    const control = field?.querySelector('.ginput_container');
    const error = field?.querySelector('.gfield_validation_message');
    const description = field?.querySelector('.gfield_description:not(.gfield_validation_message)');
    const summary = wrapper?.querySelector('.gform_validation_errors');
    const direct = field ? Array.from(field.children) : [];
    const directIndex = node => node ? direct.indexOf(node) : -1;
    const rect = node => node ? node.getBoundingClientRect() : null;
    const active = document.activeElement;
    const nodesWithIds = Array.from(document.querySelectorAll('[id]'));
    const referenceEvidence = attributeName => {
      const raw = input?.getAttribute(attributeName) ?? null;
      const ids = String(raw || '').split(/\s+/).filter(Boolean);
      return {
        raw,
        ids,
        references: ids.map(id => {
          const matches = nodesWithIds.filter(node => node.id === id);
          const resolvedNode = matches.length === 1 ? matches[0] : null;
          return {
            id,
            match_count: matches.length,
            resolves_to_error: Boolean(resolvedNode && error && resolvedNode === error),
            resolves_to_description: Boolean(resolvedNode && description && resolvedNode === description),
          };
        }),
      };
    };
    const describedBy = referenceEvidence('aria-describedby');
    const errorMessage = referenceEvidence('aria-errormessage');
    const errorId = error?.id || null;
    const errorIdMatchCount = errorId ? nodesWithIds.filter(node => node.id === errorId).length : 0;
    const labelFor = label?.getAttribute('for') || null;
    const inputId = input?.id || null;
    const inputRect = rect(input);
    const controlRect = rect(control);
    const errorRect = rect(error);
    const labelRect = rect(label);
    const fieldStyle = field ? getComputedStyle(field) : null;
    return {
      form_id: formId,
      expected_gpp: expectedGpp,
      gpp_active: Boolean(wrapper?.classList.contains('gpp-enabled_wrapper')),
      validation_summary_present: Boolean(summary),
      field_error_present: Boolean(field),
      field_error_count: field?.querySelectorAll('.gfield_validation_message').length || 0,
      input_id: inputId,
      label_for: labelFor,
      label_relationship: Boolean(inputId && labelFor === inputId),
      aria_invalid: input?.getAttribute('aria-invalid') || null,
      aria_describedby_raw: describedBy.raw,
      aria_describedby: describedBy.ids,
      aria_describedby_references: describedBy.references,
      aria_errormessage_raw: errorMessage.raw,
      aria_errormessage: errorMessage.ids,
      aria_errormessage_references: errorMessage.references,
      error_id: errorId,
      error_id_unique: Boolean(errorId && errorIdMatchCount === 1),
      error_id_match_count: errorIdMatchCount,
      description_id: description?.id || null,
      source_order: direct.map((node, index) => ({
        index,
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        class_name: node.className || null,
      })),
      source_indices: {
        label: directIndex(label),
        control: directIndex(control),
        error: directIndex(error),
        description: directIndex(description),
      },
      css_orders: {
        label: label ? getComputedStyle(label).order : null,
        control: control ? getComputedStyle(control).order : null,
        error: error ? getComputedStyle(error).order : null,
        description: description ? getComputedStyle(description).order : null,
      },
      visual_tops: {
        label: labelRect?.top ?? null,
        control: controlRect?.top ?? null,
        input: inputRect?.top ?? null,
        error: errorRect?.top ?? null,
      },
      visual_error_after_control: Boolean(controlRect && errorRect && errorRect.top >= controlRect.bottom - 1),
      direction: fieldStyle?.direction || null,
      active_after_validation: {
        id: active?.id || null,
        class_name: active?.className || null,
        tag: active?.tagName || null,
      },
      summary_role: summary?.getAttribute('role') || null,
      summary_tabindex: summary?.getAttribute('tabindex') || null,
      field_html_marker_count: field ? field.querySelectorAll('[id]').length : 0,
    };
  }, { formId, expectedGpp });

  Object.assign(result, deriveAssociationState(result));
  result.active_after_validation.kind = focusKind(
    result.active_after_validation.id,
    result.active_after_validation.class_name,
    result.active_after_validation.tag,
  );

  const before = await page.evaluate(() => ({
    id: document.activeElement?.id || null,
    className: document.activeElement?.className || null,
    tag: document.activeElement?.tagName || null,
  }));
  await page.keyboard.press('Tab');
  const after = await page.evaluate(() => ({
    id: document.activeElement?.id || null,
    className: document.activeElement?.className || null,
    tag: document.activeElement?.tagName || null,
  }));
  result.keyboard = {
    before_kind: focusKind(before.id, before.className, before.tag),
    after_kind: focusKind(after.id, after.className, after.tag),
    focus_moved: `${before.tag}|${before.id}|${before.className}` !== `${after.tag}|${after.id}|${after.className}`,
  };
  return result;
}

const qualificationModelControls = runAssociationModelControls();
const browser = await chromium.launch({ headless: true });
let selected;
let nativeControl;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  selected = await submitInvalidJalali(page, manifest.selected_form.id, true);
  nativeControl = await submitInvalidJalali(page, manifest.plain_form.id, false);
} finally {
  await browser.close();
}

const requiredCurrent = [
  selected.field_error_present,
  selected.validation_summary_present,
  selected.field_error_count === 1,
  selected.label_relationship,
  selected.aria_invalid === 'true',
  selected.error_associated,
  selected.visual_error_after_control,
  selected.direction === 'rtl',
  selected.keyboard.focus_moved,
];
const hostSemanticsPreserved = hostSemanticsPreservedFor(selected, nativeControl);

let disposition = 'CURRENT_BEHAVIOR_QUALIFIED';
let hardGate = 'PASS';
if (!selected.field_error_present || !nativeControl.field_error_present) {
  disposition = 'NOT_PROVEN';
  hardGate = 'NOT_PROVEN';
} else if (requiredCurrent.some(value => !value)) {
  disposition = 'CONFIRMED_A11Y_DEFECT';
  hardGate = 'FAIL';
} else if (!hostSemanticsPreserved) {
  disposition = 'METHOD_CHANGE_REQUIRED';
  hardGate = 'FAIL';
}

const evidence = {
  schema_version: '1.0.0',
  work_unit: 'GPP-RP-WU-05-JALALI-VALIDATION-READING-ORDER',
  problems: ['P-24'],
  claim_ceiling: 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  repository_head: repoSha,
  objective: 'Qualify Jalali validation reading order and accessibility without changing host-owned validation semantics.',
  non_goals: ['Jalali stored/display conversion', 'production CSS repair', 'Gravity Forms validation replacement'],
  runtime: {
    wordpress: '6.8.3',
    gravity_forms: manifest.runtime.gravity_forms_version,
    persian_gravity: manifest.runtime.persiangravity_version,
    node: process.version,
    playwright: playwrightVersion,
    browser: 'chromium',
  },
  qualification_model_controls: qualificationModelControls,
  control: nativeControl,
  current_gpp: selected,
  hard_gates: {
    validation_failure_authentic: selected.field_error_present && nativeControl.field_error_present,
    one_field_error_only: selected.field_error_count === 1,
    label_relationship: selected.label_relationship,
    aria_invalid: selected.aria_invalid === 'true',
    error_association: selected.error_associated,
    visual_error_after_control: selected.visual_error_after_control,
    rtl: selected.direction === 'rtl',
    keyboard_not_trapped: selected.keyboard.focus_moved,
    host_semantics_preserved: hostSemanticsPreserved,
  },
  hard_gate_result: hardGate,
  disposition,
  interpretation: selected.source_indices.error !== selected.source_indices.control
    ? 'DOM and visual order are evaluated together with explicit label/error associations; DOM-order difference alone is not classified as a defect.'
    : 'DOM and visual order are aligned; accessibility is still decided from the full semantic/focus evidence.',
};

fs.mkdirSync(artifactDir, { recursive: true });
const out = `${artifactDir}/gpp-rp-wu05-jalali-validation-reading-order.json`;
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ status: 'EVIDENCE_COMPLETE', disposition, hard_gate_result: hardGate, artifact: out }));
