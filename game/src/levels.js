// The three heist locations. Each level is one room the thief crosses in a single
// 1280x720 frame: walls are cover (and block sight), loot is spread so the thief must
// choose a route, guards walk fixed patrols, and cameras sweep the chokepoints.
// Entry is always on the left edge, the getaway van on the right edge.

function wall(x, y, w, h) {
  return { x, y, w, h };
}

const BORDER = [
  wall(0, 0, 1280, 24),
  wall(0, 696, 1280, 24),
  wall(0, 0, 24, 720),
  wall(1256, 0, 24, 720),
];

export const LEVELS = [
  {
    name: '1 · The Office',
    hint: 'One guard, one camera. Learn the cones, then take the painting.',
    timeLimit: 120,
    entry: { x: 64, y: 360 },
    exit: { x: 1172, y: 300, w: 64, h: 120 },
    walls: [
      ...BORDER,
      wall(280, 120, 180, 36),
      wall(280, 564, 180, 36),
      wall(560, 300, 36, 140),
      wall(820, 120, 180, 36),
      wall(820, 564, 180, 36),
    ],
    loot: [
      { x: 300, y: 360, kind: 'cash' },
      { x: 640, y: 120, kind: 'paint' },
      { x: 980, y: 640, kind: 'cash' },
    ],
    guards: [
      { waypoints: [{ x: 480, y: 180 }, { x: 480, y: 540 }], speed: 70 },
    ],
    cameras: [
      { x: 640, y: 32, baseAngle: Math.PI / 2, arc: 0.5, period: 5, range: 240 },
    ],
  },
  {
    name: '2 · The Museum',
    hint: 'Two guards cross the hall. The diamond sits in the middle — time it.',
    timeLimit: 120,
    entry: { x: 64, y: 360 },
    exit: { x: 1172, y: 300, w: 64, h: 120 },
    walls: [
      ...BORDER,
      wall(240, 100, 200, 40),
      wall(240, 580, 200, 40),
      wall(520, 240, 40, 240),
      wall(760, 100, 200, 40),
      wall(760, 580, 200, 40),
      wall(1040, 300, 40, 140),
    ],
    loot: [
      { x: 300, y: 360, kind: 'cash' },
      { x: 560, y: 120, kind: 'paint' },
      { x: 900, y: 360, kind: 'gem' },
      { x: 1120, y: 600, kind: 'paint' },
    ],
    guards: [
      { waypoints: [{ x: 400, y: 180 }, { x: 400, y: 540 }], speed: 80 },
      { waypoints: [{ x: 880, y: 540 }, { x: 880, y: 180 }], speed: 80 },
    ],
    cameras: [
      { x: 520, y: 32, baseAngle: Math.PI / 2, arc: 0.5, period: 5, range: 240 },
      { x: 880, y: 688, baseAngle: -Math.PI / 2, arc: 0.5, period: 6, range: 240 },
    ],
  },
  {
    name: '3 · The Bank Vault',
    hint: 'Three guards, three cameras, one vault of gold. Jam the cameras and run.',
    timeLimit: 150,
    entry: { x: 64, y: 360 },
    exit: { x: 1172, y: 300, w: 64, h: 120 },
    walls: [
      ...BORDER,
      wall(200, 90, 160, 40),
      wall(200, 590, 160, 40),
      wall(460, 200, 40, 320),
      wall(620, 90, 160, 40),
      wall(620, 590, 160, 40),
      wall(880, 200, 40, 320),
      wall(1060, 90, 120, 40),
      wall(1060, 590, 120, 40),
    ],
    loot: [
      { x: 280, y: 360, kind: 'cash' },
      { x: 520, y: 120, kind: 'paint' },
      { x: 700, y: 360, kind: 'gem' },
      { x: 960, y: 600, kind: 'gem' },
      { x: 980, y: 120, kind: 'vault' },
    ],
    guards: [
      { waypoints: [{ x: 360, y: 180 }, { x: 360, y: 540 }], speed: 90 },
      { waypoints: [{ x: 700, y: 540 }, { x: 700, y: 180 }], speed: 90 },
      { waypoints: [{ x: 1020, y: 180 }, { x: 1020, y: 540 }], speed: 90 },
    ],
    cameras: [
      { x: 460, y: 32, baseAngle: Math.PI / 2, arc: 0.55, period: 5, range: 250 },
      { x: 820, y: 688, baseAngle: -Math.PI / 2, arc: 0.55, period: 6, range: 250 },
      { x: 1060, y: 32, baseAngle: Math.PI / 2, arc: 0.5, period: 4.5, range: 250 },
    ],
  },
];
