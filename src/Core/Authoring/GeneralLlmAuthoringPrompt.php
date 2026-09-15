<?php

namespace GravityPresentationProfiles\Core\Authoring;

use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackageV11;

final class GeneralLlmAuthoringPrompt {
    const PROMPT_VERSION = '1.0.0';
    const FILENAME = 'gpp-general-llm-authoring-prompt-v1.md';

    public static function contract() {
        $schema = VisualProfilePackageV11::schemaDefinition();
        $used_token_categories = array();
        foreach ( $schema['presentation'] as $preferences ) {
            foreach ( $preferences as $rule ) {
                if ( 'token' === $rule['kind'] ) {
                    $used_token_categories[ $rule['token_category'] ] = true;
                }
            }
        }

        return array(
            'prompt_version' => self::PROMPT_VERSION,
            'artifact_type' => VisualProfilePackage::ARTIFACT_TYPE,
            'schema_version' => VisualProfilePackageV11::SCHEMA_VERSION,
            'authorable_surfaces' => array( 'gravity_forms.form' ),
            'root_fields' => $schema['root_fields'],
            'token_categories' => array_intersect_key( $schema['token_categories'], $used_token_categories ),
            'presentation' => $schema['presentation'],
            'capabilities' => $schema['capabilities'],
            'portable_identifier_pattern' => $schema['portable_identifier_pattern'],
            'package_version_pattern' => $schema['package_version_pattern'],
            'token_name_pattern' => $schema['token_name_pattern'],
            'forbidden_identity_examples' => array(
                'Form ID',
                'Field ID',
                'Step ID',
                'Entry ID',
                'Page ID',
                'Route ID',
                'User ID',
                'Role ID',
                'binding identity',
                'installation-specific identity',
            ),
            'reserved_extension_seam' => array(
                'version' => VisualProfilePackage::RESERVED_EXTENSION_SEAM_VERSION,
                'state' => VisualProfilePackage::RESERVED_EXTENSION_SEAM_STATE,
            ),
        );
    }

    public static function assertContractParity( $candidate ) {
        if ( self::contract() !== $candidate ) {
            throw new \RuntimeException( 'General LLM authoring contract drift detected.' );
        }
        return true;
    }

