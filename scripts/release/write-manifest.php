<?php
if ($argc !== 10) {
    fwrite(STDERR, "usage: write-manifest.php OUTPUT SOURCE VERSION ZIP SHA VALIDATION SMOKE QUALIFICATION BLOCKERS\n");
    exit(2);
}
$blockers = array_values(array_filter(explode(',', $argv[9])));
$data = [
    'schema_version' => '1.0.0',
    'release_unit' => 'gravity-presentation-profiles',
    'source_commit' => $argv[2],
    'release_version' => $argv[3],
    'zip_filename' => $argv[4],
    'zip_sha256' => $argv[5],
    'builder' => 'scripts/release/build-release.sh@v1',
    'run_identity' => getenv('GITHUB_RUN_ID') ?: 'local',
    'artifact_structure_validation' => $argv[6],
    'smoke_test' => $argv[7],
    'required_qualification' => $argv[8],
    'publication_blockers' => $blockers,
    'production_publication' => 'NOT_PERFORMED',
];
file_put_contents($argv[1], json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
