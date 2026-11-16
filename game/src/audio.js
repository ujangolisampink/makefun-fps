// audio.js — every sound is synthesised with WebAudio (no audio files, no
// network). Short noise bursts for gunfire, filtered sweeps for the rest.
let ctx = null;
export function ensureAudio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function noiseBurst(dur, freq, gain, type = 'lowpass') {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
}
function tone(freq0, freq1, dur, gain, type = 'sine') {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq0, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
}
export const sfx = {
  shot: (key) => { if (key === 'sniper') noiseBurst(0.22, 900, 0.5); else if (key === 'smg') noiseBurst(0.07, 1800, 0.28); else noiseBurst(0.12, 1200, 0.4); },
  enemyShot: () => noiseBurst(0.1, 700, 0.12),
  hit: () => tone(1400, 900, 0.06, 0.15, 'square'),
  kill: () => { tone(900, 500, 0.12, 0.2, 'square'); setTimeout(() => tone(1200, 800, 0.1, 0.15, 'square'), 70); },
  reload: () => { tone(300, 500, 0.12, 0.12); setTimeout(() => tone(500, 300, 0.12, 0.12), 150); },
  plant: () => tone(880, 880, 0.1, 0.2, 'square'),
  beep: () => tone(1200, 1200, 0.07, 0.15, 'square'),
  roundWin: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, f, 0.18, 0.18), i * 120)); },
  roundLose: () => { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f, 0.2, 0.18), i * 130)); },
  click: () => tone(700, 700, 0.04, 0.1, 'square'),
};
