<?php

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;
use GravityPresentationProfiles\GravityForms\EntryDetailVisualVariantService;
use GravityPresentationProfiles\SRWF\GravityFlow\BoundHostValueReader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

$provider_url = 'https://github.com/rezahh107/PersianGravity/releases/download/v4.6.0/persian-gravityforms-4.6.0.zip';
$provider_sha256 = 'f54622809df6c99435fa9d80001efb26b0e8434ef6765001d8b9dbe1366d14d9';
$provider_size = 492173;
$provider_source_sha = 'd134c9ac81b177a32a3138f074fca3d1c1ebfae4';

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';

wu18_assert( function_exists( 'WP_Filesystem' ) && WP_Filesystem(), 'WordPress filesystem could not initialize for exact provider package extraction.' );

$tmp = download_url( $provider_url, 60 );
wu18_assert( ! is_wp_error( $tmp ) && is_string( $tmp ) && is_file( $tmp ), 'Could not download exact PersianGravity v4.6.0 release asset.' );
wu18_assert( $provider_size === filesize( $tmp ), 'PersianGravity v4.6.0 release asset size mismatch.' );
wu18_assert( $provider_sha256 === hash_file( 'sha256', $tmp ), 'PersianGravity v4.6.0 release asset SHA-256 mismatch.' );

$unzipped = unzip_file( $tmp, WP_PLUGIN_DIR );
@unlink( $tmp );
wu18_assert( true === $unzipped, 'Could not extract exact PersianGravity v4.6.0 release asset.' );

$provider_plugin = 'persian-gravityforms/persian-gravityforms.php';
wu18_assert( is_file( WP_PLUGIN_DIR . '/' . $provider_plugin ), 'Expected PersianGravity release plugin root was not extracted.' );
$activation = activate_plugin( $provider_plugin );
wu18_assert( ! is_wp_error( $activation ), 'Exact PersianGravity v4.6.0 package could not be activated.' );
wu18_assert( defined( 'PGR_VERSION' ) && '4.6.0' === PGR_VERSION, 'Activated PersianGravity package did not expose exact version 4.6.0.' );

RuntimeDiagnostics::resetSurface( PersianGravityJalaliBridge::DIAGNOSTIC_SURFACE );

