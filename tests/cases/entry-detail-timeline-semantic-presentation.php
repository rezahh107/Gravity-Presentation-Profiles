<?php

require_once __DIR__ . '/../helpers.php';

$root = dirname( __DIR__, 2 );
$semantic_path = $root . '/src/SRWF/GravityFlow/EntryDetailTimelineSemanticPresentation.php';
$bootstrap_path = $root . '/src/Bootstrap.php';
$timeline_path = $root . '/assets/css/srwf-gravity-flow-entry-detail-full-width-timeline.css';
$js_path = $root . '/assets/js/srwf-gravity-flow-entry-detail.js';

$semantic = file_get_contents( $semantic_path );
$bootstrap = file_get_contents( $bootstrap_path );
$timeline = file_get_contents( $timeline_path );
$js = file_get_contents( $js_path );

gpp_assert_true( is_string( $semantic ) && '' !== $semantic, 'Timeline semantic presentation source must exist.' );
gpp_assert_true( is_string( $timeline ) && '' !== $timeline, 'Timeline stylesheet must exist.' );

gpp_assert_true( false !== strpos( $bootstrap, 'EntryDetailTimelineSemanticPresentation::register();' ), 'Semantic Timeline layer must use the existing deferred Gravity Forms bootstrap.' );
gpp_assert_true( false !== strpos( $semantic, "gravityflow_timeline_notes" ), 'Semantic classification must consume Gravity Flow display-time timeline notes.' );
gpp_assert_true( false !== strpos( $semantic, "gravityflow_entry_detail_content_before" ) && false !== strpos( $semantic, "gravityflow_entry_detail_content_after" ), 'Native Entry Detail output must be bracketed only for request-time presentation decoration.' );
gpp_assert_true( false !== strpos( $semantic, 'data-gpp-profile-id="' ) && false !== strpos( $semantic, 'data-gpp-entry-detail="ready"' ) && false !== strpos( $semantic, 'data-gpp-review-mode="read-only"' ), 'Semantic output must fail closed unless lifecycle-backed Full Width read-only Review is admitted.' );
gpp_assert_true( false !== strpos( $semantic, 'EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_ID' ) && false !== strpos( $semantic, 'EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_VERSION' ) && false !== strpos( $semantic, 'EntryDetailVisualVariant::FULL_WIDTH_PROFILE_ID' ), 'Semantic Timeline admission must reuse the exact Full Width lifecycle identities.' );
gpp_assert_true( false !== strpos( $semantic, '$visual->resolve( EntryDetailVisualVariant::SURFACE )' ), 'Semantic Timeline admission must resolve the same lifecycle surface as the Full Width adapter.' );
gpp_assert_true( false !== strpos( $semantic, "'entry' !== \$view || \$lid < 1" ) && false !== strpos( $semantic, "'gravityflow-inbox' === \$page" ), 'Semantic Timeline request admission must match the proven Full Width Entry Detail request seam.' );
foreach ( array( '::PACKAGE_ID', '::PACKAGE_VERSION', '::PROFILE_FULL_WIDTH' ) as $invalid_alias ) {
    gpp_assert_true( false === strpos( $semantic, $invalid_alias ), 'Semantic Timeline must not reference nonexistent visual-variant alias ' . $invalid_alias . '.' );
}

foreach ( array( 'FAMILY_APPROVAL', 'FAMILY_TRANSITION', 'FAMILY_NOTE', 'FAMILY_SYSTEM', 'FAMILY_UNKNOWN' ) as $family_constant ) {
    gpp_assert_true( false !== strpos( $semantic, $family_constant ), 'Small semantic vocabulary must include ' . $family_constant . '.' );
}

