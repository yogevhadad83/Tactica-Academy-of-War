import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..');
const outfile = resolve(workspaceRoot, 'dist/engine/battleEngine.cjs');
const outdir = dirname(outfile);

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [resolve(workspaceRoot, 'src/engine/battleEngine.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  outfile,
  sourcemap: true,
});

console.log(`Built ${outfile}`);
