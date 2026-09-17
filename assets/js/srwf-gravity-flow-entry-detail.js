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

    const unique = selector => {
      const nodes = form.querySelectorAll(selector);
      return { count: nodes.length, node: nodes.length === 1 ? nodes[0] : null };
    };

    const nativeInstructions = unique('.gravityflow-instructions');
    const nativeEditor = unique('.entry-detail-view .gform_wrapper');
    const nativeActions = unique('.gravityflow-action-buttons');
    const nativeTimeline = unique('.gravityflow-timeline');

    // Never guess which host region/control is authoritative. Unexpected
    // duplication is ambiguous even for an optional region; a required region
    // must additionally be present in this exact request.
    if (
      nativeInstructions.count > 1 ||
      nativeEditor.count > 1 ||
      nativeActions.count > 1 ||
      nativeTimeline.count > 1 ||
      (dossier.dataset.gppRequireInstructions === '1' && nativeInstructions.count !== 1) ||
      (dossier.dataset.gppHostEditable === '1' && nativeEditor.count !== 1) ||
      (actionsTarget && nativeActions.count !== 1) ||
      (historyTarget && nativeTimeline.count !== 1)
    ) {
      dossier.remove();
      return;
    }

    if (nativeInstructions.node && instructionsTarget) instructionsTarget.append(nativeInstructions.node);
    if (nativeEditor.node && editorTarget) editorTarget.append(nativeEditor.node);
    if (nativeActions.node && actionsTarget) actionsTarget.append(nativeActions.node);
    if (nativeTimeline.node && historyTarget) historyTarget.append(nativeTimeline.node);

    dossier.classList.add('gpp-entry-dossier--composed');
    bindPreview(dossier);
  };

  const init = () => document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').forEach(compose);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
