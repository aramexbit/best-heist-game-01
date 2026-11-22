// Keyboard and pointer input for Sunken Vault. Held keys give a steering vector;
// one-shot presses (confirm, pause, ink burst, harpoon, mute) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost
// or counted twice. Holding the mouse button steers the diver toward the pointer
// instead. The pointer's last position is kept as the harpoon's aim point.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INK = 4;
export const ACTION_MUTE = 8;
export const ACTION_HARPOON = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INK = new Set(['KeyQ']);
const MUTE = new Set(['KeyM']);
const HARPOON = new Set(['Space']);

export function createInput(target, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let sneak = false;
  let actions = 0;
  let pointer = null;
  let aimClient = null;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      // Space is both confirm (on menus) and the harpoon trigger (in play);
      // the loop only reads the harpoon flag while playing.
      if (!event.repeat && HARPOON.has(event.code)) actions |= ACTION_HARPOON;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (INK.has(event.code)) {
      if (!event.repeat) actions |= ACTION_INK;
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
    aimClient = null;
    actions = 0;
  });
  target.addEventListener('pointerdown', (event) => {
    actions |= ACTION_CONFIRM;
    pointer = { x: event.clientX, y: event.clientY };
    aimClient = { x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointermove', (event) => {
    // The harpoon aims at the cursor even when the button is not held.
    aimClient = { x: event.clientX, y: event.clientY };
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
    /** The cursor's last position in client coordinates, or null before the
     * pointer has ever moved — the harpoon's aim point. */
    aim() {
      return aimClient;
    },
  };
}
