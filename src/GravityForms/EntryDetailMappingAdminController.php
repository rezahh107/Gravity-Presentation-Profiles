<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;

/**
 * Owner-facing Entry Detail batch mapping inside the existing GPP Plugin
 * Settings renderer. Mapping mutation still crosses a dedicated admin-post
 * boundary so an Entry Detail mapping save cannot persist unrelated GF settings.
 */
final class EntryDetailMappingAdminController {
    const ACTION = 'gpp_entry_detail_mapping_save';
    const NONCE_ACTION = 'gpp_entry_detail_mapping_save';

    public static function register() {
        if ( function_exists( 'add_action' ) ) {
            add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle' ) );
        }
    }

    /**
     * Called by AddOn::settings_gpp_entry_detail_mapping() from the native
     * Gravity Forms Plugin Settings renderer. This intentionally emits no form:
     * the host already owns one outer settings form.
     */
    public static function renderEmbedded( $field = null ) {
        unset( $field );
        if ( ! class_exists( 'GFCommon' ) || ! \GFCommon::current_user_can_any( 'gravityforms_edit_settings' ) ) {
            return;
        }

        try {
            $facts = EntryDetailMappingService::forWordPress()->workflowFacts();
        } catch ( \Throwable $exception ) {
            echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'Entry Detail mapping is unavailable because the active profile or binding lifecycle could not be read.', 'gravity-presentation-profiles' ) . '</p></div>';
            return;
        }

        echo '<div class="gpp-entry-detail-mapping-workflow" data-gpp-entry-detail-mapping-workflow dir="rtl">';
        self::renderResultFeedback();
        echo '<p>' . esc_html__( 'این نگاشت مشترک است: تغییر منبع یک مفهوم می‌تواند روی همهٔ سطح‌های GPP که همان مفهوم را مصرف می‌کنند، از جمله Entry Detail، Inbox و Print، اثر بگذارد.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<p><small>' . esc_html__( 'Active Entry Detail profile:', 'gravity-presentation-profiles' ) . ' <bdi dir="ltr"><code>' . esc_html( $facts['profile']['package_id'] . '@' . $facts['profile']['package_version'] . ' / ' . $facts['profile']['profile_id'] ) . '</code></bdi></small></p>';

        if ( empty( $facts['contexts'] ) ) {
            echo '<p>' . esc_html__( 'No active Entry Detail environment binding context is available.', 'gravity-presentation-profiles' ) . '</p></div>';
            return;
        }

        foreach ( $facts['contexts'] as $context ) {
            self::renderContext( $facts['profile'], $context );
        }
        echo '</div>';
    }

    private static function renderResultFeedback() {
        $result = isset( $_GET['gpp_entry_detail_mapping_result'] ) && is_scalar( $_GET['gpp_entry_detail_mapping_result'] )
            ? trim( (string) ( function_exists( 'wp_unslash' ) ? wp_unslash( $_GET['gpp_entry_detail_mapping_result'] ) : $_GET['gpp_entry_detail_mapping_result'] ) )
            : '';

        if ( 'updated' === $result ) {
            echo '<div class="notice notice-success inline"><p>' . esc_html__( 'Entry Detail shared mappings were updated and one next immutable binding version was activated.', 'gravity-presentation-profiles' ) . '</p></div>';
        } elseif ( 'unchanged' === $result ) {
            echo '<div class="notice notice-info inline"><p>' . esc_html__( 'No shared mapping facts changed. No new binding version was created.', 'gravity-presentation-profiles' ) . '</p></div>';
        }
    }

