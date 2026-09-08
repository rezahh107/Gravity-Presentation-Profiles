# Gravity Presentation Profiles — Mother Architecture & Product Contract

```yaml
document_id: GPP-MOTHER-ARCHITECTURE
document_version: 2.0.0
status: ARCHITECTURE_SELECTED__IMPLEMENTATION_NOT_STARTED
canonical_plugin_repository: rezahh107/Gravity-Presentation-Profiles
predecessor:
  document_id: SRWF-PRESENTATION-PLUGIN-MOTHER
  version: 1.0.0
  disposition: SUPERSEDED_BY_GENERIC_CORE_ARCHITECTURE
first_major_profile_family: SRWF
```

## 1. Purpose

Gravity Presentation Profiles is a reusable WordPress presentation-layer plugin for applying deterministic, opt-in visual profiles to supported Gravity ecosystem surfaces while preserving native behavior, data, lifecycle, and workflow ownership.

The plugin does not design interfaces at runtime. It converts admitted Visual/UX Contracts into deterministic implementation rules.

The governing principle is:

```text
Host plugins create behavior and state.
Gravity Presentation Profiles styles that state.
Canonical visual references show what the styled state should look like.
```

## 2. Why the product is generic

The original architecture was framed as `SRWF Presentation`. That naming is superseded.

The reusable mechanism is not inherently SRWF-specific: per-form opt-in, profile registration, scoped asset loading, design tokens, responsive composition, and host-state styling can serve multiple projects.

Therefore:

```text
Gravity Presentation Profiles
= canonical generic plugin/source product

SRWF
= first major consumer/profile family
```

This generalization does **not** authorize a generic visual builder, theme marketplace, arbitrary CSS system, or behavior framework. The product remains a bounded presentation engine driven by explicit profiles and contracts.

## 3. Canonical repository split

### Plugin source truth

```text
rezahh107/Gravity-Presentation-Profiles
```

Owns:

- plugin source;
- generic presentation runtime;
- profile registry;
- plugin-owned profiles;
- tests and CI;
- changelog;
- distribution/release tooling;
- plugin architecture and implementation documentation.

### SRWF project truth

```text
rezahh107/SRWF
```

Remains the project/runtime/governance source of truth for SRWF.

The SRWF repository may bind an exact plugin version, commit SHA, and release artifact, but it must not become a duplicate canonical source of plugin code.

Conceptually:

```yaml
presentation_plugin:
  repository: rezahh107/Gravity-Presentation-Profiles
  version: <exact-release-version>
  commit: <exact-sha>
  release_asset: <exact-release-zip>
```

No two-SSOT model is allowed.

## 4. Product definition

Gravity Presentation Profiles is a **presentation-only companion plugin**.

It may:

- register presentation profiles;
- expose bounded per-form/profile configuration;
- derive semantic wrapper classes from canonical settings;
- load scoped CSS/assets only on relevant surfaces;
- map admitted design tokens to host-supported styling APIs;
- style native host states;
- use narrowly scoped documented hooks when CSS alone cannot express an admitted presentation contract;
- use JavaScript only for a proven residual presentation gap and only when explicitly admitted.

It must not become a substitute for the host products that own data, behavior, or workflow.

## 5. Ownership boundaries

### Gravity Forms owns

- form structure and field lifecycle;
- entries and stored values;
- validation;
- submission;
- required-field semantics;
- conditional logic;
- native form behavior;
- native markup/API contracts.

### Gravity Flow owns

- workflow state;
- assignment;
- Inbox;
- Entry Detail;
- Approval;
- workflow actions and transitions;
- workflow authorization semantics.

### Gravity Perks components own

Their documented behavior and lifecycle, including search/select or upload behavior where supplied by the relevant product.

### PersianGravity owns

Reusable Persian/Iranian Gravity behavior inside its own product scope.

Gravity Presentation Profiles may style the rendered states of those components but must not copy their behavior into this plugin.

