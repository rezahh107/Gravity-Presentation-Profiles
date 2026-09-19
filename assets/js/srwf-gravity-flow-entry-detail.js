(() => {
    'use strict';

    function unique(root, selector) {
        const nodes = Array.from(root.querySelectorAll(selector));
        return nodes.length === 1 ? nodes[0] : null;
    }

    function visible(node) {
        if (!node) return false;
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function fail(dossier, form, reason) {
        if (form) form.dataset.gppEntryDetailComposition = `native-fallback:${reason}`;
        dossier.dataset.gppCompositionState = `failed:${reason}`;
        dossier.remove();
    }

    function bindPreview(dossier) {
        if (dossier.dataset.gppPreviewBound === '1') return;
        const dialog = dossier.querySelector('[data-gpp-image-dialog]');
        if (!dialog || typeof dialog.showModal !== 'function') return;
        const image = dialog.querySelector('[data-gpp-image-full]');
        const close = dialog.querySelector('[data-gpp-image-close]');
        let trigger = null;
        let scrollX = 0;
        let scrollY = 0;
        const restore = () => {
            window.scrollTo(scrollX, scrollY);
            if (trigger && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
        };
        dossier.querySelectorAll('[data-gpp-image-preview]').forEach(button => {
            button.addEventListener('click', () => {
                trigger = button;
                scrollX = window.scrollX;
                scrollY = window.scrollY;
                image.src = button.dataset.gppImageSrc || '';
                image.alt = button.dataset.gppImageName || '';
                dialog.showModal();
                close?.focus({ preventScroll: true });
            });
        });
        close?.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', restore);
        dossier.dataset.gppPreviewBound = '1';
    }

    function compose(dossier) {
        if (!dossier || dossier.dataset.gppCompositionState === 'composed') return;
        const form = dossier.closest('form');
        if (!form || !form.matches('form[id^="gform_"]')) {
            fail(dossier, form, 'native-form-missing');
            return;
        }

        const instructionsTarget = dossier.querySelector('[data-gpp-native-instructions]');
        const editorTarget = dossier.querySelector('[data-gpp-native-editor]');
        const statusTarget = dossier.querySelector('[data-gpp-native-status]');
        const historyTarget = dossier.querySelector('[data-gpp-native-history]');
        const historyRegion = dossier.querySelector('[data-gpp-entry-region="history"]');
        const actionsExpected = dossier.dataset.gppActionsExpected === '1';
        const hostEditable = dossier.dataset.gppHostEditable === '1';

        if (!instructionsTarget || !editorTarget || (actionsExpected && !statusTarget)) {
            fail(dossier, form, 'destination-missing');
            return;
        }

        const instructions = Array.from(form.querySelectorAll('.gravityflow-instructions'));
        const editors = Array.from(form.querySelectorAll('.entry-detail-view .gform_wrapper'));
        const actionContainers = Array.from(form.querySelectorAll('.gravityflow-action-buttons'));
        const statusBoxes = Array.from(form.querySelectorAll('.gravityflow-status-box'));
        const timelines = Array.from(form.querySelectorAll('.gravityflow-timeline'));

        if (instructions.length > 1 || editors.length !== 1 || timelines.length > 1) {
            fail(dossier, form, 'native-cardinality');
            return;
        }

        const editor = editors[0];
        if (editor.closest('form') !== form) {
            fail(dossier, form, 'editor-form-ownership');
            return;
        }

        let approvalStatusBox = null;
        if (actionsExpected) {
            if (actionContainers.length !== 1 || statusBoxes.length !== 1) {
                fail(dossier, form, 'approval-cardinality');
                return;
            }
            const actions = actionContainers[0];
            approvalStatusBox = statusBoxes[0];
            const approved = actions.querySelectorAll('[value="approved"]');
            const rejected = actions.querySelectorAll('[value="rejected"]');
            if (approved.length !== 1 || rejected.length !== 1) {
                fail(dossier, form, 'approval-action-cardinality');
                return;
            }
            if (!approvalStatusBox.contains(actions) || approvalStatusBox.closest('form') !== form || actions.closest('form') !== form) {
                fail(dossier, form, 'approval-form-ownership');
                return;
            }
        } else if (actionContainers.length > 1 || statusBoxes.length > 1) {
            fail(dossier, form, 'native-status-cardinality');
            return;
        } else if (actionContainers.length === 1) {
            const actions = actionContainers[0];
            const hasApprovalActions = actions.querySelector('[value="approved"], [value="rejected"]');
            if (hasApprovalActions || !hostEditable || actions.closest('form') !== form) {
                fail(dossier, form, 'unexpected-actions');
                return;
            }
            // A non-Approval editable status/action cluster is host-owned and
            // intentionally remains in Gravity Flow's native position.
        }

        if (timelines.length === 1 && (!historyTarget || !historyRegion)) {
            fail(dossier, form, 'history-destination-missing');
            return;
        }

        // All destructive/reparenting prerequisites have now been proven.
        // Keep exact original anchors so any unexpected post-move invariant
        // failure can transactionally restore the native host UI.
        const movingNodes = [
            instructions.length === 1 ? instructions[0] : null,
            editor,
            approvalStatusBox,
            timelines.length === 1 ? timelines[0] : null,
        ].filter(Boolean);
        const anchors = movingNodes.map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));
        const rollback = () => {
            for (const anchor of anchors.slice().reverse()) {
                if (!anchor.parent) continue;
                if (anchor.next && anchor.next.parentNode === anchor.parent) anchor.parent.insertBefore(anchor.node, anchor.next);
                else anchor.parent.append(anchor.node);
            }
        };

        try {
            if (instructions.length === 1) instructionsTarget.append(instructions[0]);
            editorTarget.append(editor);
            if (approvalStatusBox) statusTarget.append(approvalStatusBox);
            if (timelines.length === 1) historyTarget.append(timelines[0]);

            // Prove state-changing controls still belong to their original form
            // after reparenting before native fallback is visually replaced.
            if (actionsExpected) {
                const actions = unique(dossier, '.gravityflow-action-buttons');
                if (!actions || actions.closest('form') !== form || !statusTarget.contains(actions)) {
                    throw new Error('post-move-form-ownership');
                }
            }
        } catch (error) {
            rollback();
            fail(dossier, form, error?.message || 'composition-move-failed');
            return;
        }

        // GPP-owned optional history chrome is removed only after host node
        // movement has succeeded, so rollback never needs to recreate it.
        if (timelines.length === 0) historyRegion?.remove();

        form.dataset.gppEntryDetailComposition = 'composed';
        dossier.dataset.gppCompositionState = 'composed';
        dossier.classList.add('gpp-entry-dossier--composed');
        bindPreview(dossier);
    }

    function init() {
        document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').forEach(compose);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
