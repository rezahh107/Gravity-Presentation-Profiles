( function () {
    'use strict';

    var surfaceSelector = '.gflow-inbox.gflow-grid.gflow-common';
    var controlSelector = '[data-gpp-inbox-manual-refresh]';
    var label = 'به‌روزرسانی کارهای من';
    var settingsLabel = 'تنظیمات اعلان‌ها';

    function mount( inbox ) {
        var control = inbox.querySelector( controlSelector );
        var outside = inbox.previousElementSibling;
        if ( ! control && outside && outside.classList.contains( 'gpp-inbox-manual-refresh' ) ) {
            control = outside.querySelector( controlSelector );
        }
        if ( ! control ) {
            var container = document.createElement( 'p' );
            container.className = 'gpp-inbox-manual-refresh';
            control = document.createElement( 'button' );
            control.type = 'button';
            control.className = 'button button-secondary gpp-inbox-manual-refresh__button';
            control.setAttribute( 'data-gpp-inbox-manual-refresh', '' );
            control.setAttribute( 'lang', 'fa' );
            control.setAttribute( 'dir', 'rtl' );
            control.setAttribute( 'aria-label', label );
            control.textContent = label;
            control.addEventListener( 'click', function () {
                if ( control.disabled ) { return; }
                control.disabled = true;
                control.setAttribute( 'aria-busy', 'true' );
                control.textContent = 'در حال به‌روزرسانی…';
                control.setAttribute( 'aria-label', control.textContent );
                // Preserve the existing native document lifecycle and URL. Flow
                // does not persist its quick search across a document reload.
                window.location.reload();
            } );
            container.appendChild( control );
            inbox.parentNode.insertBefore( container, inbox );
        }

        // Only the admitted SRWF frontend surface gets the composition. Keep
        // the Inbox/flyout sibling relationship used by native Push intact.
        if ( ! inbox.closest( '.gpp-inbox-surface' ) ) { return; }
        var headers = inbox.querySelectorAll( '.gflow-grid__header' );
        var searches = inbox.querySelectorAll( '[data-js="gflow-inbox-search"]' );
        var settings = inbox.querySelectorAll( 'button[data-js="inbox-settings"]' );
        var toolbar = inbox.querySelector( '[data-gpp-inbox-toolbar]' );
        var valid = headers.length === 1 && searches.length === 1 && settings.length === 1
            && headers[0].contains( searches[0] ) && inbox.dataset.gridId
            && settings[0].dataset.gridId === inbox.dataset.gridId
            && ( headers[0].parentNode === inbox || headers[0].parentNode === toolbar )
            && ( settings[0].parentNode === inbox || settings[0].parentNode === toolbar );
        if ( ! valid ) {
            // Unknown/replaced host shape: unwrap only our composition. Never
            // remove a native node or apply a substitute action.
            if ( toolbar ) {
                while ( toolbar.firstChild ) { inbox.insertBefore( toolbar.firstChild, toolbar ); }
                toolbar.remove();
            }
            return;
        }
        if ( ! toolbar ) {
            toolbar = document.createElement( 'div' );
            toolbar.setAttribute( 'data-gpp-inbox-toolbar', '' );
            toolbar.setAttribute( 'role', 'group' );
            toolbar.setAttribute( 'aria-label', 'ابزارهای کارهای من' );
            inbox.insertBefore( toolbar, inbox.firstChild );
        }
        // Idempotent original-node moves preserve delegated native events,
        // search's closest Inbox, grid identity and DOM keyboard order.
        [ headers[0], control.parentNode, settings[0] ].forEach( function ( node ) {
            if ( node.parentNode !== toolbar ) { toolbar.appendChild( node ); }
        } );
        if ( settings[0].textContent !== settingsLabel ) {
            settings[0].textContent = settingsLabel;
            settings[0].setAttribute( 'aria-label', settingsLabel );
            settings[0].setAttribute( 'title', settingsLabel );
        }
    }

    function reconcile() {
        document.querySelectorAll( surfaceSelector ).forEach( mount );
    }

    function start() {
        reconcile();
        // Persistent, mutation-driven and idempotent: native grid rerenders may
        // replace controls. No timers, host API calls or duplicated state.
        if ( typeof MutationObserver !== 'undefined' ) {
            new MutationObserver( reconcile ).observe( document.body, { childList: true, subtree: true } );
        }
    }
    window.addEventListener( 'pageshow', function () {
        document.querySelectorAll( controlSelector ).forEach( function ( control ) {
            control.disabled = false;
            control.removeAttribute( 'aria-busy' );
            control.textContent = label;
            control.setAttribute( 'aria-label', label );
        } );
    } );
    if ( 'loading' === document.readyState ) {
        document.addEventListener( 'DOMContentLoaded', start, { once: true } );
    } else { start(); }
}() );
