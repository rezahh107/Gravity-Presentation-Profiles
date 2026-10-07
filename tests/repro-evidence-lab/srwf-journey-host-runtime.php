<?php
/**
 * Qualification-only authentic Gravity Flow runtime fixture for the Owner-approved
 * SRWF registration-operator journey. Creates only synthetic non-PII lab state.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}
wp_mkdir_p( $artifact_dir );

$flow_root = WP_PLUGIN_DIR . '/gravityflow';
$gf_root   = WP_PLUGIN_DIR . '/gravityforms';
$flow = get_file_data( $flow_root . '/gravityflow.php', array( 'Version' => 'Version' ) );
$gf   = get_file_data( $gf_root . '/gravityforms.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) $flow['Version'] || '3.1.1.1' !== (string) $gf['Version'] ) {
    throw new RuntimeException( 'Pinned Gravity package identity changed.' );
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
$negative_control = get_user_by( 'login', 'srwf_participant' );
if ( ! $operator || ! $negative_control ) {
    throw new RuntimeException( 'Synthetic qualification users are unavailable.' );
}

function srwf_journey_add_form( $title ) {
    $form_id = GFAPI::add_form(
        array(
            'title' => $title,
            'description' => 'Synthetic non-PII SRWF journey host qualification.',
            'fields' => array(
                array( 'id' => 1, 'label' => 'Synthetic Correction Value', 'type' => 'text', 'isRequired' => true ),
            ),
            'button' => array( 'type' => 'text', 'text' => 'Submit' ),
        )
    );
    if ( is_wp_error( $form_id ) || ! $form_id ) {
        throw new RuntimeException( is_wp_error( $form_id ) ? $form_id->get_error_message() : 'Unable to create form.' );
    }
    return (int) $form_id;
}

function srwf_journey_feed_assignees( $feed_meta ) {
    return array_values( array_map( 'strval', (array) rgar( $feed_meta, 'assignees' ) ) );
}

function srwf_journey_assert_same_operator_assignment( $review_meta, $correction_meta, $operator_id, $negative_control_id ) {
    $expected = 'user_id|' . (int) $operator_id;
    $negative = 'user_id|' . (int) $negative_control_id;
    $review_assignees = srwf_journey_feed_assignees( $review_meta );
    $correction_assignees = srwf_journey_feed_assignees( $correction_meta );

    if (
        array( $expected ) !== $review_assignees
        || array( $expected ) !== $correction_assignees
        || in_array( $negative, $correction_assignees, true )
    ) {
        throw new RuntimeException(
            'SAME_OPERATOR_ASSIGNMENT_INVARIANT_FAILED: ' .
            wp_json_encode(
                array(
                    'expected_operator_assignee' => $expected,
                    'negative_control_assignee' => $negative,
                    'review_assignees' => $review_assignees,
                    'correction_assignees' => $correction_assignees,
                ),
                JSON_UNESCAPED_SLASHES
            )
        );
    }

    return array(
        'operator_id' => (int) $operator_id,
        'negative_control_id' => (int) $negative_control_id,
        'review_assignees' => $review_assignees,
        'correction_assignees' => $correction_assignees,
        'negative_control_in_correction_feed' => false,
        'failure_semantics' => 'different_user_input_assignee_fails_qualification',
    );
}

function srwf_journey_add_steps( $form_id, $operator_id, $negative_control_id, $force_different_correction_assignee = false ) {
    $api = new Gravity_Flow_API( $form_id );
    $correction_assignee_id = $force_different_correction_assignee ? $negative_control_id : $operator_id;

    // User Input is deliberately created first so it is a real available target
    // when the Approval step is created. This lets Gravity Flow persist the native
    // checkbox_and_select Revert setting without inventing a transition seam.
    $correction_id = $api->add_step(
        array(
            'step_name' => 'SRWF Qualified Correction Input',
            'step_type' => 'user_input',
            'description' => 'Synthetic correction step.',
            'type' => 'select',
            'assignees' => array( 'user_id|' . (int) $correction_assignee_id ),
            'assignee_policy' => 'all',
            'editable_fields' => array( '1' ),
            'conditional_logic_editable_fields_enabled' => '1',
            'conditional_logic_editable_fields_mode' => 'dynamic',
            'instructionsEnable' => '1',
            'instructionsValue' => 'Update the synthetic correction value and submit.',
            'default_status' => 'hidden',
        )
    );
    if ( ! $correction_id || is_wp_error( $correction_id ) ) {
        throw new RuntimeException( 'Unable to create User Input correction step.' );
    }

    // Review is now the next step after User Input. This gives User Input a native
    // default-next route back to Review, while Review's native Revert points back
    // to the already-existing User Input step.
    $review_id = $api->add_step(
        array(
            'step_name' => 'SRWF Qualified Review',
            'step_type' => 'approval',
            'description' => 'Synthetic review step.',
            'type' => 'select',
            'assignees' => array( 'user_id|' . (int) $operator_id ),
            'assignee_policy' => 'all',
            'note_mode' => 'not_required',
            'confirmation_prompt' => '1',
            'revertEnable' => '1',
            'revertValue' => (string) $correction_id,
        )
    );
    if ( ! $review_id || is_wp_error( $review_id ) ) {
        throw new RuntimeException( 'Unable to create Review Approval step.' );
    }

    $fresh_api = new Gravity_Flow_API( $form_id );
    $review = $fresh_api->get_step( (int) $review_id );
    $correction = $fresh_api->get_step( (int) $correction_id );
    if ( ! $review || ! $correction ) {
        throw new RuntimeException( 'Unable to resolve configured workflow steps.' );
    }
    $review_meta = $review->get_feed_meta();
    $correction_meta = $correction->get_feed_meta();

    if (
        '1' !== (string) rgar( $review_meta, 'confirmation_prompt' )
        || '1' !== (string) rgar( $review_meta, 'revertEnable' )
        || (string) rgar( $review_meta, 'revertValue' ) !== (string) $correction_id
    ) {
        throw new RuntimeException(
            'Host-effective Approval confirmation/Revert settings were not admitted at step creation: ' .
            wp_json_encode(
                array(
                    'confirmation_prompt' => rgar( $review_meta, 'confirmation_prompt' ),
                    'revertEnable' => rgar( $review_meta, 'revertEnable' ),
                    'revertValue' => rgar( $review_meta, 'revertValue' ),
                ),
                JSON_UNESCAPED_SLASHES
            )
        );
    }

    if (
        '1' !== (string) rgar( $correction_meta, 'conditional_logic_editable_fields_enabled' )
        || 'dynamic' !== (string) rgar( $correction_meta, 'conditional_logic_editable_fields_mode' )
    ) {
        throw new RuntimeException(
            'Host-effective User Input conditional-logic settings were not admitted at step creation: ' .
            wp_json_encode(
                array(
                    'conditional_logic_editable_fields_enabled' => rgar( $correction_meta, 'conditional_logic_editable_fields_enabled' ),
                    'conditional_logic_editable_fields_mode' => rgar( $correction_meta, 'conditional_logic_editable_fields_mode' ),
                ),
                JSON_UNESCAPED_SLASHES
            )
        );
    }

    $assignment_invariant = srwf_journey_assert_same_operator_assignment(
        $review_meta,
        $correction_meta,
        $operator_id,
        $negative_control_id
    );

    return array(
        'review_id' => (int) $review_id,
        'correction_id' => (int) $correction_id,
        'review_status_config' => $review->get_status_config(),
        'correction_status_config' => $correction->get_status_config(),
        'review_feed_meta' => $review_meta,
        'correction_feed_meta' => $correction_meta,
        'assignment_invariant' => $assignment_invariant,
        'return_route' => array(
            'mechanic' => 'user_input_default_next_by_native_step_order',
            'correction_step_id' => (int) $correction_id,
            'review_step_id' => (int) $review_id,
        ),
    );
}

function srwf_journey_add_entry_seeded_at_review( $form_id, $created_by_id, $review_id, $label ) {
    $entry_id = GFAPI::add_entry(
        array(
            'form_id' => $form_id,
            'created_by' => (int) $created_by_id,
            '1' => 'SYNTHETIC-' . $label,
        )
    );
    if ( is_wp_error( $entry_id ) || ! $entry_id ) {
        throw new RuntimeException( is_wp_error( $entry_id ) ? $entry_id->get_error_message() : 'Unable to create entry.' );
    }
    $entry_id = (int) $entry_id;
    $api = new Gravity_Flow_API( $form_id );
    $api->process_workflow( $entry_id );

    // Because User Input is first for the native return-loop ordering, use the
    // public Gravity Flow API solely to seed the qualification entry at Review.
    // No GPP or test-only transition implementation is introduced.
    $entry = GFAPI::get_entry( $entry_id );
    $sent = $api->send_to_step( $entry, (int) $review_id );
    if ( false === $sent || is_wp_error( $sent ) ) {
        throw new RuntimeException( is_wp_error( $sent ) ? $sent->get_error_message() : 'Native send_to_step() could not seed Review.' );
    }

    $entry = GFAPI::get_entry( $entry_id );
    $step = ( new Gravity_Flow_API( $form_id ) )->get_current_step( $entry );
    if ( ! $step || 'approval' !== $step->get_type() || (int) $step->get_id() !== (int) $review_id ) {
        throw new RuntimeException( 'Synthetic entry could not be host-seeded at Review Approval.' );
    }
    return $entry_id;
}

$form_id = srwf_journey_add_form( 'SRWF Journey Host Qualification' );
$force_different_correction_assignee = '1' === (string) getenv( 'SRWF_JOURNEY_FORCE_DIFFERENT_CORRECTION_ASSIGNEE' );
try {
    $steps = srwf_journey_add_steps(
        $form_id,
        $operator->ID,
        $negative_control->ID,
        $force_different_correction_assignee
    );
} catch ( Throwable $error ) {
    GFAPI::delete_form( $form_id );
    throw $error;
}

$entries = array(
    'approve' => srwf_journey_add_entry_seeded_at_review( $form_id, $operator->ID, $steps['review_id'], 'APPROVE' ),
    'reject' => srwf_journey_add_entry_seeded_at_review( $form_id, $operator->ID, $steps['review_id'], 'REJECT' ),
    'revert' => srwf_journey_add_entry_seeded_at_review( $form_id, $operator->ID, $steps['review_id'], 'REVERT' ),
    'invalid' => srwf_journey_add_entry_seeded_at_review( $form_id, $operator->ID, $steps['review_id'], 'INVALID' ),
    'status_shortcode' => srwf_journey_add_entry_seeded_at_review( $form_id, $operator->ID, $steps['review_id'], 'STATUS-SHORTCODE' ),
    'status_block' => srwf_journey_add_entry_seeded_at_review( $form_id, $operator->ID, $steps['review_id'], 'STATUS-BLOCK' ),
);

$shortcode_page_id = wp_insert_post(
    array(
        'post_title' => 'SRWF Qualified Inbox Shortcode',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '[gravityflow page="inbox"]',
    ),
    true
);
if ( is_wp_error( $shortcode_page_id ) ) {
    throw new RuntimeException( $shortcode_page_id->get_error_message() );
}
$shortcode_url = get_permalink( $shortcode_page_id );

$status_shortcode_page_id = wp_insert_post(
    array(
        'post_title' => 'SRWF Qualified Status Shortcode',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '[gravityflow page="status"]',
    ),
    true
);
if ( is_wp_error( $status_shortcode_page_id ) ) {
    throw new RuntimeException( $status_shortcode_page_id->get_error_message() );
}
$status_shortcode_page = array(
    'page_id' => (int) $status_shortcode_page_id,
    'url' => (string) get_permalink( $status_shortcode_page_id ),
);

$registry = WP_Block_Type_Registry::get_instance();
$block_page = null;
if ( is_object( $registry ) && method_exists( $registry, 'is_registered' ) && $registry->is_registered( 'gravityflow/inbox' ) ) {
    $block_page_id = wp_insert_post(
        array(
            'post_title' => 'SRWF Qualified Inbox Block',
            'post_status' => 'publish',
            'post_type' => 'page',
            'post_content' => '<!-- wp:gravityflow/inbox /-->',
        ),
        true
    );
    if ( is_wp_error( $block_page_id ) ) {
        throw new RuntimeException( $block_page_id->get_error_message() );
    }
    $block_page = array(
        'page_id' => (int) $block_page_id,
        'url' => (string) get_permalink( $block_page_id ),
    );
}

$status_block_page = null;
if ( is_object( $registry ) && method_exists( $registry, 'is_registered' ) && $registry->is_registered( 'gravityflow/status' ) ) {
    $status_block_page_id = wp_insert_post(
        array(
            'post_title' => 'SRWF Qualified Status Block',
            'post_status' => 'publish',
            'post_type' => 'page',
            'post_content' => '<!-- wp:gravityflow/status /-->',
        ),
        true
    );
    if ( is_wp_error( $status_block_page_id ) ) {
        throw new RuntimeException( $status_block_page_id->get_error_message() );
    }
    $status_block_page = array(
        'page_id' => (int) $status_block_page_id,
        'url' => (string) get_permalink( $status_block_page_id ),
    );
}

$manifest = array(
    'schema_version' => '1.3.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'scope' => 'QUALIFICATION_ONLY',
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_forms' => (string) $gf['Version'],
        'gravity_flow' => (string) $flow['Version'],
    ),
    'form_id' => $form_id,
    'field_id' => 1,
    'steps' => $steps,
    'entries' => $entries,
    'users' => array(
        'operator' => array( 'id' => (int) $operator->ID, 'login' => $operator->user_login ),
        'negative_control' => array( 'id' => (int) $negative_control->ID, 'login' => $negative_control->user_login ),
    ),
    'routes' => array(
        'admin_inbox_url' => admin_url( 'admin.php?page=gravityflow-inbox' ),
        'shortcode' => array( 'page_id' => (int) $shortcode_page_id, 'url' => (string) $shortcode_url ),
        'block' => $block_page,
        'status_shortcode' => $status_shortcode_page,
        'status_block' => $status_block_page,
    ),
    'source_contract' => array(
        'approval_class' => 'includes/steps/class-step-approval.php',
        'confirmation_js' => 'js/inbox.js',
        'confirmation_function' => 'handleApprovalStepButtonClick',
        'confirmation_primitive' => 'window.confirm',
        'revert_filter' => 'gravityflow_approval_revert_step_id',
        'public_review_seed_api' => 'Gravity_Flow_API::send_to_step',
        'back_link_filter' => 'gravityflow_back_link_url_entry_detail',
    ),
);

update_option( 'gpp_srwf_journey_host_manifest', $manifest, false );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'srwf-journey-host-manifest.json',
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "SRWF_JOURNEY_HOST_RUNTIME_SETUP_PASS\n";
