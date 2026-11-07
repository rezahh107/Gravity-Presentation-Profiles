<?php
/** Disposable MU-plugin. Install ONLY into the isolated WU21 host after Gate B. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once WP_PLUGIN_DIR . '/gravity-presentation-profiles/tests/qualification-custom-inbox/boundary.php';

add_action( 'template_redirect', static function () {
    if ( ! is_page( (int) get_option( 'ciq_page_id' ) ) || ! get_option( 'ciq_gate_b_passed' ) ) { return; }
    if ( ! defined( 'DONOTCACHEPAGE' ) ) { define( 'DONOTCACHEPAGE', true ); }
    nocache_headers();
    header( 'Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0' );
    header( 'Vary: Cookie', false );
    if ( ! is_user_logged_in() ) { status_header( 403 ); }
} );

add_shortcode( 'ciq_readonly_inbox', static function () {
    if ( ! get_option( 'ciq_gate_b_passed' ) || ! is_user_logged_in() ) {
        return '<p dir="rtl">برای مشاهدهٔ وظایف باید وارد حساب شوید.</p>';
    }
    $entries = ciq_entries();
    $rows = ciq_project( $entries );
    if ( is_wp_error( $rows ) ) { return '<p dir="rtl">فهرست وظایف در دسترس نیست.</p>'; }
    // Native Task Model supplies actual URLs. No URL or identity comes from GET.
    $model = gravity_flow()->container()->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
    $links = array();
    for ( $offset = 0; $offset < count( $rows ); ++$offset ) {
        $native = $model->get_inbox_tasks( array(
            'paging' => array( 'offset' => $offset, 'page_size' => 1 ),
            'detail_base_url' => add_query_arg( array( 'page' => 'gravityflow-inbox', 'view' => 'entry' ), get_option( 'ciq_native_url' ) ),
        ) );
        foreach ( $native as $task ) { $links[ (int) $task['id'] ] = $task['url_entry']; }
    }
    if ( count( $links ) !== count( $rows ) ) { return '<p dir="rtl">فهرست وظایف تغییر کرده است؛ صفحه را تازه کنید.</p>'; }
    foreach ( $rows as $row ) {
        if ( empty( $links[ $row['id'] ] ) ) { return '<p dir="rtl">فهرست وظایف تغییر کرده است؛ صفحه را تازه کنید.</p>'; }
    }
    $dates = array();
    foreach ( $entries as $entry ) { $dates[ (int) $entry['id'] ] = $entry['date_created'] ?? ''; }
    ob_start();
    ?>
    <style>
    .ciq-inbox{direction:rtl;max-width:56rem;margin:1.5rem auto;padding:clamp(.75rem,3vw,1.5rem);color:#182b40;background:#f4f7fb;border:1px solid #ccd7e2;border-radius:12px;overflow-wrap:anywhere;box-sizing:border-box}
    .ciq-inbox *{box-sizing:border-box}.ciq-inbox h2{margin:0 0 .6rem;font-size:1.4rem}.ciq-inbox ul{list-style:none;margin:0;padding:0;display:grid;gap:.75rem}
    .ciq-inbox li{padding:1rem;background:white;border:1px solid #ccd7e2;border-radius:8px}.ciq-inbox p{margin:.4rem 0;line-height:1.8}
    .ciq-inbox a{display:inline-block;padding:.4rem .6rem;color:#124d83;text-decoration:underline;min-height:44px}.ciq-inbox a:focus-visible{outline:3px solid #873d00;outline-offset:3px;background:#fff0d0}.ciq-inbox time{direction:ltr;display:inline-block;font-size:.85rem}
    </style>
    <section class="ciq-inbox" dir="rtl" aria-labelledby="ciq-heading">
    <h2 id="ciq-heading">وظایف من — نمونهٔ آزمایشی</h2>
    <p>مشاهدهٔ فقط‌خواندنی؛ بررسی پرونده در صفحهٔ اصلی گردش‌کار انجام می‌شود.</p>
    <?php if ( empty( $rows ) ) : ?><p class="ciq-empty">وظیفه‌ای برای شما وجود ندارد.</p><?php else : ?><ul>
    <?php foreach ( $rows as $row ) : ?>
        <li data-ciq-entry="<?php echo esc_attr( $row['id'] ); ?>" data-ciq-form="<?php echo esc_attr( $row['form_id'] ); ?>" data-ciq-step="<?php echo esc_attr( $row['step_id'] ); ?>">
        <?php foreach ( $row['fields'] as $id => $value ) : ?><p data-ciq-field="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $value ); ?></p><?php endforeach; ?>
        <?php if ( '' !== $dates[ $row['id'] ] ) : ?><p>زمان ثبت (UTC): <time><?php echo esc_html( $dates[ $row['id'] ] ); ?></time></p><?php endif; ?>
        <a href="<?php echo esc_url( $links[ $row['id'] ] ); ?>">مشاهدهٔ پروندهٔ <?php echo esc_html( $row['id'] ); ?></a>
        </li>
    <?php endforeach; ?></ul><?php endif; ?>
    </section>
    <?php
    return ob_get_clean();
} );
