<?php
declare(strict_types=1);

$root = $argv[1] ?? 'tests/fixtures/wu21-packages';
$manifest_path = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'manifest.json';

$fail = static function (string $message): never {
    fwrite(STDERR, "WU21_PACKAGE_FIXTURE_FAILURE: {$message}\n");
    exit(1);
};

if (! is_file($manifest_path)) {
    $fail('manifest.json is missing.');
}

try {
    $manifest = json_decode((string) file_get_contents($manifest_path), true, 512, JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    $fail('manifest.json is malformed: ' . $error->getMessage());
}

if (($manifest['schema_version'] ?? null) !== '1.0.0' || ! is_array($manifest['packages'] ?? null) || $manifest['packages'] === array()) {
    $fail('manifest contract is invalid.');
}

$required = array('gravityforms', 'gravityflow', 'elementor', 'elementor-pro');
$seen = array();

foreach ($manifest['packages'] as $package) {
    if (! is_array($package)) {
        $fail('package entry is malformed.');
    }

    $id = $package['id'] ?? null;
    $filename = $package['filename'] ?? null;
    $version = $package['version'] ?? null;
    $classification = $package['classification'] ?? null;
    $size = $package['size_bytes'] ?? null;
    $sha = $package['sha256'] ?? null;

    if (! is_string($id) || '' === $id || isset($seen[$id]) ||
        ! is_string($version) || '' === $version ||
        ! is_string($classification) || '' === $classification ||
        ! is_string($filename) || basename($filename) !== $filename ||
        ! is_int($size) || $size <= 0 ||
        ! is_string($sha) || ! preg_match('/^[a-f0-9]{64}$/', $sha)) {
        $fail('package entry identity is invalid.');
    }

    $seen[$id] = true;
    $path = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
    if (! is_file($path)) {
        $fail("package {$id} is missing.");
    }
    if (filesize($path) !== $size) {
        $fail("package {$id} size mismatch.");
    }
    if (hash_file('sha256', $path) !== $sha) {
        $fail("package {$id} SHA-256 mismatch.");
    }
}

if (array_keys($seen) !== $required) {
    $fail('required package set/order mismatch.');
}

echo 'WU21_PACKAGE_FIXTURES_PASS packages=' . count($seen) . PHP_EOL;
