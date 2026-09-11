<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

interface BindingEvidenceGate {
    public function allowsBinding( $binding );
}
