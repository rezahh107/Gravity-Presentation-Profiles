# GPP Inbox Visual Design V2 — Current Owner Overrides

- Live Refresh = mandatory acceptance invariant.
- PersianGravity remains Jalali presentation owner.
- Canonical `entry.created_at` Jalali presentation is sufficient.
- A Persian month-name chip is not required.
- `Q1_HTML_CELL_VALUE_PATH` is not required for month-name presentation.
- Duplicate «کارهای من» is a known deferred defect, not an approved final state.
- Active scope = native row + native pagination presentation.
- Upper-page presentation remains phase-frozen.

## Active Owner goal — host-aligned five-column Inbox order

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

This qualification does not itself constitute production implementation, merge, release, deployment, or Owner production-site acceptance. The immediate next work is a bounded production change from the current repository baseline, followed by exact-target regression/runtime verification of the same host-aligned contract.
