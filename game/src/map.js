// map.js — Saltworks Yard: an original dusk-industrial map.
// Two bomb sites (A = silos west, B = warehouse east), three lanes (A-long,
// mid, B-short), crates and containers as cover. Colliders are axis-aligned
// boxes; the waypoint graph is what the bots walk. All units are metres,
// Y is up, ground is y = 0. Visual dressing (pipes, barrels, sandbags,
// light poles, salt piles) is decoration only — it never changes a collider.
import * as THREE from 'three';
import { groundTexture, crateTexture, containerTexture, wallTexture,
         siloTexture, laneTexture, skyTexture, hazardTexture } from './textures.js';

export const COLLIDERS = [];
function box(cx, cz, w, d, h, y0 = 0) {
  COLLIDERS.push({ min: [cx - w / 2, y0, cz - d / 2], max: [cx + w / 2, y0 + h, cz + d / 2] });
  return { cx, cz, w, d, h, y0 };
}
// Perimeter walls (map is 64 x 44, centred on the origin).
export const MAP = { w: 64, d: 44 };
const W = MAP.w / 2, D = MAP.d / 2;
box(0, -D - 0.5, MAP.w + 4, 1, 6); box(0, D + 0.5, MAP.w + 4, 1, 6);
box(-W - 0.5, 0, 1, MAP.d + 4, 6); box(W + 0.5, 0, 1, MAP.d + 4, 6);

// Site A (west, silos) cover + site B (east, warehouse) cover + mid.
export const PROPS = [
  box(-24, -10, 6, 2, 3.2), box(-24, 10, 6, 2, 3.2),            // A-site walls
  box(-18, 0, 2, 10, 2.6), box(-12, -14, 4, 4, 2.2), box(-12, 14, 4, 4, 2.2),
  box(24, -10, 6, 2, 3.2), box(24, 10, 6, 2, 3.2),             // B-site walls
  box(18, 0, 2, 10, 2.6), box(12, -14, 4, 4, 2.2), box(12, 14, 4, 4, 2.2),
  box(0, -8, 8, 2, 2.4), box(0, 8, 8, 2, 2.4),                 // mid double doors
  box(-4, 0, 2, 2, 1.2), box(4, 0, 2, 2, 1.2),                 // mid crates
  box(-8, -18, 3, 3, 1.8), box(8, 18, 3, 3, 1.8), box(-8, 18, 3, 3, 1.8), box(8, -18, 3, 3, 1.8),
  box(0, -20, 10, 1, 4), box(0, 20, 10, 1, 4),                 // long walls top/bottom
];
// Silos at site A (cylinders use a box collider in the sim).
box(-27, -16, 5, 5, 7); box(-27, 16, 5, 5, 7); box(-27, 0, 5, 5, 7);

export const SITES = {
  A: { pos: [-25, 0, 0], r: 5, name: 'SITE A — SILOS' },
  B: { pos: [25, 0, 0], r: 5, name: 'SITE B — WAREHOUSE' },
};
export const SPAWNS = {
  amber: [[-29, -6], [-29, 0], [-29, 6], [-27, -12], [-27, 12]],
  teal: [[29, -6], [29, 0], [29, 6], [27, -12], [27, 12]],
};
// Waypoint graph: the nodes bots walk. Edges join neighbours by index.
export const WAYPOINTS = [
  [-29, 0], [-20, 0], [-12, 0], [-4, 0], [4, 0], [12, 0], [20, 0], [29, 0],       // 0-7 mid
  [-20, -14], [-12, -14], [-4, -14], [4, -14], [12, -14], [20, -14],               // 8-13 top lane
  [-20, 14], [-12, 14], [-4, 14], [4, 14], [12, 14], [20, 14],                     // 14-19 bottom lane
  [-25, -8], [-25, 8], [25, -8], [25, 8], [-25, 0], [25, 0],                       // 20-25 sites
];
export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
  [1, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 6],
  [1, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 6],
  [8, 20], [14, 21], [20, 24], [21, 24], [13, 22], [19, 23], [22, 25], [23, 25],
  [2, 9], [2, 15], [5, 11], [5, 17], [3, 10], [3, 16], [4, 11], [4, 17],
];
export const ROUTES = { // site -> waypoint chains from each spawn side
  A: { amber: [0, 1, 8, 20, 24], teal: [7, 6, 13, 22, 24] },
  B: { amber: [0, 1, 14, 21, 25], teal: [7, 6, 19, 23, 25] },
};

