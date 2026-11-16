// SALTLINE entrypoint (Node 22, standard library only).
// Copies game/ and screenshots/ beside this file into /output and writes
// /output/dossier.json with the kit's vendored buildDossier library, exactly
// as the gate rebuilds it. Serve locally with `node serve.ts`, then open
// http://localhost:8080. Outside the grader, MAKEFUN_OUTPUT_DIR stands in
// for /output:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Gate caps from the kit (reference/gate.json): text 160 KiB, at most 4
// screenshots of at most 256 KiB, game/ at most 993 files / 48 MiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
