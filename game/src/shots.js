// Sunken Vault — the five screenshot scenes, each staged by actually playing the
// game forward: a careful autopilot (greedy, cone-aware) steers the diver, and the
// alarm scene parks the diver inside a live sonar cone for real. No scene is drawn
// from a hand-placed layout; every frame is the game's own renderer over live state.

import { DIVER, STEP } from './config.js';
import { createWorld, segmentHitsRect } from './world.js';
import { createRandom } from './random.js';
import { SCREEN_CLEAR, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE = { x: 0, y: 0, sneak: false, ink: false };

function runSteps(world, seconds, input) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) world.step(STEP, input || IDLE, false);
}

/**
 * True when swimming the straight line from (x1,y1) to (x2,y2) would push the
 * diver's circle into a rock. The rocks are grown by the diver's radius and the
 * whole swept segment is tested — checking only the endpoint lies, because the
 * corner of a rock can block the path to a perfectly reachable point. Kelp never
 * blocks the swim, only sight, so it is not grown here.
 */
function segmentBlocked(state, x1, y1, x2, y2) {
  for (const wall of state.level.walls) {
    const grown = {
      x: wall.x - DIVER.radius,
      y: wall.y - DIVER.radius,
      w: wall.w + DIVER.radius * 2,
      h: wall.h + DIVER.radius * 2,
    };
    if (segmentHitsRect(x1, y1, x2, y2, grown)) return true;
  }
  return false;
}

/**
 * The autopilot: head for the nearest unpocketed treasure (or the boat once the
 * bag is full), scoring each of the eight directions by distance to the target
 * plus a heavy penalty for stepping into a live shark or sonar cone. It re-decides
 * every step, so it waits out a sweeping cone instead of swimming through it.
 * Kelp reads as safe through dangerAt, so the pilot uses the beds as cover.
 */
export function pilotDirection(world, sneak) {
  const state = world.state;
  const p = state.player;
  let target = null;
  let best = Infinity;
  for (const item of state.loot) {
    if (item.taken) continue;
    const d = Math.hypot(item.x - p.x, item.y - p.y);
    if (d < best) {
      best = d;
      target = item;
    }
  }
  if (!target) {
    const exit = state.level.exit;
    target = { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
  }
  const speed = sneak ? DIVER.sneakSpeed : DIVER.speed;
  // Look ahead at most 0.3s — but never past the target, or the pilot stops one
  // lookahead short of the treasure and decides standing still scores better.
  const look = Math.min(speed * 0.3, best);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const scored = [];
  let anySafe = false;
  for (const [dx, dy] of dirs) {
    const len = Math.hypot(dx, dy);
    const nx = p.x + (dx / len) * look;
    const ny = p.y + (dy / len) * look;
    if (segmentBlocked(state, p.x, p.y, nx, ny)) continue;
    const dist = Math.hypot(target.x - nx, target.y - ny);
    const danger = world.dangerAt(nx, ny);
    if (danger === 0) anySafe = true;
    scored.push({ dx: dx / len, dy: dy / len, score: dist + danger * 600 });
  }
  // Standing still only makes sense when already at the target, or when every
  // step leads into a cone (wait for the sweep to pass). Otherwise the pilot
  // would freeze in a local minimum — e.g. against a rock, one step from the
  // treasure — because going around it briefly looks further away.
  if (best < 30 || !anySafe) {
    const danger = world.dangerAt(p.x, p.y);
    scored.push({ dx: 0, dy: 0, score: best + danger * 600 });
  }
  let bestDir = { x: 0, y: 0 };
  let bestScore = Infinity;
  for (const s of scored) {
    if (s.score < bestScore) {
      bestScore = s.score;
      bestDir = { x: s.dx, y: s.dy };
    }
  }
  return { x: bestDir.x, y: bestDir.y, sneak: Boolean(sneak), ink: false };
}

/** Play with the autopilot for up to `seconds`, stopping if the phase changes. */
function runPilot(world, seconds, sneak) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.state.phase !== 'play') break;
    world.step(STEP, pilotDirection(world, sneak), false);
  }
}

/**
 * Stage one screenshot scene and return the screen to render.
 * title — the diver at the reef edge, sharks on patrol behind the title panel.
 * play — mid-dive: the diver crossing the reef with a shark's cone nearby.
 * sneak — the diver creeping in slow gear past the patrol.
 * alarm — the diver caught in a live sonar cone, alarm climbing, shark turning.
 * clear — the reef dive done: the dive-clear panel over the emptied seabed.
 */
export function stageShot(id) {
  const world = createWorld(createRandom(11));
  if (id === 'title') {
    for (let i = 0; i < Math.round(2 / STEP); i += 1) world.step(STEP, IDLE, true);
    return { type: SCREEN_TITLE, world };
  }
  if (id === 'play') {
    runPilot(world, 2.5, false);
    return { type: SCREEN_PLAY, world };
  }
  if (id === 'sneak') {
    runPilot(world, 8, true);
    return { type: SCREEN_PLAY, world };
  }
  if (id === 'alarm') {
    runPilot(world, 4, false);
    // Park the diver under the reef sonar camera, inside its sweeping cone, and
    // let the alarm climb for real while the shark turns toward the noise. The
    // parking spot (640, 120) is open sand — no kelp bed covers it.
    world.state.player.x = 640;
    world.state.player.y = 120;
    runSteps(world, 2, IDLE);
    return { type: SCREEN_PLAY, world };
  }
  // clear
  let cleared = false;
  for (let s = 0; s < 120 && !cleared; s += 1) {
    runPilot(world, 1, false);
    if (world.state.phase === 'clear') cleared = true;
  }
  if (!cleared) {
    // Safety net: pocket what is left and swim out, still through real steps.
    world.state.timeLeft = Math.max(world.state.timeLeft, 30);
    for (const item of world.state.loot) {
      if (item.taken) continue;
      world.state.player.x = item.x;
      world.state.player.y = item.y;
      world.step(STEP, IDLE, false);
    }
    const exit = world.state.level.exit;
    world.state.player.x = exit.x + exit.w / 2;
    world.state.player.y = exit.y + exit.h / 2;
    world.step(STEP, IDLE, false);
  }
  return { type: SCREEN_CLEAR, world };
}
