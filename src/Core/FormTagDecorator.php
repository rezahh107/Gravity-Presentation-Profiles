<?php

namespace GravityPresentationProfiles\Core;

final class FormTagDecorator {
    public function addClasses( $form_tag, $classes ) {
        if ( ! is_string( $form_tag ) || '' === $form_tag || empty( $classes ) ) {
            return $form_tag;
        }

        $classes = array_values( array_unique( array_filter( array_map( 'strval', $classes ) ) ) );

        if ( empty( $classes ) ) {
            return $form_tag;
        }

        if ( preg_match( '/\bclass=(["\'])([^"\']*)\1/i', $form_tag, $match, PREG_OFFSET_CAPTURE ) ) {
            $existing = preg_split( '/\s+/', trim( $match[2][0] ) );
            $merged   = array_values( array_unique( array_filter( array_merge( $existing, $classes ) ) ) );
            $quote    = $match[1][0];
            $value    = htmlspecialchars( implode( ' ', $merged ), ENT_QUOTES, 'UTF-8' );
            $new_attr = 'class=' . $quote . $value . $quote;

            return substr_replace( $form_tag, $new_attr, $match[0][1], strlen( $match[0][0] ) );
        }

        $value = htmlspecialchars( implode( ' ', $classes ), ENT_QUOTES, 'UTF-8' );

        return preg_replace( '/<form\b/i', '<form class="' . $value . '"', $form_tag, 1 );
    }
}
