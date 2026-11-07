# Retirement of PR #170's upstream-only AJAX security regression (2026-11-04)

## Observed historical failure — NOT PASS

- Source: [PR #170](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/170), exact historical Head `c8f0396204eb2a8d6f94f40a9b67473f62cf84b9`.
- Runtime: WordPress 6.8.3; PHP 8.2.35; Gravity Forms 3.1.1.1; **native Gravity Flow 3.1.0**.
- Boundary: Gravity Flow's **native** `inbox/changes` AJAX endpoint, not a GPP/Inbox 2-created endpoint. From an unassigned viewer browser, a forged Officer assignment filter with an invalid synthetic access token returned HTTP 200 and three Officer task rows containing name and school/grade cells.
- Original regression failed, as it should for this observation: [GitHub Actions run 41335307753](https://github.com/rezahh107/Gravity-Presentation-Profiles/actions/runs/41335307753). Historical PR discussion, workflow artifacts, commits and logs remain intact.

## Owner disposition and current boundary

The Owner reports having notified the Gravity Flow vendor by email. On 2026-11-04 the Owner explicitly authorized **permanent retirement** of this *specific upstream negative executable test* and its invocation from active experiments, including manual execution paths. This is a workload decision, **not** a finding that the vulnerability is fixed.

On PR #171's active experimental branch, the forged-request test and its exclusive output fields were removed. Legitimate native rendered-cell parity and authorized manual AJAX parity remain. The separate read-only Inbox 2 prototype uses authenticated server-side task lookup and native Entry Detail permission checks, **not** the `inbox/changes` endpoint; its own positive and negative authorization/browser checks remain in place.

**NOT_VERIFIED:** vendor remediation in any subsequent Gravity Flow version; whether the Owner's live site is exposed; production readiness or disclosure authorization for the Inbox 2 prototype. No vendor code, site settings, production GPP code, released Native-First architecture, or security policy was changed by this test retirement.
