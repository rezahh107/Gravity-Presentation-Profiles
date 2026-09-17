<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxFieldPresentationResolver;

function wp_strip_all_tags( $value ) {
    return strip_tags( (string) $value );
}

function esc_url_raw( $url, $protocols = null ) {
    unset( $protocols );
    return filter_var( $url, FILTER_VALIDATE_URL ) ? $url : '';
}

final class InboxChoiceFieldStub {
    public $id;
    public $type = 'select';
    public $multipleFiles = false;
    private $choices;

    public function __construct( $id, $choices ) {
        $this->id = $id;
        $this->choices = $choices;
    }

    public function get_value_entry_detail( $value, $currency = '', $use_text = false, $format = 'html', $media = 'screen' ) {
        unset( $currency, $media );
        if ( 'text' !== $format || ! $use_text ) {
            return $value;
        }
        if ( is_array( $value ) ) {
            $labels = array();
            foreach ( $value as $item ) {
                $labels[] = isset( $this->choices[ (string) $item ] ) ? $this->choices[ (string) $item ] : (string) $item;
            }
            return implode( '، ', $labels );
        }
        return isset( $this->choices[ (string) $value ] ) ? $this->choices[ (string) $value ] : (string) $value;
    }
}

final class InboxTextFieldStub {
    public $id;
    public $type = 'text';
    public $multipleFiles = false;
    public function __construct( $id ) { $this->id = $id; }
    public function get_value_entry_detail( $value, $currency = '', $use_text = false, $format = 'html', $media = 'screen' ) {
        unset( $currency, $use_text, $format, $media );
        return $value;
    }
}

final class InboxFileFieldStub {
    public $id;
    public $type = 'fileupload';
    public $multipleFiles;
    public function __construct( $id, $multiple = false ) {
        $this->id = $id;
        $this->multipleFiles = $multiple;
    }
    public function get_input_type() { return 'fileupload'; }
    public function to_array( $raw ) {
        if ( $this->multipleFiles ) {
            $decoded = json_decode( (string) $raw, true );
            return is_array( $decoded ) ? $decoded : array();
        }
        return '' === trim( (string) $raw ) ? array() : array( (string) $raw );
    }
    public function get_file_name_from_url( $url ) {
        $path = parse_url( $url, PHP_URL_PATH );
        if ( ! is_string( $path ) || '' === $path ) {
            return false;
        }
        return array( 'sanitized' => basename( $path ) );
    }
    public function get_download_url( $url, $force_download = false, $entry_id = 0 ) {
        unset( $force_download );
        if ( 9001 !== (int) $entry_id ) {
            return '';
        }
        return 'https://media.example.invalid/gf-download/' . rawurlencode( basename( parse_url( $url, PHP_URL_PATH ) ) );
    }
}

final class GFAPI {
    public static $fields = array();
    public static function get_field( $form, $field_id ) {
        unset( $form );
        return isset( self::$fields[ (string) $field_id ] ) ? self::$fields[ (string) $field_id ] : null;
    }
}

Autoloader::register();

GFAPI::$fields = array(
    '5' => new InboxChoiceFieldStub( 5, array(
        '3' => '<strong>پایه سوم انسانی</strong>',
        '4' => 'پایه چهارم',
    ) ),
    '6' => new InboxChoiceFieldStub( 6, array(
        '168' => 'دبیرستان فرهنگ',
        '169' => 'دبیرستان نمونه',
    ) ),
    '7' => new InboxTextFieldStub( 7 ),
    '8' => new InboxChoiceFieldStub( 8, array( 'A' => 'گزینه الف', 'B' => 'گزینه ب' ) ),
    '9' => new InboxFileFieldStub( 9, false ),
    '10' => new InboxFileFieldStub( 10, true ),
    '11' => new InboxFileFieldStub( 11, false ),
);

$form = array( 'id' => 77, 'fields' => array_values( GFAPI::$fields ) );
$entry = array(
    'id' => 9001,
    'form_id' => 77,
    '5' => '3',
    '6' => '168',
    '7' => '0012345678',
    '8' => array( 'A', 'B' ),
    '9' => 'https://storage.example.invalid/uploads/student-photo.png',
    '10' => json_encode( array(
        'https://storage.example.invalid/uploads/photo-one.png',
        'https://storage.example.invalid/uploads/photo-two.png',
    ) ),
    '11' => 'https://storage.example.invalid/uploads/transcript.pdf',
);

