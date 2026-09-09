import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fail, ensureString, listFilesRecursively, hostMatches } from './wu3-evidence-common.mjs';

function validateEvidenceEntry(entry, component, policy, lifecycleSensitive, repoRoot) {
  if (!policy.qualifying_evidence_types.includes(entry.type)) fail(`adapter evidence type ${entry.type} is not qualifying`);
  ensureString(entry.reference, 'adapter evidence reference');
  ensureString(entry.provenance, 'adapter evidence provenance');
  ensureString(entry.artifact_path, 'adapter evidence artifact_path');
  ensureString(entry.artifact_sha256, 'adapter evidence artifact_sha256');
  if (!/^[0-9a-f]{64}$/.test(entry.artifact_sha256)) fail('adapter evidence artifact_sha256 must be lowercase SHA-256');
  const normalizedArtifact = entry.artifact_path.split(path.sep).join('/');
  if (!normalizedArtifact.startsWith('docs/validation/evidence/')) fail('adapter evidence artifact must live under docs/validation/evidence/');
  const artifactAbsolute = path.resolve(repoRoot, entry.artifact_path);
  if (!artifactAbsolute.startsWith(path.resolve(repoRoot) + path.sep)) fail(`adapter evidence artifact escapes repo root: ${entry.artifact_path}`);
  if (!fs.existsSync(artifactAbsolute) || !fs.statSync(artifactAbsolute).isFile()) fail(`adapter evidence artifact does not exist: ${entry.artifact_path}`);
  const observedDigest = crypto.createHash('sha256').update(fs.readFileSync(artifactAbsolute)).digest('hex');
  if (observedDigest !== entry.artifact_sha256) fail(`adapter evidence artifact digest mismatch: ${entry.artifact_path}`);

  if (entry.type === 'FIRST_PARTY_DOCUMENTATION') {
    ensureString(entry.publisher, 'FIRST_PARTY_DOCUMENTATION.publisher');
    ensureString(entry.contract_section, 'FIRST_PARTY_DOCUMENTATION.contract_section');
    ensureString(entry.accessed_at, 'FIRST_PARTY_DOCUMENTATION.accessed_at');
    let parsed;
    try { parsed = new URL(entry.reference); } catch { fail(`invalid documentation URL: ${entry.reference}`); }
    if (parsed.protocol !== 'https:') fail('first-party documentation reference must use https');
    const allowed = policy.first_party_documentation_hosts?.[component] || [];
    if (allowed.length === 0) fail(`no first-party documentation host is admitted for ${component}; use qualifying authentic runtime evidence or update authority by owner decision`);
    if (!hostMatches(parsed.hostname, allowed)) fail(`documentation host ${parsed.hostname} is not admitted as first-party for ${component}`);
  }

  if (entry.type === 'AUTHENTIC_RUNTIME') {
    if (entry.sanitized !== true) fail('AUTHENTIC_RUNTIME evidence must be sanitized');
    ensureString(entry.component_version, 'AUTHENTIC_RUNTIME.component_version');
    ensureString(entry.configuration_state, 'AUTHENTIC_RUNTIME.configuration_state');
    ensureString(entry.contract_observation, 'AUTHENTIC_RUNTIME.contract_observation');
    ensureString(entry.observed_at, 'AUTHENTIC_RUNTIME.observed_at');
  }

  if (lifecycleSensitive && entry.lifecycle_semantics_proven !== true) {
    fail('lifecycle-sensitive adapter evidence must prove relied-upon lifecycle/timing semantics');
  }
}

