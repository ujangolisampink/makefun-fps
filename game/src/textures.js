// textures.js — every texture in the game is painted procedurally on a
// canvas at load time. No image files, no network: the whole look is code.
// Each generator returns a CanvasTexture ready for a MeshStandardMaterial.
// A tiny seeded RNG keeps the speckle identical on every load.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(cx, w, h, n, colors, rMin, rMax, rnd) {
  for (let i = 0; i < n; i++) {
    cx.fillStyle = colors[(rnd() * colors.length) | 0];
    cx.globalAlpha = 0.08 + rnd() * 0.22;
    const r = rMin + rnd() * (rMax - rMin);
    cx.beginPath(); cx.arc(rnd() * w, rnd() * h, r, 0, 7); cx.fill();
  }
  cx.globalAlpha = 1;
}

// Salt-crusted concrete yard floor: warm sand with pale salt patches,
// dark tyre arcs and faint expansion-joint grid lines.
export function groundTexture() {
  const [c, cx] = canvas(512, 512);
  cx.fillStyle = '#8a6f4d'; cx.fillRect(0, 0, 512, 512);
  const rnd = rng(101);
  speckle(cx, 512, 512, 2600, ['#a8895f', '#77593a', '#9c7c50', '#c9b183'], 1, 4, rnd);
  // pale salt drifts
  for (let i = 0; i < 26; i++) {
    cx.fillStyle = '#e8ddc0'; cx.globalAlpha = 0.05 + rnd() * 0.1;
    cx.beginPath();
    cx.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 10 + rnd() * 34, rnd() * 3, 0, 7);
    cx.fill();
  }
  cx.globalAlpha = 1;
  // expansion joints
  cx.strokeStyle = '#5d4830'; cx.lineWidth = 2; cx.globalAlpha = 0.55;
  for (let i = 0; i <= 4; i++) {
    cx.beginPath(); cx.moveTo(i * 128, 0); cx.lineTo(i * 128, 512); cx.stroke();
    cx.beginPath(); cx.moveTo(0, i * 128); cx.lineTo(512, i * 128); cx.stroke();
  }
  cx.globalAlpha = 1;
  return finish(c, 8, 6);
}

// Weathered wooden crate: planks, grain streaks, iron corner brackets.
export function crateTexture() {
  const [c, cx] = canvas(256, 256);
  cx.fillStyle = '#7a5c33'; cx.fillRect(0, 0, 256, 256);
  const rnd = rng(202);
  for (let y = 0; y < 4; y++) {
    cx.fillStyle = y % 2 ? '#835f35' : '#6f5229';
    cx.fillRect(0, y * 64, 256, 64);
    cx.fillStyle = '#4d3a1c'; cx.fillRect(0, y * 64, 256, 2);
    // grain
    cx.strokeStyle = '#543d1e'; cx.globalAlpha = 0.5; cx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const gy = y * 64 + 6 + rnd() * 52;
      cx.beginPath(); cx.moveTo(0, gy);
      cx.bezierCurveTo(80, gy + rnd() * 6 - 3, 170, gy + rnd() * 6 - 3, 256, gy);
      cx.stroke();
    }
    cx.globalAlpha = 1;
  }
  // stencil mark: a symmetric diamond, so no face ever shows mirrored text
  cx.strokeStyle = '#e8ddc0'; cx.globalAlpha = 0.75; cx.lineWidth = 4;
  cx.beginPath(); cx.moveTo(128, 104); cx.lineTo(164, 140); cx.lineTo(128, 176); cx.lineTo(92, 140); cx.closePath(); cx.stroke();
  cx.fillStyle = '#e8ddc0'; cx.beginPath(); cx.arc(128, 140, 7, 0, 7); cx.fill();
  cx.globalAlpha = 1;
  speckle(cx, 256, 256, 300, ['#3a2a14', '#96703d'], 1, 2, rnd);
  return finish(c);
}

// Corrugated shipping container: vertical ribs, rust streaks, painted band.
export function containerTexture(base, band, seed) {
  const [c, cx] = canvas(256, 256);
  cx.fillStyle = base; cx.fillRect(0, 0, 256, 256);
  const rnd = rng(seed);
  for (let x = 0; x < 256; x += 16) {
    cx.fillStyle = 'rgba(0,0,0,0.28)'; cx.fillRect(x, 0, 5, 256);
    cx.fillStyle = 'rgba(255,255,255,0.10)'; cx.fillRect(x + 8, 0, 3, 256);
  }
  // rust runs from the top edge
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 256, len = 20 + rnd() * 90;
    const g = cx.createLinearGradient(x, 0, x, len);
    g.addColorStop(0, 'rgba(90,40,16,0.55)'); g.addColorStop(1, 'rgba(90,40,16,0)');
    cx.fillStyle = g; cx.fillRect(x, 0, 3 + rnd() * 5, len);
  }
  // painted band + stencil number
  cx.fillStyle = band; cx.globalAlpha = 0.85; cx.fillRect(0, 96, 256, 40); cx.globalAlpha = 1;
  cx.fillStyle = '#efe8d8'; cx.globalAlpha = 0.8;
  cx.font = 'bold 26px monospace'; cx.textAlign = 'center';
  cx.fillText('SL-' + (100 + ((seed * 7) % 800)), 128, 125);
  cx.globalAlpha = 1;
  speckle(cx, 256, 256, 240, ['#00000055', '#ffffff22'], 1, 2, rnd);
  return finish(c);
}