### Vazir owns in the current SRWF environment

Font delivery.

Gravity Presentation Profiles may define profile-specific type scale, weight, line-height, spacing, and hierarchy, but generic core must not bundle or load Vazir or another font by default.

### Gravity Presentation Profiles owns

- visual composition;
- deterministic design tokens;
- spacing;
- widths;
- visual hierarchy;
- borders/radii/surfaces;
- focus/error/success presentation;
- responsive composition;
- visual adaptation around native host states;
- profile-specific presentation rules.

## 6. Behavior versus responsive presentation

The word “responsive” must not blur ownership.

Host products own intrinsic component behavior and lifecycle.

Gravity Presentation Profiles owns responsive **presentation**, including:

- stacking;
- grid/column composition;
- widths;
- spacing changes;
- mobile/desktop visual hierarchy;
- button width treatment;
- responsive dossier/form composition;
- visual adaptation around host-owned components.

Example:

```text
GP Advanced Select
→ search/results/selection behavior

Gravity Presentation Profiles
→ width, spacing, border, visual state treatment, responsive composition
```

## 7. No runtime AI or dynamic design invention

The plugin is deterministic.

A Visual/UX Contract may define fixed tokens and conditional rules such as:

```text
control radius = X
control minimum height = Y
mobile = one-column composition
desktop = admitted paired fields
error state = admitted error presentation
```

The plugin does not infer, optimize, or redesign those values at runtime.

“Fixed” means deterministic, not necessarily identical across every profile/state/breakpoint.

## 8. Profile model

The initial architecture is:

```text
Base presentation system
        +
zero or one primary profile per enabled form/surface
```

A profile represents a bounded functional/presentation context.

Examples may include:

- SRWF Registration;
- later admitted operational surfaces;
- future non-SRWF profiles.

Do not mix profile identity with arbitrary visual-theme identity.

## 9. Profile versus visual style

A profile answers:

> What functional/contextual presentation contract applies here?

A visual style answers:

> What alternate visual language should render the same functional profile?

The initial product does **not** include a style selector or multi-theme engine.

The architecture should not make a future alternate style impossible, but no style system may be implemented until a concrete owner-approved use case proves that one functional profile needs multiple visual styles.

Avoid profile names such as `Registration-Blue`, `Registration-Modern`, or `Registration-Compact` when the difference is only visual style.

## 10. Per-form opt-in

The plugin must not globally restyle every Gravity Form merely because it is active.

For Gravity Forms, each form explicitly opts in.

The intended canonical state is conceptually:

```yaml
enabled: true|false
profile: <registered-profile>
```

Gravity Forms Form Settings / Add-On Framework integration is the intended source of truth for that state.

Runtime semantic classes are derived output, not a second source of truth.

Form IDs and Page IDs are not presentation identity.

## 11. Admin UI

The initial admin UI should remain minimal and WordPress/Gravity-native.

Expected location:

```text
Forms → Selected Form → Settings → Gravity Presentation Profiles
```

Expected controls:

```text
Enable Gravity Presentation Profiles  [✓]
Profile                               [<registered-profile> ▼]
Effective layers                     Base + <Profile>
```

No top-level dashboard is required in the first version unless a real global setting emerges.

The admin surface is a profile selector/configuration surface, not a visual editor.

## 12. Admin visual language

Where a dedicated plugin admin surface later becomes necessary, use a modern WordPress-native admin language.

The previously inspected EDIS admin UI may serve as visual DNA/reference for clean cards, restrained borders, status badges, spacing, and responsive organization, but:

- no EDIS runtime/code dependency is allowed;
- hardcoded legacy wp-admin colors should not be copied blindly;
- the admin design must remain compatible with current WordPress conventions.

Locked direction:

```text
Modernized EDIS-derived WordPress-native admin UI;
no EDIS runtime/code dependency.
```

