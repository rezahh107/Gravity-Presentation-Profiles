<?php
/**
 * Disposable read-only Inbox 2 usability prototype.
 * Never load on a production site; consumes only the lab's qualified host cells.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once WP_PLUGIN_DIR . '/gravity-presentation-profiles/tests/qualification-custom-inbox/cell-boundary.php';

add_action( 'template_redirect', static function () {
    if ( ! is_page( (int) get_option( 'ciq2_page_id' ) ) ) { return; }
    if ( ! defined( 'DONOTCACHEPAGE' ) ) { define( 'DONOTCACHEPAGE', true ); }
    nocache_headers();
    header( 'Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0' );
    header( 'Vary: Cookie', false );
    if ( ! is_user_logged_in() ) { status_header( 403 ); }
} );


/**
 * Reconcile two independently refreshed public+native host reads. Offset paging
 * is not a snapshot; never present a mixed or unstable scan as complete.
 * This is a bounded lab-only best-effort consistency check, not an atomic
 * transaction or a guarantee about mutations immediately after the response.
 */
function ciq2_snapshot_rows( $scope ) {
    $read = static function () use ( $scope ) {
        $rows = cellq_rows( $scope, true );
        if ( is_wp_error( $rows ) ) { return $rows; }
        foreach ( $rows as $row ) {
            if ( empty( $row['id'] ) || empty( $row['native_url'] ) ) {
                return new WP_Error( 'ciq2_invalid_task_identity' );
            }
        }
        usort( $rows, static function ( $a, $b ) {
            $date = strcmp( (string) $a['date_created'], (string) $b['date_created'] );
            return 0 !== $date ? $date : ( (int) $a['id'] <=> (int) $b['id'] );
        } );
        return $rows;
    };
    $first = $read();
    if ( is_wp_error( $first ) ) { return $first; }
    $second = $read();
    if ( is_wp_error( $second ) ) { return $second; }
    $first_json = wp_json_encode( $first );
    $second_json = wp_json_encode( $second );
    if ( ! is_string( $first_json ) || ! is_string( $second_json ) || $first_json !== $second_json ) {
        return new WP_Error( 'ciq2_concurrent_task_set_change' );
    }
    return $second;
}

/** Test-only read route: fresh native authorization on every request. */
add_action( 'wp_ajax_ciq2_read', static function () {
    nocache_headers();
    $nonce = sanitize_text_field( wp_unslash( $_POST['nonce'] ?? '' ) );
    if ( ! is_user_logged_in() || ! wp_verify_nonce( $nonce, 'ciq2_read' )
        || ! get_option( 'ciq_gate_b_passed' ) || ! get_option( 'cellq_gate_b_passed' ) ) {
        wp_send_json_error( array( 'reason' => 'authorization_required' ), 403 );
    }
    // No caller-controlled form, assignee, user_id, or native scope argument.
    $fixture = get_option( 'cellq_fixture', array() );
    $form_id = (int) ( $fixture['form_id'] ?? 0 );
    if ( $form_id < 1 ) {
        wp_send_json_error( array( 'reason' => 'fixture_unavailable' ), 503 );
    }
    $rows = ciq2_snapshot_rows( array( 'form_id' => $form_id ) );
    if ( is_wp_error( $rows ) ) {
        wp_send_json_error( array( 'reason' => 'incomplete_authorized_snapshot' ), 503 );
    }
    // Reuse the same server-escaped card renderer, not a second cell/permission path.
    $GLOBALS['ciq2_ajax_rows'] = $rows;
    $html = do_shortcode( '[ciq2_usability_inbox]' );
    unset( $GLOBALS['ciq2_ajax_rows'] );
    wp_send_json_success( array( 'html' => $html, 'count' => count( $rows ) ) );
} );
add_action( 'wp_ajax_nopriv_ciq2_read', static function () {
    nocache_headers();
    wp_send_json_error( array( 'reason' => 'authorization_required' ), 403 );
} );

