// hud.js — DOM HUD, buy menu, kill feed, tactical map. Reads sim state only.
import { state, WEAPONS, WIN_POINTS } from './state.js';
import { SITES } from './map.js';

const $ = (id) => document.getElementById(id);
let lastFeedLen = 0;

export function showBuyMenu(money, owned, onBuy, onClose) {
  const buy = $('buy'); buy.hidden = false; buy.innerHTML = '';
  $('overlay-copy').textContent = `Buy phase — $${money}. Spend it: a better gun wins duels, a grenade clears a site.`;
  for (const key of ['smg', 'sniper']) {
    const w = WEAPONS[key];
    const div = document.createElement('div');
    div.className = 'buyitem' + (owned[key] ? ' sel' : '');
    div.innerHTML = `<b>${w.name}</b><span>${w.damage} dmg · ${w.mag} rounds · ${w.rate * 1000 | 0}ms</span><span class="price">${owned[key] ? 'OWNED' : '$' + w.price}</span>`;
    div.onclick = () => { if (!owned[key] && money >= w.price) onBuy(key); };
    buy.appendChild(div);
  }
  const g = document.createElement('div');
  g.className = 'buyitem';
  g.innerHTML = `<b>FRAG GRENADE</b><span>110 dmg in 7 m</span><span class="price">$300</span>`;
  g.onclick = () => { if (money >= 300) onBuy('grenade'); };
  buy.appendChild(g);
  $('play').textContent = state.phase === 'buy' ? 'START ROUND' : 'RESUME';
  $('play').onclick = onClose;
}

export function hideBuyMenu() { $('buy').hidden = true; }

export function updateHud() {
  const st = state, me = st.players[0];
  if (!me) return;
  $('score-a').textContent = st.points[0];
  $('score-b').textContent = st.points[1];
  $('round').textContent = 'R' + st.round;
  const t = Math.max(0, Math.ceil(st.roundTimer));
  $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('low', st.roundTimer < 15 && st.phase === 'play');
  $('hp').textContent = Math.max(0, Math.ceil(me.hp));
  $('hpfill').style.width = Math.max(0, me.hp) + '%';
  const w = WEAPONS[me.loadout.current];
  $('wname').textContent = w.name + (me.loadout.grenades ? ` · ${me.loadout.grenades} FRAG` : '');
  $('mag').textContent = me.loadout.reloadUntil > st.time ? '--' : me.loadout.mag[me.loadout.current];
  // low ammo reads red so the player reloads before the mag runs dry
  $('mag').style.color = me.loadout.mag[me.loadout.current] <= 6 ? 'var(--danger)' : '';
  $('reserve').textContent = '/ ' + me.loadout.reserve[me.loadout.current];
  $('objective').textContent =
    st.phase === 'roundEnd' || st.phase === 'matchEnd' ? (st.msg ? st.msg.h + ' — ' + st.msg.p : '') :
    st.bomb.state === 'planted' ? `SPIKE PLANTED AT SITE ${st.bomb.site} — ${Math.ceil(st.bomb.timer)}s — DEFEND IT` :
    st.bomb.state === 'carried' && st.bomb.carrier === 0 ? 'YOU CARRY THE SPIKE — PLANT AT SITE A OR B (HOLD E)' :
    st.bomb.state === 'dropped' ? 'SPIKE DROPPED — PICK IT UP' :
    `PLANT THE SPIKE AT SITE A OR B — FIRST TO ${WIN_POINTS} PTS`;
  // spike progress bar (plant / defuse) above the crosshair
  const pr = $('prompt');
  if (st.phase === 'play' && me.alive && me.plantProgress > 0) {
    pr.hidden = false;
    pr.textContent = `PLANTING… ${Math.round(me.plantProgress / 3 * 100)}%`;
  } else if (st.phase === 'play' && me.alive && me.defuseProgress > 0) {
    pr.hidden = false;
    pr.textContent = `DEFUSING… ${Math.round(me.defuseProgress / 5 * 100)}%`;
  } else pr.hidden = true;
  // team status
  const ts = $('teamstatus');
  ts.innerHTML = st.players.map(p =>
    `<div class="${p.team === 0 ? 'amber' : 'teal'}${p.alive ? '' : ' dead'}">${p.alive ? '●' : '○'} ${p.name} ${p.kills}/${p.deaths}</div>`).join('');
  // kill feed
  const feed = $('feed');
  if (st.feed.length !== lastFeedLen) {
    lastFeedLen = st.feed.length;
    feed.innerHTML = st.feed.slice(0, 5).map(f => `<div class="${f.cls}">${f.text}</div>`).join('');
  }
  // round message
  const rm = $('roundmsg');
  if (st.msg && st.time < st.msg.until) { rm.hidden = false; $('roundmsg-h').textContent = st.msg.h; $('roundmsg-p').textContent = st.msg.p; }
  else rm.hidden = true;
  drawMinimap();
}

function drawMinimap() {
  const cv = $('minimap'), cx = cv.getContext('2d');
  const W = 180, H = 180, sx = W / 68, sz = H / 48;
  const X = (x) => (x + 34) * sx, Z = (z) => (z + 24) * sz;
  cx.fillStyle = '#14101c'; cx.fillRect(0, 0, W, H);
  cx.strokeStyle = '#ffffff22'; cx.strokeRect(2, 2, W - 4, H - 4);
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    cx.fillStyle = key === 'A' ? '#f5a623' : '#2dd4bf';
    cx.beginPath(); cx.arc(X(s.pos[0]), Z(s.pos[2]), 7, 0, 7); cx.fill();
    cx.fillStyle = '#14101c'; cx.font = 'bold 9px monospace'; cx.textAlign = 'center'; cx.fillText(key, X(s.pos[0]), Z(s.pos[2]) + 3);
  }
  if (state.bomb.state === 'planted') {
    cx.fillStyle = '#ff5470'; cx.beginPath(); cx.arc(X(state.bomb.pos[0]), Z(state.bomb.pos[2]), 4, 0, 7); cx.fill();
  }
  for (const p of state.players) {
    if (!p.alive) continue;
    cx.fillStyle = p.team === 0 ? '#f5a623' : '#2dd4bf';
    if (p.id === 0) { cx.fillStyle = '#ffffff'; }
    cx.beginPath(); cx.arc(X(p.pos[0]), Z(p.pos[2]), p.id === 0 ? 4 : 3, 0, 7); cx.fill();
  }
  // player view cone
  const me = state.players[0];
  if (me) {
    cx.strokeStyle = '#ffffff88';
    cx.beginPath(); cx.moveTo(X(me.pos[0]), Z(me.pos[2]));
    cx.lineTo(X(me.pos[0]) - Math.sin(me.yaw - 0.3) * 18, Z(me.pos[2]) - Math.cos(me.yaw - 0.3) * 18);
    cx.moveTo(X(me.pos[0]), Z(me.pos[2]));
    cx.lineTo(X(me.pos[0]) - Math.sin(me.yaw + 0.3) * 18, Z(me.pos[2]) - Math.cos(me.yaw + 0.3) * 18);
    cx.stroke();
  }
}
