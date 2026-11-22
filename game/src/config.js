// Sunken Vault — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
//
// Skin rules (learned from the Fathom kits and the mermaid-food-truck art doc):
// one shared palette, everything lit from above (tops lighter, bottoms darker),
// and a sub-palette per depth: the reef is bright and warm, the wreck is muted,
// the trench is dark with bioluminescent glows.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The diver: a circle that swims along the rocks. Slow swimming halves detection. */
export const DIVER = {
  radius: 13,
  speed: 230,
  sneakSpeed: 120,
};

export const LIVES = 3;

/** A shark patrols its waypoints, pauses at each, and hunts with a sense cone. */
export const SHARK = {
  radius: 14,
  patrolSpeed: 80,
  chaseSpeed: 250,
  visionRange: 250,
  /** Half of the sense cone's angle, in radians. */
  visionHalfAngle: 0.6,
  /** Seconds a shark waits at each waypoint before swimming on. */
  pauseAtWaypoint: 0.8,
  /** How fast suspicion (0..1) grows while the diver is inside the cone and in sight. */
  detectNear: 1.25,
  detectFar: 0.6,
  /** Radius inside which a chasing shark catches the diver. */
  catchRadius: 26,
  /** A shark only hurts the diver with a telegraphed attack, never by touch:
   * inside this range, with clear sight, it winds up (0.5s warning) and then
   * lunges. Dodging during the wind-up, ducking into kelp, or blinding it
   * with ink all break the attack. */
  attackRange: 110,
  /** Seconds the shark telegraphs before it lunges: it rears, shakes and its
   * jaws start to open, so the diver has time to dodge or hide. */
  windupSeconds: 0.5,
  /** Seconds a lunge lasts, and how fast the shark shoots forward. */
  lungeSeconds: 0.35,
  lungeSpeed: 430,
  /** Seconds after a lunge before the same shark can attack again. */
  attackCooldownSeconds: 2.5,
  /** Seconds of no sight while chasing before the shark gives up and goes
   * back to patrol — hiding in kelp or breaking line of sight around a rock
   * really does lose it. */
  blindGiveUpSeconds: 1.5,
};

/** The diver's harpoon gun: Space fires toward the mouse cursor (or the way the
 * diver faces when there is no cursor yet). A hit is a trade-off: the shark
 * learns exactly where the diver is and comes hunting — but every hit slows
 * that shark down, 12% per hit up to 60% off, for the rest of the dive. It
 * never kills, so the reef stays dangerous. Ammo is unlimited but the gun
 * needs a short cooldown between shots. Five hits reach the cap, so a
 * much-shot shark swims at 40% speed. */
export const HARPOON = {
  speed: 520,
  range: 420,
  radius: 6,
  cooldownSeconds: 1.5,
  /** Swim speed lost per harpoon hit, and the most a shark can lose. */
  slowPerHit: 0.12,
  maxSlow: 0.6,
};

/** A sonar camera on the seabed sweeps its cone back and forth; the ink burst switches it off for a while. */
export const SONAR = {
  range: 250,
  halfAngle: 0.5,
  /** Alarm points per second while the diver stands in a live sonar cone. */
  alarmPerSecond: 30,
};

/** The alarm meter (0..100) and what feeds it. */
export const ALARM = {
  max: 100,
  /** Alarm points per second while any shark has the diver in sight. */
  sharkPerSecond: 18,
  /** Alarm points drained per second while nobody sees the diver. */
  decayPerSecond: 4,
  /** Score lost when the alarm tops out and the whole reef goes on alert. */
  lockdownPenalty: 100,
  /** Where the meter resets to after a lockdown. */
  lockdownReset: 55,
  /** Seconds sharks hunt the diver after a lockdown. */
  lockdownHuntSeconds: 4,
};

/** Treasure kinds and what each is worth. */
export const LOOT = {
  coins: { value: 100, label: 'Gold coins' },
  pearl: { value: 250, label: 'Pearl' },
  gem: { value: 500, label: 'Sapphire' },
  chest: { value: 1000, label: 'Treasure chest' },
};

/** Ink burst charges per level; one charge blinds every sonar camera for this long. */
export const INK = { charges: 2, disableSeconds: 8 };

