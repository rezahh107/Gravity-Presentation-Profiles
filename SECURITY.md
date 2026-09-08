# Security Policy

Gravity Presentation Profiles is intended to remain a presentation-only WordPress plugin. Security reports should be handled conservatively because presentation code can still affect authorization boundaries, data exposure, and browser behavior when implemented incorrectly.

## Supported versions

No production version has been released yet. Supported-version policy will be defined with the first release.

## Reporting a vulnerability

Prefer GitHub private vulnerability reporting / Security Advisories for this repository when available. Do not publish exploit details, credentials, private URLs, real form submissions, or personally identifiable data in a public issue.

If private reporting is unavailable, contact the repository owner privately before opening a public issue.

## Security boundaries

The plugin must not:

- bypass WordPress, Gravity Forms, Gravity Flow, or consumer-project authorization;
- treat CSS hiding as access control;
- expose fields/data that the current user is not authorized to access;
- execute arbitrary user-supplied CSS/JavaScript as a presentation feature;
- introduce a parallel data/workflow store;
- weaken host validation or workflow semantics to match a visual mockup.

## Test data

Use synthetic data only. Never commit real student, customer, payment, authentication, or other sensitive personal data in tests, screenshots, logs, fixtures, or documentation.

## Dependency security

New runtime dependencies require an explicit justification and must be reviewed for maintenance and security impact before admission.
