<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;

final class VerifiedFormProfileEditor {
    const PAGE = 'gpp_verified_form_editor';
    const ACTION = 'gpp_download_verified_form_successor';

    public static function registerMenu() {
        add_submenu_page(
            'gf_edit_forms',
            self::word( 'Edit verified form colors', 'ویرایش رنگ‌های تأییدشدهٔ فرم' ),
            self::word( 'GPP Form Colors', 'رنگ‌های فرم GPP' ),
            'gravityforms_edit_settings',
            self::PAGE,
            array( __CLASS__, 'render' )
        );
    }

    public static function sourceUrl( $reference ) {
        return admin_url( 'admin.php?page=' . self::PAGE . '&source=' . rawurlencode( $reference ) );
    }

    private static function word( $english, $persian ) {
        $locale = function_exists( 'determine_locale' ) ? determine_locale() : get_locale();
        return 0 === strpos( (string) $locale, 'fa_' ) ? $persian : $english;
    }

    private static function authorized() {
        return class_exists( 'GFCommon' ) && \GFCommon::current_user_can_any( 'gravityforms_edit_settings' );
    }

    private static function resolution( $reference, $workflow ) {
        if ( ! is_string( $reference ) ) {
            throw new \InvalidArgumentException( 'Choose an exact installed profile.' );
        }
        $parts = explode( '|', $reference );
        if ( 3 !== count( $parts ) || in_array( '', $parts, true ) ) {
            throw new \InvalidArgumentException( 'Invalid installed profile reference.' );
        }
        return $workflow->resolveInstalledVisualProfile(
            DeclarativePresentationResolver::SURFACE,
            $parts[0], $parts[1], $parts[2]
        );
    }

