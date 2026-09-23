<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../repro-evidence-lab/wu18-timeline-utc-source-evidence.php';

$root = sys_get_temp_dir() . '/gpp-wu19-timeline-utc-' . getmypid();
if ( ! is_dir( $root ) && ! mkdir( $root, 0777, true ) && ! is_dir( $root ) ) {
    gpp_fail( 'Could not create Timeline UTC source fixture root.' );
}

register_shutdown_function(
    static function () use ( $root ) {
        $files = glob( $root . '/*' );
        if ( is_array( $files ) ) {
            foreach ( $files as $file ) {
                if ( is_file( $file ) ) {
                    @unlink( $file );
                }
            }
        }
        @rmdir( $root );
    }
);

$main_source = "<?php\n/*\nPlugin Name: Gravity Flow\nVersion: 3.1.0\n*/\n";
$utc_source = <<<'PHP_SOURCE'
<?php
class Gravity_Flow {
    public function log_event() {
        'date_created' => current_time( 'mysql', true ),
    }
}
PHP_SOURCE;

file_put_contents( $root . '/gravityflow.php', $main_source );
file_put_contents( $root . '/class-gravity-flow.php', $utc_source );

$main_sha256 = hash_file( 'sha256', $root . '/gravityflow.php' );
$statement = "'date_created' => current_time( 'mysql', true ),";

$samples = array();
for ( $i = 0; $i < 12; $i++ ) {
    $samples[] = array(
        'file' => 'decoy-' . $i . '.php',
        'line' => 100 + $i,
        'snippet' => array(
            array( 'line' => 100 + $i, 'text' => 'bounded sampled source without the UTC statement' ),
        ),
    );
}

$inventory_a = array(
    'gravity_flow_version' => '3.1.0',
    'gravity_flow_main_sha256' => $main_sha256,
    'occurrences' => array(
        'timeline' => $samples,
        'status' => array(
            array(
                'file' => 'status.php',
                'line' => 10,
                'snippet' => array( array( 'line' => 10, 'text' => 'status sample' ) ),
            ),
        ),
    ),
);
$inventory_b = $inventory_a;
$inventory_b['occurrences'] = array_reverse( $inventory_b['occurrences'], true );

gpp_assert_true(
    false === strpos( json_encode( $inventory_a ), $statement ),
    'Bounded sampled inventory control must omit the authoritative UTC source statement.'
);
gpp_assert_true(
    false === strpos( json_encode( $inventory_b ), $statement ),
    'Permuted sampled inventory control must still omit the authoritative UTC source statement.'
);

$evidence_a = wu18_timeline_utc_source_evidence( $root, $inventory_a['gravity_flow_main_sha256'] );
$evidence_b = wu18_timeline_utc_source_evidence( $root, $inventory_b['gravity_flow_main_sha256'] );

gpp_assert_same( $evidence_a, $evidence_b, 'Inventory ordering must not affect direct Timeline UTC source evidence.' );
gpp_assert_same( 'class-gravity-flow.php', $evidence_a['file'], 'Direct Timeline UTC source provenance file changed.' );
gpp_assert_same( 4, $evidence_a['line'], 'Direct Timeline UTC source provenance line changed in the controlled fixture.' );
gpp_assert_same( $statement, $evidence_a['text'], 'Direct Timeline UTC source statement changed in the controlled fixture.' );
gpp_assert_same( $main_sha256, $evidence_a['gravity_flow_main_sha256'], 'Direct Timeline UTC evidence is not bound to the fixture package identity.' );

$assert_failure = static function ( $callback, $expected_message, $label ) {
    try {
        $callback();
    } catch ( RuntimeException $exception ) {
        gpp_assert_true(
            false !== strpos( $exception->getMessage(), $expected_message ),
            $label . ' failed for the wrong reason: ' . $exception->getMessage()
        );
        return;
    }
    gpp_fail( $label . ' did not fail closed.' );
};

unlink( $root . '/class-gravity-flow.php' );
$assert_failure(
    static function () use ( $root, $main_sha256 ) {
        wu18_timeline_utc_source_evidence( $root, $main_sha256 );
    },
    'UTC source is unreadable',
    'Missing direct Gravity Flow UTC source'
);

file_put_contents(
    $root . '/class-gravity-flow.php',
    str_replace( "current_time( 'mysql', true )", "current_time( 'mysql', false )", $utc_source )
);
$assert_failure(
    static function () use ( $root, $main_sha256 ) {
        wu18_timeline_utc_source_evidence( $root, $main_sha256 );
    },
    'statement changed or is unproven',
    'Changed Gravity Flow UTC timestamp semantics'
);

file_put_contents( $root . '/class-gravity-flow.php', $utc_source );
$assert_failure(
    static function () use ( $root ) {
        wu18_timeline_utc_source_evidence( $root, str_repeat( '0', 64 ) );
    },
    'package identity changed',
    'Changed Gravity Flow package identity'
);

echo "TIMELINE_UTC_SOURCE_EVIDENCE_PASS\n";
