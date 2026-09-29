import { evaluateQ2Qualification, evaluateQ4FocusLifecycle, evaluateQ4Page2OpenContext, evaluateQ4Page2OpenNavigation, evaluateQ4QualificationStatus } from './inbox-visual-design-v2-contract-evaluation.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`Inbox V2 contract falsification failed: ${message}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function q2Capture(width = 1440) {
  return {
    viewport: { width, height: width === 1440 ? 900 : 800 },
    ag_rtl: false,
    root_direction: 'ltr',
    visual_column_order: [
      { col_id: 'id', text: 'ID', x: 10, width: 80, right: 90 },
      { col_id: 'school', text: 'School', x: 90, width: 260, right: 350 },
    ],
    representative_cells: [
      { col_id: 'id', text: '25', direction: 'ltr', text_align: 'left', x: 10, width: 80, right: 90 },
      { col_id: 'school', text: 'School', direction: 'ltr', text_align: 'left', x: 90, width: 260, right: 350 },
    ],
    persian_text_samples: [
      { col_id: 'school', text: 'دبیرستان آزمایشی', direction: 'rtl', text_align: 'right', x: 90, width: 260, right: 350 },
    ],
    pager: {
      direction: 'ltr',
      text_align: 'start',
      children: [
        { ref: 'btPrevious', text: 'Previous', x: 10 },
        { ref: 'lbCurrent', text: '1', x: 100 },
        { ref: 'btNext', text: 'Next', x: 130 },
      ],
    },
    horizontal_scroll: {
      moved_when_available: true,
      center_before: { client_width: width === 1440 ? 1200 : 348, scroll_width: width === 1440 ? 1200 : 1258 },
    },
    navigation: {
      focus: { active: true },
      url: 'http://example.invalid/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=1&lid=2',
    },
    usable: true,
  };
}

const q2Desktop = q2Capture(1440);
const q2Mobile = q2Capture(360);
const q2Positive = evaluateQ2Qualification(q2Desktop, q2Mobile);
assert(q2Positive.status === 'PASS', 'fully evaluated readable Persian Q2 positive control must PASS');

const q2MissingPersian = evaluateQ2Qualification(
  { ...clone(q2Desktop), persian_text_samples: [] },
  { ...clone(q2Mobile), persian_text_samples: [] },
);
assert(q2MissingPersian.status === 'NOT_PROVEN', 'captured Q2 without Persian readability evidence must be NOT_PROVEN');
assert(q2MissingPersian.usability_flags.persian_layout_and_native_controls_usable === false, 'missing Persian evidence must not be usable/admitted');

const q2MissingDirectionDesktop = clone(q2Desktop);
q2MissingDirectionDesktop.representative_cells[0].direction = null;
const q2MissingDirection = evaluateQ2Qualification(q2MissingDirectionDesktop, q2Mobile);
assert(q2MissingDirection.status === 'NOT_PROVEN', 'captured Q2 with unevaluated direction/alignment must be NOT_PROVEN');
assert(q2MissingDirection.required_evaluation_flags.direction_alignment_evaluated === false, 'direction/alignment gap must be mechanically visible');

const q2UnreadablePersianDesktop = clone(q2Desktop);
q2UnreadablePersianDesktop.persian_text_samples[0].direction = 'ltr';
q2UnreadablePersianDesktop.persian_text_samples[0].text_align = 'left';
const q2UnreadablePersian = evaluateQ2Qualification(q2UnreadablePersianDesktop, q2Mobile);
assert(q2UnreadablePersian.status === 'FAIL', 'evaluated but unreadable Persian direction/alignment must FAIL, not PASS');

function nativeFocus(rowId) {
  return {
    tag: 'A',
    row_id: String(rowId),
    href: `http://example.invalid/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${rowId}&lid=2`,
    text: 'Open',
    native_entry_link: true,
    visible: true,
    focus_indicator_visible: true,
  };
}

function q4State(rowId = 1) {
  return {
    visible_row_ids: [1, 2],
    focused: nativeFocus(rowId),
  };
}

function q4Status(focusEvaluation, pageTwoOpen = true) {
  return evaluateQ4QualificationStatus({
    page_state_remains_two: true,
    pager_state_coherent: true,
    one_native_pager: true,
    one_native_grid: true,
    one_native_search: true,
    same_native_grid: true,
    unique_row_identity: true,
    update_keeps_visible_page_rows: true,
    add_remove_round_trip_restores_page_rows: true,
    update_observed: true,
    add_observed: true,
    remove_observed: true,
    native_open_after_poll: true,
    keyboard_enter_after_poll: true,
    initial_focus_visible: true,
    post_poll_open_focus_visible: true,
    focus_behavior_accounted_for: focusEvaluation.acceptable,
    page_two_immediately_before_native_open: pageTwoOpen,
  });
}

const preservedStates = {
  before: q4State(1),
  after_update: q4State(1),
  after_add: q4State(1),
  after_remove: q4State(1),
};
const q4Preserved = evaluateQ4FocusLifecycle(preservedStates);
assert(q4Preserved.acceptable === true && q4Preserved.disposition === 'PRESERVED', 'genuine Q4 preservation positive control must remain accepted');
assert(q4Status(q4Preserved) === 'PASS', 'genuine preservation must keep the full Q4 predicate passing');

