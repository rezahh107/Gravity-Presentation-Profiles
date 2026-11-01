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

add_shortcode( 'ciq2_usability_inbox', static function () {
    if ( ! is_user_logged_in() || ! get_option( 'ciq_gate_b_passed' ) || ! get_option( 'cellq_gate_b_passed' ) ) {
        return '<p dir="rtl">اینباکس آزمایشی در دسترس نیست.</p>';
    }
    $fixture = get_option( 'cellq_fixture', array() );
    $form_id = (int) ( $fixture['form_id'] ?? 0 );
    if ( $form_id < 1 ) { return '<p dir="rtl">پیکربندی آزمایشی موجود نیست.</p>'; }
    // Explicit form is server-owned, not a request parameter.
    $rows = cellq_rows( array( 'form_id' => $form_id ), true );
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
      @media(max-width:480px){.ciq2 ul{grid-template-columns:minmax(0,1fr)}.ciq2 .ciq2-tools{align-items:stretch}.ciq2 .ciq2-tools label{width:100%}}
    </style>
    <section class="ciq2" dir="rtl" aria-labelledby="ciq2-heading" data-ciq2-root>
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
      <?php if ( empty( $rows ) ) : ?>
        <p class="ciq2-empty" data-ciq2-empty>پرونده‌ای برای بررسی وجود ندارد.</p>
      <?php else : ?>
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
        <p class="ciq2-empty" data-ciq2-no-results hidden>موردی مطابق جست‌وجو پیدا نشد.</p>
      <?php endif; ?>
    </section>
    <script>
    (() => {
      const root = document.querySelector('[data-ciq2-root]');
      if (!root) return;
      const input = root.querySelector('#ciq2-search'), rows = [...root.querySelectorAll('[data-ciq2-entry]')];
      const status = root.querySelector('[data-ciq2-status]'), empty = root.querySelector('[data-ciq2-no-results]');
      const normalize = s => String(s).replace(/[۰-۹٠-٩]/g, d => {
        const cp = d.charCodeAt(0); return String(cp >= 0x6f0 && cp <= 0x6f9 ? cp - 0x6f0 : cp - 0x660);
      }).trim().toLocaleLowerCase('fa-IR');
      input.addEventListener('input', () => {
        const query = normalize(input.value); let visible = 0;
        rows.forEach(row => {
          const found = !query || normalize(row.textContent).includes(query);
          row.hidden = !found; if (found) visible++;
        });
        status.textContent = visible + ' پرونده';
        if (empty) empty.hidden = visible !== 0;
      });
    })();
    </script>
    <?php
    return ob_get_clean();
} );
