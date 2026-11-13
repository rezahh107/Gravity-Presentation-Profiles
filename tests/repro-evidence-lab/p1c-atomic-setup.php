<?php
/** Disposable WU21-only authentic low-privilege Native task fixture. */
if (!defined('ABSPATH') || !getenv('WU21_ARTIFACT_DIR') || !class_exists('GFAPI')) {
    throw new RuntimeException('P1C_DISPOSABLE_HOST_REQUIRED');
}
$previous = get_option('gpp_wu21_fixture_manifest');
if (!is_array($previous) || empty($previous['frontend_inbox_page_id']) ||
    get_option('gpp_p1c_fixture_manifest', false)) {
    throw new RuntimeException('P1C_BASE_MISSING_OR_ALREADY_CREATED');
}
require_once __DIR__ . '/setup-fixtures.php'; // Reuses WU21 real GF/Flow fixture helpers.
$assert = static function ($ok, $why) {
    if (!$ok) { throw new RuntimeException('P1C_' . $why); }
};
$users = array(); $forms = array(); $entry_ids = array();
foreach (array('a', 'b') as $key) {
    $login = 'p1c_native_' . $key;
    $assert(!username_exists($login), 'DUPLICATE_ACTOR');
    $uid = wp_create_user($login, wp_generate_password(36), $login . '@example.invalid');
    $assert(!is_wp_error($uid) && $uid > 0, 'USER_CREATE');
    $user = new WP_User($uid); $user->set_role('subscriber');
    $assert(!$user->has_cap('manage_options'), 'NOT_LOW_PRIVILEGE');
    $users[$key] = (int) $uid;
}
$fields = array('first_name'=>1,'last_name'=>2,'photo'=>3,'national_id'=>4,'grade_group'=>5,'school'=>6);
$ops = \GravityPresentationProfiles\GravityForms\OperationsSetupService::forWordPress();
$repair = \GravityPresentationProfiles\GravityForms\BindingRepairService::forWordPress();
$inbox = \GravityPresentationProfiles\GravityForms\InboxSetupService::forWordPress();
foreach ($users as $key=>$uid) {
    $fid = wu21_add_form('P1C Synthetic ' . strtoupper($key), $fields);
    $step = wu21_add_approval_step($fid, 'P1C Approved Reader ' . strtoupper($key), $uid);
    $out = $ops->initialize(array('form_id'=>$fid));
    $assert(($out['status'] ?? null) === \GravityPresentationProfiles\GravityForms\OperationsSetupService::STATUS_COMPLETED, 'OPS_SETUP');
    foreach (array(
        'student.photo'=>$fields['photo'], 'student.first_name'=>$fields['first_name'],
        'student.last_name'=>$fields['last_name'], 'student.national_id'=>$fields['national_id'],
        'education.grade_group'=>$fields['grade_group'], 'school.name'=>$fields['school'],
    ) as $slot=>$field_id) {
        wu21_map_field_through_product($repair, $ops, $fid, $slot, $field_id);
    }
    $out = $inbox->initialize(array('form_id'=>$fid));
    $assert(($out['status'] ?? null) === \GravityPresentationProfiles\GravityForms\InboxSetupService::STATUS_COMPLETED, 'INBOX_SETUP');
    $ids = array();
    // Force a real 20+ task Atomic pagination case for actor A, separate
    // from the prior shortcode-only 25-task regression.
    $count = $key === 'a' ? 25 : 3;
    for ($i=1; $i<=$count; ++$i) {
        $id = GFAPI::add_entry(array(
            'form_id'=>$fid, 'created_by'=>$uid, '1'=>'P1C', '2'=>strtoupper($key) . ' Student ' . $i,
            '4'=>sprintf('SYN-P1C-%s-%04d', strtoupper($key), $i), '5'=>'گروه مصنوعی', '6'=>'مدرسه آزمایشی'
        ));
        $assert(!is_wp_error($id) && $id>0, 'ENTRY_CREATE');
        GFAPI::update_entry_property($id, 'date_created',
            gmdate('Y-m-d H:i:s', strtotime('2026-02-01 00:00:00 UTC')+$i*60));
        $api = new Gravity_Flow_API($fid); $api->process_workflow($id);
        $current = $api->get_current_step(GFAPI::get_entry($id));
        $assert($current && (int)$current->get_id()===$step, 'WORKFLOW_ASSIGNMENT');
        $ids[] = (int)$id;
    }
    $forms[$key]=$fid; $entry_ids[$key]=$ids;
    // The fixture creates forms and activates bindings in this same WP-CLI
    // process. The host's per-request geometry cache predates those writes.
    // Revalidate against the newly persisted lifecycle rather than asserting
    // the deliberately stale process-local snapshot.
    \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::resetRuntimeCache();
    $contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract(array('form_id'=>$fid));
    $assert(is_array($contract) && count($contract['column_ids'] ?? array())===5, 'NATIVE_COLUMNS');
}
$snapshot = wu21_binding_lifecycle_reader()->snapshot(); $artifacts = array();
foreach ($snapshot['activations'] as $context=>$identity) {
    $record = $snapshot['installed'][$identity['binding_set_id']][$identity['binding_set_version']] ?? null;
    if (is_array($record) && ($record['context_key'] ?? null)===$context) { $artifacts[]=$record['artifact']; }
}
update_option('gpp_wu21_binding_sets', $artifacts, false);
$oracle = array();
foreach ($users as $actor=>$uid) {
    wp_set_current_user($uid);
    foreach ($forms as $key=>$fid) {
        $args = apply_filters('gravityflow_inbox_args', array_merge(Gravity_Flow_Inbox::get_defaults(), array(
            'form_id'=>$fid,'paging'=>array('offset'=>0,'page_size'=>2001)
        )));
        $total=0; $entries=Gravity_Flow_API::get_inbox_entries($args,$total);
        $assert(is_array($entries) && $total===count($entries), 'NATIVE_ORACLE');
        $ids=array_map('intval',array_column($entries,'id')); sort($ids,SORT_NUMERIC);
        $oracle[$actor][$key]=$ids;
    }
}
$assert(count($oracle['a']['a'])===25 && count($oracle['b']['b'])===3
    && !$oracle['a']['b'] && !$oracle['b']['a'], 'INDEPENDENT_NATIVE_AB_ISOLATION');
wp_set_current_user(1);
$page=wp_insert_post(array('post_type'=>'page','post_status'=>'draft',
    'post_title'=>'P1C Authentic Elementor Editor Page','post_content'=>''),true);
$assert(!is_wp_error($page) && $page>0,'EDITOR_PAGE');
update_post_meta($page,'_elementor_edit_mode','builder');
$assert(!get_post_meta($page,'_elementor_data',true),'EDITOR_NOT_EMPTY');
$m=array('data_class'=>'SYNTHETIC_NON_PII','post_id'=>(int)$page,
    'native_page_id'=>(int)$previous['frontend_inbox_page_id'],
    'forms'=>$forms,'users'=>$users,'entry_ids'=>$entry_ids,'native_oracle'=>$oracle);
update_option('gpp_p1c_fixture_manifest',$m,false);
file_put_contents(getenv('WU21_ARTIFACT_DIR').'/p1c-atomic-fixture.json',wp_json_encode($m,JSON_PRETTY_PRINT));
echo "P1C_SYNTHETIC_NATIVE_SETUP_PASS\n";