This direction does not imply that EDIS code or assets are authoritative for this repository.

## 13. Visual authority model

For an admitted profile, authority flows as:

```text
Mother Architecture
        ↓
Applicable standards / accessibility requirements
        ↓
Visual / UX Contract
        ↓
Canonical Visual Reference Gallery
        ↓
Implementation
        ↓
Real browser/runtime validation
```

The Gallery illustrates the Contract.

The Gallery must not override the Contract.

A screenshot cannot independently prove exact semantics, keyboard behavior, host lifecycle, accessibility conformance, or an exact numeric value when the exact value is not recoverable from a stronger source.

## 14. External evidence versus project-specific visual choices

General UX/accessibility rules should not be re-invented from screenshots.

The Visual/UX Contract should distinguish:

- `EXTERNAL_BASELINE` — applicable standards/research constraints;
- `HOST_CONSTRAINT` — official host-product capability/contract;
- `SRWF_PROJECT_SPECIFIC` or equivalent project-specific visual choice;
- `DERIVED_INTEGRATION_RULE` — a rule required by combining the above.

External evidence constrains and informs project design. It does not choose the project’s brand identity.

## 15. Canonical Visual Reference Gallery role

The Gallery is:

```text
Architecture dependency:          NO
Implementation runtime dependency: NO
Visual acceptance authority:       YES, after approval
```

Meaning: the plugin can technically execute without a Gallery, but precise visual-conformance claims require approved visual references tied to a governing Visual/UX Contract.

A Gallery state shows how a host-created state should look. It does not transfer behavior ownership to this plugin.

## 16. Reference metadata

Canonical references should be traceable, for example:

```yaml
reference_id: VR-<PROFILE>-<VIEWPORT>-<STATE>-01
surface: <surface>
viewport:
  width: <value>
state: <state>
status: APPROVED
contract:
  id: <visual-contract-id>
  version: <version>
host:
  component: <host-component>
  state_owner: <host-owner>
ownership:
  behavior: <host-owner>
  presentation: Gravity Presentation Profiles
```

A reference cannot become `APPROVED` while its governing visual contract remains unresolved.

## 17. Mockup firewall

HTML mockups and interactive design prototypes are evidence of intended appearance, not automatic implementation instructions.

Mockup JavaScript may demonstrate:

- selected states;
- dropdown/search appearance;
- validation appearance;
- upload/crop appearance;
- conditional visibility.

It must not be copied into production merely because it exists in the mockup.

The real host must remain the behavior owner unless a separately admitted gap changes the architecture.

## 18. Gravity Forms styling strategy

For Gravity Forms, prefer:

```text
Modern Gravity Forms markup
        ↓
Theme Framework / Orbital where applicable
        ↓
Native Gravity Forms settings/layout
        ↓
Official Gravity Forms CSS API / --gf-* custom properties
        ↓
Small plugin-owned scoped CSS
        ↓
Documented hook only for a proven residual presentation gap
```

Do not use `gform_disable_css` as the normal strategy.

Do not base the architecture on legacy Ready Classes.

Do not create a custom Gravity Forms Theme Layer merely to restyle the approved profile unless a later work unit proves it necessary.

Do not rewrite host field markup for cosmetic convenience.

## 19. Gravity Flow styling strategy

Gravity Flow surfaces are allowed future presentation targets, but they are more runtime/markup-sensitive than Gravity Forms Theme Framework styling.

Priority remains:

```text
Native Flow configuration/block/shortcode
        ↓
Scoped profile CSS
        ↓
Limited documented hook
```

Exact selectors/hooks are implementation evidence, not Mother Architecture facts.

Any Gravity Flow update that could alter rendered markup requires renewed runtime regression validation for affected profiles.

## 20. SRWF profile family

SRWF is the first major profile family.

Planned family shape:

```text
profiles/
└── srwf/
    ├── registration/   # first implementation candidate
    ├── officer/        # deferred
    └── accountant/     # deferred
```

