<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

final class LifecycleException extends \RuntimeException {
    private $reason_code;

    public function __construct( $reason_code, $message ) {
        $this->reason_code = $reason_code;
        parent::__construct( $message );
    }

    public function reasonCode() {
        return $this->reason_code;
    }
}
