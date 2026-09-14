<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationModel;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$repo_root = getenv( 'GITHUB_WORKSPACE' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
$GLOBALS['wu17_results'] = array();

function wu17_test( $id, $name, $callback ) {
    try {
        $details = $callback();
        $GLOBALS['wu17_results'][] = array( 'id' => $id, 'name' => $name, 'status' => 'PASS', 'details' => $details );
    } catch ( Throwable $exception ) {
        $GLOBALS['wu17_results'][] = array( 'id' => $id, 'name' => $name, 'status' => 'FAIL', 'details' => $exception->getMessage() );
    }
}

function wu17_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}

function wu17_entry_for_form( $manifest, $form_id ) {
    foreach ( $manifest['entry_records'] as $record ) {
        if ( (int) $record['form_id'] === (int) $form_id ) {
            $entry = GFAPI::get_entry( $record['entry_id'] );
            if ( is_wp_error( $entry ) ) {
                throw new RuntimeException( $entry->get_error_message() );
            }
            return array( $record, $entry );
        }
    }
    throw new RuntimeException( 'Fixture entry for form not found.' );
}

function wu17_active_binding_artifacts() {
    $bindings = new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
    $snapshot = $bindings->snapshot();
    $active = array();
    foreach ( $snapshot['activations'] as $context_key => $identity ) {
        $id = $identity['binding_set_id'];
        $version = $identity['binding_set_version'];
        if ( isset( $snapshot['installed'][ $id ][ $version ]['artifact'] )
            && $snapshot['installed'][ $id ][ $version ]['context_key'] === $context_key ) {
            $active[] = $snapshot['installed'][ $id ][ $version ]['artifact'];
        }
    }
    return $active;
}

function wu17_active_visual_contract() {
    $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
    $activation = $visual->resolve( 'gravity_flow.inbox' );
    $profile = $visual->effectiveProfile( 'gravity_flow.inbox' );
    $snapshot = $visual->snapshot();
    if ( ! is_array( $activation ) ) {
        throw new RuntimeException( 'No active Inbox visual activation.' );
    }
    $record = $snapshot['installed'][ $activation['package_id'] ][ $activation['package_version'] ];
    return array( $activation, $profile, $record['artifact'] );
}

function wu17_required_slots_from_package( $package ) {
    $required = array();
    foreach ( $package['semantic_slots'] as $declaration ) {
        foreach ( $declaration['surface_usage'] as $usage ) {
            if ( 'gravity_flow.inbox' === $usage['surface'] && true === $usage['required'] ) {
                $required[] = $declaration['semantic_slot_key'];
            }
        }
    }
    return $required;
}

function wu17_binding_for_form( $bindings, $form_id ) {
    foreach ( $bindings as $binding ) {
        if ( (int) $binding['context']['form_source_ref']['form_id'] === (int) $form_id ) {
            return $binding;
        }
    }
    throw new RuntimeException( 'Binding artifact for form not found.' );
}

wu17_test( 'WU17-RUNTIME-001', 'one active shared Inbox visual profile is surface-owned', function () {
    list( $active, $profile ) = wu17_active_visual_contract();
    wu17_assert( 'shared.inbox.v1' === $active['profile_id'], 'Unexpected active Inbox profile identity.' );
    wu17_assert( 'shared.inbox.v1' === $profile['profile_id'], 'Effective Inbox profile mismatch.' );
    wu17_assert( 'gravity_flow.inbox' === $profile['surface'], 'Profile is not surface-bound to Inbox.' );
    return $active;
} );

wu17_test( 'WU17-RUNTIME-002', 'two form binding sets are independently active without visual identity', function () use ( $manifest ) {
    $bindings = new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
    $snapshot = $bindings->snapshot();
    wu17_assert( 2 === count( $snapshot['activations'] ), 'Expected two active form binding contexts.' );
    $ids = array();
    foreach ( $snapshot['activations'] as $identity ) {
        wu17_assert( isset( $identity['binding_set_id'], $identity['binding_set_version'] ), 'Binding activation identity is incomplete.' );
        wu17_assert( ! isset( $identity['profile_id'] ) && ! isset( $identity['package_id'] ), 'Binding activation must not select a visual profile.' );
        $ids[] = $identity['binding_set_id'];
    }
    sort( $ids );
    $expected = $manifest['binding_set_ids'];
    sort( $expected );
    wu17_assert( $expected === $ids, 'Active binding identities do not match the two synthetic forms.' );
    return $ids;
} );

