# Inbox 2 — Read-only usability prototype

This is a **disposable synthetic-lab experiment**, not a production extension of GPP.
The Owner-authorized production architecture remains Native-First.

## Scope

- Render the **qualified native Task Model** cell texts for student name, national
  ID, and combined school/grade. No raw Entry field display fallback.
- The Officer receives the same form-scoped authorized tasks as the public host
  Inbox query; native Detail is the only navigation/action destination.
- Server-rendered RTL cards, 390px name visibility, keyboard focus, client-side
  search of **already-rendered** name/national-ID, and a full GET refresh.
- Public entry and internal native task projection are queried in pages of 40;
  limits remain 500 tasks per request. No live refresh, server search or
  production caching contract.
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

The original security-negative qualification workflow is **untouched** and
its known failure is not called PASS. No runtime patches to Gravity Flow.

## Decision criteria and caveats

- Automated browser: readable student name without horizontal scroll at 390px;
  accessible RTL labels, actual link click to native Detail, officer/viewer
  isolation, one-click manual reload and genuine Flow transition.
- Query paging: 3-task and 47-task synthetic scenario; record total DB query
  count and duration. Two 40-row page calls are expected for 47 tasks. Do not
  claim N+1 database queries eliminated without benchmark evidence.
- Search: only over currently rendered tasks; it does not prove native
  Search/Sort/Pagination equivalence or faster human completion time.
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
