import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defaultRepoRoot, fail, readJson } from './wu3-evidence-common.mjs';
import { validateLedger } from './wu3-ledger-validator.mjs';
import { validateAdapterRegistry } from './wu3-adapter-validator.mjs';
export { validateLedger, validateAdapterRegistry };

function validateCiIntegration(repoRoot) {
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
  if (!fs.existsSync(workflowPath)) fail('CI workflow is missing');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  for (const required of [
    'name: Merge-result / push validation',
    'name: PR exact-Head validation',
    'expected="${{ github.sha }}"',
    'expected="${{ github.event.pull_request.head.sha }}"'
  ]) {
    if (!workflow.includes(required)) fail(`existing CI identity/guard missing: ${required}`);
  }
  const runMatches = workflow.match(/bash scripts\/run-wu3-validation\.sh/g) || [];
  if (runMatches.length !== 2) fail(`WU3 validation must run in both CI identities; observed ${runMatches.length} invocations`);
  const pinnedNodeAction = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
  const pinnedChromeAction = 'browser-actions/setup-chrome@48ad923757ca74d66703209fe939badbdf80f2f4';
  if ((workflow.match(new RegExp(pinnedNodeAction.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g')) || []).length !== 2) {
    fail('pinned setup-node action must be present in both WU3 CI lanes');
  }
  if ((workflow.match(new RegExp(pinnedChromeAction.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g')) || []).length !== 2) {
    fail('pinned setup-chrome action must be present in both WU3 CI lanes');
  }
  if ((workflow.match(/node-version:\s*'22\.16\.0'/g) || []).length !== 2) fail('Node 22.16.0 must be pinned in both WU3 CI lanes');
  if ((workflow.match(/chrome-version:\s*'144\.0\.7559\.96'/g) || []).length !== 2) fail('Chrome 144.0.7559.96 must be pinned in both WU3 CI lanes');
  if ((workflow.match(/CHROME_BIN:\s*\$\{\{ steps\.wu3-chrome\.outputs\.chrome-path \}\}/g) || []).length !== 2) fail('WU3 browser binary must come from pinned setup-chrome outputs in both lanes');
}

function validateClaimBoundary(repoRoot) {
  const docPath = path.join(repoRoot, 'docs', 'validation', 'WU3_REVISED_VALIDATION_MODEL.md');
  if (!fs.existsSync(docPath)) fail('WU3 revised validation model documentation is missing');
  const doc = fs.readFileSync(docPath, 'utf8');
  const required = [
    'CI fixture PASS is not runtime PASS',
    'Canonical Gallery approval',
    'full WCAG conformance',
    'authentic Gravity ecosystem runtime validation',
    'public-release readiness'
  ];
  for (const phrase of required) if (!doc.includes(phrase)) fail(`WU3 claim-boundary documentation missing: ${phrase}`);
}

export function validateAll({ repoRoot = defaultRepoRoot, ledgerPath, registryPath } = {}) {
  ledgerPath ||= path.join(repoRoot, 'docs', 'validation', 'wu3-validation-coverage.json');
  registryPath ||= path.join(repoRoot, 'docs', 'validation', 'runtime-adapter-evidence.json');
  validateLedger(readJson(ledgerPath), repoRoot);
  validateAdapterRegistry(readJson(registryPath), repoRoot);
  validateCiIntegration(repoRoot);
  validateClaimBoundary(repoRoot);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateAll();
    console.log('WU3_EVIDENCE_LEDGER_AND_ADAPTER_GUARD_PASS');
  } catch (error) {
    console.error(`WU3_EVIDENCE_LEDGER_AND_ADAPTER_GUARD_FAIL: ${error.message}`);
    process.exit(1);
  }
}
