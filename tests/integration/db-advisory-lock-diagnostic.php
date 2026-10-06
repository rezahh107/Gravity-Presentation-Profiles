<?php

mysqli_report( MYSQLI_REPORT_OFF );

function gpp_db_diag_fail( $message ) {
    fwrite( STDERR, 'GPP_DB_ADVISORY_LOCK_DIAG_FAIL: ' . $message . PHP_EOL );
    exit( 1 );
}

function gpp_db_diag_env( $name, $default = null ) {
    $value = getenv( $name );
    return false === $value || '' === $value ? $default : $value;
}

function gpp_db_diag_connect( $host, $port, $user, $password, $database ) {
    $last_error = 'database service not ready';

    for ( $attempt = 0; $attempt < 40; $attempt++ ) {
        $connection = @new mysqli( $host, $user, $password, $database, $port );
        if ( 0 === $connection->connect_errno ) {
            return $connection;
        }

        $last_error = $connection->connect_error;
        unset( $connection );
        usleep( 250000 );
    }

    gpp_db_diag_fail( 'Unable to connect to database service: ' . $last_error );
}

function gpp_db_diag_lock_scalar( $connection, $sql, $lock_name ) {
    $statement = $connection->prepare( $sql );
    if ( false === $statement ) {
        gpp_db_diag_fail( 'Prepare failed: ' . $connection->error );
    }

    if ( ! $statement->bind_param( 's', $lock_name ) || ! $statement->execute() ) {
        $error = $statement->error;
        $statement->close();
        gpp_db_diag_fail( 'Execution failed: ' . $error );
    }

    $value = null;
    if ( ! $statement->bind_result( $value ) || ! $statement->fetch() ) {
        $error = $statement->error;
        $statement->close();
        gpp_db_diag_fail( 'Result fetch failed: ' . $error );
    }

    $statement->close();
    return $value;
}

function gpp_db_diag_simple_scalar( $connection, $sql ) {
    $result = $connection->query( $sql );
    if ( false === $result ) {
        gpp_db_diag_fail( 'Query failed: ' . $connection->error );
    }

    $row = $result->fetch_row();
    $result->free();
    return is_array( $row ) ? $row[0] : null;
}

function gpp_db_diag_process_exists( $connection, $connection_id ) {
    $connection_id = (int) $connection_id;
    return 1 === (int) gpp_db_diag_simple_scalar(
        $connection,
        'SELECT EXISTS(SELECT 1 FROM information_schema.PROCESSLIST WHERE ID = ' . $connection_id . ')'
    );
}

$host       = gpp_db_diag_env( 'GPP_DB_HOST', '127.0.0.1' );
$port       = (int) gpp_db_diag_env( 'GPP_DB_PORT', '3306' );
$user       = gpp_db_diag_env( 'GPP_DB_USER', 'root' );
$password   = gpp_db_diag_env( 'GPP_DB_PASSWORD', 'gpp' );
$database   = gpp_db_diag_env( 'GPP_DB_NAME', 'gpp_lock_test' );
$variant    = gpp_db_diag_env( 'GPP_DB_VARIANT', 'unknown' );
$output     = gpp_db_diag_env( 'GPP_DB_DIAG_OUTPUT', '' );
$iterations = max( 1, (int) gpp_db_diag_env( 'GPP_DB_DIAG_ITERATIONS', '40' ) );
$timeout_ms = max( 100, (int) gpp_db_diag_env( 'GPP_DB_DIAG_TIMEOUT_MS', '2000' ) );
$poll_us    = max( 500, (int) gpp_db_diag_env( 'GPP_DB_DIAG_POLL_US', '1000' ) );

$probe = gpp_db_diag_connect( $host, $port, $user, $password, $database );
$server = (string) gpp_db_diag_simple_scalar( $probe, 'SELECT VERSION()' );
$server_comment = (string) gpp_db_diag_simple_scalar( $probe, 'SELECT @@version_comment' );
$probe->close();

$records = array();
$immediate_successes = 0;
$delayed_successes = 0;
$max_recovery_ms = 0.0;

