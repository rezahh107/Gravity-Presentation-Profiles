import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!artifactDir) throw new Error('WU21_ARTIFACT_DIR required.');

for (const name of fs.readdirSync(artifactDir)) {
  if (!name.startsWith('inbox-width-rtl-')) continue;
  const source = path.join(artifactDir, name);
  const target = path.join(artifactDir, `pr4-${name}`);
  fs.renameSync(source, target);
}
