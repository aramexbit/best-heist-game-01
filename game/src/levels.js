// The three dive sites. Each level is one stretch of seabed the diver crosses in a
// single 1280x720 frame: rocks are cover (and block sight), kelp beds hide the
// diver from sharks and sonar without blocking the swim, treasure is spread so the
// diver must choose a route, sharks swim fixed patrols, and sonar cameras sweep the
// chokepoints. Entry is always on the left edge, the whirlpool on the right edge.
//
// Walls come in three kinds, all with the same rectangle collision the renderer
// draws inside of — so what you see is what blocks you:
//   block  — ruined stone-block walls (the old look), long and straight;
//   rock   — boulder clusters, irregular lumps of coral rock in varied sizes;
//   pillar — tall narrow stone columns that split a corridor in two.
// The layouts are tighter than the first version: narrower corridors, more turns,
// dead-end pockets and alternate routes, so the diver has to read the patrols
// instead of swimming straight across. The probe-verified anchors stay put: the
// level-1 mid pillar, the kelp beds the probe hides in, and the sonar sight-line
// the alarm scene parks on.

function rock(x, y, w, h, kind) {
  return { x, y, w, h, kind: kind || 'block' };
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
    hint: 'One shark, one sonar camera. Learn the cones, slow the shark with the harpoon (Space) if it spots you — but it will know where you are — take the pearl, then dive into the whirlpool.',
    timeLimit: 120,
    entry: { x: 64, y: 360 },
    exit: { x: 1172, y: 300, w: 64, h: 120 },
    walls: [
      ...BORDER,
      rock(280, 120, 180, 36),
      rock(280, 564, 180, 36),
      rock(560, 300, 36, 140, 'pillar'),
      rock(820, 120, 180, 36),
      rock(820, 564, 180, 36),
      rock(700, 230, 80, 54, 'rock'),
      rock(700, 440, 80, 54, 'rock'),
      rock(180, 280, 56, 44, 'rock'),
      rock(980, 300, 36, 110, 'pillar'),
      rock(1080, 180, 60, 44, 'rock'),
      // Rock pass: four more boulder clusters, so the reef is denser and the
      // chase has more corners to break around — the loot, kelp and whirlpool
      // stay reachable, and the mid pillar anchor is untouched. (Rocks 4 → 8.)
      rock(120, 300, 56, 44, 'rock'),
      rock(360, 460, 64, 48, 'rock'),
      rock(760, 170, 60, 48, 'rock'),
      rock(880, 420, 64, 48, 'rock'),
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
    hint: 'Two sharks cross the wreck and they bite now — dodge the wind-up, hide in the kelp, or slow one with the harpoon — but it will know where you are. The sapphire sits in the middle.',
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
      rock(620, 120, 70, 50, 'rock'),
      rock(620, 560, 70, 50, 'rock'),
      rock(930, 340, 36, 100, 'pillar'),
      rock(300, 280, 56, 44, 'rock'),
      rock(1080, 120, 64, 48, 'rock'),
      // Rock pass: four more boulder clusters — the wreck is denser now, with
      // more corners to break a chase around. Loot, kelp and whirlpool stay open.
      // (Rocks 4 → 8.)
      rock(160, 180, 56, 44, 'rock'),
      rock(440, 420, 64, 48, 'rock'),
      rock(700, 420, 64, 48, 'rock'),
      rock(1080, 420, 56, 44, 'rock'),
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
    hint: 'Three sharks, three sonar cameras, one chest of gold. Ink the cameras, slow the sharks with the harpoon (each hit gives away your position), swim, and escape through the whirlpool.',
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
      rock(540, 90, 60, 48, 'rock'),
      rock(540, 590, 60, 48, 'rock'),
      rock(960, 320, 36, 100, 'pillar'),
      rock(740, 330, 64, 50, 'rock'),
      rock(240, 280, 56, 46, 'rock'),
      // Rock pass: five more boulder clusters — the trench is the densest dive
      // now, with a rock to break line of sight almost everywhere. Loot, kelp
      // and whirlpool stay reachable, and no patrol lane is blocked.
      // (Rocks 4 → 9.)
      rock(120, 180, 56, 44, 'rock'),
      rock(380, 120, 56, 44, 'rock'),
      rock(800, 120, 56, 44, 'rock'),
      rock(260, 500, 56, 44, 'rock'),
      rock(1080, 440, 64, 48, 'rock'),
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