// --- collision helpers (sim only; no allocations in hot loops) ---
export function collideCircle(px, pz, r) {
  // Push a circle (player radius r) out of every AABB; returns corrected [x, z].
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    const nx = Math.max(c.min[0], Math.min(px, c.max[0]));
    const nz = Math.max(c.min[2], Math.min(pz, c.max[2]));
    const dx = px - nx, dz = pz - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * r; pz = nz + (dz / d) * r;
      } else { // centre inside the box: leave along the shallowest axis
        const pl = px - c.min[0], pr = c.max[0] - px, pt = pz - c.min[2], pb = c.max[2] - pz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) px = c.min[0] - r; else if (m === pr) px = c.max[0] + r;
        else if (m === pt) pz = c.min[2] - r; else pz = c.max[2] + r;
      }
    }
  }
  px = Math.max(-W + r, Math.min(W - r, px));
  pz = Math.max(-D + r, Math.min(D - r, pz));
  return [px, pz];
}

// Segment vs AABB (slab method). True when any collider blocks the sightline.
export function losBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < COLLIDERS.length; i++) {
    const c = COLLIDERS[i];
    let t0 = 0, t1 = 1;
    for (let a = 0; a < 3; a++) {
      const o = a === 0 ? ax : a === 1 ? ay : az;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      const mn = c.min[a], mx = c.max[a];
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { t0 = 1; t1 = 0; break; } continue; }
      let ta = (mn - o) / d, tb = (mx - o) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1 && t1 > 0) return true;
  }
  return false;
}

