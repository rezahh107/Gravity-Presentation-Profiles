<?php
/**
 * Print data-correctness coverage: raw versus display reads, environment-scoped
 * canonical choice mapping, the full-name derivation, unresolved values staying
 * blank, required asset integrity, and the two-page composition.
 */

require_once __DIR__ . '/../helpers.php';

define( 'GPP_PLUGIN_FILE', dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php' );

function esc_html( $value ) {
    return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
}

function esc_attr( $value ) {
    return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
}

function esc_url( $value ) {
    return (string) $value;
}

function plugins_url( $path, $plugin_file ) {
    return 'https://example.invalid/wp-content/plugins/gravity-presentation-profiles/' . ltrim( (string) $path, '/' );
}

function wp_strip_all_tags( $value ) {
    return strip_tags( (string) $value );
}

/**
 * Minimal stand-in for a Gravity Forms 3.1.x choice field.
 * Since Gravity Forms 2.9.29, GF_Field::get_value_entry_detail() receives the
 * current Entry Object as argument two instead of the legacy currency string.
 * Fail loudly if a caller regresses to the pre-2.9.29 contract.
 */
final class PrintStubChoiceField {
    public $id;
    public $label;
    public $type = 'radio';
    private $choices;

    public function __construct( $id, $label, $choices ) {
        $this->id      = $id;
        $this->label   = $label;
        $this->choices = $choices;
    }

    public function get_value_entry_detail( $value, $entry = array(), $use_text = false, $format = 'html', $media = 'screen' ) {
        if ( ! is_array( $entry ) ) {
            throw new \InvalidArgumentException( 'entry argument must be the current Entry Object' );
        }
        if ( 'text' !== $format ) {
            throw new \InvalidArgumentException( 'print presentation must request the text format' );
        }
        if ( ! $use_text ) {
            return (string) $value;
        }
        return isset( $this->choices[ (string) $value ] ) ? $this->choices[ (string) $value ] : (string) $value;
    }
}

final class PrintStubTextField {
    public $id;
    public $label;
    public $type = 'text';

    public function __construct( $id, $label ) {
        $this->id    = $id;
        $this->label = $label;
    }

    public function get_value_entry_detail( $value, $entry = array(), $use_text = false, $format = 'html', $media = 'screen' ) {
        if ( ! is_array( $entry ) ) {
            throw new \InvalidArgumentException( 'entry argument must be the current Entry Object' );
        }
        return (string) $value;
    }
}

final class GFAPI {
    public static function get_field( $form, $field_id ) {
        foreach ( $form['fields'] as $field ) {
            if ( (string) $field->id === (string) $field_id ) {
                return $field;
            }
        }
        return null;
    }
}

require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\BoundHostValueReader;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierAssets;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierDecisionTrace;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationModel;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierRenderer;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierValueResolver;

Autoloader::register();

$package = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$profile = ( new VisualProfileResolver( $package ) )->resolve( 'print.dossier' );

// The stored raw value 'F' is what Gravity Forms persists; the Persian label is
// what an operator reads. Neither may stand in for the other.
$form = array(
    'id' => 88,
    'fields' => array(
        new PrintStubTextField( 11, 'First name' ),
        new PrintStubTextField( 12, 'Last name' ),
        new PrintStubChoiceField( 14, 'Gender', array( 'F' => 'دختر', 'M' => 'پسر' ) ),
        new PrintStubTextField( 16, 'School' ),
    ),
);

$entry = array(
    'id' => 9001,
    'form_id' => 88,
    '11' => 'زهرا',
    '12' => 'رضایی',
    '14' => 'F',
    '16' => 'دبیرستان نمونه',
);

// ---------------------------------------------------------------------------
// Raw versus display separation.
// ---------------------------------------------------------------------------

$reader = new BoundHostValueReader();
$gender_source = array( 'type' => 'gravity_forms.field', 'field_id' => 14 );

gpp_assert_same( 'F', $reader->readRaw( $gender_source, $form, $entry ), 'A raw read returns exactly what the host stored.' );
gpp_assert_same( 'دختر', $reader->readDisplay( $gender_source, $form, $entry ), 'A display read returns the host human-readable label.' );
gpp_assert_true(
    $reader->readRaw( $gender_source, $form, $entry ) !== $reader->readDisplay( $gender_source, $form, $entry ),
    'Raw and display reads are materially different for a choice field.'
);
gpp_assert_same( null, $reader->readRaw( array( 'type' => 'gravity_forms.field', 'field_id' => 99 ), $form, $entry ), 'An unbound field id reads as null rather than an empty guess.' );
gpp_assert_true( ! method_exists( $reader, 'read' ), 'No ambiguous combined read() method may exist.' );

// ---------------------------------------------------------------------------
// Binding artifact: two mapped names, one mapped text field, one mapped choice
// field with an explicit raw-to-canonical Print option map, and one slot that
// stays deliberately unresolved.
// ---------------------------------------------------------------------------

function print_data_binding( $option_map, $gender_field_id = 14 ) {
    $refs = array( 'operator:print-acceptance' );

    $claims = array(
        array(
            'semantic_slot_key' => 'student.gender',
            'claim' => 'print_mapping',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => $refs,
        ),
    );
    if ( null !== $option_map ) {
        $claims[0]['print_option_map'] = $option_map;
    }

    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => EnvironmentBindingSet::SCHEMA_VERSION_1_1,
        'binding_set_id' => 'acceptance.environment.f88',
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'fixture.example' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 88 ),
            'entry_source_ref' => null,
            'surfaces' => array( 'print.dossier' ),
        ),
        'provenance' => array( 'producer' => 'operator', 'evidence_refs' => $refs ),
        'bindings' => array(
            array( 'semantic_slot_key' => 'student.first_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 11 ), 'evidence_refs' => $refs ),
            array( 'semantic_slot_key' => 'student.last_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 12 ), 'evidence_refs' => $refs ),
            array( 'semantic_slot_key' => 'student.full_name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'school.name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 16 ), 'evidence_refs' => $refs ),
            array( 'semantic_slot_key' => 'student.gender', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => $gender_field_id ), 'evidence_refs' => $refs ),
            array( 'semantic_slot_key' => 'student.father_name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'print.financial_date', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
        ),
        'runtime_claims' => $claims,
    );
}

