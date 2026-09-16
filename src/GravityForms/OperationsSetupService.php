<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierAssets;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationModel;

/**
 * The product setup path for the operational presentation surfaces.
 *
 * This is the one callable entry point an administrator's action reaches, and
 * the same one production-path tests exercise. It does nothing a test fixture
 * could not also do through the product: it only composes the existing
 * lifecycle APIs.
 *
 * Deliberate boundaries:
 *
 * - it never infers a Gravity Forms field from a label, name, order, similarity
 *   or any previous fixture. Every semantic slot is seeded UNBOUND with a null
 *   source, and an administrator binds fields explicitly through the existing
 *   Mapping and Binding Health repair path;
 * - it never overwrites valid existing state. A re-run detects and preserves an
 *   existing activation, including bindings that were repaired after seeding;
 * - it never replaces a different existing visual activation. That conflict is
 *   reported and left intact for an explicit later decision;
 * - it activates only `print.dossier`. Inbox and Entry Detail definitions are
 *   packaged but stay unactivated until their own readiness work.
 */
final class OperationsSetupService {
    const PACKAGE_RELATIVE_PATH = 'profiles/srwf/operations/operations-package-v1.json';
    const PRINT_SURFACE = 'print.dossier';

    const STATUS_COMPLETED = 'COMPLETED';
    const STATUS_CONFLICT = 'CONFLICT';
    const STATUS_FAILED = 'FAILED';

    /**
     * Binding surfaces seeded for the selected form. Listing a surface here is
     * shared binding foundation only; each presentation surface still requires
     * its own visual activation before it renders anything.
     */
    private const BINDING_SURFACES = array( 'gravity_flow.inbox', 'gravity_flow.entry_detail', 'print.dossier' );

    /**
     * Slots the Binding Matrix marks as intentionally having no digital source,
     * such as physical signature and stamp regions.
     */
    private const NOT_APPLICABLE_SLOTS = array( 'print.manual_approval_signature_stamp_notes' );

    private $visual;
    private $bindings;
    private $package_path;
    private $installation_id;

    public function __construct( VisualPackageLifecycle $visual, BindingSetLifecycle $bindings, $package_path, $installation_id ) {
        $this->visual          = $visual;
        $this->bindings        = $bindings;
        $this->package_path    = $package_path;
        $this->installation_id = $installation_id;
    }

