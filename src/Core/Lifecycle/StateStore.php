<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

interface StateStore {
    public function load();

    public function commit( $expected_revision, $next_state );
}