$option_map = array(
    array( 'canonical_option' => 'female', 'host_raw_value' => 'F' ),
    array( 'canonical_option' => 'male', 'host_raw_value' => 'M' ),
);

$binding = print_data_binding( $option_map );
EnvironmentBindingSet::validate( $binding );

$model    = new PrintDossierPresentationModel( $profile, array( $binding ), $package['semantic_slots'] );
$trace    = new PrintDossierDecisionTrace();
$resolved = ( new PrintDossierValueResolver( $model ) )->resolve( $form, $entry, $trace );

// ---------------------------------------------------------------------------
// Derivation, display text, blanks.
// ---------------------------------------------------------------------------

gpp_assert_same( 'زهرا رضایی', $resolved['values']['student.full_name'], 'Full name is derived from the separately bound first and last name fields.' );
gpp_assert_true( $trace->hasOutcome( 'full_name_derived' ), 'The derivation is recorded as its own decision.' );
gpp_assert_same( 'دبیرستان نمونه', $resolved['values']['school.name'], 'A mapped ordinary text field prints its real value.' );
gpp_assert_same( '', $resolved['values']['student.father_name'], 'An intentionally unmapped value stays blank rather than guessed.' );
gpp_assert_same( '', $resolved['values']['print.financial_date'], 'The financial date never falls back to another date source.' );
gpp_assert_true( ! array_key_exists( 'student.first_name', $resolved['values'] ), 'Name components are derivation inputs, not separate printed fields.' );

