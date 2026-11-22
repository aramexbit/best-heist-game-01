// Sunken Vault — the game's rules and state, with no drawing and no browser in
// it: the diver, the patrolling sharks and their sense cones, the sweeping sonar
// cameras, the treasure, the alarm meter, the boat, the score. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound. Nothing here allocates after
// createWorld returns.
//
// Kelp beds are the diver's hiding place: they block sight like rock does, but
// the diver (and the sharks) can swim straight through them — the classic stealth
// grass, under water.

import {
  ALARM,
  SONAR,
  FIELD,
  SHARK,
  INK,
  LIVES,
  LOOT,
  DIVER,
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
export const EVENT_INK = 128;

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
    sharks: [],
    sonars: [],
    loot: [],
    alarm: 0,
    score: 0,
    lives: LIVES,
    timeLeft: 0,
    phase: 'play',
    inkCharges: INK.charges,
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
    state.sharks = level.sharks.map((g) => ({
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
    state.sonars = level.sonars.map((c, i) => ({
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
    state.inkCharges = INK.charges;
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

  /** True when the segment from (x1,y1) to (x2,y2) is blocked by any rock or kelp bed. */
  function blockedSight(x1, y1, x2, y2) {
    const walls = state.level.walls;
    for (let i = 0; i < walls.length; i += 1) {
      if (segmentHitsRect(x1, y1, x2, y2, walls[i])) return true;
    }
    const kelp = state.level.kelp || [];
    for (let i = 0; i < kelp.length; i += 1) {
      if (segmentHitsRect(x1, y1, x2, y2, kelp[i])) return true;
    }
    return false;
  }

  /** How dangerous a point is: 1 when a live shark or sonar cone with clear sight covers it. */
  function dangerAt(x, y) {
    for (const shark of state.sharks) {
      const dx = x - shark.x;
      const dy = y - shark.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= SHARK.visionRange && angleDiff(Math.atan2(dy, dx), shark.dir) <= SHARK.visionHalfAngle) {
        if (!blockedSight(shark.x, shark.y, x, y)) return 1;
      }
    }
    for (const sonar of state.sonars) {
      if (sonar.disabled > 0) continue;
      const dx = x - sonar.x;
      const dy = y - sonar.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= sonar.range && angleDiff(Math.atan2(dy, dx), sonar.angle) <= SONAR.halfAngle) {
        if (!blockedSight(sonar.x, sonar.y, x, y)) return 1;
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
    entity.x = Math.max(DIVER.radius, Math.min(FIELD.width - DIVER.radius, entity.x));
    entity.y = Math.max(DIVER.radius, Math.min(FIELD.height - DIVER.radius, entity.y));
  }

  function sharkSeesPlayer(shark) {
    const p = state.player;
    const dx = p.x - shark.x;
    const dy = p.y - shark.y;
    const dist = Math.hypot(dx, dy);
    if (dist > SHARK.visionRange) return 0;
    if (angleDiff(Math.atan2(dy, dx), shark.dir) > SHARK.visionHalfAngle) return 0;
    if (blockedSight(shark.x, shark.y, p.x, p.y)) return 0;
    return dist;
  }

  function sonarSeesPlayer(sonar) {
    if (sonar.disabled > 0) return false;
    const p = state.player;
    const dx = p.x - sonar.x;
    const dy = p.y - sonar.y;
    if (Math.hypot(dx, dy) > sonar.range) return false;
    if (angleDiff(Math.atan2(dy, dx), sonar.angle) > SONAR.halfAngle) return false;
    return !blockedSight(sonar.x, sonar.y, p.x, p.y);
  }

  function respawnAfterCaught() {
    const level = state.level;
    state.player.x = level.entry.x;
    state.player.y = level.entry.y;
    state.player.invulnerable = 2;
    for (const shark of state.sharks) {
      shark.x = shark.waypoints[0].x;
      shark.y = shark.waypoints[0].y;
      shark.wpIndex = 1 % shark.waypoints.length;
      shark.state = 'patrol';
      shark.suspicion = 0;
      shark.pauseTimer = 0;
      shark.loseTimer = 0;
      shark.huntTimer = 0;
      shark.stuckTimer = 0;
    }
  }

  /**
   * One fixed step. `input` is {x, y, sneak, ink}: a steering vector (-1..1 each
   * way), whether the diver swims slow, and a one-shot ink burst press. With `demo`
   * set the sharks patrol and the sonar sweeps but nothing detects, scores or ends
   * — the title screen's living backdrop.
   */
  function step(dt, input, demo) {
    let events = 0;
    state.elapsed += dt;

    // A hint (like "grab treasure first") fades a few seconds after it appears.
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }

    // Sonar cameras always sweep, even on the title screen.
    for (const sonar of state.sonars) {
      sonar.angle = sonar.baseAngle + sonar.arc * Math.sin((state.elapsed * Math.PI * 2) / sonar.period + sonar.phase);
      if (sonar.disabled > 0) sonar.disabled = Math.max(0, sonar.disabled - dt);
      sonar.spotted = false;
    }

    // Sharks always swim their patrols.
    for (const shark of state.sharks) {
      if (shark.state === 'patrol') {
        if (shark.pauseTimer > 0) {
          shark.pauseTimer -= dt;
        } else {
          const target = shark.waypoints[shark.wpIndex];
          const dx = target.x - shark.x;
          const dy = target.y - shark.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 4) {
            shark.wpIndex = (shark.wpIndex + 1) % shark.waypoints.length;
            shark.pauseTimer = SHARK.pauseAtWaypoint;
          } else {
            const beforeX = shark.x;
            const beforeY = shark.y;
            const vx = (dx / dist) * shark.speed * dt;
            const vy = (dy / dist) * shark.speed * dt;
            shark.dir = Math.atan2(dy, dx);
            moveCircle(shark, vx, vy, SHARK.radius);
            // A patrol blocked by a rock for 1.5s skips to the next waypoint
            // instead of nosing against the rock forever.
            if (Math.hypot(shark.x - beforeX, shark.y - beforeY) < 0.01) {
              shark.stuckTimer += dt;
              if (shark.stuckTimer > 1.5) {
                shark.stuckTimer = 0;
                shark.wpIndex = (shark.wpIndex + 1) % shark.waypoints.length;
                shark.pauseTimer = SHARK.pauseAtWaypoint;
              }
            } else {
              shark.stuckTimer = 0;
            }
          }
        }
      } else if (shark.state === 'chase' || shark.state === 'hunt') {
        const tx = shark.state === 'chase' ? state.player.x : shark.lastSeen.x;
        const ty = shark.state === 'chase' ? state.player.y : shark.lastSeen.y;
        const dx = tx - shark.x;
        const dy = ty - shark.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const vx = (dx / dist) * SHARK.chaseSpeed * dt;
          const vy = (dy / dist) * SHARK.chaseSpeed * dt;
          shark.dir = Math.atan2(dy, dx);
          moveCircle(shark, vx, vy, SHARK.radius);
        }
        if (shark.state === 'hunt') {
          shark.huntTimer -= dt;
          if (shark.huntTimer <= 0) {
            shark.state = 'patrol';
            shark.suspicion = 0.4;
          }
        }
      }
    }

    if (demo || state.phase !== 'play') return events;

    const player = state.player;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // The diver swims; rocks stop the slide one axis at a time. Kelp never blocks.
    const len = Math.hypot(input.x, input.y);
    const nx = len > 0 ? input.x / len : 0;
    const ny = len > 0 ? input.y / len : 0;
    const speed = input.sneak ? DIVER.sneakSpeed : DIVER.speed;
    player.sneaking = Boolean(input.sneak);
    if (nx !== 0 || ny !== 0) {
      player.dirX = nx;
      player.dirY = ny;
    }
    moveCircle(player, nx * speed * dt, ny * speed * dt, DIVER.radius);

    // Ink burst: one charge blinds every sonar camera for a while.
    if (input.ink && state.inkCharges > 0) {
      state.inkCharges -= 1;
      for (const sonar of state.sonars) sonar.disabled = INK.disableSeconds;
      events |= EVENT_INK;
    }

    // Treasure: swim over it to pocket it.
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

    // Who sees the diver right now?
    let seen = false;
    const sneakFactor = player.sneaking ? 0.5 : 1;
    for (const shark of state.sharks) {
      const dist = sharkSeesPlayer(shark);
      if (dist > 0 && player.invulnerable === 0) {
        seen = true;
        shark.lastSeen.x = player.x;
        shark.lastSeen.y = player.y;
        const rate = SHARK.detectFar + (SHARK.detectNear - SHARK.detectFar) * (1 - dist / SHARK.visionRange);
        shark.suspicion = Math.min(1, shark.suspicion + rate * sneakFactor * dt);
        if (shark.suspicion >= 1 && shark.state !== 'chase') {
          shark.state = 'chase';
          shark.loseTimer = SHARK.loseSightSeconds;
          events |= EVENT_SPOTTED;
        }
        if (shark.state === 'chase') shark.loseTimer = SHARK.loseSightSeconds;
      } else {
        shark.suspicion = Math.max(0, shark.suspicion - dt * 0.5);
        if (shark.state === 'chase') {
          shark.loseTimer -= dt;
          if (shark.loseTimer <= 0) {
            shark.state = 'patrol';
            shark.suspicion = 0.4;
          }
        }
      }
      // A chasing or hunting shark that reaches the diver catches them.
      if ((shark.state === 'chase' || shark.state === 'hunt') && player.invulnerable === 0) {
        const dx = player.x - shark.x;
        const dy = player.y - shark.y;
        if (dx * dx + dy * dy < SHARK.catchRadius * SHARK.catchRadius) {
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
    for (const sonar of state.sonars) {
      if (sonarSeesPlayer(sonar) && player.invulnerable === 0) {
        seen = true;
        sonar.spotted = true;
      }
    }

    // The alarm climbs while the diver is seen, drains while hidden.
    if (seen) {
      let rise = 0;
      for (const shark of state.sharks) {
        if (sharkSeesPlayer(shark) > 0 && player.invulnerable === 0) rise += ALARM.sharkPerSecond;
      }
      for (const sonar of state.sonars) {
        if (sonar.spotted) rise += SONAR.alarmPerSecond;
      }
      state.alarm = Math.min(ALARM.max, state.alarm + rise * sneakFactor * dt);
    } else {
      state.alarm = Math.max(0, state.alarm - ALARM.decayPerSecond * dt);
    }

    // A full alarm puts the whole reef on alert: penalty, then every shark hunts.
    if (state.alarm >= ALARM.max) {
      state.lockdowns += 1;
      state.score = Math.max(0, state.score - ALARM.lockdownPenalty);
      state.alarm = ALARM.lockdownReset;
      for (const shark of state.sharks) {
        shark.state = 'hunt';
        shark.huntTimer = ALARM.lockdownHuntSeconds;
        shark.lastSeen.x = player.x;
        shark.lastSeen.y = player.y;
      }
      events |= EVENT_LOCKDOWN;
    }

    // The clock: run out of air and the dive is over.
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.phase = 'over';
      events |= EVENT_OVER;
      return events;
    }

    // The boat: reach it with at least one piece of treasure to clear the level.
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
        state.message = 'The boat leaves empty — grab at least one treasure first.';
        state.messageTimer = 3;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, loadLevel, nextLevel, dangerAt };
}
