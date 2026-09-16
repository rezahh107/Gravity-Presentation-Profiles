<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierValueResolver;

final class BindingHealthService {
    private $bindings;
    private $visual;
    private $inventory;
    private $evaluator;

    public function __construct( BindingSetLifecycle $bindings, VisualPackageLifecycle $visual, GravityFormsFieldInventory $inventory, BindingHealthEvaluator $evaluator ) {
        $this->bindings = $bindings;
        $this->visual = $visual;
        $this->inventory = $inventory;
        $this->evaluator = $evaluator;
    }

    public static function forWordPress() {
        return new self(
            new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            ),
            new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) ),
            new GravityFormsFieldInventory(),
            new BindingHealthEvaluator()
        );
    }

    public function healthFacts() {
        $binding_state = $this->bindings->snapshot();
        $visual_state = $this->visual->snapshot();
        $contexts = array();

        foreach ( $binding_state['activations'] as $context_key => $activation ) {
            if ( ! isset( $activation['binding_set_id'], $activation['binding_set_version'] ) ) {
                continue;
            }
            $id = $activation['binding_set_id'];
            $version = $activation['binding_set_version'];
            if ( empty( $binding_state['installed'][ $id ][ $version ]['artifact'] ) ) {
                continue;
            }
            $record = $binding_state['installed'][ $id ][ $version ];
            if ( ! isset( $record['context_key'] ) || $record['context_key'] !== $context_key ) {
                continue;
            }
            $artifact = $record['artifact'];
            $form_id = $artifact['context']['form_source_ref']['form_id'];
            $inventory = $this->inventory->load( $form_id );
            $meanings = $this->semanticMeanings( $visual_state, $artifact['context']['surfaces'] );
            $contexts[] = array(
                'context_key' => $context_key,
                'binding_set_id' => $id,
                'binding_set_version' => $version,
                'form_id' => $form_id,
                'form_title' => $inventory['form_title'],
                'fields' => $inventory['fields'],
                'artifact' => $artifact,
                'facts' => $this->evaluator->evaluate( $artifact, $meanings, $inventory ),
            );
        }

        return array(
            'schema_version' => '1.0.0',
            'contexts' => $contexts,
        );
    }

    /**
     * Small support/diagnostics projection. It intentionally excludes host
     * display labels/titles, field inventories and all entry values. The
     * management UI uses healthFacts(); future support tooling should prefer
     * this narrower non-PII shape.
     */
    public function diagnosticFacts() {
        $health = $this->healthFacts();
        $contexts = array();

        foreach ( $health['contexts'] as $context ) {
            $facts = array();
            foreach ( $context['facts'] as $fact ) {
                $facts[] = array(
                    'semantic_slot_key' => $fact['semantic_slot_key'],
                    'status' => $fact['status'],
                    'reason' => $fact['reason'],
                    'binding_state' => $fact['binding_state'],
                    'source' => $this->diagnosticSource( $fact['source'] ),
                    'runtime_claims' => $fact['runtime_claims'],
                );
            }

            $contexts[] = array(
                'context_key' => $context['context_key'],
                'binding_set_id' => $context['binding_set_id'],
                'binding_set_version' => $context['binding_set_version'],
                'form_id' => $context['form_id'],
                'facts' => $facts,
            );
        }

        return array(
            'schema_version' => '1.0.0',
            'contexts' => $contexts,
        );
    }

    public function managementCandidates() {
        $health = $this->healthFacts();
        $repairs = array();
        foreach ( $health['contexts'] as $context ) {
            foreach ( $context['facts'] as $fact ) {
                if ( ! in_array(
                    $fact['status'],
                    array(
                        BindingHealthEvaluator::UNMAPPED,
                        BindingHealthEvaluator::STALE_SOURCE_MISSING,
                        BindingHealthEvaluator::EVIDENCE_NOT_PROVEN,
                        BindingHealthEvaluator::AMBIGUOUS_NEEDS_REVIEW,
                    ),
                    true
                ) ) {
                    continue;
                }
                if ( BindingHealthEvaluator::AMBIGUOUS_NEEDS_REVIEW === $fact['status'] && null === $fact['meaning'] ) {
                    continue;
                }
                if ( empty( $context['fields'] ) ) {
                    continue;
                }
                $repairs[] = array(
                    'context_key' => $context['context_key'],
                    'binding_set_id' => $context['binding_set_id'],
                    'binding_set_version' => $context['binding_set_version'],
                    'form_id' => $context['form_id'],
                    'form_title' => $context['form_title'],
                    'semantic_slot_key' => $fact['semantic_slot_key'],
                    // The Add-On renders this field as the visible repair identity.
                    // Prefix it with the same stable slot key carried separately in
                    // the actionable payload so descriptive package metadata can
                    // never present one slot while the submitted payload names another.
                    'meaning' => $this->managementIdentityLabel( $fact ),
                    'status' => $fact['status'],
                    'fields' => array_values( $context['fields'] ),
                );
            }
        }

        return array(
            'repairs' => $repairs,
            'rollbacks' => $this->rollbackCandidates(),
            'print_options' => $this->printOptionCandidates( $health ),
        );
    }

    private function managementIdentityLabel( $fact ) {
        $slot = isset( $fact['semantic_slot_key'] ) && is_string( $fact['semantic_slot_key'] )
            ? $fact['semantic_slot_key']
            : '';
        $meaning = isset( $fact['meaning'] ) && is_string( $fact['meaning'] )
            ? trim( $fact['meaning'] )
            : '';

        return '' === $meaning ? $slot : $slot . ' / ' . $meaning;
    }

    /**
     * Candidate Print option confirmations for already field-bound option slots.
     *
     * Each candidate pairs one canonical Print option with one real choice the
     * bound field currently defines. Every combination is offered so the
     * administrator states the meaning; nothing is ranked, matched or
     * pre-selected by label similarity.
     */
    private function printOptionCandidates( $health ) {
        $candidates = array();

        foreach ( $health['contexts'] as $context ) {
            $artifact = $context['artifact'];

            foreach ( PrintDossierValueResolver::optionGroups() as $slot_key => $canonical_options ) {
                $source = null;
                foreach ( $artifact['bindings'] as $binding ) {
                    if ( $binding['semantic_slot_key'] === $slot_key && 'PROVEN' === $binding['state'] ) {
                        $source = $binding['source_ref'];
                        break;
                    }
                }

                if ( null === $source || 'gravity_forms.field' !== $source['type'] ) {
                    continue;
                }

                $field_id = (string) $source['field_id'];
                if ( empty( $context['fields'][ $field_id ]['choices'] ) ) {
                    continue;
                }

                $candidates[] = array(
                    'context_key' => $context['context_key'],
                    'binding_set_id' => $context['binding_set_id'],
                    'binding_set_version' => $context['binding_set_version'],
                    'form_id' => $context['form_id'],
                    'form_title' => $context['form_title'],
                    'semantic_slot_key' => $slot_key,
                    'field_label' => $context['fields'][ $field_id ]['label'],
                    'canonical_options' => $canonical_options,
                    'choices' => $context['fields'][ $field_id ]['choices'],
                    'confirmed' => $this->confirmedPrintOptions( $artifact, $slot_key ),
                );
            }
        }

        return $candidates;
    }

    private function confirmedPrintOptions( $artifact, $slot_key ) {
        foreach ( $artifact['runtime_claims'] as $claim ) {
            if ( $claim['semantic_slot_key'] !== $slot_key || 'print_mapping' !== $claim['claim'] ) {
                continue;
            }
            if ( 'PROVEN' !== $claim['evidence_state'] || empty( $claim['print_option_map'] ) ) {
                return array();
            }

            $confirmed = array();
            foreach ( $claim['print_option_map'] as $pair ) {
                $confirmed[ $pair['canonical_option'] ] = $pair['host_raw_value'];
            }

            return $confirmed;
        }

        return array();
    }

    private function diagnosticSource( $source ) {
        if ( ! is_array( $source ) || empty( $source['type'] ) ) {
            return null;
        }

        $result = array( 'type' => $source['type'] );
        foreach ( array( 'field_id', 'meta_key', 'state_key', 'region_key', 'action_key' ) as $key ) {
            if ( isset( $source[ $key ] ) ) {
                $result[ $key ] = $source[ $key ];
                break;
            }
        }

        return $result;
    }

    private function rollbackCandidates() {
        $state = $this->bindings->snapshot();
        $active = $state['activations'];
        $seen = array();
        $result = array();

        foreach ( array_reverse( $state['audit'] ) as $record ) {
            if ( 'ACTIVATED' !== ( isset( $record['outcome'] ) ? $record['outcome'] : null ) ) {
                continue;
            }
            if ( empty( $record['context_key'] ) || empty( $record['binding_set_id'] ) || empty( $record['binding_set_version'] ) || empty( $record['content_hash'] ) ) {
                continue;
            }
            $context_key = $record['context_key'];
            $id = $record['binding_set_id'];
            $version = $record['binding_set_version'];
            if ( empty( $active[ $context_key ] ) || ! isset( $active[ $context_key ]['binding_set_id'], $active[ $context_key ]['binding_set_version'] ) ) {
                continue;
            }
            $current = $active[ $context_key ];
            if ( $current['binding_set_id'] === $id && $current['binding_set_version'] === $version ) {
                continue;
            }
            if ( empty( $state['installed'][ $id ][ $version ] ) ) {
                continue;
            }
            $installed = $state['installed'][ $id ][ $version ];
            if ( $installed['context_key'] !== $context_key || $installed['content_hash'] !== $record['content_hash'] ) {
                continue;
            }
            $key = $context_key . '|' . $id . '|' . $version;
            if ( isset( $seen[ $key ] ) ) {
                continue;
            }
            $seen[ $key ] = true;
            $form_id = $installed['artifact']['context']['form_source_ref']['form_id'];
            $inventory = $this->inventory->load( $form_id );
            $result[] = array(
                'context_key' => $context_key,
                'binding_set_id' => $id,
                'binding_set_version' => $version,
                'expected_binding_set_id' => $current['binding_set_id'],
                'expected_binding_set_version' => $current['binding_set_version'],
                'form_id' => $form_id,
                'form_title' => $inventory['form_title'],
            );
        }
        return $result;
    }

    private function semanticMeanings( $visual_state, $surfaces ) {
        $found = array();
        foreach ( $surfaces as $surface ) {
            if ( empty( $visual_state['activations'][ $surface ] ) ) {
                continue;
            }
            $activation = $visual_state['activations'][ $surface ];
            if ( empty( $activation['package_id'] ) || empty( $activation['package_version'] ) ) {
                continue;
            }
            $id = $activation['package_id'];
            $version = $activation['package_version'];
            if ( empty( $visual_state['installed'][ $id ][ $version ]['artifact']['semantic_slots'] ) ) {
                continue;
            }
            foreach ( $visual_state['installed'][ $id ][ $version ]['artifact']['semantic_slots'] as $slot ) {
                if ( empty( $slot['semantic_slot_key'] ) || ! isset( $slot['meaning'], $slot['surface_usage'] ) ) {
                    continue;
                }
                $used = false;
                foreach ( $slot['surface_usage'] as $usage ) {
                    if ( isset( $usage['surface'] ) && $usage['surface'] === $surface ) {
                        $used = true;
                        break;
                    }
                }
                if ( ! $used ) {
                    continue;
                }
                $key = $slot['semantic_slot_key'];
                if ( ! isset( $found[ $key ] ) ) {
                    $found[ $key ] = array();
                }
                $found[ $key ][ $slot['meaning'] ] = true;
            }
        }

        // If no active profile supplies a slot meaning, installed packages may
        // still provide authoritative metadata. Accept it only when every
        // installed package that uses the relevant surfaces agrees.
        $fallback_found = array();
        foreach ( $visual_state['installed'] as $versions ) {
            foreach ( $versions as $record ) {
                if ( empty( $record['artifact']['semantic_slots'] ) ) {
                    continue;
                }
                foreach ( $record['artifact']['semantic_slots'] as $slot ) {
                    if ( empty( $slot['semantic_slot_key'] ) || ! isset( $slot['meaning'], $slot['surface_usage'] ) ) {
                        continue;
                    }
                    $used = false;
                    foreach ( $slot['surface_usage'] as $usage ) {
                        if ( isset( $usage['surface'] ) && in_array( $usage['surface'], $surfaces, true ) ) {
                            $used = true;
                            break;
                        }
                    }
                    if ( ! $used ) {
                        continue;
                    }
                    $key = $slot['semantic_slot_key'];
                    if ( isset( $found[ $key ] ) ) {
                        continue;
                    }
                    if ( ! isset( $fallback_found[ $key ] ) ) {
                        $fallback_found[ $key ] = array();
                    }
                    $fallback_found[ $key ][ $slot['meaning'] ] = true;
                }
            }
        }
        foreach ( $fallback_found as $key => $values ) {
            $found[ $key ] = $values;
        }

        $meanings = array();
        foreach ( $found as $key => $values ) {
            $items = array_keys( $values );
            $meanings[ $key ] = 1 === count( $items ) ? $items[0] : $items;
        }
        return $meanings;
    }
}