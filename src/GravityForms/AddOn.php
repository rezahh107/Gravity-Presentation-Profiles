<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\AssetResolver;
use GravityPresentationProfiles\Core\Authoring\GeneralLlmAuthoringPrompt;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeIncidentStore;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\PresentationResolver;
use GravityPresentationProfiles\ProfileCatalog;
use GravityPresentationProfiles\SRWF\GravityFlow\OperationsBindingManagementPolicy;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierValueResolver;

final class AddOn extends \GFAddOn {
    private static $_instance = null;
    private $visual_workflow = null;
    private $binding_health_service = null;
    private $binding_repair_service = null;
    private $inbox_setup_result = null;

    protected $_version     = '0.0.0-dev';
    protected $_slug        = 'gravity-presentation-profiles';
    protected $_path        = 'gravity-presentation-profiles/gravity-presentation-profiles.php';
    protected $_full_path   = __FILE__;
    protected $_title       = 'Gravity Presentation Profiles';
    protected $_short_title = 'Presentation Profiles';

    public static function get_instance() {
        if ( null === self::$_instance ) {
            self::$_instance = new self();
        }

        return self::$_instance;
    }

    public function plugin_settings_fields() {
        return array(
            array(
                'title'       => esc_html__( 'Declarative Profile Packages', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'Paste a validated GPP Profile Package JSON document and save settings to import it. Package JSON is validated and installed through the GPP lifecycle and is not retained as a second settings store.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'                => 'visual_profile_package_json',
                        'label'               => esc_html__( 'Profile Package JSON', 'gravity-presentation-profiles' ),
                        'type'                => 'textarea',
                        'class'               => 'large',
                        'callback'            => array( $this, 'settings_visual_profile_package_json' ),
                        'validation_callback' => array( $this, 'validate_visual_package_import' ),
                        'save_callback'       => array( $this, 'discard_visual_package_json' ),
                    ),
                    array(
                        'name'  => 'installed_visual_profiles',
                        'label' => esc_html__( 'Installed Gravity Forms profiles', 'gravity-presentation-profiles' ),
                        'type'  => 'gpp_visual_inventory',
                    ),
                ),
            ),
            array(
                'title'       => esc_html__( 'General LLM Authoring Prompt', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'Use the fixed GPP prompt with a general-purpose LLM outside this site, then paste only the resulting package JSON into the existing Profile Package JSON importer above. GPP does not contact an AI service or automatically send site data.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'  => 'general_llm_authoring_prompt',
                        'label' => esc_html__( 'Offline authoring prompt', 'gravity-presentation-profiles' ),
                        'type'  => 'gpp_general_llm_authoring_prompt',
                    ),
                ),
            ),
            array(
                'title'       => esc_html__( 'Operations Setup (Print)', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'Prepare Print presentation for one real Gravity Forms form. GPP installs the shipped operations package, adopts only the Print presentation profile, and creates the environment binding context with every canonical meaning left explicitly unmapped. GPP never guesses a field from its label, name or position: you map fields yourself below. Re-running this is safe; existing activations and repaired mappings are preserved, and a different existing activation is reported instead of replaced.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'  => 'operations_readiness',
                        'label' => esc_html__( 'Configuration readiness', 'gravity-presentation-profiles' ),
                        'type'  => 'gpp_operations_readiness',
                    ),
                    array(
                        'name'                => 'operations_setup_action',
                        'label'               => esc_html__( 'Initialize Print presentation', 'gravity-presentation-profiles' ),
                        'description'         => esc_html__( 'Choose the exact form this installation uses, then save settings. This action initializes Print only; the Inbox action below remains separate. The default performs no change.', 'gravity-presentation-profiles' ),
                        'type'                => 'select',
                        'choices'             => $this->operationsSetupChoices(),
                        'validation_callback' => array( $this, 'validate_operations_setup_action' ),
                        'save_callback'       => array( $this, 'discard_operations_setup_action' ),
                    ),
                ),
            ),
            array(
                'title'       => esc_html__( 'Operations Setup (Inbox)', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'Adopt the shipped SRWF Inbox presentation for one existing operations binding context. This action reuses the active EnvironmentBindingSet, verifies the admitted host sources, preserves Print, and never changes Gravity Flow assignment or authorization.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'                => 'inbox_setup_action',
                        'label'               => esc_html__( 'Initialize / Adopt Inbox presentation', 'gravity-presentation-profiles' ),
                        'description'         => esc_html__( 'Choose the exact existing operations form, then save settings. Required mappings are never guessed or auto-repaired. Re-running this action refreshes only legitimate source-bound readiness evidence and is idempotent when nothing changed.', 'gravity-presentation-profiles' ),
                        'type'                => 'select',
                        'choices'             => $this->operationsSetupChoices(),
                        'validation_callback' => array( $this, 'validate_inbox_setup_action' ),
                        'save_callback'       => array( $this, 'discard_inbox_setup_action' ),
                    ),
                    array(
                        'name'  => 'inbox_setup_feedback',
                        'label' => esc_html__( 'Inbox setup result', 'gravity-presentation-profiles' ),
                        'type'  => 'gpp_inbox_setup_feedback',
                    ),
                ),
            ),
            array(
                'title'       => esc_html__( 'Operations Setup (Entry Detail)', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'Adopt the shipped SRWF Entry Detail presentation for one existing operations binding context. GPP qualifies only admitted stable host sources, preserves Inbox and Print, and never records or grants Gravity Flow assignment, Approval permission, or request authorization.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'                => 'entry_detail_setup_action',
                        'label'               => esc_html__( 'Initialize / Adopt Entry Detail presentation', 'gravity-presentation-profiles' ),
                        'description'         => esc_html__( 'Choose the exact existing operations form, then save settings. Re-running this action is idempotent when the same stable host sources and Entry Detail activation are already authoritative. Gravity Flow still decides request-time Approval/current-assignee eligibility.', 'gravity-presentation-profiles' ),
                        'type'                => 'select',
                        'choices'             => $this->operationsSetupChoices(),
                        'validation_callback' => array( $this, 'validate_entry_detail_setup_action' ),
                        'save_callback'       => array( $this, 'discard_entry_detail_setup_action' ),
                    ),
                ),
            ),
            array(
                'title'       => esc_html__( 'Mapping & Binding Health', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'Map each admitted Gravity Forms-backed canonical meaning on its own row, apply that row explicitly, then review the resulting health. Not mapped is always explicit. Derived and host-managed meanings are shown without a misleading field selector. Every accepted change creates and conflict-safely activates a new immutable binding version.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'  => 'binding_health',
                        'label' => esc_html__( 'Current mapping health', 'gravity-presentation-profiles' ),
                        'type'  => 'gpp_binding_health',
                    ),
                    array(
                        'name'                => 'binding_management_action',
                        'label'               => esc_html__( 'Binding history rollback', 'gravity-presentation-profiles' ),
                        'description'         => esc_html__( 'Rollback is separate from normal row-by-row mapping. Choose one previously-authoritative immutable version only when you intentionally want to reactivate it. The default performs no binding change.', 'gravity-presentation-profiles' ),
                        'type'                => 'select',
                        'choices'             => $this->bindingRollbackChoices(),
                        'validation_callback' => array( $this, 'validate_binding_management_action' ),
                        'save_callback'       => array( $this, 'discard_binding_management_action' ),
                    ),
                ),
            ),
            array(
                'title'       => esc_html__( 'Diagnostics & Support', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'GPP keeps a small local record of recent presentation failures and degraded fail-closed decisions. Nothing is uploaded automatically. Download the sanitized JSON bundle only when you choose to share it with support or an external LLM.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'  => 'diagnostics',
                        'label' => esc_html__( 'Operational diagnostics', 'gravity-presentation-profiles' ),
                        'type'  => 'gpp_diagnostics',
                    ),
                ),
            ),
        );
    }

    public function init_admin() {
        parent::init_admin();
        add_action( 'admin_post_gpp_download_general_llm_authoring_prompt', array( $this, 'download_general_llm_authoring_prompt' ) );
        add_action( 'admin_post_gpp_download_support_bundle', array( $this, 'download_support_bundle' ) );
    }

    public function settings_gpp_general_llm_authoring_prompt( $field ) {
        unset( $field );
        $prompt = GeneralLlmAuthoringPrompt::contents();

        echo '<div data-gpp-general-llm-authoring-prompt="offline">';
        echo '<p>' . esc_html__( 'GPP does not contact an AI service. Copy or download this fixed prompt and use it in an external general-purpose LLM of your choice.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<p>' . esc_html__( 'Optional screenshots or design references are selected and shared by you directly with that external tool. GPP does not collect or attach site, form, entry, upload, credential or token data to this prompt.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<p>' . esc_html__( 'Bring only the resulting package JSON back to the Profile Package JSON field above. GPP treats that output as untrusted input and validates it through the existing package lifecycle before it can be installed.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<details><summary>' . esc_html__( 'Show prompt for copying', 'gravity-presentation-profiles' ) . '</summary>';
        echo '<textarea readonly rows="18" class="large-text code" data-gpp-general-llm-authoring-prompt-copyable>' . esc_textarea( $prompt ) . '</textarea>';
        echo '</details>';

        if ( function_exists( 'admin_url' ) && function_exists( 'wp_nonce_url' ) ) {
            $url = wp_nonce_url(
                admin_url( 'admin-post.php?action=gpp_download_general_llm_authoring_prompt' ),
                'gpp_download_general_llm_authoring_prompt'
            );
            echo '<p><a class="button button-secondary" data-gpp-general-llm-authoring-prompt-download href="' . esc_url( $url ) . '">';
            echo esc_html__( 'Download fixed authoring prompt', 'gravity-presentation-profiles' );
            echo '</a></p>';
        }
        echo '</div>';
    }

    public function download_general_llm_authoring_prompt() {
        if ( ! class_exists( 'GFCommon' ) || ! \GFCommon::current_user_can_any( 'gravityforms_edit_settings' ) ) {
            wp_die( esc_html__( 'You are not allowed to download the GPP authoring prompt.', 'gravity-presentation-profiles' ), '', array( 'response' => 403 ) );
        }
        check_admin_referer( 'gpp_download_general_llm_authoring_prompt' );

        if ( function_exists( 'nocache_headers' ) ) {
            nocache_headers();
        }
        header( 'Content-Type: text/markdown; charset=utf-8' );
        header( 'Content-Disposition: attachment; filename="' . GeneralLlmAuthoringPrompt::FILENAME . '"' );
        header( 'X-Content-Type-Options: nosniff' );
        echo GeneralLlmAuthoringPrompt::contents();
        exit;
    }

    public function settings_visual_profile_package_json( $field ) {
        if ( ! is_object( $field ) || ! method_exists( $field, 'get_value' ) ) {
            return '';
        }

        $value = $this->visualPackageJsonString( $field->get_value() );
        if ( null === $value ) {
            $value = '';
        }

        $description = method_exists( $field, 'get_description' ) ? $field->get_description() : '';
        $classes = method_exists( $field, 'get_container_classes' ) ? $field->get_container_classes() : '';
        $attributes = method_exists( $field, 'get_attributes' ) ? implode( ' ', $field->get_attributes() ) : '';
        $error_icon = method_exists( $field, 'get_error_icon' ) ? $field->get_error_icon() : '';
        $prefix = isset( $field->settings ) && is_object( $field->settings ) && method_exists( $field->settings, 'get_input_name_prefix' )
            ? $field->settings->get_input_name_prefix()
            : '_gform_setting';
        $name = isset( $field->name ) && is_string( $field->name ) ? $field->name : 'visual_profile_package_json';

        return $description . sprintf(
            '<span class="%s"><textarea name="%s_%s" %s>%s</textarea>%s</span>',
            esc_attr( $classes ),
            esc_attr( $prefix ),
            esc_attr( $name ),
            $attributes,
            esc_textarea( $value ),
            $error_icon
        );
    }

    public function validate_visual_package_import( $field, $value ) {
        $json = $this->visualPackageJsonString( $value );
        if ( null === $json ) {
            $this->setSettingsFieldError( $field, 'Profile Package JSON must be text or a decoded JSON object.' );
            return;
        }
        if ( '' === trim( $json ) ) {
            return;
        }

        $workflow   = $this->visualWorkflow();
        $validation = $workflow->validateVisualJson( $json );
        if ( ! $validation['valid'] ) {
            $this->setSettingsFieldError( $field, $validation['message'] );
            return;
        }

        try {
            $workflow->importVisualJson( $json );
        } catch ( LifecycleException $exception ) {
            $this->setSettingsFieldError( $field, $exception->getMessage() );
        }
    }

    public function discard_visual_package_json( $field, $value ) {
        unset( $field, $value );
        return '';
    }

    public function validate_binding_management_action( $field, $value ) {
        $row_submission = false;
        $row_token = isset( $_POST['gpp_binding_row_action'] ) && is_scalar( $_POST['gpp_binding_row_action'] )
            ? trim( (string) ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_binding_row_action'] ) : $_POST['gpp_binding_row_action'] ) )
            : '';

        if ( '' !== $row_token ) {
            $row_submission = true;
            $row_values = isset( $_POST['gpp_binding_row'] ) && is_array( $_POST['gpp_binding_row'] )
                ? ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_binding_row'] ) : $_POST['gpp_binding_row'] )
                : array();
            $encoded = isset( $row_values[ $row_token ] ) && is_scalar( $row_values[ $row_token ] )
                ? (string) $row_values[ $row_token ]
                : '';
            $row_action = $this->decodeBindingManagementAction( $encoded );
            if ( 1 !== preg_match( '/^[a-f0-9]{24}$/', $row_token ) || null === $row_action || $this->bindingRowToken( $row_action ) !== $row_token ) {
                $this->setSettingsFieldError( $field, 'The selected mapping row no longer matches its submitted action. Refresh the page and try again.' );
                return;
            }
            $value = $encoded;
        }

        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }

        $action = $this->decodeBindingManagementAction( $value );
        if ( null === $action || ( ! $row_submission && 'rollback' !== $action['action'] ) ) {
            $this->setSettingsFieldError( $field, 'The selected binding management action is invalid. Refresh the page and try again.' );
            return;
        }

        try {
            if ( in_array( $action['action'], array( 'repair', 'unmap' ), true ) ) {
                if ( OperationsBindingManagementPolicy::DIRECT_FIELD !== OperationsBindingManagementPolicy::kind( $action['semantic_slot_key'] ) ) {
                    throw new LifecycleException( 'mapping_slot_not_direct_field', 'This semantic meaning is not admitted as a direct Gravity Forms field mapping.' );
                }

                if ( 'repair' === $action['action'] ) {
                    $this->bindingRepairService()->repairField(
                        array(
                            'context_key' => $action['context_key'],
                            'binding_set_id' => $action['binding_set_id'],
                            'binding_set_version' => $action['binding_set_version'],
                            'semantic_slot_key' => $action['semantic_slot_key'],
                            'field_id' => $action['field_id'],
                        )
                    );
                } else {
                    $this->bindingRepairService()->unmapField(
                        array(
                            'context_key' => $action['context_key'],
                            'binding_set_id' => $action['binding_set_id'],
                            'binding_set_version' => $action['binding_set_version'],
                            'semantic_slot_key' => $action['semantic_slot_key'],
                        )
                    );
                }
                return;
            }

            if ( in_array( $action['action'], array( 'print_option', 'clear_print_option' ), true ) ) {
                if ( OperationsBindingManagementPolicy::DIRECT_FIELD !== OperationsBindingManagementPolicy::kind( $action['semantic_slot_key'] ) ) {
                    throw new LifecycleException( 'mapping_slot_not_direct_field', 'This Print meaning is not admitted as a direct Gravity Forms field mapping.' );
                }

                if ( 'print_option' === $action['action'] ) {
                    $this->bindingRepairService()->confirmPrintOption(
                        array(
                            'context_key' => $action['context_key'],
                            'binding_set_id' => $action['binding_set_id'],
                            'binding_set_version' => $action['binding_set_version'],
                            'semantic_slot_key' => $action['semantic_slot_key'],
                            'canonical_option' => $action['canonical_option'],
                            'host_raw_value' => $action['host_raw_value'],
                        )
                    );
                } else {
                    $this->bindingRepairService()->clearPrintOption(
                        array(
                            'context_key' => $action['context_key'],
                            'binding_set_id' => $action['binding_set_id'],
                            'binding_set_version' => $action['binding_set_version'],
                            'semantic_slot_key' => $action['semantic_slot_key'],
                            'canonical_option' => $action['canonical_option'],
                        )
                    );
                }
                return;
            }

            if ( 'rollback' === $action['action'] ) {
                $this->bindingRepairService()->rollback(
                    array(
                        'context_key' => $action['context_key'],
                        'binding_set_id' => $action['binding_set_id'],
                        'binding_set_version' => $action['binding_set_version'],
                        'expected_binding_set_id' => $action['expected_binding_set_id'],
                        'expected_binding_set_version' => $action['expected_binding_set_version'],
                    )
                );
                return;
            }

            $this->setSettingsFieldError( $field, 'The selected binding management action is not supported.' );
        } catch ( LifecycleException $exception ) {
            $this->setSettingsFieldError( $field, $exception->getMessage() );
        } catch ( \Throwable $exception ) {
            $this->setSettingsFieldError( $field, 'Binding management failed before the active mapping could be changed.' );
        }
    }

    public function discard_binding_management_action( $field, $value ) {
        unset( $field, $value );
        return '';
    }

    public function settings_gpp_visual_inventory( $field ) {
        unset( $field );

        try {
            $installed = $this->visualWorkflow()->visualProfilesForSurface( DeclarativePresentationResolver::SURFACE );
        } catch ( LifecycleException $exception ) {
            echo '<p>' . esc_html( $exception->getMessage() ) . '</p>';
            return;
        }

        if ( array() === $installed ) {
            echo '<p>' . esc_html__( 'No installed declarative Gravity Forms profiles.', 'gravity-presentation-profiles' ) . '</p>';
            return;
        }

        echo '<table class="widefat striped"><thead><tr>';
        echo '<th>' . esc_html__( 'Package', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Version', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Profile', 'gravity-presentation-profiles' ) . '</th>';
        echo '</tr></thead><tbody>';
        foreach ( $installed as $item ) {
            echo '<tr><td><code>' . esc_html( $item['package_id'] ) . '</code></td>';
            echo '<td><code>' . esc_html( $item['package_version'] ) . '</code></td>';
            echo '<td><code>' . esc_html( $item['profile_id'] ) . '</code></td></tr>';
        }
        echo '</tbody></table>';
    }

    /**
     * One explicit choice per real Gravity Forms form. There is no "detect my
     * form" option: an operator names the form, and nothing is inferred.
     */
    private function operationsSetupChoices() {
        $choices = array(
            array(
                'label' => esc_html__( 'No setup change', 'gravity-presentation-profiles' ),
                'value' => '',
            ),
        );

        if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_forms' ) ) {
            return $choices;
        }

        try {
            $forms = \GFAPI::get_forms();
        } catch ( \Throwable $exception ) {
            return $choices;
        }

        if ( ! is_array( $forms ) ) {
            return $choices;
        }

        foreach ( $forms as $form ) {
            if ( ! is_array( $form ) || empty( $form['id'] ) ) {
                continue;
            }

            $title = isset( $form['title'] ) && is_string( $form['title'] ) && '' !== trim( $form['title'] )
                ? trim( $form['title'] )
                : 'Form ' . $form['id'];

            $choices[] = array(
                'label' => sprintf(
                    __( 'Initialize for: %1$s (Form %2$d)', 'gravity-presentation-profiles' ),
                    $title,
                    (int) $form['id']
                ),
                'value' => 'form:' . (int) $form['id'],
            );
        }

        return $choices;
    }

    /**
     * Gravity Forms runs this only on its own settings save, which is a POST
     * that the Add-On Framework has already capability-checked and nonce-checked.
     * No state-changing GET path is introduced.
     */
    public function validate_operations_setup_action( $field, $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }

        if ( 1 !== preg_match( '/^form:([1-9][0-9]*)$/', trim( $value ), $matches ) ) {
            $this->setSettingsFieldError( $field, 'The selected operations setup action is invalid. Refresh the page and try again.' );
            return;
        }

        try {
            $result = OperationsSetupService::forWordPress()->initialize( array( 'form_id' => (int) $matches[1] ) );
        } catch ( LifecycleException $exception ) {
            $this->setSettingsFieldError( $field, $exception->getMessage() );
            return;
        } catch ( \Throwable $exception ) {
            $this->setSettingsFieldError( $field, 'Operations setup failed before any presentation state was changed.' );
            return;
        }

        if ( OperationsSetupService::STATUS_COMPLETED !== $result['status'] ) {
            $this->setSettingsFieldError( $field, $this->operationsSetupFailureMessage( $result ) );
        }
    }

    public function discard_operations_setup_action( $field, $value ) {
        unset( $field, $value );
        return '';
    }

    private function operationsSetupFailureMessage( $result ) {
        foreach ( $result['steps'] as $name => $step ) {
            if ( in_array( $step['outcome'], array( 'conflict', 'failed' ), true ) ) {
                $detail = ! empty( $step['message'] ) ? $step['message'] : $step['reason'];
                return sprintf(
                    __( 'Operations setup stopped at %1$s and changed nothing there: %2$s', 'gravity-presentation-profiles' ),
                    $name,
                    $detail
                );
            }
        }

        return __( 'Operations setup did not complete.', 'gravity-presentation-profiles' );
    }

    /**
     * Inbox setup uses the same Gravity Forms Add-On Framework settings-save
     * boundary as Print. Gravity Forms owns the capability and nonce checks for
     * this POST; GPP validates only the explicit selected-form action value.
     */
    public function validate_inbox_setup_action( $field, $value ) {
        $this->inbox_setup_result = null;

        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }

        if ( 1 !== preg_match( '/^form:([1-9][0-9]*)$/', trim( $value ), $matches ) ) {
            $this->setSettingsFieldError( $field, 'The selected Inbox setup action is invalid. Refresh the page and try again.' );
            return;
        }

        $form_id = (int) $matches[1];

        try {
            $result = InboxSetupService::forWordPress()->initialize( array( 'form_id' => $form_id ) );
        } catch ( LifecycleException $exception ) {
            $this->setSettingsFieldError( $field, $exception->getMessage() );
            return;
        } catch ( \Throwable $exception ) {
            $this->setSettingsFieldError( $field, 'Inbox setup failed before presentation state could be safely completed.' );
            return;
        }

        if ( InboxSetupService::STATUS_COMPLETED !== $result['status'] ) {
            $this->setSettingsFieldError( $field, $this->inboxSetupFailureMessage( $result ) );
            return;
        }

        $this->inbox_setup_result = array(
            'form_id' => $form_id,
            'form_label' => $this->setupFormLabel( $form_id ),
            'result' => $result,
        );
    }

    public function discard_inbox_setup_action( $field, $value ) {
        unset( $field, $value );
        return '';
    }

    public function settings_gpp_inbox_setup_feedback( $field ) {
        unset( $field );

        if ( ! is_array( $this->inbox_setup_result ) ) {
            echo '<p><small>' . esc_html__( 'No Inbox setup action has completed in this settings request.', 'gravity-presentation-profiles' ) . '</small></p>';
            return;
        }

        $label = $this->inbox_setup_result['form_label'];
        echo '<div class="notice notice-success inline" data-gpp-inbox-setup-result="completed">';
        echo '<p><strong>' . esc_html(
            sprintf(
                __( 'Inbox setup/adoption completed for %s.', 'gravity-presentation-profiles' ),
                $label
            )
        ) . '</strong></p>';
        echo '<p>' . esc_html__( 'The existing compatible EnvironmentBindingSet was reused, source-bound Inbox readiness was qualified where supported, and the current Print activation was preserved.', 'gravity-presentation-profiles' ) . '</p>';
        echo '</div>';
    }

    private function inboxSetupFailureMessage( $result ) {
        if ( ! empty( $result['steps'] ) && is_array( $result['steps'] ) ) {
            foreach ( $result['steps'] as $name => $step ) {
                $outcome = isset( $step['outcome'] ) ? $step['outcome'] : '';
                if ( ! in_array( $outcome, array( 'conflict', 'failed' ), true ) ) {
                    continue;
                }
                $detail = ! empty( $step['message'] ) ? $step['message'] : ( isset( $step['reason'] ) ? $step['reason'] : '' );
                if ( '' !== $detail ) {
                    return sprintf(
                        __( 'Inbox setup stopped at %1$s: %2$s', 'gravity-presentation-profiles' ),
                        $name,
                        $detail
                    );
                }
            }
        }

        return __( 'Inbox presentation setup did not complete.', 'gravity-presentation-profiles' );
    }

    /**
     * Entry Detail setup belongs to the same native Gravity Forms Add-On
     * settings-save boundary as Print and Inbox. The framework owns the page,
     * capability check and nonce; GPP owns only the selected-form validation
     * and its bounded lifecycle transition.
     */
    public function validate_entry_detail_setup_action( $field, $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }

        if ( 1 !== preg_match( '/^form:([1-9][0-9]*)$/', trim( $value ), $matches ) ) {
            $this->setSettingsFieldError( $field, 'The selected Entry Detail setup action is invalid. Refresh the page and try again.' );
            return;
        }

        $form_id = (int) $matches[1];

        try {
            $result = EntryDetailSetupService::forWordPress()->initialize( array( 'form_id' => $form_id ) );
        } catch ( LifecycleException $exception ) {
            try {
                EntryDetailSetupDiagnosticStore::forWordPress()->recordFailureReason( $form_id, $exception->reasonCode() );
            } catch ( \Throwable $diagnostic_exception ) {
                // Diagnostics are observational and never change setup outcome.
            }
            $this->setSettingsFieldError( $field, $exception->getMessage() );
            return;
        } catch ( \Throwable $exception ) {
            try {
                EntryDetailSetupDiagnosticStore::forWordPress()->recordUnexpectedFailure( $form_id );
            } catch ( \Throwable $diagnostic_exception ) {
                // Diagnostics are observational and never change setup outcome.
            }
            $this->setSettingsFieldError( $field, 'Entry Detail setup failed before presentation state could be safely completed.' );
            return;
        }

        try {
            EntryDetailSetupDiagnosticStore::forWordPress()->recordServiceResult( $form_id, $result );
        } catch ( \Throwable $diagnostic_exception ) {
            // Diagnostics are observational and never change setup outcome.
        }

        if ( EntryDetailSetupService::STATUS_COMPLETED !== $result['status'] ) {
            $this->setSettingsFieldError( $field, $this->entryDetailSetupFailureMessage( $result ) );
        }
    }

    public function discard_entry_detail_setup_action( $field, $value ) {
        unset( $field, $value );
        return '';
    }

    private function entryDetailSetupFailureMessage( $result ) {
        if ( ! empty( $result['steps'] ) && is_array( $result['steps'] ) ) {
            foreach ( $result['steps'] as $name => $step ) {
                $outcome = isset( $step['outcome'] ) ? $step['outcome'] : '';
                if ( ! in_array( $outcome, array( 'conflict', 'failed' ), true ) ) {
                    continue;
                }
                $detail = ! empty( $step['message'] ) ? $step['message'] : ( isset( $step['reason'] ) ? $step['reason'] : '' );
                if ( '' !== $detail ) {
                    return sprintf(
                        __( 'Entry Detail setup stopped at %1$s: %2$s', 'gravity-presentation-profiles' ),
                        $name,
                        $detail
                    );
                }
            }
        }

        return __( 'Entry Detail presentation setup did not complete.', 'gravity-presentation-profiles' );
    }

    private function setupFormLabel( $form_id ) {
        if ( class_exists( 'GFAPI' ) && method_exists( 'GFAPI', 'get_form' ) ) {
            try {
                $form = \GFAPI::get_form( $form_id );
                if ( is_array( $form ) && isset( $form['title'] ) && is_string( $form['title'] ) && '' !== trim( $form['title'] ) ) {
                    return sprintf( '%s (Form %d)', trim( $form['title'] ), $form_id );
                }
            } catch ( \Throwable $exception ) {
                // The explicit form ID remains enough for safe bounded feedback.
            }
        }

        return sprintf( __( 'Form %d', 'gravity-presentation-profiles' ), $form_id );
    }

    public function settings_gpp_operations_readiness( $field ) {
        unset( $field );

        echo '<div data-gpp-operations-readiness="configuration">';
        echo '<p>' . esc_html__( 'These are configuration facts only. They never state that a person may print. Gravity Flow decides Print authorization for this user, this entry, this workflow step and this request, every request.', 'gravity-presentation-profiles' ) . '</p>';

        try {
            $facts = OperationsSetupService::forWordPress()->readiness();
        } catch ( \Throwable $exception ) {
            echo '<p>' . esc_html__( 'Operations readiness is unavailable because the authoritative lifecycle state could not be read.', 'gravity-presentation-profiles' ) . '</p></div>';
            return;
        }

        $activation_labels = array(
            'not_activated' => __( 'Not activated yet', 'gravity-presentation-profiles' ),
            'active_operations_profile' => __( 'Active (operations Print profile)', 'gravity-presentation-profiles' ),
            'active_other_profile' => __( 'Active (a different profile; setup will not replace it)', 'gravity-presentation-profiles' ),
        );
        $activation = isset( $activation_labels[ $facts['print_surface_activation'] ] )
            ? $activation_labels[ $facts['print_surface_activation'] ]
            : $facts['print_surface_activation'];

        echo '<table class="widefat striped"><tbody>';
        $this->readinessRow( __( 'Operations package present', 'gravity-presentation-profiles' ), $facts['operations_package_present'] );
        echo '<tr><td>' . esc_html__( 'Print surface activation', 'gravity-presentation-profiles' ) . '</td>';
        echo '<td>' . esc_html( $activation ) . '</td></tr>';
        echo '<tr><td>' . esc_html__( 'Required Print assets', 'gravity-presentation-profiles' ) . '</td><td>';
        if ( ! empty( $facts['print_assets']['ready'] ) ) {
            echo esc_html__( 'Present and unmodified', 'gravity-presentation-profiles' );
        } else {
            echo '<code>' . esc_html( (string) $facts['print_assets']['reason'] ) . '</code>';
            foreach ( $facts['print_assets']['assets'] as $name => $asset ) {
                echo '<br><small><code>' . esc_html( $name . ': ' . $asset['status'] ) . '</code></small>';
            }
        }
        echo '</td></tr>';
        echo '<tr><td>' . esc_html__( 'Print request authorization', 'gravity-presentation-profiles' ) . '</td>';
        echo '<td>' . esc_html__( 'Checked by Gravity Flow on every request; never cached here.', 'gravity-presentation-profiles' ) . '</td></tr>';
        echo '</tbody></table>';

        foreach ( $facts['notes'] as $note ) {
            echo '<p><small><code>' . esc_html( $note ) . '</code></small></p>';
        }
        echo '</div>';
    }

    private function readinessRow( $label, $value ) {
        echo '<tr><td>' . esc_html( $label ) . '</td><td>';
        echo esc_html( $value ? __( 'Yes', 'gravity-presentation-profiles' ) : __( 'No', 'gravity-presentation-profiles' ) );
        echo '</td></tr>';
    }

    public function settings_gpp_binding_health( $field ) {
        unset( $field );
        try {
            $health = $this->bindingHealthService()->healthFacts();
        } catch ( \Throwable $exception ) {
            echo '<p>' . esc_html__( 'Binding health is unavailable because the authoritative lifecycle or host field inventory could not be read.', 'gravity-presentation-profiles' ) . '</p>';
            return;
        }

        if ( empty( $health['contexts'] ) ) {
            echo '<p>' . esc_html__( 'No active environment binding contexts are installed.', 'gravity-presentation-profiles' ) . '</p>';
            return;
        }

        foreach ( $health['contexts'] as $context ) {
            $form_name = ! empty( $context['form_title'] ) ? $context['form_title'] : sprintf( __( 'Form %s', 'gravity-presentation-profiles' ), $context['form_id'] );
            echo '<h4>' . esc_html( $form_name ) . '</h4>';
            echo '<p><small>' . esc_html__( 'Active binding version:', 'gravity-presentation-profiles' ) . ' <code>' . esc_html( $context['binding_set_id'] . '@' . $context['binding_set_version'] ) . '</code></small></p>';
            echo '<table class="widefat striped" data-gpp-binding-management><thead><tr>';
            echo '<th>' . esc_html__( 'Canonical meaning', 'gravity-presentation-profiles' ) . '</th>';
            echo '<th>' . esc_html__( 'Current host source', 'gravity-presentation-profiles' ) . '</th>';
            echo '<th>' . esc_html__( 'Health', 'gravity-presentation-profiles' ) . '</th>';
            echo '<th>' . esc_html__( 'Mapping', 'gravity-presentation-profiles' ) . '</th>';
            echo '</tr></thead><tbody>';
            foreach ( $context['facts'] as $fact ) {
                $meaning = null !== $fact['meaning'] ? $fact['meaning'] : __( 'Authoritative meaning unavailable', 'gravity-presentation-profiles' );
                echo '<tr data-gpp-semantic-slot="' . esc_attr( $fact['semantic_slot_key'] ) . '"><td><code>' . esc_html( $fact['semantic_slot_key'] ) . '</code>';
                echo '<br><small>' . esc_html( $meaning ) . '</small></td>';
                echo '<td>' . $this->bindingSourceMarkup( $fact['source'] ) . '</td>';
                echo '<td><strong>' . esc_html( $this->bindingHealthLabel( $fact['status'] ) ) . '</strong>';
                if ( ! empty( $fact['reason'] ) ) {
                    echo '<br><small><code>' . esc_html( $fact['reason'] ) . '</code></small>';
                }
                echo '</td><td>' . $this->bindingManagementMarkup( $context, $fact ) . '</td></tr>';
            }
            echo '</tbody></table>';
        }
    }

    private function bindingManagementMarkup( $context, $fact ) {
        $kind = OperationsBindingManagementPolicy::kind( $fact['semantic_slot_key'] );
        if ( OperationsBindingManagementPolicy::DERIVED === $kind ) {
            $components = OperationsBindingManagementPolicy::derivationComponents( $fact['semantic_slot_key'] );
            return esc_html__( 'Derived from', 'gravity-presentation-profiles' ) . ' <code>'
                . implode( '</code> + <code>', array_map( 'esc_html', $components ) ) . '</code>';
        }

        if ( OperationsBindingManagementPolicy::DIRECT_FIELD !== $kind ) {
            return '<small>' . esc_html__( 'Managed by its host adapter or semantic contract; no arbitrary Gravity Forms field selector is admitted here.', 'gravity-presentation-profiles' ) . '</small>';
        }

        if ( null === $fact['meaning'] ) {
            return '<small>' . esc_html__( 'Field mapping is disabled until this semantic meaning has one unambiguous authoritative definition.', 'gravity-presentation-profiles' ) . '</small>';
        }

        $common = array(
            'context_key' => $context['context_key'],
            'binding_set_id' => $context['binding_set_id'],
            'binding_set_version' => $context['binding_set_version'],
            'semantic_slot_key' => $fact['semantic_slot_key'],
        );
        $unmap = array_merge( array( 'action' => 'unmap' ), $common );
        $token = $this->bindingRowToken( $unmap );
        $current_field_id = is_array( $fact['source'] ) && isset( $fact['source']['type'], $fact['source']['field_id'] ) && 'gravity_forms.field' === $fact['source']['type']
            ? (string) $fact['source']['field_id']
            : null;
        $has_current = null !== $current_field_id && isset( $context['fields'][ $current_field_id ] );

        $html = '<div class="gpp-binding-row-control">';
        $html .= '<select name="gpp_binding_row[' . esc_attr( $token ) . ']" aria-label="' . esc_attr( sprintf( __( 'Mapping for %s', 'gravity-presentation-profiles' ), $fact['semantic_slot_key'] ) ) . '">';
        if ( null !== $current_field_id && ! $has_current ) {
            $html .= '<option value="" selected disabled>' . esc_html( sprintf( __( 'Current Field %s is missing — choose explicitly', 'gravity-presentation-profiles' ), $current_field_id ) ) . '</option>';
        }
        $html .= '<option value="' . esc_attr( $this->encodeBindingManagementAction( $unmap ) ) . '"' . ( null === $current_field_id ? ' selected' : '' ) . '>' . esc_html__( 'Not mapped', 'gravity-presentation-profiles' ) . '</option>';
        foreach ( $context['fields'] as $host_field ) {
            $repair = array_merge(
                array( 'action' => 'repair' ),
                $common,
                array( 'field_id' => $host_field['field_id'] )
            );
            $label = sprintf(
                __( 'Field %1$s — %2$s (%3$s)', 'gravity-presentation-profiles' ),
                $host_field['field_id'],
                $host_field['label'],
                $host_field['type']
            );
            $html .= '<option value="' . esc_attr( $this->encodeBindingManagementAction( $repair ) ) . '"'
                . ( $has_current && (string) $host_field['field_id'] === $current_field_id ? ' selected' : '' ) . '>'
                . esc_html( $label ) . '</option>';
        }
        $html .= '</select> ';
        $html .= '<button type="submit" class="button button-secondary" name="gpp_binding_row_action" value="' . esc_attr( $token ) . '">' . esc_html__( 'Apply mapping', 'gravity-presentation-profiles' ) . '</button>';
        $html .= '</div>';
        $html .= $this->printOptionManagementMarkup( $context, $fact );
        return $html;
    }

    private function printOptionManagementMarkup( $context, $fact ) {
        $groups = PrintDossierValueResolver::optionGroups();
        $slot = $fact['semantic_slot_key'];
        if ( empty( $groups[ $slot ] ) || ! is_array( $fact['source'] ) || 'gravity_forms.field' !== ( isset( $fact['source']['type'] ) ? $fact['source']['type'] : null ) ) {
            return '';
        }

        $field_id = (string) $fact['source']['field_id'];
        if ( empty( $context['fields'][ $field_id ]['choices'] ) ) {
            return '';
        }
        $choices = $context['fields'][ $field_id ]['choices'];
        $confirmed = $this->confirmedPrintOptionMap( $context['artifact'], $slot );
        $common = array(
            'context_key' => $context['context_key'],
            'binding_set_id' => $context['binding_set_id'],
            'binding_set_version' => $context['binding_set_version'],
            'semantic_slot_key' => $slot,
        );

        $html = '<div class="gpp-print-option-mapping"><p><small><strong>' . esc_html__( 'Print choice meaning', 'gravity-presentation-profiles' ) . '</strong> — '
            . esc_html__( 'Confirm real raw host values explicitly; no labels are guessed.', 'gravity-presentation-profiles' ) . '</small></p>';
        foreach ( $groups[ $slot ] as $canonical_option ) {
            $clear = array_merge(
                array( 'action' => 'clear_print_option' ),
                $common,
                array( 'canonical_option' => $canonical_option )
            );
            $token = $this->bindingRowToken( $clear );
            $selected_raw = isset( $confirmed[ $canonical_option ] ) ? (string) $confirmed[ $canonical_option ] : null;
            $html .= '<div class="gpp-print-option-row"><code>' . esc_html( $canonical_option ) . '</code> → ';
            $html .= '<select name="gpp_binding_row[' . esc_attr( $token ) . ']" aria-label="' . esc_attr( sprintf( __( 'Print mapping for %1$s %2$s', 'gravity-presentation-profiles' ), $slot, $canonical_option ) ) . '">';
            $html .= '<option value="' . esc_attr( $this->encodeBindingManagementAction( $clear ) ) . '"' . ( null === $selected_raw ? ' selected' : '' ) . '>' . esc_html__( 'Not confirmed', 'gravity-presentation-profiles' ) . '</option>';
            foreach ( $choices as $choice ) {
                $confirm = array_merge(
                    array( 'action' => 'print_option' ),
                    $common,
                    array(
                        'canonical_option' => $canonical_option,
                        'host_raw_value' => $choice['value'],
                    )
                );
                $choice_label = sprintf( __( '%1$s — raw: %2$s', 'gravity-presentation-profiles' ), $choice['text'], $choice['value'] );
                $html .= '<option value="' . esc_attr( $this->encodeBindingManagementAction( $confirm ) ) . '"'
                    . ( null !== $selected_raw && $selected_raw === (string) $choice['value'] ? ' selected' : '' ) . '>'
                    . esc_html( $choice_label ) . '</option>';
            }
            $html .= '</select> ';
            $html .= '<button type="submit" class="button button-secondary" name="gpp_binding_row_action" value="' . esc_attr( $token ) . '">' . esc_html__( 'Apply Print meaning', 'gravity-presentation-profiles' ) . '</button></div>';
        }
        $html .= '</div>';
        return $html;
    }

    private function confirmedPrintOptionMap( $artifact, $semantic_slot_key ) {
        if ( empty( $artifact['runtime_claims'] ) ) {
            return array();
        }
        foreach ( $artifact['runtime_claims'] as $claim ) {
            if ( $claim['semantic_slot_key'] !== $semantic_slot_key || 'print_mapping' !== $claim['claim'] || 'PROVEN' !== $claim['evidence_state'] || empty( $claim['print_option_map'] ) ) {
                continue;
            }
            $map = array();
            foreach ( $claim['print_option_map'] as $pair ) {
                if ( isset( $pair['canonical_option'], $pair['host_raw_value'] ) ) {
                    $map[ $pair['canonical_option'] ] = (string) $pair['host_raw_value'];
                }
            }
            return $map;
        }
        return array();
    }

    public function settings_gpp_diagnostics( $field ) {
        unset( $field );
        echo '<div data-gpp-diagnostics="local">';
        echo '<p>' . esc_html__( 'These records contain GPP decision facts only. Submitted form values, uploaded file names/content, cookies, tokens, credentials and request payloads are not collected.', 'gravity-presentation-profiles' ) . '</p>';

        try {
            $state = RuntimeIncidentStore::forWordPress()->snapshot();
            $incidents = array_reverse( $state['incidents'] );
        } catch ( \Throwable $exception ) {
            echo '<p><strong>' . esc_html__( 'Local diagnostics storage is currently unavailable. GPP presentation and native host fallback continue normally.', 'gravity-presentation-profiles' ) . '</strong></p>';
            $incidents = array();
        }

        if ( empty( $incidents ) ) {
            echo '<p>' . esc_html__( 'No recent GPP failure or degraded presentation decision is stored.', 'gravity-presentation-profiles' ) . '</p>';
        } else {
            echo '<table class="widefat striped"><thead><tr>';
            echo '<th>' . esc_html__( 'Observed', 'gravity-presentation-profiles' ) . '</th>';
            echo '<th>' . esc_html__( 'Affected surface', 'gravity-presentation-profiles' ) . '</th>';
            echo '<th>' . esc_html__( 'What happened', 'gravity-presentation-profiles' ) . '</th>';
            echo '<th>' . esc_html__( 'Safe fallback', 'gravity-presentation-profiles' ) . '</th>';
            echo '</tr></thead><tbody>';
            foreach ( array_slice( $incidents, 0, 10 ) as $record ) {
                $event = $this->materialDiagnosticEvent( $record );
                echo '<tr><td><code>' . esc_html( $record['observed_at_utc'] ) . '</code></td>';
                echo '<td>' . esc_html( RuntimeDecisionTrace::surfaceLabel( $record['surface'] ) ) . '</td>';
                echo '<td><strong>' . esc_html( RuntimeDecisionTrace::stageLabel( $event['stage'] ) ) . '</strong>';
                if ( ! empty( $event['reason_code'] ) ) {
                    echo '<br><small>' . esc_html__( 'Reason:', 'gravity-presentation-profiles' ) . ' <code>' . esc_html( $event['reason_code'] ) . '</code></small>';
                }
                echo '</td><td>';
                if ( ! empty( $event['fallback'] ) ) {
                    echo esc_html( RuntimeDecisionTrace::fallbackLabel( $event['fallback'] ) );
                    echo '<br><small><code>' . esc_html( $event['fallback'] ) . '</code></small>';
                } else {
                    echo esc_html__( 'No additional GPP fallback action recorded.', 'gravity-presentation-profiles' );
                }
                echo '</td></tr>';
            }
            echo '</tbody></table>';
        }

        if ( function_exists( 'admin_url' ) && function_exists( 'wp_nonce_url' ) ) {
            $url = wp_nonce_url(
                admin_url( 'admin-post.php?action=gpp_download_support_bundle' ),
                'gpp_download_support_bundle'
            );
            echo '<p><a class="button button-secondary" data-gpp-support-bundle-download href="' . esc_url( $url ) . '">';
            echo esc_html__( 'Download sanitized support bundle (JSON)', 'gravity-presentation-profiles' );
            echo '</a></p>';
        }
        echo '</div>';
    }

    public function download_support_bundle() {
        if ( ! class_exists( 'GFCommon' ) || ! \GFCommon::current_user_can_any( 'gravityforms_edit_settings' ) ) {
            wp_die( esc_html__( 'You are not allowed to download GPP diagnostics.', 'gravity-presentation-profiles' ), '', array( 'response' => 403 ) );
        }
        check_admin_referer( 'gpp_download_support_bundle' );

        try {
            $json = SupportBundleBuilder::forWordPress()->json();
        } catch ( \Throwable $exception ) {
            wp_die( esc_html__( 'GPP could not build the local support bundle.', 'gravity-presentation-profiles' ), '', array( 'response' => 500 ) );
        }

        if ( function_exists( 'nocache_headers' ) ) {
            nocache_headers();
        }
        header( 'Content-Type: application/json; charset=utf-8' );
        header( 'Content-Disposition: attachment; filename="gpp-support-bundle.json"' );
        header( 'X-Content-Type-Options: nosniff' );
        echo $json;
        exit;
    }

    public function form_settings_fields( $form ) {
        $profile_choices = array(
            array(
                'label' => esc_html__( 'Select a profile', 'gravity-presentation-profiles' ),
                'value' => '',
            ),
        );

        foreach ( ProfileCatalog::create()->all() as $profile ) {
            $profile_choices[] = array(
                'label' => esc_html__( $profile->label(), 'gravity-presentation-profiles' ),
                'value' => $profile->key(),
            );
        }

        $declarative_choices = array(
            array(
                'label' => esc_html__( 'Use legacy profile selection', 'gravity-presentation-profiles' ),
                'value' => '',
            ),
        );
        try {
            foreach ( ( new DeclarativePresentationResolver( $this->visualWorkflow() ) )->choices() as $choice ) {
                $declarative_choices[] = array(
                    'label' => esc_html( $choice['label'] ),
                    'value' => $choice['value'],
                );
            }
        } catch ( LifecycleException $exception ) {
            $declarative_choices[] = array(
                'label' => esc_html__( 'Installed profile catalog unavailable', 'gravity-presentation-profiles' ),
                'value' => '',
            );
        }

        return array(
            array(
                'title'  => esc_html__( 'Gravity Presentation Profiles', 'gravity-presentation-profiles' ),
                'fields' => array(
                    array(
                        'label'   => esc_html__( 'Enable', 'gravity-presentation-profiles' ),
                        'type'    => 'checkbox',
                        'name'    => 'enabled',
                        'choices' => array(
                            array(
                                'label' => esc_html__( 'Enable Gravity Presentation Profiles for this form', 'gravity-presentation-profiles' ),
                                'name'  => 'enabled',
                            ),
                        ),
                    ),
                    array(
                        'label'       => esc_html__( 'Installed declarative profile', 'gravity-presentation-profiles' ),
                        'description' => esc_html__( 'Selects one exact installed package version and profile for this form. A declarative selection takes precedence over the legacy profile field and fails closed if it can no longer be resolved.', 'gravity-presentation-profiles' ),
                        'type'        => 'select',
                        'name'        => 'declarative_profile',
                        'choices'     => $declarative_choices,
                    ),
                    array(
                        'label'   => esc_html__( 'Legacy profile', 'gravity-presentation-profiles' ),
                        'type'    => 'select',
                        'name'    => 'profile',
                        'choices' => $profile_choices,
                    ),
                ),
            ),
        );
    }

    public function init_frontend() {
        parent::init_frontend();

        add_action( 'gform_enqueue_scripts', array( $this, 'enqueue_form_assets' ), 10, 2 );
        add_filter( 'gform_pre_render', array( $this, 'add_form_state_css_classes' ), 10, 1 );
    }

    public function resolve_form_state( $form ) {
        $settings = $this->get_form_settings( $form );
        $settings = is_array( $settings ) ? $settings : array();

        if ( DeclarativePresentationResolver::hasSelection( $settings ) ) {
            $state = ( new DeclarativePresentationResolver( $this->visualWorkflow() ) )->resolve( $settings );
        } else {
            $state = ( new PresentationResolver() )->resolve( $settings, ProfileCatalog::create() );
        }

        if ( $state->isActive() ) {
            RuntimeDiagnostics::recordOnce(
                DeclarativePresentationResolver::SURFACE,
                'GF_PROFILE_SELECTION',
                RuntimeDecisionTrace::RESULT_PASS
            );
        } elseif ( 'disabled' === $state->reason() ) {
            RuntimeDiagnostics::recordOnce(
                DeclarativePresentationResolver::SURFACE,
                'GF_PROFILE_SELECTION',
                RuntimeDecisionTrace::RESULT_NOT_APPLICABLE,
                'settings_disabled',
                'native_gravity_forms_form'
            );
        } else {
            RuntimeDiagnostics::recordOnce(
                DeclarativePresentationResolver::SURFACE,
                'GF_PROFILE_SELECTION',
                RuntimeDecisionTrace::RESULT_FAIL,
                $state->reason(),
                'native_gravity_forms_form'
            );
        }
        return $state;
    }

    public function enqueue_form_assets( $form, $is_ajax ) {
        unset( $is_ajax );

        if ( ! function_exists( 'wp_enqueue_style' ) || ! function_exists( 'plugins_url' ) || ! function_exists( 'plugin_dir_path' ) ) {
            RuntimeDiagnostics::recordOnce(
                DeclarativePresentationResolver::SURFACE,
                'GF_ASSET_READINESS',
                RuntimeDecisionTrace::RESULT_FAIL,
                'host_asset_api_unavailable',
                'native_gravity_forms_form'
            );
            return;
        }

        $state  = $this->resolve_form_state( $form );
        $assets = ( new AssetResolver() )->stylesFor( $state );

        if ( empty( $assets ) ) {
            if ( $state->isActive() ) {
                RuntimeDiagnostics::recordOnce(
                    DeclarativePresentationResolver::SURFACE,
                    'GF_ASSET_READINESS',
                    RuntimeDecisionTrace::RESULT_FAIL,
                    'asset_resolution_empty',
                    'native_gravity_forms_form'
                );
            }
            return;
        }

        $profile = $state->profile();
        if ( $profile instanceof DeclarativeProfileDefinition && ! function_exists( 'wp_add_inline_style' ) ) {
            RuntimeDiagnostics::recordOnce(
                DeclarativePresentationResolver::SURFACE,
                'GF_ASSET_READINESS',
                RuntimeDecisionTrace::RESULT_FAIL,
                'host_inline_style_api_unavailable',
                'native_gravity_forms_form'
            );
            return;
        }

        $plugin_root = plugin_dir_path( GPP_PLUGIN_FILE );

        foreach ( $assets as $asset ) {
            if ( ! is_readable( $plugin_root . $asset['path'] ) ) {
                RuntimeDiagnostics::recordOnce(
                    DeclarativePresentationResolver::SURFACE,
                    'GF_ASSET_READINESS',
                    RuntimeDecisionTrace::RESULT_FAIL,
                    'required_asset_unavailable',
                    'native_gravity_forms_form'
                );
                return;
            }
        }

        foreach ( $assets as $asset ) {
            wp_enqueue_style(
                $asset['handle'],
                plugins_url( $asset['path'], GPP_PLUGIN_FILE ),
                $asset['dependencies'],
                null
            );
        }

        if ( $profile instanceof DeclarativeProfileDefinition ) {
            $css = $profile->inlineCss();
            if ( '' !== $css ) {
                wp_add_inline_style( $profile->styleHandle(), $css );
            }
        }
        RuntimeDiagnostics::recordOnce(
            DeclarativePresentationResolver::SURFACE,
            'GF_ASSET_READINESS',
            RuntimeDecisionTrace::RESULT_PASS
        );
    }

    public function add_form_state_css_classes( $form ) {
        if ( ! is_array( $form ) ) {
            RuntimeDiagnostics::recordOnce(
                DeclarativePresentationResolver::SURFACE,
                'GF_PRESENTATION_APPLIED',
                RuntimeDecisionTrace::RESULT_FAIL,
                'invalid_form_payload',
                'native_gravity_forms_form'
            );
            return $form;
        }

        $state = $this->resolve_form_state( $form );

        if ( ! $state->isActive() ) {
            RuntimeDiagnostics::recordOnce(
                DeclarativePresentationResolver::SURFACE,
                'GF_PRESENTATION_APPLIED',
                'disabled' === $state->reason() ? RuntimeDecisionTrace::RESULT_NOT_APPLICABLE : RuntimeDecisionTrace::RESULT_SKIP,
                'disabled' === $state->reason() ? 'settings_disabled' : $state->reason(),
                'native_gravity_forms_form'
            );
            return $form;
        }

        $class_string = isset( $form['cssClass'] ) && is_string( $form['cssClass'] )
            ? trim( $form['cssClass'] )
            : '';
        $classes = '' === $class_string
            ? array()
            : preg_split( '/\s+/', $class_string );
        $derived = $state->semanticClasses();
        $profile = $state->profile();
        if ( $profile instanceof DeclarativeProfileDefinition ) {
            $derived = array_merge( $derived, $profile->semanticClasses() );
        }

        foreach ( $derived as $class_name ) {
            if ( ! in_array( $class_name, $classes, true ) ) {
                $classes[] = $class_name;
            }
        }

        $form['cssClass'] = implode( ' ', $classes );
        RuntimeDiagnostics::recordOnce(
            DeclarativePresentationResolver::SURFACE,
            'GF_PRESENTATION_APPLIED',
            RuntimeDecisionTrace::RESULT_PASS
        );

        return $form;
    }

    private function bindingRollbackChoices() {
        $choices = array(
            array(
                'label' => esc_html__( 'No rollback', 'gravity-presentation-profiles' ),
                'value' => '',
            ),
        );
        try {
            $candidates = $this->bindingHealthService()->managementCandidates();
            foreach ( $candidates['rollbacks'] as $rollback ) {
                $form_name = ! empty( $rollback['form_title'] ) ? $rollback['form_title'] : 'Form ' . $rollback['form_id'];
                $choices[] = array(
                    'label' => sprintf(
                        __( 'Rollback: %1$s → binding version %2$s', 'gravity-presentation-profiles' ),
                        $form_name,
                        $rollback['binding_set_version']
                    ),
                    'value' => $this->encodeBindingManagementAction(
                        array(
                            'action' => 'rollback',
                            'context_key' => $rollback['context_key'],
                            'binding_set_id' => $rollback['binding_set_id'],
                            'binding_set_version' => $rollback['binding_set_version'],
                            'expected_binding_set_id' => $rollback['expected_binding_set_id'],
                            'expected_binding_set_version' => $rollback['expected_binding_set_version'],
                        )
                    ),
                );
            }
        } catch ( \Throwable $exception ) {
            // The health table will surface lifecycle read failures. Ordinary
            // settings saves remain possible and make no binding change.
        }
        return $choices;
    }

    private function encodeBindingManagementAction( $payload ) {
        return rtrim( strtr( base64_encode( json_encode( $payload, JSON_UNESCAPED_SLASHES ) ), '+/', '-_' ), '=' );
    }

    private function decodeBindingManagementAction( $value ) {
        if ( ! is_string( $value ) || '' === $value || 1 !== preg_match( '/^[A-Za-z0-9_-]+$/', $value ) ) {
            return null;
        }
        $padded = strtr( $value, '-_', '+/' );
        $padding = strlen( $padded ) % 4;
        if ( $padding ) {
            $padded .= str_repeat( '=', 4 - $padding );
        }
        $decoded = base64_decode( $padded, true );
        if ( false === $decoded ) {
            return null;
        }
        $payload = json_decode( $decoded, true );
        if ( ! is_array( $payload ) || empty( $payload['action'] ) ) {
            return null;
        }

        $expected_by_action = array(
            'repair' => array( 'action', 'binding_set_id', 'binding_set_version', 'context_key', 'field_id', 'semantic_slot_key' ),
            'unmap' => array( 'action', 'binding_set_id', 'binding_set_version', 'context_key', 'semantic_slot_key' ),
            'print_option' => array( 'action', 'binding_set_id', 'binding_set_version', 'canonical_option', 'context_key', 'host_raw_value', 'semantic_slot_key' ),
            'clear_print_option' => array( 'action', 'binding_set_id', 'binding_set_version', 'canonical_option', 'context_key', 'semantic_slot_key' ),
            'rollback' => array( 'action', 'binding_set_id', 'binding_set_version', 'context_key', 'expected_binding_set_id', 'expected_binding_set_version' ),
        );
        if ( ! isset( $expected_by_action[ $payload['action'] ] ) ) {
            return null;
        }

        $actual = array_keys( $payload );
        $expected = $expected_by_action[ $payload['action'] ];
        sort( $actual, SORT_STRING );
        sort( $expected, SORT_STRING );
        return $actual === $expected ? $payload : null;
    }

    private function bindingRowToken( $action ) {
        if ( ! is_array( $action ) || empty( $action['action'] ) ) {
            return '';
        }
        if ( in_array( $action['action'], array( 'repair', 'unmap' ), true ) ) {
            $parts = array( 'mapping', $action['context_key'], $action['binding_set_id'], $action['binding_set_version'], $action['semantic_slot_key'] );
        } elseif ( in_array( $action['action'], array( 'print_option', 'clear_print_option' ), true ) ) {
            $parts = array( 'print', $action['context_key'], $action['binding_set_id'], $action['binding_set_version'], $action['semantic_slot_key'], $action['canonical_option'] );
        } else {
            return '';
        }
        return substr( hash( 'sha256', implode( '|', array_map( 'strval', $parts ) ) ), 0, 24 );
    }

    private function bindingSourceMarkup( $source ) {
        if ( null === $source ) {
            return esc_html__( 'Not mapped', 'gravity-presentation-profiles' );
        }
        if ( 'gravity_forms.field' === $source['type'] ) {
            $label = isset( $source['label'] ) ? $source['label'] : __( 'Missing Gravity Forms field', 'gravity-presentation-profiles' );
            $detail = esc_html__( 'Field ID', 'gravity-presentation-profiles' ) . ' <code>' . esc_html( $source['field_id'] ) . '</code>';
            if ( isset( $source['field_type'] ) ) {
                $detail .= ' · ' . esc_html__( 'Type', 'gravity-presentation-profiles' ) . ' <code>' . esc_html( $source['field_type'] ) . '</code>';
            }
            return esc_html( $label ) . '<br><small>' . $detail . '</small>';
        }
        $identity = '';
        foreach ( array( 'meta_key', 'state_key', 'region_key', 'action_key' ) as $key ) {
            if ( isset( $source[ $key ] ) ) {
                $identity = $source[ $key ];
                break;
            }
        }
        return esc_html( $source['type'] ) . ( '' !== $identity ? '<br><small><code>' . esc_html( $identity ) . '</code></small>' : '' );
    }

    private function bindingHealthLabel( $status ) {
        $labels = array(
            BindingHealthEvaluator::HEALTHY => __( 'Healthy', 'gravity-presentation-profiles' ),
            BindingHealthEvaluator::UNMAPPED => __( 'Unmapped', 'gravity-presentation-profiles' ),
            BindingHealthEvaluator::STALE_SOURCE_MISSING => __( 'Stale / source missing', 'gravity-presentation-profiles' ),
            BindingHealthEvaluator::AMBIGUOUS_NEEDS_REVIEW => __( 'Needs review', 'gravity-presentation-profiles' ),
            BindingHealthEvaluator::EVIDENCE_NOT_PROVEN => __( 'Evidence not proven', 'gravity-presentation-profiles' ),
            BindingHealthEvaluator::NOT_APPLICABLE => __( 'Not applicable', 'gravity-presentation-profiles' ),
        );
        return isset( $labels[ $status ] ) ? $labels[ $status ] : $status;
    }

    private function materialDiagnosticEvent( $record ) {
        $events = isset( $record['events'] ) && is_array( $record['events'] ) ? array_reverse( $record['events'] ) : array();
        foreach ( $events as $event ) {
            if ( isset( $event['result'] ) && in_array( $event['result'], array( RuntimeDecisionTrace::RESULT_FAIL, RuntimeDecisionTrace::RESULT_SKIP ), true ) ) {
                return $event;
            }
        }
        return ! empty( $events ) ? $events[0] : array( 'stage' => 'GF_PROFILE_SELECTION', 'reason_code' => 'diagnostic_event_unavailable', 'fallback' => null );
    }

    private function visualPackageJsonString( $value ) {
        if ( is_string( $value ) ) {
            return $value;
        }
        if ( ! is_array( $value ) ) {
            return null;
        }

        $json = json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
        return false === $json ? null : $json;
    }

    private function visualWorkflow() {
        if ( null === $this->visual_workflow ) {
            $this->visual_workflow = SettingsLifecycleWorkflow::forWordPress();
        }

        return $this->visual_workflow;
    }

    private function bindingHealthService() {
        if ( null === $this->binding_health_service ) {
            $this->binding_health_service = BindingHealthService::forWordPress();
        }
        return $this->binding_health_service;
    }

    private function bindingRepairService() {
        if ( null === $this->binding_repair_service ) {
            $this->binding_repair_service = BindingRepairService::forWordPress();
        }
        return $this->binding_repair_service;
    }

    private function setSettingsFieldError( $field, $message ) {
        if ( is_object( $field ) && method_exists( $field, 'set_error' ) ) {
            $field->set_error( $message );
        }
    }
}
