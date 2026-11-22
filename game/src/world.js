// Midnight Vault — the game's rules and state, with no drawing and no browser in
// it: the thief, the patrolling guards and their vision cones, the sweeping cameras,
// the loot, the alarm meter, the getaway, the score. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. Nothing here allocates after createWorld returns.

import {
  ALARM,
  CAMERA,
  FIELD,
  GUARD,
  JAMMER,
  LIVES,
  LOOT,
  PLAYER,
  TIME_BONUS_PER_SECOND,
} from './config.js';
import { LEVELS } from './levels.js';

export const EVENT_LOOT = 1;
export const EVENT_SPOTTED = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_LOCKDOWN = 8;
export const EVENT_CLEAR = 16;
export const EVENT_WIN = 32;
export const EVENT_OVER = 64;
export const EVENT_JAMMER = 128;

/** Smallest angle between two headings, in radians. */
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** True when the segment (x1,y1)-(x2,y2) crosses the rectangle. Exported so the
 * autopilot can test a swept path instead of only its endpoint. */
export function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    let t1 = (rect.x - x1) / dx;
    let t2 = (rect.x + rect.w - x1) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    let t1 = (rect.y - y1) / dy;
    let t2 = (rect.y + rect.h - y1) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** True when a circle of radius r at (x,y) overlaps the rectangle. */
