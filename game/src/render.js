// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. A pseudo-3D chase view: the sky, a banking horizon,
// perspective ground strips, the runway while it lasts, glowing rings and peaks
// projected from the world ahead, the jet drawn from behind, and a lit HUD with
// ALT / SPD / HDG plus throttle, hull and an artificial-horizon gauge.
import { FIELD, FONT, PALETTE, RING, RUNWAY_LENGTH, STALL_SPEED } from './config.js';
import { KIND_PEAK, KIND_RING, KIND_TOWER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 150, line: 32, bottom: 72 };
/** Perspective factor: bigger means a wider view of the world ahead. */
const FOCAL = 760;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const ringsLabel = cachedLabel('RINGS ');
  const levelLabel = cachedLabel('LEVEL ');
  const bestLabel = cachedLabel('BEST ');
  const finalLabel = cachedLabel('FINAL SCORE ');
  const spdLabel = cachedLabel('');
  const altLabel = cachedLabel('');
  const hdgLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }
  function plain(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size + 1000)) fonts.set(size + 1000, `${size}px ${FONT}`);
    context.font = fonts.get(size + 1000);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Project a world point (lateral x, altitude, absolute z) to screen space. */
  function project(state, x, alt, z) {
    const plane = state.plane;
    const dz = z - plane.distance;
    if (dz < 8) return null;
    const horizonY = 360 - plane.pitch * 7;
    const cx = FIELD.width / 2 - plane.heading * 6 - plane.x * 0.9;
    return {
      x: cx + ((x - plane.x) * FOCAL) / dz,
      y: horizonY - ((alt - plane.alt) * FOCAL) / dz,
      s: FOCAL / dz,
      dz,
    };
  }

  function drawSky(state) {
    const plane = state.plane;
    const horizonY = 360 - plane.pitch * 7;
    // Sky above the horizon, ground below it: both follow the pitch, so the
    // horizon never cuts through the wrong colour band.
    const sky = context.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.65, PALETTE.skyMid);
    sky.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = sky;
    context.fillRect(0, 0, FIELD.width, Math.max(0, horizonY));
    const ground = context.createLinearGradient(0, horizonY, 0, FIELD.height);
    ground.addColorStop(0, PALETTE.groundFar);
    ground.addColorStop(1, PALETTE.groundNear);
    context.fillStyle = ground;
    context.fillRect(0, Math.max(0, horizonY), FIELD.width, FIELD.height - Math.max(0, horizonY));
    // Sun, fixed up-left of the sky.
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(1050, 110, 34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255, 243, 196, 0.35)';
    context.beginPath();
    context.arc(1050, 110, 52, 0, Math.PI * 2);
    context.fill();
    // Clouds ahead, projected.
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (const cloud of state.clouds) {
      const p = project(state, cloud.x * 320, cloud.alt, cloud.z);
      if (p === null || p.y > horizonY + 40) continue;
      const r = Math.max(4, cloud.size * p.s * 0.55);
      context.beginPath();
      context.ellipse(p.x, p.y, r * 1.8, r * 0.55, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawTerrain(state) {
    const plane = state.plane;
    const horizonY = 360 - plane.pitch * 7;
    const cx = FIELD.width / 2 - plane.heading * 6 - plane.x * 0.9;
    // Far mountain silhouette, shifting with heading.
    context.fillStyle = PALETTE.mountainFar;
    context.beginPath();
    context.moveTo(0, horizonY);
    for (let i = 0; i <= 24; i += 1) {
      const rx = (i / 24) * FIELD.width;
      const peak = state.ridges[(i + Math.floor(plane.heading / 15) + 24) % 24];
      context.lineTo(rx, horizonY - 30 - peak * 110);
    }
    context.lineTo(FIELD.width, horizonY);
    context.closePath();
    context.fill();
    // Near ridge, lower and darker.
    context.fillStyle = PALETTE.mountainNear;
    context.beginPath();
    context.moveTo(0, horizonY);
    for (let i = 0; i <= 16; i += 1) {
      const rx = (i / 16) * FIELD.width;
      const peak = state.ridges[(i * 2 + 5 + Math.floor(plane.heading / 9) + 48) % 24];
      context.lineTo(rx, horizonY - 8 - peak * 52);
    }
    context.lineTo(FIELD.width, horizonY);
    context.closePath();
    context.fill();
    // Ground: perspective strips rushing toward the viewer with distance.
    const strip = 90;
    const off = plane.distance % strip;
    context.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    context.lineWidth = 2;
    for (let k = 0; k < 9; k += 1) {
      const z = plane.distance + off + k * strip;
      const pL = project(state, -160, 0, z);
      const pR = project(state, 160, 0, z);
      if (pL === null || pR === null) continue;
      context.beginPath();
      context.moveTo(pL.x, pL.y);
      context.lineTo(pR.x, pR.y);
      context.stroke();
    }
    // Ground grid lines converging on the vanishing point.
    context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    for (const gx of [-120, -60, 0, 60, 120]) {
      const near = project(state, gx, 0, plane.distance + 30);
      const far = project(state, gx, 0, plane.distance + 1500);
      if (near === null || far === null) continue;
      context.beginPath();
      context.moveTo(near.x, near.y);
      context.lineTo(far.x, far.y);
      context.stroke();
    }
    void cx;
  }

  function drawRunway(state) {
    const plane = state.plane;
    if (plane.distance > RUNWAY_LENGTH + 120) return;
    const horizonY = 360 - plane.pitch * 7;
    const cx = FIELD.width / 2 - plane.heading * 6 - plane.x * 0.9;
    const endZ = RUNWAY_LENGTH;
    const end = project(state, 0, 0, endZ);
    if (end === null) return;
    // Near edge: the runway is under/behind the plane, so anchor it wide at the bottom.
    const halfNear = 190;
    const halfEnd = Math.max(6, 26 * end.s);
    context.fillStyle = PALETTE.runway;
    context.beginPath();
    context.moveTo(cx - halfNear, FIELD.height);
    context.lineTo(cx + halfNear, FIELD.height);
    context.lineTo(end.x + halfEnd, end.y);
    context.lineTo(end.x - halfEnd, end.y);
    context.closePath();
    context.fill();
    // Edge lines.
    context.strokeStyle = PALETTE.runwayEdge;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - halfNear, FIELD.height);
    context.lineTo(end.x - halfEnd, end.y);
    context.moveTo(cx + halfNear, FIELD.height);
    context.lineTo(end.x + halfEnd, end.y);
    context.stroke();
    // Centreline dashes, one per 60 m, rushing past.
    context.fillStyle = PALETTE.runwayLine;
    for (let z = Math.floor(plane.distance / 60) * 60; z < RUNWAY_LENGTH; z += 60) {
      const a = project(state, 0, 0, z + 8);
      const b = project(state, 0, 0, z + 34);
      if (a === null || b === null) continue;
      const w = Math.max(2, 3.2 * a.s);
      context.fillRect(a.x - w / 2, b.y, w, a.y - b.y);
    }
    // Threshold bars at the far end.
    context.fillStyle = PALETTE.runwayEdge;
    context.fillRect(end.x - halfEnd, end.y - 4, halfEnd * 2, 4);
    void horizonY;
  }

  function drawWorldObjects(state) {
    const plane = state.plane;
    // Farthest first so nearer objects paint over them.
    const items = state.items.filter((it) => it.active).sort((a, b) => b.z - a.z);
    let nearestRing = null;
    for (const item of items) {
      if (item.kind === KIND_RING && (nearestRing === null || item.z < nearestRing.z)) nearestRing = item;
    }
    for (const item of items) {
      const dz = item.z - plane.distance;
      if (dz < 8 || dz > 1600) continue;
      if (item.kind === KIND_RING) {
        const p = project(state, item.x, item.alt, item.z);
        if (p === null) continue;
        const r = Math.max(3, RING.radius * p.s);
        const near = item === nearestRing;
        context.lineWidth = Math.max(2, r * 0.16);
        context.strokeStyle = near ? PALETTE.ringNear : PALETTE.ringFar;
        context.beginPath();
        context.arc(p.x, p.y, r, 0, Math.PI * 2);
        context.stroke();
        context.lineWidth = Math.max(1, r * 0.05);
        context.strokeStyle = 'rgba(255,255,255,0.7)';
        context.beginPath();
        context.arc(p.x, p.y, r * 0.82, 0, Math.PI * 2);
        context.stroke();
        if (near && dz < 700) {
          plain(`${Math.round(dz)} m`, p.x, p.y - r - 10, 18, PALETTE.ringNear, 'center', 'alphabetic');
        }
      } else if (item.kind === KIND_PEAK) {
        const base = project(state, item.x, 0, item.z);
        const apex = project(state, item.x, item.height, item.z);
        if (base === null || apex === null) continue;
        const half = Math.max(4, 26 * base.s);
        context.fillStyle = '#5a4632';
        context.beginPath();
        context.moveTo(base.x - half, base.y);
        context.lineTo(apex.x, apex.y);
        context.lineTo(base.x + half, base.y);
        context.closePath();
        context.fill();
        context.fillStyle = '#f4f8ff';
        context.beginPath();
        context.moveTo(apex.x - half * 0.32, apex.y + (base.y - apex.y) * 0.3);
        context.lineTo(apex.x, apex.y);
        context.lineTo(apex.x + half * 0.32, apex.y + (base.y - apex.y) * 0.3);
        context.closePath();
        context.fill();
      } else if (item.kind === KIND_TOWER) {
        const base = project(state, item.x, 0, item.z);
        const top = project(state, item.x, item.height, item.z);
        if (base === null || top === null) continue;
        context.strokeStyle = '#c8ccd4';
        context.lineWidth = Math.max(2, 5 * base.s);
        context.beginPath();
        context.moveTo(base.x, base.y);
        context.lineTo(top.x, top.y);
        context.stroke();
        context.strokeStyle = '#8b93a3';
        context.lineWidth = Math.max(1, 2.5 * base.s);
        const midY = (base.y + top.y) / 2;
        context.beginPath();
        context.moveTo(top.x - 14 * base.s, top.y + 8 * base.s);
        context.lineTo(top.x + 14 * base.s, top.y + 8 * base.s);
        context.moveTo(top.x - 10 * base.s, midY);
        context.lineTo(top.x + 10 * base.s, midY);
        context.stroke();
        context.fillStyle = '#ff5a4e';
        context.beginPath();
        context.arc(top.x, top.y, Math.max(2.5, 5 * base.s), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawPlane(state) {
    const plane = state.plane;
    const cx = FIELD.width / 2;
    const cy = 512;
    const blink = plane.invulnerable > 0 && Math.floor(plane.invulnerable * 10) % 2 === 0;
    context.save();
    context.translate(cx, cy);
    context.rotate((plane.roll * Math.PI) / 180);
    if (plane.shake > 0) context.translate((Math.random() - 0.5) * 10 * plane.shake, (Math.random() - 0.5) * 8 * plane.shake);
    if (!blink) {
      // Engine glow.
      const glow = context.createRadialGradient(0, 58, 4, 0, 58, 42);
      glow.addColorStop(0, 'rgba(255, 190, 90, 0.9)');
      glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 58, 42, 0, Math.PI * 2);
      context.fill();
      // Wings (swept back, seen from behind).
      context.fillStyle = PALETTE.planeDark;
      context.beginPath();
      context.moveTo(-14, -6);
      context.lineTo(-168, 34);
      context.lineTo(-168, 48);
      context.lineTo(-12, 22);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(14, -6);
      context.lineTo(168, 34);
      context.lineTo(168, 48);
      context.lineTo(12, 22);
      context.closePath();
      context.fill();
      // Tailplane.
      context.fillStyle = PALETTE.planeDark;
      context.beginPath();
      context.moveTo(-10, -34);
      context.lineTo(-64, -58);
      context.lineTo(-64, -48);
      context.lineTo(-8, -26);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(10, -34);
      context.lineTo(64, -58);
      context.lineTo(64, -48);
      context.lineTo(8, -26);
      context.closePath();
      context.fill();
      // Vertical fin.
      context.fillStyle = PALETTE.planeAccent;
      context.beginPath();
      context.moveTo(-9, -30);
      context.lineTo(0, -78);
      context.lineTo(9, -30);
      context.closePath();
      context.fill();
      // Fuselage.
      const body = context.createLinearGradient(-16, 0, 16, 0);
      body.addColorStop(0, PALETTE.planeDark);
      body.addColorStop(0.5, PALETTE.planeBody);
      body.addColorStop(1, PALETTE.planeDark);
      context.fillStyle = body;
      context.beginPath();
      context.moveTo(-17, 52);
      context.quadraticCurveTo(-19, -20, -11, -44);
      context.quadraticCurveTo(0, -54, 11, -44);
      context.quadraticCurveTo(19, -20, 17, 52);
      context.quadraticCurveTo(0, 62, -17, 52);
      context.closePath();
      context.fill();
      // Canopy.
      context.fillStyle = PALETTE.planeGlass;
      context.beginPath();
      context.ellipse(0, -30, 9, 15, 0, 0, Math.PI * 2);
      context.fill();
      // Red stripe.
      context.fillStyle = PALETTE.planeAccent;
      context.fillRect(-17, 8, 34, 5);
      // Nav lights.
      context.fillStyle = '#ff5a4e';
      context.beginPath();
      context.arc(-168, 41, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#7ee787';
      context.beginPath();
      context.arc(168, 41, 4, 0, Math.PI * 2);
      context.fill();
      // Exhaust.
      context.fillStyle = '#ffb454';
      context.beginPath();
      context.ellipse(0, 56, 7, 5, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    void plane;
  }

  function drawHud(state, best, screen) {
    const plane = state.plane;
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 26, PALETTE.hud, 'left', 'top');
    text(ringsLabel(state.rings), 250, 18, 26, PALETTE.hud, 'left', 'top');
    text(levelLabel(state.level), FIELD.width / 2, 18, 26, PALETTE.hud, 'center', 'top');
    text(bestLabel(best), FIELD.width - 24, 18, 26, PALETTE.hud, 'right', 'top');
    // Primary flight instruments, big and lit, top centre-right.
    const spd = Math.round(plane.speed);
    const alt = Math.round(plane.alt * 3.28084);
    const hdg = Math.round(((plane.heading % 360) + 360) % 360);
    text(`SPD ${spd} KT`, FIELD.width - 24, 52, 24, spd < STALL_SPEED ? PALETTE.hudWarn : PALETTE.hud, 'right', 'top');
    text(`ALT ${alt} FT`, FIELD.width - 24, 82, 24, plane.alt < 30 && plane.airborne ? PALETTE.hudWarn : PALETTE.hud, 'right', 'top');
    text(`HDG ${String(hdg).padStart(3, '0')}°`, FIELD.width - 24, 112, 24, PALETTE.hud, 'right', 'top');
    void spdLabel;
    void altLabel;
    void hdgLabel;
    // Compass strip under the top bar.
    context.fillStyle = 'rgba(10, 22, 38, 0.55)';
    context.fillRect(FIELD.width / 2 - 190, 56, 380, 26);
    context.strokeStyle = PALETTE.hudDim;
    context.lineWidth = 1;
    for (let d = -60; d <= 60; d += 15) {
      const deg = Math.round(((hdg + d) % 360 + 360) % 360);
      const x = FIELD.width / 2 + d * 3;
      context.beginPath();
      context.moveTo(x, 56);
      context.lineTo(x, 66);
      context.stroke();
      if (d % 30 === 0) plain(String(deg).padStart(3, '0'), x, 68, 12, PALETTE.hudDim, 'center', 'top');
    }
    context.fillStyle = PALETTE.ringNear;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 6, 56);
    context.lineTo(FIELD.width / 2 + 6, 56);
    context.lineTo(FIELD.width / 2, 64);
    context.closePath();
    context.fill();
    // Bottom instrument strip.
    context.fillStyle = 'rgba(10, 22, 38, 0.72)';
    context.fillRect(0, 636, FIELD.width, 84);
    context.strokeStyle = 'rgba(55, 200, 232, 0.5)';
    context.beginPath();
    context.moveTo(0, 636);
    context.lineTo(FIELD.width, 636);
    context.stroke();
    // Artificial horizon gauge.
    const gx = 92;
    const gy = 670;
    const gr = 28;
    context.save();
    context.beginPath();
    context.arc(gx, gy, gr, 0, Math.PI * 2);
    context.clip();
    context.translate(gx, gy);
    context.rotate((-plane.roll * Math.PI) / 180);
    context.translate(0, plane.pitch * 1.6);
    context.fillStyle = '#5ea3d8';
    context.fillRect(-gr, -gr, gr * 2, gr);
    context.fillStyle = '#7a5a34';
    context.fillRect(-gr, 0, gr * 2, gr);
    context.fillStyle = '#fff';
    context.fillRect(-gr, -1, gr * 2, 2);
    context.restore();
    context.strokeStyle = PALETTE.hud;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(gx, gy, gr, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.moveTo(gx - 5, gy);
    context.lineTo(gx + 5, gy);
    context.lineTo(gx, gy + 6);
    context.closePath();
    context.fill();
    plain('ATT', gx, gy + gr + 4, 12, PALETTE.hudDim, 'center', 'top');
    // Throttle bar.
    plain('THR', 170, 652, 14, PALETTE.hudDim, 'left', 'top');
    context.fillStyle = '#1d2f45';
    context.fillRect(170, 672, 150, 14);
    context.fillStyle = plane.throttle > 0.85 ? PALETTE.gold : PALETTE.ringFar;
    context.fillRect(170, 672, 150 * plane.throttle, 14);
    plain(`${Math.round(plane.throttle * 100)}%`, 326, 672, 14, PALETTE.hud, 'left', 'top');
    // Hull bar.
    plain('HULL', 430, 652, 14, PALETTE.hudDim, 'left', 'top');
    context.fillStyle = '#1d2f45';
    context.fillRect(430, 672, 150, 14);
    context.fillStyle = plane.hull > 50 ? PALETTE.ringPassed : plane.hull > 25 ? PALETTE.hudWarn : PALETTE.hudBad;
    context.fillRect(430, 672, 150 * (plane.hull / 100), 14);
    plain(`${Math.round(plane.hull)}%`, 586, 672, 14, PALETTE.hud, 'left', 'top');
    // Vertical speed + distance.
    const vs = Math.round(plane.pitch * (plane.speed < STALL_SPEED ? 0.4 : 1.9 * (0.35 + plane.speed / 220)));
    plain(`V/S ${vs >= 0 ? '+' : ''}${vs} m/s`, 700, 652, 14, PALETTE.hud, 'left', 'top');
    plain(`DIST ${(plane.distance / 1000).toFixed(2)} km`, 700, 676, 14, PALETTE.hud, 'left', 'top');
    plain(`COMBO x${state.combo}`, 920, 652, 14, state.combo > 1 ? PALETTE.gold : PALETTE.hudDim, 'left', 'top');
    plain(plane.airborne ? 'AIRBORNE' : plane.speed > 5 ? 'ROLLING' : 'ON RUNWAY', 920, 676, 14, plane.airborne ? PALETTE.ringPassed : PALETTE.hudDim, 'left', 'top');
    // Flash message, on a dark pill so it reads over rings and clouds.
    if (screen === SCREEN_PLAY && state.messageT > 0) {
      context.globalAlpha = Math.min(1, state.messageT);
      context.font = `bold 30px ${FONT}`;
      const w = context.measureText(state.message).width;
      context.fillStyle = 'rgba(10, 22, 38, 0.65)';
      context.fillRect(FIELD.width / 2 - w / 2 - 14, 138, w + 28, 44);
      text(state.message, FIELD.width / 2, 150, 30, PALETTE.gold, 'center', 'top');
      context.globalAlpha = 1;
    }
    // Low-altitude warning, only while actually flying.
    if (screen === SCREEN_PLAY && plane.airborne && plane.alt < 30) {
      const on = Math.floor(performance.now() / 350) % 2 === 0;
      if (on) text('PULL UP — TERRAIN', FIELD.width / 2, 210, 30, PALETTE.hudBad, 'center', 'top');
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 44, PALETTE.text, 'center', 'alphabetic');
    for (let index = 0; index < lines.length; index += 1) {
      plain(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center', 'alphabetic');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.gold, 'center', 'alphabetic');
  }

  const TITLE_LINES = [
    'Take off from the runway, then fly the glowing rings.',
    '↑ ↓ pitch   ← → bank & turn   W / S throttle',
    'Mountains and radio towers cost hull. Three hits end the flight.',
    '',
  ];
  const PAUSED_LINES = ['The sky will wait for you.'];
  const OVER_LINES = ['', '', ''];

  /** Paint one frame: the world, the jet, then the HUD or a panel for the screen. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0a1626';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // The whole world banks gently against the roll; the jet banks with it.
    context.save();
    context.translate(FIELD.width / 2, 360);
    context.rotate((-state.plane.roll * 0.2 * Math.PI) / 180);
    context.translate(-FIELD.width / 2, -360);
    drawSky(state);
    drawTerrain(state);
    drawRunway(state);
    drawWorldObjects(state);
    context.restore();
    drawPlane(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[3] = bestLabel(best);
      drawPanel('SKYHAWK', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    // HUD best value needs the live best: redraw the top-right label with it.
    drawHud(state, best, screen);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = `Rings flown: ${state.rings}   Best combo: x${state.bestCombo}`;
      OVER_LINES[2] = bestLabel(best);
      drawPanel('Flight over', OVER_LINES, 'Press Space or click to fly again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}

