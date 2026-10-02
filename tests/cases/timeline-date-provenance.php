<?php

function wp_strip_all_tags( $value ) {
    return strip_tags( (string) $value );
}

final class GFAPI {
    public static $notes = array();
    public static $queries = array();

    public static function get_notes( $search_criteria = array(), $sorting = null ) {
        self::$queries[] = $search_criteria;
        return self::$notes;
    }
}

final class PGR_Jalali_Presentation {
    public static $mode = 'value';
    public static $calls = array();

    public static function format_datetime( DateTimeInterface $source, ?DateTimeZone $target_timezone = null ) {
        self::$calls[] = array(
            'timestamp' => $source->getTimestamp(),
            'timezone' => $source->getTimezone()->getName(),
        );

        if ( 'exception' === self::$mode ) {
            throw new RuntimeException( 'provider failure' );
        }
        if ( 'null' === self::$mode ) {
            return null;
        }
        if ( 'empty' === self::$mode ) {
            return '';
        }

        return 'jalali:' . $source->format( 'Y-m-d H:i:s' );
    }
}

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailTimelineSemanticPresentation;

Autoloader::register();

$persisted = (object) array(
    'id' => 7,
    'date_created' => '2026-03-20 20:30:00',
    'value' => 'Review opened',
    'note_type' => 'gravityflow',
    'sub_type' => '',
);
$non_flow = (object) array(
    'id' => 8,
    'date_created' => '2026-03-20 20:31:00',
    'value' => 'User note',
    'note_type' => 'user',
    'sub_type' => '',
);
GFAPI::$notes = array( $persisted, $non_flow );

$entry = array(
    'id' => 42,
    'date_created' => '2026-01-01 00:00:00',
);
$entry_before = $entry;
$persisted_before = clone $persisted;

$reflection = new ReflectionClass( EntryDetailTimelineSemanticPresentation::class );
$dates_method = $reflection->getMethod( 'persistedNoteDatesForEntry' );
$dates_method->setAccessible( true );
$present_method = $reflection->getMethod( 'timelineDatePresentation' );
$present_method->setAccessible( true );

$dates = $dates_method->invoke( null, $entry );
gpp_assert_same( array( 7 => '2026-03-20 20:30:00' ), $dates, 'Only persisted Gravity Flow notes for the current Entry may establish note timestamp provenance.' );
gpp_assert_same( array( array( 'entry_id' => 42 ) ), GFAPI::$queries, 'Persisted note provenance must be resolved through the current Entry boundary.' );

$result = $present_method->invoke( null, clone $persisted, $entry, $dates );
gpp_assert_same( 'jalali:2026-03-20 20:30:00', $result, 'Persisted Gravity Flow note with authoritative GF note provenance must be admitted.' );
gpp_assert_same( 'UTC', PGR_Jalali_Presentation::$calls[0]['timezone'], 'Persisted note source must reach the provider as explicit UTC.' );

$submitted = (object) array(
    'id' => 0,
    'date_created' => '2026-01-01 00:00:00',
    'value' => 'Workflow Submitted',
    'user_id' => 1,
    'user_name' => 'fixture',
);
$result = $present_method->invoke( null, $submitted, $entry, $dates );
gpp_assert_same( 'jalali:2026-01-01 00:00:00', $result, 'Workflow Submitted must be admitted when it exactly carries authoritative entry.date_created.' );

$unknown = clone $submitted;
$unknown->value = 'Unknown synthetic event';
gpp_assert_same( null, $present_method->invoke( null, $unknown, $entry, $dates ), 'Unknown synthetic event must fail closed even when its date matches the Entry.' );

$mismatch = clone $persisted;
$mismatch->date_created = '2026-03-20 20:30:01';
gpp_assert_same( null, $present_method->invoke( null, $mismatch, $entry, $dates ), 'Persisted note timestamp mismatch must fail closed.' );

$submitted_mismatch = clone $submitted;
$submitted_mismatch->date_created = '2026-01-01 00:00:01';
gpp_assert_same( null, $present_method->invoke( null, $submitted_mismatch, $entry, $dates ), 'Workflow Submitted timestamp mismatch must fail closed.' );

$missing = (object) array( 'id' => 7, 'value' => 'Review opened' );
gpp_assert_same( null, $present_method->invoke( null, $missing, $entry, $dates ), 'Missing date_created must fail closed.' );

$non_scalar = clone $persisted;
$non_scalar->date_created = array( 'not', 'scalar' );
gpp_assert_same( null, $present_method->invoke( null, $non_scalar, $entry, $dates ), 'Non-scalar date_created must fail closed.' );

$malformed = clone $persisted;
$malformed->date_created = 'not-a-date';
$malformed_dates = array( 7 => 'not-a-date' );
gpp_assert_same( null, $present_method->invoke( null, $malformed, $entry, $malformed_dates ), 'Provenance alone must not bypass strict datetime shape validation.' );

$invalid_calendar = clone $persisted;
$invalid_calendar->date_created = '2026-02-31 20:30:00';
$invalid_dates = array( 7 => '2026-02-31 20:30:00' );
gpp_assert_same( null, $present_method->invoke( null, $invalid_calendar, $entry, $invalid_dates ), 'Invalid calendar datetime must fail closed.' );

foreach ( array( 'null', 'empty', 'exception' ) as $mode ) {
    PGR_Jalali_Presentation::$mode = $mode;
    gpp_assert_same(
        null,
        $present_method->invoke( null, clone $persisted, $entry, $dates ),
        'Provider ' . $mode . ' result must leave the native Timeline date unchanged.'
    );
}
PGR_Jalali_Presentation::$mode = 'value';

gpp_assert_same( $entry_before, $entry, 'Timeline presentation must not mutate the authoritative Entry.' );
gpp_assert_same( get_object_vars( $persisted_before ), get_object_vars( $persisted ), 'Timeline presentation must not mutate the authoritative persisted note.' );

echo "TIMELINE_DATE_PROVENANCE_PASS\n";