// --- three.js scene for the map (render only) ---
export function buildMapScene(scene) {
  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
    lane: new THREE.MeshStandardMaterial({ map: laneTexture(), roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.95 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 }),
    contA: new THREE.MeshStandardMaterial({ map: containerTexture('#b3541e', '#7a3a12', 11), roughness: 0.75, metalness: 0.25 }),
    contB: new THREE.MeshStandardMaterial({ map: containerTexture('#1e6f6b', '#124a47', 23), roughness: 0.75, metalness: 0.25 }),
    silo: new THREE.MeshStandardMaterial({ map: siloTexture(), roughness: 0.45, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 1 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x8a2f1e, roughness: 0.6, metalness: 0.4 }),
    barrelTeal: new THREE.MeshStandardMaterial({ color: 0x1e5f6b, roughness: 0.6, metalness: 0.4 }),
    sand: new THREE.MeshStandardMaterial({ color: 0xa8895f, roughness: 1 }),
    salt: new THREE.MeshStandardMaterial({ color: 0xe8ddc0, roughness: 1 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.4, metalness: 0.7 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe0b3, emissive: 0xffc266, emissiveIntensity: 1.6 }),
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w + 8, MAP.d + 8), mats.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // worn asphalt strips down the three lanes
  for (const z of [-14, 0, 14]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w, 5), mats.lane);
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.02, z);
    strip.receiveShadow = true; scene.add(strip);
  }
  const addBox = (p, mat, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mat);
    m.position.set(p.cx, p.y0 + p.h / 2, p.cz); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
  };
  for (const p of PROPS) {
    // outer site walls read as containers, inner blocks as crates
    addBox(p, Math.abs(p.cx) >= 24 && p.d === 2 ? mats.contA : mats.crate);
  }
  // perimeter walls, textured
  for (const [x, z, w, d] of [[0, -D - 0.5, MAP.w + 4, 1], [0, D + 0.5, MAP.w + 4, 1], [-W - 0.5, 0, 1, MAP.d + 4], [W + 0.5, 0, 1, MAP.d + 4]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), mats.wall);
    m.position.set(x, 3, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  // silos at site A, with domed caps and a catwalk pipe between them
  for (const [x, z] of [[-27, -16], [-27, 16], [-27, 0]]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7, 18), mats.silo);
    s.position.set(x, 3.5, z); s.castShadow = true; s.receiveShadow = true; scene.add(s);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.silo);
    cap.position.set(x, 7, z); scene.add(cap);
  }
  const catwalk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 32), mats.pipe);
  catwalk.position.set(-29.4, 5.0, 0); scene.add(catwalk);
  // warehouse at site B: ribbed body, hazard door, glowing windows
  const wh = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 12), mats.contB);
  wh.position.set(29, 3, 0); wh.castShadow = true; wh.receiveShadow = true; scene.add(wh);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.4),
    new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 }));
  door.position.set(24.94, 2.2, 0); door.rotation.y = -Math.PI / 2; scene.add(door);
  for (const z of [-4, 0, 4]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xffc266, emissive: 0xff9a2e, emissiveIntensity: 1.4 }));
    win.position.set(24.94, 4.8, z); win.rotation.y = -Math.PI / 2; scene.add(win);
  }
  // dressing, decoration only (no colliders): barrels, sandbags, salt piles,
  // pallets, pipes and lamp posts that break up the flat yard.
  const barrelAt = (x, z, mat) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), mat);
    b.position.set(x, 0.55, z); b.castShadow = true; scene.add(b);
  };
  barrelAt(-16, -6, mats.barrel); barrelAt(-16, -4.8, mats.barrelTeal); barrelAt(16, 6, mats.barrel);
  barrelAt(16, 4.8, mats.barrelTeal); barrelAt(-6, 17, mats.barrel); barrelAt(6, -17, mats.barrelTeal);
  barrelAt(-27, -8, mats.barrel); barrelAt(27, 8, mats.barrel);
  const sandbag = (x, z, ry) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6), mats.sand);
    s.scale.set(1.6, 0.55, 0.9); s.position.set(x, 0.28, z); s.rotation.y = ry;
    s.castShadow = true; scene.add(s);
  };
  sandbag(-9, -3, 0.4); sandbag(-8.2, -3.4, -0.2); sandbag(9, 3, 1.2); sandbag(8.2, 3.4, 0.9);
  sandbag(-21, 4, 0.1); sandbag(21, -4, 1.5);
  const saltPile = (x, z, r) => {
    const p = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.55, 14), mats.salt);
    p.position.set(x, r * 0.27, z); p.castShadow = true; p.receiveShadow = true; scene.add(p);
  };
  saltPile(-28, 20, 2.2); saltPile(28, -20, 2.2); saltPile(-14, 19, 1.4); saltPile(14, -19, 1.4);
  // lamp posts along the lane edges (kept out of the main sightlines),
  // with warm heads
  const lampAt = (x, z) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8), mats.pipe);
    pole.position.set(x, 2.3, z); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), mats.lamp);
    head.position.set(x, 4.6, z); scene.add(head);
  };
  lampAt(-8, -18); lampAt(8, 18); lampAt(-20, 18); lampAt(20, -18);
  // low pipe runs hugging the perimeter walls
  for (const [x, z, ry] of [[0, -21.2, 0], [0, 21.2, 0]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 60, 10), mats.pipe);
    pipe.rotation.z = Math.PI / 2; pipe.rotation.y = ry;
    pipe.position.set(x, 0.35, z); pipe.castShadow = true; scene.add(pipe);
  }
  // site markers: glowing rings on the ground
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.4, s.r, 48),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xf5a623 : 0x2dd4bf, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.pos[0], 0.05, s.pos[2]); scene.add(ring);
  }
  // sky: gradient dome painted by the texture module + low sun disc
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(15, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
  sun.position.set(-140, 42, -90); sun.lookAt(0, 0, 0); scene.add(sun);
  return mats;
}
