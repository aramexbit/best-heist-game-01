// Keyboard and pointer input for Sunken Vault. Held keys give a steering vector;
// one-shot presses (confirm, pause, ink burst, harpoon, mute, click-fire) are
// queued as bit flags and taken once by the loop, so a press between two frames
// is never lost or counted twice.
//
// Clicking is how you shoot: a click on the game area fires the harpoon AT the
// clicked spot, and the on-screen HARPOON button (bottom right, beside the
// minimap) fires toward the cursor on a mouse, or the way the diver faces on
// touch. Clicking never steers the diver any more — swimming is WASD/arrows
// only. The pointer's last mouse position is kept as the harpoon's aim point
// for Space and for the button.

import { HARPOON_BUTTON } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INK = 4;
export const ACTION_MUTE = 8;
export const ACTION_HARPOON = 16;
/** A click on the game area (not the button): fire at the clicked spot. When
 * a click and a Space press land in the same frame, the loop reads the click
 * first — the clicked spot wins over the cursor. */
export const ACTION_CLICK_FIRE = 32;

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

/** True when the field point (x, y) is on the HARPOON button. Pure, so the
 * headless probe can test the tap target without a DOM. */
export function harpoonButtonHit(x, y) {
  return (
    x >= HARPOON_BUTTON.x &&
    x < HARPOON_BUTTON.x + HARPOON_BUTTON.w &&
    y >= HARPOON_BUTTON.y &&
    y < HARPOON_BUTTON.y + HARPOON_BUTTON.h
  );
}

export function createInput(target, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let sneak = false;
  let actions = 0;
  let aimClient = null;
  let clickField = null;
  /** The button only fires while the game is actually playing — on menus a
   * tap anywhere is a confirm, even on the button's spot. The loop sets this
   * every frame from the current screen. */
  let buttonLive = false;

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
    aimClient = null;
    clickField = null;
    actions = 0;
  });
  target.addEventListener('pointerdown', (event) => {
    // The HARPOON button: fire toward the cursor (mouse hover) or the way the
    // diver faces (touch, no hover). Never steers, never confirms.
    if (buttonLive && toField) {
      const field = toField(event.clientX, event.clientY);
      if (harpoonButtonHit(field.x, field.y)) {
        actions |= ACTION_HARPOON;
        return;
      }
    }
    // Anywhere else: confirm on menus — and, while playing, fire the harpoon
    // at exactly the spot that was clicked.
    actions |= ACTION_CONFIRM;
    if (toField) {
      clickField = toField(event.clientX, event.clientY);
      actions |= ACTION_CLICK_FIRE;
    }
    if (event.pointerType === 'mouse') aimClient = { x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointermove', (event) => {
    // The harpoon aims at the mouse cursor; touch has no hover, so a touch
    // drag never moves the aim — the button then fires the way the diver
    // faces. Moving onto the button itself does not move the aim either, so
    // a player who hovered a shark, then reached for the button, still shoots
    // at the shark instead of at the bottom-right corner.
    if (event.pointerType !== 'mouse') return;
    if (buttonLive && toField) {
      const field = toField(event.clientX, event.clientY);
      if (harpoonButtonHit(field.x, field.y)) return;
    }
    aimClient = { x: event.clientX, y: event.clientY };
  });

  return {
    /** Steering vector: -1..1 each way, from the keys only. Clicking never
     * steers any more — swimming is WASD/arrows, shooting is the click. */
    vector() {
      const kx = (right ? 1 : 0) - (left ? 1 : 0);
      const ky = (down ? 1 : 0) - (up ? 1 : 0);
      return { x: kx, y: ky, sneak };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The cursor's last position in client coordinates, or null before the
     * pointer has ever moved — the harpoon's aim point for Space and the
     * button. */
    aim() {
      return aimClient;
    },
    /** The last clicked spot in field coordinates, or null before any click. */
    clickPoint() {
      return clickField;
    },
    /** Whether the HARPOON button fires right now (only while playing). */
    setHarpoonButtonLive(live) {
      buttonLive = Boolean(live);
    },
  };
}