$resolver = new InboxFieldPresentationResolver();

$grade_source = array( 'type' => 'gravity_forms.field', 'field_id' => 5 );
$grade_before = $grade_source;
$grade = $resolver->resolveText( $grade_source, $form, $entry );
gpp_assert_same( '3', $grade['raw'], 'Choice raw value must remain the exact Gravity Forms stored value.' );
gpp_assert_same( 'پایه سوم انسانی', $grade['display_text'], 'Choice presentation must use the authoritative host label and normalize markup to text.' );
gpp_assert_true( false !== strpos( $grade['search_text'], 'پایه سوم انسانی' ), 'Human display label must be available to native searchable presentation.' );
gpp_assert_true( false !== strpos( $grade['search_text'], '3' ), 'Raw authoritative choice value remains separately searchable where useful.' );
gpp_assert_same( $grade_before, $grade_source, 'Presentation resolution must not mutate binding/source identity.' );
gpp_assert_true( false === strpos( $grade['search_text'], '<strong>' ), 'Host markup must not leak into hidden search text.' );

$school = $resolver->resolveText( array( 'type' => 'gravity_forms.field', 'field_id' => 6 ), $form, $entry );
gpp_assert_same( '168', $school['raw'], 'School raw identity remains authoritative.' );
gpp_assert_same( 'دبیرستان فرهنگ', $school['display_text'], 'School visible presentation uses the host choice label.' );

$national = $resolver->resolveText( array( 'type' => 'gravity_forms.field', 'field_id' => 7 ), $form, $entry );
gpp_assert_same( '0012345678', $national['display_text'], 'Identifier-like text must remain text and must not be converted through unrelated choice semantics.' );

$multi_choice = $resolver->resolveText( array( 'type' => 'gravity_forms.field', 'field_id' => 8 ), $form, $entry );
gpp_assert_same( 'گزینه الف، گزینه ب', $multi_choice['display_text'], 'Non-scalar choice values must use field-owned display semantics.' );
gpp_assert_true( false !== strpos( $multi_choice['search_text'], 'A B' ), 'Non-scalar raw values remain safely flattenable for native search support.' );

$photo = $resolver->resolvePhoto( array( 'type' => 'gravity_forms.field', 'field_id' => 9 ), $form, $entry );
gpp_assert_same( 'resolved', $photo['status'], 'A valid authoritative single-file image must resolve.' );
gpp_assert_same( 'student-photo.png', $photo['name'], 'Gravity Forms field filename parsing owns the presented file identity.' );
gpp_assert_same( 'https://media.example.invalid/gf-download/student-photo.png', $photo['url'], 'Photo URL must come from the host download API without same-origin guessing.' );
gpp_assert_true( false === strpos( $photo['url'], '/wp-content/uploads/' ), 'Inbox must not synthesize a WordPress uploads URL.' );

$multi_photo = $resolver->resolvePhoto( array( 'type' => 'gravity_forms.field', 'field_id' => 10 ), $form, $entry );
gpp_assert_same( 'multiple_files_selection_unproven', $multi_photo['status'], 'Multiple authoritative files without a selection rule must not pick an arbitrary image.' );
gpp_assert_same( null, $multi_photo['url'], 'Unresolved multi-file selection must preserve safe fallback.' );

$non_image = $resolver->resolvePhoto( array( 'type' => 'gravity_forms.field', 'field_id' => 11 ), $form, $entry );
gpp_assert_same( 'not_image', $non_image['status'], 'Clearly non-image file values must not render as student photos.' );
gpp_assert_same( null, $non_image['url'], 'Non-image file value must fall back safely.' );

$missing_entry = $entry;
$missing_entry['9'] = '';
$missing = $resolver->resolvePhoto( array( 'type' => 'gravity_forms.field', 'field_id' => 9 ), $form, $missing_entry );
gpp_assert_same( 'missing', $missing['status'], 'Missing photo keeps the existing fallback path.' );

echo "INBOX_FIELD_PRESENTATION_PASS\n";
