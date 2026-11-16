// sim.js — the fixed-step simulation. One job: advance the match by DT
// seconds. Rendering reads this state; it never writes it. Hot loops avoid
// allocations beyond small arrays the GC can handle at 60 Hz.
import { state, DT, ROUND_TIME, BUY_TIME, ROUND_WIN_POINTS, KILL_POINTS, PLANT_POINTS, DEFUSE_POINTS, WIN_POINTS, TEAM, WEAPONS } from './state.js';
import { collideCircle, SITES, SPAWNS, ROUTES } from './map.js';
import { makeLoadout, switchWeapon, startReload, finishReload, fire, hasLineOfSight } from './weapons.js';
import { makeBot, botThink, hearShot } from './bots.js';

export const BOT_NAMES = {
  amber: ['DUST', 'EMBER', 'SABLE', 'FLINT'],
  teal: ['REEF', 'TIDE', 'CORAL', 'MIST', 'KELP'],
};
const PLAYER_SPEED = 5.2, SPRINT_SPEED = 7.0, CROUCH_SPEED = 2.6, AIR_SPEED = 1.2;
const JUMP_V = 6.4, GRAVITY = 16;

let rngState = 1234567;
export function srand(seed) { rngState = seed >>> 0 || 1; }
export function rand() { // mulberry32 — deterministic for staged shots
  rngState = (rngState + 0x6D2B79F5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function newMatch() {
  state.players.length = 0;
  state.points = [0, 0]; state.roundsWon = [0, 0]; state.round = 1;
  state.winner = null; state.feed = [];
  startRound();
}

export function startRound() {
  const st = state;
  st.phase = 'buy'; st.roundTimer = BUY_TIME;
  st.bomb = { state: 'carried', carrier: 0, site: null, pos: null, timer: 0 };
  st.msg = null;
  // (re)spawn everyone: player id 0 is AMBER, ids 1-4 AMBER bots, 5-9 TEAL bots.
  st.players.length = 0;
  const site = rand() < 0.5 ? 'A' : 'B';
  const mk = (id, name, team, spawn) => {
    const p = {
      id, name, team, bot: id !== 0, alive: true, hp: 100,
      pos: [spawn[0], 0, spawn[1]], vel: [0, 0, 0], yaw: team === 0 ? 0 : Math.PI, pitch: 0,
      moving: false, airborne: false, ads: false, crouch: false,
      loadout: makeLoadout(), kills: 0, deaths: 0, money: team === 0 ? st.money : 0,
      site, route: [], state: 'route', routeIdx: 0, target: null, hearPos: null, hearUntil: 0,
      shootCooldown: 0, strafeDir: 1, strafeUntil: 0, holdUntil: 0, plantProgress: 0, defuseProgress: 0,
    };
    if (id !== 0) {
      const b = makeBot(id, name, team, spawn, ROUTES[site][team === 0 ? 'amber' : 'teal']);
      Object.assign(p, b, { loadout: p.loadout, pos: p.pos, yaw: p.yaw });
    }
    return p;
  };
  st.players.push(mk(0, 'YOU', TEAM.AMBER, SPAWNS.amber[0]));
  for (let i = 0; i < 4; i++) st.players.push(mk(i + 1, BOT_NAMES.amber[i], TEAM.AMBER, SPAWNS.amber[i + 1]));
  for (let i = 0; i < 5; i++) st.players.push(mk(i + 5, BOT_NAMES.teal[i], TEAM.TEAL, SPAWNS.teal[i]));
  // defenders start with rifles; attackers keep what they own (buy phase refills ammo)
  for (const p of st.players) {
    if (p.team === TEAM.TEAL) { p.loadout.owned.smg = true; }
    p.loadout.mag.rifle = WEAPONS.rifle.mag; p.loadout.reserve.rifle = WEAPONS.rifle.reserve;
  }
  pushFeed(`ROUND ${st.round} — ${site === 'A' ? SITES.A.name : SITES.B.name} IS THE CALL`, '');
}

export function pushFeed(text, cls) {
  state.feed.unshift({ text, cls });
  if (state.feed.length > 6) state.feed.pop();
}

export function award(team, pts) {
  state.points[team] += pts;
  if (state.points[team] >= WIN_POINTS) {
    state.phase = 'matchEnd'; state.winner = team;
    state.msg = { h: team === 0 ? 'AMBER WINS THE MATCH' : 'TEAL WINS THE MATCH', p: `${state.points[0]} — ${state.points[1]}`, until: state.time + 8 };
  }
}

function endRound(winnerTeam, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.roundsWon[winnerTeam] += 1;
  award(winnerTeam, ROUND_WIN_POINTS);
  state.phase = 'roundEnd';
  state.roundTimer = 5;
  state.msg = { h: winnerTeam === 0 ? 'AMBER TAKES THE ROUND' : 'TEAL TAKES THE ROUND', p: reason, until: state.time + 5 };
  pushFeed(state.msg.h + ' — ' + reason, winnerTeam === 0 ? 'amber' : 'teal');
  if (winnerTeam === 0) state.money += 800;
}

// Damage one player; returns true when it kills them.
export function damage(victim, dmg, attacker, head) {
  if (!victim.alive) return false;
  victim.hp -= dmg;
  if (victim.hp <= 0) {
    victim.hp = 0; victim.alive = false; victim.deaths += 1;
    if (attacker) {
      attacker.kills += 1;
      award(attacker.team, KILL_POINTS);
      pushFeed(`${attacker.name} ${head ? '⌖' : '✕'} ${victim.name}${head ? ' (HEADSHOT)' : ''}`, attacker.team === 0 ? 'amber' : 'teal');
    }
    if (state.bomb.carrier === victim.id) {
      state.bomb = { state: 'dropped', carrier: null, site: null, pos: [victim.pos[0], 0, victim.pos[2]], timer: 0 };
      pushFeed('THE SPIKE WAS DROPPED', '');
    }
    checkRoundEnd();
    return true;
  }
  return false;
}

function checkRoundEnd() {
  const aliveA = state.players.some(p => p.alive && p.team === 0);
  const aliveB = state.players.some(p => p.alive && p.team === 1);
  if (state.bomb.state === 'planted') return; // round runs until boom or defuse
  if (!aliveA) endRound(1, 'AMBER eliminated');
  else if (!aliveB) endRound(0, 'TEAL eliminated');
}

// --- player input (called from sim.step via the input object) ---
export function applyPlayerInput(p, inp, dt) {
  // inp: {fwd, strafe, jump, sprint, crouch, ads, fire, reload, switchKey, grenade, use}
  p.ads = !!inp.ads;
  p.crouch = !!inp.crouch;
  const speed = p.crouch ? CROUCH_SPEED : inp.sprint && !p.ads ? SPRINT_SPEED : PLAYER_SPEED;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let mx = (-sy * inp.fwd) + (cy * inp.strafe);
  let mz = (-cy * inp.fwd) + (-sy * inp.strafe);
  const ml = Math.hypot(mx, mz);
  p.moving = ml > 0.01;
  if (ml > 1) { mx /= ml; mz /= ml; }
  const accel = p.airborne ? AIR_SPEED : 14;
  p.vel[0] += mx * speed * accel * dt;
  p.vel[2] += mz * speed * accel * dt;
  // friction
  const fr = p.airborne ? 0.4 : 10;
  p.vel[0] -= p.vel[0] * Math.min(1, fr * dt);
  p.vel[2] -= p.vel[2] * Math.min(1, fr * dt);
  if (inp.jump && !p.airborne) { p.vel[1] = JUMP_V; p.airborne = true; }
  if (inp.switchKey) switchWeapon(p.loadout, inp.switchKey);
  if (inp.reload) startReload(p.loadout, state.time);
  if (inp.grenade && p.loadout.grenades > 0) { p.loadout.grenades -= 1; throwGrenade(p); }
  if (inp.use) tryUse(p);
}

function throwGrenade(p) {
  const dir = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
  state.grenades = state.grenades || [];
  state.grenades.push({ pos: [p.pos[0], p.pos[1] + 1.5, p.pos[2]], vel: [dir[0] * 14, dir[1] * 14 + 3, dir[2] * 14], fuse: 1.6, owner: p });
  pushFeed(`${p.name} threw a frag`, p.team === 0 ? 'amber' : 'teal');
}

function tryUse(p) {
  const b = state.bomb;
  if (b.state === 'carried' || b.state === 'dropped') return;
  if (b.state === 'planted' && p.team === 1) {
    const d = Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]);
    if (d < 2.5) p.defuseProgress += DT;
    if (p.defuseProgress >= 5) {
      b.state = 'defused'; award(1, DEFUSE_POINTS); endRound(1, 'SPIKE DEFUSED');
    }
  }
}

