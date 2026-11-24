<?php
/** Native-only readback and legitimate synthetic arrival, CLI inside disposable runner. */
if (!defined('ABSPATH') || getenv('SLA_DISPOSABLE')!=='1') throw new RuntimeException('SLA_NATIVE_HOST_REQUIRED');
$m=get_option('gpp_sla_manifest');if(!is_array($m))throw new RuntimeException('SLA_MANIFEST_MISSING');
$actor=getenv('SLA_ACTOR');$kind=getenv('SLA_OPERATION');
if (!in_array($actor,['officer','accountant','applicant'],true))throw new RuntimeException('SLA_ACTOR_INVALID');
$fid=(int)$m['form_id'];wp_set_current_user((int)$m['users'][$actor]);
if($kind==='arrival'){
    // Model a legitimate new synthetic registration via GF/Flow's public APIs,
    // not a fake Approval or an edit to workflow metadata.
    if($actor!=='applicant')throw new RuntimeException('SLA_ARRIVAL_ACTOR');
    $id=GFAPI::add_entry(['form_id'=>$fid,'created_by'=>$m['users']['applicant'],
        '1'=>'ورود آزمایشی','2'=>'پرونده تازه','4'=>'SLA-SYN-NEW','5'=>'پایه یازدهم','6'=>'مدرسه آزمایشی']);
    if(is_wp_error($id)||$id<1)throw new RuntimeException('SLA_ARRIVAL_FAILED');
    $api=new Gravity_Flow_API($fid);$api->process_workflow((int)$id);
    $entry=GFAPI::get_entry((int)$id);$step=$api->get_current_step($entry);
    if(!$step||(int)$step->get_id()!==$m['steps']['officer'])throw new RuntimeException('SLA_ARRIVAL_NOT_OFFICER');
    $m['entries'][]=(int)$id;update_option('gpp_sla_manifest',$m,false);
    echo wp_json_encode(['entry'=>(int)$id,'step'=>(int)$step->get_id(),'date_created'=>$entry['date_created']]);return;
}
if($kind!=='read')throw new RuntimeException('SLA_OPERATION_INVALID');
$args=apply_filters('gravityflow_inbox_args',array_merge(Gravity_Flow_Inbox::get_defaults(),['form_id'=>$fid,'paging'=>['offset'=>0,'page_size'=>2001]]));
$total=0;$entries=Gravity_Flow_API::get_inbox_entries($args,$total);
if(!is_array($entries)||(int)$total!==count($entries))throw new RuntimeException('SLA_NATIVE_MEMBERSHIP_INCOMPLETE');
usort($entries,static function($a,$b){$d=strcmp((string)$a['date_created'],(string)$b['date_created']);return $d!==0?$d:((int)$a['id']<=>(int)$b['id']);});
$ids=array_map('intval',array_column($entries,'id'));
$model=gravity_flow()->container()->get(\Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL);
$task_args=['form_id'=>$fid,'paging'=>['offset'=>0,'page_size'=>2001],'is_shortcode'=>true,'context_key'=>'',
    'detail_base_url'=>add_query_arg(['page'=>'gravityflow-inbox','view'=>'entry'],get_permalink($m['native_page_id']))];
$defs=$model->get_table_header_defs($task_args);$tasks=$model->get_inbox_tasks($task_args);
if(!is_array($defs)||!is_array($tasks)||count($tasks)!==count($ids))throw new RuntimeException('SLA_NATIVE_TASK_MODEL_INCOMPLETE');
$keys=[];
foreach(['name'=>$m['native_columns'][1],'nid'=>$m['native_columns'][2],'school'=>$m['native_columns'][3]] as $k=>$column){
    foreach($defs as $d)if((string)($d['field']??'')===(string)$column&&is_string($d['displayKey']??null)){$keys[$k]=$d['displayKey'];break;}
    if(!isset($keys[$k]))throw new RuntimeException('SLA_NATIVE_DISPLAY_KEY_MISSING');
}
$cells=[];$dates=array_column($entries,'date_created','id');
foreach($tasks as $t){
    $id=(int)($t['id']??0);
    if(!in_array($id,$ids,true)||isset($cells[$id]))throw new RuntimeException('SLA_NATIVE_TASK_ID_INVALID');
    $cells[$id]=['created'=>$dates[$id],'url'=>$t['url_entry']??''];
    foreach($keys as $k=>$key){
        $raw=$t[$key]??null;
        if(!is_string($raw)&&!is_numeric($raw))throw new RuntimeException('SLA_NATIVE_CELL_INVALID');
        $raw=(string)$raw;
        if(preg_match('/<[a-z\\/!][\\s\\S]*>/i',$raw))throw new RuntimeException('SLA_NATIVE_CELL_NOT_PLAIN');
        $cells[$id][$k]=trim(html_entity_decode($raw,ENT_QUOTES|ENT_HTML5,'UTF-8'));
    }
}
if(count($cells)!==count($ids))throw new RuntimeException('SLA_NATIVE_CELL_SET');
if(!class_exists('Gravity_Flow_Entry_Detail'))require_once gravity_flow()->get_base_path().'/includes/pages/class-entry-detail.php';
$states=[];
foreach($m['entries'] as $id){
    $e=GFAPI::get_entry((int)$id);$api=new Gravity_Flow_API($fid);$step=$api->get_current_step($e);
    if(!is_array($e))throw new RuntimeException('SLA_NATIVE_ENTRY_MISSING');
    $states[$id]=['step'=>$step?(int)$step->get_id():null,'type'=>$step?$step->get_type():null,
        'status'=>(string)$api->get_status($e),'final'=>(string)gform_get_meta((int)$id,'workflow_final_status'),
        'can_update'=>$step?(bool)Gravity_Flow_Entry_Detail::can_update($step):false];
}
echo wp_json_encode(['actor'=>$actor,'ids'=>$ids,'cells'=>$cells,'states'=>$states,
    'server_time'=>wp_date('H:i'),'timezone'=>wp_timezone_string()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
