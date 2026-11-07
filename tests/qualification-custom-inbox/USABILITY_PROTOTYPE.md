# Inbox 2 — Read-only usability prototype

This is a **disposable synthetic-lab experiment**, not a production extension of GPP.
The Owner-authorized production architecture remains Native-First.

## Scope

- Render the **qualified native Task Model** cell texts for student name, national
  ID, and combined school/grade. No raw Entry field display fallback.
- The Officer receives the same form-scoped authorized tasks as the public host
  Inbox query; native Detail is the only navigation/action destination.
- Server-rendered RTL cards, 390px name visibility, keyboard focus, full-list
  client-side search by name/national ID, 20-task operator pages, automatic
  polling and manually retried AJAX with non-JS GET fallback.
- Public entry and internal native task projection are queried in pages of 40.
  A strict 2000-task safety bound replaces the historical 500-task limit;
  over-bound requests fail closed, not silently truncate.
- Automatic polling uses a separate authenticated test-only WordPress AJAX
  route and reconciles two full host-authorized reads per update. This is not
  an atomic snapshot, and does not qualify production caching or latency.
- A single Entry Detail guard denial omits that entry (with generic server log)
  in this **prototype only**. Query/identity failures reject the entire list.
  The strict PR169/PR170 path remains unchanged by default.

## Authentic execution

The independent workflow
`.github/workflows/inbox2-usability-prototype.yml`
reuses exact host package verification, WU21 fixtures, the inherited PR169 tests,
the PR170 field parity headless tests, then runs:

```
wp eval-file tests/qualification-custom-inbox/usability-headless.php
# Install usability-mu.php into the disposable environment.
wp eval-file tests/qualification-custom-inbox/usability-setup.php
node tests/qualification-custom-inbox/usability-browser.mjs
```

PR #170's specific upstream forged-assignee AJAX regression was permanently
retired from the active experimental branch by explicit Owner decision on
2026-11-04. Its original FAILURE remains in PR #170 and its workflow logs;
it was never a PASS. The separate cell-parity workflow retains actual native
DOM and authorized manual AJAX checks. Inbox 2 does not request the native
`inbox/changes` endpoint; the browser suite asserts this on its own page.
No vendor runtime code is modified. See `UPSTREAM_AJAX_TEST_RETIREMENT.md`.

## Decision criteria and caveats

- Automated browser: readable student name without horizontal scroll at 390px;
  accessible RTL labels, actual link click to native Detail, officer/viewer
  isolation, one-click manual reload and genuine Flow transition.
- Query paging: 3-task and 47-task synthetic scenario; record total DB query
  count and duration. Two 40-row page calls are expected for 47 tasks. Do not
  claim N+1 database queries eliminated without benchmark evidence.
- Search: over the complete last verified authorized task list; it does not
  prove native Search/Sort/Pagination equivalence or faster human completion time.
  Real operator comparative usability remains `NOT_PROVEN`.
- Data mapping currently uses the **internal** GPP
  `InboxTableHeaderPresentation::initialGeometryContract()`, and row rendering
  uses **internal** Gravity Flow Task Model and Entry Detail guards.
  These are experimental dependencies, not qualified production integration.
  Decide a small versioned mapping/read seam versus independent form mapping
  only after usability evidence. Do not invent parallel persistent bindings.
- National-ID output follows the synthetic **native Inbox**. Displaying it raw
  on the real installation requires explicit Owner disclosure choice.
- Native AG Grid AJAX endpoint security is handled outside this experiment.
  This experiment does not call that endpoint and does not qualify it.
- Do not merge, release, deploy or install this MU plugin on a live site.

## Output

`ciq2-headless.json`, `ciq2-browser.json`, Chromium screenshots, exact
checkout/runtime identities and previous inherited evidence in a GitHub
Actions artifact. Check workflow results rather than treating these instructions
as execution proof.


## Experimental operational task-list contract

- Host retains workflow, authorization, assignment and Entry Detail ownership.
- Native/public authorized tasks are collected in batches of 40, up to an
  explicit 2000-task bound. Larger lists fail closed, never silently truncate.
- Two complete native-authorized reads are reconciled before display. Offset
  paging is not atomic; any detected difference rejects the response. A
  mutation immediately after the second read remains a known race.
- RTL operator pages display 20 tasks in date/ID order. Search covers the
  complete verified list. Invalidated page numbers clamp automatically.
- The experimental authenticated + nonce-checked WordPress AJAX read polls
  every 10 seconds; no native inbox/changes requests. Aborted/outdated
  responses cannot overwrite the newer view. Errors and expired permissions
  clear old rows and retain search/page state for a retry.
- The isolated workflow runs an exact 500/501-task independent native identity
  oracle plus browser tests of paging, search, native Flow transitions, error
  clearing and recovery. Passing these requires observed CI evidence.
- Host throughput at 2000 tasks, true atomic concurrent mutation, mobile
  visual polish and real operator acceptance remain NOT_PROVEN.
