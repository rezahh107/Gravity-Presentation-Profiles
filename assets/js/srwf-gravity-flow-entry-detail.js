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

  const markFailure = (form, dossier, state) => {
    form.dataset.gppEntryDetailComposition = state;
    dossier.dataset.gppCompositionState = state;
    dossier.remove();
  };

  const compose = dossier => {
    const form = dossier.closest('form');
    if (!form) return;

    const instructionsTarget = dossier.querySelector('[data-gpp-native-instructions]');
    const editorTarget = dossier.querySelector('[data-gpp-native-editor]');
    const actionsTarget = dossier.querySelector('[data-gpp-native-actions]');
    const historyTarget = dossier.querySelector('[data-gpp-native-history]');
    const actionsExpected = dossier.dataset.gppActionsExpected === '1';
    const serverHostEditable = dossier.dataset.gppHostEditable === '1';

    const unique = selector => {
      const nodes = form.querySelectorAll(selector);
      return { count: nodes.length, node: nodes.length === 1 ? nodes[0] : null };
    };

    const nativeInstructions = unique('.gravityflow-instructions');
    const nativeEditor = unique('.entry-detail-view .gform_wrapper');
    const nativeActions = unique('.gravityflow-action-buttons');
    const nativeTimeline = unique('.gravityflow-timeline');

    // Gravity Flow renders the editable Gravity Forms editor only after its
    // own generic current-assignee can_update() predicate succeeds. Treat that
    // host-rendered editor as runtime proof of editability for non-Approval
    // steps too; Approval eligibility remains a separate concern.
    const hostEditable = serverHostEditable || nativeEditor.count === 1;
    dossier.dataset.gppHostEditable = hostEditable ? '1' : '0';

    // Preflight every ownership-sensitive region before moving any host node.
    // Any ambiguity leaves Gravity Flow's native UI untouched. Conditional
    // instructions/timeline may be absent. Approval controls are required only
    // when the server proved current-assignee Approval eligibility.
    if (
      nativeInstructions.count > 1 ||
      nativeEditor.count > 1 ||
      nativeActions.count > 1 ||
      nativeTimeline.count > 1 ||
      (serverHostEditable && nativeEditor.count !== 1)
    ) {
      markFailure(form, dossier, 'failed-host-ambiguity');
      return;
    }

    if (actionsExpected) {
      if (!actionsTarget || nativeActions.count !== 1) {
        markFailure(form, dossier, 'failed-actions-missing');
        return;
      }
      const approvedControls = nativeActions.node.querySelectorAll('[value="approved"]');
      const rejectedControls = nativeActions.node.querySelectorAll('[value="rejected"]');
      if (approvedControls.length !== 1 || rejectedControls.length !== 1) {
        markFailure(form, dossier, 'failed-actions-ambiguous');
        return;
      }
    } else {
      if (actionsTarget) {
        markFailure(form, dossier, 'failed-readonly-actions-target');
        return;
      }

      if (nativeActions.count === 1) {
        // Gravity Flow may render a unique non-Approval status/action cluster
        // outside the editable gform_wrapper (for example User Input). If the
        // host also rendered its unique editable editor and the cluster has no
        // Approval controls, leave that original node exactly where Gravity
        // Flow put it. GPP neither absorbs nor suppresses host-owned workflow
        // controls. Without host editability this remains fail-closed.
        if (!hostEditable) {
          markFailure(form, dossier, 'failed-readonly-actions-present');
          return;
        }
        if (
          nativeActions.node.querySelectorAll('[value="approved"]').length !== 0 ||
          nativeActions.node.querySelectorAll('[value="rejected"]').length !== 0
        ) {
          markFailure(form, dossier, 'failed-unexpected-approval-actions');
          return;
        }
      }
    }

    if (nativeInstructions.node && instructionsTarget) instructionsTarget.append(nativeInstructions.node);
    else instructionsTarget?.remove();

    if (nativeEditor.node && editorTarget) editorTarget.append(nativeEditor.node);
    else editorTarget?.remove();

    if (actionsExpected) actionsTarget.append(nativeActions.node);

    if (nativeTimeline.node && historyTarget) historyTarget.append(nativeTimeline.node);
    else dossier.querySelector('[data-gpp-optional-history]')?.remove();

    dossier.classList.add('gpp-entry-dossier--composed');
    dossier.dataset.gppCompositionState = 'composed';
    form.dataset.gppEntryDetailComposition = 'composed';
    bindPreview(dossier);
  };

  const init = () => document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').forEach(compose);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
