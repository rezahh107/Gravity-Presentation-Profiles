<?php

require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

Autoloader::register();

function gpp_entry_review_assert( $condition, $message ) {
    if ( ! $condition ) {
        fwrite( STDERR, $message . PHP_EOL );
        exit( 1 );
    }
}

if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
    class Gravity_Flow_Entry_Detail {
        public static function can_update( $step ) {
            return ! empty( $step->can_update );
        }
    }
}

final class GPP_Entry_Review_Test_Step {
    public $can_update;
    private $type;
    private $editable;

    public function __construct( $type, $editable, $can_update = true ) {
        $this->type = $type;
        $this->editable = $editable;
        $this->can_update = $can_update;
    }

    public function get_type() {
        return $this->type;
    }

    public function get_editable_fields() {
        return $this->editable;
    }
}

$adapter = new ReflectionClass( EntryDetailPresentationAdapter::class );
$admission = $adapter->getMethod( 'readOnlyReviewAdmission' );
$admission->setAccessible( true );

$read_only = $admission->invoke( null, new GPP_Entry_Review_Test_Step( 'approval', array(), true ) );
gpp_entry_review_assert( true === $read_only['eligible'], 'Read-only Approval was not admitted.' );

$editor = $admission->invoke( null, new GPP_Entry_Review_Test_Step( 'approval', array( '17' ), true ) );
gpp_entry_review_assert( false === $editor['eligible'] && 'native_editor_required' === $editor['reason'], 'Approval editor did not force native fallback.' );

$user_input = $admission->invoke( null, new GPP_Entry_Review_Test_Step( 'user_input', array( '17' ), true ) );
gpp_entry_review_assert( false === $user_input['eligible'] && 'active_user_input_editing' === $user_input['reason'], 'User Input did not force native fallback.' );

$viewer = $admission->invoke( null, new GPP_Entry_Review_Test_Step( 'approval', array( '17' ), false ) );
gpp_entry_review_assert( true === $viewer['eligible'], 'Authorized non-editor read-only viewer was not admitted.' );

$root = dirname( __DIR__, 2 );
$php = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailPresentationAdapter.php' );
$css = file_get_contents( $root . '/assets/css/srwf-gravity-flow-entry-detail.css' );
$js = file_get_contents( $root . '/assets/js/srwf-gravity-flow-entry-detail.js' );

gpp_entry_review_assert( false !== strpos( $php, 'data-gpp-native-table-suppression="read-only-review"' ), 'Server suppression marker is missing.' );
gpp_entry_review_assert( false !== strpos( $php, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION' ), 'Suppression diagnostic stage is missing.' );
foreach ( array( 'data-gpp-composition-state', 'data-gpp-native-status', 'data-gpp-native-editor', 'data-gpp-native-instructions', 'data-gpp-native-history' ) as $obsolete ) {
    gpp_entry_review_assert( false === strpos( $php, $obsolete ), 'Obsolete composition destination remains in production PHP: ' . $obsolete );
}

gpp_entry_review_assert(
    false !== strpos( $css, '[data-gpp-native-table-suppression="read-only-review"] ~ .entry-detail-view' ),
    'CSS does not suppress the native Entry Detail table from the server marker.'
);
gpp_entry_review_assert( false === strpos( $css, '.gpp-entry-dossier--composed ~ .entry-detail-view' ), 'CSS still depends on JS composed state.' );
gpp_entry_review_assert( false !== strpos( $css, '.gravityflow-status-box' ), 'Scoped native workflow-box visual coordination is missing.' );

gpp_entry_review_assert( false !== strpos( $js, 'data-gpp-image-preview' ), 'Image preview progressive enhancement was removed.' );
foreach ( array( '.entry-detail-view', '.gravityflow-status-box', '.gravityflow-timeline', '.gravityflow-instructions', 'data-gpp-native-', 'gpp-entry-dossier--composed', 'gppEntryDetailComposition' ) as $structural_js ) {
    gpp_entry_review_assert( false === strpos( $js, $structural_js ), 'Structural composition remains in Entry Detail JavaScript: ' . $structural_js );
}

echo "ENTRY_DETAIL_REVIEW_ARCHITECTURE_PASS\n";
