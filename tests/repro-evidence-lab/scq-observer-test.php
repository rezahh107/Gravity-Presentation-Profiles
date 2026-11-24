<?php
require __DIR__.'/scq-principal-observer.php';
function scq_test($condition,$name) {
    if (!$condition) throw new RuntimeException($name);
    echo "SCQ_SERVER_CLASSIFIER_PASS ".$name.PHP_EOL;
}
$good='{"success":false,"data":{"reason":"authorization_required"}}';
$x=scq_summarize_output($good,true);
scq_test($x['exactDenial'] && $x['sha256']===hash('sha256',$good) && !$x['ids'] && !$x['markers'],'full_exact_denial');
scq_test(!scq_summarize_output($good,false)['exactDenial'],'incomplete_output_rejected');
scq_test(!scq_summarize_output($good.'extra',true)['exactDenial'],'appended_data_rejected');
$extra='{"success":false,"data":{"reason":"authorization_required","other":"secret"}}';
scq_test(!scq_summarize_output($extra,true)['exactDenial'],'extra_unclassified_field_rejected');
$duplicate='{"success":true,"success":false,"data":{"reason":"authorization_required"}}';
scq_test(!scq_summarize_output($duplicate,true)['exactDenial'],'duplicate_key_rejected');
$leak='{"success":false,"data":{"reason":"authorization_required","html":"<div data-ciq2-entry=\"26\">SYN-SC-A-NAME</div>"}}';
$l=scq_summarize_output($leak,true);
scq_test(!$l['exactDenial'] && $l['ids']===[26] && in_array('SYN-SC-A-NAME',$l['markers'],true),'private_content_detected');
