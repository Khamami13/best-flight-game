// Skyhawk — tuning numbers and colours in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below
// depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Runway the flight starts on: straight, flat, this many metres long. */
export const RUNWAY_LENGTH = 900;
/** Rotation speed: below this the aircraft cannot climb off the runway. */
export const ROTATE_SPEED = 135;
/** Stall speed: below this, lift fades and the nose drops. */
export const STALL_SPEED = 95;

export const PLANE = {
  /** Lateral position, metres from the runway centreline; the corridor is +-140. */
  xMin: -140,
  xMax: 140,
  altMin: 0,
  /** Ceiling, metres. */
  altMax: 340,
  /** Speeds in knots. */
  speedMin: 0,
  speedMax: 340,
  /** Knots per second gained at full throttle, lost at idle. */
  accel: 26,
  drag: 7,
  /** Degrees per second of pitch/roll authority at full deflection. */
  pitchRate: 14,
  rollRate: 55,
  /** Heading change, deg/s, per degree of bank (turn coordination). */
  turnRate: 0.42,
  /** Lateral drift, m/s, per degree of bank. */
  driftRate: 1.6,
  /** Climb, m/s, per degree of pitch at flying speed. */
  climbRate: 1.9,
  /** Hull lost on one obstacle strike; three strikes end the flight. */
  hitDamage: 34,
  invulnerable: 1.6,
};

export const RING = {
  radius: 24,
  /** Metres between successive rings. */
  spacing: 430,
  spacingJitter: 140,
  points: 100,
  /** How far ahead (metres) rings and obstacles are generated. */
  ahead: 1600,
};

export const OBSTACLE = {
  /** Peak / tower height range, metres above the ground. */
  minHeight: 55,
  maxHeight: 190,
  /** Collision radius, metres. */
  radius: 16,
  /** Chance an interval between rings also holds an obstacle (grows with level). */
  baseChance: 0.45,
  perLevel: 0.07,
  maxChance: 0.85,
};

/** Seconds of flight per level; speeds and spawn rates stop growing at the last level. */
export const LEVEL = { seconds: 30, max: 10 };

export const PALETTE = {
  skyTop: '#1b4d8a',
  skyMid: '#5ea3d8',
  skyLow: '#bfe0f2',
  sun: '#fff3c4',
  groundFar: '#5d7a4a',
  groundNear: '#3e5c33',
  groundDark: '#2c4426',
  mountainFar: '#6b7f8e',
  mountainNear: '#46586a',
  runway: '#3a3f47',
  runwayEdge: '#f5f5f5',
  runwayLine: '#ffd94d',
  ringNear: '#ffd94d',
  ringFar: '#37c8e8',
  ringPassed: '#7ee787',
  planeBody: '#dfe6ee',
  planeDark: '#8fa3b8',
  planeAccent: '#e5534b',
  planeGlass: '#17324a',
  hud: '#eef6ff',
  hudDim: '#a9c4de',
  hudWarn: '#ffb454',
  hudBad: '#ff6b5e',
  panel: 'rgba(10, 22, 38, 0.88)',
  panelEdge: '#37c8e8',
  text: '#eef1f5',
  muted: '#a9c4de',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyhawk.best';
