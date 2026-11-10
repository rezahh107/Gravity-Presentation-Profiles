# GPP Inbox Visual Design V2 — Current Owner Overrides

- Live Refresh = mandatory acceptance invariant.
- PersianGravity remains Jalali presentation owner.
- Canonical `entry.created_at` Jalali presentation is sufficient.
- A Persian month-name chip is not required.
- `Q1_HTML_CELL_VALUE_PATH` is not required for month-name presentation.
- Duplicate «کارهای من» is a known deferred defect, not an approved final state.
- Active scope = native row + native pagination presentation.
- Upper-page presentation remains phase-frozen.

## 2026-11-08 — G-014 cross-mode priority update

**This is a sequencing/qualification update; it does not replace the approved five-column Owner visual order or approve native `ag-rtl` for production.** The historical host-aligned five-column rule below remains the valid `ag-ltr` baseline after merged [GPP #118](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/118). It is **not** an already-qualified solution for native `ag-rtl` introduced experimentally by PersianGravity G-014.

Read the bounded [G-014 historical reconciliation and evidence/priority ledger](../evidence/INBOX_G014_RTL_RESTORE_HISTORICAL_RECONCILIATION_2026_11_08.md) before suggesting new research, intervention or code. It records the same `id`-first native restore mechanism already **SOURCE_PROVEN in #112**, the historical lack of a supported repair seam, the merged host-aligned #118 decision, false/unknown lifecycle-discriminator attempts, and the new #168/#176 `ag-rtl` evidence.

**Current work priority (newer than the historical "immediate next implementation" wording below):**

1. **P0 / documented now:** Reuse #112/#118/#130/#131 negative and positive evidence; prevent rerunning rejected methods under a new label.
2. **P1 / next qualification:** Seek *only a materially new, actually supported* host/upstream integration boundary that preserves native user order through G-014 `ag-rtl` reload. Source access and successful test-only private interception are **not** admission of an extension seam.
3. **P2 / conditional Owner policy decision:** If no such boundary exists, explicitly compare keeping the qualified `ag-ltr` host-aligned path, obtaining an upstream/vendor contract, or revisiting an Owner constraint. Do not silently choose or release native `ag-rtl`.
4. **P3 / once a method is admissible:** Test real user-manual order and widths, compatible/incomplete/legacy saved states, reloads, LTR/RTL mode transitions, Grid/Operations identity, workflow controls, shortcode/Block, desktop/mobile scroll and accessibility.
5. **P4 / after separate implementation authorization:** Implement and regression-validate a root-complete fix on a fresh exact Head. No production change is authorized by this documentation pass.
6. **P5 / separate tracks:** Keep width-fit, scroll/touch and wider four-state acceptance failures independent from the `id`-order cause; CI evidence capture PASS does not waive a product FAIL.

**Still locked:** Native Grid, column-state persistence, actions and workflow remain Gravity Flow-owned; preserve the visible `id`/«عملیات» and `date_created_human_readable` identities; no implicit native storage wipe, Grid-ID rotation, DOM reorder, vendor patch or private API wrapper in production. The stopped four-column option remains stopped. PGR #114 and GPP #174/#176 are Draft, not a release-ready cross-RTL implementation.

### Historical host-aligned objective (ag-ltr scope)



The Owner has stopped the parallel four-column / visible-`id` removal path and selected the lower-risk host-aligned five-column direction for the next production implementation step.

The native Gravity Flow Inbox must keep all five visible native columns, including the native `id` / «عملیات» column and its Entry Detail navigation contract.

Owner-facing RTL order:

```text
نام دانش‌آموز | کد ملی | مدرسه و پایه | تاریخ و ساعت ثبت | عملیات
```

Required physical left-to-right order in the current native LTR AG Grid:

```text
id | date_created | school_grade | national_id | student_name
```

For the currently qualified alpha fixture this resolves to:

```text
id | date_created | 6 | 3 | 1
```

The implementation direction is to align GPP's projected native column order with Gravity Flow 3.1.0's own persisted `id`-first restore behavior rather than introducing a competing state-repair mechanism.

Preserve these constraints:

- Gravity Flow remains authoritative for Grid construction, row identity, persisted column state, Search, sorting, pagination, Live Refresh, assignment/authorization, Entry Detail navigation, and lifecycle.
- Keep the existing native `gravityflow_columns_inbox_table` boundary.
- Keep the same five visible column identities and the hidden `date_created_human_readable` companion.
- Do not remove `id` as part of this active path.
- Do not introduce custom Grid state, storage migration/clearing as repair, Grid-ID rotation, private AG Grid APIs, `enableRtl`, DOM reordering, CSS-only column reordering, or monkey patches.
- Preserve native Entry Detail navigation from the `id` column.

Qualification basis:

- Contract: `SRWF_INBOX_HOST_ALIGNED_FIVE_COLUMN_V1`
- Qualification result: `HOST_ALIGNED_FIVE_COLUMN_QUALIFIED`
- Qualification Head: `a1fe0f31d7fe40f97e362422f49f803e2c3e2b1d`
- Qualified Gravity Flow authority: `3.1.0`, package SHA-256 `ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404`
- Clean state, OLD_CLEAN persisted state, existing HOST_ALIGNED state, first reload, and second reload all converged on the host-aligned physical order in the recorded native runtime.
- Header/body bounding tracks aligned with 0 CSS px observed delta in the qualification evidence.
- Native Entry Detail, Search, sorting, pagination, Live Refresh/row identity, authorization/assignment, and storage isolation passed in the recorded qualification runtime.

**Historical status note:** This qualification originally preceded the bounded production implementation now represented by **merged PR #118**. It did not itself prove merge, release, deployment, or Owner-site acceptance. Its then-stated immediate next step is **not** the current G-014 cross-mode work priority: follow the 2026-11-08 P0–P5 qualification sequence above. New genuine `ag-rtl` compatibility and persisted-state transition remain unadmitted and require their own method and acceptance evidence.
