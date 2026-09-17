<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Presentation-only resolver for already-bound Inbox Gravity Forms fields.
 *
 * Binding identity and source ownership stay with EnvironmentBindingSet. This
 * class only distinguishes the host's raw stored value, human display text,
 * and file/media representation for Inbox rendering/search support.
 */
final class InboxFieldPresentationResolver {
    private $reader;

    public function __construct( BoundHostValueReader $reader = null ) {
        $this->reader = $reader ?: new BoundHostValueReader();
    }

    public function resolveText( $source, $form, $entry ) {
        $raw = $this->reader->readRaw( $source, $form, $entry );
        $display = $this->reader->readDisplay( $source, $form, $entry );

        $display_text = $this->normalizeText( $display );
        $raw_search_text = $this->normalizeSearchText( $raw );

        // A healthy binding/source must not become unavailable merely because
        // a host formatter cannot produce text. Fall back to the raw source for
        // presentation without mutating readiness or binding state.
        if ( null === $display_text ) {
            $display_text = $raw_search_text;
        }

        $search_parts = array();
        foreach ( array( $display_text, $raw_search_text ) as $part ) {
            if ( null !== $part && '' !== $part && ! in_array( $part, $search_parts, true ) ) {
                $search_parts[] = $part;
            }
        }

        return array(
            'raw' => $raw,
            'display_text' => $display_text,
            'raw_search_text' => $raw_search_text,
            'search_text' => empty( $search_parts ) ? null : implode( ' ', $search_parts ),
        );
    }

    public function resolvePhoto( $source, $form, $entry ) {
        if ( ! is_array( $source ) || 'gravity_forms.field' !== ( isset( $source['type'] ) ? $source['type'] : null ) || ! is_array( $entry ) ) {
            return $this->photoResult( 'unsupported_source' );
        }
        if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_field' ) ) {
            return $this->photoResult( 'host_api_unavailable' );
        }

        $field = \GFAPI::get_field( $form, isset( $source['field_id'] ) ? $source['field_id'] : null );
        if ( ! is_object( $field ) ) {
            return $this->photoResult( 'field_unavailable' );
        }

        $input_type = method_exists( $field, 'get_input_type' ) ? $field->get_input_type() : ( isset( $field->type ) ? $field->type : null );
        if ( 'fileupload' !== $input_type || ! method_exists( $field, 'to_array' ) || ! method_exists( $field, 'get_download_url' ) || ! method_exists( $field, 'get_file_name_from_url' ) ) {
            return $this->photoResult( 'unsupported_field_type' );
        }

        $raw = $this->reader->readRaw( $source, $form, $entry );
        if ( null === $raw || '' === trim( is_scalar( $raw ) ? (string) $raw : '' ) ) {
            return $this->photoResult( 'missing' );
        }

        $files = $field->to_array( $raw );
        if ( ! is_array( $files ) ) {
            return $this->photoResult( 'malformed' );
        }

        $urls = array();
        foreach ( $files as $file ) {
            if ( ! is_scalar( $file ) ) {
                continue;
            }
            $file = trim( (string) $file );
            if ( '' !== $file ) {
                $urls[] = $file;
            }
        }

        if ( empty( $urls ) ) {
            return $this->photoResult( 'missing' );
        }
        if ( 1 !== count( $urls ) ) {
            // student.photo is singular. No authority currently defines which
            // file wins when a multi-file field contains multiple candidates.
            return $this->photoResult( 'multiple_files_selection_unproven' );
        }

        $stored_url = $urls[0];
        $name_metadata = $field->get_file_name_from_url( $stored_url );
        if ( ! is_array( $name_metadata ) || empty( $name_metadata['sanitized'] ) || ! is_string( $name_metadata['sanitized'] ) ) {
            return $this->photoResult( 'malformed' );
        }

        $name = trim( $name_metadata['sanitized'] );
        $extension = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
        if ( ! in_array( $extension, array( 'jpg', 'jpeg', 'png', 'gif', 'webp' ), true ) ) {
            return $this->photoResult( 'not_image' );
        }

        $entry_id = isset( $entry['id'] ) ? (int) $entry['id'] : 0;
        $download_url = $field->get_download_url( $stored_url, false, $entry_id );
        if ( ! is_string( $download_url ) || '' === trim( $download_url ) ) {
            return $this->photoResult( 'unresolvable' );
        }

        $url = function_exists( 'esc_url_raw' )
            ? esc_url_raw( $download_url, array( 'http', 'https' ) )
            : filter_var( $download_url, FILTER_VALIDATE_URL );
        if ( ! is_string( $url ) || '' === $url ) {
            return $this->photoResult( 'invalid_url' );
        }

        return array(
            'status' => 'resolved',
            'url' => $url,
            'name' => $name,
            'raw' => $raw,
            'field_type' => $input_type,
            'multiple_files' => ! empty( $field->multipleFiles ),
        );
    }

    private function normalizeSearchText( $value ) {
        $parts = array();
        $this->appendSearchParts( $value, $parts );
        $parts = array_values( array_unique( array_filter( $parts, static function ( $item ) { return '' !== $item; } ) ) );
        return empty( $parts ) ? null : implode( ' ', $parts );
    }

    private function appendSearchParts( $value, &$parts ) {
        if ( is_array( $value ) ) {
            foreach ( $value as $item ) {
                $this->appendSearchParts( $item, $parts );
            }
            return;
        }
        if ( ! is_scalar( $value ) ) {
            return;
        }
        $text = $this->normalizeText( $value );
        if ( null !== $text ) {
            $parts[] = $text;
        }
    }

    private function normalizeText( $value ) {
        if ( null === $value || ! is_scalar( $value ) ) {
            return null;
        }
        $text = trim( wp_strip_all_tags( (string) $value ) );
        return '' === $text ? null : $text;
    }

    private function photoResult( $status ) {
        return array(
            'status' => $status,
            'url' => null,
            'name' => null,
            'raw' => null,
            'field_type' => null,
            'multiple_files' => null,
        );
    }
}