wu17_test( 'WU17-RUNTIME-003', 'production adapter keeps the card inside the rendered viewport while preserving native row data columns', function () {
    $input = array( 'id' => 'Entry ID', 'date_created' => 'Date Created', 'workflow_step' => 'Step' );
    $columns = apply_filters( 'gravityflow_columns_inbox_table', $input, array() );
    foreach ( array_keys( $input ) as $key ) {
        wu17_assert( isset( $columns[ $key ] ), 'Host row-data column was removed: ' . $key );
    }
    wu17_assert( isset( $columns[ InboxPresentationAdapter::CARD_COLUMN ] ), 'Production card column was not added.' );
    wu17_assert( InboxPresentationAdapter::CARD_COLUMN === array_key_first( $columns ), 'Card column must precede support columns so AG Grid column virtualization cannot omit it on narrow viewports.' );
    return array_keys( $columns );
} );

wu17_test( 'WU17-RUNTIME-004', 'multi-form ready cards share profile but resolve form-local required semantics', function () use ( $manifest ) {
    $cards = array();
    foreach ( $manifest['forms'] as $form ) {
        list( $record, $entry ) = wu17_entry_for_form( $manifest, $form['form_id'] );
        $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $form['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
        wu17_assert( false !== strpos( $html, 'gpp-inbox-card__readiness--ready' ), 'Ready marker missing.' );
        wu17_assert( false !== strpos( $html, 'data-gpp-profile-id="shared.inbox.v1"' ), 'Card switched away from shared Inbox profile.' );
        wu17_assert( false !== strpos( $html, esc_html( $record['student_name'] ) ), 'Form-local student name did not render.' );
        $persian_national = strtr( $record['national_id'], array( '0'=>'۰','1'=>'۱','2'=>'۲','3'=>'۳','4'=>'۴','5'=>'۵','6'=>'۶','7'=>'۷','8'=>'۸','9'=>'۹' ) );
        wu17_assert( false !== strpos( $html, $persian_national ), 'Form-local national ID did not render with Persian numerals.' );
        $cards[] = array( 'form_id' => (int) $form['form_id'], 'profile' => 'shared.inbox.v1', 'name' => $record['student_name'] );
    }
    return $cards;
} );

wu17_test( 'WU17-RUNTIME-005', 'NOT_PROVEN photo is optional and keeps card ready with fallback', function () use ( $manifest ) {
    list( $alpha_record, $alpha_entry ) = wu17_entry_for_form( $manifest, $manifest['forms'][0]['form_id'] );
    list( $beta_record, $beta_entry ) = wu17_entry_for_form( $manifest, $manifest['forms'][1]['form_id'] );
    $alpha_html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $alpha_record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $alpha_entry );
    $beta_html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $beta_record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $beta_entry );
    wu17_assert( false !== strpos( $alpha_html, 'gpp-inbox-card__photo-image' ), 'PROVEN Alpha photo did not render.' );
    wu17_assert( false !== strpos( $beta_html, 'gpp-inbox-card__readiness--ready' ), 'Optional NOT_PROVEN photo incorrectly disabled Beta card mode.' );
    wu17_assert( false === strpos( $beta_html, 'gpp-inbox-card__photo-image' ), 'NOT_PROVEN Beta photo leaked into presentation.' );
    wu17_assert( false !== strpos( $beta_html, 'gpp-inbox-card__photo-fallback' ), 'NOT_PROVEN Beta photo did not use graceful fallback.' );
    wu17_assert( ! empty( $beta_entry[ (string) $manifest['forms'][1]['photo_field_id'] ] ), 'Negative control invalid: Beta host photo value must exist.' );
    return array( 'alpha_photo' => 'rendered', 'beta_photo' => 'fail_closed_fallback_card_ready' );
} );

