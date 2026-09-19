<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailVisualVariant;

/**
 * Appearance-only Entry Detail visual switching through the existing lifecycle.
 *
 * No binding, workflow, authorization or request-time readiness state is read or
 * written here. The visual lifecycle activation remains the sole selection
 * authority; settings values are transient compare-and-set commands only.
 */
final class EntryDetailVisualVariantService {
    const STATUS_COMPLETED = 'COMPLETED';
    const STATUS_NO_CHANGE = 'NO_CHANGE';

    private $visual;
    private $operations;

    public function __construct( VisualPackageLifecycle $visual, OperationsSetupService $operations ) {
        $this->visual = $visual;
        $this->operations = $operations;
    }

    public static function forWordPress() {
        return new self(
            new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) ),
            OperationsSetupService::forWordPress()
        );
    }

    public function currentSafeIdentity() {
        $artifact = $this->operations->packageArtifact();
        foreach ( $artifact['surface_profiles'] as $profile ) {
            if ( EntryDetailVisualVariant::SURFACE === $profile['surface'] ) {
                return array(
                    'package_id' => $artifact['package_id'],
                    'package_version' => $artifact['package_version'],
                    'profile_id' => $profile['profile_id'],
                );
            }
        }
        throw new LifecycleException( 'entry_detail_variant_package_invalid', 'The shipped Current / Safe package has no Entry Detail profile.' );
    }

    public function fullWidthIdentity() {
        return array(
            'package_id' => EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_ID,
            'package_version' => EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_VERSION,
            'profile_id' => EntryDetailVisualVariant::FULL_WIDTH_PROFILE_ID,
        );
    }

    /**
     * Build the immutable Entry-Detail-only package from the exact currently
     * shipped Entry Detail semantic contract. Schema 1.1 keeps one profile for
     * one selected surface, so no package-contract exception is introduced.
     */
    public function fullWidthArtifact() {
        $base = $this->operations->packageArtifact();
        $profile = null;
        foreach ( $base['surface_profiles'] as $candidate ) {
            if ( EntryDetailVisualVariant::SURFACE === $candidate['surface'] ) {
                $profile = $candidate;
                break;
            }
        }
        if ( ! is_array( $profile ) || EntryDetailVisualVariant::CURRENT_SAFE_PROFILE_ID !== $profile['profile_id'] ) {
            throw new LifecycleException( 'entry_detail_variant_base_contract_changed', 'The Current / Safe Entry Detail profile identity changed; Full Width was not rebuilt implicitly.' );
        }

        $slots = array();
        foreach ( $base['semantic_slots'] as $declaration ) {
            $usage = null;
            foreach ( $declaration['surface_usage'] as $candidate_usage ) {
                if ( EntryDetailVisualVariant::SURFACE === $candidate_usage['surface'] ) {
                    $usage = $candidate_usage;
                    break;
                }
            }
            if ( null === $usage ) {
                continue;
            }
            $slots[] = array(
                'semantic_slot_key' => $declaration['semantic_slot_key'],
                'meaning' => $declaration['meaning'],
                'surface_usage' => array(
                    array(
                        'surface' => EntryDetailVisualVariant::SURFACE,
                        'required' => (bool) $usage['required'],
                    ),
                ),
            );
        }

        $tokens = array(
            'colors' => array(
                'page' => '#F8FAFC',
                'surface' => '#FFFFFF',
                'surface_soft' => '#F8FAFC',
                'text_primary' => '#172033',
                'text_secondary' => '#475467',
                'text_muted' => '#667085',
                'border' => '#E5E7EB',
                'control_border' => '#CBD5E1',
                'info_background' => '#EFF6FF',
                'info_border' => '#BFDBFE',
                'primary' => '#2563EB',
                'approve' => '#16A34A',
                'reject' => '#F43F5E',
                'revert' => '#F59E0B',
                'notice_background' => '#FFF7D6',
                'notice_border' => '#FDE68A'
            ),
            'spacing_px' => array(
                'page_inline' => 32,
                'page_block' => 28,
                'grid_gap' => 28,
                'card_padding' => 24
            ),
            'radii_px' => array(
                'card' => 20,
                'control' => 10,
                'event' => 16
            ),
            'sizes_px' => array(
                'control_min_height' => 44
            ),
            'font_sizes_px' => array(
                'body' => 15,
                'section' => 20
            ),
            'font_weights' => array(
                'regular' => 400,
                'medium' => 500,
                'strong' => 700
            )
        );

        $token_refs = array();
        foreach ( $tokens as $category => $values ) {
            foreach ( array_keys( $values ) as $name ) {
                $token_refs[] = $category . '.' . $name;
            }
        }

        $artifact = array(
            'artifact_type' => VisualProfilePackage::ARTIFACT_TYPE,
            'schema_version' => '1.1.0',
            'package_id' => EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_ID,
            'package_version' => EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_VERSION,
            'provenance' => array(
                'producer' => 'SRWF Entry Detail Full Width visual variant',
                'evidence_refs' => array(
                    'owner:ENTRY_DETAIL_FULL_WIDTH_VISUAL_VARIANT_WITH_CSS_FEASIBILITY_GATE',
                    'architecture:GPP-ENTRY-DETAIL-REVIEW-CORRECTION-TARGET-V1',
                    'visual:ENTRY_DETAIL_VNEXT_AUTHORITY_MIGRATION_V1',
                ),
            ),
            'selected_surfaces' => array( EntryDetailVisualVariant::SURFACE ),
            'design_tokens' => $tokens,
            'semantic_slots' => $slots,
            'surface_profiles' => array(
                array(
                    'surface' => EntryDetailVisualVariant::SURFACE,
                    'profile_id' => EntryDetailVisualVariant::FULL_WIDTH_PROFILE_ID,
                    'token_refs' => $token_refs,
                    'semantic_slots' => array_values( $profile['semantic_slots'] ),
                    'presentation' => array(
                        'composition' => array(
                            'direction' => 'rtl',
                            'inline_padding' => 'spacing_px.page_inline',
                            'surface_background' => 'colors.page',
                            'surface_radius' => 'radii_px.card',
                        ),
                        'controls' => array(
                            'background' => 'colors.surface',
                            'text' => 'colors.text_primary',
                            'border' => 'colors.control_border',
                            'focus_border' => 'colors.primary',
                            'radius' => 'radii_px.control',
                            'min_height' => 'sizes_px.control_min_height',
                            'font_size' => 'font_sizes_px.body',
                            'font_weight' => 'font_weights.medium',
                        ),
                    ),
                ),
            ),
            'reserved_extension_seam' => array(
                'version' => VisualProfilePackage::RESERVED_EXTENSION_SEAM_VERSION,
                'state' => VisualProfilePackage::RESERVED_EXTENSION_SEAM_STATE,
            ),
        );

        try {
            VisualProfilePackage::validate( $artifact );
        } catch ( \Throwable $exception ) {
            throw new LifecycleException( 'entry_detail_full_width_package_invalid', $exception->getMessage() );
        }

        return $artifact;
    }

    public function activeFacts() {
        $activation = $this->visual->resolve( EntryDetailVisualVariant::SURFACE );
        if ( null === $activation ) {
            return array( 'state' => 'not_active', 'variant' => null, 'label' => null, 'activation' => null );
        }

        $variant = null;
        if ( $this->sameIdentity( $activation, $this->currentSafeIdentity() ) ) {
            $variant = EntryDetailVisualVariant::CURRENT_SAFE;
        } elseif ( $this->sameIdentity( $activation, $this->fullWidthIdentity() ) ) {
            $variant = EntryDetailVisualVariant::FULL_WIDTH;
        }

        return array(
            'state' => null === $variant ? 'unknown_activation' : 'active',
            'variant' => $variant,
            'label' => null === $variant ? null : EntryDetailVisualVariant::label( $variant ),
            'activation' => $activation,
        );
    }

    public function settingsChoices() {
        $facts = $this->activeFacts();
        if ( 'active' !== $facts['state'] ) {
            return array(
                array(
                    'label' => 'Active Entry Detail design is not recognized — no visual change',
                    'value' => '',
                ),
            );
        }

        $choices = array();
        foreach ( array( EntryDetailVisualVariant::CURRENT_SAFE, EntryDetailVisualVariant::FULL_WIDTH ) as $variant ) {
            $choices[] = array(
                'label' => EntryDetailVisualVariant::label( $variant ) . ( $variant === $facts['variant'] ? ' — فعال' : '' ),
                'value' => $variant === $facts['variant'] ? '' : $this->encodeAction( $variant, $facts['activation'] ),
            );
        }
        return $choices;
    }

    public function applySettingsValue( $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return array( 'status' => self::STATUS_NO_CHANGE, 'variant' => $this->activeFacts()['variant'] );
        }

        $action = $this->decodeAction( trim( $value ) );
        if ( null === $action ) {
            throw new LifecycleException( 'invalid_entry_detail_variant_action', 'The selected Entry Detail design action is invalid. Refresh the page and try again.' );
        }

        return $this->switchVariant( $action );
    }

    public function switchVariant( $request ) {
        if ( ! is_array( $request ) ) {
            throw new LifecycleException( 'invalid_entry_detail_variant_action', 'Entry Detail design switching requires a bounded request.' );
        }
        $keys = array_keys( $request );
        sort( $keys, SORT_STRING );
        if ( array( 'expected_current_activation', 'target_variant' ) !== $keys ) {
            throw new LifecycleException( 'invalid_entry_detail_variant_action', 'Entry Detail design switching received unexpected targeting data.' );
        }

        $target_variant = $request['target_variant'];
        if ( ! in_array( $target_variant, array( EntryDetailVisualVariant::CURRENT_SAFE, EntryDetailVisualVariant::FULL_WIDTH ), true ) ) {
            throw new LifecycleException( 'invalid_entry_detail_variant', 'The selected Entry Detail design is not supported.' );
        }
        $expected = $this->validatedIdentity( $request['expected_current_activation'] );
        $current_facts = $this->activeFacts();
        if ( 'active' !== $current_facts['state'] ) {
            throw new LifecycleException( 'entry_detail_variant_activation_unrecognized', 'The current Entry Detail visual activation is not a recognized Owner-selectable design and was left unchanged.' );
        }

        $target_identity = EntryDetailVisualVariant::CURRENT_SAFE === $target_variant
            ? $this->currentSafeIdentity()
            : $this->fullWidthIdentity();

        if ( $this->sameIdentity( $current_facts['activation'], $target_identity ) ) {
            return array(
                'status' => self::STATUS_NO_CHANGE,
                'variant' => $target_variant,
                'activation' => $current_facts['activation'],
            );
        }

        $artifact = EntryDetailVisualVariant::CURRENT_SAFE === $target_variant
            ? $this->operations->packageArtifact()
            : $this->fullWidthArtifact();
        $this->visual->import( $artifact );

        $activation = $this->visual->activateIfCurrent(
            array(
                'surface' => EntryDetailVisualVariant::SURFACE,
                'package_id' => $target_identity['package_id'],
                'package_version' => $target_identity['package_version'],
                'profile_id' => $target_identity['profile_id'],
                'expected_current_activation' => $expected,
            )
        );

        return array(
            'status' => self::STATUS_COMPLETED,
            'variant' => $target_variant,
            'activation' => $activation,
        );
    }

    private function encodeAction( $target_variant, $expected ) {
        $payload = json_encode(
            array(
                'target_variant' => $target_variant,
                'expected_current_activation' => $expected,
            ),
            JSON_UNESCAPED_SLASHES
        );
        return rtrim( strtr( base64_encode( $payload ), '+/', '-_' ), '=' );
    }

    private function decodeAction( $value ) {
        if ( 1 !== preg_match( '/^[A-Za-z0-9_-]+$/', $value ) ) {
            return null;
        }
        $encoded = strtr( $value, '-_', '+/' );
        $padding = strlen( $encoded ) % 4;
        if ( $padding ) {
            $encoded .= str_repeat( '=', 4 - $padding );
        }
        $json = base64_decode( $encoded, true );
        if ( false === $json ) {
            return null;
        }
        $payload = json_decode( $json, true );
        if ( ! is_array( $payload ) || ! isset( $payload['target_variant'], $payload['expected_current_activation'] ) ) {
            return null;
        }
        $keys = array_keys( $payload );
        sort( $keys, SORT_STRING );
        return array( 'expected_current_activation', 'target_variant' ) === $keys ? $payload : null;
    }

    private function validatedIdentity( $identity ) {
        if ( ! is_array( $identity ) ) {
            throw new LifecycleException( 'invalid_entry_detail_variant_action', 'Expected Entry Detail visual identity is invalid.' );
        }
        $keys = array_keys( $identity );
        sort( $keys, SORT_STRING );
        if ( array( 'package_id', 'package_version', 'profile_id' ) !== $keys ) {
            throw new LifecycleException( 'invalid_entry_detail_variant_action', 'Expected Entry Detail visual identity is incomplete.' );
        }
        foreach ( $identity as $value ) {
            if ( ! is_string( $value ) || '' === $value ) {
                throw new LifecycleException( 'invalid_entry_detail_variant_action', 'Expected Entry Detail visual identity contains an invalid value.' );
            }
        }
        return $identity;
    }

    private function sameIdentity( $left, $right ) {
        if ( ! is_array( $left ) || ! is_array( $right ) ) {
            return false;
        }
        foreach ( array( 'package_id', 'package_version', 'profile_id' ) as $key ) {
            if ( ! isset( $left[ $key ], $right[ $key ] ) || $left[ $key ] !== $right[ $key ] ) {
                return false;
            }
        }
        return true;
    }
}
