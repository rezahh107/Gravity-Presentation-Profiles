import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const manifestPath = process.argv[2] || 'tests/visual-regression/references/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const authority = manifest.references.find(reference => reference.id === 'owner-combined-final-html');

assert.ok(authority, 'Inbox design authority metadata is missing.');
assert.equal(authority.classification, 'OWNER_APPROVED_DESIGN_AUTHORITY');
assert.equal(authority.surface, 'gravity_flow.inbox');
assert.equal(authority.approval_status, 'OWNER_APPROVED_DESIGN_NOT_RUNTIME_GOLDEN');
assert.equal(authority.comparison, 'GEOMETRY_STYLE_CONVERGENCE_AUTHORITY_NOT_FULL_PAGE_PIXEL_CONTRACT');
assert.ok(fs.existsSync(authority.repository_path), `Inbox design authority file is missing: ${authority.repository_path}`);
const digest = crypto.createHash('sha256').update(fs.readFileSync(authority.repository_path)).digest('hex');
assert.equal(digest, authority.source_sha256, 'Inbox design authority SHA256 changed unexpectedly.');
assert.deepEqual(manifest.owner_approved_goldens, [], 'An Owner-approved runtime Golden was populated without a separate approval.');

console.log(`INBOX_DESIGN_AUTHORITY_PASS sha256=${digest}`);
