// main.js — bootstrap and the fixed-step loop. The loop runs the sim at
// 60 Hz (accumulator, at most 4 steps a frame) and renders every frame.
// Staged shots (?shot=start|play|plant|end) drive the game into a
// deterministic frame for screenshots, with no pointer lock.
import * as THREE from 'three';
import { state, DT, WEAPONS } from './state.js';
import { newMatch, step, srand, rand } from './sim.js';
import { initRender, render, spawnTracer, spawnBurst, flashMuzzle, canvas } from './render.js';
import { makeInput, bindInput } from './input.js';
import { updateHud, showBuyMenu, hideBuyMenu } from './hud.js';
import { ensureAudio, sfx } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10);
srand(SEED * 7919 + 13);

initRender(document.getElementById('game'));
const input = makeInput();
let locked = false;
const binder = bindInput(input, canvas(), (l) => { locked = l; }, () => openBuy());
const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('play');
let started = false, buyOpen = false;

function openBuy() {
  if (state.phase !== 'buy' && state.phase !== 'menu') return;
  buyOpen = true;
  overlay.hidden = false;
  showBuyMenu(state.money, state.players[0].loadout.owned, (key) => {
    const me = state.players[0];
    if (key === 'grenade') { if (state.money >= 300) { state.money -= 300; me.loadout.grenades += 1; } }
    else { const w = WEAPONS[key]; if (state.money >= w.price) { state.money -= w.price; me.loadout.owned[key] = true; me.loadout.current = key; } }
    sfx.click(); openBuy();
  }, () => { buyOpen = false; hideBuyMenu(); overlay.hidden = true; if (locked || SHOT) startPlay(); });
}

playBtn.onclick = () => {
  ensureAudio();
  if (!started) { started = true; newMatch(); state.phase = 'buy'; openBuy(); return; }
  buyOpen = false; hideBuyMenu(); overlay.hidden = true;
  if (!SHOT) binder.requestLock();
  startPlay();
};
function startPlay() {
  if (state.phase === 'menu') state.phase = 'buy';
  if (state.phase === 'buy' && !buyOpen) { /* the buy timer runs in the sim */ }
}

function applyLook(dt) {
  const me = state.players[0];
  if (!me) return;
  const sens = me.ads ? 0.0011 : 0.0022;
  me.yaw -= input.lookDX * sens;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - input.lookDY * sens));
  input.lookDX = 0; input.lookDY = 0;
}

// --- staged screenshots (deterministic, no pointer lock) ---
// Yaw convention: forward = (-sin yaw, -cos yaw), so the yaw that looks
// from (px,pz) at (tx,tz) is atan2(-(tx-px), -(tz-pz)).
function lookAt(me, tx, tz) { me.yaw = Math.atan2(-(tx - me.pos[0]), -(tz - me.pos[2])); me.pitch = 0.01; }
function stageShot(kind) {
  started = true;
  newMatch();
  const me = state.players[0];
  if (kind === 'start') {
    // buy phase, camera at the AMBER spawn looking east down the top lane
    state.phase = 'buy'; state.roundTimer = 14;
    me.pos = [-29, 0, -10]; lookAt(me, 10, -10);
    overlay.hidden = false; openBuy();
  } else if (kind === 'play') {
    // mid-round firefight on mid lane: three defenders in the open at
    // staggered depth, two allies pushing beside the player, tracer live
    state.phase = 'play'; state.roundTimer = 73;
    me.pos = [-12, 0, -1]; lookAt(me, 12, 0);
    const e1 = state.players[6]; e1.pos = [4, 0, -3]; e1.yaw = Math.PI;
    const e2 = state.players[7]; e2.pos = [9, 0, 2]; e2.yaw = Math.PI;
    const e3 = state.players[8]; e3.pos = [14, 0, -5]; e3.yaw = Math.PI;
    const a1 = state.players[1]; a1.pos = [-5, 0, 5]; a1.yaw = 0;
    const a2 = state.players[2]; a2.pos = [-7, 0, -9]; a2.yaw = 0;
    state.lastShot = { shooter: me, point: [4, 1.4, -3], at: 999 };
    state.lastHit = { shooter: me, victim: e1, head: false, at: 998 };
  } else if (kind === 'plant') {
    // spike planted at Site A; view from the north-west so the spike, the
    // A sign and the defenders pushing in from mid are all in frame
    state.phase = 'play'; state.roundTimer = 41;
    state.bomb = { state: 'planted', carrier: null, site: 'A', pos: [-25, 0, 0], timer: 32 };
    state.feed = [{ text: 'SPIKE PLANTED AT SITE A — 40s', cls: 'amber' },
      { text: 'ROUND 1 — SITE A — SILOS IS THE CALL', cls: '' }];
    // camera south-east of the site looking north-west: spike, A sign and
    // the defenders pushing in are all in frame, no spawn bot in the lens
    me.pos = [-23, 0, -9]; lookAt(me, -24, -1);
    const e1 = state.players[6]; e1.pos = [-20, 0, -5]; e1.yaw = Math.PI * 0.8;
    const e2 = state.players[7]; e2.pos = [-19, 0, -2]; e2.yaw = Math.PI;
    const a1 = state.players[1]; a1.pos = [-18, 0, -12];
  } else if (kind === 'end') {
    // round won at Site A: straight down the mid lane, silos and the
    // glowing ring in frame, an ally walking ahead
    state.phase = 'roundEnd'; state.roundTimer = 4;
    state.points = [1000, 0]; state.roundsWon = [1, 0];
    state.msg = { h: 'AMBER TAKES THE ROUND', p: 'SPIKE DETONATED — SITE A', until: 999 };
    me.pos = [-10, 0, 0]; lookAt(me, -25, 0);
    const a1 = state.players[1]; a1.pos = [-20, 0, 3];
  }
  overlay.hidden = kind !== 'start';
  window.__saltlineReady = true;
}

