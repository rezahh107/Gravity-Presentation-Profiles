<?php
/** Test-only: admit Inbox through the same production setup as an Owner. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\GravityForms\InboxSetupService;
$manifest = get_option( 'gpp_srwf_journey_host_manifest' );
$form_id = (int) $manifest['form_id'];
$form = GFAPI::get_form( $form_id );
foreach ( array( 101 => 'fileupload', 102 => 'text', 103 => 'text' ) as $id => $type ) {
    if ( ! GFAPI::get_field( $form, $id ) ) {
        $form['fields'][] = GF_Fields::create( array( 'id' => $id, 'type' => $type, 'label' => 'Synthetic Inbox ' . $id ) );
    }
}
if ( true !== GFAPI::update_form( $form ) ) { throw new RuntimeException( 'Inbox fixture fields failed.' ); }
$operations = OperationsSetupService::forWordPress();
$context = $operations->bindingContext( $form_id );
$lifecycle = new BindingSetLifecycle( new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ), new EvidenceReferenceGate( array() ) );
$repair = BindingRepairService::forWordPress();
foreach ( array( 'student.photo' => 101, 'education.grade_group' => 102, 'school.name' => 103 ) as $slot => $id ) {
    $active = $lifecycle->resolve( $context );
    $result = $repair->repairField( array(
        'context_key' => $lifecycle->contextKey( $context ),
        'binding_set_id' => $active['binding_set_id'],
        'binding_set_version' => $active['binding_set_version'],
        'semantic_slot_key' => $slot, 'field_id' => (string) $id,
    ) );
    if ( ! in_array( $result['status'], array( 'REPAIRED_AND_ACTIVATED', 'UNCHANGED' ), true ) ) {
        throw new RuntimeException( 'Inbox mapping failed: ' . wp_json_encode( $result ) );
    }
}
$result = InboxSetupService::forWordPress()->initialize( array( 'form_id' => $form_id ) );
if ( InboxSetupService::STATUS_COMPLETED !== $result['status'] ) {
    throw new RuntimeException( 'Inbox admission failed: ' . wp_json_encode( $result ) );
}
echo "SRWF_JOURNEY_INBOX_SETUP_PASS\n";
