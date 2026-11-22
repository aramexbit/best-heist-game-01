// Keyboard and pointer input for Midnight Vault. Held keys give a steering vector;
// one-shot presses (confirm, pause, jammer, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted twice.
// Holding the mouse button steers the thief toward the pointer instead.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_JAMMER = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const JAMMER = new Set(['KeyQ']);
const MUTE = new Set(['KeyM']);

export function createInput(target, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let sneak = false;
  let actions = 0;
  let pointer = null;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (JAMMER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_JAMMER;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (SNEAK.has(event.code)) sneak = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything,
  // and drop any press queued while the player was away.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    sneak = false;
    pointer = null;
    actions = 0;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    pointer = { x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointermove', (event) => {
    if (pointer) pointer = { x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointerup', () => {
    pointer = null;
  });

  return {
    /** Steering vector: -1..1 each way, from keys, or toward the held pointer. */
    vector(playerX, playerY) {
      const kx = (right ? 1 : 0) - (left ? 1 : 0);
      const ky = (down ? 1 : 0) - (up ? 1 : 0);
      if (kx !== 0 || ky !== 0) return { x: kx, y: ky, sneak };
      if (pointer && toField) {
        const goal = toField(pointer.x, pointer.y);
        const dx = goal.x - playerX;
        const dy = goal.y - playerY;
        const len = Math.hypot(dx, dy);
        if (len > 12) return { x: dx / len, y: dy / len, sneak };
      }
      return { x: 0, y: 0, sneak };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
