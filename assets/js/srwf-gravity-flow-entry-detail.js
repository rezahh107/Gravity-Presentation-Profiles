(() => {
    'use strict';

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

    function init() {
        document
            .querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]')
            .forEach(bindPreview);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
