// Midnight Vault — everything the player sees: the room, the cones, the thief, the
// HUD and the screens. The renderer knows nothing about input or sound; it draws the
// world's current state, scaled to fit the window, and the caller picks which screen.

import { ALARM, CAMERA, FIELD, FONT, GUARD, LOOT, PALETTE, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const LOOT_COLORS = {
  cash: '#f2c94c',
  paint: '#ff7eb6',
  gem: '#7ee7ff',
  vault: '#ff9f43',
};

function conePath(ctx, x, y, angle, halfAngle, range) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, angle - halfAngle, angle + halfAngle);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function fmtScore(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
  }

  function drawField(world) {
    const state = world.state;
    const level = state.level;

    // Floor.
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.strokeStyle = PALETTE.floorGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 64; x < FIELD.width; x += 64) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = 64; y < FIELD.height; y += 64) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();

    // Getaway van zone on the right edge.
    const exit = level.exit;
    const exitActive = state.lootTaken > 0;
    ctx.fillStyle = exitActive ? 'rgba(61, 220, 132, 0.22)' : 'rgba(61, 220, 132, 0.10)';
    ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
    ctx.strokeStyle = PALETTE.exit;
    ctx.lineWidth = 2;
    ctx.strokeRect(exit.x, exit.y, exit.w, exit.h);
    ctx.fillStyle = PALETTE.exitDark;
    roundRect(ctx, exit.x + 8, exit.y + 34, 48, 52, 6);
    ctx.fill();
    ctx.fillStyle = PALETTE.exit;
    ctx.beginPath();
    ctx.arc(exit.x + 20, exit.y + 90, 8, 0, Math.PI * 2);
    ctx.arc(exit.x + 44, exit.y + 90, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('GETAWAY', exit.x + exit.w / 2, exit.y + 16);

    // Loot: a bobbing diamond with its value underneath, over a soft glow.
    for (const item of state.loot) {
      if (item.taken) continue;
      const bob = Math.sin(state.elapsed * 2 + item.bob) * 3;
      const color = LOOT_COLORS[item.kind];
      const glow = ctx.createRadialGradient(item.x, item.y + bob, 2, item.x, item.y + bob, 30);
      glow.addColorStop(0, 'rgba(242, 201, 76, 0.28)');
      glow.addColorStop(1, 'rgba(242, 201, 76, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(item.x, item.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = color;
      ctx.fillRect(-9, -9, 18, 18);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.restore();
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(fmtScore(item.value), item.x, item.y + bob + 26);
    }

    // Guard patrol routes, as faint dashed lines: the player can read where each
    // guard walks, and the frame gains the room's circulation at a glance.
    for (const guard of state.guards) {
      ctx.strokeStyle = 'rgba(229, 83, 75, 0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      guard.waypoints.forEach((wp, i) => {
        if (i === 0) ctx.moveTo(wp.x, wp.y);
        else ctx.lineTo(wp.x, wp.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Cameras: sweeping cone. The mount itself is drawn after the HUD, so a camera
    // on the top wall is never hidden behind the HUD bar.
    for (const camera of state.cameras) {
      const disabled = camera.disabled > 0;
      ctx.fillStyle = disabled
        ? 'rgba(139, 147, 163, 0.10)'
        : camera.spotted
          ? 'rgba(255, 93, 143, 0.34)'
          : PALETTE.cameraCone;
      conePath(ctx, camera.x, camera.y, camera.angle, CAMERA.halfAngle, camera.range);
      ctx.fill();
    }

    // Guards: cone, body, facing tick, suspicion ring, chase mark.
    for (const guard of state.guards) {
      const chasing = guard.state === 'chase' || guard.state === 'hunt';
      ctx.fillStyle = chasing ? PALETTE.guardConeChase : PALETTE.guardCone;
      conePath(ctx, guard.x, guard.y, guard.dir, GUARD.visionHalfAngle, GUARD.visionRange);
      ctx.fill();
      ctx.fillStyle = PALETTE.guard;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7c1d18';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#ffd9d6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.lineTo(guard.x + Math.cos(guard.dir) * (GUARD.radius + 7), guard.y + Math.sin(guard.dir) * (GUARD.radius + 7));
      ctx.stroke();
      if (guard.suspicion > 0.05 && !chasing) {
        ctx.strokeStyle = 'rgba(238, 241, 245, 0.35)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, 22, -Math.PI / 2, Math.PI * 1.5);
        ctx.stroke();
        ctx.strokeStyle = guard.suspicion > 0.66 ? '#ff4d4d' : '#ffd166';
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, 22, -Math.PI / 2, -Math.PI / 2 + guard.suspicion * Math.PI * 2);
        ctx.stroke();
      }
      if (chasing) {
        ctx.fillStyle = '#ff4d4d';
        ctx.font = 'bold 22px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('!', guard.x, guard.y - 24);
      }
    }

    // Walls, drawn last so they sit on top of the cones they block.
    for (const w of level.walls) {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = PALETTE.wallTop;
      ctx.fillRect(w.x, w.y, w.w, 4);
    }

    // The thief.
    const player = state.player;
    if (state.phase === 'play' || state.phase === 'clear') {
      const blink = player.invulnerable > 0 && Math.floor(state.elapsed * 8) % 2 === 0;
      if (!blink) {
        ctx.fillStyle = player.sneaking ? PALETTE.playerSneak : PALETTE.player;
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7a5b00';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = '#0b0e14';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + player.dirX * (PLAYER.radius + 6), player.y + player.dirY * (PLAYER.radius + 6));
        ctx.stroke();
        if (player.sneaking) {
          ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(player.x, player.y, PLAYER.radius + 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  function drawHud(world) {
    const state = world.state;
    const level = state.level;
    ctx.fillStyle = 'rgba(11, 14, 20, 0.82)';
    ctx.fillRect(0, 0, FIELD.width, 46);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'left';
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillText(level.name, 16, 29);
    ctx.font = '15px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    const lootText = '◆ ' + state.lootTaken + '/' + state.loot.length + '   ' + fmtScore(state.score);
    ctx.fillText(lootText, 300, 29);
    // Lives as hearts.
    ctx.fillStyle = '#ff5d8f';
    ctx.font = '17px ' + FONT;
    let hearts = '';
    for (let i = 0; i < state.lives; i += 1) hearts += '♥ ';
    ctx.fillText(hearts, 560, 29);
    // Jammer charges.
    ctx.fillStyle = state.jammerCharges > 0 ? PALETTE.gold : PALETTE.muted;
    ctx.font = '15px ' + FONT;
    ctx.fillText('Q jammer ×' + state.jammerCharges, 660, 29);
    // Timer.
    ctx.fillStyle = state.timeLeft < 20 ? '#ff4d4d' : PALETTE.text;
    ctx.font = 'bold 17px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(fmtTime(state.timeLeft), 880, 29);
    // Alarm meter.
    const meterX = 900;
    const meterW = 220;
    ctx.textAlign = 'left';
    ctx.fillStyle = state.alarm > 70 ? '#ff4d4d' : PALETTE.muted;
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText('ALARM', meterX, 20);
    ctx.fillStyle = PALETTE.alarmTrack;
    ctx.fillRect(meterX, 26, meterW, 10);
    const flash = state.alarm > 70 && Math.floor(state.elapsed * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ffffff' : state.alarm > 70 ? '#ff4d4d' : state.alarm > 35 ? '#ffd166' : '#3ddc84';
    ctx.fillRect(meterX, 26, (meterW * state.alarm) / ALARM.max, 10);
    ctx.strokeStyle = 'rgba(238,241,245,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(meterX, 26, meterW, 10);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText(Math.round(state.alarm) + '%', meterX + meterW + 8, 35);
    ctx.textAlign = 'left';
  }

  function drawCameraMounts(world) {
    for (const camera of world.state.cameras) {
      const disabled = camera.disabled > 0;
      ctx.fillStyle = disabled ? '#8b93a3' : PALETTE.camera;
      ctx.beginPath();
      ctx.arc(camera.x, camera.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0e14';
      ctx.beginPath();
      ctx.arc(camera.x, camera.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (disabled) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = 'bold 11px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('OFF', camera.x, camera.y + 24);
      }
    }
  }

  function drawMessage(world) {
    if (!world.state.message) return;
    ctx.fillStyle = 'rgba(11, 14, 20, 0.85)';
    const text = world.state.message;
    ctx.font = '15px ' + FONT;
    const w = ctx.measureText(text).width + 32;
    roundRect(ctx, (FIELD.width - w) / 2, FIELD.height - 64, w, 34, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(text, FIELD.width / 2, FIELD.height - 41);
    ctx.textAlign = 'left';
  }

  function drawPanel(title, lines, footnote) {
    ctx.fillStyle = 'rgba(11, 14, 20, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const panelW = 620;
    const panelH = 110 + lines.length * 30 + (footnote ? 44 : 0);
    const x = (FIELD.width - panelW) / 2;
    const y = (FIELD.height - panelH) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, panelW, panelH, 12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.wallTop;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(title, FIELD.width / 2, y + 52);
    ctx.font = '17px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, y + 92 + i * 30);
    });
    if (footnote) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillText(footnote, FIELD.width / 2, y + panelH - 24);
    }
    ctx.textAlign = 'left';
  }

  function render(screen, world) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    drawField(world);
    if (screen.type !== SCREEN_TITLE) {
      drawHud(world);
      drawMessage(world);
    }
    // Mounts go on top of the HUD (and of the title dimming), so a camera on the
    // top wall is always visible, never buried under a bar or a panel's shade.
    drawCameraMounts(world);
    if (screen.type === SCREEN_TITLE) {
      drawPanel(
        'MIDNIGHT VAULT',
        [
          'A top-down heist: slip past the guards, dodge the cameras,',
          'pocket the loot and reach the getaway van before the alarm',
          'tops out — or the police arrive.',
          '',
          'WASD / arrows — move      Shift — sneak (slower, harder to spot)',
          'Q — jam the cameras (2 per level)      Click — also steers the thief',
        ],
        'Press Space or click to start'
      );
    } else if (screen.type === SCREEN_PAUSE) {
      drawPanel('PAUSED', ['The crew is holding its breath.'], 'Press P or Space to continue');
    } else if (screen.type === SCREEN_CLEAR) {
      drawPanel(
        'LEVEL CLEAR',
        [
          'Loot this level: ' + fmtScore(world.state.lootValue),
          'Time bonus: ' + fmtScore(world.state.clearBonus),
          'Total score: ' + fmtScore(world.state.score),
        ],
        'Press Space for the next job'
      );
    } else if (screen.type === SCREEN_WIN) {
      const best = world.best || 0;
      drawPanel(
        'CLEAN GETAWAY!',
        [
          'All three jobs done. Loot: ' + fmtScore(world.state.lootValue + world.state.score - world.state.clearBonus),
          'Final score: ' + fmtScore(world.state.score),
          'Best: ' + fmtScore(Math.max(best, world.state.score)),
        ],
        'Press Space to run it again'
      );
    } else if (screen.type === SCREEN_OVER) {
      const reason = world.state.timeLeft <= 0 ? 'The police arrived before you got out.' : 'The guards caught you three times.';
      drawPanel('BUSTED', [reason, 'Score: ' + fmtScore(world.state.score)], 'Press Space to try again');
    }
  }

  return { resize, render };
}