// ---------------------------------------------------------------------------
// Canonical choice mapping from the real host raw value.
// ---------------------------------------------------------------------------

gpp_assert_true( $resolved['options']['female'], 'The stored raw value selects its declared canonical Print option.' );
gpp_assert_true( ! $resolved['options']['male'], 'A canonical option whose declared raw value does not match stays unselected.' );

foreach ( array( 'reg_normal', 'reg_shaheed', 'time_early', 'pay_cash', 'loc_central', 'graduated', 'former_kanoon' ) as $unbound_option ) {
    gpp_assert_true( ! $resolved['options'][ $unbound_option ], 'An option group with no proven mapping stays entirely blank: ' . $unbound_option );
}

$map = $model->printOptionMap( $entry, 'student.gender' );
gpp_assert_same( 'F', $map['female'], 'The canonical option map is read from the environment binding artifact.' );
gpp_assert_same( array(), $model->printOptionMap( $entry, 'registration.center' ), 'A slot without a proven print mapping exposes no option map.' );

// Falsify the previously hard-coded environment assumptions behaviourally.
// The Print path used to assume gender 0/1, registration type 'reg_normal' and
// similar literals were the host raw values. An entry that stores exactly those
// literals must now select nothing unless this environment declared them.
$legacy_form = array(
    'id' => 88,
    'fields' => array(
        new PrintStubTextField( 11, 'First name' ),
        new PrintStubTextField( 12, 'Last name' ),
        new PrintStubChoiceField( 14, 'Gender', array( '0' => 'دختر', '1' => 'پسر' ) ),
        new PrintStubTextField( 16, 'School' ),
    ),
);
$legacy_entry = array( 'id' => 9002, 'form_id' => 88, '11' => 'زهرا', '12' => 'رضایی', '14' => '0', '16' => 'دبیرستان نمونه' );

$legacy_unmapped_model = new PrintDossierPresentationModel( $profile, array( print_data_binding( null ) ), $package['semantic_slots'] );
$legacy_unmapped = ( new PrintDossierValueResolver( $legacy_unmapped_model ) )->resolve( $legacy_form, $legacy_entry, new PrintDossierDecisionTrace() );
gpp_assert_true( ! $legacy_unmapped['options']['female'], 'Raw value 0 must not mean female unless this environment declared it.' );
gpp_assert_true( ! $legacy_unmapped['options']['male'], 'Raw value 1 must not mean male unless this environment declared it.' );

// The same environment, once it declares 0 => female, selects correctly. That is
// the mapping being data-driven rather than assumed.
$legacy_mapped_model = new PrintDossierPresentationModel(
    $profile,
    array( print_data_binding( array( array( 'canonical_option' => 'female', 'host_raw_value' => '0' ) ) ) ),
    $package['semantic_slots']
);
$legacy_mapped = ( new PrintDossierValueResolver( $legacy_mapped_model ) )->resolve( $legacy_form, $legacy_entry, new PrintDossierDecisionTrace() );
gpp_assert_true( $legacy_mapped['options']['female'], 'A declared 0 => female mapping selects from the real raw value.' );
gpp_assert_true( ! $legacy_mapped['options']['male'], 'An undeclared canonical option stays unselected.' );

// ---------------------------------------------------------------------------
// Fail closed when the environment declares no option map.
// ---------------------------------------------------------------------------

$unmapped = print_data_binding( null );
EnvironmentBindingSet::validate( $unmapped );
$unmapped_model = new PrintDossierPresentationModel( $profile, array( $unmapped ), $package['semantic_slots'] );
$unmapped_trace = new PrintDossierDecisionTrace();
$unmapped_resolved = ( new PrintDossierValueResolver( $unmapped_model ) )->resolve( $form, $entry, $unmapped_trace );

gpp_assert_true( ! $unmapped_resolved['options']['female'], 'A proven print mapping without a declared option map selects nothing.' );
gpp_assert_true( ! $unmapped_resolved['options']['male'], 'Neither option is guessed from the raw value.' );
gpp_assert_true( $unmapped_trace->hasOutcome( 'print_option_map_not_declared' ), 'The missing option map is reported as its own distinct reason.' );

