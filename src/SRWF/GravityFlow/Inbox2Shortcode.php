<?php
namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Read-only GPP Inbox 2 candidate over the 3.1.0-qualified native Task Model.
 * Gravity Flow retains task membership, authorization, Detail, and actions.
 */
final class Inbox2Shortcode {
    const TAG = 'gpp_inbox_2';

    public static function register() {
        if ( ! function_exists( 'add_shortcode' ) || ! function_exists( 'add_action' ) ) { return; }
        add_shortcode( self::TAG, array( __CLASS__, 'render' ) );
        add_action( 'wp_ajax_gpp_inbox2_read', array( __CLASS__, 'ajaxRead' ) );
        add_action( 'wp_ajax_nopriv_gpp_inbox2_read', array( __CLASS__, 'ajaxDenied' ) );
        add_action( 'template_redirect', array( __CLASS__, 'noCachePage' ), 1 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueOnPage' ), 5 );
    }

    private static function validId( $value ) {
        return ( is_string( $value ) || is_int( $value ) )
            && preg_match( '/^[1-9][0-9]*$/D', (string) $value )
            && (int) $value > 0 && (string) (int) $value === (string) $value;
    }

    private static function matchingShortcode( $post, $form_id, $native_page_id ) {
        if ( ! $post instanceof \WP_Post || 'publish' !== $post->post_status ) { return false; }
        $regex = get_shortcode_regex( array( self::TAG ) );
        if ( ! preg_match_all( '/' . $regex . '/s', $post->post_content, $found, PREG_SET_ORDER ) ) { return false; }
        foreach ( $found as $hit ) {
            if ( ( $hit[2] ?? '' ) !== self::TAG ) { continue; }
            $atts = shortcode_parse_atts( $hit[3] ?? '' );
            if ( is_array( $atts ) && self::validId( $atts['form'] ?? null )
                && self::validId( $atts['native_page'] ?? null )
                && (int) $atts['form'] === $form_id && (int) $atts['native_page'] === $native_page_id ) {
                return true;
            }
        }
        return false;
    }

    private static function nativePageAdmitted( $page_id, $form_id ) {
        $post = get_post( $page_id );
        if ( ! $post instanceof \WP_Post || 'publish' !== $post->post_status
            || ! current_user_can( 'read_post', $page_id ) ) { return false; }
        if ( has_block( 'gravityflow/inbox', $post ) ) { return true; }
        $regex = get_shortcode_regex( array( 'gravityflow' ) );
        if ( ! preg_match_all( '/' . $regex . '/s', $post->post_content, $found, PREG_SET_ORDER ) ) { return false; }
        foreach ( $found as $hit ) {
            if ( ( $hit[2] ?? '' ) !== 'gravityflow' ) { continue; }
            $atts = shortcode_parse_atts( $hit[3] ?? '' );
            if ( ! is_array( $atts ) || ( $atts['page'] ?? null ) !== 'inbox' ) { continue; }
            if ( ! isset( $atts['form'] ) ||
                 ( self::validId( $atts['form'] ) && (int) $atts['form'] === $form_id ) ) { return true; }
        }
        return false;
    }

    private static function nonceAction( $page_id, $form_id, $native_page_id ) {
        return 'gpp_inbox2_read|' . $page_id . '|' . $form_id . '|' . $native_page_id;
    }

    public static function noCachePage() {
        $post = get_queried_object();
        if ( ! $post instanceof \WP_Post || ! has_shortcode( $post->post_content, self::TAG ) ) { return; }
        if ( ! defined( 'DONOTCACHEPAGE' ) ) { define( 'DONOTCACHEPAGE', true ); }
        nocache_headers();
        header( 'Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0' );
        header( 'Vary: Cookie', false );
    }

    public static function enqueueOnPage() {
        $post = get_queried_object();
        if ( ! $post instanceof \WP_Post || ! has_shortcode( $post->post_content, self::TAG ) ) { return; }
        $base = dirname( GPP_PLUGIN_FILE );
        $css = 'assets/css/gpp-inbox2.css';
        $js = 'assets/js/gpp-inbox2.js';
        wp_enqueue_style( 'gpp-inbox2', plugins_url( $css, GPP_PLUGIN_FILE ), array(),
            substr( hash_file( 'sha256', $base . '/' . $css ), 0, 12 ) );
        wp_enqueue_script( 'gpp-inbox2', plugins_url( $js, GPP_PLUGIN_FILE ), array(),
            substr( hash_file( 'sha256', $base . '/' . $js ), 0, 12 ), true );
    }

    public static function render( $attributes = array() ) {
        $atts = shortcode_atts( array( 'form' => '', 'native_page' => '' ), (array) $attributes, self::TAG );
        $page_id = (int) get_queried_object_id();
        if ( ! self::validId( $atts['form'] ) || ! self::validId( $atts['native_page'] ) || $page_id < 1
            || ! self::matchingShortcode( get_post( $page_id ), (int) $atts['form'], (int) $atts['native_page'] )
            || ! is_user_logged_in() || ! self::nativePageAdmitted( (int) $atts['native_page'], (int) $atts['form'] )
            || ! current_user_can( 'read_post', $page_id ) ) {
            return '<section class="ciq2" dir="rtl" role="alert">فهرست در دسترس نیست.</section>';
        }
        if ( ! class_exists( 'GFAPI' ) || ! is_array( \GFAPI::get_form( (int) $atts['form'] ) ) ) {
            return '<section class="ciq2" dir="rtl" role="alert">فرم معتبر یا قابل دسترس نیست.</section>';
        }
        $rows = self::snapshotRows( array( 'form_id' => (int) $atts['form'],
            'native_page_id' => (int) $atts['native_page'] ) );
        if ( is_wp_error( $rows ) ) {
            return '<section class="ciq2" dir="rtl" role="alert">دریافت فهرست مجاز ممکن نیست. صفحه را دوباره بارگذاری کنید.</section>';
        }
        return self::renderMarkup( $rows, (int) $atts['form'], (int) $atts['native_page'], $page_id );
    }

    public static function ajaxDenied() {
        nocache_headers();
        wp_send_json_error( array( 'reason' => 'authorization_required' ), 403 );
    }

    public static function ajaxRead() {
        nocache_headers();
        $params = array();
        foreach ( array( 'page_id', 'form_id', 'native_page_id' ) as $name ) {
            $value = isset( $_POST[$name] ) && is_scalar( $_POST[$name] ) ? wp_unslash( $_POST[$name] ) : null;
            if ( ! self::validId( $value ) ) { self::ajaxDenied(); }
            $params[$name] = (int) $value;
        }
        $page_id = $params['page_id']; $form_id = $params['form_id'];
        $native_page_id = $params['native_page_id'];
        $nonce = isset( $_POST['nonce'] ) && is_string( $_POST['nonce'] )
            ? sanitize_text_field( wp_unslash( $_POST['nonce'] ) ) : '';
        if ( ! is_user_logged_in()
            || ! wp_verify_nonce( $nonce, self::nonceAction( $page_id, $form_id, $native_page_id ) )
            || ! self::matchingShortcode( get_post( $page_id ), $form_id, $native_page_id )
            || ! current_user_can( 'read_post', $page_id )
            || ! self::nativePageAdmitted( $native_page_id, $form_id )
            || ! class_exists( 'GFAPI' ) || ! is_array( \GFAPI::get_form( $form_id ) ) ) {
            self::ajaxDenied();
        }
        $rows = self::snapshotRows( array( 'form_id' => $form_id, 'native_page_id' => $native_page_id ) );
        if ( is_wp_error( $rows ) ) {
            wp_send_json_error( array( 'reason' => 'incomplete_authorized_snapshot' ), 503 );
        }
        wp_send_json_success( array( 'count' => count( $rows ),
            'html' => self::renderMarkup( $rows, $form_id, $native_page_id, $page_id ) ) );
    }

    /** Explicitly qualified private host version. */
    private static function hostVersionQualified( $version ) {
        return is_string( $version ) && '3.1.0' === $version;
    }

    /** The public authenticated Inbox list, never the Detail permission predicate. */
    private static function projectNative( $entries, $form_id ) {
        if ( is_wp_error( $entries ) ) { return $entries; }
        $result = array();
        foreach ( $entries as $entry ) {
            if ( ! is_array( $entry ) || ! self::validId( $entry['id'] ?? null )
                || (int) ( $entry['form_id'] ?? 0 ) !== $form_id ) { return new \WP_Error( 'invalid_identity' ); }
            $result[] = array( 'id' => (int) $entry['id'], 'form_id' => $form_id,
                'step_id' => (int) ( $entry['workflow_step'] ?? 0 ), 'fields' => array() );
        }
        return $result;
    }

private static function entries( $scope = array(), $batch_size = 40 ) {
    if ( ! self::hostVersionQualified( defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null ) ) {
        return new \WP_Error( 'ciq2_unsupported_host_version' );
    }
    if ( ! is_user_logged_in() ) { return new \WP_Error( 'authentication_required' ); }
    // Server-owned identity and form scope. Never trust browser filter_key/user_id.
    $scope = array_intersect_key( $scope, array( 'form_id' => true ) );
    $entries = array();
    $expected = null;
    // Explicit operational safety bound, not a hidden 500-task truncation.
    // A larger authorized Inbox fails closed rather than claiming a complete list.
    $max_tasks = 2000;
    $batch_size = (int) $batch_size;
    if ( $batch_size < 1 || $batch_size > $max_tasks + 1 ) {
        return new \WP_Error( 'host_query_failed' );
    }
    for ( $offset = 0; $offset < $max_tasks; $offset += $batch_size ) {
        $args = $scope;
        $args['paging'] = array( 'offset' => $offset, 'page_size' => $batch_size );
        $args = apply_filters( 'gravityflow_inbox_args', array_merge( \Gravity_Flow_Inbox::get_defaults(), $args ) );
        $total = 0;
        $page = \Gravity_Flow_API::get_inbox_entries( $args, $total );
        if ( is_wp_error( $page ) || ! is_array( $page ) || count( $page ) > $batch_size ) {
            return new \WP_Error( 'host_query_failed' );
        }
        if ( null === $expected ) { $expected = (int) $total; }
        if ( $expected > $max_tasks ) { return new \WP_Error( 'task_set_bound_exceeded' ); }
        if ( $expected < 0 || (int) $total !== $expected
            || ( empty( $page ) && $offset < $expected ) ) {
            return new \WP_Error( 'unstable_or_incomplete_task_set' );
        }
        // A host `gravityflow_inbox_paging` filter that shrinks the page would make
        // the next offset skip tasks. Detect it instead of reporting a partial set.
        if ( count( $page ) < min( $batch_size, $expected - $offset ) ) {
            return new \WP_Error( 'host_page_size_reduced' );
        }
        foreach ( $page as $entry ) {
            $id = (int) ( $entry['id'] ?? 0 );
            if ( $id < 1 || isset( $entries[ $id ] ) ) { return new \WP_Error( 'invalid_identity' ); }
            $entries[ $id ] = $entry;
        }
        if ( count( $entries ) === $expected ) { return array_values( $entries ); }
    }
    return new \WP_Error( 'task_set_bound_exceeded' );
}

private static function model() {
    return gravity_flow()->container()->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
}

private static function modelCompatible( $model ) {
    return $model instanceof \Gravity_Flow\Gravity_Flow\Inbox\Models\Task
        && is_callable( array( $model, 'get_inbox_tasks' ) )
        && is_callable( array( $model, 'get_table_header_defs' ) );
}

private static function hostModel() {
    if ( ! defined( 'GRAVITY_FLOW_VERSION' ) || '3.1.0' !== GRAVITY_FLOW_VERSION
        || ! function_exists( 'gravity_flow' )
        || ! class_exists( 'Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider' ) ) {
        return new \WP_Error( 'ciq2_unsupported_host_version' );
    }
    try {
        $model = self::model();
    } catch ( \Throwable $error ) {
        return new \WP_Error( 'ciq2_native_task_service_unavailable' );
    }
    if ( ! self::modelCompatible( $model ) ) {
        return new \WP_Error( 'ciq2_native_task_contract_changed' );
    }
    return $model;
}

private static function args( $scope = array(), $offset = 0, $page_size = 1 ) {
    $page_id = (int) ( $scope['native_page_id'] ?? 0 );
    $base = $page_id > 0 ? get_permalink( $page_id ) : false;
    if ( ! is_string( $base ) || '' === $base ) { return array(); }
    return array(
        'form_id' => (int) ( $scope['form_id'] ?? 0 ),
        'paging' => array( 'offset' => $offset, 'page_size' => $page_size ),
        'is_shortcode' => true,
        'context_key' => '',
        'detail_base_url' => add_query_arg( array( 'page' => 'gravityflow-inbox', 'view' => 'entry' ), $base ),
    );
}

private static function plainText( $value ) {
    // The admitted GPP columns are plain text. Do not guess rich HTML or object
    // semantics. HTML entities are decoded once, exactly as the native span's
    // innerHTML boundary does, and the independent renderer must escape again.
    if ( ! is_string( $value ) && ! is_numeric( $value ) ) { return null; }
    $value = (string) $value;
    if ( preg_match( '/<[a-z\/!][\s\S]*>/i', $value ) ) { return null; }
    return html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
}

private static function rows( $scope ) {
    $batch_size = 2001;
    $entries = self::entries( $scope, $batch_size );
    $metadata = self::projectNative( $entries, (int) $scope['form_id'] );
    if ( is_wp_error( $metadata ) ) { return $metadata; }
    $model = self::hostModel();
    if ( is_wp_error( $model ) ) { return $model; }
    $contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract( $scope );
    try {
        $defs = $model->get_table_header_defs( self::args( $scope ) );
    } catch ( \Throwable $error ) {
        return new \WP_Error( 'ciq2_native_header_contract_changed' );
    }
    if ( ! is_array( $defs ) ) { return new \WP_Error( 'ciq2_native_header_contract_changed' ); }
    $native = array();
    // Query the complete native task set in bounded pages. The per-entry
    // guard can optionally omit an individual denied row from presentation.
    // At least one Task Model read always runs: an empty public membership must
    // be independently confirmed, never accepted as a vacuous set comparison.
    $task_model_pages = max( 1, (int) ceil( count( $entries ) / $batch_size ) );
    for ( $page_index = 0, $offset = 0; $page_index < $task_model_pages; ++$page_index, $offset += $batch_size ) {
        try {
            $page = $model->get_inbox_tasks( self::args( $scope, $offset, $batch_size ) );
        } catch ( \Throwable $error ) {
            return new \WP_Error( 'ciq2_native_task_contract_changed' );
        }
        if ( ! is_array( $page ) || count( $page ) > $batch_size ) {
            return new \WP_Error( 'ciq2_native_task_contract_changed' );
        }
        foreach ( $page as $row ) {
            if ( ! is_array( $row ) || ! isset( $row['id'] )
                || ! is_scalar( $row['id'] ) || ! ctype_digit( (string) $row['id'] ) ) {
                return new \WP_Error( 'native_cell_identity_invalid' );
            }
            $id = (int) $row['id'];
            if ( $id < 1 || isset( $native[ $id ] ) ) { return new \WP_Error( 'native_cell_identity_invalid' ); }
            $native[ $id ] = $row;
        }
    }
    $expected_ids = array();
    foreach ( $entries as $entry ) { $expected_ids[ (int) $entry['id'] ] = true; }
    if ( count( $native ) !== count( $entries ) || array_diff_key( $native, $expected_ids ) ) {
        return new \WP_Error( 'native_cell_task_set_changed' );
    }
    $created = array();
    foreach ( $entries as $entry ) { $created[ (int) $entry['id'] ] = (string) ( $entry['date_created'] ?? '' ); }
    $keys = null === $contract ? array() : array(
        'student_name' => $contract['column_ids'][1],
        'national_id' => $contract['column_ids'][2],
        'school_grade' => $contract['column_ids'][3],
    );
    foreach ( $metadata as &$row ) {
        if ( ! isset( $native[ $row['id'] ] ) ) { return new \WP_Error( 'native_cell_task_set_changed' ); }
        $row['date_created'] = $created[ $row['id'] ] ?? '';
        $row['cells'] = array(); $row['cell_status'] = array();
        $row['native_url'] = $native[ $row['id'] ]['url_entry'] ?? '';
        $row['native_page_id'] = (int) ( $scope['native_page_id'] ?? 0 );
        // Provenance: this task is in BOTH reconciled host sources (public Inbox
        // membership and native Task Model). Admission requires it.
        $row['task_source'] = 'NATIVE_INBOX_MEMBERSHIP';
        $row['binding_state'] = null === $contract ? 'NO_QUALIFIED_FORM_PROJECTION' : 'CURRENT_HOST_QUALIFIED';
        foreach ( $keys as $semantic => $column ) {
            $def = null;
            foreach ( $defs as $candidate ) {
                if ( (string) ( $candidate['field'] ?? '' ) === (string) $column ) { $def = $candidate; break; }
            }
            $display_key = $def['displayKey'] ?? null;
            if ( ! is_string( $display_key ) || ! array_key_exists( $display_key, $native[ $row['id'] ] ) ) {
                $row['cell_status'][ $semantic ] = 'MISSING_NATIVE_DISPLAY_KEY'; continue;
            }
            $text = self::plainText( $native[ $row['id'] ][ $display_key ] );
            if ( null === $text ) { $row['cell_status'][ $semantic ] = 'UNQUALIFIED_NATIVE_VALUE_SHAPE'; continue; }
            $row['cells'][ $semantic ] = array( 'column_id' => (string) $column, 'text' => $text );
            $row['cell_status'][ $semantic ] = 'NATIVE_PLAIN_CELL';
        }
    }
    unset( $row );
    return $metadata;
}

private static function nativeDetailUrlValid( $url, $form_id, $entry_id, $native_page_id ) {
    if ( ! is_string( $url ) || '' === $url || $form_id < 1 || $entry_id < 1 ) { return false; }
    $parts = wp_parse_url( $url );
    if ( ! is_array( $parts ) || ! isset( $parts['scheme'], $parts['host'], $parts['query'] )
        || ! in_array( strtolower( $parts['scheme'] ), array( 'http', 'https' ), true )
        || isset( $parts['user'] ) || isset( $parts['pass'] ) ) { return false; }
    $allowed_origin = false;
    foreach ( array( home_url(), admin_url() ) as $origin_url ) {
        $origin = wp_parse_url( $origin_url );
        if ( ! is_array( $origin ) || ! isset( $origin['scheme'], $origin['host'] ) ) { continue; }
        $url_port = (int) ( $parts['port'] ?? ( 'https' === strtolower( $parts['scheme'] ) ? 443 : 80 ) );
        $origin_port = (int) ( $origin['port'] ?? ( 'https' === strtolower( $origin['scheme'] ) ? 443 : 80 ) );
        if ( strtolower( $parts['scheme'] ) === strtolower( $origin['scheme'] )
            && strtolower( $parts['host'] ) === strtolower( $origin['host'] )
            && $url_port === $origin_port ) { $allowed_origin = true; break; }
    }
    if ( ! $allowed_origin ) { return false; }
    // Exact native Inbox routes only: a matching origin and query tuple alone
    // must not turn an unrelated WordPress page into a trusted Detail target.
    $native_frontend_path = wp_parse_url( get_permalink( $native_page_id ), PHP_URL_PATH );
    $native_admin_path = wp_parse_url( admin_url( 'admin.php' ), PHP_URL_PATH );
    $path = $parts['path'] ?? '/';
    $admin_detail = is_string( $native_admin_path ) && $path === $native_admin_path;
    $frontend_detail = is_string( $native_frontend_path ) && $path === $native_frontend_path;
    if ( ! $frontend_detail ) { return false; }
    parse_str( $parts['query'], $query );
    if ( ! isset( $query['page'] ) || ! is_string( $query['page'] )
        || 'gravityflow-inbox' !== $query['page'] ) { return false; }
    return isset( $query['id'], $query['lid'], $query['view'] )
        && is_scalar( $query['id'] ) && is_scalar( $query['lid'] )
        && ctype_digit( (string) $query['id'] ) && ctype_digit( (string) $query['lid'] )
        && (int) $query['id'] === $form_id && (int) $query['lid'] === $entry_id
        && 'entry' === $query['view'];
}

private static function admittedCard( $row ) {
    if ( ! is_array( $row ) || 'NATIVE_INBOX_MEMBERSHIP' !== ( $row['task_source'] ?? null )
        || 'CURRENT_HOST_QUALIFIED' !== ( $row['binding_state'] ?? null ) ) {
        return new \WP_Error( 'ciq2_unqualified_required_binding' );
    }
    foreach ( array( 'student_name', 'national_id', 'school_grade' ) as $semantic ) {
        if ( ( $row['cell_status'][ $semantic ] ?? null ) !== 'NATIVE_PLAIN_CELL'
            || ! isset( $row['cells'][ $semantic ]['column_id'], $row['cells'][ $semantic ]['text'] )
            || ! is_string( $row['cells'][ $semantic ]['column_id'] )
            || '' === $row['cells'][ $semantic ]['column_id']
            || ! is_string( $row['cells'][ $semantic ]['text'] )
            || in_array( trim( $row['cells'][ $semantic ]['text'] ), array( '', '-', '—' ), true ) ) {
            return new \WP_Error( 'ciq2_unqualified_required_value' );
        }
    }
    // FIFO A is meaningful only for a real, canonical Gravity Forms timestamp.
    $created = $row['date_created'] ?? null;
    $timestamp = is_string( $created ) ? \DateTimeImmutable::createFromFormat(
        '!Y-m-d H:i:s', $created, new \DateTimeZone( 'UTC' )
    ) : false;
    if ( false === $timestamp || $timestamp->format( 'Y-m-d H:i:s' ) !== $created ) {
        return new \WP_Error( 'ciq2_unqualified_creation_timestamp' );
    }
    if ( ! isset( $row['form_id'], $row['id'] ) || ! self::nativeDetailUrlValid(
        $row['native_url'] ?? null, (int) $row['form_id'], (int) $row['id'], (int) ( $row['native_page_id'] ?? 0 )
    ) ) {
        return new \WP_Error( 'ciq2_unqualified_native_detail_url' );
    }
    return true;
}

private static function readOnce( $scope ) {
    // Consume only the authenticated native Inbox list projection. Detail
    // permission is enforced by Gravity Flow when the user opens that link,
    // not when the Native-listed task is rendered as an Inbox 2 card.
    $rows = self::rows( $scope );
    if ( is_wp_error( $rows ) ) { return $rows; }
    foreach ( $rows as $row ) {
        $admission = self::admittedCard( $row );
        if ( is_wp_error( $admission ) ) { return $admission; }
    }
    usort( $rows, static function ( $a, $b ) {
        $date = strcmp( (string) $a['date_created'], (string) $b['date_created'] );
        return 0 !== $date ? $date : ( (int) $a['id'] <=> (int) $b['id'] );
    } );
    return $rows;
}

private static function snapshotRows( $scope ) {
    $retryable = array( 'native_cell_task_set_changed', 'unstable_or_incomplete_task_set',
        'host_page_size_reduced' );
    $result = new \WP_Error( 'ciq2_snapshot_not_attempted' );
    for ( $attempt = 1; $attempt <= 2; ++$attempt ) {
        $result = self::readOnce( $scope );
        if ( ! is_wp_error( $result ) || ! in_array( $result->get_error_code(), $retryable, true ) ) {
            return $result;
        }
    }
    return $result;
}
    private static function renderMarkup( $rows, $form_id, $native_page_id, $page_id ) {
        $identity = 'gpp-inbox2-' . $page_id . '-' . $form_id;
    $url = get_permalink( $page_id );
    ob_start();
    ?>
    
    <section class="ciq2" dir="rtl" aria-labelledby="<?php echo esc_attr( $identity . '-heading' ); ?>" data-ciq2-root data-ciq2-state="current" data-ciq2-ajax="<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>" data-ciq2-nonce="<?php echo esc_attr( wp_create_nonce( self::nonceAction( $page_id, $form_id, $native_page_id ) ) ); ?>" data-ciq2-page="<?php echo esc_attr( $page_id ); ?>" data-ciq2-form="<?php echo esc_attr( $form_id ); ?>" data-ciq2-native-page="<?php echo esc_attr( $native_page_id ); ?>">
      <h2 id="<?php echo esc_attr( $identity . '-heading' ); ?>">وظایف من</h2>
      <p class="ciq2-muted">فهرست فقط‌خواندنی؛ اقدامات پرونده در Gravity Flow انجام می‌شوند.</p>
      <div class="ciq2-tools">
        <label for="<?php echo esc_attr( $identity . '-search' ); ?>">جست‌وجوی پرونده</label>
        <input id="<?php echo esc_attr( $identity . '-search' ); ?>" data-ciq2-search type="search" placeholder="نام یا کد ملی" autocomplete="off" aria-describedby="<?php echo esc_attr( $identity . '-status' ); ?>"/>
        <form action="<?php echo esc_url( $url ); ?>" method="get"><button type="submit" data-ciq2-refresh>به‌روزرسانی</button></form>
      </div>
      <p class="ciq2-muted" id="<?php echo esc_attr( $identity . '-status' ); ?>" aria-live="polite" data-ciq2-status>
        <?php echo esc_html( sprintf( '%d پرونده', count( $rows ) ) ); ?>
      </p>
      <nav class="ciq2-pages" aria-label="صفحه‌بندی وظایف" data-ciq2-pager>
        <button type="button" data-ciq2-prev disabled>صفحه قبل</button>
        <span data-ciq2-page aria-live="polite">صفحه ۱ از ۱</span>
        <button type="button" data-ciq2-next disabled>صفحه بعد</button>
      </nav>
        <ul data-ciq2-list>
          <?php foreach ( $rows as $row ) :
            $name = $row['cells']['student_name']['text'] ?? '';
            $nid = $row['cells']['national_id']['text'] ?? '';
            $school_grade = $row['cells']['school_grade']['text'] ?? '';
            ?>
            <li data-ciq2-entry="<?php echo esc_attr( $row['id'] ); ?>">
              <h3 data-ciq2-name><?php echo esc_html( '' !== $name ? $name : 'نام ثبت نشده' ); ?></h3>
              <dl>
                <dt>کد ملی</dt><dd data-ciq2-national-id><?php echo esc_html( '' !== $nid ? $nid : '—' ); ?></dd>
                <dt>مدرسه / پایه</dt><dd data-ciq2-school-grade><?php echo esc_html( '' !== $school_grade ? $school_grade : '—' ); ?></dd>
                <dt>شماره پرونده</dt><dd><?php echo esc_html( $row['id'] ); ?></dd>
                <dt>تاریخ ثبت</dt><dd><?php echo esc_html( $row['date_created'] ?? '' ); ?></dd>
              </dl>
              <a class="ciq2-detail" data-ciq2-detail href="<?php echo esc_url( $row['native_url'] ); ?>">مشاهده پرونده</a>
            </li>
          <?php endforeach; ?>
        </ul>
        <p class="ciq2-empty" data-ciq2-empty hidden>پرونده‌ای برای بررسی وجود ندارد.</p>
        <p class="ciq2-empty" data-ciq2-no-results hidden>موردی مطابق جست‌وجو پیدا نشد.</p>
    </section>
    
    <?php
    return ob_get_clean();
    }
}