// Plastered perimeter wall with grime at the base and a hazard stripe.
export function wallTexture() {
  const [c, cx] = canvas(256, 256);
  cx.fillStyle = '#5b4a3a'; cx.fillRect(0, 0, 256, 256);
  const rnd = rng(303);
  speckle(cx, 256, 256, 1400, ['#6b5844', '#4a3a2a', '#7d6750'], 1, 3, rnd);
  // grime rising from the base
  const g = cx.createLinearGradient(0, 150, 0, 256);
  g.addColorStop(0, 'rgba(20,12,6,0)'); g.addColorStop(1, 'rgba(20,12,6,0.6)');
  cx.fillStyle = g; cx.fillRect(0, 150, 256, 106);
  // hazard stripe near the top
  cx.save(); cx.beginPath(); cx.rect(0, 20, 256, 26); cx.clip();
  for (let x = -40; x < 300; x += 32) {
    cx.fillStyle = (x / 32) % 2 === 0 ? '#f5a623' : '#14101c';
    cx.beginPath(); cx.moveTo(x, 46); cx.lineTo(x + 16, 20); cx.lineTo(x + 32, 20); cx.lineTo(x + 16, 46); cx.fill();
  }
  cx.restore();
  return finish(c, 4, 1);
}

// Brushed silo metal: vertical sheen bands, rivet rows, dull patches.
export function siloTexture() {
  const [c, cx] = canvas(256, 256);
  cx.fillStyle = '#9aa3ab'; cx.fillRect(0, 0, 256, 256);
  const rnd = rng(404);
  for (let x = 0; x < 256; x += 32) {
    cx.fillStyle = 'rgba(255,255,255,0.10)'; cx.fillRect(x, 0, 6, 256);
    cx.fillStyle = 'rgba(0,0,0,0.16)'; cx.fillRect(x + 16, 0, 4, 256);
  }
  cx.fillStyle = '#5c646b';
  for (let y = 24; y < 256; y += 48) for (let x = 8; x < 256; x += 32) {
    cx.beginPath(); cx.arc(x, y, 2.4, 0, 7); cx.fill();
  }
  speckle(cx, 256, 256, 500, ['#7d868e', '#b7bfc6', '#6a4a30'], 1, 3, rnd);
  return finish(c, 3, 2);
}

// Dark asphalt lane strip with worn centre line dashes.
export function laneTexture() {
  const [c, cx] = canvas(256, 256);
  cx.fillStyle = '#6b563d'; cx.fillRect(0, 0, 256, 256);
  const rnd = rng(505);
  speckle(cx, 256, 256, 1200, ['#7a6547', '#574431', '#8a7350'], 1, 3, rnd);
  cx.fillStyle = '#e8ddc0'; cx.globalAlpha = 0.5;
  for (let y = 0; y < 256; y += 64) cx.fillRect(124, y, 8, 34);
  cx.globalAlpha = 1;
  return finish(c, 8, 1);
}

// Dusk sky: deep indigo at the top melting into amber at the horizon, with
// faint stars overhead and a soft glow band where the sun sits.
export function skyTexture() {
  const [c, cx] = canvas(1024, 512);
  const g = cx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#160f2e'); g.addColorStop(0.42, '#2a1e3f');
  g.addColorStop(0.62, '#5c3350'); g.addColorStop(0.78, '#c96f2e');
  g.addColorStop(1, '#ffb347');
  cx.fillStyle = g; cx.fillRect(0, 0, 1024, 512);
  const rnd = rng(606);
  for (let i = 0; i < 180; i++) {
    cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.15 + rnd() * 0.55;
    cx.fillRect(rnd() * 1024, rnd() * 190, 1.4, 1.4);
  }
  cx.globalAlpha = 1;
  // glow around the low sun (sun disc itself is a mesh at the same spot)
  const glow = cx.createRadialGradient(300, 400, 8, 300, 400, 190);
  glow.addColorStop(0, 'rgba(255,200,110,0.85)'); glow.addColorStop(1, 'rgba(255,200,110,0)');
  cx.fillStyle = glow; cx.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Hazard chevrons for site markers and the warehouse door.
export function hazardTexture() {
  const [c, cx] = canvas(128, 128);
  cx.fillStyle = '#14101c'; cx.fillRect(0, 0, 128, 128);
  cx.fillStyle = '#f5a623';
  for (let x = -32; x < 160; x += 32) {
    cx.beginPath(); cx.moveTo(x, 128); cx.lineTo(x + 16, 0); cx.lineTo(x + 32, 0); cx.lineTo(x + 16, 128); cx.fill();
  }
  return finish(c);
}

// Big site letter on a dark plate: A (amber) / B (teal), readable at range.
export function siteLetterTexture(letter, color) {
  const [c, cx] = canvas(256, 256);
  cx.fillStyle = '#17121f'; cx.fillRect(0, 0, 256, 256);
  cx.strokeStyle = color; cx.lineWidth = 10; cx.strokeRect(10, 10, 236, 236);
  cx.fillStyle = color;
  cx.font = 'bold 170px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(letter, 128, 138);
  cx.font = 'bold 22px monospace';
  cx.fillText(letter === 'A' ? 'SILOS' : 'WAREHOUSE', 128, 222);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
