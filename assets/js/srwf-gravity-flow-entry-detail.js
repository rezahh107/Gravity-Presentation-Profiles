(() => {
  'use strict';

  const restore = (trigger, x, y) => {
    if (trigger && trigger.isConnected) {
      try { trigger.focus({ preventScroll: true }); } catch (_) { trigger.focus(); }
    }
    window.scrollTo(x, y);
  };

  const bindPreview = dossier => {
    const dialog = dossier.querySelector('[data-gpp-image-dialog]');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    const full = dialog.querySelector('[data-gpp-image-full]');
    const close = dialog.querySelector('[data-gpp-image-close]');
    let invoker = null;
    let scrollX = 0;
    let scrollY = 0;

    const closeDialog = () => {
      if (dialog.open) dialog.close();
    };

    dossier.querySelectorAll('[data-gpp-image-preview]').forEach(trigger => {
      trigger.addEventListener('click', () => {
        invoker = trigger;
        scrollX = window.scrollX;
        scrollY = window.scrollY;
        full.src = trigger.dataset.gppImageSrc || '';
        full.alt = trigger.dataset.gppImageName || '';
        dialog.showModal();
        close?.focus();
      });
    });

    close?.addEventListener('click', closeDialog);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('close', () => restore(invoker, scrollX, scrollY));
  };

  const compose = dossier => {
    const form = dossier.closest('form');
    if (!form) return;

    const instructionsTarget = dossier.querySelector('[data-gpp-native-instructions]');
    const editorTarget = dossier.querySelector('[data-gpp-native-editor]');
    const actionsTarget = dossier.querySelector('[data-gpp-native-actions]');
    const historyTarget = dossier.querySelector('[data-gpp-native-history]');
    const nativeInstructions = form.querySelector('.gravityflow-instructions');
    const nativeEditor = form.querySelector('.entry-detail-view .gform_wrapper');
    const nativeActions = form.querySelector('.gravityflow-action-buttons');
    const nativeTimeline = form.querySelector('.gravityflow-timeline');

    // Required host evidence must agree with the actual rendered native surface.
    // If it does not, remove only GPP's projection and leave native Entry Detail.
    if (dossier.dataset.gppRequireInstructions === '1' && !nativeInstructions) {
      dossier.remove();
      return;
    }
    if (dossier.dataset.gppHostEditable === '1' && !nativeEditor) {
      dossier.remove();
      return;
    }

    if (nativeInstructions && instructionsTarget) instructionsTarget.append(nativeInstructions);
    if (nativeEditor && editorTarget) editorTarget.append(nativeEditor);
    if (nativeActions && actionsTarget) actionsTarget.append(nativeActions);
    if (nativeTimeline && historyTarget) historyTarget.append(nativeTimeline);

    dossier.classList.add('gpp-entry-dossier--composed');
    bindPreview(dossier);
  };

  const init = () => document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').forEach(compose);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
