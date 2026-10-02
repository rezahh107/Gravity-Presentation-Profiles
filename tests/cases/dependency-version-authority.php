<?php

require_once __DIR__ . '/../helpers.php';

$root = dirname( __DIR__, 2 );
$bridge_path = $root . '/src/Core/Presentation/PersianGravityJalaliBridge.php';
$timeline_path = $root . '/src/SRWF/GravityFlow/EntryDetailTimelineSemanticPresentation.php';

$bridge = file_get_contents( $bridge_path );
$timeline = file_get_contents( $timeline_path );

gpp_assert_true( is_string( $bridge ) && '' !== $bridge, 'PersianGravity bridge source must exist.' );
gpp_assert_true( is_string( $timeline ) && '' !== $timeline, 'Timeline source must exist.' );

$executable_php_source = static function ( $source_text ) {
    $executable = '';
    foreach ( token_get_all( $source_text ) as $token ) {
        if ( is_array( $token ) && ( T_COMMENT === $token[0] || T_DOC_COMMENT === $token[0] ) ) {
            continue;
        }
        $executable .= is_array( $token ) ? $token[1] : $token;
    }
    return $executable;
};

$bridge_executable = $executable_php_source( $bridge );
$timeline_executable = $executable_php_source( $timeline );

gpp_assert_true( false === strpos( $bridge_executable, 'QUALIFIED_PROVIDER_VERSION' ), 'Historical provider-version identity must not return as runtime compatibility authority.' );
gpp_assert_true( false === strpos( $bridge_executable, 'STATUS_PROVIDER_INCOMPATIBLE' ), 'Version mismatch must not be represented as provider incompatibility without a capability-level defect.' );
gpp_assert_true( false === strpos( $bridge_executable, 'STATUS_PROVIDER_VERSION_UNPROVEN' ), 'Missing version metadata must not reject a compatible public capability.' );
gpp_assert_true( false === strpos( $bridge_executable, 'version_compare(' ), 'PersianGravity admission must not compare provider versions.' );
gpp_assert_true( false === strpos( $bridge_executable, "constant( 'PGR_VERSION' )" ), 'PersianGravity version value must not participate in admission logic.' );
gpp_assert_same( 1, substr_count( $bridge_executable, 'PGR_VERSION' ), 'PGR_VERSION may remain only as bounded provider-presence diagnostic metadata.' );
gpp_assert_true(
    false !== strpos( $bridge_executable, "class_exists( '\\\\PGR_Jalali_Presentation', false )" )
        && false !== strpos( $bridge_executable, "is_callable( array( '\\\\PGR_Jalali_Presentation', 'format_datetime' ) )" ),
    'PersianGravity runtime admission must be anchored to the consumed public facade/callable capability.'
);

gpp_assert_true( false === strpos( $timeline_executable, 'GRAVITY_FLOW_VERSION' ), 'Timeline Jalali admission must not inspect the Gravity Flow version constant.' );
gpp_assert_true( false === strpos( $timeline_executable, 'gravity_flow()->get_version()' ), 'Timeline Jalali admission must not inspect the Gravity Flow runtime version accessor.' );
gpp_assert_true( false === strpos( $timeline_executable, 'version_compare(' ), 'Timeline Jalali admission must not wrap version identity in a range comparison.' );
gpp_assert_true( false === strpos( $timeline_executable, "'3.1.0'" ), 'The historical Gravity Flow qualification release must not appear in executable Timeline admission code.' );
gpp_assert_true(
    false !== strpos( $timeline_executable, '\\GFAPI::get_notes(' )
        && false !== strpos( $timeline_executable, "'entry_id' => (int) $entry['id']" )
        && false !== strpos( $timeline_executable, "'note_type' => 'gravityflow'" )
        && false !== strpos( $timeline_executable, "'gravityflow' !== (string) $persisted->note_type" )
        && false !== strpos( $timeline_executable, "'gravityflow' === (string) $note->note_type" ),
    'Persisted Timeline date admission must be anchored to authoritative Gravity Forms note provenance.'
);
gpp_assert_true(
    false !== strpos( $timeline_executable, 'isWorkflowSubmittedSyntheticEvent' )
        && false !== strpos( $timeline_executable, '$raw === $entry_created ? $entry_created : null' ),
    'Synthetic Workflow Submitted admission must be anchored to the authoritative Entry timestamp relationship.'
);

echo "DEPENDENCY_VERSION_AUTHORITY_PASS\n";