wu17_test( 'WU17-RUNTIME-006', 'School and Due remain absent when optional bindings are not PROVEN', function () use ( $manifest ) {
    list( $record, $entry ) = wu17_entry_for_form( $manifest, $manifest['forms'][0]['form_id'] );
    $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
    wu17_assert( false !== strpos( $html, 'gpp-inbox-card__readiness--ready' ), 'Optional School/Due absence incorrectly disabled card mode.' );
    wu17_assert( false === strpos( $html, 'gpp-inbox-card__school' ), 'UNBOUND School was rendered.' );
    wu17_assert( false === strpos( $html, 'gpp-inbox-card__due' ), 'NOT_PROVEN Due was rendered.' );
    return $manifest['optional_capabilities'];
} );

wu17_test( 'WU17-RUNTIME-007', 'GPP-owned entry date is Jalali/Persian without mutating host value', function () use ( $manifest ) {
    $record = $manifest['entry_records'][0];
    $entry = GFAPI::get_entry( $record['entry_id'] );
    $before = $entry['date_created'];
    $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
    wu17_assert( false !== strpos( $html, '۱۴۰۴/۱۰/۱۱، ۰۰:۰۰' ), 'Expected Jalali/Persian created-at presentation missing.' );
    $after = GFAPI::get_entry( $record['entry_id'] );
    wu17_assert( $before === $after['date_created'] && $before === $record['date_created'], 'Presentation formatting mutated stored date_created.' );
    return array( 'stored' => $before, 'presented' => '۱۴۰۴/۱۰/۱۱، ۰۰:۰۰' );
} );

wu17_test( 'WU17-RUNTIME-008', 'overdue treatment is local and unsupported optional controls are absent', function () use ( $repo_root ) {
    $css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox.css' );
    $adapter = file_get_contents( $repo_root . '/src/SRWF/GravityFlow/InboxPresentationAdapter.php' );
    wu17_assert( false !== strpos( $css, '.gpp-inbox-card__due--overdue dd' ), 'Local overdue style is missing.' );
    wu17_assert( false === strpos( $css, '.gpp-inbox-card--overdue' ), 'Whole-card overdue modifier is forbidden.' );
    wu17_assert( false === strpos( $adapter, 'gpp_school_filter' ) && false === strpos( $adapter, 'gpp_due_filter' ), 'Unsupported School/Due controls were introduced.' );
    return 'Only the due value owns overdue emphasis; no unsupported controls exist.';
} );

wu17_test( 'WU17-RUNTIME-009', 'presentation uses admitted Inbox filters plus CSS and introduces no second behavior path', function () use ( $repo_root ) {
    $source = file_get_contents( $repo_root . '/src/SRWF/GravityFlow/InboxPresentationAdapter.php' );
    wu17_assert( false !== strpos( $source, 'gravityflow_columns_inbox_table' ), 'Admitted native Inbox column filter missing.' );
    wu17_assert( false !== strpos( $source, 'gravityflow_inbox_field_value' ), 'Admitted native Inbox value filter missing.' );
    foreach ( array( 'gravityflow_js_config_shared', 'wp_enqueue_script(', 'MutationObserver', 'get_inbox_entries(', 'applyTransaction(', 'register_rest_route(' ) as $forbidden ) {
        wu17_assert( false === strpos( $source, $forbidden ), 'Presentation adapter introduced a forbidden behavior path: ' . $forbidden );
    }
    return 'Two WU21-admitted filters plus CSS only; no production JavaScript or replacement behavior path.';
} );

