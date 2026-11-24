<?php
/** Disposable observation only: read the actual WP principal, never override authentication or authorization. */
if (!defined('ABSPATH') || getenv('SCQ_DISPOSABLE') !== '1') { return; }
add_action('init', static function () {
    $manifest=get_option('gpp_scq_fixture_manifest');
    if (!is_array($manifest)) return;
    $path=wp_parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    $page_path=wp_parse_url($manifest['url'], PHP_URL_PATH);
    $ajax=('/wp-admin/admin-ajax.php'===$path && ($_POST['action'] ?? '')==='gpp_inbox2_read');
    $page=($path===$page_path);
    if (!$ajax && !$page) return;
    $uid=get_current_user_id();
    $principal=$uid===0?'anonymous':($uid===(int)$manifest['users']['a']?'a':($uid===(int)$manifest['users']['b']?'b':'other'));
    if (!headers_sent()) {
        header('X-GPP-SCQ-Principal: '.$principal);
        header('X-GPP-SCQ-Request: '.wp_generate_uuid4());
    }
}, PHP_INT_MAX);
