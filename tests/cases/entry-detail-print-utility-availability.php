<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', realpath( __DIR__ . '/../../gravity-presentation-profiles.php' ) );
}

Autoloader::register();

final class EntryDetailPrintUtilityFixtureModel {
    private $status;
    public function __construct( $status ) { $this->status = $status; }
    public function bindingContextStatus( $entry ) {
        unset( $entry );
        return $this->status;
    }
}

$adapter = new ReflectionClass( PrintDossierPresentationAdapter::class );
$model_loaded = $adapter->getProperty( 'model_loaded' );
$model_loaded->setAccessible( true );
$model_resolution = $adapter->getProperty( 'model_resolution' );
$model_resolution->setAccessible( true );
$available = $adapter->getMethod( 'printUtilityAvailable' );
$available->setAccessible( true );

$model_loaded->setValue( null, true );
$model_resolution->setValue(
    null,
    array( 'model' => new EntryDetailPrintUtilityFixtureModel( 'ready' ), 'reason' => null )
);
gpp_assert_true(
    $available->invoke( null, array( 'id' => 10, 'form_id' => 20 ) ),
    'Print utility is available only when the existing Print model/context and required assets are ready.'
);

$model_resolution->setValue(
    null,
    array( 'model' => new EntryDetailPrintUtilityFixtureModel( 'binding_context_missing' ), 'reason' => null )
);
gpp_assert_true(
    ! $available->invoke( null, array( 'id' => 10, 'form_id' => 20 ) ),
    'Print utility must not advertise a missing Print binding context.'
);

gpp_assert_true(
    ! $available->invoke( null, array( 'id' => 0, 'form_id' => 20 ) ),
    'Print utility must reject an invalid current entry.'
);

echo "ENTRY_DETAIL_PRINT_UTILITY_AVAILABILITY_PASS\n";
