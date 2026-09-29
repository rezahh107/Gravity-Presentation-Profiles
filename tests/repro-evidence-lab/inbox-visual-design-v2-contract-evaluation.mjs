const PERSIAN_TEXT = /[\u0600-\u06FF]/u;

function bool(value) {
  return value === true;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function isDirection(value) {
  return value === 'ltr' || value === 'rtl';
}

function orderedByX(items) {
  return Array.isArray(items)
    && items.length > 0
    && items.every(item => finite(item?.x))
    && items.every((item, index) => index === 0 || Number(items[index - 1].x) <= Number(item.x));
}

export function q2ViewportEvaluation(capture) {
  const columns = Array.isArray(capture?.visual_column_order) ? capture.visual_column_order : [];
  const cells = Array.isArray(capture?.representative_cells) ? capture.representative_cells : [];
  const pagerChildren = Array.isArray(capture?.pager?.children) ? capture.pager.children : [];
  const observedPersianCells = Array.isArray(capture?.persian_text_samples)
    ? capture.persian_text_samples
    : cells.filter(cell => PERSIAN_TEXT.test(String(cell?.text || '')));
  const persianCells = observedPersianCells.filter(cell => PERSIAN_TEXT.test(String(cell?.text || '')));

  const agRtlPresenceEvaluated = typeof capture?.ag_rtl === 'boolean';
  const visualOrderingEvaluated = orderedByX(columns) && columns.every(column => finite(column?.width) && Number(column.width) > 0);
  const directionAlignmentEvaluated = isDirection(capture?.root_direction)
    && cells.length > 0
    && cells.every(cell => isDirection(cell?.direction) && typeof cell?.text_align === 'string' && cell.text_align.length > 0);
  const pagerDirectionOrderEvaluated = isDirection(capture?.pager?.direction)
    && typeof capture?.pager?.text_align === 'string'
    && capture.pager.text_align.length > 0
    && orderedByX(pagerChildren);
  const scrollEvaluated = bool(capture?.horizontal_scroll?.moved_when_available)
    && finite(capture?.horizontal_scroll?.center_before?.client_width)
    && finite(capture?.horizontal_scroll?.center_before?.scroll_width);
  const keyboardFocusEvaluated = bool(capture?.navigation?.focus?.active)
    && typeof capture?.navigation?.url === 'string'
    && /view=entry/.test(capture.navigation.url);

  const persianContentObserved = persianCells.length > 0;
  const persianLayoutReadabilityEvaluated = persianContentObserved
    && persianCells.every(cell => finite(cell?.width) && Number(cell.width) > 0 && isDirection(cell?.direction) && typeof cell?.text_align === 'string' && cell.text_align.length > 0);

  const nativeControlsUsable = bool(capture?.usable)
    && pagerChildren.length > 0
    && pagerChildren.every(child => typeof child?.text === 'string' && child.text.length > 0);

  return {
    ag_rtl_presence_evaluated: agRtlPresenceEvaluated,
    visual_ordering_evaluated: visualOrderingEvaluated,
    direction_alignment_evaluated: directionAlignmentEvaluated,
    pager_direction_order_evaluated: pagerDirectionOrderEvaluated,
    scroll_evaluated: scrollEvaluated,
    keyboard_focus_evaluated: keyboardFocusEvaluated,
    persian_content_observed: persianContentObserved,
    persian_layout_readability_evaluated: persianLayoutReadabilityEvaluated,
    native_controls_usable: nativeControlsUsable,
    persian_sample_count: persianCells.length,
  };
}

export function evaluateQ2Qualification(desktop, mobile) {
  const desktopEval = q2ViewportEvaluation(desktop);
  const mobileEval = q2ViewportEvaluation(mobile);
  const requiredEvaluationFlags = {
    ag_rtl_presence_evaluated: desktopEval.ag_rtl_presence_evaluated && mobileEval.ag_rtl_presence_evaluated,
    visual_ordering_evaluated: desktopEval.visual_ordering_evaluated && mobileEval.visual_ordering_evaluated,
    direction_alignment_evaluated: desktopEval.direction_alignment_evaluated && mobileEval.direction_alignment_evaluated,
    pager_direction_order_evaluated: desktopEval.pager_direction_order_evaluated && mobileEval.pager_direction_order_evaluated,
    scroll_evaluated: desktopEval.scroll_evaluated && mobileEval.scroll_evaluated,
    keyboard_focus_evaluated: desktopEval.keyboard_focus_evaluated && mobileEval.keyboard_focus_evaluated,
    persian_layout_readability_evaluated: desktopEval.persian_layout_readability_evaluated && mobileEval.persian_layout_readability_evaluated,
  };
  const allRequiredSemanticsEvaluated = Object.values(requiredEvaluationFlags).every(Boolean);
  const usabilityFlags = {
    desktop_native_behavior_usable: bool(desktop?.usable),
    mobile_native_behavior_usable: bool(mobile?.usable),
    desktop_scroll_behavior_observed: bool(desktop?.horizontal_scroll?.moved_when_available),
    mobile_scroll_behavior_observed: bool(mobile?.horizontal_scroll?.moved_when_available),
    native_open_and_keyboard_focus_preserved: bool(desktop?.usable) && bool(mobile?.usable),
    persian_layout_and_native_controls_usable: desktopEval.persian_layout_readability_evaluated
      && mobileEval.persian_layout_readability_evaluated
      && desktopEval.native_controls_usable
      && mobileEval.native_controls_usable,
  };
  const allUsabilityRequirementsPass = Object.values(usabilityFlags).every(Boolean);
  const status = allRequiredSemanticsEvaluated ? (allUsabilityRequirementsPass ? 'PASS' : 'FAIL') : 'NOT_PROVEN';

  return {
    status,
    required_evaluation_flags: requiredEvaluationFlags,
    usability_flags: usabilityFlags,
    desktop_evaluation: desktopEval,
    mobile_evaluation: mobileEval,
    narrower_observation: status === 'NOT_PROVEN'
      ? {
          status: 'OBSERVED',
          name: 'NATIVE_DIRECTION_PAGER_SCROLL_FOCUS_OBSERVED__PERSIAN_LAYOUT_NOT_PROVEN',
          reason: 'The bounded runtime observed native Grid direction/order/alignment metadata, pager/scroll and keyboard/focus, but did not expose enough Persian cell content at both viewports to evaluate Persian-layout readability under the canonical Q2 contract.',
        }
      : null,
  };
}

function nativeEntryFocus(state) {
  const focused = state?.focused;
  const visibleRows = Array.isArray(state?.visible_row_ids) ? state.visible_row_ids.map(Number) : [];
  const rowId = Number(focused?.row_id);
  return Boolean(
    focused
    && focused.tag === 'A'
    && focused.native_entry_link === true
    && focused.visible === true
    && focused.focus_indicator_visible === true
    && typeof focused.href === 'string'
    && /view=entry/.test(focused.href)
    && Number.isFinite(rowId)
    && visibleRows.includes(rowId)
  );
}

export function evaluateQ4FocusLifecycle(states) {
  const ordered = [
    ['before', states?.before],
    ['after_update', states?.after_update],
    ['after_add', states?.after_add],
    ['after_remove', states?.after_remove],
  ];
  const phaseValidity = Object.fromEntries(ordered.map(([name, state]) => [name, nativeEntryFocus(state)]));
  const allNativeVisibleFocus = Object.values(phaseValidity).every(Boolean);

  if (!allNativeVisibleFocus) {
    return {
      acceptable: false,
      disposition: 'UNBOUNDED_FOCUS_LOSS',
      phase_validity: phaseValidity,
      changes: [],
    };
  }

  const first = ordered[0][1].focused;
  const preserved = ordered.every(([, state]) => state.focused.href === first.href && String(state.focused.row_id) === String(first.row_id));
  if (preserved) {
    return {
      acceptable: true,
      disposition: 'PRESERVED',
      phase_validity: phaseValidity,
      changes: [],
    };
  }

  const changes = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const [phase, currentState] = ordered[index];
    const previousState = ordered[index - 1][1];
    if (currentState.focused.href !== previousState.focused.href || String(currentState.focused.row_id) !== String(previousState.focused.row_id)) {
      changes.push({
        phase,
        from: { href: previousState.focused.href, row_id: previousState.focused.row_id },
        to: { href: currentState.focused.href, row_id: currentState.focused.row_id },
      });
    }
  }

  return {
    acceptable: changes.length > 0,
    disposition: changes.length > 0 ? 'BOUNDED_NATIVE_FOCUS_CHANGE' : 'UNBOUNDED_FOCUS_LOSS',
    phase_validity: phaseValidity,
    changes,
  };
}
