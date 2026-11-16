// weapons.js — weapon state and the firing model.
// One job: given a shooter and a direction, resolve one bullet. Hits are
// ray-vs-sphere (head / body) against players, then ray-vs-AABB against the
// map. Spread grows with movement and bloom; aiming down sights shrinks it;
// recoil kicks the pitch up and settles again after the shot.
import { WEAPONS } from './state.js';
import { losBlocked, COLLIDERS } from './map.js';

export function makeLoadout() {
  return {
    owned: { rifle: true, pistol: true, smg: false, sniper: false },
    current: 'rifle',
    mag: { rifle: 30, smg: 32, sniper: 5, pistol: 12 },
    reserve: { rifle: 90, smg: 96, sniper: 15, pistol: 36 },
    grenades: 1,
    lastShot: -9, reloadUntil: 0, bloom: 0, recoilPitch: 0,
  };
}

export function switchWeapon(loadout, key) {
  if (!loadout.owned[key] || loadout.current === key) return false;
  loadout.current = key; loadout.bloom = 0;
  return true;
}

export function startReload(loadout, now) {
  const w = WEAPONS[loadout.current];
  if (loadout.mag[loadout.current] >= w.mag) return false;
  if (loadout.reserve[loadout.current] <= 0) return false;
  if (loadout.reloadUntil > now) return false;
  loadout.reloadUntil = now + w.reload;
  return true;
}

export function finishReload(loadout) {
  const w = WEAPONS[loadout.current];
  const need = w.mag - loadout.mag[loadout.current];
  const take = Math.min(need, loadout.reserve[loadout.current]);
  loadout.mag[loadout.current] += take;
  loadout.reserve[loadout.current] -= take;
}

// Spread for the next shot (radians), before the random cone is drawn.
export function currentSpread(loadout, moving, airborne, ads) {
  const w = WEAPONS[loadout.current];
  let s = ads ? w.adsSpread : w.spread;
  if (moving) s += w.moveSpread;
  if (airborne) s += 0.03;
  return s + loadout.bloom;
}

// Ray-sphere intersection: distance along the ray, or Infinity on a miss.
// Head sphere r=0.24 at y+1.52, body sphere r=0.45 at y+0.95 (feet origin).
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

// Ray against the map's AABBs: nearest hit distance, or the range cap.
function rayMap(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    let t0 = 0, t1 = best;
    for (let a = 0; a < 3; a++) {
      const o = a === 0 ? ox : a === 1 ? oy : oz;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      const mn = c.min[a], mx = c.max[a];
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { t0 = Infinity; break; } continue; }
      let ta = (mn - o) / d, tb = (mx - o) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 >= 0 && t0 < best) best = t0;
  }
  return best;
}

// Fire one bullet. Returns {hit, victim, head, point, wallT, damage} or null
// when the weapon is not ready; {empty:true} when the magazine is dry.
// `rand` is seeded so staged screenshots are deterministic.
export function fire(loadout, shooter, dir, now, players, rand) {
  const w = WEAPONS[loadout.current];
  if (now - loadout.lastShot < w.rate) return null;
  if (loadout.reloadUntil > now) return null;
  if (loadout.mag[loadout.current] <= 0) return { empty: true };
  loadout.lastShot = now;
  loadout.mag[loadout.current] -= 1;
  loadout.bloom = Math.min(0.05, loadout.bloom + w.recoil * 0.55);
  loadout.recoilPitch += w.recoil;
  const ox = shooter.pos[0], oy = shooter.pos[1] + 1.5, oz = shooter.pos[2];
  // random point inside the spread cone
  const sp = currentSpread(loadout, shooter.moving, shooter.airborne, shooter.ads);
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * sp;
  const dx = dir[0] + Math.cos(a) * r, dy = dir[1] + Math.sin(a) * r * 0.6, dz = dir[2] + Math.sin(a) * r;
  const len = Math.hypot(dx, dy, dz);
  const d = [dx / len, dy / len, dz / len];
  const wallT = rayMap(ox, oy, oz, d[0], d[1], d[2], w.range);
  let bestT = wallT, victim = null, head = false;
  for (const p of players) {
    if (!p.alive || p.id === shooter.id || p.team === shooter.team) continue;
    const th = raySphere(ox, oy, oz, d[0], d[1], d[2], p.pos[0], p.pos[1] + 1.52, p.pos[2], 0.24);
    const tb = raySphere(ox, oy, oz, d[0], d[1], d[2], p.pos[0], p.pos[1] + 0.95, p.pos[2], 0.45);
    const t = Math.min(th, tb);
    if (t < bestT) { bestT = t; victim = p; head = th <= tb; }
  }
  const point = [ox + d[0] * bestT, oy + d[1] * bestT, oz + d[2] * bestT];
  return { hit: !!victim, victim, head, point, wallT, damage: victim ? w.damage * (head ? w.headMul : 1) : 0 };
}

export function hasLineOfSight(a, b) {
  return !losBlocked(a[0], a[1] + 1.5, a[2], b[0], b[1] + 1.4, b[2]);
}
