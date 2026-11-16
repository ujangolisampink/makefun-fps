// state.js — every piece of mutable match state lives in this one object.
// The simulation owns it; rendering and the HUD only read it. Nothing else
// keeps its own copy of match data, so a saved state is the whole game.
export const DT = 1 / 60; // fixed simulation step, seconds
export const ROUND_TIME = 100; // seconds in a live round
export const BUY_TIME = 15; // seconds of buy phase before the round starts
export const WIN_POINTS = 10000; // first team to this many points wins the match
export const ROUND_WIN_POINTS = 1000;
export const KILL_POINTS = 100;
export const PLANT_POINTS = 300;
export const DEFUSE_POINTS = 300;

export const TEAM = { AMBER: 0, TEAL: 1 };
export const TEAM_NAME = ['AMBER', 'TEAL'];
export const TEAM_COLOR = [0xf5a623, 0x2dd4bf]; // amber attacks, teal defends

// Weapons. damage is a close-range body hit; headshots double it. spread is
// in radians; bloom and recoil grow while firing and settle when it stops.
export const WEAPONS = {
  rifle: { name: 'VK-7 RIFLE', slot: 1, price: 0, auto: true, rate: 0.11, mag: 30, reserve: 90,
           damage: 34, headMul: 2, spread: 0.011, adsSpread: 0.003, moveSpread: 0.02,
           recoil: 0.011, range: 120, reload: 2.1, zoom: 1.6 },
  smg:   { name: 'K-9 SMG', slot: 2, price: 900, auto: true, rate: 0.075, mag: 32, reserve: 96,
           damage: 24, headMul: 2, spread: 0.02, adsSpread: 0.007, moveSpread: 0.026,
           recoil: 0.007, range: 60, reload: 1.7, zoom: 1.3 },
  sniper:{ name: 'LONGSHOT 50', slot: 3, price: 2400, auto: false, rate: 1.1, mag: 5, reserve: 15,
           damage: 95, headMul: 2, spread: 0.004, adsSpread: 0.0005, moveSpread: 0.05,
           recoil: 0.05, range: 200, reload: 3.2, zoom: 3.2 },
  pistol:{ name: 'P-9 SIDEARM', slot: 0, price: 0, auto: false, rate: 0.16, mag: 12, reserve: 36,
           damage: 26, headMul: 2, spread: 0.016, adsSpread: 0.005, moveSpread: 0.022,
           recoil: 0.009, range: 70, reload: 1.4, zoom: 1.25 },
};

export function freshState() {
  return {
    phase: 'menu', // menu | buy | play | roundEnd | matchEnd
    round: 1,
    roundTimer: BUY_TIME,
    money: 800,
    points: [0, 0],
    roundsWon: [0, 0],
    players: [], // {id, name, team, bot, alive, hp, pos, yaw, pitch, loadout, ...}
    bomb: { state: 'carried', carrier: 0, site: null, pos: null, timer: 0 },
    feed: [], // kill-feed lines, newest first
    msg: null, // big round message {h, p, until}
    time: 0,
    winner: null,
  };
}
export const state = freshState();
