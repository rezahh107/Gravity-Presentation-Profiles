# Inbox 2 versus native Inbox — comparative journey qualification

This experiment uses the isolated pinned WordPress 6.8.3, PHP 8.2.35,
Gravity Forms 3.1.1.1 and Gravity Flow 3.1.0 WU21 runtime.
It is not a human study or a production migration.

The same Officer and original three synthetic tasks are used on both surfaces.
A second phase adds 44 real synthetic Gravity Forms entries, advances their
authentic Gravity Flow workflow, and compares 47 assigned tasks. The temporary
entries are removed even when the browser suite fails; the three-task baseline
is preserved for inherited tests. Browsers are Chromium at 390 and 1280px.
Each interface is loaded separately using the same synthetic Officer account.

Artifact: ciq2-comparative-journeys.json and compare-*.png screenshots
are uploaded by the existing inbox2-usability-prototype workflow.
The report records navigation timing, search attempts and success, actual
interaction counts, initial viewport geometry, page-level overflow, focus,
native entry navigation and return outcomes, and restricted viewer/anonymous
states. **Scripted browser milliseconds are not human completion times.**
Native AG Grid may paginate and virtualize rows; initial DOM row counts must
not be misrepresented as complete task sets. Any unsupported/unsuccessful
native search or navigation is recorded as observed and not silently replaced
with direct URL navigation. Comparisons are not scored with invented weights.

Independent Inbox 2 rights checks (identity, server-owned form/task selection,
native Entry Detail permission, viewer/anonymous denial, disclosure, stale
assignment transition) and existing PR169/170 parity tests remain. The
retired upstream forged AJAX test is not reintroduced or executed.

Current Inbox 2 depends on internal Gravity Flow Task Model and Entry Detail
guard and internal GPP mapping contract, with no supported stability proof.
National ID uses only synthetic values and has no Owner production disclosure
approval. Search/Sort/Filter/Pagination/Live Refresh are not equivalently
implemented in the prototype; those product differences are evaluation
findings, not missing test assertions. Operator subjective usability, real-site
speed and production compatibility remain NOT_PROVEN.
