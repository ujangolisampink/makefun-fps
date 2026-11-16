// input.js — keyboard + mouse + pointer lock. One job: turn device events
// into the per-frame input object the sim consumes. No game logic here.
export function makeInput() {
  return {
    fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false,
    ads: false, fire: false, reload: false, switchKey: null, grenade: false, use: false,
    lookDX: 0, lookDY: 0,
  };
}

export function bindInput(input, canvas, onLockChange, onBuyKey) {
  const keys = new Set();
  let locked = false;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyR') input.reload = true;
    if (e.code === 'Digit1') input.switchKey = 'pistol';
    if (e.code === 'Digit2') input.switchKey = 'rifle';
    if (e.code === 'Digit3') input.switchKey = 'smg';
    if (e.code === 'Digit4') input.switchKey = 'sniper';
    if (e.code === 'KeyG') input.grenade = true;
    if (e.code === 'KeyB') onBuyKey();
    if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    input.lookDX += e.movementX; input.lookDY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.ads = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.ads = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  return {
    poll() {
      input.fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      input.strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
      input.crouch = keys.has('ControlLeft') || keys.has('ControlRight');
      input.use = keys.has('KeyE');
      input.jump = keys.has('Space') && input.jump; // consumed by the sim each step
    },
    requestLock() { canvas.requestPointerLock(); },
    get locked() { return locked; },
  };
}