Only `registration` is currently eligible to move toward implementation once its Visual/UX Contract and reference evidence are admitted.

Officer and Accountant visual contracts remain separate work and must not be inferred from the Registration design.

## 21. SRWF Registration profile

The SRWF Registration profile may own the visual composition of the existing public registration form while preserving its Gravity Forms/Perks/PersianGravity behavior contract.

The profile is expected to be mobile-first, RTL-capable, deterministic, and scoped only to explicitly enabled forms.

Exact tokens, component states, responsive field pairings, and visual acceptance criteria belong in the admitted SRWF Registration Visual/UX Contract, not in this Mother Architecture.

## 22. Officer and Accountant surfaces

For SRWF, the already-selected operational direction is native Gravity Flow front-end surfaces:

```text
SRWF Internal Front-end Portal
├── Registration Officer
│   ├── Native Flow Inbox
│   ├── Native Entry Detail
│   └── Native Approve
└── Accountant
    ├── Native Flow task/inbox
    ├── Native Entry Detail
    └── Native Approve
```

Gravity Presentation Profiles may later style those native surfaces after their own contracts are admitted.

It must not create a parallel operational desk or workflow model.

Exact Accountant field visibility/authorization is outside this plugin and must not be inferred from presentation requirements.

## 23. Dossier / Entry Detail presentation

A project may treat native Gravity Flow Entry Detail as a designed dossier projection of the canonical Gravity Forms Entry.

That remains a view of native data, not a parallel record system.

Any future dossier profile must preserve host data/authorization ownership and receive its own visual contract.

## 24. Base presentation layer

Base owns only shared presentation primitives genuinely common across admitted profiles, for example where approved:

- spacing foundation;
- common control rhythm;
- shared border/radius primitives;
- focus/error fundamentals;
- common action presentation;
- responsive foundations;
- RTL-safe presentation primitives;
- shared accessibility-preserving visual treatment.

Do not move a rule into Base merely because the first profile uses it.

Base must remain generic.

## 25. Profile-specific layer

A profile owns project/context-specific decisions such as:

- exact visual tokens not truly generic;
- section composition;
- admitted field pairings;
- full-width component decisions;
- profile-specific upload/photo treatment;
- profile-specific responsive composition;
- profile-specific hierarchy.

The profile must not own business behavior.

## 26. Design tokens and deterministic CSS

Most admitted presentation rules will ultimately compile into scoped CSS and CSS custom properties.

Conceptually:

```css
--gpp-control-radius: <approved-value>;
--gpp-control-min-height: <approved-value>;
--gpp-primary: <approved-value>;
```

Exact token names are implementation details until code is admitted.

Conditional deterministic rules may depend on:

- profile;
- viewport/media condition;
- host-rendered state;
- semantic component class.

No runtime AI/design inference is permitted.

## 27. JavaScript policy

JavaScript is zero-by-default.

Use JavaScript only when:

1. the Visual/UX Contract requires a presentation behavior that CSS/native configuration cannot express;
2. the host product does not already own the needed behavior;
3. the residual gap is proven in real runtime;
4. the change does not cross into business/workflow ownership;
5. the implementation is minimal and regression-tested.

Mockup interactivity is never sufficient evidence for adding production JavaScript.

## 28. Conditional asset loading

Plugin assets must load only where needed.

Do not globally enqueue profile CSS/JS across all WordPress pages or all Gravity Forms.

Expected behavior:

```text
surface/form not enabled
→ no profile presentation assets

enabled form + admitted profile
→ Base + that profile assets
```

Avoid asset leakage between profiles.

## 29. Typography

Generic core does not own a font family by default.

Profiles may define:

- font size;
- weight;
- line-height;
- hierarchy;
- spacing.

A profile should generally inherit the active site/project font-delivery layer unless its governing contract explicitly admits another mechanism.

