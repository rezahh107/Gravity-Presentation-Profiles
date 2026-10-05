(() => {
    'use strict';

    const materialActions = new Set(['approved', 'rejected', 'revert']);
    const reviewProfiles = new Set([
        'srwf.operations.entry-detail.v1',
        'srwf.operations.entry-detail.full-width.v1',
    ]);

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
            if (trigger && typeof trigger.focus === 'function') {
                trigger.focus({ preventScroll: true });
            }
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
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
        dialog.addEventListener('close', restore);
        dossier.dataset.gppPreviewBound = '1';
    }

    function bindReviewActionState(dossier) {
        if (dossier.dataset.gppReviewActionStateBound === '1') return;
        if (dossier.dataset.gppReviewMode !== 'read-only') return;
        if (!reviewProfiles.has(dossier.dataset.gppProfileId || '')) return;

        const form = dossier.closest('form');
        if (!form) return;

        const actionRegion = form.querySelector('.gravityflow-action-buttons');
        const carrier = form.querySelector('#gravityflow_approval_new_status_step');
        const buttons = actionRegion
            ? [...actionRegion.querySelectorAll('button[type="submit"][value]')]
                .filter(button => materialActions.has(button.value))
            : [];

        if (!actionRegion || !carrier || buttons.length !== 3) return;
        if (!buttons.every(button => (button.getAttribute('onclick') || '').includes('handleApprovalStepButtonClick'))) return;
        if (new Set(buttons.map(button => button.value)).size !== materialActions.size) return;
        if (![...materialActions].every(action => buttons.some(button => button.value === action))) return;

        const initialState = new Map(buttons.map(button => [button, {
            disabled: button.disabled,
            ariaDisabled: button.getAttribute('aria-disabled'),
        }]));

        const status = document.createElement('div');
        status.className = 'gpp-entry-review-action-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.setAttribute('aria-atomic', 'true');
        status.hidden = true;
        actionRegion.insertAdjacentElement('beforebegin', status);

        const clearBusy = () => {
            delete actionRegion.dataset.gppMaterialActionBusy;
            actionRegion.removeAttribute('aria-busy');
            status.textContent = '';
            status.hidden = true;
            buttons.forEach(button => {
                const initial = initialState.get(button);
                button.disabled = Boolean(initial?.disabled);
                if (initial?.ariaDisabled === null || typeof initial?.ariaDisabled === 'undefined') {
                    button.removeAttribute('aria-disabled');
                } else {
                    button.setAttribute('aria-disabled', initial.ariaDisabled);
                }
            });
        };

        const setBusy = action => {
            if (!materialActions.has(action) || actionRegion.dataset.gppMaterialActionBusy === '1') return;
            actionRegion.dataset.gppMaterialActionBusy = '1';
            actionRegion.setAttribute('aria-busy', 'true');
            status.hidden = false;
            status.textContent = 'در حال ثبت نتیجه…';
            buttons.forEach(button => {
                button.disabled = true;
                button.setAttribute('aria-disabled', 'true');
            });
        };

        form.addEventListener('submit', () => {
            const action = carrier.value;
            if (!materialActions.has(action)) return;

            // Gravity Flow's inline handler has already completed native confirmation
            // and populated its hidden action carrier before a material submit reaches
            // this boundary. Defer presentation until all submit listeners for this
            // event have run so GPP never replaces or races the host submit handler.
            queueMicrotask(() => {
                if (document.contains(form)) setBusy(action);
            });
        });

        window.addEventListener('pageshow', clearBusy);
        document.addEventListener('gform/post_render', clearBusy);
        dossier.dataset.gppReviewActionStateBound = '1';
    }

    function init() {
        document
            .querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]')
            .forEach(dossier => {
                bindPreview(dossier);
                bindReviewActionState(dossier);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
