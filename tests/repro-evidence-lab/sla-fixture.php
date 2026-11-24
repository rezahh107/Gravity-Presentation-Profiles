<?php
/** Disposable lab only. Existing Native GF/Flow APIs and GPP setup services. */
if (!defined('ABSPATH') || getenv('SLA_DISPOSABLE')!=='1' || !class_exists('GFAPI')) throw new RuntimeException('SLA_DISPOSABLE_HOST_REQUIRED');
require_once getenv('SLA_PRODUCT_ROOT').'/tests/repro-evidence-lab/setup-fixtures.php';
function sla_require($ok,$label) { if (!$ok) throw new RuntimeException($label); }
sla_require(!get_option('gpp_sla_manifest',false),'SLA_EXISTING_FIXTURE');
sla_require(!is_link(WP_PLUGIN_DIR.'/gravity-presentation-profiles') && !class_exists('Elementor\\Plugin'),'SLA_INSTALL_IDENTITY');
$users=[];$credentials=[];
foreach (['officer','accountant','applicant'] as $role) {
    $login='sla_synthetic_'.$role;
    $password=wp_generate_password(36);
    $uid=wp_create_user($login,$password,$login.'@example.invalid');
    sla_require(!is_wp_error($uid) && $uid>0,'SLA_USER_CREATE');
    $u=new WP_User($uid);$u->set_role('subscriber');
    sla_require(!$u->has_cap('manage_options'),'SLA_NOT_LOW_PRIVILEGE');
    update_user_meta($uid,'locale','fa_IR');
    $users[$role]=(int)$uid;
    $credentials[$role]=['username'=>$login,'password'=>$password];
}
wp_set_current_user(1);
$fields=['first_name'=>1,'last_name'=>2,'photo'=>3,'national_id'=>4,'grade_group'=>5,'school'=>6];
$fid=wu21_add_form('SLA Synthetic Registration',$fields);
$api=new Gravity_Flow_API($fid);
$steps=[];
foreach (['officer'=>'Registration Officer Approval','accountant'=>'Accountant Approval'] as $actor=>$name) {
    $sid=$api->add_step(['step_name'=>$name,'step_type'=>'approval','description'=>'Synthetic authorized operational acceptance only',
        'type'=>'select','assignees'=>['user_id|'.$users[$actor]],'assignee_policy'=>'all',
        'note_mode'=>'not_required','confirmation_prompt'=>'1']);
    sla_require(!is_wp_error($sid) && $sid>0,'SLA_NATIVE_STEP_CREATE');
    $steps[$actor]=(int)$sid;
}
$api=new Gravity_Flow_API($fid);
foreach ($steps as $actor=>$id) {
    $s=$api->get_step($id);
    sla_require($s && $s->get_type()==='approval','SLA_NATIVE_STEP_TYPE');
    $meta=$s->get_feed_meta();
    sla_require(array_values((array)($meta['assignees']??[]))===['user_id|'.$users[$actor]]
        && (string)($meta['confirmation_prompt']??'')==='1','SLA_NATIVE_STEP_SETTINGS');
}
$ops=\GravityPresentationProfiles\GravityForms\OperationsSetupService::forWordPress();
$repair=\GravityPresentationProfiles\GravityForms\BindingRepairService::forWordPress();
$inbox=\GravityPresentationProfiles\GravityForms\InboxSetupService::forWordPress();
$detail=\GravityPresentationProfiles\GravityForms\EntryDetailSetupService::forWordPress();
sla_require(($ops->initialize(['form_id'=>$fid])['status']??null)==='COMPLETED','SLA_OPERATIONS_SETUP');
foreach (['student.photo'=>3,'student.first_name'=>1,'student.last_name'=>2,'student.national_id'=>4,'education.grade_group'=>5,'school.name'=>6] as $slot=>$field)
    wu21_map_field_through_product($repair,$ops,$fid,$slot,$field);
// Inbox availability proofs are scoped to the exact active binding version.
$initial_inbox=$inbox->initialize(['form_id'=>$fid]);
sla_require(($initial_inbox['status']??null)==='COMPLETED','SLA_INBOX_SETUP');
function sla_geometry($fid) {
    \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::resetRuntimeCache();
    return \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract(['form_id'=>$fid]);
}
$before_detail=sla_geometry($fid);
sla_require(is_array($before_detail)&&count($before_detail['column_ids']??[])===5,'SLA_INITIAL_INBOX_GEOMETRY');
$detail_result=$detail->initialize(['form_id'=>$fid]);
sla_require(($detail_result['status']??null)==='COMPLETED','SLA_DETAIL_SETUP');
$after_detail=sla_geometry($fid);
// Detail setup can advance the shared binding version. Re-run the existing
// supported Inbox setup service to qualify availability for the new version;
// never copy proofs or bypass the consumer's fail-closed check.
$requalified=$inbox->initialize(['form_id'=>$fid]);
$contract=sla_geometry($fid);
$setup_trace=['before_detail'=>$before_detail,'after_detail'=>$after_detail,'after_inbox_requalification'=>$contract,
    'initial_inbox_readiness'=>$initial_inbox['steps']['runtime_readiness']??null,
    'detail_readiness'=>$detail_result['steps']['runtime_readiness']??null,
    'final_inbox_readiness'=>$requalified['steps']['runtime_readiness']??null,
    'final_inbox_status'=>$requalified['status']??null];
