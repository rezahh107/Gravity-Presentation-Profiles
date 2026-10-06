<?php

mysqli_report( MYSQLI_REPORT_OFF );

function gpp_db_lock_fail( $message ) {
    fwrite( STDERR, 'GPP_DB_ADVISORY_LOCK_FAIL: ' . $message . PHP_EOL );
    exit( 1 );
}

function gpp_db_lock_env( $name, $default = null ) {
    $value = getenv( $name );
    return false === $value || '' === $value ? $default : $value;
}

function gpp_db_lock_connect( $host, $port, $user, $password, $database ) {
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

    gpp_db_lock_fail( 'Unable to connect to database service: ' . $last_error );
}

function gpp_db_lock_scalar( $connection, $sql, $lock_name ) {
    $statement = $connection->prepare( $sql );
    if ( false === $statement ) {
        gpp_db_lock_fail( 'Prepare failed: ' . $connection->error );
    }

    if ( ! $statement->bind_param( 's', $lock_name ) || ! $statement->execute() ) {
        $error = $statement->error;
        $statement->close();
        gpp_db_lock_fail( 'Execution failed: ' . $error );
    }

    $value = null;
    if ( ! $statement->bind_result( $value ) || ! $statement->fetch() ) {
        $error = $statement->error;
        $statement->close();
        gpp_db_lock_fail( 'Result fetch failed: ' . $error );
    }

    $statement->close();
    return $value;
}

function gpp_db_lock_wait_for_acquisition( $connection, $lock_name, $timeout_ms ) {
    $deadline = hrtime( true ) + ( (int) $timeout_ms * 1000000 );

    do {
        if ( 1 === (int) gpp_db_lock_scalar( $connection, 'SELECT GET_LOCK(?, 0)', $lock_name ) ) {
            return true;
        }

        if ( hrtime( true ) >= $deadline ) {
            return false;
        }

        usleep( 1000 );
    } while ( true );
}

$host     = gpp_db_lock_env( 'GPP_DB_HOST', '127.0.0.1' );
$port     = (int) gpp_db_lock_env( 'GPP_DB_PORT', '3306' );
$user     = gpp_db_lock_env( 'GPP_DB_USER', 'root' );
$password = gpp_db_lock_env( 'GPP_DB_PASSWORD', 'gpp' );
$database = gpp_db_lock_env( 'GPP_DB_NAME', 'gpp_lock_test' );
$variant  = gpp_db_lock_env( 'GPP_DB_VARIANT', 'unknown' );
$lock     = 'gpp-ci:' . substr( hash( 'sha256', $variant . '|' . $database . '|orphan-recovery' ), 0, 56 );
$recursive_lock = 'gpp-ci:' . substr( hash( 'sha256', $variant . '|' . $database . '|same-session-recursion' ), 0, 56 );

if ( strlen( $lock ) > 64 || strlen( $recursive_lock ) > 64 ) {
    gpp_db_lock_fail( 'Test lock name exceeds 64 characters.' );
}

$connection_a = gpp_db_lock_connect( $host, $port, $user, $password, $database );
$connection_b = gpp_db_lock_connect( $host, $port, $user, $password, $database );
$version      = $connection_b->query( 'SELECT VERSION()' );
$version_row  = $version ? $version->fetch_row() : null;
$server       = is_array( $version_row ) ? $version_row[0] : 'unknown';
if ( $version ) {
    $version->free();
}

// T-RG-05: the owning DB session can recursively acquire the same named lock.
if ( 1 !== (int) gpp_db_lock_scalar( $connection_a, 'SELECT GET_LOCK(?, 0)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection A could not acquire the recursive advisory lock initially.' );
}
if ( 1 !== (int) gpp_db_lock_scalar( $connection_a, 'SELECT GET_LOCK(?, 0)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection A could not recursively acquire the same advisory lock.' );
}
if ( 0 !== (int) gpp_db_lock_scalar( $connection_b, 'SELECT GET_LOCK(?, 0)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection B acquired a recursively held lock.' );
}
if ( 1 !== (int) gpp_db_lock_scalar( $connection_a, 'SELECT RELEASE_LOCK(?)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection A could not release one recursive lock acquisition.' );
}
if ( 0 !== (int) gpp_db_lock_scalar( $connection_b, 'SELECT GET_LOCK(?, 0)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection B acquired the lock before all recursive acquisitions were released.' );
}
if ( 1 !== (int) gpp_db_lock_scalar( $connection_a, 'SELECT RELEASE_LOCK(?)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection A could not release the final recursive lock acquisition.' );
}
if ( 1 !== (int) gpp_db_lock_scalar( $connection_b, 'SELECT GET_LOCK(?, 0)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection B did not acquire the lock after all recursive acquisitions were released.' );
}
if ( 1 !== (int) gpp_db_lock_scalar( $connection_b, 'SELECT RELEASE_LOCK(?)', $recursive_lock ) ) {
    gpp_db_lock_fail( 'Connection B could not release the recursive-contract lock.' );
}

// Preserve the PRI-FND-001 orphan-recovery contract.
if ( 1 !== (int) gpp_db_lock_scalar( $connection_a, 'SELECT GET_LOCK(?, 0)', $lock ) ) {
    gpp_db_lock_fail( 'Connection A could not acquire the advisory lock.' );
}

if ( 0 !== (int) gpp_db_lock_scalar( $connection_b, 'SELECT GET_LOCK(?, 0)', $lock ) ) {
    gpp_db_lock_fail( 'Connection B acquired or ambiguously handled a lock held by connection A.' );
}

// Falsification: a bounded retry must still fail while A genuinely owns the lock.
if ( gpp_db_lock_wait_for_acquisition( $connection_b, $lock, 5 ) ) {
    gpp_db_lock_fail( 'Connection B acquired the advisory lock while connection A still owned it.' );
}

// Close A without RELEASE_LOCK(). Session termination must recover the lock.
// mysqli::close() can return just before another session observes server-side
// teardown. Retry only the zero-timeout GET_LOCK probe, with a strict deadline,
// so a short teardown race does not look like a permanently stuck orphan lock.
$connection_a->close();

if ( ! gpp_db_lock_wait_for_acquisition( $connection_b, $lock, 250 ) ) {
    gpp_db_lock_fail( 'Connection B did not recover the abandoned lock within the bounded session-termination window.' );
}

if ( 1 !== (int) gpp_db_lock_scalar( $connection_b, 'SELECT RELEASE_LOCK(?)', $lock ) ) {
    gpp_db_lock_fail( 'Connection B could not release the recovered lock.' );
}

$connection_b->close();

echo 'GPP_DB_ADVISORY_LOCK_PASS variant=' . $variant . ' server=' . $server . ' recursive=same-session orphan_recovery=session-termination-bounded' . PHP_EOL;