    public static function render() {
        if ( ! self::authorized() ) {
            wp_die( esc_html( self::word( 'Access denied.', 'دسترسی مجاز نیست.' ) ), '', array( 'response' => 403 ) );
        }

        echo '<div class="wrap"><h1>' . esc_html( self::word( 'Verified Gravity Forms colors', 'رنگ‌های تأییدشدهٔ Gravity Forms' ) ) . '</h1>';
        echo '<p>' . esc_html( self::word(
            'Edit only colors proven on native Gravity Forms 3.1.1.1 controls in the WU21 test environment. Add-ons, other themes and production sites are not verified. No installed profile or form changes on this page.',
            'فقط رنگ‌هایی را تغییر دهید که روی کنترل‌های بومی Gravity Forms 3.1.1.1 در محیط آزمایش WU21 بررسی شده‌اند. افزونه‌های جانبی، قالب‌های دیگر و سایت اصلی هنوز تأیید نشده‌اند. این صفحه هیچ پروفایل نصب‌شده یا فرمی را تغییر نمی‌دهد.'
        ) ) . '</p>';

        $source = isset( $_GET['source'] ) && is_string( $_GET['source'] )
            ? wp_unslash( $_GET['source'] ) : '';
        if ( '' === $source ) {
            echo '<p>' . esc_html( self::word(
                'Open GPP plugin settings and choose Edit verified colors next to an installed Gravity Forms profile.',
                'در تنظیمات افزونهٔ GPP کنار یک پروفایل نصب‌شدهٔ Gravity Forms، «ویرایش رنگ‌های تأییدشده» را انتخاب کنید.'
            ) ) . '</p></div>';
            return;
        }

        try {
            $resolution = self::resolution( $source, SettingsLifecycleWorkflow::forWordPress() );
            $colors = VerifiedColorSuccessor::colors( $resolution );
        } catch ( \InvalidArgumentException $exception ) {
            echo '<div class="notice notice-error"><p>' . esc_html( $exception->getMessage() ) . '</p></div></div>';
            return;
        } catch ( LifecycleException $exception ) {
            echo '<div class="notice notice-error"><p>' . esc_html( $exception->getMessage() ) . '</p></div></div>';
            return;
        }

        $old = $resolution['package_version'];
        $segments = array_map( 'intval', explode( '.', $old ) );
        $next = $segments[0] . '.' . $segments[1] . '.' . ( $segments[2] + 1 );
        $labels = array(
            'surface_background' => self::word( 'Form panel background', 'پس‌زمینهٔ کادر فرم' ),
            'control_border' => self::word( 'Standard input border (normal state)', 'حاشیهٔ ورودی‌های استاندارد (حالت عادی)' ),
            'submit_background' => self::word( 'Primary submit button background', 'پس‌زمینهٔ دکمهٔ اصلی ثبت' ),
        );

        echo '<h2><code>' . esc_html( $resolution['package_id'] . ' @ ' . $old . ' — ' . $resolution['profile_id'] ) . '</code></h2>';
        echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION ) . '">';
        wp_nonce_field( self::ACTION );
        echo '<input type="hidden" name="source" value="' . esc_attr( $source ) . '">';
        echo '<input type="hidden" name="source_hash" value="' . esc_attr( $resolution['content_hash'] ) . '">';
        echo '<table class="form-table" role="presentation"><tbody>';
        echo '<tr><th scope="row"><label for="gpp_successor_version">' . esc_html( self::word( 'New package version', 'نسخهٔ جدید بسته' ) ) . '</label></th>';
        echo '<td><input id="gpp_successor_version" name="new_version" class="regular-text" required pattern="[0-9]+\\.[0-9]+\\.[0-9]+" value="' . esc_attr( $next ) . '">';
        echo '<p class="description">' . esc_html( self::word( 'Must be newer and not already installed. Source version stays untouched.', 'باید جدیدتر باشد و قبلاً نصب نشده باشد. نسخهٔ اصلی بدون تغییر می‌ماند.' ) ) . '</p></td></tr>';
        foreach ( $labels as $key => $label ) {
            $existing = $colors[ $key ];
            $initial = null !== $existing ? $existing : '#FFFFFF';
            echo '<tr><th scope="row">' . esc_html( $label ) . '</th><td>';
            echo '<label><input type="checkbox" name="change[' . esc_attr( $key ) . ']" value="1"> ';
            echo esc_html( self::word( 'Change this color', 'تغییر این رنگ' ) ) . '</label> ';
            echo '<input type="color" name="color[' . esc_attr( $key ) . ']" value="' . esc_attr( $initial ) . '">';
            echo '<p class="description">' . esc_html(
                null === $existing
                    ? self::word( 'Not set in source; native styling applies.', 'در نسخهٔ اصلی تعریف نشده است؛ ظاهر بومی اعمال می‌شود.' )
                    : self::word( 'Current value: ', 'مقدار فعلی: ' ) . $existing
            ) . '</p></td></tr>';
        }
        echo '</tbody></table>';
        submit_button( self::word( 'Download inactive successor JSON', 'دریافت JSON نسخهٔ جانشین غیرفعال' ) );
        echo '</form>';
        echo '<p>' . esc_html( self::word(
            'Next: import the downloaded JSON in GPP plugin settings. Then explicitly enable GPP and select that exact new profile in the desired form settings. Revert by selecting the old profile or turning form presentation off.',
            'سپس JSON دانلودشده را در تنظیمات افزونهٔ GPP وارد کنید؛ در تنظیمات فرم موردنظر، نمایش GPP را فعال و همان نسخهٔ جدید را صریحاً انتخاب کنید. برای بازگشت، پروفایل قبلی را انتخاب یا نمایش GPP را خاموش کنید.'
        ) ) . '</p>';
        echo '<p>' . esc_html( self::word(
            'Not offered: labels, help text, focus/error/disabled states, complex fields, third-party pickers/uploads or responsive controls without separate runtime proof.',
            'گزینه‌های ارائه‌نشده: برچسب‌ها، متن راهنما، حالت‌های فوکوس/خطا/غیرفعال، فیلدهای پیچیده، انتخابگرها/آپلود افزونه‌های جانبی و تنظیمات ریسپانسیو بدون شواهد مستقل.'
        ) ) . '</p></div>';
    }

    public static function download() {
        if ( ! self::authorized() ) {
            wp_die( esc_html( self::word( 'Access denied.', 'دسترسی مجاز نیست.' ) ), '', array( 'response' => 403 ) );
        }
        check_admin_referer( self::ACTION );

        try {
            $source = isset( $_POST['source'] ) && is_string( $_POST['source'] )
                ? wp_unslash( $_POST['source'] ) : null;
            $hash = isset( $_POST['source_hash'] ) && is_string( $_POST['source_hash'] )
                ? wp_unslash( $_POST['source_hash'] ) : null;
            $version = isset( $_POST['new_version'] ) && is_string( $_POST['new_version'] )
                ? wp_unslash( $_POST['new_version'] ) : null;
            $selection = isset( $_POST['change'] ) ? wp_unslash( $_POST['change'] ) : array();
            $colors = isset( $_POST['color'] ) ? wp_unslash( $_POST['color'] ) : array();
            if ( ! is_array( $selection ) || ! is_array( $colors ) ) {
                throw new \InvalidArgumentException( 'Invalid color selection.' );
            }
            $changes = array();
            foreach ( $selection as $key => $enabled ) {
                if (
                    ! isset( VerifiedColorSuccessor::editable()[ $key ] ) ||
                    '1' !== $enabled ||
                    ! isset( $colors[ $key ] )
                ) {
                    throw new \InvalidArgumentException( 'Unsupported color selection.' );
                }
                $changes[ $key ] = $colors[ $key ];
            }

            $workflow = SettingsLifecycleWorkflow::forWordPress();
            $resolution = self::resolution( $source, $workflow );
            $artifact = VerifiedColorSuccessor::build( $resolution, $hash, $version, $changes );

            // Read-only conflict check. Never install or activate during download.
            try {
                $workflow->exportVisual( $artifact['package_id'], $version );
                throw new \InvalidArgumentException( 'This identity/version is already installed. Choose a newer version.' );
            } catch ( LifecycleException $exception ) {
                if ( 'visual_version_not_installed' !== $exception->reasonCode() ) {
                    throw $exception;
                }
            }
            $json = VisualProfilePackage::canonicalJson( $artifact );
        } catch ( \InvalidArgumentException $exception ) {
            wp_die( esc_html( $exception->getMessage() ), '', array( 'response' => 400 ) );
        } catch ( LifecycleException $exception ) {
            wp_die( esc_html( $exception->getMessage() ), '', array( 'response' => 409 ) );
        }

        if ( function_exists( 'nocache_headers' ) ) {
            nocache_headers();
        }
        header( 'Content-Type: application/json; charset=utf-8' );
        header( 'Content-Disposition: attachment; filename="gpp-verified-color-successor-' . $version . '.json"' );
        header( 'X-Content-Type-Options: nosniff' );
        echo $json;
        exit;
    }
}
