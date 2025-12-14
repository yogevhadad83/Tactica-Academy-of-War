import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const outfile = 'dist/engine/battleEngine.cjs';
const outdir = dirname(outfile);

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ['src/engine/battleEngine.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  outfile,
  sourcemap: true,
});

console.log(`Built ${outfile}`);
