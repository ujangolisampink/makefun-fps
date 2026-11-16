// render.js — three.js presentation only. It reads sim state and draws it;
// it never changes the match. One scene, one mesh group per bot, pooled
// tracers and particles (no allocations in the frame loop).
import * as THREE from 'three';
import { state, TEAM_COLOR } from './state.js';
import { buildMapScene } from './map.js';

let renderer, scene, camera, gunMesh, muzzle, muzzleFlash, tracers = [], particles = [];
let botMeshes = new Map();
let spikeMesh, spikeLamp;
let dustMotes = [];
let clock = 0;
const _v = new THREE.Vector3();

function flashTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const cx = c.getContext('2d');
  const g = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,240,190,1)');
  g.addColorStop(0.35, 'rgba(255,180,80,0.9)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function initRender(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a1e3f, 40, 170);
  camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.1, 400);
  buildMapScene(scene);
  // dusk lighting: low amber sun + cool sky fill + warm site lamps
  const sun = new THREE.DirectionalLight(0xffb347, 2.4);
  sun.position.set(-40, 55, -30); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8a7fd6, 0x3a2c1e, 1.1));
  const siteA = new THREE.PointLight(0xf5a623, 26, 26, 1.6); siteA.position.set(-25, 4.5, 0); scene.add(siteA);
  const siteB = new THREE.PointLight(0x2dd4bf, 26, 26, 1.6); siteB.position.set(23, 4.5, 0); scene.add(siteB);
  // warm mid-map fill so the centre of the yard doesn't read black at dusk
  const mid = new THREE.PointLight(0xffc266, 10, 30, 1.8); mid.position.set(0, 5, 0); scene.add(mid);
  for (const [x, z] of [[-8, -18], [8, 18]]) {
    const lamp = new THREE.PointLight(0xffc266, 9, 15, 1.8);
    lamp.position.set(x, 4.6, z); scene.add(lamp);
  }
  // viewmodel rifle: dark receiver, amber accent, scope and magazine,
  // parented to the camera so it rides with the player's view
  gunMesh = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x3c3844, roughness: 0.4, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf5a623, roughness: 0.4, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), gunMat); gunMesh.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), gunMat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.42); gunMesh.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), accent);
  sight.position.set(0, 0.1, -0.1); gunMesh.add(sight);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), gunMat);
  mag.position.set(0, -0.12, -0.05); mag.rotation.x = 0.25; gunMesh.add(mag);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.16), gunMat);
  stock.position.set(0, -0.01, 0.36); gunMesh.add(stock);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), accent);
  grip.position.set(0, -0.11, 0.14); grip.rotation.x = 0.4; gunMesh.add(grip);
  gunMesh.scale.setScalar(0.55);
  gunMesh.position.set(0.24, -0.22, -0.5);
  muzzle = new THREE.PointLight(0xffc266, 0, 9); muzzle.position.set(0, 0, -0.6); gunMesh.add(muzzle);
  muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, opacity: 0, depthWrite: false }));
  muzzleFlash.scale.set(0.5, 0.5, 1); muzzleFlash.position.set(0, 0.02, -0.62); gunMesh.add(muzzleFlash);
  // dim fill light so the viewmodel is readable, not a black silhouette
  const gunLight = new THREE.PointLight(0xffe0b3, 3, 3); gunLight.position.set(0.3, 0.3, 0.3); camera.add(gunLight);
  camera.add(gunMesh);
  scene.add(camera);
  // tracer pool: a bright core inside a soft additive halo — a 1px line is
  // invisible at 1280px, a bare fat cylinder looks fake
  for (let i = 0; i < 12; i++) {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0 }));
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.visible = false; halo.visible = false;
    scene.add(core); scene.add(halo);
    tracers.push({ core, halo, until: 0 });
  }
  for (let i = 0; i < 80; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc266, transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m); particles.push({ mesh: m, vel: [0, 0, 0], until: 0 });
  }
  // spike device: dark case, antenna, blinking red lamp — shown when the
  // spike is planted or dropped, so the objective is visible in 3D
  spikeMesh = new THREE.Group();
  const spikeBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.5, metalness: 0.4 }));
  spikeBody.position.y = 0.11; spikeBody.castShadow = true; spikeMesh.add(spikeBody);
  const spikeAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.4, metalness: 0.7 }));
  spikeAntenna.position.set(0.18, 0.42, 0); spikeMesh.add(spikeAntenna);
  spikeLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  spikeLamp.position.set(-0.15, 0.26, 0); spikeMesh.add(spikeLamp);
  const spikeLight = new THREE.PointLight(0xff2a1a, 0, 6); spikeLight.position.set(0, 0.4, 0); spikeMesh.add(spikeLight);
  // light pillar so a planted spike reads from across the map
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(0, 1.5, 0); spikeMesh.add(beam);
  spikeMesh.userData.beam = beam;
  spikeMesh.userData.light = spikeLight;
  spikeMesh.visible = false;
  scene.add(spikeMesh);
  // dust motes: slow-drifting warm specks in the dusk air, pooled sprites
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture(), color: 0xffd9a0, transparent: true, opacity: 0.12, depthWrite: false }));
    m.scale.set(0.14, 0.14, 1);
    m.position.set((Math.random() - 0.5) * 60, 0.5 + Math.random() * 7, (Math.random() - 0.5) * 40);
    m.userData = { drift: 0.1 + Math.random() * 0.25, phase: Math.random() * 6.28 };
    scene.add(m);
    dustMotes.push(m);
  }
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

