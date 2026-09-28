import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!artifactDir) throw new Error('WU21_ARTIFACT_DIR is required.');
const file = path.join(artifactDir, 'gpp-support-bundle-stale.json');
if (!fs.existsSync(file)) throw new Error('Downloaded GPP support bundle artifact is missing.');

const raw = fs.readFileSync(file, 'utf8');
const bundle = JSON.parse(raw);
if (bundle.schema_version !== '1.1.0' || bundle.bundle_type !== 'gpp.support_bundle') throw new Error('Support bundle schema/type mismatch.');
if (!bundle.observed || !bundle.observed.binding_health || !bundle.observed.diagnostics || !bundle.observed.entry_detail_setup) throw new Error('Support bundle observed facts are incomplete.');
if (bundle.observed.entry_detail_setup.attempted !== false) throw new Error('Support bundle must report that no explicit Entry Detail setup was attempted in the WU21 diagnostics fixture.');
if (!Array.isArray(bundle.unknown_or_unproven) || typeof bundle.privacy_boundary !== 'object') throw new Error('Support bundle fact/proof boundary is missing.');

// Native-First Inbox keeps the shared diagnostics stage vocabulary stable for
// historical consumers, but its production path no longer evaluates semantic
// binding readiness or a GPP-owned row/cell presentation output. Requiring
// those retired stages would force diagnostics to fabricate decisions that the
// production adapter no longer makes. Validate the actual current decision
// path instead: one successful profile-resolution event and no retired Card
// Mode ownership stages.
const inbox = bundle.observed.diagnostics.recent_success?.['gravity_flow.inbox'];
if (!inbox) throw new Error('Support bundle does not contain successful Inbox runtime decision evidence.');
const stages = (inbox.events || []).map(event => event.stage);
if (stages.length !== 1 || stages[0] !== 'INBOX_PROFILE_RESOLUTION') {
  throw new Error(`Inbox trace is not the Native-First decision path: ${JSON.stringify(stages)}`);
}
const retiredOwnershipStages = stages.filter(stage => ['INBOX_BINDING_READINESS', 'INBOX_PRESENTATION_OUTPUT'].includes(stage));
if (retiredOwnershipStages.length !== 0) {
  throw new Error(`Retired Card Mode diagnostics ownership leaked into Native-First Inbox: ${JSON.stringify(retiredOwnershipStages)}`);
}
if (inbox.events[0]?.result !== 'PASS') throw new Error(`Native-First Inbox profile resolution did not succeed: ${inbox.events[0]?.result ?? 'missing'}`);

let previousSeq = 0;
for (const event of inbox.events || []) {
  if (!Number.isInteger(event.seq) || event.seq <= previousSeq) throw new Error('Runtime trace sequence is not ordered.');
  previousSeq = event.seq;
  if (!['PASS', 'SKIP', 'FAIL', 'NOT_APPLICABLE'].includes(event.result)) throw new Error(`Unknown shared runtime result: ${event.result}`);
}

const forbiddenPatterns = [
  /PASSWORD=/i,
  /Authorization:/i,
  /Bearer\s+[A-Za-z0-9._~-]+/i,
  /private-passport\.jpg/i,
  /secret-document\.pdf/i,
  /WU21 Beta Student/i,
  /SYN-B-[A-Za-z0-9-]*/i,
  /\/home\/runner\//i,
  /wp-content\/uploads\//i,
];
for (const pattern of forbiddenPatterns) {
  if (pattern.test(raw)) throw new Error(`Support bundle failed privacy falsification: ${pattern}`);
}

const validation = {
  schema_version: bundle.schema_version,
  bundle_type: bundle.bundle_type,
  sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  size_bytes: Buffer.byteLength(raw),
  binding_health_present: true,
  runtime_diagnostics_present: true,
  entry_detail_setup_present: true,
  entry_detail_setup_attempted: bundle.observed.entry_detail_setup.attempted,
  inbox_stages: stages,
  native_first_retired_ownership_stages_absent: true,
  privacy_falsification: 'PASS',
};

fs.writeFileSync(
  path.join(artifactDir, 'gpp-support-bundle-validation.json'),
  JSON.stringify(validation, null, 2) + '\n'
);

const browserResultsFile = path.join(artifactDir, 'browser-results.json');
const diagnosticsResultsFile = path.join(artifactDir, 'diagnostics-admin-browser-results.json');
if (!fs.existsSync(browserResultsFile) || !fs.existsSync(diagnosticsResultsFile)) {
  throw new Error('Durable diagnostics evidence inputs are missing.');
}
const browserResults = JSON.parse(fs.readFileSync(browserResultsFile, 'utf8'));
const diagnosticsAdmin = JSON.parse(fs.readFileSync(diagnosticsResultsFile, 'utf8'));
browserResults.diagnostics_admin = diagnosticsAdmin;
browserResults.support_bundle_validation = validation;
browserResults.support_bundle = bundle;
fs.writeFileSync(browserResultsFile, JSON.stringify(browserResults, null, 2) + '\n');

console.log('GPP_SUPPORT_BUNDLE_VALIDATION_PASS');