wu17_test( 'WU17-RUNTIME-010', 'CSS is native-first and card projection exists only inside the supported readiness gate', function () use ( $repo_root ) {
    $base_css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox.css' );
    $native_css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox-native.css' );
    $base_gate = strpos( $base_css, '@supports selector(:has(*))' );
    $native_gate = strpos( $native_css, '@supports selector(:has(*))' );
    $support_hide = strpos( $native_css, '.ag-header-cell:not([col-id="gpp_case_card"])' );
    $grid_projection = strpos( $base_css, 'grid-template-columns: repeat(2, minmax(0, 1fr))' );
    wu17_assert( false !== $base_gate && false !== $native_gate, 'Selector-support progressive gate is missing.' );
    wu17_assert( false !== strpos( $native_css, ':not(:has(.ag-center-cols-container > .ag-row .gpp-inbox-card__readiness--unready))' ), 'Unready-row veto is missing from CSS gate.' );
    wu17_assert( false !== $support_hide && $support_hide > $native_gate, 'Native non-card cells may only be hidden inside the readiness gate.' );
    wu17_assert( false !== $grid_projection && $grid_projection > $base_gate, 'Two-card structural projection must be gated.' );
    wu17_assert( false === strpos( substr( $native_css, 0, $native_gate ), '.ag-cell:not([col-id="gpp_case_card"])' ), 'Native cells are hidden before readiness can be established.' );
    wu17_assert( false !== strpos( substr( $native_css, 0, $native_gate ), '.ag-cell[col-id="gpp_case_card"]' ), 'Baseline must hide the GPP presentation column.' );
    wu17_assert( false !== strpos( $base_css, '@media (max-width: 782px)' ) && false !== strpos( $base_css, 'grid-template-columns: minmax(0, 1fr)' ), 'Narrow one-card gated rule missing.' );
    return 'Default exposes native columns and hides the GPP column; supported all-ready rows progressively enable two/one-card mode.';
} );

wu17_test( 'WU17-RUNTIME-011', 'GPP does not broaden native assignment or authorization', function () use ( $manifest ) {
    $operator_total = 0;
    Gravity_Flow_API::get_inbox_entries(
        array(
            'filter_key' => 'workflow_user_id_' . (int) $manifest['operator']['id'],
            'user_id' => (int) $manifest['operator']['id'],
            'paging' => array( 'page_size' => 100 ),
        ),
        $operator_total
    );
    $viewer_total = 0;
    Gravity_Flow_API::get_inbox_entries(
        array(
            'filter_key' => 'workflow_user_id_' . (int) $manifest['viewer']['id'],
            'user_id' => (int) $manifest['viewer']['id'],
            'paging' => array( 'page_size' => 100 ),
        ),
        $viewer_total
    );
    wu17_assert( 25 === $operator_total, 'Operator native Inbox count changed.' );
    wu17_assert( 0 === $viewer_total, 'Unassigned viewer received native Inbox entries.' );
    return array( 'operator' => $operator_total, 'viewer' => $viewer_total );
} );

wu17_test( 'WU17-RUNTIME-012', 'required Inbox semantics are derived from the active visual package and all fixture rows are ready', function () use ( $manifest ) {
    list( , $profile, $package ) = wu17_active_visual_contract();
    $bindings = wu17_active_binding_artifacts();
    $model = new InboxPresentationModel( $profile, $bindings, $package['semantic_slots'] );
    $expected = wu17_required_slots_from_package( $package );
    wu17_assert( $expected === $model->requiredSemanticSlotKeys(), 'Model required slots diverged from active package surface_usage declarations.' );
    foreach ( $manifest['forms'] as $form ) {
        list( , $entry ) = wu17_entry_for_form( $manifest, $form['form_id'] );
        wu17_assert( $model->isPresentationReady( $entry ), 'Fully proven fixture row unexpectedly failed required readiness.' );
    }
    return array( 'required_slots' => $expected, 'source_of_truth' => 'active_visual_package.semantic_slots.surface_usage' );
} );