    public static function contents() {
        $contract = self::contract();
        $lines = array(
            '# GPP Fixed Offline General LLM Authoring Prompt V1',
            '',
            'You are authoring one portable Gravity Presentation Profiles (GPP) visual profile package. The final deliverable is a machine-readable JSON document for GPP\'s existing Profile Package JSON importer.',
            '',
            'This prompt is used outside GPP. GPP does not contact you or any AI service, upload site data, or provide repository, database, WordPress admin, or runtime access. Optional screenshots/design references are selected and shared manually by the user with their chosen external tool.',
            '',
            '## Ownership and separation',
            '',
            '- A visual profile package controls only admitted presentation identity, design tokens, controlled presentation preferences, and explicitly admitted presentation capabilities.',
            '- Semantic bindings/environment IDs are a separate GPP artifact class. Never place Form IDs, Field IDs, Step IDs, Entry IDs, Page IDs, route IDs, user/role IDs, binding IDs, installation IDs, or other installation-specific identity in this visual package.',
            '- Gravity Forms and other host products own form structure, values, validation, workflow, assignment, authorization, search, sorting, pagination, actions, and other behavior/state. Never invent host behavior here.',
            '- LLM output is untrusted until GPP validates it. Never work around the importer or validation lifecycle.',
            '',
            '## Fixed package contract',
            '',
            '- artifact_type: exactly `' . $contract['artifact_type'] . '`.',
            '- schema_version: exactly `' . $contract['schema_version'] . '`.',
            '- selected_surfaces: exactly `["gravity_forms.form"]` for this authoring workflow.',
            '- This V1 workflow does not authorize general LLM-authored Inbox, Entry Detail, or Print presentation.',
            '- Every top-level field listed below is required; unknown top-level fields are forbidden.',
            '- semantic_slots must be `[]`, and the one surface profile semantic_slots must also be `[]`. Environment semantic mapping belongs to GPP binding artifacts, not visual identity.',
            '- surface_profiles must contain exactly one object for `gravity_forms.form`.',
            '- reserved_extension_seam must remain exactly the fixed inert object shown in the example.',
            '',
            'Required top-level fields: `' . implode( '`, `', $contract['root_fields'] ) . '`.',
            '',
            '## Portable identity and provenance',
            '',
            '- package_id and profile_id must match `' . $contract['portable_identifier_pattern'] . '` and remain portable.',
            '- package_version must match `' . $contract['package_version_pattern'] . '`.',
            '- Do not encode environment identity. Forbidden examples include: ' . implode( ', ', $contract['forbidden_identity_examples'] ) . '.',
            '- provenance contains exactly `producer` and `evidence_refs`. producer is non-empty safe text. evidence_refs is an ordered array of unique non-empty safe strings and may be empty.',
            '- Do not place design-reference URLs in the package. References are shared manually outside GPP and may inform visual choices without becoming package data.',
            '',
            '## Design tokens',
            '',
            '- design_tokens must be non-empty. Include only the token categories below, and only categories actually used by the selected surface profile.',
            '- Every included token category must be non-empty.',
            '- Every token name must match `' . $contract['token_name_pattern'] . '`.',
            '- Every presentation token reference must point to a declared token, and the same reference must appear in surface_profiles[0].token_refs.',
        );

        foreach ( $contract['token_categories'] as $category => $rule ) {
            $description = '- `' . $category . '`: ' . $rule['value_type'];
            if ( isset( $rule['pattern'] ) ) {
                $description .= '; pattern `' . $rule['pattern'] . '`';
            }
            if ( isset( $rule['minimum'], $rule['maximum'] ) ) {
                $description .= '; inclusive range ' . $rule['minimum'] . '..' . $rule['maximum'];
                if ( isset( $rule['unit'] ) ) {
                    $description .= ' ' . $rule['unit'];
                }
            }
            if ( isset( $rule['step'] ) ) {
                $description .= '; step ' . $rule['step'];
            }
            if ( isset( $rule['maximum_bytes'] ) ) {
                $description .= '; non-empty; maximum ' . $rule['maximum_bytes'] . ' bytes; allowed characters: ' . $rule['allowed_characters'];
            }
            if ( isset( $rule['constraint'] ) ) {
                $description .= '; ' . $rule['constraint'];
            }
            $lines[] = $description . '.';
        }

        $lines[] = '';
        $lines[] = 'Do not add other token categories just because the schema may admit internal values elsewhere. This authoring vocabulary exposes only token categories consumed by the current supported Gravity Forms declarative runtime.';
        $lines[] = '';
        $lines[] = '## Complete supported mutable presentation vocabulary';
        $lines[] = '';
        $lines[] = 'All paths below apply only to `gravity_forms.form`. Omit preferences the user has not selected or that cannot be resolved confidently.';

        foreach ( $contract['presentation'] as $block => $preferences ) {
            foreach ( $preferences as $name => $rule ) {
                $path = $block . '.' . $name;
                if ( 'enum' === $rule['kind'] ) {
                    $lines[] = '- `' . $path . '`: enum string; exactly one of `' . implode( '`, `', $rule['values'] ) . '`.';
                } else {
                    $lines[] = '- `' . $path . '`: token-reference string; must reference `design_tokens.' . $rule['token_category'] . '.<token_name>`.';
                }
            }
        }

        $lines[] = '';
        $lines[] = 'Optional controlled capabilities, in canonical order, are:';
        foreach ( $contract['capabilities'] as $capability ) {
            $lines[] = '- `' . $capability . '`';
        }
        $lines[] = 'Capabilities are admitted only for `gravity_forms.form`. Use one only when the user explicitly needs it and the host environment supports it. If support is uncertain, omit it or ask the user; never guess.';
        $lines[] = '';
        $lines[] = '## Immutable safety rules';
        $lines[] = '';
        $lines[] = '- Do not invent unknown fields, blocks, token categories, capabilities, or surfaces.';
        $lines[] = '- Do not emit arbitrary CSS, selectors, JavaScript, PHP, executable expressions, arbitrary HTML, remote code/URLs, workflow rules, permissions, authorization rules, assignment rules, or host lifecycle behavior.';
        $lines[] = '- Do not use raw CSS/JS/HTML as an escape hatch for a request the controlled vocabulary cannot express.';
        $lines[] = '- Strings containing PHP tags, HTML tags, javascript/data-text schemes, HTTP/HTTPS URLs, executable-call syntax, braces, or semicolons can be rejected by GPP. Do not emit them.';
        $lines[] = '- If a requested design value is outside the supported vocabulary/range, tell the user before final output and omit it rather than fabricating support.';
        $lines[] = '- Do not silently substitute the SRWF Registration design, colors, measurements, typography, or directionality as a universal default. This prompt is generic.';
        $lines[] = '';
        $lines[] = '## Short unresolved-input step';
        $lines[] = '';
        $lines[] = 'Before final JSON, ask only for genuinely unresolved design information: a portable package/profile name, desired x.y.z package version, specific supported visual choices, or whether an optional controlled capability is explicitly required and supported. If screenshots/design references are provided, derive only supported presentation choices from them. Never ask for credentials, database/repository/admin access, production form values, uploaded files, or concrete Form/Field/Entry/Step/Page IDs.';
        $lines[] = '';
        $lines[] = 'If a requested value is uncertain, unsupported, contradictory, or visually ambiguous, resolve it with the user instead of guessing.';
        $lines[] = '';
        $lines[] = '## Structure example';
        $lines[] = '';
        $lines[] = 'This example is structural only. Its illustrative names and color are not defaults and must not be copied unless the user actually chooses them:';
        $lines[] = '';
        $lines[] = '{';
        $lines[] = '  "artifact_type": "' . $contract['artifact_type'] . '",';
        $lines[] = '  "schema_version": "' . $contract['schema_version'] . '",';
        $lines[] = '  "package_id": "portable.example.presentation",';
        $lines[] = '  "package_version": "1.0.0",';
        $lines[] = '  "provenance": {';
        $lines[] = '    "producer": "external general llm authoring",';
        $lines[] = '    "evidence_refs": []';
        $lines[] = '  },';
        $lines[] = '  "selected_surfaces": ["gravity_forms.form"],';
        $lines[] = '  "design_tokens": {';
        $lines[] = '    "colors": {';
        $lines[] = '      "control_border": "#777777"';
        $lines[] = '    }';
        $lines[] = '  },';
        $lines[] = '  "semantic_slots": [],';
        $lines[] = '  "surface_profiles": [';
        $lines[] = '    {';
        $lines[] = '      "surface": "gravity_forms.form",';
        $lines[] = '      "profile_id": "portable.example.v1",';
        $lines[] = '      "token_refs": ["colors.control_border"],';
        $lines[] = '      "semantic_slots": [],';
        $lines[] = '      "presentation": {';
        $lines[] = '        "controls": {';
        $lines[] = '          "border": "colors.control_border"';
        $lines[] = '        }';
        $lines[] = '      }';
        $lines[] = '    }';
        $lines[] = '  ],';
        $lines[] = '  "reserved_extension_seam": {';
        $lines[] = '    "version": "' . $contract['reserved_extension_seam']['version'] . '",';
        $lines[] = '    "state": "' . $contract['reserved_extension_seam']['state'] . '"';
        $lines[] = '  }';
        $lines[] = '}';
        $lines[] = '';
        $lines[] = '## Final output rule';
        $lines[] = '';
        $lines[] = 'The final answer must contain exactly one valid JSON object suitable for GPP\'s existing Profile Package JSON importer. Do not wrap it in Markdown fences. Do not add explanatory prose, headings, comments, or trailing text before or after the JSON.';
        $lines[] = '';

        return implode( "\n", $lines );
    }
}
