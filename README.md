[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ujangolisampink/makefun-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ujangolisampink/makefun-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# SALTLINE — Make.fun bounty #3: three.js tactical FPS

$1,000 · 10 paid (1st $400) · deadline Tue 17 Nov 2026 04:30 WIB · entry $0
Bounty: https://make.fun/bounty/threejs-fps-02
Top 5 to beat: tidy-meteor-25 97.4%, @d0txyz 95.5%, @niki-willy 95.5%, @xloudmax-lab 95.4%, @cheneyc9 95.3%

## Concept
Dusk desert-industrial bomb-plant FPS, map **Saltworks Yard** (64×44 m): Site A
silos (west), Site B warehouse (east), three lanes (A-long / mid / B-short),
crates, containers, silos, dusk palette (deep indigo sky, amber sun, teal
accents). AMBER attackers (player + 4 bots) vs TEAL defenders (5 bots).
Spike plant at A/B (hold E 3 s), defuse 5 s, 40 s fuse; 100 s rounds, 15 s buy
phase, $800 start, +$800 round win. Weapons: VK-7 rifle (30/90, 34 dmg,
head ×2), K-9 SMG $900, LONGSHOT 50 sniper $2,400, P-9 pistol, frag grenade
$300 (110 dmg in 7 m). ADS (RMB, FOV zoom, spread cut), recoil pitch kick +
bloom, spread grows moving/airborne, crouch, jump, sprint, spawn protection.
Score: round win 1,000, kill 100, plant 300, defuse 300; first team to
10,000 pts wins the match. Bots: 26-node waypoint graph, route/hold/engage/
plant/defuse/investigate states, 100° vision cone 55 m, hearing radius 34 m,
strafing, reaction delays.

## Visual polish (this rebuild)
- **Procedural textures** (`src/textures.js`, all canvas-painted, no network):
  salt-crusted concrete ground with expansion joints, wooden crates with
  grain + a symmetric diamond stencil (no mirrored text on any face),
  corrugated containers with rust runs and stencil numbers, plaster walls
  with grime and hazard stripes, brushed silo metal with rivets, asphalt
  lane strips, a gradient dusk sky with stars and a sun glow band, and
  hazard chevrons.
- **Map dressing**: barrels, sandbags, salt piles, lamp posts with warm
  heads, perimeter pipe runs, a silo catwalk, warehouse hazard door and
  glowing windows — decoration only, colliders unchanged.
- **Lighting**: low amber sun with shadows, cool hemisphere fill, amber
  point light at Site A, teal at Site B, warm lamp lights.
- **Bot models**: armoured torso with vest plate, shoulder pads, backpack,
  helmet with glowing visor, swinging legs/arms walk cycle, rifle with
  magazine and barrel, muzzle-flash sprite per bot.
- **Gunplay FX**: viewmodel rifle with scope, magazine, stock and grip;
  tracer as a bright core inside an additive halo; muzzle-flash sprite;
  impact burst particles; plant/defuse progress prompt; screen vignette.
- **Cover shot**: denser mid-field — three defenders at staggered depth,
  two allies pushing, live tracer.

## Files
- `game/index.html` — HUD (crosshair, hitmarker, ammo, health bar, topbar
  timer/score, objective, team status, kill feed, 180×180 minimap, plant/
  defuse prompt, round message, buy overlay, ADS vignette), import map
  `"three" → ./vendor/three/three.module.min.js`
- `game/src/` — `state.js` (DT 1/60, WIN_POINTS 10000, WEAPONS),
  `textures.js` (procedural canvas textures), `map.js` (colliders, SITES
  A/B, SPAWNS, WAYPOINTS/EDGES/ROUTES, collideCircle, losBlocked,
  buildMapScene), `weapons.js` (loadout, reload, spread, raySphere
  head/body, rayMap, fire), `bots.js` (makeBot, visibleEnemy, hearShot,
  botThink), `sim.js` (mulberry32, newMatch, rounds, damage, grenades,
  spike pickup, fixed-step), `render.js` (dusk lighting, viewmodel gun +
  muzzle light/flash, bot soldier meshes + walk cycle + name-tag sprites,
  tracer core+halo pool, particle pool), `audio.js` (WebAudio synth sfx),
  `hud.js` (buy menu, updateHud, drawMinimap), `input.js` (WASD, pointer
  lock, fire/ADS, R reload, 1–4 weapons, G grenade, B buy, Space jump,
  E use), `main.js` (bootstrap, fixed-step accumulator, staged shots,
  `__saltline` debug hook)
- `game/vendor/three/` — three.js 0.187.0 vendored byte-for-byte from the kit
- `main.ts` — copies game/+screenshots/ to /output, writes dossier.json
  via kit `buildDossier`; `serve.ts` — static server :8080; `shots.json` —
  4 shots; `LICENSE` (MIT)
- `screenshots/` — 1-play.jpg (cover: mid-lane firefight, three defenders,
  tracer), 2-start.jpg (buy menu), 3-plant.jpg (spike planted A, defenders
  pushing), 4-end.jpg (round won, silos + ring)
