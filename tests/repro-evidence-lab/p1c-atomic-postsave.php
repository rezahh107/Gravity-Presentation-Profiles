<?php
/** Browser-save readback and disposable negative resource fixtures. */
if (!defined('ABSPATH') || !getenv('WU21_ARTIFACT_DIR')) { throw new RuntimeException('P1C_DISPOSABLE_REQUIRED'); }
$m=get_option('gpp_p1c_fixture_manifest'); $page=(int)($m['post_id'] ?? 0);
if (!$page || get_post_status($page)!=='publish') { throw new RuntimeException('P1C_UI_PUBLISH_MISSING'); }
$raw=get_post_meta($page,'_elementor_data',true); $nodes=json_decode($raw,true);
if (!is_array($nodes)) { throw new RuntimeException('P1C_EDITOR_JSON_MISSING'); }
$found=array();
$walk=static function($xs) use (&$walk,&$found) {
    foreach ((array)$xs as $x) {
        if (($x['widgetType'] ?? null)==='e-gpp-inbox-2') { $found[]=$x; }
        $walk($x['elements'] ?? array());
    }
}; $walk($nodes);
if (count($found)!==2 || $found[0]['id']===$found[1]['id']) {
    throw new RuntimeException('P1C_NOT_TWO_SAVED_WIDGETS');
}
$ids=array();
foreach ($found as $node) {
    $s=$node['settings'] ?? array();
    $form=$s['form_id']['value'] ?? null; $native=$s['native_page_id']['value'] ?? null;
    if (($s['form_id']['$$type'] ?? null)!=='string' ||
        ($s['native_page_id']['$$type'] ?? null)!=='string' ||
        !in_array((int)$form,array_values($m['forms']),true) ||
        (int)$native!==$m['native_page_id']) {
        throw new RuntimeException('P1C_PERSISTED_NATIVE_PROP_INVALID');
    }
    foreach (array('user_id','assignee','nonce','token','task','national_id') as $forbidden) {
        if (array_key_exists($forbidden,$s)) { throw new RuntimeException('P1C_UNSAFE_PROP_'.$forbidden); }
    }
    $resolved=\GravityPresentationProfiles\Elementor\Inbox2AtomicIntegration::locateSavedInstance($raw,$node['id']);
    if (!is_array($resolved) || $resolved['form_id']!==(int)$form) {
        throw new RuntimeException('P1C_ATOMIC_SAVED_IDENTITY_INVALID');
    }
    $ids[(string)$form]=$node['id'];
}
if (count($ids)!==2 || str_contains($raw,'SYN-P1C-') || str_contains($raw,'data-ciq2-nonce')) {
    throw new RuntimeException('P1C_PRIVATE_CONTENT_PERSISTED');
}
$neg=array();
foreach (array('draft'=>array('draft',true,false),
    'plain'=>array('publish',false,false),
    'duplicate'=>array('publish',true,true),
    // Published does not imply readable: without the correct WP post-password
    // cookie, this copy must never mint a private GPP read nonce.
    'protected'=>array('publish',true,false)) as $key=>$spec) {
    $id=wp_insert_post(array('post_type'=>'page','post_status'=>$spec[0],
        'post_title'=>'P1C Negative '.$key,
        'post_password'=>$key==='protected' ? 'p1c-only-synthetic-access-code' : ''),true);
    if (is_wp_error($id) || !$id) { throw new RuntimeException('P1C_NEG_PAGE_CREATE'); }
    if ($spec[1]) { update_post_meta($id,'_elementor_edit_mode','builder'); }
    $copy=$nodes; if ($spec[2]) { $copy[]=$found[0]; }
    update_post_meta($id,'_elementor_data',wp_slash(wp_json_encode($copy)));
    $neg[$key]=(int)$id;
}
// Native page admission has a separate WordPress post-password boundary.
// Keep this negative fixture distinct from the browser-saved positive page.
$native_protected = wp_insert_post(array('post_type'=>'page','post_status'=>'publish',
    'post_title'=>'P1C Protected Native Inbox Negative',
    'post_password'=>'synthetic-protected-native-only',
    'post_content'=>'[gravityflow page="inbox"]'),true);
if (is_wp_error($native_protected) || !$native_protected) {
    throw new RuntimeException('P1C_PROTECTED_NATIVE_PAGE_CREATE');
}
$modified=$nodes;
$mutate=static function (&$items) use (&$mutate,$found,$native_protected) {
    foreach ($items as &$node) {
        if (($node['id'] ?? null)===$found[0]['id']) {
            $node['settings']['native_page_id']['value']=(string)$native_protected;
        }
        if (is_array($node['elements'] ?? null)) { $mutate($node['elements']); }
    }
    unset($node);
};
$mutate($modified);
$protected_doc=wp_insert_post(array('post_type'=>'page','post_status'=>'publish',
    'post_title'=>'P1C Protected Native Source Document Negative'),true);
if (is_wp_error($protected_doc) || !$protected_doc) {
    throw new RuntimeException('P1C_PROTECTED_NATIVE_DOCUMENT_CREATE');
}
update_post_meta($protected_doc,'_elementor_edit_mode','builder');
update_post_meta($protected_doc,'_elementor_data',wp_slash(wp_json_encode($modified)));
$resolved=\GravityPresentationProfiles\Elementor\Inbox2AtomicIntegration::locateSavedInstance(
    get_post_meta($protected_doc,'_elementor_data',true),$found[0]['id']);
if (!is_array($resolved) || $resolved['native_page_id']!==(int)$native_protected) {
    throw new RuntimeException('P1C_PROTECTED_NATIVE_FIXTURE_IDENTITY_FAILED');
}
$neg['protected_native_owner']=(int)$protected_doc;
$m['element_ids_by_form']=$ids; $m['negative_pages']=$neg;
update_option('gpp_p1c_fixture_manifest',$m,false);
file_put_contents(getenv('WU21_ARTIFACT_DIR').'/p1c-atomic-fixture.json',
    wp_json_encode($m,JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
echo "P1C_REAL_EDITOR_DB_READBACK_PASS\n";