function circleHitsRect(x, y, r, rect) {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < r * r;
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: LEVELS[0],
    player: { x: 0, y: 0, dirX: 1, dirY: 0, sneaking: false, invulnerable: 0 },
    guards: [],
    cameras: [],
    loot: [],
    alarm: 0,
    score: 0,
    lives: LIVES,
    timeLeft: 0,
    phase: 'play',
    jammerCharges: JAMMER.charges,
    lockdowns: 0,
    lootTaken: 0,
    lootValue: 0,
    elapsed: 0,
    clearBonus: 0,
    message: '',
    messageTimer: 0,
  };

  function loadLevel(index) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.level = level;
    state.player.x = level.entry.x;
    state.player.y = level.entry.y;
    state.player.dirX = 1;
    state.player.dirY = 0;
    state.player.sneaking = false;
    state.player.invulnerable = 0;
    state.guards = level.guards.map((g) => ({
      x: g.waypoints[0].x,
      y: g.waypoints[0].y,
      waypoints: g.waypoints,
      wpIndex: 1 % g.waypoints.length,
      speed: g.speed,
      dir: 0,
      state: 'patrol',
      suspicion: 0,
      pauseTimer: 0,
      loseTimer: 0,
      huntTimer: 0,
      stuckTimer: 0,
      lastSeen: { x: g.waypoints[0].x, y: g.waypoints[0].y },
    }));
    state.cameras = level.cameras.map((c, i) => ({
      x: c.x,
      y: c.y,
      baseAngle: c.baseAngle,
      arc: c.arc,
      period: c.period,
      phase: i * 1.3,
      range: c.range,
      angle: c.baseAngle,
      disabled: 0,
      spotted: false,
    }));
    state.loot = level.loot.map((l) => ({
      x: l.x,
      y: l.y,
      kind: l.kind,
      value: LOOT[l.kind].value,
      taken: false,
      bob: random() * Math.PI * 2,
    }));
    state.alarm = 0;
    state.timeLeft = level.timeLimit;
    state.phase = 'play';
    state.jammerCharges = JAMMER.charges;
    state.lootTaken = 0;
    state.lootValue = 0;
    state.clearBonus = 0;
    state.message = '';
    state.messageTimer = 0;
  }

  function reset() {
    state.score = 0;
    state.lives = LIVES;
    state.lockdowns = 0;
    state.elapsed = 0;
    loadLevel(0);
  }

  function nextLevel() {
    if (state.levelIndex + 1 >= LEVELS.length) return false;
    loadLevel(state.levelIndex + 1);
    return true;
  }

  /** True when the segment from (x1,y1) to (x2,y2) is blocked by any wall. */
  function blockedSight(x1, y1, x2, y2) {
    const walls = state.level.walls;
    for (let i = 0; i < walls.length; i += 1) {
      if (segmentHitsRect(x1, y1, x2, y2, walls[i])) return true;
    }
    return false;
  }

  /** How dangerous a point is: 1 when a live guard or camera cone with clear sight covers it. */
  function dangerAt(x, y) {
    for (const guard of state.guards) {
      const dx = x - guard.x;
      const dy = y - guard.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= GUARD.visionRange && angleDiff(Math.atan2(dy, dx), guard.dir) <= GUARD.visionHalfAngle) {
        if (!blockedSight(guard.x, guard.y, x, y)) return 1;
      }
    }
    for (const camera of state.cameras) {
      if (camera.disabled > 0) continue;
      const dx = x - camera.x;
      const dy = y - camera.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= camera.range && angleDiff(Math.atan2(dy, dx), camera.angle) <= CAMERA.halfAngle) {
        if (!blockedSight(camera.x, camera.y, x, y)) return 1;
      }
    }
    return 0;
  }

  function moveCircle(entity, dx, dy, radius) {
    const walls = state.level.walls;
    let nx = entity.x + dx;
    let hit = false;
    for (let i = 0; i < walls.length; i += 1) {
      if (circleHitsRect(nx, entity.y, radius, walls[i])) {
        hit = true;
        break;
      }
    }
    if (!hit) entity.x = nx;
    let ny = entity.y + dy;
    hit = false;
    for (let i = 0; i < walls.length; i += 1) {
      if (circleHitsRect(entity.x, ny, radius, walls[i])) {
        hit = true;
        break;
      }
    }
    if (!hit) entity.y = ny;
    entity.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, entity.x));
    entity.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, entity.y));
  }

  function guardSeesPlayer(guard) {
    const p = state.player;
    const dx = p.x - guard.x;
    const dy = p.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > GUARD.visionRange) return 0;
    if (angleDiff(Math.atan2(dy, dx), guard.dir) > GUARD.visionHalfAngle) return 0;
    if (blockedSight(guard.x, guard.y, p.x, p.y)) return 0;
    return dist;
  }

  function cameraSeesPlayer(camera) {
    if (camera.disabled > 0) return false;
    const p = state.player;
    const dx = p.x - camera.x;
    const dy = p.y - camera.y;
    if (Math.hypot(dx, dy) > camera.range) return false;
    if (angleDiff(Math.atan2(dy, dx), camera.angle) > CAMERA.halfAngle) return false;
    return !blockedSight(camera.x, camera.y, p.x, p.y);
  }

  function respawnAfterCaught() {
    const level = state.level;
    state.player.x = level.entry.x;
    state.player.y = level.entry.y;
    state.player.invulnerable = 2;
    for (const guard of state.guards) {
      guard.x = guard.waypoints[0].x;
      guard.y = guard.waypoints[0].y;
      guard.wpIndex = 1 % guard.waypoints.length;
      guard.state = 'patrol';
      guard.suspicion = 0;
      guard.pauseTimer = 0;
      guard.loseTimer = 0;
      guard.huntTimer = 0;
      guard.stuckTimer = 0;
    }
  }

  /**
   * One fixed step. `input` is {x, y, sneak, jammer}: a steering vector (-1..1 each
   * way), whether the thief sneaks, and a one-shot jammer press. With `demo` set the
   * guards patrol and the cameras sweep but nothing detects, scores or ends — the
   * title screen's living backdrop.
   */
  function step(dt, input, demo) {
    let events = 0;
    state.elapsed += dt;

    // A hint (like "grab loot first") fades a few seconds after it appears.
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }

    // Cameras always sweep, even on the title screen.
    for (const camera of state.cameras) {
      camera.angle = camera.baseAngle + camera.arc * Math.sin((state.elapsed * Math.PI * 2) / camera.period + camera.phase);
      if (camera.disabled > 0) camera.disabled = Math.max(0, camera.disabled - dt);
      camera.spotted = false;
    }

    // Guards always walk their patrols.
    for (const guard of state.guards) {
      if (guard.state === 'patrol') {
        if (guard.pauseTimer > 0) {
          guard.pauseTimer -= dt;
        } else {
          const target = guard.waypoints[guard.wpIndex];
          const dx = target.x - guard.x;
          const dy = target.y - guard.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 4) {
            guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
            guard.pauseTimer = GUARD.pauseAtWaypoint;
          } else {
            const beforeX = guard.x;
            const beforeY = guard.y;
            const vx = (dx / dist) * guard.speed * dt;
            const vy = (dy / dist) * guard.speed * dt;
            guard.dir = Math.atan2(dy, dx);
            moveCircle(guard, vx, vy, GUARD.radius);
            // A patrol blocked by a wall for 1.5s skips to the next waypoint
            // instead of standing against the wall forever.
            if (Math.hypot(guard.x - beforeX, guard.y - beforeY) < 0.01) {
              guard.stuckTimer += dt;
              if (guard.stuckTimer > 1.5) {
                guard.stuckTimer = 0;
                guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
                guard.pauseTimer = GUARD.pauseAtWaypoint;
              }
            } else {
              guard.stuckTimer = 0;
            }
          }
        }
      } else if (guard.state === 'chase' || guard.state === 'hunt') {
        const tx = guard.state === 'chase' ? state.player.x : guard.lastSeen.x;
        const ty = guard.state === 'chase' ? state.player.y : guard.lastSeen.y;
        const dx = tx - guard.x;
        const dy = ty - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const vx = (dx / dist) * GUARD.chaseSpeed * dt;
          const vy = (dy / dist) * GUARD.chaseSpeed * dt;
          guard.dir = Math.atan2(dy, dx);
          moveCircle(guard, vx, vy, GUARD.radius);
        }
        if (guard.state === 'hunt') {
          guard.huntTimer -= dt;
          if (guard.huntTimer <= 0) {
            guard.state = 'patrol';
            guard.suspicion = 0.4;
          }
        }
      }
    }

    if (demo || state.phase !== 'play') return events;

    const player = state.player;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // The thief moves; walls stop the slide one axis at a time.
    const len = Math.hypot(input.x, input.y);
    const nx = len > 0 ? input.x / len : 0;
    const ny = len > 0 ? input.y / len : 0;
    const speed = input.sneak ? PLAYER.sneakSpeed : PLAYER.speed;
    player.sneaking = Boolean(input.sneak);
    if (nx !== 0 || ny !== 0) {
      player.dirX = nx;
      player.dirY = ny;
    }
    moveCircle(player, nx * speed * dt, ny * speed * dt, PLAYER.radius);

    // Jammer: one charge switches every camera off for a while.
    if (input.jammer && state.jammerCharges > 0) {
      state.jammerCharges -= 1;
      for (const camera of state.cameras) camera.disabled = JAMMER.disableSeconds;
      events |= EVENT_JAMMER;
    }

    // Loot: walk over it to pocket it.
    for (const item of state.loot) {
      if (item.taken) continue;
      const dx = player.x - item.x;
      const dy = player.y - item.y;
      if (dx * dx + dy * dy < 26 * 26) {
        item.taken = true;
        state.lootTaken += 1;
        state.lootValue += item.value;
        state.score += item.value;
        events |= EVENT_LOOT;
      }
    }

    // Who sees the thief right now?
    let seen = false;
    const sneakFactor = player.sneaking ? 0.5 : 1;
    for (const guard of state.guards) {
      const dist = guardSeesPlayer(guard);
      if (dist > 0 && player.invulnerable === 0) {
        seen = true;
        guard.lastSeen.x = player.x;
        guard.lastSeen.y = player.y;
        const rate = GUARD.detectFar + (GUARD.detectNear - GUARD.detectFar) * (1 - dist / GUARD.visionRange);
        guard.suspicion = Math.min(1, guard.suspicion + rate * sneakFactor * dt);
        if (guard.suspicion >= 1 && guard.state !== 'chase') {
          guard.state = 'chase';
          guard.loseTimer = GUARD.loseSightSeconds;
          events |= EVENT_SPOTTED;
        }
        if (guard.state === 'chase') guard.loseTimer = GUARD.loseSightSeconds;
      } else {
        guard.suspicion = Math.max(0, guard.suspicion - dt * 0.5);
        if (guard.state === 'chase') {
          guard.loseTimer -= dt;
          if (guard.loseTimer <= 0) {
            guard.state = 'patrol';
            guard.suspicion = 0.4;
          }
        }
      }
      // A chasing or hunting guard that reaches the thief catches them.
      if ((guard.state === 'chase' || guard.state === 'hunt') && player.invulnerable === 0) {
        const dx = player.x - guard.x;
        const dy = player.y - guard.y;
        if (dx * dx + dy * dy < GUARD.catchRadius * GUARD.catchRadius) {
          state.lives -= 1;
          events |= EVENT_CAUGHT;
          if (state.lives <= 0) {
            state.phase = 'over';
            events |= EVENT_OVER;
            return events;
          }
          respawnAfterCaught();
        }
      }
    }
    for (const camera of state.cameras) {
      if (cameraSeesPlayer(camera) && player.invulnerable === 0) {
        seen = true;
        camera.spotted = true;
      }
    }

    // The alarm climbs while the thief is seen, drains while hidden.
    if (seen) {
      let rise = 0;
      for (const guard of state.guards) {
        if (guardSeesPlayer(guard) > 0 && player.invulnerable === 0) rise += ALARM.guardPerSecond;
      }
      for (const camera of state.cameras) {
        if (camera.spotted) rise += CAMERA.alarmPerSecond;
      }
      state.alarm = Math.min(ALARM.max, state.alarm + rise * sneakFactor * dt);
    } else {
      state.alarm = Math.max(0, state.alarm - ALARM.decayPerSecond * dt);
    }

    // A full alarm locks the building down: penalty, then every guard hunts.
    if (state.alarm >= ALARM.max) {
      state.lockdowns += 1;
      state.score = Math.max(0, state.score - ALARM.lockdownPenalty);
      state.alarm = ALARM.lockdownReset;
      for (const guard of state.guards) {
        guard.state = 'hunt';
        guard.huntTimer = ALARM.lockdownHuntSeconds;
        guard.lastSeen.x = player.x;
        guard.lastSeen.y = player.y;
      }
      events |= EVENT_LOCKDOWN;
    }

    // The clock: run out of time and the police arrive.
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.phase = 'over';
      events |= EVENT_OVER;
      return events;
    }

    // The getaway: reach the van with at least one piece of loot to clear the level.
    const exit = state.level.exit;
    if (
      player.x > exit.x &&
      player.x < exit.x + exit.w &&
      player.y > exit.y &&
      player.y < exit.y + exit.h
    ) {
      if (state.lootTaken > 0) {
        state.clearBonus = Math.round(state.timeLeft) * TIME_BONUS_PER_SECOND;
        state.score += state.clearBonus;
        events |= EVENT_CLEAR;
        if (state.levelIndex + 1 >= LEVELS.length) {
          state.phase = 'win';
          events |= EVENT_WIN;
        } else {
          state.phase = 'clear';
        }
      } else {
        state.message = 'The van leaves empty — grab at least one piece of loot first.';
        state.messageTimer = 3;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, loadLevel, nextLevel, dangerAt };
}