const updateLoss = clone(preservedStates);
updateLoss.after_update.focused = null;
const q4UpdateLoss = evaluateQ4FocusLifecycle(updateLoss);
assert(q4UpdateLoss.acceptable === false && q4UpdateLoss.disposition === 'UNBOUNDED_FOCUS_LOSS', 'focus loss after update must not be renamed bounded');
assert(q4Status(q4UpdateLoss) === 'FAIL', 'focus loss after update must make full Q4 FAIL');

const addLoss = clone(preservedStates);
addLoss.after_add.focused = { tag: 'BODY', row_id: null, href: null, native_entry_link: false, visible: true, focus_indicator_visible: false };
const q4AddLoss = evaluateQ4FocusLifecycle(addLoss);
assert(q4AddLoss.acceptable === false && q4AddLoss.disposition === 'UNBOUNDED_FOCUS_LOSS', 'focus loss after add must fail Q4 focus acceptance');
assert(q4Status(q4AddLoss) === 'FAIL', 'focus loss after add must make full Q4 FAIL');

const removeLoss = clone(preservedStates);
removeLoss.after_remove.focused.visible = false;
const q4RemoveLoss = evaluateQ4FocusLifecycle(removeLoss);
assert(q4RemoveLoss.acceptable === false && q4RemoveLoss.disposition === 'UNBOUNDED_FOCUS_LOSS', 'focus loss after remove must fail Q4 focus acceptance');
assert(q4Status(q4RemoveLoss) === 'FAIL', 'focus loss after remove must make full Q4 FAIL');

const boundedMove = clone(preservedStates);
boundedMove.after_add.focused = nativeFocus(2);
boundedMove.after_remove.focused = nativeFocus(2);
const q4BoundedMove = evaluateQ4FocusLifecycle(boundedMove);
assert(q4BoundedMove.acceptable === true && q4BoundedMove.disposition === 'BOUNDED_NATIVE_FOCUS_CHANGE', 'a bounded focus change must require evidenced valid native focus in every phase');
assert(q4BoundedMove.changes.length === 1 && q4BoundedMove.changes[0].phase === 'after_add', 'bounded focus change must record the exact phase transition');
assert(q4Status(q4BoundedMove) === 'PASS', 'only an evidenced bounded native focus transition may remain Q4 PASS');

const entryHref = 'http://example.invalid/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=2&lid=1';
const pageTwoAfterRemove = {
  pager: { count: 1, current: '2' },
  visible_row_ids: [1, 2],
  native_grid_count: 1,
  pager_count: 1,
  search_count: 1,
  grid_marker: 'q4-page2-grid',
};
const pageTwoOpenContext = {
  after_remove: pageTwoAfterRemove,
  immediately_before_open: clone(pageTwoAfterRemove),
  selected_row_id: '1',
  selected_href: entryHref,
};
const validNavigation = {
  href: entryHref,
  url: entryHref,
  focus: { active: true, href: entryHref, outline: 'solid', width: '3px', shadow: 'none' },
};
const pageTwoOpen = evaluateQ4Page2OpenNavigation(pageTwoOpenContext, validNavigation);
assert(pageTwoOpen.acceptable, 'page-2 post-poll native Enter/Open positive control must PASS');

const contaminatedPageOne = clone(pageTwoOpenContext);
contaminatedPageOne.immediately_before_open.pager.current = '1';
const pageOnePreflight = evaluateQ4Page2OpenContext(
  contaminatedPageOne.after_remove,
  contaminatedPageOne.immediately_before_open,
  contaminatedPageOne.selected_row_id,
  contaminatedPageOne.selected_href,
);
const pageOneOpen = evaluateQ4Page2OpenNavigation(contaminatedPageOne, validNavigation);
assert(!pageOnePreflight.acceptable && !pageOneOpen.acceptable, 'valid Enter/Open URL on page 1 must not qualify page-2 navigation');
assert(q4Status(q4Preserved, pageOneOpen.acceptable) === 'FAIL', 'the old page-1 ordering must make the full Q4 predicate FAIL');

const wrongRow = clone(pageTwoOpenContext);
wrongRow.selected_row_id = '99';
assert(!evaluateQ4Page2OpenNavigation(wrongRow, validNavigation).acceptable, 'Open must originate from a visible post-poll page-2 row');

console.log(JSON.stringify({
  status: 'PASS',
  q2: {
    fully_evaluated_positive_control: q2Positive.status,
    missing_persian_semantics: q2MissingPersian.status,
    missing_direction_alignment: q2MissingDirection.status,
    unreadable_persian_direction_alignment: q2UnreadablePersian.status,
  },
  q4: {
    preserved_positive_control: q4Status(q4Preserved),
    update_focus_loss: q4Status(q4UpdateLoss),
    add_focus_loss: q4Status(q4AddLoss),
    remove_focus_loss: q4Status(q4RemoveLoss),
    evidenced_bounded_native_change: q4Status(q4BoundedMove),
    page_two_native_open: pageTwoOpen.acceptable ? 'PASS' : 'FAIL',
    page_one_contamination: pageOneOpen.acceptable ? 'FAIL' : 'REJECTED',
    nonvisible_row_navigation: evaluateQ4Page2OpenNavigation(wrongRow, validNavigation).acceptable ? 'FAIL' : 'REJECTED',
  },
}, null, 2));
