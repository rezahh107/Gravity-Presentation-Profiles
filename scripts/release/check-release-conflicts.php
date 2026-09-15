<?php
if ($argc !== 5) {
    fwrite(STDERR, "usage: check-release-conflicts.php VERSION TAGS_JSON RELEASES_JSON ZIP_FILENAME\n");
    exit(2);
}
[$script, $version, $tagsPath, $releasesPath, $zipName] = $argv;
if (!preg_match('/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/', $version)) {
    fwrite(STDERR, "invalid production version\n"); exit(1);
}
$tags = json_decode(file_get_contents($tagsPath), true);
$releases = json_decode(file_get_contents($releasesPath), true);
if (!is_array($tags) || !is_array($releases)) {
    fwrite(STDERR, "invalid conflict input\n"); exit(2);
}
// gh api --paginate --slurp returns pages; flatten them when present.
if (isset($tags[0]) && is_array($tags[0]) && array_is_list($tags[0])) { $tags = array_merge(...$tags); }
if (isset($releases[0]) && is_array($releases[0]) && array_is_list($releases[0])) { $releases = array_merge(...$releases); }
$tag = 'v' . $version;
foreach ($tags as $item) {
    if (($item['name'] ?? null) === $tag) {
        fwrite(STDERR, "existing tag conflict: $tag\n"); exit(1);
    }
}
foreach ($releases as $release) {
    if (($release['tag_name'] ?? null) === $tag) {
        fwrite(STDERR, "existing release conflict: $tag\n"); exit(1);
    }
    foreach (($release['assets'] ?? []) as $asset) {
        if (($asset['name'] ?? null) === $zipName || ($asset['name'] ?? null) === $zipName . '.sha256') {
            fwrite(STDERR, "existing release asset conflict: " . $asset['name'] . "\n"); exit(1);
        }
    }
}
echo "GPP_RELEASE_CONFLICT_CHECK_PASS\n";