    private static function renderContext( $profile, $context ) {
        $token = self::contextToken(
            array(
                'context_key' => $context['context_key'],
                'binding_set_id' => $context['binding_set_id'],
                'binding_set_version' => $context['binding_set_version'],
            )
        );
        $prefix = 'gpp_entry_detail_context[' . $token . ']';
        $nonce = wp_create_nonce( self::NONCE_ACTION . '|' . $context['context_key'] );
        $post_url = add_query_arg(
            array(
                'action' => self::ACTION,
                'gpp_entry_detail_context_token' => $token,
            ),
            admin_url( 'admin-post.php' )
        );
        $form_label = ! empty( $context['form_title'] )
            ? $context['form_title'] . ' (Form ' . $context['form_id'] . ')'
            : 'Form ' . $context['form_id'];

        echo '<section class="gpp-entry-detail-mapping-context" data-gpp-entry-detail-mapping-context="' . esc_attr( $token ) . '">';
        echo '<h4>' . esc_html( $form_label ) . '</h4>';
        echo '<p><small>' . esc_html__( 'Active shared binding:', 'gravity-presentation-profiles' ) . ' <bdi dir="ltr"><code>' . esc_html( $context['binding_set_id'] . '@' . $context['binding_set_version'] ) . '</code></bdi></small></p>';
        echo '<input type="hidden" name="' . esc_attr( $prefix . '[nonce]' ) . '" value="' . esc_attr( $nonce ) . '">';
        echo '<input type="hidden" name="' . esc_attr( $prefix . '[context_key]' ) . '" value="' . esc_attr( $context['context_key'] ) . '">';
        echo '<input type="hidden" name="' . esc_attr( $prefix . '[binding_set_id]' ) . '" value="' . esc_attr( $context['binding_set_id'] ) . '">';
        echo '<input type="hidden" name="' . esc_attr( $prefix . '[binding_set_version]' ) . '" value="' . esc_attr( $context['binding_set_version'] ) . '">';
        echo '<input type="hidden" name="' . esc_attr( $prefix . '[package_id]' ) . '" value="' . esc_attr( $profile['package_id'] ) . '">';
        echo '<input type="hidden" name="' . esc_attr( $prefix . '[package_version]' ) . '" value="' . esc_attr( $profile['package_version'] ) . '">';
        echo '<input type="hidden" name="' . esc_attr( $prefix . '[profile_id]' ) . '" value="' . esc_attr( $profile['profile_id'] ) . '">';

        echo '<div class="gpp-entry-detail-mapping-table-wrap" tabindex="0" role="region" aria-label="' . esc_attr__( 'Entry Detail semantic mapping table', 'gravity-presentation-profiles' ) . '">';
        echo '<table class="widefat striped"><thead><tr>';
        echo '<th scope="col">' . esc_html__( 'Meaning', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th scope="col">' . esc_html__( 'Completeness', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th scope="col">' . esc_html__( 'Current mapping / state', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th scope="col">' . esc_html__( 'Safe suggestion', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th scope="col">' . esc_html__( 'Gravity Forms field / input', 'gravity-presentation-profiles' ) . '</th>';
        echo '</tr></thead><tbody>';

        foreach ( $context['rows'] as $index => $row ) {
            $current_id = is_array( $row['source_ref'] ) && isset( $row['source_ref']['type'], $row['source_ref']['field_id'] ) && 'gravity_forms.field' === $row['source_ref']['type']
                ? (string) $row['source_ref']['field_id']
                : '';
            $valid_current = 'VALID' === $row['source_validity'];
            $select_id = 'gpp-entry-detail-' . $token . '-' . (int) $index;

            echo '<tr data-gpp-entry-detail-semantic="' . esc_attr( $row['semantic_slot_key'] ) . '">';
            echo '<td><strong>' . esc_html( $row['meaning'] ) . '</strong><br><small><bdi dir="ltr"><code>' . esc_html( $row['semantic_slot_key'] ) . '</code></bdi></small></td>';
            echo '<td><strong>' . esc_html( $row['required'] ? __( 'Required', 'gravity-presentation-profiles' ) : __( 'Optional', 'gravity-presentation-profiles' ) ) . '</strong></td>';
            echo '<td>' . self::currentMappingMarkup( $row ) . '</td>';
            echo '<td>' . self::suggestionMarkup( $row['suggestion'] ) . '</td>';
            echo '<td>';
            echo '<input type="hidden" name="' . esc_attr( $prefix . '[semantic][' . (int) $index . ']' ) . '" value="' . esc_attr( $row['semantic_slot_key'] ) . '">';
            echo '<label class="screen-reader-text" for="' . esc_attr( $select_id ) . '">' . esc_html( sprintf( __( 'Entry Detail mapping for %s', 'gravity-presentation-profiles' ), $row['meaning'] ) ) . '</label>';
            echo '<select id="' . esc_attr( $select_id ) . '" name="' . esc_attr( $prefix . '[field][' . (int) $index . ']' ) . '">';
            echo '<option value=""' . ( $valid_current ? '' : ' selected' ) . '>' . esc_html__( 'Leave unresolved / make no change', 'gravity-presentation-profiles' ) . '</option>';
            foreach ( $context['fields'] as $field ) {
                $field_id = (string) $field['field_id'];
                $label = sprintf(
                    __( 'Field/Input %1$s — %2$s (%3$s)', 'gravity-presentation-profiles' ),
                    $field_id,
                    $field['label'],
                    $field['type']
                );
                echo '<option value="' . esc_attr( $field_id ) . '"' . ( $valid_current && $field_id === $current_id ? ' selected' : '' ) . '>' . esc_html( $label ) . '</option>';
            }
            echo '</select></td></tr>';
        }
        echo '</tbody></table></div>';
        echo '<p class="description">' . esc_html__( 'Suggestions are evidence only and are never connected automatically. Saving re-validates the active binding and the current Gravity Forms field/input inventory.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<p><button type="submit" class="button button-primary" data-gpp-entry-detail-mapping-submit formaction="' . esc_url( $post_url ) . '" formmethod="post" formnovalidate>' . esc_html__( 'Save Entry Detail mappings once', 'gravity-presentation-profiles' ) . '</button></p>';
        echo '</section>';
    }

    private static function currentMappingMarkup( $row ) {
        if ( 'VALID' === $row['source_validity'] && is_array( $row['current_field'] ) ) {
            return '<strong>' . esc_html__( 'Mapped', 'gravity-presentation-profiles' ) . '</strong><br>' . esc_html(
                sprintf(
                    __( 'Field/Input %1$s — %2$s (%3$s)', 'gravity-presentation-profiles' ),
                    $row['current_field']['field_id'],
                    $row['current_field']['label'],
                    $row['current_field']['type']
                )
            );
        }
        if ( 'STALE_SOURCE_MISSING' === $row['source_validity'] ) {
            $field_id = is_array( $row['source_ref'] ) && isset( $row['source_ref']['field_id'] ) ? $row['source_ref']['field_id'] : '?';
            return '<strong>' . esc_html__( 'Stale / source missing', 'gravity-presentation-profiles' ) . '</strong><br><small><bdi dir="ltr"><code>' . esc_html( (string) $field_id ) . '</code></bdi></small>';
        }
        if ( 'UNRESOLVED' === $row['source_validity'] ) {
            return '<strong>' . esc_html__( 'Unmapped', 'gravity-presentation-profiles' ) . '</strong>';
        }
        return '<strong>' . esc_html__( 'Unsupported current source', 'gravity-presentation-profiles' ) . '</strong>';
    }

    private static function suggestionMarkup( $suggestion ) {
        if ( ! is_array( $suggestion ) || empty( $suggestion['field'] ) ) {
            return '<small>' . esc_html__( 'None — choose manually if needed.', 'gravity-presentation-profiles' ) . '</small>';
        }
        $field = $suggestion['field'];
        return esc_html(
            sprintf(
                __( 'Field/Input %1$s — %2$s (%3$s)', 'gravity-presentation-profiles' ),
                $field['field_id'],
                $field['label'],
                $field['type']
            )
        ) . '<br><small><bdi dir="ltr"><code>' . esc_html( $suggestion['evidence'] ) . '</code></bdi></small>';
    }

    public static function handle() {
        if ( ! class_exists( 'GFCommon' ) || ! \GFCommon::current_user_can_any( 'gravityforms_edit_settings' ) ) {
            wp_die( esc_html__( 'You are not allowed to change GPP semantic mappings.', 'gravity-presentation-profiles' ), '', array( 'response' => 403 ) );
        }

        try {
            $token = self::submittedContextToken();
            $submitted = self::submittedContext( $token );
            $expected = self::submittedIdentity( $submitted );
            if ( ! hash_equals( self::contextToken( $expected ), $token ) ) {
                throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'Entry Detail mapping context identity is invalid. Refresh and try again.' );
            }
            $nonce = isset( $submitted['nonce'] ) && is_scalar( $submitted['nonce'] ) ? (string) $submitted['nonce'] : '';
            if ( '' === $nonce || ! wp_verify_nonce( $nonce, self::NONCE_ACTION . '|' . $expected['context_key'] ) ) {
                throw new LifecycleException( 'entry_detail_mapping_invalid_nonce', 'Entry Detail mapping request expired. Refresh and try again.' );
            }

            $facts = EntryDetailMappingService::forWordPress()->workflowFacts();
            self::assertExpectedProfile( $facts['profile'], $expected );
            $context = self::expectedContext( $facts['contexts'], $expected );
            $allowed = array();
            foreach ( $context['rows'] as $row ) {
                $allowed[ $row['semantic_slot_key'] ] = true;
            }

            $semantic_values = isset( $submitted['semantic'] ) && is_array( $submitted['semantic'] ) ? $submitted['semantic'] : array();
            $field_values = isset( $submitted['field'] ) && is_array( $submitted['field'] ) ? $submitted['field'] : array();
            $mappings = array();
            $seen = array();
            foreach ( $semantic_values as $index => $slot_value ) {
                if ( ! is_scalar( $slot_value ) ) {
                    throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'A submitted semantic mapping is invalid.' );
                }
                $slot_key = trim( (string) $slot_value );
                if ( ! isset( $allowed[ $slot_key ] ) || isset( $seen[ $slot_key ] ) ) {
                    throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'The submitted semantic set does not match the active Entry Detail profile.' );
                }
                $seen[ $slot_key ] = true;
                $field_value = isset( $field_values[ $index ] ) && is_scalar( $field_values[ $index ] ) ? trim( (string) $field_values[ $index ] ) : '';
                if ( '' !== $field_value ) {
                    $mappings[] = array( 'semantic_slot_key' => $slot_key, 'field_id' => $field_value );
                }
            }

            $result = BindingBatchRepairService::forWordPress()->repairFields(
                array(
                    'context_key' => $expected['context_key'],
                    'binding_set_id' => $expected['binding_set_id'],
                    'binding_set_version' => $expected['binding_set_version'],
                    'mappings' => $mappings,
                )
            );
        } catch ( LifecycleException $exception ) {
            wp_die( esc_html( $exception->getMessage() ), esc_html__( 'Entry Detail mapping change rejected', 'gravity-presentation-profiles' ), array( 'response' => 409 ) );
        } catch ( \Throwable $exception ) {
            wp_die( esc_html__( 'Entry Detail mapping failed before authoritative binding state could be changed.', 'gravity-presentation-profiles' ), esc_html__( 'Entry Detail mapping change rejected', 'gravity-presentation-profiles' ), array( 'response' => 500 ) );
        }

        $status = isset( $result['status'] ) && BindingBatchRepairService::STATUS_UNCHANGED === $result['status'] ? 'unchanged' : 'updated';
        $redirect = add_query_arg(
            array(
                'page' => 'gf_settings',
                'subview' => 'gravity-presentation-profiles',
                'gpp_entry_detail_mapping_result' => $status,
            ),
            admin_url( 'admin.php' )
        );
        wp_safe_redirect( $redirect );
        exit;
    }

