<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Privacy boundary for field-backed Entry Detail semantics.
 *
 * Gravity Flow 3.1.0 owns the field display predicate. This adapter mirrors only
 * the small native step-selection prelude used by Gravity_Flow_Entry_Detail::fields()
 * and delegates the actual decision to Gravity_Flow_Entry_Detail::is_display_field().
 * It never reads an entry value.
 */
final class EntryDetailFieldVisibility {
    public function decide( $field, $form, $entry, $current_step ) {
        if ( ! is_object( $field ) || ! is_array( $form ) || ! is_array( $entry ) || empty( $entry['form_id'] ) ) {
            return $this->unavailable( 'invalid_visibility_context' );
        }
        if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) || ! method_exists( 'Gravity_Flow_Entry_Detail', 'is_display_field' ) ) {
            return $this->unavailable( 'native_visibility_predicate_unavailable' );
        }
        if ( ! class_exists( 'GFCommon' ) || ! method_exists( 'GFCommon', 'is_product_field' ) ) {
            return $this->unavailable( 'gravity_forms_visibility_context_unavailable' );
        }

        try {
            $display_step = $this->nativeDisplayStep( $entry, $current_step );
            if ( false === $display_step ) {
                return $this->unavailable( 'native_visibility_step_unavailable' );
            }

            // Native Gravity Flow clears adminOnly before evaluating its own
            // predicate. Clone the field so proving visibility does not mutate
            // the form object before Gravity Flow renders its native grid.
            $visibility_field = clone $field;
            $visibility_field->adminOnly = false;
            $is_product_field = \GFCommon::is_product_field( $visibility_field->type );
            $visible = \Gravity_Flow_Entry_Detail::is_display_field(
                $visibility_field,
                $display_step,
                $form,
                $entry,
                $is_product_field
            );

            return array(
                'proven' => true,
                'visible' => (bool) $visible,
                'reason' => $visible ? null : 'host_hidden',
            );
        } catch ( \Throwable $exception ) {
            return $this->unavailable( 'native_visibility_predicate_failed' );
        }
    }

    /**
     * Reproduces the exact step-selection branch observed in pinned Gravity Flow
     * 3.1.0 before its public is_display_field() predicate is called.
     *
     * @return object|null|false Step/null when proven; false when the host
     *                           context cannot be established safely.
     */
    private function nativeDisplayStep( $entry, $current_step ) {
        $is_assignee = false;
        if ( $current_step ) {
            if ( ! is_object( $current_step ) || ! method_exists( $current_step, 'is_user_assignee' ) ) {
                return false;
            }
            $is_assignee = (bool) $current_step->is_user_assignee();
        }

        if ( $current_step && $is_assignee ) {
            return $current_step;
        }

        if ( ! function_exists( 'gravity_flow' ) ) {
            return false;
        }
        $flow = gravity_flow();
        if ( ! is_object( $flow ) || ! method_exists( $flow, 'get_workflow_complete_step' ) || ! method_exists( $flow, 'get_workflow_start_step' ) ) {
            return false;
        }

        $form_id = (int) $entry['form_id'];
        $complete_step = $flow->get_workflow_complete_step( $form_id, $entry );
        if ( ! $current_step ) {
            return $complete_step;
        }

        $display_step = ! empty( $_POST )
            ? $current_step
            : $flow->get_workflow_start_step( $form_id, $entry );

        if ( ! method_exists( $current_step, 'get_current_assignee_status' ) ) {
            return false;
        }
        $status = $current_step->get_current_assignee_status();
        if ( in_array( $status, array( 'complete', 'approved' ), true ) ) {
            $display_step = $complete_step;
        }

        return $display_step;
    }

    private function unavailable( $reason ) {
        return array(
            'proven' => false,
            'visible' => false,
            'reason' => $reason,
        );
    }
}