file_put_contents(getenv('WU21_ARTIFACT_DIR').'/sla-binding-requalification.json',wp_json_encode($setup_trace,JSON_PRETTY_PRINT));
sla_require(($requalified['status']??null)==='COMPLETED','SLA_INBOX_REQUALIFICATION');
sla_require(is_array($contract) && count($contract['column_ids']??[])===5,'SLA_NATIVE_COLUMN_SETUP');
$native_page=wp_insert_post(['post_type'=>'page','post_status'=>'publish','post_title'=>'فهرست بومی آزمایشی',
    'post_content'=>'[gravityflow page="inbox" form="'.$fid.'"]'],true);
sla_require(!is_wp_error($native_page) && $native_page>0,'SLA_NATIVE_PAGE');
$page=wp_insert_post(['post_type'=>'page','post_status'=>'publish','post_title'=>'صف آزمایشی ثبت نام',
    'post_content'=>'[gpp_inbox_2 form="'.$fid.'" native_page="'.$native_page.'"]'],true);
sla_require(!is_wp_error($page)&&$page>0,'SLA_SHORTCODE_PAGE');
// A normal, visible site-navigation link in the existing Native Inbox page.
// It does not change the Native Detail route, permissions or workflow.
$link='<p><a id="sla-return-shortcode" href="'.esc_url(get_permalink($page)).'">بازگشت به صف پرونده‌ها</a></p>';
$updated=wp_update_post(['ID'=>$native_page,'post_content'=>$link.'[gravityflow page="inbox" form="'.$fid.'"]'],true);
sla_require(!is_wp_error($updated)&&$updated===$native_page,'SLA_ORDINARY_RETURN_LINK');
$entries=[];$names=['آرمان آزمایشی','نیلوفر آزمایشی','کیان آزمایشی','یاسمن آزمایشی','پژمان آزمایشی'];
for($i=1;$i<=25;$i++){
    $id=GFAPI::add_entry(['form_id'=>$fid,'created_by'=>$users['applicant'],'1'=>$names[($i-1)%5],
        '2'=>'پرونده ساختگی '.sprintf('%02d',$i),'4'=>'SLA-SYN-'.sprintf('%04d',$i),'5'=>'پایه یازدهم','6'=>'مدرسه آزمایشی']);
    sla_require(!is_wp_error($id)&&$id>0,'SLA_ENTRY_CREATE');
    $date=gmdate('Y-m-d H:i:s',strtotime('2026-02-01 00:00:00 UTC')+intdiv($i-1,2)*60);
    $changed=GFAPI::update_entry_property((int)$id,'date_created',$date);
    sla_require(!is_wp_error($changed)&&$changed!==false,'SLA_ENTRY_DATE');
    $api=new Gravity_Flow_API($fid);$api->process_workflow((int)$id);
    $entry=GFAPI::get_entry((int)$id);$step=$api->get_current_step($entry);
    sla_require(is_array($entry)&&$entry['date_created']===$date&&$step&&(int)$step->get_id()===$steps['officer'],'SLA_NATIVE_INITIAL_STEP');
    $entries[]=(int)$id;
}
$m=['data_class'=>'SYNTHETIC_NON_PII','sourceHead'=>getenv('SLA_SOURCE_HEAD'),'form_id'=>(int)$fid,
    'users'=>$users,'steps'=>$steps,'entries'=>$entries,'fields'=>$fields,'native_columns'=>$contract['column_ids'],
    'url'=>get_permalink((int)$page),'native_url'=>get_permalink((int)$native_page),
    'native_page_id'=>(int)$native_page,'page_id'=>(int)$page,'locale'=>get_locale(),
    'timezone'=>wp_timezone_string(),'theme'=>get_stylesheet(),'detail_setup'=>'COMPLETED',
    'workflow_authority'=>'SRWF Master Authority 1.9.0: Officer Approval -> Accountant Approval; no financial fields',
    'return_configuration'=>'ordinary site hyperlink on Native Inbox page; no product override'];
update_option('gpp_sla_manifest',$m,false);
sla_require(file_put_contents(getenv('WU21_ARTIFACT_DIR').'/sla-fixture.json',wp_json_encode($m,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE))!==false,'SLA_FIXTURE_EVIDENCE');
$file=getenv('SLA_LOGIN_FILE');
sla_require(is_string($file)&&!file_exists($file)&&!is_link($file)&&(fileperms(dirname($file))&0077)===0,'SLA_PRIVATE_LOGIN_FILE');
$old=umask(0077);
try { sla_require(file_put_contents($file,wp_json_encode($credentials),LOCK_EX)!==false,'SLA_PRIVATE_LOGIN_WRITE'); }
finally { umask($old); }
unset($credentials,$password);
echo "SLA_SYNTHETIC_NATIVE_SETUP_PASS\n";
