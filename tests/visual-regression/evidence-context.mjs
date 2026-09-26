import fs from 'node:fs';
import path from 'node:path';

const infra = message => { throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${message}`); };

export const EMPTY_STATE_QUALIFICATION_ID = 'GPP-INBOX-EMPTY-STATE-SEAM-V1';
export const EMPTY_STATE_LIMITATION_OUTCOME = 'NO_SUPPORTED_SEARCH_NO_RESULT_PRESENTATION_SEAM';
export const MATRIX_J_QUALIFICATION_ID = 'GPP-INBOX-MATRIX-J-BROWSER-ZOOM-V1';

if (process.env.WU21_ARTIFACT_DIR && process.env.WU21_WP_PATH && process.env.WU21_WP_CLI) {
  const root=path.join(process.env.WU21_ARTIFACT_DIR,'visual-regression-diagnostics');
  const integratedHost=path.join(process.env.WU21_ARTIFACT_DIR,'integrated-visual-host.json');
  const fixtureManifest=path.join(process.env.WU21_ARTIFACT_DIR,'fixture-manifest.json');
  if(fs.existsSync(integratedHost)&&fs.existsSync(fixtureManifest)){
    const emptyPath=path.join(root,'empty-state-seam.json');
    const matrixPath=path.join(root,'matrix-j-browser-zoom.json');
    if(!fs.existsSync(emptyPath)) await import('../repro-evidence-lab/inbox-empty-state-seam-qualification.mjs');
    if(!fs.existsSync(matrixPath)) await import('./matrix-j-browser-zoom.mjs');
  }
}

export function buildDesignEvidenceContext(scenario, emptyStateQualification = null) {
  const context = { scenario_id: scenario?.id ?? null, relation_dispositions: {} };
  const dispositions = scenario?.relation_dispositions;
  if (!dispositions) return context;
  if (typeof dispositions !== 'object' || Array.isArray(dispositions)) infra(`relation dispositions are malformed for ${scenario?.id || 'unknown scenario'}.`);

  for (const [relation, disposition] of Object.entries(dispositions)) {
    if (!disposition || disposition.classification !== 'NATIVE_HOST_LIMITATION') {
      infra(`unsupported relation disposition for ${scenario.id}/${relation}.`);
    }
    if (disposition.qualification_id !== EMPTY_STATE_QUALIFICATION_ID) {
      infra(`unexpected qualification id for ${scenario.id}/${relation}.`);
    }
    if (!emptyStateQualification || emptyStateQualification.qualification_id !== EMPTY_STATE_QUALIFICATION_ID) {
      infra(`required empty-state seam qualification is unavailable for ${scenario.id}/${relation}.`);
    }
    if (emptyStateQualification.status !== 'PROVEN' || emptyStateQualification.conclusion !== EMPTY_STATE_LIMITATION_OUTCOME) {
      infra(`empty-state seam qualification does not support native-host limitation for ${scenario.id}/${relation}.`);
    }
    const routes = emptyStateQualification.runtime_observations?.routes;
    if (!Array.isArray(routes) || routes.length < 2 || routes.some(route => route.zero_rows !== true || route.native_grid_count !== 1 || route.no_rows_center_state !== 'ABSENT')) {
      infra(`empty-state seam runtime evidence is incomplete for ${scenario.id}/${relation}.`);
    }
    context.relation_dispositions[relation] = {
      classification: 'NATIVE_HOST_LIMITATION',
      reason: disposition.reason,
      evidence_ref: 'empty-state-seam.json',
      qualification_id: EMPTY_STATE_QUALIFICATION_ID,
      qualification_conclusion: EMPTY_STATE_LIMITATION_OUTCOME,
    };
  }
  return context;
}
