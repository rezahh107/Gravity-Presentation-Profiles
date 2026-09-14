<?php

require_once __DIR__ . '/../helpers.php';

$root = dirname( __DIR__, 2 );
$adapter = file_get_contents( $root . '/src/SRWF/GravityFlow/PrintDossierPresentationAdapter.php' );
$css = file_get_contents( $root . '/assets/css/srwf-gravity-flow-print-dossier.css' );

gpp_assert_true( false !== strpos( $adapter, "gravityflow_print_entry_footer" ), 'Print composition must use the post-permission footer seam.' );
gpp_assert_true( false === strpos( $adapter, "gravityflow_print_entry_header" ), 'Print adapter must not register the pre-permission header seam.' );
gpp_assert_true( false !== strpos( $adapter, "for ( $i = 0; $i < 5; $i++ )" ), 'Receipt anatomy must remain exactly five rows.' );
gpp_assert_true( false !== strpos( $adapter, "for ( $i = 0; $i < 6; $i++ )" ), 'Cheque anatomy must remain exactly six rows.' );
gpp_assert_true( false !== strpos( $css, '@page { size: A4 portrait;' ), 'Paged-media CSS must declare A4 portrait.' );
gpp_assert_true( false === stripos( $css, 'transform: scale(' ) && false === stripos( $css, 'zoom:' ), 'Canonical Print must not use global scaling.' );

echo "WU19_STATIC_CONTRACT_PASS\n";
