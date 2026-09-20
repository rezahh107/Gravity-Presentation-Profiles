# Inbox Full Width Composition V1 — implementation evidence note

This file intentionally remains small and evidence-oriented. The governing Owner authority is external to this repository: `OWNER_DECISION_GPP_INBOX_FULL_WIDTH_COMPOSITION_AND_PAGINATION_V1` (2026-09-20).

## Host/runtime facts used by this implementation

- Gravity Flow package under the repository WU21 contract: `3.1.0`.
- Exact owner-supplied package SHA-256: `ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404`.
- The bundled AG Grid source used by the native Inbox identifies itself as `AG Grid v25.2.0`.
- The bundled public pagination API contains current-page, total-pages, direct-page, first, previous, next, and last navigation methods.
- The bundled runtime does **not** contain the newer `pageNumbers` pagination-panel capability.
- The native Inbox uses the client-side/default row model; Gravity Flow does not set a different `rowModelType` in its Inbox bundle.
- The native toolbar controls are authentic host actions for Search, Clear Filters, Fullscreen, and Settings. No custom Filter/Sort state is added by GPP.

## Implementation direction

GPP wraps only admitted authentic frontend Inbox shortcode output with a semantic Full Width presentation shell, while preserving the native Gravity Flow Inbox subtree unchanged. The shell provides the real `h1` and helper copy, a responsive bounded content axis, neutral canvas, toolbar/control presentation, card-grid bounds, and native pagination styling.

Numbered page controls are intentionally omitted because the pinned AG Grid runtime has no native/public numbered-page panel. Existing AG Grid Previous/Next/current-page/row-summary controls remain the only paging state and behavior.

## Parallel-PR boundary

This Inbox work does not modify `Bootstrap.php`, Entry Detail production files, Timeline production files, WU18 evidence, or Timeline semantic tests. Its intended production scope is limited to `InboxPresentationAdapter.php` and the existing Inbox CSS package.

Runtime/browser evidence is produced by the existing WU17 path inside WU21. Owner visual acceptance remains separate from automated geometry/runtime qualification.
