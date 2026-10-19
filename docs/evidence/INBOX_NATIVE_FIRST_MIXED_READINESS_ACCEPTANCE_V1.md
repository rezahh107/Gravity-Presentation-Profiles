# Native-First Inbox — mixed-readiness acceptance

Status: Candidate; exact-Head authentic runtime CI is required before admission.

## Current Owner boundary and base

Fresh main was a17102de0e14179ed6b8ab5c2fca0313f124bc31. The complete external GOAL_AUTHORITY is not checked into this repository, so it has not been fully inspected. Repository AGENTS.md and Mother Architecture are subordinate to the explicit current Owner Native-First direction: Gravity Flow and AG Grid own rows, assignment, authorization, query, Grid state, native navigation, sorting, paging and Live Refresh. The historical WU17 Card Mode column/value transformations and one-unready-row CSS veto are retired and are not current acceptance assertions.

No production PHP, CSS, or JS behavior is changed by this qualification branch.

## Code-path decision

1. OperationsSetupService initializes the real form/installation context.
2. BindingRepairService maps authoritative Gravity Forms fields through immutable CAS-activated binding versions.
3. InboxSetupService adopts the globally shared Inbox visual profile and reuses each form-specific binding context; InboxRuntimeReadinessService qualifies source configuration and host seams, recording PROVEN or NOT_PROVEN source-bound availability evidence.
4. InboxPresentationModel resolves exact form/entry/binding context, evidence hash, immutable version, semantic slot and source. It does not verify actual nonempty entry values. The source being configured and a particular entry having complete data are separate conditions.
5. InboxPresentationAdapter uses the active global profile and available active binding-set snapshots to construct the presentation model. It does NOT call presentationReadiness(entry) from the row rendering path, does not filter native rows, and does not replace Grid columns/cells. Authentically reached frontend shortcode/native Block gets a GPP shell around the untouched host render; wp-admin native Inbox has no frontend wrapper. If profile/model/route is absent, native Gravity Flow markup is retained.
6. Runtime diagnostics distinguish activation and source readiness; no GPP readiness bit confers request authorization.

Thus the prior all-or-nothing Card Mode fallback no longer applies. An incomplete/unproven form's real Gravity Flow-assigned entry must not disappear because GPP cannot resolve its semantic data. The global shell may be admitted even when a particular entry's semantic readiness is false; there is no GPP-specific cell enrichment for that entry. No missing mapping is guessed.

## Authentic fixtures and negative controls

A post-baseline synthetic acceptance fixture creates three real Gravity Forms forms and actual Flow Approval assignments: Ready, Unproven and Unconfigured. It creates four real entries: fully populated Ready, missing-required-values on Ready, Unproven School mapping, and unconfigured GPP form. GPP changes exclusively use Operations Setup, Binding Repair and Inbox Setup.

Expected source readiness: populated Ready and missing-values Ready are both ready (source-level proof only); Unproven and Unconfigured are not ready. Remap of the Ready national-ID source to a real alternate field invalidates the old availability claim, advances the binding version, and yields unready. Legitimate Inbox Setup requalification restores source readiness without recovering unavailable entry values. Previous proof must never qualify a new binding version, source, form or entry context.

Real native Gravity Flow API assignment/query results are independently compared for operator and unassigned viewer, and native filtered form calls are recorded. Real AG Grid row IDs are enumerated using its pager on frontend mixed-form shortcode, native Block and an actual separately created form-scoped shortcode page. The mixed-form Grid can show three native columns; the five-column host-aligned contract belongs to the form-scoped route, not to every mixed-form query. The first pinned Blocksy browser attempt exposed this incorrect test assumption (3 versus 5); that was an acceptance-oracle failure, not a production rendering defect. A native host restriction on mixing forms is reported rather than bypassed. An authorized native Entry Detail link must show its actual synthetic witness; an unassigned viewer must not. Impossible forged-row assertion is a negative control. Native five columns, the four physical LTR nodes, Persian RTL shell, responsive widths 1440/414/390/360/320, and no unrelated-page style leakage are checked.

The incomplete stored entry is intentionally created using GFAPI::add_entry; it does not claim a browser submission bypassed native Gravity Forms validation. Data are synthetic only (SYN-MIX identifiers).

## Evidence and limitations

The PHP host result is inbox-mixed-readiness-php.json. The separate Playwright browser result is inbox-mixed-readiness-browser.json. Each WU21 Hello Elementor and Blocksy job produces environment-local files and must show its own exact Head outcome. Existing native baseline suites retain sort/search/no-result/clear, pagination, refresh, Live Refresh, accessibility, permissions and admin coverage. The new probe is additional, not a replacement.

Until actual workflow results on this candidate Head are observed, all test and browser outcomes are NOT VERIFIED. Merged PR #161 Print evidence and #159 color projection are historical baseline, not proof of this new Head. No Owner-site acceptance, deployment, release, or ZIP installation is claimed. Production Entry Detail, Correction/Result, WU19 Print, generic GF/Schema 1.1 paint, Registration/GTB and locale boundaries remain unchanged. Owner-approved capability-first host compatibility is a migration target, not universal compatibility proven here.

Goal 5 still requires Owner-site validation and any requirements in the unavailable full external GOAL_AUTHORITY to be reconciled. PR #154 remains independent and blocked; PR #160 is verification-only.
