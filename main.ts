// SALTLINE — the handoff program for the three.js FPS entry.
//
// When the grader runs this file it assembles the submission in a scratch
// directory: the playable game and the screenshots are copied over, and a
// dossier describing the whole entry is produced from them. The dossier is
// the only thing the judge reads, so it has to be exactly what the kit's
// library would write for the same files.
//
// Run it locally with MAKEFUN_OUTPUT_DIR set to a throwaway folder, e.g.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and it will fill that folder instead of /output.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// Where this file lives is the repository root; everything we hand in sits
// next to it.
const repoRoot = dirname(fileURLToPath(import.meta.url));

// The grader gives us /output, but a local run can point somewhere else.
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(destination, { recursive: true });

// The game itself: a directory of static files, index.html at its root.
cpSync(join(repoRoot, 'game'), join(destination, 'game'), { recursive: true });

// The renders of the game. There are four of them, the first being the
// cover image the judge sees first.
cpSync(join(repoRoot, 'screenshots'), join(destination, 'screenshots'), {
  recursive: true,
});

// The dossier is a canonical summary of the assembled directory: the
// screenshots plus the game's source text, cut to the gate's limits so the
// entry stays inside the size the scorer allows. Writing it with the same
// caps the scorer uses means our copy and the scorer's rebuild agree byte
// for byte.
const dossier = buildDossier(destination, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(destination, 'dossier.json'), dossier);