// A bot is a kit-built soldier, not a capsule: armoured torso with a vest
// plate, shoulder pads, helmet with a glowing visor, swinging legs and
// arms, a backpack, and a rifle held across the chest. Team colour is the
// suit; the visor glows amber for AMBER, cyan for TEAL.
function botMesh(p) {
  let m = botMeshes.get(p.id);
  if (m) return m;
  const g = new THREE.Group();
  const col = TEAM_COLOR[p.team];
  const suit = new THREE.MeshStandardMaterial({ color: col, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: 0.6, metalness: 0.2 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.9 });
  const glow = new THREE.MeshBasicMaterial({ color: p.team === 0 ? 0xffd27a : 0x9ff5e8 });
  // legs, pivoted at the hip so they swing while walking
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.52, 0);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.52, 0);
  for (const leg of [legL, legR]) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.17), dark);
    thigh.position.y = -0.26; thigh.castShadow = true; leg.add(thigh);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.26), gear);
    boot.position.set(0, -0.5, -0.04); leg.add(boot);
  }
  g.add(legL); g.add(legR);
  // torso + vest plate + shoulder pads + backpack
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), suit);
  torso.position.y = 0.86; torso.castShadow = true; g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.08), gear);
  vest.position.set(0, 0.88, -0.19); g.add(vest);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.36), dark);
  belt.position.y = 0.58; g.add(belt);
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), suit);
    pad.scale.set(1, 0.7, 1); pad.position.set(sx * 0.33, 1.14, 0); pad.castShadow = true; g.add(pad);
  }
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.16), dark);
  pack.position.set(0, 0.92, 0.24); g.add(pack);
  // arms, pivoted at the shoulder; the right one carries the rifle
  const armL = new THREE.Group(); armL.position.set(-0.34, 1.1, 0);
  const armR = new THREE.Group(); armR.position.set(0.34, 1.1, 0);
  for (const arm of [armL, armR]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.13), suit);
    a.position.y = -0.24; a.castShadow = true; arm.add(a);
  }
  armL.rotation.x = -0.5; armR.rotation.x = -1.1; // hands forward on the rifle
  g.add(armL); g.add(armR);
  const rifle = new THREE.Group();
  const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), dark);
  rBody.castShadow = true; rifle.add(rBody);
  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8), dark);
  rBarrel.rotation.x = Math.PI / 2; rBarrel.position.set(0, 0.02, -0.4); rifle.add(rBarrel);
  const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), gear);
  rMag.position.set(0, -0.1, -0.02); rifle.add(rMag);
  rifle.position.set(0.1, 0.95, -0.32);
  g.add(rifle);
  // helmet + glowing visor + chin strap
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10), suit);
  helm.scale.set(1, 0.85, 1.05); helm.position.y = 1.5; helm.castShadow = true; g.add(helm);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), dark);
  face.position.set(0, 1.47, -0.04); g.add(face);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.05), glow);
  visor.position.set(0, 1.52, -0.2); g.add(visor);
  // name tag above the head
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
  const cx = cv.getContext('2d'); cx.fillStyle = p.team === 0 ? '#f5a623' : '#2dd4bf';
  cx.font = 'bold 20px monospace'; cx.textAlign = 'center'; cx.fillText(p.name, 64, 22);
  const tex = new THREE.CanvasTexture(cv);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  tag.scale.set(1.4, 0.35, 1); tag.position.y = 2.05; g.add(tag);
  // muzzle flash sprite at the rifle tip, lit when this bot fires
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, opacity: 0, depthWrite: false }));
  flash.scale.set(0.5, 0.5, 1); flash.position.set(0.1, 0.97, -0.75); g.add(flash);
  scene.add(g);
  botMeshes.set(p.id, g);
  g.userData = { legL, legR, armL, armR, flash };
  return g;
}