For current SRWF usage, font-family delivery remains delegated to Vazir.

## 30. RTL and internationalization

The generic core must be safe for RTL/LTR contexts and must not hardcode SRWF-specific language assumptions into core primitives.

Use logical CSS properties where they improve direction safety.

Profile-specific Persian/RTL rules belong in the relevant profile.

Do not duplicate PersianGravity behavior.

## 31. Accessibility

Accessibility is a constraint on the presentation system, not optional polish.

The plugin must not:

- remove semantic labels for aesthetics;
- hide focus without an accessible replacement;
- rely on color alone for error/success meaning;
- break keyboard navigation supplied by the host;
- introduce responsive overflow that violates admitted reflow requirements;
- claim compliance from screenshots alone.

Runtime-sensitive accessibility behavior must be validated in the real host environment.

## 32. Security and authorization

Presentation cannot grant or remove authorization.

CSS visibility is not access control.

The plugin must not expose data that the host/user is not authorized to access.

Do not use profile code to bypass Gravity Forms, Gravity Flow, WordPress, or project-level permission models.

## 33. Privacy and test data

Tests, screenshots, fixtures, documentation, and release artifacts must use synthetic data.

Do not commit real student/customer/personally identifiable information.

## 34. Dependency policy

Prefer native WordPress/Gravity APIs.

A new runtime dependency requires an explicit demonstrated gap and documented maintenance/security impact.

Generic core must not require SRWF, PersianGravity, Vazir, or a specific project plugin unless a future architecture decision explicitly changes that boundary.

A profile may declare optional host integration requirements when truly necessary and proven.

## 35. Source package versus installable package

The GitHub repository is the development/source package.

It is **not** the installation artifact contract.

Production releases must be clean, reproducible ZIPs, conceptually:

```text
gravity-presentation-profiles-<version>.zip
└── gravity-presentation-profiles/
    ├── gravity-presentation-profiles.php
    ├── src/
    ├── assets/
    ├── profiles/
    ├── languages/        # only if required
    └── readme.txt
```

Development-only files such as `.github/`, tests, docs, agent instructions, local tooling, and source-only metadata must be excluded unless intentionally required.

The built artifact must be inspected before claiming release readiness.

GitHub “Download ZIP” is not the supported production release artifact.

## 36. Versioning and change control

Use semantic versioning once releases begin.

A change is architectural if it changes:

- ownership boundaries;
- canonical settings source;
- profile model;
- runtime dependency model;
- source/release ownership;
- behavior-versus-presentation boundary;
- authorization assumptions.

Architectural changes require explicit owner approval and a Mother Architecture revision.

Visual token/rule changes inside an admitted profile require that profile’s contract/gallery change process.

## 37. Repository governance

After initial repository bootstrap, material changes should use a focused branch and pull request.

Each PR should identify:

- governing contract/work unit;
- exact scope;
- files changed;
- behavior explicitly unchanged;
- tests and validations actually executed;
- runtime-sensitive items not executed/proven;
- release impact.

Do not merge merely because code generation completed.

## 38. Quality gates

Before implementation is considered ready for review, verify as applicable:

- no styling leakage to non-enabled forms/surfaces;
- profile settings resolve deterministically;
- Base/Profile boundaries remain clean;
- host behavior is not reimplemented;
- no undocumented JavaScript dependency was introduced;
- no real PII is present;
- required lint/static/unit tests pass;
- real host runtime checks are executed where markup/lifecycle matters;
- visual acceptance is checked against the admitted contract/gallery;
- clean distribution artifact contents are verified.

## 39. Release gates

A release cannot be called ready unless:

- repository license is explicitly selected and present;
- required compatibility floors are intentionally defined;
- production ZIP is reproducibly built;
- ZIP content is inspected;
- development-only files are excluded;
- required tests/CI are green at the exact release commit;
- release notes/changelog are updated;
- profile runtime validation required by the release has actually run.

