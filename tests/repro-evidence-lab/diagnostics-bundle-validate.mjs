import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!artifactDir) throw new Error('WU21_ARTIFACT_DIR is required.');
const file = path.join(artifactDir, 'gpp-support-bundle-stale.json');
if (!fs.existsSync(file)) throw new Error('Downloaded GPP support bundle artifact is missing.');

const raw = fs.readFileSync(file, 'utf8');
const bundle = JSON.parse(raw);
if (bundle.schema_version !== '1.0.0' || bundle.bundle_type !== 'gpp.support_bundle') throw new Error('Support bundle schema/type mismatch.');
if (!bundle.observed || !bundle.observed.binding_health || !bundle.observed.diagnostics) throw new Error('Support bundle observed facts are incomplete.');
if (!Array.isArray(bundle.unknown_or_unproven) || typeof bundle.privacy_boundary !== 'object') throw new Error('Support bundle fact/proof boundary is missing.');

const traces = [
  ...(bundle.observed.diagnostics.recent_incidents || []),
  ...Object.values(bundle.observed.diagnostics.recent_success || {}),
];
const inbox = traces.find(trace => trace?.surface === 'gravity_flow.inbox');
if (!inbox) throw new Error('Support bundle does not contain observed Inbox runtime decision evidence.');
const stages = (inbox.events || []).map(event => event.stage);
if (!stages.includes('INBOX_PROFILE_RESOLUTION') || !stages.includes('INBOX_BINDING_READINESS') || !stages.includes('INBOX_PRESENTATION_OUTPUT')) {
  throw new Error(`Inbox trace is not mapped to the shared stable stage vocabulary: ${JSON.stringify(stages)}`);
}
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
  inbox_stages: stages,
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
