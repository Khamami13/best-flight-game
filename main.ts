// Skyhawk — a pseudo-3D chase-view flight game for make.fun's "Make the best flight game" bounty.
// Canvas 2D, no library, no network: take off from the runway, thread the glowing rings, dodge
// mountain peaks and radio towers, and land before the timer runs out. The HUD shows SPD, ALT and
// HDG; rings score points and advance the level; terrain or tower contact ends the flight with a
// game-over screen and restart. The game itself lives in game/ (plain static files a desktop
// browser loads offline, game/index.html and its ES modules). This file is the entrypoint: it
// validates game/ and screenshots/ beside it, copies both to /output, and writes
// /output/dossier.json, the summary the judge reads, via the vendored make.fun library
// (vendor/makefun-game.ts). Put 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by
// name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Entry validation, before anything is written: the scorer refuses an entry with a missing game,
// a missing index.html, fewer than 3 or more than 4 screenshots, or any screenshot over 256 KiB
// — fail here with a plain message instead of handing in a broken entry.
const gameDir = join(here, 'game');
if (!existsSync(gameDir)) throw new Error('Skyhawk entry: game/ is missing beside main.ts');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('Skyhawk entry: game/index.html is missing');
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) throw new Error('Skyhawk entry: screenshots/ is missing beside main.ts');
const shots = readdirSync(shotsDir).filter((f) => /\.(png|jpe?g)$/i.test(f));
if (shots.length < 3 || shots.length > 4) throw new Error(`Skyhawk entry: screenshots/ holds ${shots.length} images, expected 3-4`);
for (const shot of shots) {
  const size = statSync(join(shotsDir, shot)).size;
  if (size > 262144) throw new Error(`Skyhawk entry: screenshots/${shot} is ${size} bytes, over the 256 KiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
