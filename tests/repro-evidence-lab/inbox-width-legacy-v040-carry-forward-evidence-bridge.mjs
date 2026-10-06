// Qualification-only evidence bridge. Keep the new legacy carry-forward result
// inside the already-canonical bidirectional WU21 evidence payload so the
// immutable artifact builder/upload path preserves executed evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir } from './inbox-visual-design-v2-browser-lib.mjs';

if (!artifactDir) throw new Error('Pinned WU21 lab required');

const qualificationPath = path.join(artifactDir, 'inbox-width-legacy-v040-carry-forward-qualification.json');
const canonicalPath = path.join(artifactDir, 'inbox-visual-design-v2-bidirectional-fit-recovery-evidence.json');
assert.ok(fs.existsSync(qualificationPath), 'legacy carry-forward qualification evidence missing');
assert.ok(fs.existsSync(canonicalPath), 'canonical bidirectional evidence missing');

const qualification = JSON.parse(fs.readFileSync(qualificationPath));
const canonical = JSON.parse(fs.readFileSync(canonicalPath));
assert.equal(qualification.execution_status, 'PASS', 'legacy carry-forward qualification did not pass');
assert.equal(qualification.repo_head, canonical.repo_head, 'qualification/canonical evidence head mismatch');
canonical.legacy_v040_carry_forward_qualification = qualification;
fs.writeFileSync(canonicalPath, JSON.stringify(canonical, null, 2) + '\n');

console.log('INBOX_WIDTH_LEGACY_V040_CARRY_FORWARD_EVIDENCE_BRIDGE_PASS');
