// Midnight Vault — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The thief: a circle that slides along walls. Sneaking is slower but halves detection. */
export const PLAYER = {
  radius: 13,
  speed: 230,
  sneakSpeed: 120,
};

export const LIVES = 3;

/** A guard walks its waypoints, pauses at each, and watches a cone in front of it. */
export const GUARD = {
  radius: 14,
  patrolSpeed: 80,
  chaseSpeed: 250,
  visionRange: 250,
  /** Half of the vision cone's angle, in radians. */
  visionHalfAngle: 0.6,
  /** Seconds a guard waits at each waypoint before walking on. */
  pauseAtWaypoint: 0.8,
  /** How fast suspicion (0..1) grows while the thief is inside the cone and in sight. */
  detectNear: 1.25,
  detectFar: 0.6,
  /** Seconds without sight before a chasing guard gives up and goes back to patrol. */
  loseSightSeconds: 3,
  /** Radius inside which a chasing guard catches the thief. */
  catchRadius: 26,
};

/** A wall camera sweeps its cone back and forth; the jammer switches it off for a while. */
export const CAMERA = {
  range: 250,
  halfAngle: 0.5,
  /** Alarm points per second while the thief stands in a live camera cone. */
  alarmPerSecond: 30,
};

/** The alarm meter (0..100) and what feeds it. */
export const ALARM = {
  max: 100,
  /** Alarm points per second while any guard has the thief in sight. */
  guardPerSecond: 18,
  /** Alarm points drained per second while nobody sees the thief. */
  decayPerSecond: 4,
  /** Score lost when the alarm tops out and the building locks down. */
  lockdownPenalty: 100,
  /** Where the meter resets to after a lockdown. */
  lockdownReset: 55,
  /** Seconds guards hunt the thief after a lockdown. */
  lockdownHuntSeconds: 4,
};

/** Loot kinds and what each is worth. */
export const LOOT = {
  cash: { value: 100, label: 'Cash' },
  paint: { value: 250, label: 'Painting' },
  gem: { value: 500, label: 'Diamond' },
  vault: { value: 1000, label: 'Vault gold' },
};

/** Jammer charges per level; one charge kills every camera for this long. */
export const JAMMER = { charges: 2, disableSeconds: 8 };

/** Score for clearing a level: this many points per second left on the clock. */
export const TIME_BONUS_PER_SECOND = 5;

export const PALETTE = {
  backdrop: '#0b0e14',
  floor: '#171c26',
  floorGrid: '#1e2534',
  wall: '#3a4358',
  wallTop: '#4d5878',
  player: '#ffd166',
  playerSneak: '#e8b64c',
  guard: '#e5534b',
  guardCone: 'rgba(229, 83, 75, 0.20)',
  guardConeChase: 'rgba(229, 83, 75, 0.38)',
  camera: '#ff5d8f',
  cameraCone: 'rgba(255, 93, 143, 0.18)',
  loot: '#f2c94c',
  exit: '#3ddc84',
  exitDark: '#1d7a4a',
  text: '#eef1f5',
  muted: '#8b93a3',
  panel: '#202634',
  alarm: '#ff4d4d',
  alarmTrack: '#33202a',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'midnight-vault.best';
