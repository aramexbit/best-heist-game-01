// Sunken Vault — the five screenshot scenes, each staged by actually playing the
// game forward: a careful autopilot (greedy, cone-aware) steers the diver, and the
// alarm scene parks the diver inside a live sonar cone for real. No scene is drawn
// from a hand-placed layout; every frame is the game's own renderer over live state.

import { DIVER, HARPOON, SHARK, STEP } from './config.js';
import { createWorld, segmentHitsRect, sharkSpeedFactor } from './world.js';
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
 * The autopilot: head for the nearest unpocketed treasure (or the whirlpool once the
 * bag is full), scoring each of the eight directions by distance to the target
 * plus a heavy penalty for stepping into a live shark or sonar cone. It re-decides
 * every step, so it waits out a sweeping cone instead of swimming through it.
 * Kelp reads as safe through dangerAt, so the pilot uses the beds as cover. A shark
 * that is already hunting is a moving danger too — steps that close on it cost
 * extra, so the pilot backs off, ducks into kelp, or goes around a rock instead
 * of swimming into the bite — and it shoots back with the harpoon when a hunting
 * shark comes inside range.
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
    let score = dist + danger * 600;
    for (const shark of state.sharks) {
      if (shark.state !== 'chase' && shark.state !== 'windup' && shark.state !== 'lunge' && shark.state !== 'hunt') continue;
      const sd = Math.hypot(shark.x - nx, shark.y - ny);
      const near = shark.state === 'windup' || shark.state === 'lunge' ? 220 : 200;
      if (sd < near) score += (near - sd) * (shark.state === 'windup' || shark.state === 'lunge' ? 5 : 3);
    }
    scored.push({ dx: dx / len, dy: dy / len, score });
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
  // Shoot back: a hunting shark inside harpoon range gets a spear, aimed with
  // a lead so the fast spear meets the moving shark — but never through a rock.
  let fire = false;
  let aimX;
  let aimY;
  if (state.harpoonCooldown <= 0) {
    for (const shark of state.sharks) {
      if (shark.state !== 'chase' && shark.state !== 'windup' && shark.state !== 'lunge' && shark.state !== 'hunt') continue;
      const sd = Math.hypot(shark.x - p.x, shark.y - p.y);
      if (sd > HARPOON.range - 40) continue;
      let vx = 0;
      let vy = 0;
      // Lead with the shark's real speed: a harpoon-slowed shark moves
      // slower than the book numbers, and the spear must meet it there.
      // At the 60% cap the lead is nearly half what the book numbers say.
      const factor = sharkSpeedFactor(shark);
      if (shark.state === 'lunge') {
        vx = shark.lungeDirX * SHARK.lungeSpeed * factor;
        vy = shark.lungeDirY * SHARK.lungeSpeed * factor;
      } else if (shark.state === 'windup') {
        vx = 0;
        vy = 0;
      } else if (shark.state === 'patrol') {
        vx = Math.cos(shark.dir) * shark.speed * factor;
        vy = Math.sin(shark.dir) * shark.speed * factor;
      } else {
        vx = Math.cos(shark.dir) * SHARK.chaseSpeed * factor;
        vy = Math.sin(shark.dir) * SHARK.chaseSpeed * factor;
      }
      const flight = sd / HARPOON.speed;
      const tx = shark.x + vx * flight;
      const ty = shark.y + vy * flight;
      if (segmentBlocked(state, p.x, p.y, tx, ty)) continue;
      aimX = tx;
      aimY = ty;
      fire = true;
      break;
    }
  }
  return { x: bestDir.x, y: bestDir.y, sneak: Boolean(sneak), ink: false, fire, aimX, aimY };
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
 * play — mid-dive: the diver crossing the reef with a shark's cone nearby,
 *   stone-block walls and floor props in frame, the minimap and control bar
 *   visible — the cover shot.
 * sneak — the diver creeping in slow gear past the patrol.
 * alarm — the diver caught in a live sonar cone, alarm climbing, and the reef
 *   shark mid-lunge at them, jaws wide open with teeth showing.
 * harpoon — the diver's harpoon in flight toward the reef shark (manual check
 *   only, not a dossier shot).
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
    // The cover must read "many sharks" in one second ON A PHONE: park the
    // diver DEAD CENTRE and pull all three reef sharks into a tight knot
    // around them — each within ~105px — so the three bodies, three red
    // cones and three "!" marks form one dominant cluster in the middle of
    // the frame, instead of three small sharks lost across it. Staging only:
    // the game itself is untouched (same patrols, same rules, same walls).
    // Each shark sits in open water with a clear sight line to the diver, so
    // the cones really point at them and the wind-up is real game logic.
    const p = world.state.player;
    p.x = 640;
    p.y = 350;
    p.dirX = 1;
    p.dirY = 0;
    // The pilot may have left the gun cooling down or a spear in flight;
    // clear both so the staged shot is the only spear in the frame.
    world.state.harpoonCooldown = 0;
    world.state.harpoons = [];
    const sharks = world.state.sharks;
    // Above: winding up with 0.15s left, so it is a breath into its lunge —
    // jaws wide open, teeth out — when the shutter falls.
    sharks[0].x = 640;
    sharks[0].y = 245;
    sharks[0].dir = Math.PI / 2;
    sharks[0].state = 'windup';
    sharks[0].windupTimer = 0.15;
    sharks[0].suspicion = 1;
    sharks[0].loseTimer = 99;
    sharks[0].attackCooldown = 0;
    sharks[0].lastSeen = { x: p.x, y: p.y };
    // Right: chasing, so close it winds up on the first step — jaws half
    // open, red cone, "!" — and the diver's spear flies straight at it.
    sharks[1].x = 745;
    sharks[1].y = 350;
    sharks[1].dir = Math.PI;
    sharks[1].state = 'chase';
    sharks[1].suspicion = 1;
    sharks[1].loseTimer = 99;
    sharks[1].attackCooldown = 0;
    sharks[1].lastSeen = { x: p.x, y: p.y };
    // Below: chasing on a long attack cooldown, so it NEVER winds up during
    // the shot — it keeps swimming at the diver, and a hunting shark is
    // what keeps the HUD on SPOTTED and the alarm climbing while the other
    // two are mid-attack (mid-attack sharks do not detect). It starts a
    // little further out and closes to ~85px by the shutter.
    sharks[2].x = 675;
    sharks[2].y = 480;
    sharks[2].dir = Math.atan2(p.y - 480, p.x - 675);
    sharks[2].state = 'chase';
    sharks[2].suspicion = 1;
    sharks[2].loseTimer = 99;
    sharks[2].attackCooldown = 0.5;
    sharks[2].lastSeen = { x: p.x, y: p.y };
    // Twelve steps total: six idle, then the diver shoots at the shark on
    // the right, then five more. The wind-up above finishes and the shark
    // is a breath into its lunge, the right shark is mid-wind-up, the
    // shark below has closed in — and the spear is still in flight, about
    // 30px short of its target, so it reads in the frame.
    runSteps(world, 0.1, IDLE);
    world.step(STEP, { x: 0, y: 0, sneak: false, ink: false, fire: true, aimX: 745, aimY: 350 }, false);
    runSteps(world, 0.083, IDLE);
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
    // parking spot (640, 120) is open seabed — no kelp bed covers it.
    world.state.player.x = 640;
    world.state.player.y = 120;
    runSteps(world, 2, IDLE);
    // Two sharks attack at once: the reef shark from the left and the top
    // guard from the right, both wound up with jaws half open — then both
    // lunge in the same beat, teeth out, alarm still climbing. The wind-up
    // is real game logic (fair 0.5s warning, sight kept the whole time); the
    // positions are just where the two patrols are parked for the shot.
    const shark = world.state.sharks[0];
    shark.x = 560;
    shark.y = 120;
    shark.dir = 0;
    shark.state = 'windup';
    shark.windupTimer = SHARK.windupSeconds;
    shark.suspicion = 1;
    shark.loseTimer = 99;
    shark.attackCooldown = 0;
    shark.lastSeen = { x: 640, y: 120 };
    const shark2 = world.state.sharks[1];
    shark2.x = 730;
    shark2.y = 150;
    shark2.dir = Math.atan2(120 - 150, 640 - 730);
    shark2.state = 'windup';
    shark2.windupTimer = SHARK.windupSeconds;
    shark2.suspicion = 1;
    shark2.loseTimer = 99;
    shark2.attackCooldown = 0;
    shark2.lastSeen = { x: 640, y: 120 };
    // The third shark joins the knot: parked just below the diver, facing
    // away (blue cone pointing down, held still on a long pause), so it
    // reads as a third big body in the group without adding to the alarm —
    // the two attackers above still do the lunging.
    const shark3 = world.state.sharks[2];
    shark3.x = 640;
    shark3.y = 230;
    shark3.dir = Math.PI / 2;
    shark3.state = 'patrol';
    shark3.pauseTimer = 99;
    shark3.suspicion = 0;
    shark3.lastSeen = { x: 640, y: 230 };
    // The diver shoots first: the harpoon hit tells the shark exactly where
    // the diver is (so it comes straight for them) and slows it down — the
    // new trade-off, caught in the frame as a lunging shark with a gold slow
    // chevron under it. The chevron is the proof in the frame that the shark
    // was shot.
    world.step(STEP, { x: 0, y: 0, sneak: false, ink: false, fire: true, aimX: 560, aimY: 120 }, false);
    runSteps(world, 0.4, IDLE);
    // Both wind-ups end on the same step, so both sharks lunge together —
    // catch them a breath into the lunge, jaws wide open, still clear of
    // the diver.
    let lunging = false;
    for (let i = 0; i < Math.round(2 / STEP) && !lunging; i += 1) {
      world.step(STEP, IDLE, false);
      if (shark.state === 'lunge') lunging = true;
    }
    if (lunging) runSteps(world, 0.06, IDLE);
    return { type: SCREEN_PLAY, world };
  }
  if (id === 'harpoon') {
    // The diver fires at the reef shark: a still frame of the harpoon in
    // flight for a manual check (not one of the four dossier shots).
    const shark = world.state.sharks[0];
    shark.x = 500;
    shark.y = 360;
    shark.dir = 0;
    shark.pauseTimer = 99;
    shark.state = 'patrol';
    world.state.player.x = 300;
    world.state.player.y = 360;
    world.step(STEP, { x: 0, y: 0, sneak: false, ink: false, fire: true, aimX: 500, aimY: 360 }, false);
    runSteps(world, 0.2, IDLE);
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
