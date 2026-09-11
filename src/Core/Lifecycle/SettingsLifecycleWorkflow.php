<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;

final class SettingsLifecycleWorkflow {
    private $visual;
    private $bindings;

    public function __construct( VisualPackageLifecycle $visual, BindingSetLifecycle $bindings ) {
        $this->visual   = $visual;
        $this->bindings = $bindings;
    }

    public static function forWordPress( $admitted_binding_evidence_refs = array() ) {
        $visual_store  = new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME );
        $binding_store = new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME );
        $evidence_gate = new EvidenceReferenceGate( $admitted_binding_evidence_refs );

        return new self(
            new VisualPackageLifecycle( $visual_store ),
            new BindingSetLifecycle( $binding_store, $evidence_gate )
        );
    }

    public function validateVisualJson( $json ) {
        $decoded = $this->decodeJson( $json, 'visual_profile_package' );
        if ( ! $decoded['valid'] ) {
            return $decoded;
        }

        try {
            $artifact = $decoded['artifact'];
            $report   = VisualProfilePackage::validationReport( $artifact );

            return array(
                'artifact_class' => 'visual_profile_package',
                'valid' => true,
                'structural_status' => $report['structural_status'],
                'content_hash' => VisualProfilePackage::contentHash( $artifact ),
                'validation' => $report,
                'audit_record' => array(
                    'event' => 'VISUAL_IMPORT_VALIDATION',
                    'outcome' => 'VALID',
                ),
                'artifact' => $artifact,
            );
        } catch ( ContractViolation $exception ) {
            return array(
                'artifact_class' => 'visual_profile_package',
                'valid' => false,
                'structural_status' => 'REJECTED',
                'error_code' => 'visual_contract_violation',
                'message' => $exception->getMessage(),
                'audit_record' => array(
                    'event' => 'VISUAL_IMPORT_VALIDATION',
                    'outcome' => 'REJECTED',
                ),
            );
        }
    }

    public function validateBindingJson( $json ) {
        $decoded = $this->decodeJson( $json, 'environment_binding_set' );
        if ( ! $decoded['valid'] ) {
            return $decoded;
        }

        try {
            $artifact = $decoded['artifact'];
            $report   = EnvironmentBindingSet::validationReport( $artifact );

            return array(
                'artifact_class' => 'environment_binding_set',
                'valid' => true,
                'structural_status' => $report['structural_status'],
                'content_hash' => EnvironmentBindingSet::contentHash( $artifact ),
                'validation' => $report,
                'audit_record' => array(
                    'event' => 'BINDING_IMPORT_VALIDATION',
                    'outcome' => 'VALID',
                ),
                'artifact' => $artifact,
            );
        } catch ( ContractViolation $exception ) {
            return array(
                'artifact_class' => 'environment_binding_set',
                'valid' => false,
                'structural_status' => 'REJECTED',
                'error_code' => 'binding_contract_violation',
                'message' => $exception->getMessage(),
                'audit_record' => array(
                    'event' => 'BINDING_IMPORT_VALIDATION',
                    'outcome' => 'REJECTED',
                ),
            );
        }
    }

    public function importVisualJson( $json ) {
        $validation = $this->validateVisualJson( $json );
        if ( ! $validation['valid'] ) {
            throw new LifecycleException( $validation['error_code'], $validation['message'] );
        }

        $result = $this->visual->import( $validation['artifact'] );
        unset( $validation['artifact'] );
        $result['validation_report'] = $validation;

        return $result;
    }

    public function importBindingJson( $json ) {
        $validation = $this->validateBindingJson( $json );
        if ( ! $validation['valid'] ) {
            throw new LifecycleException( $validation['error_code'], $validation['message'] );
        }

        $result = $this->bindings->import( $validation['artifact'] );
        unset( $validation['artifact'] );
        $result['validation_report'] = $validation;

        return $result;
    }

    public function exportVisual( $package_id, $package_version ) {
        return $this->visual->export( $package_id, $package_version );
    }

    public function exportBinding( $binding_set_id, $binding_set_version ) {
        return $this->bindings->export( $binding_set_id, $binding_set_version );
    }

    private function decodeJson( $json, $artifact_class ) {
        if ( ! is_string( $json ) || '' === trim( $json ) ) {
            return $this->invalidJsonReport( $artifact_class, 'JSON input must be non-empty text.' );
        }

        $artifact = json_decode( $json, true );
        if ( JSON_ERROR_NONE !== json_last_error() || ! is_array( $artifact ) ) {
            return $this->invalidJsonReport( $artifact_class, 'Artifact must be valid JSON object data.' );
        }

        return array(
            'artifact_class' => $artifact_class,
            'valid' => true,
            'artifact' => $artifact,
        );
    }

    private function invalidJsonReport( $artifact_class, $message ) {
        $event = 'visual_profile_package' === $artifact_class ? 'VISUAL_IMPORT_VALIDATION' : 'BINDING_IMPORT_VALIDATION';

        return array(
            'artifact_class' => $artifact_class,
            'valid' => false,
            'structural_status' => 'REJECTED',
            'error_code' => 'invalid_json',
            'message' => $message,
            'audit_record' => array(
                'event' => $event,
                'outcome' => 'REJECTED_INVALID_JSON',
            ),
        );
    }
}