add_shortcode( 'ciq2_usability_inbox', static function () {
    if ( ! is_user_logged_in() || ! get_option( 'ciq_gate_b_passed' ) || ! get_option( 'cellq_gate_b_passed' ) ) {
        return '<p dir="rtl">اینباکس آزمایشی در دسترس نیست.</p>';
    }
    $fixture = get_option( 'cellq_fixture', array() );
    $form_id = (int) ( $fixture['form_id'] ?? 0 );
    if ( $form_id < 1 ) { return '<p dir="rtl">پیکربندی آزمایشی موجود نیست.</p>'; }
    // Explicit form is server-owned, not a request parameter.
    $rows = $GLOBALS['ciq2_ajax_rows'] ?? ciq2_snapshot_rows( array( 'form_id' => $form_id ) );
    if ( is_wp_error( $rows ) ) {
        return '<section class="ciq2" dir="rtl" role="alert">دریافت پرونده‌ها ممکن نیست. صفحه را دوباره بارگذاری کنید.</section>';
    }
    foreach ( $rows as $row ) {
        if ( empty( $row['native_url'] ) || empty( $row['id'] ) ) {
            return '<section class="ciq2" dir="rtl" role="alert">لینک پرونده معتبر نیست. صفحه را دوباره بارگذاری کنید.</section>';
        }
    }
    $url = get_permalink( (int) get_option( 'ciq2_page_id' ) );
    ob_start();
    ?>
    <style>
      .ciq2,.ciq2 *{box-sizing:border-box}
      .ciq2{direction:rtl;width:100%;max-width:64rem;margin:1rem auto;padding:clamp(.75rem,2vw,1.5rem);font-family:inherit;color:#183047;background:#f4f7fa;border:1px solid #ced9e3;border-radius:16px;overflow-wrap:anywhere}
      .ciq2 h2{font-size:clamp(1.25rem,3vw,1.6rem);margin:0}
      .ciq2 .ciq2-muted{color:#526777;margin:.3rem 0;font-size:.92rem}
      .ciq2 .ciq2-tools{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;margin:1rem 0}
      .ciq2 label{font-weight:600}
      .ciq2 input[type=search]{font:inherit;flex:1 1 13rem;min-width:0;min-height:44px;padding:.6rem .8rem;border:1px solid #8197a9;border-radius:8px;background:#fff;color:#183047}
      .ciq2 button{font:inherit;min-height:44px;padding:.55rem 1rem;border:1px solid #27527a;border-radius:8px;background:#fff;color:#163d64;cursor:pointer}
      .ciq2 ul{list-style:none;padding:0;margin:.75rem 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:.8rem}
      .ciq2 li{min-width:0;background:#fff;border:1px solid #cbd7e0;border-radius:12px;padding:1rem}
      .ciq2 h3{font-size:1.1rem;margin:0 0 .65rem;line-height:1.6;overflow-wrap:anywhere}
      .ciq2 dl{display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:.7rem;row-gap:.45rem;margin:0}
      .ciq2 dt{font-weight:600;color:#526777}.ciq2 dd{min-width:0;margin:0;overflow-wrap:anywhere}
      .ciq2 .ciq2-detail{display:inline-flex;align-items:center;justify-content:center;margin-top:1rem;min-height:44px;padding:.55rem .85rem;border-radius:8px;background:#175884;color:#fff;text-decoration:none}
      .ciq2 :is(button,input,a):focus-visible{outline:3px solid #9c4b00;outline-offset:3px}
      .ciq2 [hidden]{display:none!important}
      .ciq2 .ciq2-empty{padding:1.25rem;background:#fff;border-radius:10px;margin:.8rem 0}
      .ciq2 .ciq2-pages{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;justify-content:center;margin:1rem 0}
      .ciq2 button:disabled{cursor:not-allowed;opacity:.45}
      @media(max-width:480px){.ciq2 ul{grid-template-columns:minmax(0,1fr)}.ciq2 .ciq2-tools{align-items:stretch}.ciq2 .ciq2-tools label{width:100%}}
    </style>
    <section class="ciq2" dir="rtl" aria-labelledby="ciq2-heading" data-ciq2-root data-ciq2-state="current" data-ciq2-ajax="<?php echo esc_url( admin_url( 'admin-ajax.php' ) ); ?>" data-ciq2-nonce="<?php echo esc_attr( wp_create_nonce( 'ciq2_read' ) ); ?>">
      <h2 id="ciq2-heading">وظایف من</h2>
      <p class="ciq2-muted">نمونهٔ آزمایشی فقط‌خواندنی؛ تصمیم‌های پرونده در Gravity Flow ثبت می‌شوند.</p>
      <div class="ciq2-tools">
        <label for="ciq2-search">جست‌وجوی پرونده</label>
        <input id="ciq2-search" type="search" placeholder="نام یا کد ملی" autocomplete="off" aria-describedby="ciq2-status"/>
        <form action="<?php echo esc_url( $url ); ?>" method="get"><button type="submit" data-ciq2-refresh>به‌روزرسانی</button></form>
      </div>
      <p class="ciq2-muted" id="ciq2-status" aria-live="polite" data-ciq2-status>
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
    <script>
    (() => {
      const root = document.querySelector('[data-ciq2-root]');
      if (!root) return;
      const list = root.querySelector('[data-ciq2-list]');
      const input = root.querySelector('#ciq2-search');
      const status = root.querySelector('[data-ciq2-status]');
      const empty = root.querySelector('[data-ciq2-empty]');
      const noResults = root.querySelector('[data-ciq2-no-results]');
      const previous = root.querySelector('[data-ciq2-prev]');
      const next = root.querySelector('[data-ciq2-next]');
      const pageLabel = root.querySelector('[data-ciq2-page]');
      const pager = root.querySelector('[data-ciq2-pager]');
      const pageSize = 20;
      const requestDeadlineMs = 30000; // Bounded synthetic host read; not an atomic snapshot.
      let page = 1, generation = 0, busy = false, controller = null;
      const normalize = s => String(s).replace(/[۰-۹٠-٩]/g, d => {
        const cp = d.charCodeAt(0);
        return String(cp >= 0x6f0 && cp <= 0x6f9 ? cp - 0x6f0 : cp - 0x660);
      }).trim().toLocaleLowerCase('fa-IR');
      function draw() {
        const nodes = [...list.querySelectorAll('[data-ciq2-entry]')];
        const query = normalize(input.value);
        const filtered = nodes.filter(node => !query || normalize(
          node.querySelector('[data-ciq2-name]').textContent + ' ' +
          node.querySelector('[data-ciq2-national-id]').textContent
        ).includes(query));
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
        page = Math.max(1, Math.min(page, pages));
        const visible = new Set(filtered.slice((page - 1) * pageSize, page * pageSize));
        nodes.forEach(node => { node.hidden = !visible.has(node); });
        empty.hidden = nodes.length !== 0;
        noResults.hidden = nodes.length === 0 || filtered.length !== 0;
        pager.hidden = filtered.length <= pageSize;
        previous.disabled = page <= 1;
        next.disabled = page >= pages;
        pageLabel.textContent = 'صفحه ' + page + ' از ' + pages;
        status.textContent = filtered.length + ' پرونده' +
          (query ? ' مطابق جست‌وجو' : '') + ' (از ' + nodes.length + ')';
        root.dataset.ciq2State = 'current';
      }
      function stale(code) {
        list.replaceChildren();
        root.dataset.ciq2State = 'stale';
        empty.hidden = true; noResults.hidden = true; pager.hidden = true;
        status.textContent = code === 403
          ? 'نشست یا مجوز دسترسی تغییر کرده است؛ اطلاعات قدیمی پاک شد. دوباره وارد شوید.'
          : 'فهرست قابل تأیید نیست؛ اطلاعات قدیمی پاک شد. برای تلاش دوباره، به‌روزرسانی را بزنید.';
      }
      async function refresh(force = false) {
        if (busy && !force) return; // Automatic polling never overlaps.
        if (controller) controller.abort(); // Manual retry invalidates an older request.
        const serial = ++generation;
        controller = new AbortController();
        busy = true;
        root.dataset.ciq2State = 'syncing';
        status.textContent = 'در حال بررسی مجدد فهرست؛ داده‌های قبلی هنوز تأیید مجدد نشده‌اند.';
        const watchdog = setTimeout(() => {
          if (serial !== generation) return;
          // A fetch that never settles must not block every later polling cycle.
          ++generation;
          const pending = controller;
          controller = null;
          busy = false;
          pending.abort();
          stale(503);
        }, requestDeadlineMs);
        try {
          const response = await fetch(root.dataset.ciq2Ajax, {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
            body: new URLSearchParams({action: 'ciq2_read', nonce: root.dataset.ciq2Nonce}),
            signal: controller.signal
          });
          if (serial !== generation) return;
          if (!response.ok) { const error = new Error('refresh_failed'); error.status = response.status; throw error; }
          const data = await response.json();
          if (!data.success || !data.data || !Number.isSafeInteger(data.data.count)) throw new Error('incomplete_response');
          const result = new DOMParser().parseFromString(data.data.html, 'text/html');
          const authoritativeList = result.querySelector('[data-ciq2-list]');
          if (!authoritativeList) throw new Error('missing_list');
          const incoming = [...authoritativeList.querySelectorAll('[data-ciq2-entry]')];
          const ids = incoming.map(node => Number(node.dataset.ciq2Entry));
          if (ids.length !== data.data.count || ids.some(id => !Number.isSafeInteger(id) || id < 1) ||
              new Set(ids).size !== ids.length) throw new Error('incomplete_or_duplicate_identity');
          if (serial !== generation) return;
          list.replaceChildren(...incoming.map(node => document.importNode(node, true)));
          draw(); // Preserve search and clamp invalidated page to the last valid page.
        } catch (error) {
          if (serial !== generation || error.name === 'AbortError') return;
          stale(error.status || 503);
        } finally {
          clearTimeout(watchdog);
          if (serial === generation) { busy = false; controller = null; }
        }
      }
      input.addEventListener('input', () => { page = 1; if (root.dataset.ciq2State === 'current') draw(); });
      previous.addEventListener('click', () => { if (page > 1) { page--; draw(); } });
      next.addEventListener('click', () => { page++; draw(); });
      root.querySelector('form').addEventListener('submit', event => { event.preventDefault(); refresh(true); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });
      draw();
      setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    })();
    </script>
    <?php
    return ob_get_clean();
} );
