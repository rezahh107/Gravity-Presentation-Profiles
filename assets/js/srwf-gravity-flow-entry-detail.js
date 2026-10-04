(() => {
    'use strict';

    const MATERIAL_REVIEW_ACTIONS = new Set(['approved', 'rejected', 'revert']);

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

    function bindReviewActionBusy(dossier) {
        if (dossier.dataset.gppReviewActionBusyBound === '1') return;
        if (dossier.dataset.gppReviewMode !== 'read-only') return;

        const form = dossier.closest('form');
        const hiddenStatus = form?.querySelector('input#gravityflow_approval_new_status_step');
        const actionRegion = hiddenStatus?.parentElement;
        const buttons = actionRegion
            ? [...actionRegion.querySelectorAll('button[type="submit"]')].filter(button => MATERIAL_REVIEW_ACTIONS.has(button.value))
            : [];

        if (!form || !hiddenStatus || !actionRegion || buttons.length === 0) return;

        const feedback = document.createElement('span');
        feedback.className = 'gpp-review-action-busy-feedback';
        feedback.hidden = true;
        feedback.lang = 'fa';
        feedback.dir = 'rtl';
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        feedback.setAttribute('aria-atomic', 'true');
        feedback.textContent = 'در حال ثبت نتیجه…';
        actionRegion.insertBefore(feedback, buttons[0]);

        const originalAriaDisabled = new Map(
            buttons.map(button => [button, button.getAttribute('aria-disabled')])
        );
        let busy = false;

        const restore = () => {
            if (!busy) return;
            busy = false;
            delete actionRegion.dataset.gppReviewActionBusy;
            actionRegion.removeAttribute('aria-busy');
            feedback.hidden = true;

            originalAriaDisabled.forEach((value, button) => {
                if (value === null) {
                    button.removeAttribute('aria-disabled');
                } else {
                    button.setAttribute('aria-disabled', value);
                }
            });
        };

        form.addEventListener('click', event => {
            if (!busy) return;
            const button = event.target.closest('button[type="submit"]');
            if (!button || !actionRegion.contains(button) || !MATERIAL_REVIEW_ACTIONS.has(button.value)) return;

            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);

        form.addEventListener('submit', () => {
            const action = hiddenStatus.value;
            if (!MATERIAL_REVIEW_ACTIONS.has(action) || busy) return;

            busy = true;
            actionRegion.dataset.gppReviewActionBusy = '1';
            actionRegion.setAttribute('aria-busy', 'true');
            feedback.hidden = false;

            // Do not set the native disabled property here. Gravity Forms owns
            // the accepted submission lifecycle and may still inspect the native
            // submitter after this event. ARIA conveys the busy/unavailable state;
            // the capture-phase click guard blocks only later user activations.
            buttons.forEach(button => button.setAttribute('aria-disabled', 'true'));
        }, true);

        // A history restoration is a fresh operator interaction lifetime even
        // when the browser restores this exact DOM from bfcache.
        window.addEventListener('pageshow', event => {
            if (event.persisted) restore();
        });

        dossier.dataset.gppReviewActionBusyBound = '1';
    }

    function init() {
        document
            .querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]')
            .forEach(dossier => {
                bindPreview(dossier);
                bindReviewActionBusy(dossier);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
