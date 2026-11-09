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
- The Inbox 2 snapshot queries public entry membership and the internal native
  task projection with one bounded call each (page size = bound + 1); the
  historical PR169/PR170 parity helpers keep their 40-row pages.
  A strict 2000-task safety bound replaces the historical 500-task limit;
  over-bound requests fail closed, not silently truncate.
- Automatic polling uses a separate authenticated test-only WordPress AJAX
  route; each update is one complete host-authorized read whose two source
  statements are cross-checked by task identity, with at most one bounded retry
  for a detected concurrent change. This is not an atomic snapshot, and does not
  qualify production caching or latency.
- Task selection (Owner decision): exactly the native Gravity Flow Inbox
  membership for the same user and scope, reconciled across the public query
  and the native Task Model. No Inbox 2-only eligibility rule (step type,
  active flag or per-task assignee re-read). Native Gravity Flow remains the
  authority for Detail access and every task action.
- Native Inbox list membership and Entry Detail authorization are separate
  host decisions. A task selected by the authenticated Native Inbox remains an
  Inbox 2 card even when the native Entry Detail route denies that task's
  Detail access; opening the native route must still enforce that denial and
  prevent actions. The Inbox 2 list read does not call the Detail permission
  filter or omit such a native-selected task on that basis. Invalid task
  identity, unqualified required card values/bindings, timestamp or native
  Detail URL, and source-set disagreement still fail closed rather than
  silently dropping rows. The legacy PR169/PR170 helpers retain their separate
  Detail-permission and actionability checks by default.

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
  `InboxTableHeaderPresentation::initialGeometryContract()`, and Inbox 2
  card values are read from the **internal** Gravity Flow Task Model. The
  card-list path does not apply Entry Detail guards; native Detail continues
  to enforce its own permissions and actions when opened. These internal
  dependencies are experimental, not qualified production integration.
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
- Native/public authorized tasks are collected with one bounded call per
  source, up to an explicit 2000-task bound. Larger lists fail closed
  (`task_set_bound_exceeded`); a host paging filter that shrinks the page fails
  closed (`host_page_size_reduced`), never silently truncates.
- Public membership and the native Task Model are compared by exact task
  identity. A difference (a change between the two statements) rejects that
  attempt; one bounded retry re-runs every authorization check, and a second
  difference fails closed. A mutation immediately after the read remains a
  known race. Nothing is cached between attempts or requests.
- An empty public membership is never accepted on its own: the native Task
  Model is always read at least once and must also be empty; otherwise the
  attempt is rejected (`native_cell_task_set_changed`) like any other
  cross-source difference.
- RTL operator pages display 20 tasks in date/ID order. Search covers the
  complete verified list. Invalidated page numbers clamp automatically.
- The experimental authenticated + nonce-checked WordPress AJAX read polls
  every 30 seconds; no native inbox/changes requests. Aborted/outdated
  responses cannot overwrite the newer view. Errors and expired permissions
  clear old rows and retain search/page state for a retry.
- The isolated workflow runs an exact 500/501-task independent native identity
  oracle plus browser tests of paging, search, native Flow transitions, error
  clearing and recovery. Passing these requires observed CI evidence.
- Host throughput at 2000 tasks, true atomic concurrent mutation, mobile
  visual polish and real operator acceptance remain NOT_PROVEN.

## PR #179 — Owner-approved 30-second automatic polling

The isolated Inbox 2 timer is **30,000 ms** (previously 10,000 ms),
approximately matching the observed Native Gravity Flow Inbox
`fetch_interval=30` seconds. The separate `requestDeadlineMs=30000` is a
per-request timeout, **not** the automatic refresh interval. Manual refresh,
native Detail return, BFCache restore and tab re-entry still trigger immediate
server revalidation; automatic polling is skipped while the tab is hidden.

### Historical 10-second measurements and normalized server cost

Historical baseline: PR #179 Head `e12465c5266feacecf00464ba4d7ac7a67fc1834`,
WU21 run `42664450354` (2026-11-09), authentic Chromium and disposable
WordPress 6.8.3 / Gravity Flow 3.1.0. Values below are *measured* average DB
queries per successful refresh request, followed by arithmetic projections
for one continuously active tab (excluding manual/return-triggered reads).
They are not new-Head measurements or a production capacity benchmark.

| Tasks | Historical Inbox 2 queries/request | Old 10s Inbox 2 queries/min (6/min) | New 30s Inbox 2 queries/min (2/min; projected) | Native 30s queries/min (historical) |
| ---: | ---: | ---: | ---: | ---: |
| 300 | 95 | 570 | 190 | 178 |
| 501 | 95 | 570 | 190 | 178 |
| 2000 | 95 | 570 | 190 | 245 |

Reducing scheduled requests from six to two per minute is a **66.7% reduction**
in automatic polling frequency and projected polling DB-query demand per active
tab, if per-request cost stays comparable. The new-Head real-browser cost
harness must observe the first request no earlier than 28 seconds and two
consecutive intervals in a 28–45 second scheduler-jitter window; it also
reports measured queries/request and normalized estimated queries/minute.
This does not measure concurrent production throughput or extra manual/return
reads. The historical 2000-task Native browser measurement recorded two JS
errors, not repaired by the polling correction.