    public static function forWordPress() {
        return new self(
            new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) ),
            new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            ),
            self::defaultPackagePath(),
            self::hostInstallationId()
        );
    }

    public static function defaultPackagePath() {
        return defined( 'GPP_PLUGIN_FILE' )
            ? dirname( GPP_PLUGIN_FILE ) . '/' . self::PACKAGE_RELATIVE_PATH
            : dirname( __DIR__, 2 ) . '/' . self::PACKAGE_RELATIVE_PATH;
    }

    /**
     * Host-reported installation identity, bounded to the scalar shape the
     * binding contract admits. The site host is reported by WordPress; GPP does
     * not invent or persist a separate installation registry.
     */
    public static function hostInstallationId() {
        $host = '';
        if ( function_exists( 'home_url' ) ) {
            $parsed = function_exists( 'wp_parse_url' ) ? wp_parse_url( home_url(), PHP_URL_HOST ) : parse_url( home_url(), PHP_URL_HOST );
            $host   = is_string( $parsed ) ? strtolower( $parsed ) : '';
        }

        $host = preg_replace( '/[^a-z0-9.\-]/', '', $host );
        if ( ! is_string( $host ) || '' === $host || 1 !== preg_match( '/^[A-Za-z0-9][A-Za-z0-9._:-]*$/', $host ) ) {
            return null;
        }

        if ( function_exists( 'is_multisite' ) && is_multisite() && function_exists( 'get_current_blog_id' ) ) {
            $host .= ':' . (int) get_current_blog_id();
        }

        return $host;
    }

    public function packageArtifact() {
        if ( ! is_string( $this->package_path ) || ! is_readable( $this->package_path ) ) {
            throw new LifecycleException( 'operations_package_unavailable', 'The shipped operations package file is missing from this installation.' );
        }

        $artifact = json_decode( (string) file_get_contents( $this->package_path ), true );
        if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $artifact ) ) {
            throw new LifecycleException( 'operations_package_unreadable', 'The shipped operations package is not valid JSON object data.' );
        }

        try {
            VisualProfilePackage::validate( $artifact );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'operations_package_invalid', $exception->getMessage() );
        }

        return $artifact;
    }

    public function printProfileIdentity() {
        $artifact = $this->packageArtifact();

        foreach ( $artifact['surface_profiles'] as $profile ) {
            if ( self::PRINT_SURFACE === $profile['surface'] ) {
                return array(
                    'package_id' => $artifact['package_id'],
                    'package_version' => $artifact['package_version'],
                    'profile_id' => $profile['profile_id'],
                );
            }
        }

        throw new LifecycleException( 'operations_package_invalid', 'The shipped operations package declares no print.dossier profile.' );
    }

    /**
     * Configuration readiness facts only.
     *
     * This reports whether the installation is configured, never whether any
     * person may print. Gravity Flow re-decides authorization for this user,
     * this entry, this workflow state and this request every time, and no
     * administrator confirmation recorded here is cached as permission.
     */
    public function readiness( $form_id = null ) {
        $facts = array(
            'operations_package_present' => false,
            'print_surface_activation' => 'not_activated',
            'binding_context_present' => false,
            'print_required_mappings_present' => false,
            'print_assets' => PrintDossierAssets::integrity(),
            'request_authorization' => 'decided_per_request_by_gravity_flow',
            'notes' => array(),
        );

        try {
            $identity                          = $this->printProfileIdentity();
            $facts['operations_package_present'] = true;
        } catch ( LifecycleException $exception ) {
            $facts['notes'][] = $exception->reasonCode();
            return $facts;
        }

        try {
            $activation = $this->visual->resolve( self::PRINT_SURFACE );
            if ( null === $activation ) {
                $facts['print_surface_activation'] = 'not_activated';
            } elseif ( $this->sameVisualIdentity( $activation, $identity ) ) {
                $facts['print_surface_activation'] = 'active_operations_profile';
            } else {
                $facts['print_surface_activation'] = 'active_other_profile';
            }
        } catch ( LifecycleException $exception ) {
            $facts['notes'][] = $exception->reasonCode();
        }

        if ( null === $form_id ) {
            return $facts;
        }

        try {
            $context    = $this->bindingContext( (int) $form_id );
            $activation = $this->bindings->resolve( $context );
            if ( null === $activation ) {
                return $facts;
            }

            $facts['binding_context_present'] = true;
            $artifact                         = $this->activeBindingArtifact( $context, $activation );
            if ( null !== $artifact ) {
                $facts['print_required_mappings_present'] = $this->printMappingsPresent( $artifact );
            }
        } catch ( LifecycleException $exception ) {
            $facts['notes'][] = $exception->reasonCode();
        }

        return $facts;
    }

    /**
     * Detect-and-preserve initialization for one explicitly selected form.
     *
     * Each step reports its own outcome. A conflict never mutates and never
     * reports overall success.
     */
    public function initialize( $request ) {
        if ( ! is_array( $request ) || ! isset( $request['form_id'] ) ) {
            throw new LifecycleException( 'invalid_setup_request', 'Operations setup requires an explicitly selected Gravity Forms form.' );
        }

        $form_id = (int) $request['form_id'];
        if ( $form_id <= 0 ) {
            throw new LifecycleException( 'setup_form_not_selected', 'Select the real Gravity Forms form before initializing operations presentation.' );
        }

        if ( null === $this->installation_id ) {
            throw new LifecycleException( 'setup_installation_unknown', 'The host installation identity could not be read, so no binding context was created.' );
        }

        $identity = $this->printProfileIdentity();
        $steps    = array();

        $steps['package_import'] = $this->importPackage();
        if ( ! in_array( $steps['package_import']['outcome'], array( 'installed', 'already_installed' ), true ) ) {
            return $this->initializationResult( $form_id, $identity, $steps );
        }

        $steps['print_activation'] = $this->adoptPrintActivation( $identity );
        if ( ! in_array( $steps['print_activation']['outcome'], array( 'activated', 'already_active' ), true ) ) {
            return $this->initializationResult( $form_id, $identity, $steps );
        }

        $steps['binding_context'] = $this->adoptBindingContext( $form_id );

        return $this->initializationResult( $form_id, $identity, $steps );
    }

    private function initializationResult( $form_id, $identity, $steps ) {
        return array(
            'status' => $this->overallStatus( $steps ),
            'form_id' => $form_id,
            'installation_id' => $this->installation_id,
            'print_profile' => $identity,
            'steps' => $steps,
        );
    }

    private function importPackage() {
        try {
            $result = $this->visual->import( $this->packageArtifact() );
        } catch ( LifecycleException $exception ) {
            // A same identity/version record holding different content is a real
            // conflict. Overwriting it would silently change what every existing
            // activation of that version means.
            return array(
                'outcome' => 'identity_version_conflict' === $exception->reasonCode() ? 'conflict' : 'failed',
                'reason' => $exception->reasonCode(),
                'message' => $exception->getMessage(),
            );
        }

        return array(
            'outcome' => 'IDEMPOTENT' === $result['status'] ? 'already_installed' : 'installed',
            'reason' => null,
            'content_hash' => $result['content_hash'],
        );
    }

    private function adoptPrintActivation( $identity ) {
        try {
            $current = $this->visual->resolve( self::PRINT_SURFACE );
        } catch ( LifecycleException $exception ) {
            return array( 'outcome' => 'failed', 'reason' => $exception->reasonCode(), 'message' => $exception->getMessage() );
        }

        if ( null !== $current ) {
            if ( $this->sameVisualIdentity( $current, $identity ) ) {
                return array( 'outcome' => 'already_active', 'reason' => null );
            }

            return array(
                'outcome' => 'conflict',
                'reason' => 'visual_activation_conflict',
                'message' => 'A different Print visual activation already exists and was left unchanged.',
                'current' => $current,
            );
        }

        try {
            $this->visual->activateIfCurrent(
                array(
                    'surface' => self::PRINT_SURFACE,
                    'package_id' => $identity['package_id'],
                    'package_version' => $identity['package_version'],
                    'profile_id' => $identity['profile_id'],
                    'expected_current_activation' => null,
                )
            );
        } catch ( LifecycleException $exception ) {
            return array(
                'outcome' => 'visual_activation_conflict' === $exception->reasonCode() ? 'conflict' : 'failed',
                'reason' => $exception->reasonCode(),
                'message' => $exception->getMessage(),
            );
        }

        return array( 'outcome' => 'activated', 'reason' => null );
    }

    private function adoptBindingContext( $form_id ) {
        try {
            $context = $this->bindingContext( $form_id );
            $current = $this->bindings->resolve( $context );

            // An existing active binding context is authoritative. Re-seeding it
            // would roll repaired field mappings back to the UNBOUND seed.
            if ( null !== $current ) {
                return array(
                    'outcome' => 'already_bound',
                    'reason' => null,
                    'binding_set_id' => $current['binding_set_id'],
                    'binding_set_version' => $current['binding_set_version'],
                );
            }

            $seed = $this->seedBindingSet( $form_id, $context );
            $this->bindings->import( $seed );

            $this->bindings->activateIfCurrent(
                array(
                    'context' => $context,
                    'binding_set_id' => $seed['binding_set_id'],
                    'binding_set_version' => $seed['binding_set_version'],
                    'expected_current_activation' => null,
                )
            );

            return array(
                'outcome' => 'seeded',
                'reason' => null,
                'binding_set_id' => $seed['binding_set_id'],
                'binding_set_version' => $seed['binding_set_version'],
            );
        } catch ( LifecycleException $exception ) {
            return array(
                'outcome' => in_array( $exception->reasonCode(), array( 'identity_version_conflict', 'stale_binding_management_action' ), true ) ? 'conflict' : 'failed',
                'reason' => $exception->reasonCode(),
                'message' => $exception->getMessage(),
            );
        } catch ( ContractViolation $exception ) {
            return array( 'outcome' => 'failed', 'reason' => 'binding_contract_violation', 'message' => $exception->getMessage() );
        }
    }

    public function bindingContext( $form_id ) {
        if ( null === $this->installation_id ) {
            throw new LifecycleException( 'setup_installation_unknown', 'The host installation identity could not be read.' );
        }

        return array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $this->installation_id ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => (int) $form_id ),
            'entry_source_ref' => null,
            'surfaces' => self::BINDING_SURFACES,
        );
    }

    /**
     * Complete semantic destination catalog for the selected form, seeded with
     * no guessed source anywhere.
     */
    public function seedBindingSet( $form_id, $context = null ) {
        $artifact = $this->packageArtifact();
        $context  = null === $context ? $this->bindingContext( $form_id ) : $context;

        $bindings = array();
        $claims   = array();

        foreach ( $artifact['semantic_slots'] as $slot ) {
            $key = $slot['semantic_slot_key'];

            $bindings[] = array(
                'semantic_slot_key' => $key,
                'state' => in_array( $key, self::NOT_APPLICABLE_SLOTS, true ) ? 'NOT_APPLICABLE' : 'UNBOUND',
                'source_ref' => null,
                'evidence_refs' => array(),
            );

            // Print-specific semantics require their own proof, separate from
            // whichever field an administrator later binds to the slot.
            if ( PrintDossierPresentationModel::requiresPrintMappingSlot( $key ) ) {
                $claims[] = array(
                    'semantic_slot_key' => $key,
                    'claim' => 'print_mapping',
                    'evidence_state' => 'NOT_PROVEN',
                    'evidence_refs' => array(),
                );
            }
        }

        $seed = array(
            'artifact_type' => EnvironmentBindingSet::ARTIFACT_TYPE,
            'schema_version' => EnvironmentBindingSet::SCHEMA_VERSION_1_1,
            'binding_set_id' => 'srwf.operations.environment.f' . (int) $form_id,
            'binding_set_version' => '1.0.0',
            'context' => $context,
            'provenance' => array(
                'producer' => 'Gravity Presentation Profiles operations setup',
                'evidence_refs' => array( 'setup:gpp-operations-initialization' ),
            ),
            'bindings' => $bindings,
            'runtime_claims' => $claims,
        );

        EnvironmentBindingSet::validate( $seed );

        return $seed;
    }

    private function printMappingsPresent( $artifact ) {
        foreach ( $artifact['runtime_claims'] as $claim ) {
            if ( 'print_mapping' === $claim['claim'] && 'PROVEN' !== $claim['evidence_state'] ) {
                return false;
            }
        }

        return true;
    }

    private function activeBindingArtifact( $context, $activation ) {
        $snapshot    = $this->bindings->snapshot();
        $context_key = $this->bindings->contextKey( $context );
        $id          = $activation['binding_set_id'];
        $version     = $activation['binding_set_version'];

        if ( ! isset( $snapshot['installed'][ $id ][ $version ] ) ) {
            return null;
        }

        $record = $snapshot['installed'][ $id ][ $version ];

        return isset( $record['context_key'], $record['artifact'] ) && $record['context_key'] === $context_key
            ? $record['artifact']
            : null;
    }

    private function sameVisualIdentity( $activation, $identity ) {
        foreach ( array( 'package_id', 'package_version', 'profile_id' ) as $key ) {
            if ( ! isset( $activation[ $key ] ) || $activation[ $key ] !== $identity[ $key ] ) {
                return false;
            }
        }

        return true;
    }

    private function overallStatus( $steps ) {
        foreach ( $steps as $step ) {
            if ( 'failed' === $step['outcome'] ) {
                return self::STATUS_FAILED;
            }
        }

        foreach ( $steps as $step ) {
            if ( 'conflict' === $step['outcome'] ) {
                return self::STATUS_CONFLICT;
            }
        }

        return self::STATUS_COMPLETED;
    }
}
