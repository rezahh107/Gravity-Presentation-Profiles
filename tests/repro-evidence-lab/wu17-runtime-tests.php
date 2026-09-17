<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeEvidence;

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
        if ( (int) $record['form_id'] !== (int) $form_id ) {
            continue;
        }
        $entry = GFAPI::get_entry( $record['entry_id'] );
        if ( is_wp_error( $entry ) ) {
            throw new RuntimeException( $entry->get_error_message() );
        }
        return array( $record, $entry );
    }
    throw new RuntimeException( 'Fixture entry for form not found.' );
}

function wu17_binding_lifecycle() {
    return new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
}

function wu17_active_binding_artifacts() {
    $bindings = wu17_binding_lifecycle();
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

function wu17_binding_for_form( $bindings, $form_id ) {
    foreach ( $bindings as $binding ) {
        if ( (int) $binding['context']['form_source_ref']['form_id'] === (int) $form_id ) {
            return $binding;
        }
    }
    throw new RuntimeException( 'Active binding artifact for form not found.' );
}

function wu17_binding_map( $artifact ) {
    $map = array();
    foreach ( $artifact['bindings'] as $binding ) {
        $map[ $binding['semantic_slot_key'] ] = $binding;
    }
    return $map;
}

function wu17_claim_map( $artifact ) {
    $map = array();
    foreach ( $artifact['runtime_claims'] as $claim ) {
        $map[ $claim['semantic_slot_key'] . '|' . $claim['claim'] ] = $claim;
    }
    return $map;
}

wu17_test( 'WU17-RUNTIME-001', 'explicit product setup activates the SRWF Operations Inbox successor only on Inbox', function () {
    $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
    $activation = $visual->resolve( 'gravity_flow.inbox' );
    $profile = $visual->effectiveProfile( 'gravity_flow.inbox' );
    $snapshot = $visual->snapshot();
    wu17_assert( is_array( $activation ), 'Inbox visual activation is missing.' );
    wu17_assert( 'srwf.operations.presentation' === $activation['package_id'], 'Unexpected Inbox package identity.' );
    wu17_assert( '1.0.1' === $activation['package_version'], 'Inbox must activate the due-optional Operations Package successor.' );
    wu17_assert( 'srwf.operations.inbox.v1' === $activation['profile_id'], 'Unexpected Inbox profile identity.' );
    wu17_assert( 'srwf.operations.inbox.v1' === $profile['profile_id'], 'Effective Inbox profile mismatch.' );
    wu17_assert( 'gravity_flow.inbox' === $profile['surface'], 'Profile is not surface-scoped to Inbox.' );
    $package = $snapshot['installed'][ $activation['package_id'] ][ $activation['package_version'] ]['artifact'];
    foreach ( $package['semantic_slots'] as $slot ) {
        if ( 'workflow.due_at' !== $slot['semantic_slot_key'] ) {
            continue;
        }
        foreach ( $slot['surface_usage'] as $usage ) {
            if ( 'gravity_flow.inbox' === $usage['surface'] ) {
                wu17_assert( false === $usage['required'], 'Due remains mandatory in the active Inbox contract.' );
            }
        }
    }
    return $activation;
} );

wu17_test( 'WU17-RUNTIME-002', 'two form binding contexts come from product setup and carry no visual or authorization ownership', function () use ( $manifest ) {
    $snapshot = wu17_binding_lifecycle()->snapshot();
    wu17_assert( 2 === count( $snapshot['activations'] ), 'Expected exactly two active form binding contexts.' );
    $ids = array();
    foreach ( $snapshot['activations'] as $identity ) {
        wu17_assert( isset( $identity['binding_set_id'], $identity['binding_set_version'] ), 'Binding activation identity is incomplete.' );
        wu17_assert( ! isset( $identity['profile_id'] ) && ! isset( $identity['package_id'] ), 'Binding activation must not select a visual profile.' );
        $ids[] = $identity['binding_set_id'];
    }
    sort( $ids );
    $expected = $manifest['binding_set_ids'];
    sort( $expected );
    wu17_assert( $expected === $ids, 'Active binding identities differ from product-created fixture contexts.' );
    foreach ( wu17_active_binding_artifacts() as $artifact ) {
        foreach ( $artifact['runtime_claims'] as $claim ) {
            wu17_assert( 'authorization' !== $claim['claim'], 'Administrator readiness proof must never grant request authorization.' );
        }
    }
    return $ids;
} );

wu17_test( 'WU17-RUNTIME-003', 'production adapter adds one card column without removing host row data', function () {
    $input = array( 'id' => 'Entry ID', 'date_created' => 'Date Created', 'workflow_step' => 'Step' );
    $columns = apply_filters( 'gravityflow_columns_inbox_table', $input, array() );
    foreach ( array_keys( $input ) as $key ) {
        wu17_assert( isset( $columns[ $key ] ), 'Host row-data column was removed: ' . $key );
    }
    wu17_assert( isset( $columns[ InboxPresentationAdapter::CARD_COLUMN ] ), 'Production card column was not added.' );
    wu17_assert( InboxPresentationAdapter::CARD_COLUMN === array_key_first( $columns ), 'Card column must remain first for narrow AG Grid virtualization safety.' );
    return array_keys( $columns );
} );

wu17_test( 'WU17-RUNTIME-004', 'real mapped fields and derived full name render form-locally on both product-created bindings', function () use ( $manifest ) {
    $observed = array();
    foreach ( $manifest['forms'] as $form ) {
        list( $record, $entry ) = wu17_entry_for_form( $manifest, $form['form_id'] );
        $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $form['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
        wu17_assert( false !== strpos( $html, 'gpp-inbox-card__readiness--ready' ), 'Ready marker missing for mapped form.' );
        wu17_assert( false !== strpos( $html, 'data-gpp-profile-id="srwf.operations.inbox.v1"' ), 'Card switched away from Operations Inbox profile.' );
        wu17_assert( false !== strpos( $html, esc_html( $record['student_name'] ) ), 'Derived first + last name did not render.' );
        wu17_assert( false !== strpos( $html, esc_html( $record['grade_group'] ) ), 'Mapped grade/group did not render.' );
        wu17_assert( false !== strpos( $html, esc_html( $record['school'] ) ), 'Mapped school did not render.' );
        wu17_assert( false !== strpos( $html, esc_html( $record['step_name'] ) ), 'Authentic current Gravity Flow step did not render.' );
        $persian_national = strtr( $record['national_id'], array( '0'=>'۰','1'=>'۱','2'=>'۲','3'=>'۳','4'=>'۴','5'=>'۵','6'=>'۶','7'=>'۷','8'=>'۸','9'=>'۹' ) );
        wu17_assert( false !== strpos( $html, $persian_national ), 'Mapped national ID did not render with presentation-only Persian digits.' );
        wu17_assert( false !== strpos( $html, 'gpp-inbox-card__photo-image' ), 'Mapped authentic field source did not render the photo.' );
        $observed[] = array( 'form_id' => (int) $form['form_id'], 'name' => $record['student_name'], 'step' => $record['step_name'] );
    }
    return $observed;
} );

wu17_test( 'WU17-RUNTIME-005', 'availability proof is exact-source and exact-binding-version bound for every mandatory source', function () use ( $manifest ) {
    $required = array( 'student.photo', 'student.first_name', 'student.last_name', 'student.national_id', 'education.grade_group', 'school.name', 'entry.created_at', 'workflow.current_step' );
    $details = array();
    foreach ( $manifest['forms'] as $form ) {
        $artifact = wu17_binding_for_form( wu17_active_binding_artifacts(), $form['form_id'] );
        $bindings = wu17_binding_map( $artifact );
        $claims = wu17_claim_map( $artifact );
        wu17_assert( 'UNBOUND' === $bindings['student.full_name']['state'] && null === $bindings['student.full_name']['source_ref'], 'Derived full name acquired a duplicate host source.' );
        wu17_assert( 'UNBOUND' === $bindings['workflow.due_at']['state'] && null === $bindings['workflow.due_at']['source_ref'], 'Optional Due was fabricated.' );
        wu17_assert( 'gravity_forms.entry_meta' === $bindings['entry.created_at']['source_ref']['type'] && 'date_created' === $bindings['entry.created_at']['source_ref']['meta_key'], 'entry.created_at is not bound to authentic date_created metadata.' );
        wu17_assert( 'gravity_flow.state' === $bindings['workflow.current_step']['source_ref']['type'] && 'current_step' === $bindings['workflow.current_step']['source_ref']['state_key'], 'workflow.current_step is not bound to admitted Gravity Flow state.' );
        foreach ( $required as $slot ) {
            $key = $slot . '|availability';
            wu17_assert( isset( $claims[ $key ] ) && 'PROVEN' === $claims[ $key ]['evidence_state'], 'Required availability proof missing for ' . $slot );
            $expected = InboxRuntimeEvidence::availabilityRef( $artifact, $slot, $bindings[ $slot ]['source_ref'] );
            wu17_assert( in_array( $expected, $claims[ $key ]['evidence_refs'], true ), 'Stale/non-source-bound availability evidence for ' . $slot );
        }
        wu17_assert( ! isset( $claims['workflow.due_at|availability'] ), 'Unresolved optional Due received invented availability proof.' );
        $details[] = array( 'form_id' => (int) $form['form_id'], 'binding_version' => $artifact['binding_set_version'] );
    }
    return $details;
} );

wu17_test( 'WU17-RUNTIME-006', 'date_created and current_step are read from the authentic host without mutation', function () use ( $manifest ) {
    $record = $manifest['entry_records'][0];
    $entry = GFAPI::get_entry( $record['entry_id'] );
    wu17_assert( ! is_wp_error( $entry ), 'Fixture entry unavailable.' );
    $stored_before = $entry['date_created'];
    $api = new Gravity_Flow_API( (int) $record['form_id'] );
    $step = $api->get_current_step( $entry );
    wu17_assert( $step && $record['step_name'] === $step->get_name(), 'Gravity Flow current step differs from recorded authentic fixture state.' );
    $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
    wu17_assert( false !== strpos( $html, '۱۴۰۴/۱۰/۱۱، ۰۰:۰۰' ), 'Jalali/Persian created-at presentation missing.' );
    $stored_after = GFAPI::get_entry( $record['entry_id'] );
    wu17_assert( ! is_wp_error( $stored_after ) && $stored_before === $stored_after['date_created'] && $stored_before === $record['date_created'], 'Presentation mutated authoritative date_created.' );
    return array( 'date_created' => $stored_before, 'current_step' => $step->get_name() );
} );

wu17_test( 'WU17-RUNTIME-007', 'optional Due remains absent without blocking a ready card', function () use ( $manifest ) {
    list( $record, $entry ) = wu17_entry_for_form( $manifest, $manifest['forms'][0]['form_id'] );
    $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
    wu17_assert( false !== strpos( $html, 'gpp-inbox-card__readiness--ready' ), 'Optional Due absence disabled Card Mode.' );
    wu17_assert( false === strpos( $html, 'gpp-inbox-card__due' ), 'Unresolved Due was displayed.' );
    return $manifest['optional_capabilities'];
} );

wu17_test( 'WU17-RUNTIME-008', 'native authorization remains Gravity Flow-owned', function () use ( $manifest ) {
    $operator_total = 0;
    Gravity_Flow_API::get_inbox_entries(
        array( 'filter_key' => 'workflow_user_id_' . (int) $manifest['operator']['id'], 'user_id' => (int) $manifest['operator']['id'], 'paging' => array( 'page_size' => 100 ) ),
        $operator_total
    );
    $viewer_total = 0;
    Gravity_Flow_API::get_inbox_entries(
        array( 'filter_key' => 'workflow_user_id_' . (int) $manifest['viewer']['id'], 'user_id' => (int) $manifest['viewer']['id'], 'paging' => array( 'page_size' => 100 ) ),
        $viewer_total
    );
    wu17_assert( 25 === $operator_total, 'Assigned operator task count changed.' );
    wu17_assert( 0 === $viewer_total, 'Unassigned viewer gained Inbox tasks.' );
    return array( 'operator_tasks' => $operator_total, 'viewer_tasks' => $viewer_total );
} );

wu17_test( 'WU17-RUNTIME-009', 'presentation adapter does not own query polling navigation or grid reconciliation', function () use ( $repo_root ) {
    $source = file_get_contents( $repo_root . '/src/SRWF/GravityFlow/InboxPresentationAdapter.php' );
    wu17_assert( false !== strpos( $source, 'gravityflow_columns_inbox_table' ), 'Native column filter missing.' );
    wu17_assert( false !== strpos( $source, 'gravityflow_inbox_field_value' ), 'Native value filter missing.' );
    foreach ( array( 'get_inbox_entries(', 'applyTransaction(', 'register_rest_route(', '/inbox/changes', 'setQuickFilter', 'setInterval(', 'setTimeout(' ) as $forbidden ) {
        wu17_assert( false === strpos( $source, $forbidden ), 'Presentation adapter introduced forbidden behavior ownership: ' . $forbidden );
    }
    return 'Presentation remains two filters plus CSS; host owns data and behavior.';
} );

wu17_test( 'WU17-RUNTIME-010', 'mixed-readiness gate and sizing contract stay native-first and bounded', function () use ( $repo_root ) {
    $css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox.css' );
    $native_css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox-native.css' );
    wu17_assert( false !== strpos( $css, '@supports selector(:has(*))' ), 'Progressive selector gate missing.' );
    wu17_assert( false !== strpos( $css, ':not(:has(.ag-center-cols-container > .ag-row .gpp-inbox-card__readiness--unready))' ), 'One-unready-row veto missing.' );
    wu17_assert( false !== strpos( $native_css, ':not(:has(.ag-center-cols-container > .ag-row .gpp-inbox-card__readiness--unready))' ), 'Native-cell visibility veto missing.' );
    wu17_assert( false !== strpos( $css, '@media (max-width: 782px)' ), 'WordPress-aligned 782px breakpoint changed.' );
    wu17_assert( false === strpos( $css, '@container' ) && false === strpos( $css, 'container-type' ) && 0 === preg_match( '/^\s*max-width\s*:/m', $css ), 'Unproven production Container Query/max-width property was introduced.' );
    wu17_assert( false !== strpos( $css, 'width: 62px;' ) && false !== strpos( $css, 'height: 62px;' ), 'Avatar crop dimensions must remain pixel-based.' );
    wu17_assert( false !== strpos( $css, 'font-size: 1rem;' ) && false !== strpos( $css, 'padding: 1rem;' ), 'Inbox typography/content spacing did not adopt rem sizing.' );
    return 'Ready-only projection, one-unready native fallback, bounded rem sizing, no unproven container cap/query.';
} );

wu17_test( 'WU17-NEGATIVE-001', 'active Inbox profile with zero active bindings emits only an unready marker', function () use ( $manifest ) {
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
        wu17_assert( false === strpos( $html, '<article class="gpp-inbox-card"' ), 'Zero active bindings still emit a pseudo-success card.' );
        return 'Negative fault injection preserves native Gravity Flow fallback.';
    } finally {
        update_option( BindingSetLifecycle::OPTION_NAME, $original, false );
        InboxPresentationAdapter::resetRuntimeCache();
    }
} );

$result_path = trailingslashit( $artifact_dir ) . 'wu17-runtime-results.json';
file_put_contents( $result_path, wp_json_encode( array( 'suite' => 'PR4 authentic Inbox production runtime', 'results' => $GLOBALS['wu17_results'] ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
foreach ( $GLOBALS['wu17_results'] as $result ) {
    echo $result['status'] . ' ' . $result['id'] . ' ' . $result['name'] . PHP_EOL;
}
foreach ( $GLOBALS['wu17_results'] as $result ) {
    if ( 'PASS' !== $result['status'] ) {
        exit( 1 );
    }
}