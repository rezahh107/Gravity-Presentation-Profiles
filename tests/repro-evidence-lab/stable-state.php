<?php
/** Read-only state witness for the isolated synthetic replacement lab. */
if (!defined('ABSPATH') || getenv('SLA_DISPOSABLE')!=='1' || ABSPATH!=='/tmp/wu21-wordpress/') throw new RuntimeException('ISOLATED_HOST_REQUIRED');
global $wpdb;
$m=get_option('gpp_sla_manifest');
if (!is_array($m) || count($m['entries'])!==25) throw new RuntimeException('FIXTURE_REQUIRED');
$assert=static function($x,$r){if(!$x)throw new RuntimeException($r);};
$plugin=WP_PLUGIN_DIR.'/gravity-presentation-profiles';
$header=get_file_data($plugin.'/gravity-presentation-profiles.php',['version'=>'Version']);
$addon=\GravityPresentationProfiles\GravityForms\AddOn::get_instance();
$mirror=(new ReflectionProperty($addon,'_version'))->getValue($addon);
$expected=getenv('STABLE_EXPECTED_VERSION');
$assert($header['version']===$expected && $mirror===$expected && !is_link($plugin),'INSTALLED_IDENTITY');
$assert(is_plugin_active('gravity-presentation-profiles/gravity-presentation-profiles.php') && shortcode_exists('gpp_inbox_2'),'ACTIVATION');
$class=new ReflectionClass(\GravityPresentationProfiles\SRWF\GravityFlow\Inbox2Shortcode::class);
$assert($class->getFileName()===$plugin.'/src/SRWF/GravityFlow/Inbox2Shortcode.php','LOADED_RUNTIME');
$assert(GFForms::$version==='3.1.1.1' && GRAVITY_FLOW_VERSION==='3.1.0' && !class_exists('Elementor\\Plugin'),'HOST_IDENTITY');
$tables=[];
foreach(['gf_entry'=>'id','gf_entry_meta'=>'id','gf_form'=>'id','gf_form_meta'=>'form_id','gf_addon_feed'=>'id'] as $suffix=>$order){
  $rows=$wpdb->get_results('SELECT * FROM '.$wpdb->prefix.$suffix.' ORDER BY '.$order,ARRAY_A);
  $assert(is_array($rows)&&$wpdb->last_error==='','NATIVE_TABLE_READ_'.$suffix);
  $tables[$suffix]=['count'=>count($rows),'sha256'=>hash('sha256',serialize($rows))];
}
$settings=[];
$options=$wpdb->get_results($wpdb->prepare(
  'SELECT option_name, option_value FROM '.$wpdb->options.' WHERE option_name LIKE %s OR option_name LIKE %s ORDER BY option_name',
  $wpdb->esc_like('gpp_').'%', '%gravity-presentation-profiles%'),ARRAY_A);
$assert(is_array($options)&&$wpdb->last_error==='','SETTINGS_READ');
foreach($options as $o){
  if($o['option_name']==='gpp_runtime_diagnostics_v1')continue; // diagnostic observations, not settings
  $settings[$o['option_name']]=hash('sha256',$o['option_value']);
}
$assert(isset($settings['gpp_binding_set_lifecycle_v1']),'BINDING_MISSING');
wp_set_current_user($m['users']['officer']);
$binding=\GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract(['form_id'=>$m['form_id']]);
$assert(is_array($binding)&&count($binding['column_ids']??[])===5,'ACTIVE_BINDING_INVALID');
$pages=[];
foreach([$m['page_id'],$m['native_page_id']] as $id){$p=get_post($id);$assert($p&&$p->post_status==='publish','PAGE_MISSING');$pages[$id]=hash('sha256',$p->post_content);}
$active=get_option('active_plugins');sort($active);
echo wp_json_encode(['identity'=>['version'=>$header['version'],'addon'=>$mirror,'active'=>true,'loaded'=>$class->getFileName(),'wp'=>get_bloginfo('version'),'php'=>PHP_VERSION,'gf'=>GFForms::$version,'flow'=>GRAVITY_FLOW_VERSION,'theme'=>get_stylesheet(),'elementor'=>'absent'],
'state'=>['tables'=>$tables,'settings'=>$settings,'binding'=>$binding,'pages'=>$pages,'active_plugins'=>$active,'fixture'=>$m]],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
