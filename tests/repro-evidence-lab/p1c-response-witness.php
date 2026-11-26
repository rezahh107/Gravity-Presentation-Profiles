<?php
// Disposable PHP server observation only. This file is outside the runtime ZIP.
if ( PHP_SAPI !== 'cli-server' || ( $_SERVER['REQUEST_METHOD'] ?? '' ) !== 'POST'
    || ! in_array( $_SERVER['REMOTE_ADDR'] ?? '', array( '127.0.0.1', '::1' ), true )
    || parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH ) !== '/wp-admin/admin-ajax.php'
    || ! in_array( $_POST['action'] ?? '', array( 'gpp_inbox2_read', 'gpp_inbox2_atomic_bootstrap' ), true )
    || ( $_SERVER['HTTP_X_P1C_CONTROL'] ?? '' ) === 'direct' ) {
    return;
}

$p1c_witness_file = getenv( 'P1C_RESPONSE_EVIDENCE_FILE' );
$p1c_scope = $_SERVER['HTTP_X_P1C_RESPONSE_SCOPE'] ?? '';
if ( ! is_string( $p1c_witness_file ) || ! is_file( $p1c_witness_file )
    || ! preg_match( '/\A[0-9a-f]{32}\z/', $p1c_scope ) ) {
    return;
}
$p1c_post = file_get_contents( 'php://input' );
if ( ! is_string( $p1c_post ) ) {
    return;
}
$p1c_request_key = hash_hmac( 'sha256', $p1c_post, $p1c_scope );
unset( $p1c_post, $p1c_scope );
$p1c_partial = false;

ob_start( static function ( string $body, int $phase ) use ( $p1c_witness_file, $p1c_request_key, &$p1c_partial ): string {
    if ( ( $phase & PHP_OUTPUT_HANDLER_FINAL ) === 0 ) {
        $p1c_partial = true;
        return $body;
    }
    if ( $p1c_partial || ( $phase & PHP_OUTPUT_HANDLER_CLEAN ) !== 0 ) {
        return $body;
    }

    $decoded = json_decode( $body );
    $data = $decoded->data ?? null;
    $success = is_bool( $decoded->success ?? null ) ? $decoded->success : null;
    $reason = ( $data->reason ?? null ) === 'authorization_required' ? 'authorization_required' : null;
    $private = preg_match( '/SYN-P1C-|data-ciq2-entry/i', $body ) === 1
        || ( is_numeric( $data->count ?? null ) && $data->count > 0 );
    $exact_denial = $success === false && $reason !== null
        && count( get_object_vars( $decoded ) ) === 2 && count( get_object_vars( $data ) ) === 1;
    $observation = array(
        'key'          => $p1c_request_key,
        'status'       => http_response_code(),
        'noStore'      => preg_grep( '/^Cache-Control:\s*.*\bno-store\b/i', headers_list() ) !== array(),
        'bodyObserved' => is_object( $decoded ),
        'privateData'  => $private ? true : ( $exact_denial ? false : null ),
        'success'      => $success,
        'rejection'    => $reason,
    );
    // Persist only the scoped fingerprint and sanitized outcome, never the body.
    @file_put_contents( $p1c_witness_file, json_encode( $observation ) . "\n", FILE_APPEND | LOCK_EX );
    return $body;
} );
