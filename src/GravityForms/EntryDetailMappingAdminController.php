<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;

/**
 * Owner-facing Entry Detail mapping panel on the existing Gravity Forms GPP
 * settings tab. Mutation is an explicit admin-post with its own nonce and the
 * same Gravity Forms settings capability used by Mapping & Binding Health.
 */
final class EntryDetailMappingAdminController {
    const ACTION = 'gpp_entry_detail_mapping_save';
    const NONCE_ACTION = 'gpp_entry_detail_mapping_save';
    const NONCE_NAME = 'gpp_entry_detail_mapping_nonce';

    private static $base_settings_callback = null;

    public static function register() {
        if ( function_exists( 'add_filter' ) ) {
            add_filter(
                'gform_addon_app_settings_menu_gravity-presentation-profiles',
                array( __CLASS__, 'attachToSettingsTab' ),
                50
            );
        }
        if ( function_exists( 'add_action' ) ) {
            add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle' ) );
        }
    }

    /**
     * Keep the native Gravity Forms Add-On settings callback, then append this
     * workflow inside that same Settings tab. This avoids a second settings app
     * and avoids the unrelated admin_notices lifecycle.
     */
    public static function attachToSettingsTab( $tabs ) {
        if ( ! is_array( $tabs ) ) {
            return $tabs;
        }

        foreach ( $tabs as $index => $tab ) {
            if ( ! is_array( $tab ) || 'settings' !== ( isset( $tab['name'] ) ? $tab['name'] : null ) ) {
                continue;
            }

            $our_callback = array( __CLASS__, 'renderSettingsTab' );
            if ( isset( $tab['callback'] ) && $tab['callback'] !== $our_callback && is_callable( $tab['callback'] ) ) {
                self::$base_settings_callback = $tab['callback'];
            }
            $tabs[ $index ]['callback'] = $our_callback;
            break;
        }

        return $tabs;
    }

    public static function renderSettingsTab() {
        if ( is_callable( self::$base_settings_callback ) ) {
            call_user_func( self::$base_settings_callback );
        } elseif ( class_exists( __NAMESPACE__ . '\\AddOn' ) ) {
            $addon = AddOn::get_instance();
            if ( method_exists( $addon, 'app_settings_tab' ) ) {
                $addon->app_settings_tab();
            }
        }

        self::render();
    }

