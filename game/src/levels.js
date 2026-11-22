// The three dive sites. Each level is one stretch of seabed the diver crosses in a
// single 1280x720 frame: rocks are cover (and block sight), kelp beds hide the
// diver from sharks and sonar without blocking the swim, treasure is spread so the
// diver must choose a route, sharks swim fixed patrols, and sonar cameras sweep the
// chokepoints. Entry is always on the left edge, the boat on the right edge.
//
// Geometry is the probe-verified v1 layout, unchanged: the autopilot's routes,
// the wall sight-lines and the staged alarm scene all still hold.

function rock(x, y, w, h) {
  return { x, y, w, h };
}

function kelp(x, y, w, h) {
  return { x, y, w, h };
}

const BORDER = [
  rock(0, 0, 1280, 24),
  rock(0, 696, 1280, 24),
  rock(0, 0, 24, 720),
  rock(1256, 0, 24, 720),
];

export const LEVELS = [
  {
    name: '1 · The Coral Reef',
    theme: 'reef',
    hint: 'One shark, one sonar camera. Learn the cones, then take the pearl.',
    timeLimit: 120,
    entry: { x: 64, y: 360 },
    exit: { x: 1172, y: 300, w: 64, h: 120 },
    walls: [
      ...BORDER,
      rock(280, 120, 180, 36),
      rock(280, 564, 180, 36),
      rock(560, 300, 36, 140),
      rock(820, 120, 180, 36),
      rock(820, 564, 180, 36),
    ],
    kelp: [
      kelp(120, 90, 100, 80),
      kelp(560, 600, 120, 70),
      kelp(1080, 560, 110, 80),
    ],
    loot: [
      { x: 300, y: 360, kind: 'coins' },
      { x: 640, y: 120, kind: 'pearl' },
      { x: 980, y: 640, kind: 'coins' },
    ],
    sharks: [
      { waypoints: [{ x: 480, y: 180 }, { x: 480, y: 540 }], speed: 70 },
    ],
    sonars: [
      { x: 640, y: 32, baseAngle: Math.PI / 2, arc: 0.5, period: 5, range: 240 },
    ],
  },
  {
    name: '2 · The Shipwreck',
    theme: 'wreck',
    hint: 'Two sharks cross the wreck. The sapphire sits in the middle — time it.',
    timeLimit: 120,
    entry: { x: 64, y: 360 },
    exit: { x: 1172, y: 300, w: 64, h: 120 },
    walls: [
      ...BORDER,
      rock(240, 100, 200, 40),
      rock(240, 580, 200, 40),
      rock(520, 240, 40, 240),
      rock(760, 100, 200, 40),
      rock(760, 580, 200, 40),
      rock(1040, 300, 40, 140),
    ],
    kelp: [
      kelp(120, 540, 110, 90),
      kelp(640, 300, 90, 90),
      kelp(980, 90, 100, 80),
    ],
    loot: [
      { x: 300, y: 360, kind: 'coins' },
      { x: 560, y: 120, kind: 'pearl' },
      { x: 900, y: 360, kind: 'gem' },
      { x: 1120, y: 600, kind: 'pearl' },
    ],
    sharks: [
      { waypoints: [{ x: 400, y: 180 }, { x: 400, y: 540 }], speed: 80 },
      { waypoints: [{ x: 880, y: 540 }, { x: 880, y: 180 }], speed: 80 },
    ],
    sonars: [
      { x: 520, y: 32, baseAngle: Math.PI / 2, arc: 0.5, period: 5, range: 240 },
      { x: 880, y: 688, baseAngle: -Math.PI / 2, arc: 0.5, period: 6, range: 240 },
    ],
  },
  {
    name: '3 · The Deep Trench',
    theme: 'trench',
    hint: 'Three sharks, three sonar cameras, one chest of gold. Ink the cameras and swim.',
    timeLimit: 150,
    entry: { x: 64, y: 360 },
    exit: { x: 1172, y: 300, w: 64, h: 120 },
    walls: [
      ...BORDER,
      rock(200, 90, 160, 40),
      rock(200, 590, 160, 40),
      rock(460, 200, 40, 320),
      rock(620, 90, 160, 40),
      rock(620, 590, 160, 40),
      rock(880, 200, 40, 320),
      rock(1060, 90, 120, 40),
      rock(1060, 590, 120, 40),
    ],
    kelp: [
      kelp(120, 540, 110, 90),
      kelp(560, 320, 90, 90),
      kelp(1120, 300, 90, 90),
    ],
    loot: [
      { x: 280, y: 360, kind: 'coins' },
      { x: 520, y: 120, kind: 'pearl' },
      { x: 700, y: 360, kind: 'gem' },
      { x: 960, y: 600, kind: 'gem' },
      { x: 980, y: 120, kind: 'chest' },
    ],
    sharks: [
      { waypoints: [{ x: 360, y: 180 }, { x: 360, y: 540 }], speed: 90 },
      { waypoints: [{ x: 700, y: 540 }, { x: 700, y: 180 }], speed: 90 },
      { waypoints: [{ x: 1020, y: 180 }, { x: 1020, y: 540 }], speed: 90 },
    ],
    sonars: [
      { x: 460, y: 32, baseAngle: Math.PI / 2, arc: 0.55, period: 5, range: 250 },
      { x: 820, y: 688, baseAngle: -Math.PI / 2, arc: 0.55, period: 6, range: 250 },
      { x: 1060, y: 32, baseAngle: Math.PI / 2, arc: 0.5, period: 4.5, range: 250 },
    ],
  },
];
