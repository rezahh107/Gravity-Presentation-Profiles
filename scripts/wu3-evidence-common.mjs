import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = path.resolve(scriptDir, '..');

export function fail(message) { throw new Error(message); }
export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function ensureString(value, label) { if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`); }
export function listFilesRecursively(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursively(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
export function hostMatches(hostname, allowed) { return allowed.some((candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`)); }
export function validateBoundEvidenceArtifact(entry, repoRoot, label) {
  ensureString(entry.artifact_path, `${label}.artifact_path`);
  ensureString(entry.artifact_sha256, `${label}.artifact_sha256`);
  if (!/^[0-9a-f]{64}$/.test(entry.artifact_sha256)) fail(`${label}.artifact_sha256 must be lowercase SHA-256`);
  const normalizedArtifact = entry.artifact_path.split(path.sep).join('/');
  if (!normalizedArtifact.startsWith('docs/validation/evidence/')) fail(`${label} artifact must live under docs/validation/evidence/`);
  const absolute = path.resolve(repoRoot, entry.artifact_path);
  if (!absolute.startsWith(path.resolve(repoRoot) + path.sep)) fail(`${label} artifact escapes repo root`);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`${label} artifact does not exist: ${entry.artifact_path}`);
  const observedDigest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (observedDigest !== entry.artifact_sha256) fail(`${label} artifact digest mismatch: ${entry.artifact_path}`);
}
export function validateRuntimeClaimEvidence(entry, repoRoot, claimId) {
  if (entry.type !== 'AUTHENTIC_RUNTIME') fail(`${claimId} runtime proof must use AUTHENTIC_RUNTIME evidence`);
  if (entry.sanitized !== true) fail(`${claimId} authentic runtime evidence must be sanitized`);
  for (const field of ['reference','provenance','observed_at','component_version','configuration_state','contract_observation']) ensureString(entry[field], `${claimId}.qualifying_evidence.${field}`);
  validateBoundEvidenceArtifact(entry, repoRoot, `${claimId}.qualifying_evidence`);
}