    private static function submittedContextToken() {
        $token = isset( $_REQUEST['gpp_entry_detail_context_token'] ) && is_scalar( $_REQUEST['gpp_entry_detail_context_token'] )
            ? trim( (string) ( function_exists( 'wp_unslash' ) ? wp_unslash( $_REQUEST['gpp_entry_detail_context_token'] ) : $_REQUEST['gpp_entry_detail_context_token'] ) )
            : '';
        if ( 1 !== preg_match( '/^[a-f0-9]{24}$/', $token ) ) {
            throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'Entry Detail mapping context token is invalid. Refresh and try again.' );
        }
        return $token;
    }

    private static function submittedContext( $token ) {
        $contexts = isset( $_POST['gpp_entry_detail_context'] ) && is_array( $_POST['gpp_entry_detail_context'] )
            ? ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_entry_detail_context'] ) : $_POST['gpp_entry_detail_context'] )
            : array();
        if ( ! isset( $contexts[ $token ] ) || ! is_array( $contexts[ $token ] ) ) {
            throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'Entry Detail mapping context payload is missing. Refresh and try again.' );
        }
        return $contexts[ $token ];
    }

    private static function submittedIdentity( $submitted ) {
        $keys = array( 'context_key', 'binding_set_id', 'binding_set_version', 'package_id', 'package_version', 'profile_id' );
        $result = array();
        foreach ( $keys as $key ) {
            if ( ! isset( $submitted[ $key ] ) || ! is_scalar( $submitted[ $key ] ) ) {
                throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'Entry Detail mapping identity is incomplete. Refresh and try again.' );
            }
            $result[ $key ] = trim( (string) $submitted[ $key ] );
            if ( '' === $result[ $key ] ) {
                throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'Entry Detail mapping identity is incomplete. Refresh and try again.' );
            }
        }
        return $result;
    }

    private static function contextToken( $identity ) {
        foreach ( array( 'context_key', 'binding_set_id', 'binding_set_version' ) as $key ) {
            if ( ! isset( $identity[ $key ] ) || ! is_scalar( $identity[ $key ] ) ) {
                return '';
            }
        }
        return substr(
            hash( 'sha256', implode( '|', array( (string) $identity['context_key'], (string) $identity['binding_set_id'], (string) $identity['binding_set_version'] ) ) ),
            0,
            24
        );
    }

    private static function assertExpectedProfile( $current, $expected ) {
        foreach ( array( 'package_id', 'package_version', 'profile_id' ) as $key ) {
            if ( ! isset( $current[ $key ] ) || $current[ $key ] !== $expected[ $key ] ) {
                throw new LifecycleException( 'entry_detail_mapping_profile_changed', 'The active Entry Detail profile changed after this page loaded. Reload before saving mappings.' );
            }
        }
    }

    private static function expectedContext( $contexts, $expected ) {
        foreach ( $contexts as $context ) {
            if ( $context['context_key'] !== $expected['context_key'] ) {
                continue;
            }
            if ( $context['binding_set_id'] !== $expected['binding_set_id'] || $context['binding_set_version'] !== $expected['binding_set_version'] ) {
                throw new LifecycleException( 'entry_detail_mapping_context_changed', 'The active EnvironmentBindingSet changed after this page loaded. Reload before saving mappings.' );
            }
            return $context;
        }
        throw new LifecycleException( 'entry_detail_mapping_context_changed', 'The active Entry Detail binding context changed after this page loaded. Reload before saving mappings.' );
    }
}
