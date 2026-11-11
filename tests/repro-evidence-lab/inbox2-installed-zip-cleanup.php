<?php
/** Restore shared WU21 synthetic fixture state after the isolated ZIP smoke. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$key = 'gpp_wu21_inbox2_extra_ids';
$extra = get_option( $key, false );
if ( false === $extra ) { echo "GPP_INBOX2_EXTRA_CLEANUP_NOT_NEEDED\n"; return; }
if ( ! is_array( $extra ) || empty( $extra['form_id'] ) || ! isset( $extra['ids'] )
    || ! is_array( $extra['ids'] ) ) {
    throw new RuntimeException( 'INBOX2_EXTRA_CLEANUP_MANIFEST_INVALID' );
}
foreach ( $extra['ids'] as $id ) {
    if ( ! is_int( $id ) || $id < 1 ) {
        throw new RuntimeException( 'INBOX2_EXTRA_CLEANUP_ID_INVALID' );
    }
    $entry = GFAPI::get_entry( $id );
    if ( is_wp_error( $entry ) ) { continue; }
    if ( (int) ( $entry['form_id'] ?? 0 ) !== (int) $extra['form_id'] ) {
        throw new RuntimeException( 'INBOX2_EXTRA_CLEANUP_FORM_MISMATCH' );
    }
    $result = GFAPI::delete_entry( $id );
    if ( is_wp_error( $result ) || false === $result ) {
        throw new RuntimeException( 'INBOX2_EXTRA_CLEANUP_DELETE_FAILED' );
    }
    if ( ! is_wp_error( GFAPI::get_entry( $id ) ) ) {
        throw new RuntimeException( 'INBOX2_EXTRA_CLEANUP_DELETE_NOT_OBSERVED' );
    }
}
delete_option( $key );
echo "GPP_INBOX2_EXTRA_CLEANUP_PASS\n";
