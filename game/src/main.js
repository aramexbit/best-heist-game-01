// Midnight Vault — the loop, the screens and the shot mode. A fixed-step accumulator
// drives the world at 60Hz no matter the display's rate; the screens are plain objects
// ({type, world}) and the renderer draws whichever one is current. With ?shot=<id> in
// the URL the page renders one staged screenshot scene and signals readiness instead
// of starting the loop, so headless captures are repeatable.

import { BEST_KEY, STEP } from './config.js';
import {
  createWorld,
  EVENT_CAUGHT,
  EVENT_CLEAR,
  EVENT_JAMMER,
  EVENT_LOCKDOWN,
  EVENT_LOOT,
  EVENT_OVER,
  EVENT_SPOTTED,
  EVENT_WIN,
} from './world.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_JAMMER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { audio } from './audio.js';
import {
  createRenderer,
  SCREEN_CLEAR,
  SCREEN_OVER,
  SCREEN_PAUSE,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const world = createWorld(createRandom((Math.random() * 0xffffffff) >>> 0));
world.best = readBest();

let screen = { type: SCREEN_TITLE, world };
let accumulator = 0;
let last = performance.now();
let paints = 0;

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score) {
  if (score <= world.best) return;
  world.best = score;
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Best score is a nicety; a blocked store must not break the game.
  }
}

/** Convert a client (mouse) position into playfield coordinates. */
function toField(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / 1280, rect.height / 720);
  const offsetX = (rect.width - 1280 * scale) / 2;
  const offsetY = (rect.height - 720 * scale) / 2;
  return { x: (clientX - rect.left - offsetX) / scale, y: (clientY - rect.top - offsetY) / scale };
}

const input = createInput(canvas, toField);

function startRun() {
  world.reset();
  screen = { type: SCREEN_PLAY, world };
}

function handleEvents(events) {
  if (events & EVENT_LOOT) audio.pickup();
  if (events & EVENT_SPOTTED) audio.spotted();
  if (events & EVENT_CAUGHT) audio.caught();
  if (events & EVENT_LOCKDOWN) audio.lockdown();
  if (events & EVENT_JAMMER) audio.jammer();
  if (events & EVENT_CLEAR) {
    audio.clear();
    screen = { type: SCREEN_CLEAR, world };
  }
  if (events & EVENT_WIN) {
    audio.win();
    saveBest(world.state.score);
    screen = { type: SCREEN_WIN, world };
  }
  if (events & EVENT_OVER) {
    audio.caught();
    saveBest(world.state.score);
    screen = { type: SCREEN_OVER, world };
  }
}

function stepGame() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) audio.toggleMute();

  if (screen.type === SCREEN_TITLE) {
    world.step(STEP, { x: 0, y: 0, sneak: false, jammer: false }, true);
    if (actions & ACTION_CONFIRM) {
      audio.click();
      startRun();
    }
    return;
  }
  if (screen.type === SCREEN_PAUSE) {
    if (actions & (ACTION_CONFIRM | ACTION_PAUSE)) {
      audio.click();
      screen = { type: SCREEN_PLAY, world };
    }
    return;
  }
  if (screen.type === SCREEN_CLEAR) {
    if (actions & ACTION_CONFIRM) {
      audio.click();
      world.nextLevel();
      screen = { type: SCREEN_PLAY, world };
    }
    return;
  }
  if (screen.type === SCREEN_WIN || screen.type === SCREEN_OVER) {
    if (actions & ACTION_CONFIRM) {
      audio.click();
      startRun();
    }
    return;
  }

  // Playing.
  if (actions & ACTION_PAUSE) {
    screen = { type: SCREEN_PAUSE, world };
    return;
  }
  const vector = input.vector(world.state.player.x, world.state.player.y);
  const events = world.step(STEP, {
    x: vector.x,
    y: vector.y,
    sneak: vector.sneak,
    jammer: Boolean(actions & ACTION_JAMMER),
  }, false);
  handleEvents(events);
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  accumulator += dt;
  while (accumulator >= STEP) {
    stepGame();
    accumulator -= STEP;
  }
  renderer.render(screen, world);
  requestAnimationFrame(frame);
}

function resize() {
  renderer.resize();
}

window.addEventListener('resize', resize);
resize();

// Shot mode: render one staged scene, paint twice, then signal readiness.
const shotId = new URLSearchParams(location.search).get('shot');
if (shotId) {
  const shot = stageShot(shotId);
  renderer.render(shot, shot.world);
  requestAnimationFrame(() => {
    renderer.render(shot, shot.world);
    paints += 1;
    if (paints >= 1) window.__shotReady = true;
  });
} else {
  requestAnimationFrame(frame);
}
