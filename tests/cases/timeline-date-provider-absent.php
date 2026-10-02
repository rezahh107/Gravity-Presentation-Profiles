<?php

function wp_strip_all_tags( $value ) {
    return strip_tags( (string) $value );
}

final class GFAPI {
    public static function get_notes( $search_criteria = array(), $sorting = null ) {
        return array(
            (object) array(
                'id' => 9,
                'date_created' => '2026-03-20 20:30:00',
                'value' => 'Review opened',
                'note_type' => 'gravityflow',
                'sub_type' => '',
            ),
        );
    }
}

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailTimelineSemanticPresentation;

Autoloader::register();

$entry = array( 'id' => 42, 'date_created' => '2026-01-01 00:00:00' );
$note = (object) array(
    'id' => 9,
    'date_created' => '2026-03-20 20:30:00',
    'value' => 'Review opened',
    'note_type' => 'gravityflow',
);

$reflection = new ReflectionClass( EntryDetailTimelineSemanticPresentation::class );
$dates_method = $reflection->getMethod( 'persistedNoteDatesForEntry' );
$dates_method->setAccessible( true );
$present_method = $reflection->getMethod( 'timelineDatePresentation' );
$present_method->setAccessible( true );

$dates = $dates_method->invoke( null, $entry );
gpp_assert_same(
    null,
    $present_method->invoke( null, $note, $entry, $dates ),
    'Qualified Timeline provenance must preserve native date presentation when PersianGravity is unavailable.'
);

echo "TIMELINE_DATE_PROVIDER_ABSENT_PASS\n";