// --- main loop ---
let last = performance.now(), acc = 0, lastHitAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  binder.poll();
  // Staged shots freeze the sim: bots stay exactly where they were placed.
  if (started && !buyOpen && !SHOT) {
    applyLook(dt);
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 4) { step(input); acc -= DT; n++; }
    if (n === 4) acc = 0;
    // one-shot input flags are consumed each frame
    input.reload = false; input.switchKey = null; input.grenade = false; input.jump = false;
    // sound and fx hooks from sim results
    const ls = state.lastShot;
    if (ls && ls.at > lastHitAt) {
      lastHitAt = ls.at;
      if (ls.shooter.id === 0) { flashMuzzle(); sfx.shot(ls.shooter.loadout.current); spawnTracer([ls.shooter.pos[0], ls.shooter.pos[1] + 1.5, ls.shooter.pos[2]], ls.point); }
      else if (Math.hypot(ls.shooter.pos[0] - state.players[0].pos[0], ls.shooter.pos[2] - state.players[0].pos[2]) < 30) sfx.enemyShot();
    }
    const lh = state.lastHit;
    if (lh && lh.at > (frame._hitAt || 0)) {
      frame._hitAt = lh.at;
      if (lh.shooter.id === 0) {
        spawnBurst(lh.point, 8);
        const hm = document.getElementById('hitmarker');
        hm.classList.add('on'); if (!lh.victim.alive) hm.classList.add('kill');
        setTimeout(() => hm.classList.remove('on', 'kill'), 120);
        sfx.hit(); if (!lh.victim.alive) sfx.kill();
      }
    }
    if (state.phase === 'play' && state.bomb.state === 'planted' && Math.floor(state.bomb.timer) !== frame._beep) {
      frame._beep = Math.floor(state.bomb.timer); if (state.bomb.timer < 10) sfx.beep();
    }
  }
  // staged play shot: keep the tracer live every frame so the screenshot shows it
  // (life 1.0 s — longer than any slow SwiftShader frame gap, so the beam
  // never expires between the spawn and the render of the same frame)
  if (SHOT === 'play' && state.lastShot) {
    spawnTracer([state.players[0].pos[0], state.players[0].pos[1] + 1.5, state.players[0].pos[2]], state.lastShot.point, 1.0);
  }
  render(dt, now / 1000);
  updateHud();
}

if (SHOT) stageShot(SHOT);
// debug/test hook: lets an automated play-test drive the sim and read state.
window.__saltline = { state, step, input, newMatch };
requestAnimationFrame(frame);