for ( $iteration = 1; $iteration <= $iterations; $iteration++ ) {
    $connection_a = gpp_db_diag_connect( $host, $port, $user, $password, $database );
    $connection_b = gpp_db_diag_connect( $host, $port, $user, $password, $database );
    $connection_a_id = (int) gpp_db_diag_simple_scalar( $connection_a, 'SELECT CONNECTION_ID()' );
    $connection_b_id = (int) gpp_db_diag_simple_scalar( $connection_b, 'SELECT CONNECTION_ID()' );
    $lock = 'gpp-diag:' . substr( hash( 'sha256', $variant . '|' . $database . '|' . $iteration . '|' . microtime( true ) ), 0, 52 );

    if ( 1 !== (int) gpp_db_diag_lock_scalar( $connection_a, 'SELECT GET_LOCK(?, 0)', $lock ) ) {
        gpp_db_diag_fail( 'Connection A could not acquire lock at iteration ' . $iteration . '.' );
    }
    if ( 0 !== (int) gpp_db_diag_lock_scalar( $connection_b, 'SELECT GET_LOCK(?, 0)', $lock ) ) {
        gpp_db_diag_fail( 'Negative ownership control failed at iteration ' . $iteration . ': B acquired while A owned the lock.' );
    }

    $owner_before = gpp_db_diag_lock_scalar( $connection_b, 'SELECT IS_USED_LOCK(?)', $lock );
    if ( (int) $owner_before !== $connection_a_id ) {
        gpp_db_diag_fail( 'IS_USED_LOCK did not identify connection A before close at iteration ' . $iteration . '.' );
    }

    $started = hrtime( true );
    $connection_a->close();

    $samples = array();
    $acquired = false;
    $attempt = 0;
    while ( true ) {
        $attempt++;
        $elapsed_ms = ( hrtime( true ) - $started ) / 1000000;
        $owner = gpp_db_diag_lock_scalar( $connection_b, 'SELECT IS_USED_LOCK(?)', $lock );
        $process_exists = gpp_db_diag_process_exists( $connection_b, $connection_a_id );
        $get_lock = (int) gpp_db_diag_lock_scalar( $connection_b, 'SELECT GET_LOCK(?, 0)', $lock );

        $samples[] = array(
            'attempt' => $attempt,
            'elapsed_ms' => round( $elapsed_ms, 3 ),
            'owner' => null === $owner ? null : (int) $owner,
            'owner_process_exists' => $process_exists,
            'get_lock' => $get_lock,
        );

        if ( 1 === $get_lock ) {
            $acquired = true;
            if ( 1 !== (int) gpp_db_diag_lock_scalar( $connection_b, 'SELECT RELEASE_LOCK(?)', $lock ) ) {
                gpp_db_diag_fail( 'Connection B could not release recovered lock at iteration ' . $iteration . '.' );
            }
            break;
        }

        if ( $elapsed_ms >= $timeout_ms ) {
            break;
        }
        usleep( $poll_us );
    }

    if ( ! $acquired ) {
        gpp_db_diag_fail( 'Abandoned lock did not recover within ' . $timeout_ms . ' ms at iteration ' . $iteration . '. Last sample: ' . json_encode( end( $samples ) ) );
    }

    $recovery_ms = (float) end( $samples )['elapsed_ms'];
    $max_recovery_ms = max( $max_recovery_ms, $recovery_ms );
    if ( 1 === count( $samples ) ) {
        $immediate_successes++;
    } else {
        $delayed_successes++;
    }

    $records[] = array(
        'iteration' => $iteration,
        'connection_a_id' => $connection_a_id,
        'connection_b_id' => $connection_b_id,
        'recovery_ms' => $recovery_ms,
        'sample_count' => count( $samples ),
        'samples' => $samples,
    );

    $connection_b->close();
}

$result = array(
    'schema_version' => '1.0.0',
    'variant' => $variant,
    'php_version' => PHP_VERSION,
    'mysqli_client' => mysqli_get_client_info(),
    'server_version' => $server,
    'server_comment' => $server_comment,
    'iterations' => $iterations,
    'timeout_ms' => $timeout_ms,
    'poll_us' => $poll_us,
    'immediate_successes' => $immediate_successes,
    'delayed_successes' => $delayed_successes,
    'max_recovery_ms' => round( $max_recovery_ms, 3 ),
    'records' => $records,
);

$json = json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
if ( ! is_string( $json ) ) {
    gpp_db_diag_fail( 'Unable to encode diagnostic result.' );
}

if ( '' !== $output && false === file_put_contents( $output, $json . PHP_EOL ) ) {
    gpp_db_diag_fail( 'Unable to write diagnostic output.' );
}

echo 'GPP_DB_ADVISORY_LOCK_DIAG_PASS variant=' . $variant
    . ' server=' . $server
    . ' php=' . PHP_VERSION
    . ' mysqli=' . mysqli_get_client_info()
    . ' iterations=' . $iterations
    . ' immediate=' . $immediate_successes
    . ' delayed=' . $delayed_successes
    . ' max_recovery_ms=' . round( $max_recovery_ms, 3 )
    . PHP_EOL;