    public static function render() {
        if ( ! class_exists( 'GFCommon' ) || ! \GFCommon::current_user_can_any( 'gravityforms_edit_settings' ) ) {
            return;
        }

        try {
            $facts = EntryDetailMappingService::forWordPress()->workflowFacts();
        } catch ( \Throwable $exception ) {
            echo '<div class="notice notice-warning inline"><p>' . esc_html__( 'Entry Detail mapping is unavailable because the active profile or binding lifecycle could not be read.', 'gravity-presentation-profiles' ) . '</p></div>';
            return;
        }

        echo '<div class="gpp-entry-detail-mapping-workflow" data-gpp-entry-detail-mapping-workflow>';
        echo '<hr><h2>' . esc_html__( 'Entry Detail Mapping — Mapping & Binding Health', 'gravity-presentation-profiles' ) . '</h2>';
        self::renderResultFeedback();
        echo '<p>' . esc_html__( 'Field mapping is shared: choosing another Gravity Forms field changes the semantic source for every GPP surface that consumes that meaning, including Entry Detail, Inbox, and Print.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<p>' . esc_html__( 'Entry Detail visibility is separate from shared mapping. This build does not store a “Do not show in this view” preference because no admitted Entry Detail-only persistence seam exists yet.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<p><small>' . esc_html__( 'Active Entry Detail profile:', 'gravity-presentation-profiles' ) . ' <code>' . esc_html( $facts['profile']['package_id'] . '@' . $facts['profile']['package_version'] . ' / ' . $facts['profile']['profile_id'] ) . '</code></small></p>';

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
            echo '<div class="notice notice-success inline"><p>' . esc_html__( 'Entry Detail shared mappings were updated and the next immutable binding version was activated.', 'gravity-presentation-profiles' ) . '</p></div>';
        } elseif ( 'unchanged' === $result ) {
            echo '<div class="notice notice-info inline"><p>' . esc_html__( 'No shared mapping facts changed. No new binding version was created.', 'gravity-presentation-profiles' ) . '</p></div>';
        }
    }

    private static function renderContext( $profile, $context ) {
        $form_label = ! empty( $context['form_title'] )
            ? $context['form_title'] . ' (Form ' . $context['form_id'] . ')'
            : 'Form ' . $context['form_id'];

        echo '<hr><h3>' . esc_html( $form_label ) . '</h3>';
        echo '<p><small>' . esc_html__( 'Active shared binding:', 'gravity-presentation-profiles' ) . ' <code>' . esc_html( $context['binding_set_id'] . '@' . $context['binding_set_version'] ) . '</code></small></p>';
        echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION ) . '">';
        wp_nonce_field( self::NONCE_ACTION, self::NONCE_NAME );
        echo '<input type="hidden" name="gpp_entry_detail_context_key" value="' . esc_attr( $context['context_key'] ) . '">';
        echo '<input type="hidden" name="gpp_entry_detail_binding_set_id" value="' . esc_attr( $context['binding_set_id'] ) . '">';
        echo '<input type="hidden" name="gpp_entry_detail_binding_set_version" value="' . esc_attr( $context['binding_set_version'] ) . '">';
        echo '<input type="hidden" name="gpp_entry_detail_package_id" value="' . esc_attr( $profile['package_id'] ) . '">';
        echo '<input type="hidden" name="gpp_entry_detail_package_version" value="' . esc_attr( $profile['package_version'] ) . '">';
        echo '<input type="hidden" name="gpp_entry_detail_profile_id" value="' . esc_attr( $profile['profile_id'] ) . '">';
        echo '<table class="widefat striped"><thead><tr>';
        echo '<th>' . esc_html__( 'Entry Detail meaning', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Requirement', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Current shared mapping', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Safe suggestion', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Choose actual Gravity Forms field/input', 'gravity-presentation-profiles' ) . '</th>';
        echo '</tr></thead><tbody>';

        foreach ( $context['rows'] as $index => $row ) {
            $current_id = is_array( $row['source_ref'] ) && isset( $row['source_ref']['type'], $row['source_ref']['field_id'] ) && 'gravity_forms.field' === $row['source_ref']['type']
                ? (string) $row['source_ref']['field_id']
                : '';
            $valid_current = 'VALID' === $row['source_validity'];

            echo '<tr data-gpp-entry-detail-semantic="' . esc_attr( $row['semantic_slot_key'] ) . '">';
            echo '<td><strong>' . esc_html( $row['meaning'] ) . '</strong><br><small><code>' . esc_html( $row['semantic_slot_key'] ) . '</code></small></td>';
            echo '<td>' . esc_html( $row['required'] ? __( 'Required', 'gravity-presentation-profiles' ) : __( 'Optional', 'gravity-presentation-profiles' ) ) . '</td>';
            echo '<td>' . self::currentMappingMarkup( $row ) . '</td>';
            echo '<td>' . self::suggestionMarkup( $row['suggestion'] ) . '</td>';
            echo '<td>';
            echo '<input type="hidden" name="gpp_entry_detail_semantic[' . (int) $index . ']" value="' . esc_attr( $row['semantic_slot_key'] ) . '">';
            echo '<select name="gpp_entry_detail_field[' . (int) $index . ']" aria-label="' . esc_attr( sprintf( __( 'Entry Detail mapping for %s', 'gravity-presentation-profiles' ), $row['semantic_slot_key'] ) ) . '">';
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
        echo '</tbody></table>';
        echo '<p><button type="submit" class="button button-primary">' . esc_html__( 'Save Entry Detail mappings once', 'gravity-presentation-profiles' ) . '</button></p>';
        echo '</form>';
    }

    private static function currentMappingMarkup( $row ) {
        if ( 'VALID' === $row['source_validity'] && is_array( $row['current_field'] ) ) {
            return esc_html(
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
            return '<strong>' . esc_html__( 'Stale / missing source', 'gravity-presentation-profiles' ) . '</strong><br><small><code>' . esc_html( (string) $field_id ) . '</code></small>';
        }
        if ( 'UNRESOLVED' === $row['source_validity'] ) {
            return '<strong>' . esc_html__( 'UNBOUND / unresolved', 'gravity-presentation-profiles' ) . '</strong>';
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
        ) . '<br><small><code>' . esc_html( $suggestion['evidence'] ) . '</code></small>';
    }

    public static function handle() {
        if ( ! class_exists( 'GFCommon' ) || ! \GFCommon::current_user_can_any( 'gravityforms_edit_settings' ) ) {
            wp_die( esc_html__( 'You are not allowed to change GPP semantic mappings.', 'gravity-presentation-profiles' ), '', array( 'response' => 403 ) );
        }
        check_admin_referer( self::NONCE_ACTION, self::NONCE_NAME );

        try {
            $expected = self::submittedIdentity();
            $facts = EntryDetailMappingService::forWordPress()->workflowFacts();
            self::assertExpectedProfile( $facts['profile'], $expected );
            $context = self::expectedContext( $facts['contexts'], $expected );
            $allowed = array();
            foreach ( $context['rows'] as $row ) {
                $allowed[ $row['semantic_slot_key'] ] = true;
            }

            $semantic_values = isset( $_POST['gpp_entry_detail_semantic'] ) && is_array( $_POST['gpp_entry_detail_semantic'] )
                ? ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_entry_detail_semantic'] ) : $_POST['gpp_entry_detail_semantic'] )
                : array();
            $field_values = isset( $_POST['gpp_entry_detail_field'] ) && is_array( $_POST['gpp_entry_detail_field'] )
                ? ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_entry_detail_field'] ) : $_POST['gpp_entry_detail_field'] )
                : array();

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
                if ( '' === $field_value ) {
                    continue;
                }
                $mappings[] = array( 'semantic_slot_key' => $slot_key, 'field_id' => $field_value );
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
            wp_die( esc_html__( 'Entry Detail mapping failed before authoritative binding state could be changed.', 'gravity-presentation-profiles' ), esc_html__( 'Entry Detail mapping failed', 'gravity-presentation-profiles' ), array( 'response' => 500 ) );
        }

        $status = 'UNCHANGED' === $result['status'] ? 'unchanged' : 'updated';
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

    private static function submittedIdentity() {
        $keys = array(
            'context_key' => 'gpp_entry_detail_context_key',
            'binding_set_id' => 'gpp_entry_detail_binding_set_id',
            'binding_set_version' => 'gpp_entry_detail_binding_set_version',
            'package_id' => 'gpp_entry_detail_package_id',
            'package_version' => 'gpp_entry_detail_package_version',
            'profile_id' => 'gpp_entry_detail_profile_id',
        );
        $result = array();
        foreach ( $keys as $key => $post_name ) {
            if ( ! isset( $_POST[ $post_name ] ) || ! is_scalar( $_POST[ $post_name ] ) ) {
                throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'Entry Detail mapping identity is incomplete. Refresh and try again.' );
            }
            $value = function_exists( 'wp_unslash' ) ? wp_unslash( $_POST[ $post_name ] ) : $_POST[ $post_name ];
            $result[ $key ] = trim( (string) $value );
            if ( '' === $result[ $key ] ) {
                throw new LifecycleException( 'entry_detail_mapping_invalid_submission', 'Entry Detail mapping identity is incomplete. Refresh and try again.' );
            }
        }
        return $result;
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
