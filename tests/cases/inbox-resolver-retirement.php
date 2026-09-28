<?php

require_once __DIR__ . '/../helpers.php';

$repo_root       = dirname( __DIR__, 2 );
$resolver_symbol = 'InboxField' . 'PresentationResolver';
$resolver_path   = 'src/SRWF/GravityFlow/' . $resolver_symbol . '.php';

/**
 * Find executable source/test/release references to the retired resolver.
 * The exact retired symbol is assembled at runtime so this guard cannot satisfy
 * its own search predicate.
 */
function gpp_retired_inbox_resolver_references( $root, $needle, $roots ) {
    $references = array();
    $extensions = array( 'php', 'sh', 'bash', 'mjs', 'js', 'yml', 'yaml' );

    foreach ( $roots as $relative_root ) {
        $absolute_root = $root . '/' . $relative_root;
        if ( ! is_dir( $absolute_root ) ) {
            continue;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator( $absolute_root, FilesystemIterator::SKIP_DOTS )
        );

        foreach ( $iterator as $file ) {
            if ( ! $file->isFile() || ! in_array( strtolower( $file->getExtension() ), $extensions, true ) ) {
                continue;
            }

            $contents = file_get_contents( $file->getPathname() );
            if ( false !== $contents && false !== strpos( $contents, $needle ) ) {
                $references[] = str_replace( '\\', '/', substr( $file->getPathname(), strlen( $root ) + 1 ) );
            }
        }
    }

    sort( $references );
    return array_values( array_unique( $references ) );
}

function gpp_retirement_remove_tree( $path ) {
    if ( ! is_dir( $path ) ) {
        return;
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator( $path, FilesystemIterator::SKIP_DOTS ),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ( $iterator as $file ) {
        if ( $file->isDir() ) {
            rmdir( $file->getPathname() );
        } else {
            unlink( $file->getPathname() );
        }
    }
    rmdir( $path );
}

function gpp_retirement_create_zip( $zip_path, $entries ) {
    if ( file_exists( $zip_path ) ) {
        unlink( $zip_path );
    }

    $archive = new PharData( $zip_path );
    foreach ( $entries as $path => $contents ) {
        $archive[ $path ] = $contents;
    }
    unset( $archive );
}

function gpp_retirement_run_artifact_guard( $repo_root, $zip_path ) {
    $output = array();
    $status = 0;
    $command = 'bash ' . escapeshellarg( $repo_root . '/tests/release/assert-behavioral-artifact.sh' )
        . ' ' . escapeshellarg( $zip_path ) . ' 2>&1';
    exec( $command, $output, $status );

    return array( $status, implode( "\n", $output ) );
}

gpp_assert_true(
    ! is_file( $repo_root . '/' . $resolver_path ),
    'Native-First source tree reintroduced the retired Inbox field presentation resolver.'
);

foreach ( array(
    'tests/cases/inbox-field-presentation.php',
    'tests/repro-evidence-lab/prepare-inbox-human-display-fixture.php',
    'tests/repro-evidence-lab/inbox-human-display-browser-tests.mjs',
) as $retired_consumer ) {
    gpp_assert_true(
        ! file_exists( $repo_root . '/' . $retired_consumer ),
        'Historical Card Mode resolver consumer was reintroduced: ' . $retired_consumer
    );
}

$references = gpp_retired_inbox_resolver_references(
    $repo_root,
    $resolver_symbol,
    array( 'src', 'tests', 'scripts', '.github' )
);
gpp_assert_same(
    array(),
    $references,
    'Executable source/test/release evidence still depends on the retired resolver: ' . implode( ', ', $references )
);

$work = sys_get_temp_dir() . '/gpp-inbox-resolver-retirement-' . bin2hex( random_bytes( 6 ) );
mkdir( $work . '/tests', 0777, true );
file_put_contents( $work . '/tests/synthetic-consumer.php', '<?php $resolver = new ' . $resolver_symbol . "();\n" );
$synthetic_references = gpp_retired_inbox_resolver_references( $work, $resolver_symbol, array( 'tests' ) );
gpp_assert_same(
    array( 'tests/synthetic-consumer.php' ),
    $synthetic_references,
    'Resolver retirement scanner failed to detect a synthetic executable consumer.'
);

$operations_package = file_get_contents( $repo_root . '/profiles/srwf/operations/operations-package-v1.json' );
$entrypoint         = file_get_contents( $repo_root . '/gravity-presentation-profiles.php' );
gpp_assert_true( false !== $operations_package && false !== $entrypoint, 'Required release artifact fixtures could not be read.' );

$plugin_root = 'gravity-presentation-profiles/';
$base_entries = array(
    $plugin_root . 'profiles/srwf/operations/operations-package-v1.json' => $operations_package,
    $plugin_root . 'gravity-presentation-profiles.php' => $entrypoint,
);

$positive_zip = $work . '/native-first.zip';
gpp_retirement_create_zip( $positive_zip, $base_entries );
list( $positive_status, $positive_output ) = gpp_retirement_run_artifact_guard( $repo_root, $positive_zip );
gpp_assert_same( 0, $positive_status, 'Native-First artifact without the retired resolver was rejected: ' . $positive_output );
gpp_assert_true(
    false !== strpos( $positive_output, 'GPP_BEHAVIORAL_ARTIFACT_GUARD_PASS' ),
    'Positive Native-First artifact guard marker is missing.'
);

$missing_package_zip = $work . '/missing-operations-package.zip';
gpp_retirement_create_zip(
    $missing_package_zip,
    array( $plugin_root . 'gravity-presentation-profiles.php' => $entrypoint )
);
list( $missing_package_status ) = gpp_retirement_run_artifact_guard( $repo_root, $missing_package_zip );
gpp_assert_true( 0 !== $missing_package_status, 'Artifact guard accepted a ZIP missing the required Operations Package.' );

$missing_entrypoint_zip = $work . '/missing-entrypoint.zip';
gpp_retirement_create_zip(
    $missing_entrypoint_zip,
    array( $plugin_root . 'profiles/srwf/operations/operations-package-v1.json' => $operations_package )
);
list( $missing_entrypoint_status ) = gpp_retirement_run_artifact_guard( $repo_root, $missing_entrypoint_zip );
gpp_assert_true( 0 !== $missing_entrypoint_status, 'Artifact guard accepted a ZIP missing the required plugin entrypoint.' );

$forbidden_resolver_zip = $work . '/retired-resolver-present.zip';
$forbidden_entries = $base_entries;
$forbidden_entries[ $plugin_root . 'src/SRWF/GravityFlow/' . $resolver_symbol . '.php' ] = "<?php\n";
gpp_retirement_create_zip( $forbidden_resolver_zip, $forbidden_entries );
list( $forbidden_status ) = gpp_retirement_run_artifact_guard( $repo_root, $forbidden_resolver_zip );
gpp_assert_true( 0 !== $forbidden_status, 'Artifact guard accepted a ZIP containing the retired resolver.' );

gpp_retirement_remove_tree( $work );

echo "INBOX_RESOLVER_RETIREMENT_PASS\n";