$decode_text = static function ( $value ) {
    return trim( html_entity_decode( wp_strip_all_tags( (string) $value ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
};
$extract_entry_created = static function ( $html ) use ( $decode_text ) {
    $match = array();
    if ( 1 !== preg_match( '~data-gpp-slot="entry\.created_at"[^>]*>.*?<dd>(.*?)</dd>~su', (string) $html, $match ) ) {
        return null;
    }
    return $decode_text( $match[1] );
};
$extract_inbox_created = static function ( $html ) use ( $decode_text ) {
    $match = array();
    if ( 1 !== preg_match( '~class="gpp-inbox-card__detail gpp-inbox-card__created-at"[^>]*>.*?<dd>(.*?)</dd>~su', (string) $html, $match ) ) {
        return null;
    }
    return $decode_text( $match[1] );
};
$extract_timeline_meta = static function ( $html ) use ( $decode_text ) {
    $matches = array();
    preg_match_all( '~<div class="gravityflow-note-meta">(.*?)</div>~su', (string) $html, $matches );
    return array_map( $decode_text, isset( $matches[1] ) ? $matches[1] : array() );
};
$provider_for_utc = static function ( $raw ) {
    return PGR_Jalali_Presentation::format_datetime(
        new DateTimeImmutable( (string) $raw, new DateTimeZone( 'UTC' ) )
    );
};

$inbox_manifest = get_option( 'gpp_wu21_fixture_manifest' );
wu18_assert( is_array( $inbox_manifest ) && ! empty( $inbox_manifest['entry_ids'][0] ), 'Authentic Inbox fixture is unavailable for PersianGravity consumer proof.' );
$inbox_entry_id = (int) $inbox_manifest['entry_ids'][0];
$inbox_entry = GFAPI::get_entry( $inbox_entry_id );
wu18_assert( is_array( $inbox_entry ) && ! empty( $inbox_entry['date_created'] ), 'Authentic Inbox entry date_created is unavailable.' );
$inbox_raw_before = (string) $inbox_entry['date_created'];
$inbox_native_expected = $decode_text( GFCommon::format_date( $inbox_raw_before, false ) );
$inbox_formatter_native = $decode_text( PersianDateFormatter::formatDateTime( $inbox_raw_before ) );
wu18_assert( $inbox_native_expected === $inbox_formatter_native, 'Provider-disabled formatter did not preserve normalized Gravity Forms native date presentation.' );

// Exact released provider, module default OFF: production Inbox presentation
// must remain on the host/native date without weakening the ready card.
wu18_assert( ! class_exists( 'PGR_Jalali_Presentation', false ), 'Jalali presentation facade loaded while the released module default is disabled.' );
InboxPresentationAdapter::resetRuntimeCache();
$inbox_native_card = InboxPresentationAdapter::filterValue(
    '',
    (int) $inbox_entry['form_id'],
    InboxPresentationAdapter::CARD_COLUMN,
    $inbox_entry
);
wu18_assert( is_string( $inbox_native_card ) && false !== strpos( $inbox_native_card, 'gpp-inbox-card' ), 'Native-fallback Inbox card did not render through the production adapter.' );
wu18_assert( $inbox_native_expected === $extract_inbox_created( $inbox_native_card ), 'Disabled exact provider module did not preserve native Inbox date presentation.' );
wu18_assert( $inbox_raw_before === (string) GFAPI::get_entry( $inbox_entry_id )['date_created'], 'Native-fallback Inbox presentation mutated authoritative date_created.' );

// Exercise the actual Entry Detail + Timeline render path while the exact
// provider is installed but its Jalali presentation module is still disabled.
wp_set_current_user( $operator->ID );
$variant_service = EntryDetailVisualVariantService::forWordPress();
$variant_before = $variant_service->activeFacts();
wu18_assert( 'active' === $variant_before['state'] && in_array( $variant_before['variant'], array( 'current_safe', 'full_width' ), true ), 'WU18 Entry Detail visual baseline is not a recognized Owner variant.' );
$variant_changed = false;
if ( 'full_width' !== $variant_before['variant'] ) {
    $switched = $variant_service->switchVariant(
        array(
            'target_variant' => 'full_width',
            'expected_current_activation' => $variant_before['activation'],
        )
    );
    wu18_assert( in_array( $switched['status'], array( EntryDetailVisualVariantService::STATUS_COMPLETED, EntryDetailVisualVariantService::STATUS_NO_CHANGE ), true ), 'Could not activate Full Width for provider consumer proof.' );
    $variant_changed = true;
}

$original_get = $_GET;
$_GET['view'] = 'entry';
$_GET['page'] = 'gravityflow-inbox';
$_GET['lid'] = (int) $manifest['alpha']['entry_id'];

try {
    list( $native_entry_html, , $native_entry ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
    $native_created_expected = $decode_text( GFCommon::format_date( (string) $native_entry['date_created'], false ) );
    wu18_assert( $native_created_expected === $extract_entry_created( $native_entry_html ), 'Disabled exact provider module did not preserve native Entry Detail entry.created_at presentation.' );

    $native_notes = Gravity_Flow_Common::get_timeline_notes( $native_entry );
    wu18_assert( is_array( $native_notes ) && array() !== $native_notes, 'Authentic Timeline notes unavailable for native fallback proof.' );
    $native_timeline_expected = array();
    foreach ( $native_notes as $note ) {
        wu18_assert( is_object( $note ) && isset( $note->date_created ), 'Authentic Timeline note lacks raw date_created.' );
        $native_timeline_expected[] = $decode_text( Gravity_Flow_Common::format_date( (string) $note->date_created, '', false, true ) );
    }
    wu18_assert( $native_timeline_expected === $extract_timeline_meta( $native_entry_html ), 'Disabled exact provider module did not preserve native Timeline date presentation.' );

    wu18_assert( function_exists( 'pgr_initialize_admin' ) && function_exists( 'pgr_initialize' ), 'Exact provider bootstrap functions are unavailable.' );
    pgr_initialize_admin();
    wu18_assert( class_exists( 'PGR_Module_Registry', false ), 'Exact provider module registry did not initialize.' );
    wu18_assert( ! PGR_Module_Registry::is_enabled( 'jalali_presentation' ), 'Released jalali_presentation module default is not disabled.' );
    wu18_assert( PGR_Module_Registry::set_enabled( 'jalali_presentation', true ), 'Could not enable exact provider jalali_presentation module in disposable lab.' );
    pgr_initialize();
    wu18_assert( PGR_Module_Registry::is_enabled( 'jalali_presentation' ), 'Exact provider jalali_presentation module did not remain enabled.' );
    wu18_assert( class_exists( 'PGR_Jalali_Presentation', false ) && is_callable( array( 'PGR_Jalali_Presentation', 'format_datetime' ) ), 'Exact provider public Jalali facade did not load.' );

    $old_timezone = get_option( 'timezone_string', '' );
    $old_offset = get_option( 'gmt_offset', 0 );
    update_option( 'timezone_string', 'Asia/Tehran' );

    try {
        // Explicit UTC -> site-timezone day boundary: 20:30 UTC becomes 00:00
        // local on the next Gregorian/Jalali civil day in Asia/Tehran.
        $raw = '2026-03-20 20:30:00';
        $native = GFCommon::format_date( $raw, false );
        wu18_assert( is_string( $native ) && '' !== $native, 'Native Gravity Forms date presentation is unavailable.' );
        $source = new DateTimeImmutable( $raw, new DateTimeZone( 'UTC' ) );
        $provider_value = PGR_Jalali_Presentation::format_datetime( $source );
        $gpp_value = PersianDateFormatter::formatDateTime( $raw );
        wu18_assert( '۱۴۰۵/۰۱/۰۱، ۰۰:۰۰' === $provider_value, 'Exact provider did not produce its qualified UTC-to-site-timezone boundary value.' );
        wu18_assert( $provider_value === $gpp_value, 'GPP did not return the exact public provider output.' );
        wu18_assert( $gpp_value === PersianDateFormatter::formatDateTime( $raw ), 'Exact provider-backed GPP rendering is not deterministic.' );
        wu18_assert( $raw === '2026-03-20 20:30:00', 'Presentation mutated the authoritative source value.' );

        $out_of_range = '1799-12-31 00:00:00';
        $out_native = GFCommon::format_date( $out_of_range, false );
        wu18_assert( null === PGR_Jalali_Presentation::format_datetime( new DateTimeImmutable( $out_of_range, new DateTimeZone( 'UTC' ) ) ), 'Exact provider did not return null outside its validated range.' );
        wu18_assert( $decode_text( $out_native ) === $decode_text( PersianDateFormatter::formatDateTime( $out_of_range ) ), 'Provider null did not preserve native Gravity Forms presentation.' );

        // Production Inbox adapter: exact raw UTC source -> exact public facade
        // output; native row/query identity remains untouched.
        $inbox_entry = GFAPI::get_entry( $inbox_entry_id );
        $inbox_raw = (string) $inbox_entry['date_created'];
        $inbox_expected = $provider_for_utc( $inbox_raw );
        wu18_assert( is_string( $inbox_expected ) && '' !== $inbox_expected, 'Exact provider returned no Inbox fixture presentation.' );
        InboxPresentationAdapter::resetRuntimeCache();
        $inbox_provider_card = InboxPresentationAdapter::filterValue(
            '',
            (int) $inbox_entry['form_id'],
            InboxPresentationAdapter::CARD_COLUMN,
            $inbox_entry
        );
        wu18_assert( $decode_text( $inbox_expected ) === $extract_inbox_created( $inbox_provider_card ), 'Production Inbox adapter did not apply exact PersianGravity output.' );
        wu18_assert( $inbox_raw === (string) GFAPI::get_entry( $inbox_entry_id )['date_created'], 'Provider-backed Inbox presentation mutated authoritative date_created.' );

        // Production Entry Detail + Timeline path in Full Width. The dossier slot
        // and every native Timeline date meta value must match the direct facade
        // result derived from raw host timestamps, not visible text parsing.
        EntryDetailPresentationAdapter::resetRuntimeCache();
        list( $provider_entry_html, , $provider_entry ) = wu18_render_entry( $manifest['alpha']['form_id'], $manifest['alpha']['entry_id'] );
        $entry_raw = (string) $provider_entry['date_created'];
        $entry_expected = $provider_for_utc( $entry_raw );
        wu18_assert( is_string( $entry_expected ) && '' !== $entry_expected, 'Exact provider returned no Entry Detail entry.created_at presentation.' );
        wu18_assert( $decode_text( $entry_expected ) === $extract_entry_created( $provider_entry_html ), 'Production Entry Detail did not apply exact PersianGravity output to entry.created_at.' );
        wu18_assert( $entry_raw === (string) GFAPI::get_entry( (int) $provider_entry['id'] )['date_created'], 'Provider-backed Entry Detail presentation mutated authoritative date_created.' );

        $provider_notes = Gravity_Flow_Common::get_timeline_notes( $provider_entry );
        wu18_assert( is_array( $provider_notes ) && array() !== $provider_notes, 'Authentic Timeline notes unavailable for provider application proof.' );
        $timeline_expected = array();
        foreach ( $provider_notes as $note ) {
            wu18_assert( is_object( $note ) && isset( $note->date_created ) && 1 === preg_match( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/D', (string) $note->date_created ), 'Timeline raw timestamp is not the qualified host UTC shape.' );
            $formatted = $provider_for_utc( (string) $note->date_created );
            wu18_assert( is_string( $formatted ) && '' !== $formatted, 'Exact provider returned no Timeline presentation for a qualified raw note timestamp.' );
            $timeline_expected[] = $decode_text( $formatted );
        }
        $timeline_actual = $extract_timeline_meta( $provider_entry_html );
        wu18_assert( count( $timeline_expected ) === count( $timeline_actual ), 'Provider-backed Timeline changed the authentic event count.' );
        wu18_assert( $timeline_expected === $timeline_actual, 'Production Timeline did not apply exact PersianGravity output in native event order.' );

        // Dedicated Jalali-domain field values remain on their own provider-owned
        // field formatter path. GPP must not reinterpret them as Gregorian/system
        // dates or infer calendar identity from digits/year shape.
        wu18_assert( class_exists( 'PGR_GF_Field_Jalali_Date', false ), 'Exact provider Jalali field class was not loaded.' );
        $jalali_field = new PGR_GF_Field_Jalali_Date();
        $jalali_field->id = 991;
        $jalali_field->label = 'WU18 Jalali Domain';
        $jalali_field->jalali_format = 'ymd_slash';
        $jalali_form = array( 'id' => 9918, 'fields' => array( $jalali_field ) );
        $jalali_entry = array( 'id' => 991801, 'form_id' => 9918, '991' => '1405-01-01' );
        $reader = new BoundHostValueReader();
        $jalali_source = array( 'type' => 'gravity_forms.field', 'field_id' => 991 );
        wu18_assert( '1405-01-01' === $reader->readRaw( $jalali_source, $jalali_form, $jalali_entry ), 'Dedicated Jalali-domain raw value changed.' );
        wu18_assert( '1405/01/01' === $reader->readDisplay( $jalali_source, $jalali_form, $jalali_entry ), 'Dedicated Jalali-domain value did not remain on its field-owned presentation path.' );
    } finally {
        update_option( 'timezone_string', $old_timezone );
        update_option( 'gmt_offset', $old_offset );
    }
} finally {
    $_GET = $original_get;
    if ( $variant_changed ) {
        $variant_now = $variant_service->activeFacts();
        if ( 'active' === $variant_now['state'] ) {
            $variant_service->switchVariant(
                array(
                    'target_variant' => $variant_before['variant'],
                    'expected_current_activation' => $variant_now['activation'],
                )
            );
        }
    }
    EntryDetailPresentationAdapter::resetRuntimeCache();
    InboxPresentationAdapter::resetRuntimeCache();
}

$bridge_result = PersianGravityJalaliBridge::formatDateTime( $source );
wu18_assert( PersianGravityJalaliBridge::STATUS_APPLIED === $bridge_result['status'], 'Exact provider application was not observable at the GPP bridge.' );
$integration_trace = RuntimeDiagnostics::snapshot( PersianGravityJalaliBridge::DIAGNOSTIC_SURFACE );
wu18_assert( is_array( $integration_trace ) && ! empty( $integration_trace['events'] ), 'PersianGravity consumer diagnostics are unavailable.' );
$integration_reasons = array_values( array_filter( array_column( $integration_trace['events'], 'reason_code' ) ) );
wu18_assert( in_array( PersianGravityJalaliBridge::STATUS_CAPABILITY_UNAVAILABLE, $integration_reasons, true ), 'Disabled-provider native fallback was not observable in diagnostics.' );
wu18_assert( in_array( PersianGravityJalaliBridge::STATUS_APPLIED, $integration_reasons, true ), 'Applied Jalali presentation was not observable in diagnostics.' );
wu18_assert( in_array( PersianGravityJalaliBridge::STATUS_PROVIDER_NATIVE_FALLBACK, $integration_reasons, true ), 'Provider-null native fallback was not observable in diagnostics.' );

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = json_decode( file_get_contents( $results_path ), true );
wu18_assert( is_array( $results ), 'WU18 runtime evidence is unavailable for PersianGravity evidence append.' );
$results['persian_gravity_jalali_consumer'] = array(
    'provider_release' => 'v4.6.0',
    'provider_source_sha' => $provider_source_sha,
    'provider_asset_sha256' => $provider_sha256,
    'provider_asset_size' => $provider_size,
    'provider_version_runtime' => PGR_VERSION,
    'module_default_disabled_native_fallback' => true,
    'public_facade_callable_after_enable' => true,
    'utc_source_timezone' => $source->getTimezone()->getName(),
    'timezone_boundary_provider_value' => $provider_value,
    'gpp_matches_provider_exactly' => true,
    'provider_null_native_fallback' => true,
    'repeated_render_deterministic' => true,
    'inbox' => array(
        'source' => 'entry.date_created',
        'source_timezone' => 'UTC',
        'native_fallback_proven' => true,
        'provider_application_proven' => true,
        'raw_value_unchanged' => true,
    ),
    'entry_detail' => array(
        'source' => 'entry.date_created',
        'source_timezone' => 'UTC',
        'native_fallback_proven' => true,
        'provider_application_proven' => true,
        'raw_value_unchanged' => true,
    ),
    'timeline' => array(
        'raw_property' => 'note.date_created',
        'source_timezone' => 'UTC',
        'gravity_flow_version' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null,
        'visible_text_parsed' => false,
        'native_fallback_proven' => true,
        'provider_application_proven' => true,
        'native_event_count_order_preserved' => true,
    ),
    'already_jalali' => array(
        'source_type' => 'gravity_forms.field:pgr_jalali_date',
        'raw_value_unchanged' => true,
        'field_owned_presentation_preserved' => true,
    ),
    'print' => array(
        'jalali_system_date_integration' => false,
        'reason' => 'no_currently_rendered_proven_system_date_source',
    ),
    'integration_diagnostics' => $integration_trace,
);
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_PERSIANGRAVITY_RUNTIME_PASS\n";
