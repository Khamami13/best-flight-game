// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (full throttle, bank toward the next ring, pitch toward its
// altitude, climb over a peak or tower dead ahead), so the frame is what a real
// flight looks like and the same seed always gives the same frame. The end
// scene's pilot flies the rings but ignores the obstacles, then — if it is
// somehow still flying — dives for the terrain, so the frame is a real crash
// and a real game-over screen.
import { STEP } from './config.js';
import { EVENT_OVER, KIND_RING } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 34;
const END_LIMIT_SECONDS = 300;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function nearestRing(state) {
  let best = null;
  for (const item of state.items) {
    if (!item.active || item.kind !== KIND_RING || item.passed) continue;
    const dz = item.z - state.plane.distance;
    if (dz <= 0) continue;
    if (best === null || dz < best.z - state.plane.distance) best = item;
  }
  return best;
}

function nearestThreat(state) {
  let best = null;
  for (const item of state.items) {
    if (!item.active || item.kind === KIND_RING || item.passed) continue;
    const dz = item.z - state.plane.distance;
    if (dz <= 0 || dz > 380) continue;
    if (best === null || dz < best.z - state.plane.distance) best = item;
  }
  return best;
}

/** Steer toward the next ring; climb over a threat dead ahead unless reckless. */
function autopilot(state, reckless) {
  const plane = state.plane;
  const ring = nearestRing(state);
  let pitch = 0;
  let roll = 0;
  if (ring !== null) {
    pitch = clamp((ring.alt - plane.alt) / 45, -1, 1);
    roll = clamp((ring.x - plane.x) / 45, -1, 1);
  }
  if (plane.speed < 140) pitch = Math.max(pitch, 0.6); // rotate and climb off the runway
  if (!reckless) {
    const threat = nearestThreat(state);
    if (threat !== null) {
      const dx = threat.x - plane.x;
      if (Math.abs(dx) < 30 && plane.alt < threat.height + 18) {
        if (threat.height < 260) pitch = 1; // climb over it
        else roll = dx >= 0 ? -1 : 1; // too tall: bank away
      }
    }
  }
  const throttle = plane.speed > 305 ? 0 : 1;
  return { pitch, roll, throttle };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { pitch: 0, roll: 0, throttle: 0 }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const reckless = name === 'end';
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  let over = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    let ctrl = autopilot(world.state, reckless);
    // The end scene's pilot, still alive after the reckless run, dives for the terrain.
    if (reckless && i > 150 * 60) ctrl = { pitch: -1, roll: 0, throttle: 0 };
    if (world.step(STEP, ctrl, false) & EVENT_OVER) { over = true; break; }
  }
  if (reckless && !over) {
    // Last resort: keep diving until the terrain ends it (bounded, never infinite).
    for (let i = 0; i < 60 * 60; i += 1) {
      if (world.step(STEP, { pitch: -1, roll: 0, throttle: 0 }, false) & EVENT_OVER) { over = true; break; }
    }
  }
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