// A map declared against a different field cannot select through a new source.
$moved = print_data_binding( $option_map, 16 );
EnvironmentBindingSet::validate( $moved );
$moved_model = new PrintDossierPresentationModel( $profile, array( $moved ), $package['semantic_slots'] );
$moved_resolved = ( new PrintDossierValueResolver( $moved_model ) )->resolve( $form, $entry, new PrintDossierDecisionTrace() );
gpp_assert_true( ! $moved_resolved['options']['female'], 'An option map is only meaningful against the raw values of its own mapped source.' );

// ---------------------------------------------------------------------------
// Unresolved full name stays blank instead of half-composed.
// ---------------------------------------------------------------------------

$partial = print_data_binding( $option_map );
foreach ( $partial['bindings'] as $index => $binding_row ) {
    if ( 'student.last_name' === $binding_row['semantic_slot_key'] ) {
        $partial['bindings'][ $index ] = array(
            'semantic_slot_key' => 'student.last_name',
            'state' => 'UNBOUND',
            'source_ref' => null,
            'evidence_refs' => array(),
        );
    }
}
EnvironmentBindingSet::validate( $partial );
$partial_model = new PrintDossierPresentationModel( $profile, array( $partial ), $package['semantic_slots'] );
$partial_trace = new PrintDossierDecisionTrace();
$partial_resolved = ( new PrintDossierValueResolver( $partial_model ) )->resolve( $form, $entry, $partial_trace );

gpp_assert_same( '', $partial_resolved['values']['student.full_name'], 'A half-resolved identity is never printed.' );
gpp_assert_true( $partial_trace->hasOutcome( 'derivation_component_unresolved' ), 'The unresolved derivation component is reported distinctly.' );

// ---------------------------------------------------------------------------
// Required Print asset integrity.
// ---------------------------------------------------------------------------

$integrity = PrintDossierAssets::integrity();
gpp_assert_true( $integrity['ready'], 'Both required Print assets are present and unmodified in the source tree.' );
gpp_assert_same( null, $integrity['reason'], 'A healthy asset set reports no failure reason.' );
gpp_assert_same( 2, count( $integrity['assets'] ), 'Both approved marks are required.' );
foreach ( $integrity['assets'] as $name => $asset ) {
    gpp_assert_same( PrintDossierAssets::STATUS_OK, $asset['status'], 'Required asset must verify: ' . $name );
    gpp_assert_same( $asset['expected_sha256'], hash_file( 'sha256', dirname( GPP_PLUGIN_FILE ) . '/' . $asset['path'] ), 'The shipped bytes match the declared release identity: ' . $name );
}

// ---------------------------------------------------------------------------
// Two-page composition, Front first and Back second.
// ---------------------------------------------------------------------------

ob_start();
( new PrintDossierRenderer() )->render( $model, $resolved['values'], $resolved['options'] );
$html = ob_get_clean();

gpp_assert_same( 2, substr_count( $html, 'data-gpp-print-page=' ), 'The dossier is exactly two pages.' );
$front = strpos( $html, 'data-gpp-print-page="front"' );
$back  = strpos( $html, 'data-gpp-print-page="back"' );
gpp_assert_true( false !== $front && false !== $back, 'Both the Front and the Back page are present.' );
gpp_assert_true( $front < $back, 'Front is rendered first and Back second.' );
gpp_assert_true( false !== strpos( $html, 'زهرا رضایی' ), 'The derived full name appears in the rendered dossier.' );
gpp_assert_true( false !== strpos( $html, 'دبیرستان نمونه' ), 'Real mapped data appears in the rendered dossier.' );
gpp_assert_true( false === strpos( $html, '>F<' ), 'A raw host value is never printed in place of presentation text.' );

echo "PRINT_DOSSIER_DATA_PATH_PASS\n";