/** Score for clearing a level: this many points per second left on the clock. */
export const TIME_BONUS_PER_SECOND = 5;

/** One sub-palette per depth, from the Fathom seas: Sunlit Shallows (reef),
 * Shipwreck (wreck) and Midnight Zone (trench). The water darkens with depth,
 * reds fade, and the trench gets its colours back from bioluminescent glows. */
export const THEMES = {
  reef: {
    waterTop: '#0e5a6e',
    waterBottom: '#04283a',
    pebble: '#8b98a8',
    pebbleDark: '#5d6878',
    rockShade: '#33322a',
    stoneFace: '#5d6f83',
    stoneSide: '#2e3947',
    stoneMortar: '#222b36',
    corals: ['#ff8a7a', '#ff6b9d', '#ffb347', '#c77dff'],
    rock: '#4b4a3e',
    rockTop: '#6d7a68',
    rockEdge: '#2e2d24',
    kelp: '#1f7a4d',
    kelpDark: '#145c38',
    coral: '#ff8a7a',
    coral2: '#ffb347',
    glow: '#ffe9a8',
    shaft: 'rgba(255, 233, 168, 0.10)',
  },
  wreck: {
    waterTop: '#0a3d4e',
    waterBottom: '#03141f',
    pebble: '#767e8c',
    pebbleDark: '#525864',
    rockShade: '#2a2721',
    stoneFace: '#525a66',
    stoneSide: '#272d36',
    stoneMortar: '#1e232b',
    corals: ['#c97b4a', '#8fa8bd', '#d98a7a', '#7a9e8f'],
    rock: '#3d3a33',
    rockTop: '#5c5648',
    rockEdge: '#26241f',
    kelp: '#1a5c38',
    kelpDark: '#123f27',
    coral: '#c97b4a',
    coral2: '#8fa8bd',
    glow: '#ffd166',
    shaft: 'rgba(190, 220, 230, 0.07)',
  },
  trench: {
    waterTop: '#061a2e',
    waterBottom: '#010610',
    pebble: '#57647a',
    pebbleDark: '#39424f',
    rockShade: '#161c26',
    stoneFace: '#42506a',
    stoneSide: '#202838',
    stoneMortar: '#18202c',
    corals: ['#5ff2e0', '#7ee7ff', '#b388ff', '#4dd0e1'],
    rock: '#232a35',
    rockTop: '#3a4556',
    rockEdge: '#141920',
    kelp: '#0f4a30',
    kelpDark: '#0a3522',
    coral: '#5ff2e0',
    coral2: '#7ee7ff',
    glow: '#5ff2e0',
    shaft: 'rgba(95, 242, 224, 0.05)',
  },
};

export const PALETTE = {
  backdrop: '#03101c',
  diver: '#ffb347',
  diverSneak: '#e89b3c',
  diverSuit: '#1c2b3a',
  shark: '#7d99ad',
  sharkDark: '#5a7080',
  sharkBelly: '#cfe3ee',
  sharkFin: '#4a5d6e',
  sharkEye: '#ff3b30',
  sharkEyeGlow: 'rgba(255, 59, 48, 0.5)',
  sharkScar: 'rgba(220, 235, 245, 0.75)',
  sharkTeeth: '#ffffff',
  harpoon: '#d8dee6',
  harpoonLine: 'rgba(216, 222, 230, 0.7)',
  sharkCone: 'rgba(126, 200, 255, 0.28)',
  sharkConeChase: 'rgba(255, 59, 48, 0.45)',
  sonar: '#ff5a4d',
  sonarCone: 'rgba(255, 59, 48, 0.25)',
  sonarConeHot: 'rgba(255, 170, 40, 0.40)',
  sonarDome: '#bfe8ff',
  loot: '#f2c94c',
  exit: '#7ee7ff',
  exitDark: '#5b4bc4',
  whirl: '#7ee7ff',
  whirl2: '#b388ff',
  text: '#eef1f5',
  muted: '#9fb4c0',
  panel: '#0e2233',
  alarm: '#ff4d4d',
  alarmTrack: '#33202a',
  gold: '#f2c94c',
  bubble: 'rgba(200, 235, 245, 0.55)',
  ink: 'rgba(20, 12, 40, 0.55)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sunken-vault.best';