function orientBeam(mesh, from, to, radius) {
  let dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  mesh.visible = true;
  mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(_v.set(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  return len;
}

export function spawnTracer(from, to, life = 0.07) {
  const t = tracers.find(t => clock >= t.until) || tracers[0];
  // start the visible beam ~1.5 m out so its near end isn't in the camera's face
  let dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const full = Math.hypot(dx, dy, dz) || 1;
  const s0 = [from[0] + dx / full * 1.5, from[1] + dy / full * 1.5, from[2] + dz / full * 1.5];
  orientBeam(t.core, s0, to); t.core.material.opacity = 0.95;
  orientBeam(t.halo, s0, to); t.halo.material.opacity = 0.28;
  t.until = clock + life;
  t.life = life;
}

export function spawnBurst(at, n = 10) {
  let made = 0;
  for (const p of particles) {
    if (clock < p.until) continue;
    p.mesh.visible = true; p.mesh.position.set(at[0], at[1], at[2]);
    p.vel = [(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4];
    p.mesh.material.opacity = 1; p.until = clock + 0.4;
    if (++made >= n) break;
  }
}

export function render(dt, now) {
  clock = now;
  const me = state.players[0];
  if (!me) return;
  // camera = the player's eyes; recoil pitch decays in the sim
  camera.position.set(me.pos[0], me.pos[1] + 1.62 - (me.crouch ? 0.35 : 0), me.pos[2]);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = me.yaw;
  camera.rotation.x = me.pitch + (me.loadout ? me.loadout.recoilPitch : 0);
  const targetFov = me.ads ? 78 / (me.loadout ? 1.6 : 1) : 78;
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * 0.25; camera.updateProjectionMatrix(); }
  // gun bob + ADS position + reload dip + recoil kick
  const bob = me.moving ? Math.sin(now * 9) * 0.012 : 0;
  gunMesh.position.x += ((me.ads ? 0 : 0.24) - gunMesh.position.x) * 0.3;
  const reloading = me.loadout && me.loadout.reloadUntil > now;
  gunMesh.rotation.x += ((reloading ? 0.55 : 0) - gunMesh.rotation.x) * 0.3;
  const ls = state.lastShot;
  const kick = (ls && ls.shooter === me && now - ls.at < 0.09) ? 0.05 : 0;
  gunMesh.position.y = -0.22 + bob - (reloading ? 0.06 : 0);
  gunMesh.position.z = -0.5 + kick;
  gunMesh.visible = me.alive;
  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 60);
  muzzleFlash.material.opacity = Math.max(0, muzzleFlash.material.opacity - dt * 9);
  // bots, with a walk cycle while they move
  const seen = new Set();
  for (const p of state.players) {
    if (p.id === 0 || !p.alive) continue;
    seen.add(p.id);
    const m = botMesh(p);
    m.visible = true;
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    m.rotation.y = p.yaw + Math.PI;
    const swing = p.moving ? Math.sin(now * 8 + p.id * 1.7) * 0.55 : 0;
    m.userData.legL.rotation.x = swing;
    m.userData.legR.rotation.x = -swing;
    m.userData.armL.rotation.x = -0.5 - swing * 0.4;
    m.userData.armR.rotation.x = -1.1 + swing * 0.15;
    // hop the whole figure a touch on each step
    m.position.y = p.pos[1] + (p.moving ? Math.abs(Math.sin(now * 8 + p.id * 1.7)) * 0.05 : 0);
    // bot muzzle flash: lit briefly after the bot's own shot
    const ls = state.lastShot;
    if (ls && ls.shooter.id === p.id && now - ls.at < 0.07) m.userData.flash.material.opacity = 0.95;
    else m.userData.flash.material.opacity = Math.max(0, m.userData.flash.material.opacity - dt * 9);
  }
  for (const [id, m] of botMeshes) if (!seen.has(id)) m.visible = false;
  // spike: a small device with a blinking red lamp while planted or dropped
  const bomb = state.bomb;
  if ((bomb.state === 'planted' || bomb.state === 'dropped') && bomb.pos) {
    spikeMesh.visible = true;
    spikeMesh.position.set(bomb.pos[0], 0, bomb.pos[2]);
    const blink = (Math.sin(now * 6) > 0) ? 1 : 0.15;
    spikeLamp.material.color.setRGB(1 * blink, 0.16 * blink, 0.1 * blink);
    spikeMesh.userData.light.intensity = bomb.state === 'planted' ? 3 * blink : 1.5 * blink;
    spikeMesh.userData.beam.material.opacity = bomb.state === 'planted' ? 0.3 * blink : 0.12;
  } else spikeMesh.visible = false;
  // dust motes drift slowly and wrap around the yard
  for (const m of dustMotes) {
    m.position.x += Math.sin(now * 0.2 + m.userData.phase) * m.userData.drift * dt;
    m.position.y += Math.cos(now * 0.13 + m.userData.phase) * m.userData.drift * 0.4 * dt;
    if (m.position.x > 32) m.position.x = -32;
    if (m.position.x < -32) m.position.x = 32;
  }
  // tracers and particles fade
  for (const t of tracers) {
    if (clock >= t.until) { t.core.visible = false; t.halo.visible = false; continue; }
    const k = (t.until - clock) / (t.life || 0.07);
    t.core.material.opacity = 0.95 * k; t.halo.material.opacity = 0.28 * k;
  }
  for (const p of particles) {
    if (clock >= p.until) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vel[0] * dt; p.mesh.position.y += p.vel[1] * dt; p.mesh.position.z += p.vel[2] * dt;
    p.mesh.material.opacity = Math.max(0, (p.until - clock) / 0.4);
  }
  renderer.render(scene, camera);
}

export function flashMuzzle() { muzzle.intensity = 14; muzzleFlash.material.opacity = 1; }
export function canvas() { return renderer.domElement; }
