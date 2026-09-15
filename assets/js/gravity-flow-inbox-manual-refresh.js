( function () {
    'use strict';

    var surfaceSelector = '.gflow-inbox.gflow-grid.gflow-common';
    var controlAttribute = 'data-gpp-inbox-manual-refresh';
    var label = 'به‌روزرسانی کارهای من';

    function mount() {
        var inbox = document.querySelector( surfaceSelector );
        if ( ! inbox || ! inbox.parentNode || document.querySelector( '[' + controlAttribute + ']' ) ) {
            return;
        }

        var container = document.createElement( 'p' );
        container.className = 'gpp-inbox-manual-refresh';

        var button = document.createElement( 'button' );
        button.type = 'button';
        button.className = 'button button-secondary';
        button.setAttribute( controlAttribute, '' );
        button.setAttribute( 'aria-label', label );
        button.setAttribute( 'lang', 'fa' );
        button.setAttribute( 'dir', 'rtl' );
        button.textContent = label;
        button.addEventListener( 'click', function () {
            window.location.reload();
        } );

        container.appendChild( button );
        inbox.parentNode.insertBefore( container, inbox );
    }

    if ( 'loading' === document.readyState ) {
        document.addEventListener( 'DOMContentLoaded', mount, { once: true } );
    } else {
        mount();
    }
}() );
