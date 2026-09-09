import { assert, evaluate, pressTab, contrastRatio } from './browser-cdp.mjs';

export async function runBrowserAssertions(client) {
  const layout = await evaluate(client, `(() => {
    const form = document.getElementById('selected-form');
    const cs = getComputedStyle(form);
    const controls = [...document.querySelectorAll('#selected-form input, #selected-form select, #selected-form textarea, #selected-form button')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, left: r.left, right: r.right, width: r.width };
    });
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      paddingInlineStart: cs.paddingInlineStart,
      paddingInlineEnd: cs.paddingInlineEnd,
      controls
    };
  })()`);
  assert(layout.innerWidth === 320, `Expected 320 CSS px viewport, observed ${layout.innerWidth}`);
  assert(layout.scrollWidth <= 320 && layout.bodyScrollWidth <= 320, `Ordinary fixture overflows horizontally: html=${layout.scrollWidth}, body=${layout.bodyScrollWidth}`);
  assert(layout.paddingInlineStart === '16px' && layout.paddingInlineEnd === '16px', `Canonical selected-form padding not observed: ${layout.paddingInlineStart}/${layout.paddingInlineEnd}`);
  for (const control of layout.controls) {
    assert(control.left >= -0.01 && control.right <= 320.01 && control.width > 0, `Required control outside 320px viewport: ${JSON.stringify(control)}`);
  }

  const aria = await evaluate(client, `(() => {
    return [...document.querySelectorAll('#selected-form [data-expected-describedby]')].map((el) => ({
      id: el.id,
      actual: el.getAttribute('aria-describedby'),
      expected: el.dataset.expectedDescribedby,
      labelFor: document.querySelector('label[for="' + el.id + '"]')?.htmlFor || null,
      referencedExist: (el.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean).every((id) => !!document.getElementById(id))
    }));
  })()`);
  for (const relation of aria) {
    assert(relation.actual === relation.expected, `aria-describedby changed for ${relation.id}: ${relation.actual}`);
    assert(relation.labelFor === relation.id, `label relationship missing for ${relation.id}`);
    assert(relation.referencedExist, `aria-describedby target missing for ${relation.id}`);
  }

  await evaluate(client, `document.body.setAttribute('tabindex','-1'); document.body.focus(); document.activeElement === document.body`);
  const expectedFocusOrder = ['fixture-name','fixture-select','fixture-error','fixture-notes','fixture-consent','fixture-submit','disabled-input'];
  const focusEvidence = [];
  for (const expected of expectedFocusOrder) {
    await pressTab(client);
    const observed = await evaluate(client, `(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return { id: el.id, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, backgroundColor: cs.backgroundColor, rect: {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom} };
    })()`);
    assert(observed.id === expected, `Keyboard focus order mismatch: expected ${expected}, observed ${observed.id}`);
    assert(observed.outlineStyle !== 'none' && parseFloat(observed.outlineWidth) > 0, `No observable focus cue for ${expected}`);
    focusEvidence.push(observed);
  }

  const contrast = await evaluate(client, `(() => {
    function styles(id) { const cs = getComputedStyle(document.getElementById(id)); return { color: cs.color, background: cs.backgroundColor, border: cs.borderTopColor }; }
    const primary = styles('contrast-primary');
    const muted = styles('contrast-muted');
    const error = styles('contrast-error');
    const success = styles('contrast-success');
    const border = styles('contrast-border');
    const focus = getComputedStyle(document.getElementById('fixture-name'));
    return { primary, muted, error, success, border, focus: { outlineColor: focus.outlineColor, background: focus.backgroundColor } };
  })()`);

  const pairs = [
    ['primary normal text', contrast.primary.color, contrast.primary.background, 4.5],
    ['muted meaningful text', contrast.muted.color, contrast.muted.background, 4.5],
    ['error text', contrast.error.color, contrast.error.background, 4.5],
    ['success text', contrast.success.color, contrast.success.background, 4.5],
    ['resting control border UI cue', contrast.border.border, contrast.border.background, 3.0],
    ['fixture focus cue using canonical focus color basis', focusEvidence[0].outlineColor, focusEvidence[0].backgroundColor, 3.0]
  ];
  const contrastEvidence = [];
  for (const [label, foreground, background, threshold] of pairs) {
    const ratio = contrastRatio(foreground, background);
    assert(ratio + 1e-9 >= threshold, `${label} contrast ${ratio.toFixed(3)} is below ${threshold}:1 (${foreground} / ${background})`);
    contrastEvidence.push({ label, foreground, background, ratio: Number(ratio.toFixed(3)), threshold });
  }

  const isolation = await evaluate(client, `(() => {
    const selected = getComputedStyle(document.getElementById('selected-form'));
    const disabled = getComputedStyle(document.getElementById('disabled-form'));
    const outside = getComputedStyle(document.getElementById('outside-sentinel'));
    return {
      selected: {
        primary: selected.getPropertyValue('--gf-color-primary').trim(),
        controlText: selected.getPropertyValue('--gf-ctrl-color').trim(),
        mutedText: selected.getPropertyValue('--gf-ctrl-desc-color').trim(),
        errorText: selected.getPropertyValue('--gf-ctrl-desc-color-error').trim(),
        success: selected.getPropertyValue('--gf-color-success').trim(),
        controlBorder: selected.getPropertyValue('--gf-ctrl-border-color').trim(),
        focusColor: selected.getPropertyValue('--gf-ctrl-border-color-focus').trim(),
        controlBackground: selected.getPropertyValue('--gf-ctrl-bg-color').trim(),
        paddingStart: selected.paddingInlineStart,
        paddingEnd: selected.paddingInlineEnd,
        radius: selected.borderRadius,
        direction: selected.direction
      },
      disabled: {
        primary: disabled.getPropertyValue('--gf-color-primary').trim(),
        paddingStart: disabled.paddingInlineStart,
        radius: disabled.borderRadius,
        direction: disabled.direction
      },
      outside: {
        primary: outside.getPropertyValue('--gf-color-primary').trim(),
        paddingStart: outside.paddingInlineStart,
        radius: outside.borderRadius
      }
    };
  })()`);
  assert(isolation.selected.primary !== '', 'Selected form did not receive production profile custom properties');
  const expectedTokens = {
    primary: '#1D4ED8',
    controlText: '#172033',
    mutedText: '#667085',
    errorText: '#B42318',
    success: '#18794E',
    controlBorder: '#8690A1',
    focusColor: '#1D4ED8',
    controlBackground: '#FFFFFF'
  };
  for (const [name, expected] of Object.entries(expectedTokens)) {
    assert(isolation.selected[name].toUpperCase() === expected, `Canonical production token ${name} mismatch: expected ${expected}, observed ${isolation.selected[name]}`);
  }
  assert(isolation.disabled.primary === '' && isolation.outside.primary === '', 'Profile custom property leaked outside selected form');
  assert(isolation.selected.paddingStart === '16px' && isolation.selected.paddingEnd === '16px', `Selected form profile padding missing: ${isolation.selected.paddingStart}/${isolation.selected.paddingEnd}`);
  assert(isolation.disabled.paddingStart === '0px', `Profile padding leaked to disabled form: ${isolation.disabled.paddingStart}`);
  assert(isolation.selected.radius === '16px' && isolation.disabled.radius === '0px', `Profile radius isolation failed: ${JSON.stringify(isolation)}`);
  assert(isolation.selected.direction === 'rtl' && isolation.disabled.direction === 'ltr', `Profile direction isolation failed: ${JSON.stringify(isolation)}`);
  return { layout, aria, focusEvidence, contrastEvidence, isolation };
}