wu17_test( 'WU17-RUNTIME-013', 'same-root readiness falsification covers zero, unbound, required-NOT_PROVEN and ambiguous environments', function () use ( $manifest ) {
    list( , $profile, $package ) = wu17_active_visual_contract();
    $bindings = wu17_active_binding_artifacts();
    $alpha = wu17_binding_for_form( $bindings, $manifest['forms'][0]['form_id'] );
    list( , $alpha_entry ) = wu17_entry_for_form( $manifest, $manifest['forms'][0]['form_id'] );

    $zero = new InboxPresentationModel( $profile, array(), $package['semantic_slots'] );
    wu17_assert( ! $zero->isPresentationReady( $alpha_entry ), 'Zero binding sets must be unready.' );

    $unbound_entry = $alpha_entry;
    $unbound_entry['form_id'] = 999999;
    $normal = new InboxPresentationModel( $profile, $bindings, $package['semantic_slots'] );
    wu17_assert( ! $normal->isPresentationReady( $unbound_entry ), 'Unbound form must be unready.' );

    $not_proven = $alpha;
    foreach ( $not_proven['bindings'] as &$binding ) {
        if ( 'student.national_id' === $binding['semantic_slot_key'] ) {
            $binding['state'] = 'NOT_PROVEN';
            $binding['source_ref'] = null;
            $binding['evidence_refs'] = array( 'wu21:fail-closed-negative-control' );
        }
    }
    unset( $binding );
    foreach ( $not_proven['runtime_claims'] as &$claim ) {
        if ( 'student.national_id' === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
            $claim['evidence_state'] = 'NOT_PROVEN';
            $claim['evidence_refs'] = array( 'wu21:fail-closed-negative-control' );
        }
    }
    unset( $claim );
    $not_proven_model = new InboxPresentationModel( $profile, array( $not_proven ), $package['semantic_slots'] );
    wu17_assert( ! $not_proven_model->isPresentationReady( $alpha_entry ), 'NOT_PROVEN required binding must be unready.' );

    $ambiguous = $alpha;
    $ambiguous['binding_set_id'] = 'wu17.runtime.alpha.ambiguous';
    $ambiguous['context']['installation_source_ref']['installation_id'] = 'wu17-runtime-other-installation';
    $ambiguous_model = new InboxPresentationModel( $profile, array( $alpha, $ambiguous ), $package['semantic_slots'] );
    wu17_assert( ! $ambiguous_model->isPresentationReady( $alpha_entry ), 'Ambiguous active environment must be unready.' );

    return array(
        'zero_binding_sets' => 'UNREADY',
        'unbound_form' => 'UNREADY',
        'required_not_proven' => 'UNREADY',
        'ambiguous_environment' => 'UNREADY',
    );
} );

wu17_test( 'WU17-NEGATIVE-001', 'active visual profile with zero active bindings emits only an unready marker', function () use ( $manifest ) {
    $original = get_option( BindingSetLifecycle::OPTION_NAME );
    wu17_assert( is_array( $original ) && isset( $original['activations'] ), 'Binding lifecycle state unavailable for negative control.' );
    $without_bindings = $original;
    $without_bindings['activations'] = array();
    update_option( BindingSetLifecycle::OPTION_NAME, $without_bindings, false );
    InboxPresentationAdapter::resetRuntimeCache();

    try {
        list( $record, $entry ) = wu17_entry_for_form( $manifest, $manifest['forms'][0]['form_id'] );
        $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
        wu17_assert( false !== strpos( $html, 'gpp-inbox-card__readiness--unready' ), 'Unready marker missing for zero active bindings.' );
        wu17_assert( false === strpos( $html, '<article class="gpp-inbox-card"' ), 'Zero active bindings still emit a pseudo-success GPP card.' );
        wu17_assert( false === strpos( $html, 'gpp-inbox-card__readiness--ready' ), 'Zero active bindings incorrectly emit a ready marker.' );
        return 'Only the non-visible unready marker is emitted; CSS therefore preserves native Gravity Flow.';
    } finally {
        update_option( BindingSetLifecycle::OPTION_NAME, $original, false );
        InboxPresentationAdapter::resetRuntimeCache();
    }
} );

$result_path = trailingslashit( $artifact_dir ) . 'wu17-runtime-results.json';
file_put_contents( $result_path, wp_json_encode( array( 'suite' => 'WU17 production adapter runtime', 'results' => $GLOBALS['wu17_results'] ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
foreach ( $GLOBALS['wu17_results'] as $result ) {
    echo $result['status'] . ' ' . $result['id'] . ' ' . $result['name'] . PHP_EOL;
}
foreach ( $GLOBALS['wu17_results'] as $result ) {
    if ( 'PASS' !== $result['status'] ) {
        exit( 1 );
    }
}
