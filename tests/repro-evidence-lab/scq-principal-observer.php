<?php
/** Disposable observation only: read the actual WP principal, never override authentication or authorization. */
// Pure classifier used by this observer and its independent rejecting controls.
// Only metadata and synthetic marker identities leave this process.
function scq_summarize_output($body, $complete) {
    $json = json_decode($body, true);
    $html = is_array($json) && is_string($json['data']['html'] ?? null) ? $json['data']['html'] : $body;
    preg_match_all('/data-ciq2-entry\s*=\s*["\'](\d+)["\']/', $html, $ids);
    preg_match_all('/SYN-SC-[AB]-(?:[A-Z]+|\d+)/', $body . "\n" . $html, $markers);
    $expected = '{"success":false,"data":{"reason":"authorization_required"}}';
    return array(
        'bytes'=>strlen($body), 'sha256'=>hash('sha256',$body),
        'ids'=>array_map('intval',$ids[1]),
        'markers'=>array_values(array_unique($markers[0])),
        'denied'=>strpos($html,'فهرست در دسترس نیست')!==false,
        'jsonSuccess'=>is_bool($json['success'] ?? null)?$json['success']:null,
        'reason'=>in_array($json['data']['reason'] ?? null,array('authorization_required','incomplete_authorized_snapshot'),true)?$json['data']['reason']:null,
        // Exact known denial envelope; extra keys, duplicate keys, appended
        // data and non-JSON bodies cannot pass just by omitting markers.
        'exactDenial'=>$complete && $body===$expected,
    );
}
if (!defined('ABSPATH') || getenv('SCQ_DISPOSABLE') !== '1') { return; }
add_action('init', static function () {
    $manifest=get_option('gpp_scq_fixture_manifest');
    if (!is_array($manifest)) return;
    $path=wp_parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    $page_path=wp_parse_url($manifest['url'], PHP_URL_PATH);
    $ajax=('/wp-admin/admin-ajax.php'===$path && ($_POST['action'] ?? '')==='gpp_inbox2_read');
    $page=($path===$page_path);
    if (!$ajax && !$page) return;
    $uid=get_current_user_id();
    $principal=$uid===0?'anonymous':($uid===(int)$manifest['users']['a']?'a':($uid===(int)$manifest['users']['b']?'b':'other'));
    if (!headers_sent()) {
        header('X-GPP-SCQ-Principal: '.$principal);
        $correlation=wp_generate_uuid4();
        header('X-GPP-SCQ-Request: '.$correlation);
        if (!$ajax) return;
        $dir=getenv('WU21_ARTIFACT_DIR');
        if ($dir!=='/tmp/scq-artifacts' || !is_dir($dir)) return;
        $raw_form=$_POST['form_id'] ?? null;
        $form=is_string($raw_form) && ctype_digit($raw_form) ? (int)$raw_form : null;
        $body=''; $complete=true; $limit=2000000;
        // No output interception/replacement. A nonempty existing output
        // buffer would prevent proving full output; mark incomplete.
        foreach (ob_get_status(true) as $existing) {
            if (($existing['buffer_used'] ?? 0)>0) $complete=false;
        }
        ob_start(static function ($chunk,$phase) use (&$body,&$complete,$limit,$dir,$principal,$correlation,$form) {
            if (($phase & PHP_OUTPUT_HANDLER_CLEAN)!==0) $complete=false;
            if (strlen($body)+strlen($chunk)>$limit) $complete=false;
            if ($complete) $body.=$chunk;
            if (($phase & PHP_OUTPUT_HANDLER_FINAL)!==0) {
                $cache='';
                foreach (headers_list() as $header) {
                    if (stripos($header,'Cache-Control:')===0) $cache=trim(substr($header,14));
                }
                $record=array('schema'=>1,'sourceHead'=>getenv('SCQ_SOURCE_HEAD'),
                    'harnessHead'=>getenv('GITHUB_SHA'),'kind'=>'gpp_read',
                    'correlation'=>$correlation,'principal'=>$principal,'formId'=>$form,
                    'status'=>http_response_code(),'cacheControl'=>$cache,
                    'complete'=>$complete,'body'=>scq_summarize_output($body,$complete));
                $file=$dir.'/scq-server-'.$correlation.'.json';
                // On any write failure there is no admissible witness. Do not
                // change response bytes, status or authorization to recover.
                if (@file_put_contents($file.'.tmp',json_encode($record),LOCK_EX)!==false) {
                    @rename($file.'.tmp',$file);
                }
            }
            return $chunk;
        },4096);
    }
}, PHP_INT_MAX);