## 40. Non-goals

The initial product is not:

- a Gravity Forms replacement;
- a Gravity Flow replacement;
- a workflow engine;
- an assignment engine;
- a data store;
- a PDF engine;
- a generic page builder;
- a WYSIWYG visual theme editor;
- an arbitrary custom-CSS execution platform;
- an AI design engine;
- a multi-theme marketplace;
- an SRWF business-rules plugin.

## 41. First implementation boundary

The first functional implementation should be limited to:

```text
plugin bootstrap
+
Gravity Forms Add-On integration
+
profile registry
+
per-form Enable/Profile selection
+
Base presentation layer
+
first admitted SRWF Registration profile
+
conditional asset enqueue
+
required tests/documentation
+
clean reproducible release packaging
```

The visual implementation of SRWF Registration must not begin from mockups alone if its Visual/UX Contract is still pending review.

The repository may be scaffolded and non-visual core preparation may proceed without prejudging pending visual values.

## 42. Deferred items

Deferred until separately admitted:

- SRWF Officer profile;
- SRWF Accountant profile;
- Gravity Flow-specific styling implementation;
- dossier/Entry Detail visual contract;
- style/theme selector;
- global plugin settings dashboard;
- visual editor;
- custom REST API;
- JavaScript enhancements;
- PDF integration;
- alternate profile families;
- exact minimum WordPress/PHP/Gravity versions;
- final repository license.

Deferred does not mean rejected; it means not part of the current implementation authority.

## 43. Success definition

The architecture succeeds when:

1. enabling the plugin alone does not globally restyle unrelated forms;
2. an enabled form/surface deterministically receives Base + its admitted profile;
3. host behavior and lifecycle remain native;
4. presentation rules are traceable to contracts/evidence;
5. project-specific rules stay out of generic core;
6. future profiles can be added without redesigning the ownership model;
7. clean releases can be produced independently from consumer project repositories;
8. a consumer such as SRWF can bind an exact plugin release without duplicating plugin source.

## 44. Governing invariants

```yaml
invariants:
  plugin_identity: generic_presentation_engine
  runtime_design_inference: forbidden
  per_form_global_styling: opt_in_only
  host_behavior_ownership: preserved
  project_business_logic_in_core: forbidden
  javascript_default: zero
  font_delivery_in_generic_core: none
  source_repo_is_installable_zip: false
  gallery_overrides_contract: false
  ui_hiding_is_authorization: false
  srwf_role: first_major_profile_family
```

## 45. Current architecture state

```yaml
architecture:
  product: Gravity Presentation Profiles
  repository: rezahh107/Gravity-Presentation-Profiles
  status: CLOSED_FOR_IMPLEMENTATION_BOUNDARY

core:
  presentation_only: true
  generic: true
  profile_based: true
  opt_in: true
  runtime_ai: false

first_profile_family:
  id: srwf
  registration:
    status: WAITING_FOR_VISUAL_CONTRACT_ADMISSION
  officer:
    status: DEFERRED
  accountant:
    status: DEFERRED

consumer_binding:
  srwf_project_repo: rezahh107/SRWF
  plugin_source_repo: rezahh107/Gravity-Presentation-Profiles
  exact_release_binding_required: true

release:
  clean_distribution_zip_required: true
  github_source_zip_is_distribution: false
  license: OWNER_DECISION_PENDING

visual_governance:
  external_baseline: required_where_applicable
  visual_ux_contract: required_for_profile_visual_implementation
  canonical_gallery: required_for_precise_visual_acceptance
  real_runtime_validation: required_for_runtime_sensitive_claims
```

## 46. Final governing sentence

> Use native systems for truth and behavior; use Gravity Presentation Profiles only to make those systems visually coherent, accessible, deterministic, and purpose-built for the admitted profile — with SRWF as the first major profile family, not the boundary of the product.
