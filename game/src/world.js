// Sunken Vault — the game's rules and state, with no drawing and no browser in
// it: the diver, the patrolling sharks and their sense cones, the sweeping sonar
// cameras, the treasure, the alarm meter, the whirlpool portal, the score. step() advances one
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
  HARPOON,
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
/** A harpoon was fired. */
export const EVENT_HARPOON = 256;
/** A harpoon hit a shark: it learned where the diver is — and slowed down. */
export const EVENT_HARPOON_HIT = 512;
/** A shark finished its wind-up and lunged. */
export const EVENT_ATTACK = 1024;
/** A shark started its wind-up telegraph — the audible warning before the bite. */
export const EVENT_WINDUP = 2048;

/** Smallest angle between two headings, in radians. */
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** How fast this shark still swims: every harpoon hit slows it by
 * HARPOON.slowPerHit, down to a floor of 1 - HARPOON.maxSlow — so a shark
 * shot twice is already a quarter slower, and a much-shot shark crawls.
 * Five hits reach the cap. */
export function sharkSpeedFactor(shark) {
  const hits = shark.slowHits || 0;
  return Math.max(1 - HARPOON.slowPerHit * hits, 1 - HARPOON.maxSlow);
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
    /** Harpoons in flight, the gun's cooldown, and how long the ink cloud
     * still hides the diver from sharks as well as sonar. */
    harpoons: [],
    harpoonCooldown: 0,
    inkTimer: 0,
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
      /** Attack timers: wind-up telegraph, lunge and recovery cooldown. All
       * zero means ready to attack. slowHits counts the harpoon hits this
       * shark has taken: each one slows it down for the rest of the dive. */
      attackCooldown: 0,
      windupTimer: 0,
      lungeTimer: 0,
      lungeDirX: 1,
      lungeDirY: 0,
      recoverTimer: 0,
      slowHits: 0,
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
    state.harpoons = [];
    state.harpoonCooldown = 0;
    state.inkTimer = 0;
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
    // The ink cloud hides the diver from sharks too, for as long as it lasts —
    // it is the escape button when a shark is already on your tail.
    if (state.inkTimer > 0) return 0;
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
    state.harpoons = [];
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
      shark.attackCooldown = 0;
      shark.windupTimer = 0;
      shark.lungeTimer = 0;
      shark.recoverTimer = 0;
      // slowHits is NOT reset here: a shark shot before the catch stays slow
      // for the rest of the dive — the trade-off keeps its cost.
    }
  }

  /**
   * One fixed step. `input` is {x, y, sneak, ink, fire, aimX, aimY}: a steering
   * vector (-1..1 each way), whether the diver swims slow, a one-shot ink burst
   * press, and a one-shot harpoon press with the aim point in field coordinates.
   * With `demo` set the sharks patrol and the sonar sweeps but nothing detects,
   * scores or ends — the title screen's living backdrop.
   */
  function step(dt, input, demo) {
    let events = 0;
    state.elapsed += dt;

    // A hint (like "grab treasure first") fades a few seconds after it appears.
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }

    // The ink cloud thins with time; while it lasts, sharks cannot see the diver.
    if (state.inkTimer > 0) state.inkTimer = Math.max(0, state.inkTimer - dt);

    // Sonar cameras always sweep, even on the title screen.
    for (const sonar of state.sonars) {
      sonar.angle = sonar.baseAngle + sonar.arc * Math.sin((state.elapsed * Math.PI * 2) / sonar.period + sonar.phase);
      if (sonar.disabled > 0) sonar.disabled = Math.max(0, sonar.disabled - dt);
      sonar.spotted = false;
    }

    // Sharks always swim their patrols — and their attacks. The state machine:
    // patrol -> chase (spotted) -> windup (telegraph, half a second) -> lunge
    // (the bite) -> recover (cooldown) -> chase or patrol. A harpoon hit never
    // stops a shark: it tells the shark where the diver is, so it turns and
    // hunts — but every hit slows it down for the rest of the dive. A chasing
    // shark that cannot see the diver swims to where it last saw them, then
    // gives up: hiding in kelp or breaking line of sight around a rock really
    // does lose it.
    for (const shark of state.sharks) {
      if (shark.attackCooldown > 0) shark.attackCooldown -= dt;
      if (shark.state === 'windup') {
        // Telegraph: the shark rears and tracks the diver but does not move, so
        // the diver has a fair half-second to dodge. Lose sight (kelp, rock,
        // ink) and the attack is called off.
        shark.dir = Math.atan2(state.player.y - shark.y, state.player.x - shark.x);
        if (sharkSeesPlayer(shark) === 0) {
          shark.state = 'chase';
          shark.windupTimer = 0;
          continue;
        }
        shark.windupTimer -= dt;
        if (shark.windupTimer <= 0) {
          const dx = state.player.x - shark.x;
          const dy = state.player.y - shark.y;
          const dist = Math.hypot(dx, dy) || 1;
          shark.lungeDirX = dx / dist;
          shark.lungeDirY = dy / dist;
          shark.dir = Math.atan2(dy, dx);
          shark.lungeTimer = SHARK.lungeSeconds;
          shark.state = 'lunge';
          events |= EVENT_ATTACK;
        }
        continue;
      }
      if (shark.state === 'lunge') {
        // The bite: a fast straight burst along the line fixed at wind-up end.
        // Rocks stop it, and a diver who moved clear is simply not there.
        // A much-shot shark lunges slower too: the slow applies to every swim.
        const lungeSpeed = SHARK.lungeSpeed * sharkSpeedFactor(shark);
        const vx = shark.lungeDirX * lungeSpeed * dt;
        const vy = shark.lungeDirY * lungeSpeed * dt;
        moveCircle(shark, vx, vy, SHARK.radius);
        shark.lungeTimer -= dt;
        if (!demo && state.phase === 'play' && state.player.invulnerable === 0) {
          const dx = state.player.x - shark.x;
          const dy = state.player.y - shark.y;
          if (dx * dx + dy * dy < SHARK.catchRadius * SHARK.catchRadius) {
            state.lives -= 1;
            events |= EVENT_CAUGHT;
            if (state.lives <= 0) {
              state.phase = 'over';
              events |= EVENT_OVER;
              return events;
            }
            respawnAfterCaught();
            continue;
          }
        }
        if (shark.lungeTimer <= 0) {
          shark.state = 'recover';
          shark.recoverTimer = SHARK.attackCooldownSeconds;
          shark.attackCooldown = SHARK.attackCooldownSeconds;
        }
        continue;
      }
      if (shark.state === 'recover') {
        // Spent: the shark drifts, slow and harmless, until it is ready again.
        shark.recoverTimer -= dt;
        if (shark.recoverTimer <= 0) {
          shark.state = sharkSeesPlayer(shark) > 0 ? 'chase' : 'patrol';
          shark.suspicion = shark.state === 'chase' ? 1 : 0.4;
        }
        continue;
      }
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
            const patrolSpeed = shark.speed * sharkSpeedFactor(shark);
            const vx = (dx / dist) * patrolSpeed * dt;
            const vy = (dy / dist) * patrolSpeed * dt;
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
        // A chasing shark swims at the diver only while it can see them; blind
        // (kelp, rock, ink) it swims to the last-seen spot instead, and gives
        // up after a short while — fleeing around a corner works.
        const sees = sharkSeesPlayer(shark) > 0;
        const tx = shark.state === 'chase' && sees ? state.player.x : shark.lastSeen.x;
        const ty = shark.state === 'chase' && sees ? state.player.y : shark.lastSeen.y;
        const dx = tx - shark.x;
        const dy = ty - shark.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const huntSpeed = SHARK.chaseSpeed * sharkSpeedFactor(shark);
          const vx = (dx / dist) * huntSpeed * dt;
          const vy = (dy / dist) * huntSpeed * dt;
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

    // Ink burst: one charge blinds every sonar camera for a while — and the
    // cloud hides the diver from sharks too, so it is also the escape button
    // when a shark is already on your tail.
    if (input.ink && state.inkCharges > 0) {
      state.inkCharges -= 1;
      for (const sonar of state.sonars) sonar.disabled = INK.disableSeconds;
      state.inkTimer = INK.disableSeconds;
      events |= EVENT_INK;
    }

    // Harpoon gun: Space fires one spear toward the aim point (the mouse
    // cursor, or the way the diver faces). Unlimited spears, but the gun
    // needs a short cooldown between shots — and every hit is a trade-off
    // (see the harpoon flight below): it slows the shark, but tells it
    // exactly where you are.
    if (state.harpoonCooldown > 0) state.harpoonCooldown -= dt;
    if (input.fire && state.harpoonCooldown <= 0) {
      const aimX = typeof input.aimX === 'number' ? input.aimX : player.x + player.dirX * 240;
      const aimY = typeof input.aimY === 'number' ? input.aimY : player.y + player.dirY * 240;
      const dx = aimX - player.x;
      const dy = aimY - player.y;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        state.harpoons.push({
          x: player.x + (dx / len) * (DIVER.radius + 6),
          y: player.y + (dy / len) * (DIVER.radius + 6),
          dx: dx / len,
          dy: dy / len,
          traveled: 0,
        });
        state.harpoonCooldown = HARPOON.cooldownSeconds;
        events |= EVENT_HARPOON;
      }
    }

    // Harpoons in flight: they fly straight until they run out of range, hit
    // a rock (they stick and sink), or hit a shark — a hit is a trade-off:
    // the shark learns exactly where the diver is and comes hunting, but every
    // hit slows that shark down for the rest of the dive. They never touch the
    // treasure: loot is only pocketed by swimming over it.
    for (let i = state.harpoons.length - 1; i >= 0; i -= 1) {
      const h = state.harpoons[i];
      h.x += h.dx * HARPOON.speed * dt;
      h.y += h.dy * HARPOON.speed * dt;
      h.traveled += HARPOON.speed * dt;
      let spent = h.traveled >= HARPOON.range;
      if (!spent) {
        for (const wall of state.level.walls) {
          if (circleHitsRect(h.x, h.y, HARPOON.radius, wall)) {
            spent = true;
            break;
          }
        }
      }
      if (!spent) {
        for (const shark of state.sharks) {
          const dx = shark.x - h.x;
          const dy = shark.y - h.y;
          if (dx * dx + dy * dy < (SHARK.radius + HARPOON.radius) * (SHARK.radius + HARPOON.radius)) {
            // The trade-off, in one place: the spear tells the shark exactly
            // where the diver is — it turns and hunts that spot — and it
            // slows the shark down, one hit at a time, for the rest of the
            // dive. A shark already winding up or lunging stays on its
            // attack; any other state turns into a fresh chase. Five hits
            // reach the 60% cap; a sixth hit still reveals the diver.
            shark.slowHits = (shark.slowHits || 0) + 1;
            shark.lastSeen.x = state.player.x;
            shark.lastSeen.y = state.player.y;
            shark.suspicion = 1;
            shark.attackCooldown = 0;
            if (shark.state !== 'windup' && shark.state !== 'lunge') {
              shark.state = 'chase';
              shark.loseTimer = SHARK.blindGiveUpSeconds;
            }
            events |= EVENT_HARPOON_HIT;
            spent = true;
            break;
          }
        }
      }
      if (spent) state.harpoons.splice(i, 1);
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

    // Who sees the diver right now? Sharks mid-attack do not detect: a
    // winding-up shark is committed to its lunge, a lunging or recovering one
    // is spent. A harpoon-hit shark detects like any other — it knows where
    // you are, that is the point of the trade-off. Slowed sharks detect just
    // as well: the slow is in the fins, not the eyes.
    let seen = false;
    const sneakFactor = player.sneaking ? 0.5 : 1;
    for (const shark of state.sharks) {
      if (shark.state === 'windup' || shark.state === 'lunge' || shark.state === 'recover') continue;
      const dist = sharkSeesPlayer(shark);
      if (dist > 0 && player.invulnerable === 0) {
        seen = true;
        shark.lastSeen.x = player.x;
        shark.lastSeen.y = player.y;
        const rate = SHARK.detectFar + (SHARK.detectNear - SHARK.detectFar) * (1 - dist / SHARK.visionRange);
        shark.suspicion = Math.min(1, shark.suspicion + rate * sneakFactor * dt);
        if (shark.suspicion >= 1 && shark.state !== 'chase') {
          shark.state = 'chase';
          shark.loseTimer = SHARK.blindGiveUpSeconds;
          events |= EVENT_SPOTTED;
        }
        if (shark.state === 'chase') shark.loseTimer = SHARK.blindGiveUpSeconds;
        // Close, seen and ready: the shark winds up its attack instead of
        // catching on touch. The wind-up is the fair warning.
        if ((shark.state === 'chase' || shark.state === 'hunt') && shark.attackCooldown <= 0 && dist <= SHARK.attackRange) {
          shark.state = 'windup';
          shark.windupTimer = SHARK.windupSeconds;
          events |= EVENT_WINDUP;
        }
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

    // The whirlpool: swim into the portal with at least one piece of treasure
    // to clear the level and dive on to the next dimension.
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
        state.message = 'The whirlpool needs treasure — grab at least one piece first.';
        state.messageTimer = 3;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, loadLevel, nextLevel, dangerAt };
}
