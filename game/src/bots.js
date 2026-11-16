// bots.js — bot AI. One job: decide what each bot does on one fixed step.
// States: route (walk a waypoint chain toward its site), hold (sit on an
// angle), engage (an enemy is visible: strafe and shoot), plant (the bomb
// carrier is at a site), defuse (a defender at a planted site), investigate
// (a shot was heard nearby). Bots react to what they see — line of sight,
// distance, facing — and to what they hear: shots mark a rough position
// for a few seconds.
import { WAYPOINTS, SITES } from './map.js';
import { hasLineOfSight } from './weapons.js';

const HEAR_RADIUS = 34;

export function makeBot(id, name, team, spawn, route) {
  return {
    id, name, team, bot: true, alive: true, hp: 100,
    pos: [spawn[0], 0, spawn[1]], yaw: team === 0 ? 0 : Math.PI, pitch: 0,
    vel: [0, 0, 0], moving: false, airborne: false, ads: false,
    loadout: null, // filled in by the sim (shared makeLoadout)
    route: route.slice(), routeIdx: 0,
    state: 'route', target: null, targetPos: null, hearPos: null, hearUntil: 0,
    shootCooldown: 0, strafeDir: 1, strafeUntil: 0, holdUntil: 0,
    plantProgress: 0, defuseProgress: 0, kills: 0, deaths: 0,
  };
}

// Nearest visible enemy, or null. Vision: 55 m, 100-degree cone, clear LOS.
export function visibleEnemy(bot, players) {
  let best = null, bestD = 55;
  for (const p of players) {
    if (!p.alive || p.team === bot.team) continue;
    const dx = p.pos[0] - bot.pos[0], dz = p.pos[2] - bot.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    const ang = Math.atan2(-dx, -dz); // yaw convention: yaw 0 faces -z
    let diff = ang - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 0.9 && d > 6) continue;
    if (!hasLineOfSight(bot.pos, p.pos)) continue;
    best = p; bestD = d;
  }
  return best;
}

export function hearShot(bot, pos, now) {
  const dx = pos[0] - bot.pos[0], dz = pos[2] - bot.pos[2];
  if (dx * dx + dz * dz < HEAR_RADIUS * HEAR_RADIUS) {
    bot.hearPos = [pos[0] + (Math.random() - 0.5) * 6, 0, pos[2] + (Math.random() - 0.5) * 6];
    bot.hearUntil = now + 4;
  }
}

// Decide movement and aim for one step. Returns
// {move:[x,z], wantFire, wantAds, plant?, defuse?}. The sim applies the
// movement, collision and shooting; this file only decides.
export function botThink(bot, st, now, rand) {
  const out = { move: [0, 0], wantFire: false, wantAds: false };
  if (!bot.alive) return out;
  const enemy = visibleEnemy(bot, st.players);
  // --- bomb duties override routing ---
  if (st.bomb.state === 'planted') {
    if (bot.team === 1) { // defenders rush the planted site to defuse it
      const site = SITES[st.bomb.site];
      const d = Math.hypot(site.pos[0] - bot.pos[0], site.pos[2] - bot.pos[2]);
      if (d < 2.2 && !enemy) { out.defuse = true; return out; }
      out.move = stepToward(bot, site.pos, rand);
      return out;
    }
    // attackers hold the site: pick a hold spot near it
    if (bot.state !== 'hold') { bot.state = 'hold'; bot.holdUntil = now + 6 + rand() * 4; }
  } else if (st.bomb.carrier === bot.id && st.bomb.state === 'carried') {
    const site = SITES[bot.site || 'A'];
    const d = Math.hypot(site.pos[0] - bot.pos[0], site.pos[2] - bot.pos[2]);
    if (d < 2.5 && !enemy) { out.plant = true; return out; }
  }
  // --- combat ---
  if (enemy) {
    bot.target = enemy;
    bot.state = 'engage';
    const dx = enemy.pos[0] - bot.pos[0], dz = enemy.pos[2] - bot.pos[2];
    const d = Math.hypot(dx, dz);
    bot.yaw = Math.atan2(-dx, -dz);
    bot.pitch = Math.atan2((enemy.pos[1] + 1.3) - (bot.pos[1] + 1.5), d);
    out.wantAds = d > 12;
    // strafe sideways; close in when far, back off when point-blank
    if (now > bot.strafeUntil) {
      bot.strafeDir = rand() < 0.5 ? -1 : 1;
      bot.strafeUntil = now + 0.7 + rand() * 0.9;
    }
    const fwd = d > 18 ? 0.7 : d < 5 ? -0.5 : 0;
    const sx = -dz / (d || 1) * bot.strafeDir, sz = dx / (d || 1) * bot.strafeDir;
    out.move = [fwd * -Math.sin(bot.yaw) + sx * 0.7, fwd * -Math.cos(bot.yaw) + sz * 0.7];
    // bots are worse shots than a good player: reaction delay + slow fire
    if (now > bot.shootCooldown) { out.wantFire = true; bot.shootCooldown = now + 0.28 + rand() * 0.35; }
    return out;
  }
  // --- investigate a heard shot ---
  if (bot.hearPos && now < bot.hearUntil && bot.state !== 'hold') {
    const d = Math.hypot(bot.hearPos[0] - bot.pos[0], bot.hearPos[2] - bot.pos[2]);
    if (d > 2) { out.move = stepToward(bot, bot.hearPos, rand); return out; }
    bot.hearPos = null;
  }
  // --- hold (defenders on a site, attackers after planting) ---
  if (bot.state === 'hold') {
    if (now > bot.holdUntil) bot.state = 'route';
    else { bot.yaw += Math.sin(now * 0.4 + bot.id) * 0.002; return out; }
  }
  // --- route: walk the waypoint chain ---
  const wp = WAYPOINTS[bot.route[bot.routeIdx] ?? 0];
  if (!wp) { bot.state = 'hold'; bot.holdUntil = now + 5; return out; }
  const d = Math.hypot(wp[0] - bot.pos[0], wp[1] - bot.pos[2]);
  if (d < 1.2) {
    bot.routeIdx += 1;
    if (bot.routeIdx >= bot.route.length) { bot.state = 'hold'; bot.holdUntil = now + 5 + rand() * 3; }
    return out;
  }
  out.move = stepToward(bot, wp, rand);
  return out;
}

function stepToward(bot, target, rand) {
  const dx = target[0] - bot.pos[0], dz = target[1] - bot.pos[2];
  const wantYaw = Math.atan2(-dx, -dz);
  let diff = wantYaw - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  bot.yaw += Math.max(-0.09, Math.min(0.09, diff));
  // walk forward in the facing direction, with a little wobble so bots
  // don't look robotic
  const wob = Math.sin(bot.pos[0] * 0.3 + bot.pos[2] * 0.2) * 0.15;
  return [-Math.sin(bot.yaw + wob), -Math.cos(bot.yaw + wob)];
}
