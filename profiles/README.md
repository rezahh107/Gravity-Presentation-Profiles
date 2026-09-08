# Profiles

This directory represents the profile layer of Gravity Presentation Profiles.

Production profile code is intentionally not created until the first profile contract is admitted.

## Model

```text
Base presentation system
        +
zero or one primary profile per enabled form/surface
```

A profile is a bounded functional/presentation contract. It is not automatically a visual theme.

## First planned profile family

```text
SRWF
└── Registration   # first implementation candidate
```

Deferred:

```text
SRWF
├── Officer
└── Accountant
```

These deferred profiles must not be inferred from the Registration contract.

## Profile admission requirements

Before production profile code is added, the profile should have:

- a stable profile identifier;
- a governing Visual/UX Contract;
- admitted design tokens/rules;
- documented host dependencies;
- documented behavior/presentation ownership;
- responsive rules;
- accessibility requirements;
- runtime-sensitive items explicitly named;
- visual acceptance references where precision matters;
- tests/validation plan.

## Generic core boundary

Do not place project-specific tokens, selectors, or composition rules in generic core merely because the first profile uses them.

Likewise, do not duplicate generic profile-registry or host-integration primitives inside an individual profile.

## Future visual styles

The architecture must not make future alternate visual styles impossible, but no multi-style/theme selector is authorized yet.

Do not create style variants without a concrete owner-approved use case that requires more than one visual language for the same functional profile.
