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
$users = array(); $forms = array(); $entry_ids = array(); $native_columns = array();
$synthetic_login = array();
foreach (array('a', 'b') as $key) {
    $login = 'p1c_native_' . $key;
    $assert(!username_exists($login), 'DUPLICATE_ACTOR');
    $password = wp_generate_password(36);
    $uid = wp_create_user($login, $password, $login . '@example.invalid');
    $synthetic_login[$key] = array('username'=>$login, 'password'=>$password);
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
            gmdate('Y-m-d H:i:s', strtotime('2026-02-01 00:00:00 UTC')+($count-$i)*60));
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
    $native_columns[$key] = $contract['column_ids'];
}
$snapshot = wu21_binding_lifecycle_reader()->snapshot(); $artifacts = array();
foreach ($snapshot['activations'] as $context=>$identity) {
    $record = $snapshot['installed'][$identity['binding_set_id']][$identity['binding_set_version']] ?? null;
    if (is_array($record) && ($record['context_key'] ?? null)===$context) { $artifacts[]=$record['artifact']; }
}
update_option('gpp_wu21_binding_sets', $artifacts, false);
$oracle = array(); $fifo_a = array();
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
        if ($actor === 'a' && $key === 'a') {
            // Read chronology from the Native-authorized entries, independent of GPP's renderer.
            usort($entries, static function ($a, $b) {
                return strcmp($a['date_created'], $b['date_created']) ?: (int)$a['id'] <=> (int)$b['id'];
            });
            $fifo_a = array_map('intval', array_column($entries, 'id'));
        }
    }
}
$assert(count($oracle['a']['a'])===25 && count($oracle['b']['b'])===3
    && !$oracle['a']['b'] && !$oracle['b']['a'], 'INDEPENDENT_NATIVE_AB_ISOLATION');
$assert($fifo_a !== $oracle['a']['a'], 'FIFO_ORACLE_MUST_DIFFER_FROM_SORTED_ENTRY_IDS');
// Extend the existing WU21 Native Task Model comparison to this Atomic fixture.
wp_set_current_user($users['a']);
$model = gravity_flow()->container()->get(\Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL);
$task_args = array('form_id'=>$forms['a'],'paging'=>array('offset'=>0,'page_size'=>2001),
    'is_shortcode'=>true,'context_key'=>'',
    'detail_base_url'=>add_query_arg(array('page'=>'gravityflow-inbox','view'=>'entry'),
        get_permalink($previous['frontend_inbox_page_id'])));
$defs = array_column($model->get_table_header_defs($task_args), 'displayKey', 'field');
$cells_a = array();
$fields_by_cell = array('name'=>$native_columns['a'][1], 'national-id'=>$native_columns['a'][2],
    'school-grade'=>$native_columns['a'][3]);
foreach ($model->get_inbox_tasks($task_args) as $task) {
    $id = (int)$task['id'];
    $assert(in_array($id, $fifo_a, true) && !isset($cells_a[$id]), 'NATIVE_CELL_ENTRY_IDENTITY');
    foreach ($fields_by_cell as $cell=>$field) {
        $display = $defs[$field] ?? null;
        $raw = $display === null ? null : ($task[$display] ?? null);
        $assert(is_string($raw) || is_numeric($raw), 'NATIVE_DISPLAY_CELL_MISSING');
        $assert(!preg_match('/<[a-z\/!][\s\S]*>/i', (string)$raw), 'NATIVE_DISPLAY_CELL_NOT_TEXT');
        $cells_a[$id][$cell] = html_entity_decode((string)$raw, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
$assert(count($cells_a) === count($fifo_a), 'NATIVE_CELL_ORACLE_INCOMPLETE');
wp_set_current_user(1);
$page=wp_insert_post(array('post_type'=>'page','post_status'=>'draft',
    'post_title'=>'P1C Authentic Elementor Editor Page','post_content'=>''),true);
$assert(!is_wp_error($page) && $page>0,'EDITOR_PAGE');
update_post_meta($page,'_elementor_edit_mode','builder');
$assert(!get_post_meta($page,'_elementor_data',true),'EDITOR_NOT_EMPTY');
$m=array('data_class'=>'SYNTHETIC_NON_PII','post_id'=>(int)$page,
    'native_page_id'=>(int)$previous['frontend_inbox_page_id'],
    'forms'=>$forms,'users'=>$users,'entry_ids'=>$entry_ids,'native_oracle'=>$oracle,
    'native_fifo_a'=>$fifo_a,'native_cells_a'=>$cells_a);
update_option('gpp_p1c_fixture_manifest',$m,false);
file_put_contents(getenv('WU21_ARTIFACT_DIR').'/p1c-atomic-fixture.json',wp_json_encode($m,JSON_PRETTY_PRINT));
// For the independently launched browser, use real WordPress form login.
// The test-only file is outside the artifact directory, inside a private
// runner temporary directory; its parent is removed by the workflow trap.
$login_file = getenv('P1C_LOGIN_FILE');
if ($login_file) {
    if (file_exists($login_file) || is_link($login_file) ||
        (fileperms(dirname($login_file)) & 0077) !== 0) {
        throw new RuntimeException('P1C_LOGIN_FIXTURE_PATH_NOT_PRIVATE');
    }
    $previous_umask = umask(0077);
    try {
        if (file_put_contents($login_file, wp_json_encode($synthetic_login), LOCK_EX) === false) {
            throw new RuntimeException('P1C_LOGIN_FIXTURE_WRITE_FAILED');
        }
    } finally {
        umask($previous_umask);
    }
}
unset($synthetic_login, $password);
echo "P1C_SYNTHETIC_NATIVE_SETUP_PASS\n";
