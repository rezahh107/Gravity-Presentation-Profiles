( function () {
    'use strict';

    var surfaceSelector = '.gflow-inbox.gflow-grid.gflow-common';
    var controlSelector = '[data-gpp-inbox-manual-refresh]';
    var controlAttribute = 'data-gpp-inbox-manual-refresh';
    var label = 'به‌روزرسانی کارهای من';
    var observer = null;

    function mount() {
        var inbox = document.querySelector( surfaceSelector );
        if ( ! inbox || ! inbox.parentNode || document.querySelector( controlSelector ) ) {
            return false;
        }

        var container = document.createElement( 'p' );
        container.className = 'gpp-inbox-manual-refresh';

        var button = document.createElement( 'button' );
        button.type = 'button';
        button.className = 'button button-secondary gpp-inbox-manual-refresh__button';
        button.setAttribute( controlAttribute, '' );
        button.setAttribute( 'aria-label', label );
        button.setAttribute( 'lang', 'fa' );
        button.setAttribute( 'dir', 'rtl' );
        button.textContent = label;
        button.addEventListener( 'click', function () {
            window.location.reload();
        } );

        container.appendChild( button );

        // Keep the recovery control outside the host-owned Inbox subtree. Native
        // AG Grid rerenders and Live Refresh transactions can replace grid nodes
        // without replacing or duplicating this one control.
        inbox.parentNode.insertBefore( container, inbox );
        return true;
    }

    function observeUntilMounted() {
        if ( mount() || observer || ! document.body || typeof MutationObserver === 'undefined' ) {
            return;
        }

        observer = new MutationObserver( function () {
            if ( mount() ) {
                observer.disconnect();
                observer = null;
            }
        } );
        observer.observe( document.body, { childList: true, subtree: true } );
    }

    if ( 'loading' === document.readyState ) {
        document.addEventListener( 'DOMContentLoaded', observeUntilMounted, { once: true } );
    } else {
        observeUntilMounted();
    }
}() );