export function validateAdapterRegistry(registry, repoRoot) {
  if (registry.schema_version !== '1.0.0') fail('adapter registry schema_version must be 1.0.0');
  if (registry.work_unit_id !== 'WU-GPP-RUNTIME-INTEGRATION-03') fail('adapter registry work_unit_id mismatch');
  const policy = registry.policy;
  if (!policy || policy.default !== 'DENY') fail('adapter registry must be default DENY');
  if (!Array.isArray(policy.qualifying_evidence_types) || policy.qualifying_evidence_types.includes('SYNTHETIC_FIXTURE')) {
    fail('synthetic fixture evidence must not be a qualifying adapter-admission type');
  }
  if (!Array.isArray(registry.adapters)) fail('adapter registry adapters must be an array');

  const adapterById = new Map();
  const sourceToId = new Map();
  for (const adapter of registry.adapters) {
    ensureString(adapter.adapter_id, 'adapter_id');
    if (adapterById.has(adapter.adapter_id)) fail(`duplicate adapter_id: ${adapter.adapter_id}`);
    ensureString(adapter.component, `${adapter.adapter_id}.component`);
    ensureString(adapter.version_scope, `${adapter.adapter_id}.version_scope`);
    ensureString(adapter.configuration_scope, `${adapter.adapter_id}.configuration_scope`);
    if (!['selector', 'hook', 'api'].includes(adapter.contract?.type)) fail(`${adapter.adapter_id}.contract.type must be selector, hook, or api`);
    ensureString(adapter.contract?.exact_value, `${adapter.adapter_id}.contract.exact_value`);
    if (!Array.isArray(adapter.source_paths) || adapter.source_paths.length === 0) fail(`${adapter.adapter_id}.source_paths must be non-empty`);
    if (!Array.isArray(adapter.evidence) || adapter.evidence.length === 0) fail(`${adapter.adapter_id} has no qualifying evidence`);
    for (const entry of adapter.evidence) validateEvidenceEntry(entry, adapter.component, policy, adapter.lifecycle_sensitive === true, repoRoot);
    for (const relative of adapter.source_paths) {
      ensureString(relative, `${adapter.adapter_id}.source_path`);
      const normalized = relative.split(path.sep).join('/');
      if (sourceToId.has(normalized)) fail(`production adapter source registered twice: ${normalized}`);
      const absolute = path.resolve(repoRoot, relative);
      if (!absolute.startsWith(path.resolve(repoRoot) + path.sep)) fail(`adapter source escapes repo root: ${relative}`);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`registered adapter source does not exist: ${relative}`);
      const marker = `GPP_RUNTIME_ADAPTER_ID:${adapter.adapter_id}`;
      if (!fs.readFileSync(absolute, 'utf8').includes(marker)) fail(`registered adapter source lacks marker ${marker}: ${relative}`);
      sourceToId.set(normalized, adapter.adapter_id);
    }
    adapterById.set(adapter.adapter_id, adapter);
  }

  const guardedRoots = [
    path.join(repoRoot, 'src', 'RuntimeAdapters'),
    path.join(repoRoot, 'profiles')
  ];
  const guardedFiles = [];
  guardedFiles.push(...listFilesRecursively(guardedRoots[0]));
  for (const file of listFilesRecursively(guardedRoots[1])) {
    if (file.split(path.sep).includes('runtime-adapters')) guardedFiles.push(file);
  }
  for (const file of guardedFiles) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    if (!sourceToId.has(rel)) fail(`unregistered production runtime-adapter file: ${rel}`);
  }

  const markerPattern = /GPP_RUNTIME_ADAPTER_ID:([A-Za-z0-9_.-]+)/g;
  for (const root of [path.join(repoRoot, 'src'), path.join(repoRoot, 'profiles')]) {
    for (const file of listFilesRecursively(root)) {
      if (!/\.(php|css|js)$/i.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = markerPattern.exec(text)) !== null) {
        const rel = path.relative(repoRoot, file).split(path.sep).join('/');
        const adapter = adapterById.get(match[1]);
        if (!adapter) fail(`production source marker references unregistered adapter ${match[1]} in ${rel}`);
        if (!adapter.source_paths.includes(rel)) fail(`adapter ${match[1]} marker found in unregistered source path ${rel}`);
      }
    }
  }

  return true;
}