gpp_assert_true( false !== strpos( $semantic, "'Workflow Submitted'" ) && false !== strpos( $semantic, 'exact_gravityflow_workflow_submitted_signature' ), 'System classification must use an explicit native Workflow Submitted signature.' );
gpp_assert_true( false !== strpos( $semantic, "'approval' === \$type" ) && false !== strpos( $semantic, "'Approved.'" ) && false !== strpos( $semantic, 'approval_step_plus_exact_approved_signature' ), 'Approval classification must require an authentic Approval step plus exact host status signature.' );
gpp_assert_true( false !== strpos( $semantic, "'Sent to step'" ) && false !== strpos( $semantic, 'exact_send_to_known_step_signature' ), 'Transition classification must map only exact send-to-known-step signatures.' );
gpp_assert_true( false !== strpos( $semantic, 'exactHostTexts' ), 'Explicit host signatures must tolerate only the canonical Gravity Flow text and its current translation.' );
gpp_assert_true( false !== strpos( $semantic, "'family' => self::FAMILY_UNKNOWN" ) && false !== strpos( $semantic, 'unmatched_native_event' ), 'Unmatched events must explicitly fall back to unknown.' );
gpp_assert_true( false === strpos( $semantic, 'stripos( $value' ) && false === strpos( $semantic, 'similar_text(' ), 'Classifier must not use fuzzy visible-text keyword inference.' );

gpp_assert_true( false !== strpos( $semantic, 'data-gpp-native-event-source="preserved-sibling"' ), 'Classified presentation must explicitly identify the preserved native source relationship.' );
gpp_assert_true( false !== strpos( $semantic, '$match[1] . $match[2] . \'</div>\' . $presentation' ), 'Classified presentation must retain the authentic native event body and append a presentation sibling.' );
gpp_assert_true( false !== strpos( $semantic, '<bdi dir="auto">' ), 'Mixed-language destination values must use bidi isolation.' );
gpp_assert_true( false === strpos( $semantic, 'update_option(' ) && false === strpos( $semantic, 'add_timeline_note(' ) && false === strpos( $semantic, 'add_note(' ), 'Presentation semantics must not persist or synthesize Timeline history.' );

gpp_assert_true( false !== strpos( $timeline, 'data-gpp-timeline-semantic="approval"' ) && false !== strpos( $timeline, '#f0f8f2' ), 'Approval family must have restrained green presentation.' );
gpp_assert_true( false !== strpos( $timeline, 'data-gpp-timeline-semantic="transition"' ) && false !== strpos( $timeline, '#f5f8ff' ), 'Transition family must have restrained blue presentation.' );
gpp_assert_true( false !== strpos( $timeline, 'data-gpp-timeline-semantic="note"' ) && false !== strpos( $timeline, '#fff8e8' ), 'Note family must reserve warm amber annotation presentation without warning semantics.' );
gpp_assert_true( false !== strpos( $timeline, 'data-gpp-timeline-semantic="system"' ) && false !== strpos( $timeline, '#f8fafc' ), 'System family must remain neutral.' );
gpp_assert_true( false !== strpos( $timeline, ':has(> .gpp-timeline-event) > .gravityflow-note-body' ) && false !== strpos( $timeline, 'display: none' ), 'Only classified native event bodies may be visually superseded by their preserved semantic sibling.' );
gpp_assert_true( false !== strpos( $timeline, '.gpp-timeline-event__title' ) && false !== strpos( $timeline, '.gpp-timeline-event__subtitle' ), 'Classified events must expose text hierarchy in addition to color.' );
gpp_assert_true( false !== strpos( $timeline, 'background-image: url("data:image/svg+xml' ), 'Classified markers must use dependency-free decorative semantic icons.' );
gpp_assert_true( false !== strpos( $timeline, 'unicode-bidi: plaintext' ) && false !== strpos( $timeline, 'unicode-bidi: isolate' ), 'Timeline text must explicitly protect RTL/mixed-language bidi flow.' );

gpp_assert_true( false === strpos( $js, 'gpp-timeline-event' ) && false === strpos( $js, 'gravityflow-note-body-wrap' ), 'Client JavaScript must not reconstruct or classify Timeline events.' );

echo "ENTRY_DETAIL_TIMELINE_SEMANTIC_PRESENTATION_PASS\n";
