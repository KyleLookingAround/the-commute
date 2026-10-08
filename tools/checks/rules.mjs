// The source rules (tools/rules.mjs) hold on the real tree, and each rule is proved to catch a slip on a throwaway
// fixture: a Math.random() in the sim, an import of three from the sim, the word localStorage in a data file, a file
// with no opening comment. No browser.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { problems, randomSlips, layerSlips, headerSlips } from '../rules.mjs';

export default async function ({ ok, root }) {
  const bad = problems();
  ok('rules: every source file keeps them', !bad.length, bad.slice(0, 3).join('; '));
  const fx = 'src/sim/__fixture__';
  mkdirSync(join(root, fx), { recursive: true });
  try {
    writeFileSync(join(root, fx, 'a.js'), '// a fixture\nconst x = Math.random();\n');
    writeFileSync(join(root, fx, 'b.js'), "// a fixture\nimport * as THREE from 'three';\nconst y = localStorage;\n");
    writeFileSync(join(root, fx, 'c.js'), 'const z = 1;\n');
    const files = [fx + '/a.js', fx + '/b.js', fx + '/c.js'];
    ok('rules: catches Math.random() in the sim', randomSlips(files).length === 1);
    ok('rules: catches an import of three and a DOM name in the sim', layerSlips(files).length === 2, JSON.stringify(layerSlips(files)));
    ok('rules: catches a file with no opening comment', headerSlips(files).length === 1);
  } finally { rmSync(join(root, fx), { recursive: true, force: true }); }
}
