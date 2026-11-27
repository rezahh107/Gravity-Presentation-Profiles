<?php
namespace GravityPresentationProfiles\Elementor;

use Elementor\Modules\AtomicWidgets\Controls\Section;
use Elementor\Modules\AtomicWidgets\Controls\Types\Text_Control;
use Elementor\Modules\AtomicWidgets\Elements\Base\Atomic_Widget_Base;
use Elementor\Modules\AtomicWidgets\Elements\Base\Has_Template;
use Elementor\Modules\AtomicWidgets\PropTypes\Classes_Prop_Type;
use Elementor\Modules\AtomicWidgets\PropTypes\Primitives\String_Prop_Type;
use Elementor\Modules\AtomicWidgets\Styles\Style_Definition;
use Elementor\Modules\AtomicWidgets\Styles\Style_Variant;

/** Genuine Elementor V4 widget; Twig is deliberately data-free. */
final class Inbox2AtomicWidget extends Atomic_Widget_Base {
    use Has_Template;

    public static function get_element_type(): string { return Inbox2AtomicIntegration::TYPE; }

    public function get_title() { return __( 'GPP — Inbox 2', 'gravity-presentation-profiles' ); }

    public function get_icon() { return 'eicon-post-list'; }

    protected static function define_props_schema(): array {
        return array(
            'classes' => Classes_Prop_Type::make()->default( array() ),
            'form_id' => String_Prop_Type::make()->default( '' ),
            'native_page_id' => String_Prop_Type::make()->default( '' ),
        );
    }

    protected function define_atomic_controls(): array {
        return array(
            Section::make()->set_label( __( 'Inbox source', 'gravity-presentation-profiles' ) )
                ->set_id( 'gpp-inbox2-source' )->set_items( array(
                    Text_Control::bind_to( 'form_id' )
                        ->set_label( __( 'Gravity Forms form ID', 'gravity-presentation-profiles' ) ),
                    Text_Control::bind_to( 'native_page_id' )
                        ->set_label( __( 'Published Native Gravity Flow Inbox page ID', 'gravity-presentation-profiles' ) ),
                ) ),
        );
    }

    protected function define_base_styles(): array {
        return array( 'base' => Style_Definition::make()->add_variant( Style_Variant::make() ) );
    }

    protected function get_templates(): array {
        return array( 'gpp/inbox2-atomic' => dirname( __DIR__, 2 ) . '/templates/inbox2-atomic.html.twig' );
    }
}
