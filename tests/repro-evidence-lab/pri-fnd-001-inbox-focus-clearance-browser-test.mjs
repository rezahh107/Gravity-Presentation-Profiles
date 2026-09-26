import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!artifactDir) throw new Error('WU21_ARTIFACT_DIR is required.');

fs.writeFileSync(path.join(artifactDir, 'pri-fnd-001-focus-clearance.json'), JSON.stringify({ status: 'PENDING_PROBE' }, null, 2) + '\n');