// Planting: the carrier stands inside a site and holds E.
function tryPlant(p, dt) {
  const b = state.bomb;
  if (b.state !== 'carried' || b.carrier !== p.id) return;
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const d = Math.hypot(s.pos[0] - p.pos[0], s.pos[2] - p.pos[2]);
    if (d < s.r) {
      p.plantProgress += dt;
      if (p.plantProgress >= 3) {
        b.state = 'planted'; b.site = key; b.pos = [s.pos[0], 0, s.pos[2]]; b.timer = 40;
        award(0, PLANT_POINTS);
        pushFeed(`SPIKE PLANTED AT SITE ${key} — 40s`, 'amber');
      }
      return;
    }
  }
  p.plantProgress = 0;
}

// --- one fixed step ---
export function step(inp) {
  const st = state;
  st.time += DT;
  if (st.phase === 'menu' || st.phase === 'matchEnd') {
    if (st.phase === 'matchEnd' && st.roundTimer > 0) st.roundTimer -= DT;
    return;
  }
  if (st.phase === 'buy') {
    st.roundTimer -= DT;
    if (st.roundTimer <= 0) { st.phase = 'play'; st.roundTimer = ROUND_TIME; }
    return;
  }
  if (st.phase === 'roundEnd') {
    st.roundTimer -= DT;
    if (st.roundTimer <= 0) {
      if (st.winner !== null) { st.phase = 'matchEnd'; return; }
      st.round += 1; startRound();
    }
    return;
  }
  // phase === 'play'
  st.roundTimer -= DT;
  if (st.roundTimer <= 0) { endRound(1, 'TIME EXPIRED — TEAL HOLDS'); return; }
  // bomb countdown
  if (st.bomb.state === 'planted') {
    st.bomb.timer -= DT;
    if (st.bomb.timer <= 0) { st.bomb.state = 'exploded'; endRound(0, 'SPIKE DETONATED'); return; }
  }
  const me = st.players[0];
  // --- player ---
  if (me.alive) {
    applyPlayerInput(me, inp, DT);
    if (inp.fire) tryFire(me);
    if (inp.use) tryPlant(me, DT); else me.plantProgress = 0;
  }
  // --- bots ---
  for (const p of st.players) {
    if (!p.alive || p.id === 0) continue;
    const think = botThink(p, st, st.time, rand);
    // move
    const speed = 4.4;
    p.vel[0] += think.move[0] * speed * 10 * DT;
    p.vel[2] += think.move[1] * speed * 10 * DT;
    p.vel[0] -= p.vel[0] * Math.min(1, 8 * DT);
    p.vel[2] -= p.vel[2] * Math.min(1, 8 * DT);
    p.moving = Math.hypot(think.move[0], think.move[1]) > 0.05;
    p.ads = think.wantAds;
    if (think.plant) {
      p.plantProgress += DT;
      if (p.plantProgress >= 3) {
        st.bomb.state = 'planted'; st.bomb.site = p.site; st.bomb.pos = [SITES[p.site].pos[0], 0, SITES[p.site].pos[2]]; st.bomb.timer = 40;
        award(0, PLANT_POINTS); pushFeed(`SPIKE PLANTED AT SITE ${p.site} — 40s`, 'amber');
      }
    } else if (think.defuse) {
      p.defuseProgress += DT;
      if (p.defuseProgress >= 5) { st.bomb.state = 'defused'; award(1, DEFUSE_POINTS); endRound(1, 'SPIKE DEFUSED'); }
    }
    if (think.wantFire) tryFire(p);
    if (p.loadout.reloadUntil > 0 && st.time >= p.loadout.reloadUntil) { finishReload(p.loadout); p.loadout.reloadUntil = 0; }
    if (p.loadout.mag[p.loadout.current] === 0) startReload(p.loadout, st.time);
  }
  // --- integrate movement and gravity for everyone ---
  for (const p of st.players) {
    if (!p.alive) continue;
    p.vel[1] -= GRAVITY * DT;
    let nx = p.pos[0] + p.vel[0] * DT, nz = p.pos[2] + p.vel[2] * DT;
    [nx, nz] = collideCircle(nx, nz, 0.45);
    p.pos[0] = nx; p.pos[2] = nz;
    p.pos[1] += p.vel[1] * DT;
    if (p.pos[1] <= 0) { p.pos[1] = 0; p.vel[1] = 0; p.airborne = false; } else p.airborne = true;
    // recoil recovery and bloom decay
    p.loadout.bloom = Math.max(0, p.loadout.bloom - DT * 0.09);
    p.loadout.recoilPitch = Math.max(0, p.loadout.recoilPitch - DT * 0.06);
    if (p.loadout.reloadUntil > 0 && st.time >= p.loadout.reloadUntil) { finishReload(p.loadout); p.loadout.reloadUntil = 0; }
  }
  // --- grenades ---
  if (st.grenades) {
    for (let i = st.grenades.length - 1; i >= 0; i--) {
      const g = st.grenades[i];
      g.vel[1] -= GRAVITY * DT;
      g.pos[0] += g.vel[0] * DT; g.pos[1] += g.vel[1] * DT; g.pos[2] += g.vel[2] * DT;
      if (g.pos[1] < 0.2) { g.pos[1] = 0.2; g.vel[1] *= -0.4; g.vel[0] *= 0.7; g.vel[2] *= 0.7; }
      g.fuse -= DT;
      if (g.fuse <= 0) {
        for (const p of st.players) {
          if (!p.alive || p.team === g.owner.team) continue;
          const d = Math.hypot(p.pos[0] - g.pos[0], p.pos[2] - g.pos[2]);
          if (d < 7) damage(p, Math.round(110 * (1 - d / 9)), g.owner, false);
        }
        st.grenades.splice(i, 1);
      }
    }
  }
  // --- dropped spike pickup ---
  if (st.bomb.state === 'dropped') {
    for (const p of st.players) {
      if (p.alive && p.team === 0 && Math.hypot(p.pos[0] - st.bomb.pos[0], p.pos[2] - st.bomb.pos[2]) < 1.5) {
        st.bomb = { state: 'carried', carrier: p.id, site: null, pos: null, timer: 0 };
        pushFeed(`${p.name} picked up the spike`, 'amber');
      }
    }
  }
}

function tryFire(shooter) {
  const st = state;
  const w = WEAPONS[shooter.loadout.current];
  if (st.time - shooter.loadout.lastShot < w.rate) return;
  if (shooter.loadout.reloadUntil > st.time) return;
  if (shooter.loadout.mag[shooter.loadout.current] <= 0) { startReload(shooter.loadout, st.time); return; }
  const dir = [-Math.sin(shooter.yaw) * Math.cos(shooter.pitch + shooter.loadout.recoilPitch),
    Math.sin(shooter.pitch + shooter.loadout.recoilPitch),
    -Math.cos(shooter.yaw) * Math.cos(shooter.pitch + shooter.loadout.recoilPitch)];
  const res = fire(shooter.loadout, shooter, dir, st.time, st.players, rand);
  if (!res || res.empty) return;
  // everyone nearby hears the shot and comes to investigate
  for (const p of st.players) if (p.bot && p.alive) hearShot(p, shooter.pos, st.time);
  st.lastShot = { shooter, point: res.point, at: st.time };
  if (res.hit && res.victim) {
    damage(res.victim, res.damage, shooter, res.head);
    st.lastHit = { shooter, victim: res.victim, head: res.head, at: st.time };
  }
}
