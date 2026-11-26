// The flight rules and state, with no drawing and no browser in it: the aircraft
// (altitude, speed, throttle, pitch, roll, heading, lateral position, distance),
// the rings ahead, the mountain peaks and towers, spawning, collisions, score,
// hull and level. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react without the world knowing about screens or sound.
//
// The aircraft starts on the runway at 0 knots: throttle up, rotate past 135 kt
// and climb. Rings ahead are worth 100 points; every 50 m flown is 1 point.
// Hitting a peak or tower costs 34 hull; flying into the ground ends the flight.
// Speed and obstacle density rise with level.
import { LEVEL, OBSTACLE, PLANE, RING, ROTATE_SPEED, RUNWAY_LENGTH, STALL_SPEED } from './config.js';

export const KIND_RING = 0;
export const KIND_PEAK = 1;
export const KIND_TOWER = 2;

export const EVENT_RING = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_LEVEL = 8;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createWorld(random) {
  const plane = {
    x: 0, alt: 0, speed: 0, throttle: 0, pitch: 0, roll: 0, heading: 0,
    distance: 0, hull: 100, invulnerable: 0, airborne: false, shake: 0,
  };
  // Rings and obstacles ahead, each { active, kind, x, alt, z, height, passed, hit }.
  // z is absolute distance along the route; the plane's distance grows toward it.
  const items = [];
  for (let i = 0; i < 48; i += 1) {
    items.push({ active: false, kind: KIND_RING, x: 0, alt: 0, z: 0, height: 0, passed: false, hit: false });
  }
  // Seeded ridge line for the terrain silhouette: 24 peaks around the route.
  const ridges = [];
  for (let i = 0; i < 24; i += 1) ridges.push(0.25 + random() * 0.75);
  // Seeded clouds: { x (lateral, -1..1), alt, z (cyclic), size }.
  const clouds = [];
  for (let i = 0; i < 14; i += 1) {
    clouds.push({ x: random() * 2 - 1, alt: 180 + random() * 140, z: random() * 1600, size: 40 + random() * 70 });
  }
  const state = {
    plane, items, ridges, clouds,
    score: 0, rings: 0, level: 1, elapsed: 0,
    nextRingZ: RUNWAY_LENGTH + 260, nextSpawnZ: RUNWAY_LENGTH + 260,
    distanceScore: 0, combo: 0, bestCombo: 0, message: '', messageT: 0,
  };

  function reset() {
    plane.x = 0; plane.alt = 0; plane.speed = 0; plane.throttle = 0;
    plane.pitch = 0; plane.roll = 0; plane.heading = 0; plane.distance = 0;
    plane.hull = 100; plane.invulnerable = 0; plane.airborne = false; plane.shake = 0;
    for (const item of items) { item.active = false; item.passed = false; item.hit = false; }
    state.score = 0; state.rings = 0; state.level = 1; state.elapsed = 0;
    state.nextRingZ = RUNWAY_LENGTH + 260; state.nextSpawnZ = RUNWAY_LENGTH + 260;
    state.distanceScore = 0; state.combo = 0; state.bestCombo = 0;
    state.message = ''; state.messageT = 0;
    spawnAhead();
  }

  function freeItem() {
    for (let i = 0; i < items.length; i += 1) if (!items[i].active) return items[i];
    return null;
  }

  function spawnRing(z) {
    const item = freeItem();
    if (item === null) return;
    item.active = true; item.kind = KIND_RING; item.passed = false; item.hit = false;
    item.x = (random() * 2 - 1) * 85;
    item.alt = 70 + random() * 180;
    item.z = z; item.height = 0;
  }

  function spawnObstacle(z) {
    const item = freeItem();
    if (item === null) return;
    const tower = random() < 0.35;
    item.active = true; item.kind = tower ? KIND_TOWER : KIND_PEAK; item.passed = false; item.hit = false;
    item.x = (random() * 2 - 1) * 120;
    item.z = z;
    item.height = OBSTACLE.minHeight + random() * (OBSTACLE.maxHeight - OBSTACLE.minHeight);
    // Towers are thin and tall; peaks are wide. alt is unused for obstacles.
    item.alt = 0;
  }

  /** Keep rings/obstacles generated up to RING.ahead metres in front of the plane. */
  function spawnAhead() {
    while (state.nextSpawnZ < plane.distance + RING.ahead) {
      const z = state.nextSpawnZ;
      spawnRing(z);
      const chance = Math.min(OBSTACLE.maxChance, OBSTACLE.baseChance + OBSTACLE.perLevel * (state.level - 1));
      if (random() < chance) spawnObstacle(z + 120 + random() * 200);
      state.nextSpawnZ = z + RING.spacing + random() * RING.spacingJitter;
    }
  }

  function flash(message) {
    state.message = message;
    state.messageT = 1.6;
  }

  /**
   * One fixed step. `ctrl` is { pitch: -1..1, roll: -1..1, throttle: -1..1 }.
   * With `harmless` set (the title screen's backdrop) the plane taxis down the
   * runway and the world scrolls, but nothing scores and nothing can crash.
   */
  function step(dt, ctrl, harmless) {
    let events = 0;
    state.elapsed += dt;
    const level = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));
    if (level !== state.level) {
      state.level = level;
      if (!harmless) { events |= EVENT_LEVEL; flash(`LEVEL ${level} — FASTER TRAFFIC`); }
    }
    if (state.messageT > 0) state.messageT = Math.max(0, state.messageT - dt);
    if (plane.shake > 0) plane.shake = Math.max(0, plane.shake - dt * 2.2);
    if (plane.invulnerable > 0) plane.invulnerable = Math.max(0, plane.invulnerable - dt);

    // --- throttle and speed: faster at higher levels, drag grows with speed.
    plane.throttle = clamp(plane.throttle + ctrl.throttle * dt * 0.9, 0, 1);
    const targetSpeed = plane.throttle * (PLANE.speedMax - 18 * (state.level - 1) * 0 + 8 * (state.level - 1));
    const accel = plane.throttle > 0.05
      ? PLANE.accel * plane.throttle
      : -PLANE.drag * 2.2;
    plane.speed = clamp(plane.speed + accel * dt - plane.speed * 0.012 * dt, PLANE.speedMin, PLANE.speedMax);
    if (harmless) {
      // Title backdrop: a gentle taxi that never leaves the runway.
      plane.throttle = 0.55;
      plane.speed = Math.min(plane.speed, 90);
    }
    void targetSpeed;

    // --- attitude: pitch and roll ease toward the commanded deflection.
    const pitchTarget = ctrl.pitch * 13;
    const rollTarget = clamp(ctrl.roll * 55, -60, 60);
    plane.pitch += clamp(pitchTarget - plane.pitch, -PLANE.pitchRate * dt * 2.4, PLANE.pitchRate * dt * 2.4);
    plane.roll += clamp(rollTarget - plane.roll, -PLANE.rollRate * dt * 2.4, PLANE.rollRate * dt * 2.4);
    // Banking turns the aircraft: heading follows roll, and the nose drifts sideways.
    plane.heading += plane.roll * PLANE.turnRate * dt;
    plane.x = clamp(plane.x + plane.roll * PLANE.driftRate * dt + Math.sin((plane.heading * Math.PI) / 180) * plane.speed * 0.28 * dt, PLANE.xMin, PLANE.xMax);
    plane.heading = ((plane.heading + 540) % 360) - 180;

    // --- lift: climb with pitch once past rotation speed; stall below it.
    const flying = plane.speed > ROTATE_SPEED;
    if (!plane.airborne && flying && plane.pitch > 2) plane.airborne = true;
    if (plane.airborne || plane.alt > 0) {
      const lift = plane.speed < STALL_SPEED ? 0.25 : 1;
      plane.alt += plane.pitch * PLANE.climbRate * lift * dt * (0.35 + plane.speed / 220);
      if (plane.alt <= 0 && plane.distance > RUNWAY_LENGTH) {
        // Ran out of runway on the ground: the flight is over.
        if (!harmless) {
          plane.alt = 0;
          plane.airborne = false;
          plane.hull = 0;
          events |= EVENT_OVER;
          return events;
        }
      }
      plane.alt = clamp(plane.alt, PLANE.altMin, PLANE.altMax);
      if (plane.alt === 0 && plane.distance <= RUNWAY_LENGTH) plane.airborne = false;
    }

    // --- forward motion and distance points.
    const metres = (plane.speed * 0.514444) * dt; // knots to m/s
    plane.distance += metres;
    if (!harmless) {
      state.distanceScore += metres;
      const whole = Math.floor(state.distanceScore / 50);
      if (whole > 0) {
        state.score += whole;
        state.distanceScore -= whole * 50;
      }
    }

    spawnAhead();

    // --- clouds drift past and recycle ahead.
    for (const cloud of clouds) {
      cloud.z -= metres;
      if (cloud.z < plane.distance - 200) {
        cloud.z = plane.distance + 1400 + random() * 400;
        cloud.x = random() * 2 - 1;
        cloud.alt = 180 + random() * 140;
      }
    }

    // --- rings and obstacles: pass, collect, or collide.
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item.active) continue;
      const dz = item.z - plane.distance;
      if (dz < -80) { item.active = false; continue; }
      if (dz > 0 || item.passed) continue;
      item.passed = true;
      if (item.kind === KIND_RING) {
        const dx = item.x - plane.x;
        const dy = item.alt - plane.alt;
        const dist = Math.hypot(dx, dy);
        if (!harmless && dist < RING.radius) {
          state.rings += 1;
          state.combo += 1;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          const bonus = RING.points + (state.combo - 1) * 25;
          state.score += bonus;
          events |= EVENT_RING;
          flash(state.combo > 1 ? `RING +${bonus}  —  COMBO x${state.combo}` : `RING +${bonus}`);
        } else if (!harmless) {
          state.combo = 0;
        }
        item.active = false;
      } else if (!harmless && !item.hit) {
        // Obstacle just drew level with the plane: is the plane inside it?
        const dx = item.x - plane.x;
        const clearance = item.kind === KIND_TOWER ? OBSTACLE.radius * 0.7 : OBSTACLE.radius;
        if (Math.abs(dx) < clearance && plane.alt < item.height && plane.alt > 0) {
          item.hit = true;
          if (plane.invulnerable === 0) {
            plane.hull -= PLANE.hitDamage;
            plane.invulnerable = PLANE.invulnerable;
            plane.shake = 1;
            state.combo = 0;
            events |= EVENT_HIT;
            flash(plane.hull > 0 ? 'HIT! HULL DAMAGED' : 'CRASH!');
            if (plane.hull <= 0) {
              plane.hull = 0;
              plane.airborne = false;
              events |= EVENT_OVER;
              return events;
            }
          }
        }
        item.active = false;
      } else {
        item.active = false;
      }
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
