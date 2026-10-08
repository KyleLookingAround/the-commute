// The build: refuses on a broken rule (tools/rules.mjs), then Vite builds the site into dist/.
import { spawnSync } from 'node:child_process';
import { problems } from './rules.mjs';

const bad = problems();
if (bad.length) { for (const b of bad) console.log('FAIL  ' + b); console.log(`build: ${bad.length} broken rule${bad.length === 1 ? '' : 's'}; not building`); process.exit(1); }
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
