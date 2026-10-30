// 대형 화면 배경의 3D 장면(Canvas 2D, 새 라이브러리 없음) — stage-fx.js 가 매 장 부른다.
// 뒤에서 앞으로: 밤하늘(성운 · 별 세 겹 · 가끔 별똥별) → 서치라이트 → 먼 도시 → 가까운 도시(창문 · 깜빡이는 창 · 안테나 불빛 · 네온 간판)
// → 원근 바닥 격자(앞으로 다가오고, 빛 알갱이가 줄을 타고 오며, 가끔 빛 물결이 지나간다) → 떠 있는 와이어 도형 → 앞쪽 빛망울(보케) → 가장자리 어둡게.
// 약한 패럴랙스: 카메라가 아주 천천히 옆으로 흐르고 살짝 흔들린다(cam) — 겹마다 움직이는 양이 달라(멀수록 느리게) 입체로 보인다.
// 단계(level) 2 는 전부, 1 은 별·보케·도형·알갱이를 줄이고, 0 은 하늘·도시·격자만 그린다.

const ZFAR = 34;     // 바닥이 보이는 가장 먼 깊이(세계 단위)
const DZ = 1.1;      // 바닥 가로줄 간격
const DX = 1.1;      // 바닥 세로줄 간격

const rgb = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
const WHITE = [255, 255, 255];

/** 같은 도시가 늘 같게 보이도록 씨앗을 정한 난수 */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 와이어 도형: 반지름 1 로 맞춘 꼭짓점과 모서리 */
function solid(v, edgeLen) {
  const e = [];
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      if (Math.abs(Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]) - edgeLen) < 0.01) e.push([i, j]);
    }
  }
  const k = 1 / Math.hypot(...v[0]);
  return { v: v.map((p) => p.map((n) => n * k)), e };
}
const PHI = (1 + Math.sqrt(5)) / 2;
const SOLIDS = [
  solid([-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c]))), 2),          // 정육면체
  solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], Math.SQRT2),           // 정팔면체
  solid([-1, 1].flatMap((a) => [-PHI, PHI].flatMap((b) => [[0, a, b], [a, b, 0], [b, 0, a]])), 2),  // 정이십면체
  solid([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], 2 * Math.SQRT2),                          // 정사면체
];

/** 도시 한 겹(가로로 이어 붙여 흐른다): 건물 실루엣·창문은 미리 그려 두고, 깜빡이는 것만 매 장 그린다 */
function cityTile(w, h, u, near, rand) {
  const TW = Math.round(w * 1.5);
  const TH = Math.round(h * (near ? 0.27 : 0.17));
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const g = c.getContext('2d');
  const lights = [];
  const ww = Math.max(2, Math.round(3.4 * u));
  const wh = Math.max(2, Math.round(4.6 * u));
  for (let x = 0; x < TW;) {
    const bw = Math.min(TW - x, (near ? 0.026 + rand() * 0.05 : 0.016 + rand() * 0.034) * w);
    const bh = (near ? 0.05 + rand() * 0.19 : 0.04 + rand() * 0.11) * h;
    const top = TH - bh;
    g.fillStyle = near ? '#070810' : '#141632';
    g.fillRect(x, top, bw, bh);
    const roof = rand();
    if (roof < 0.22) g.fillRect(x + bw * 0.22, top - bh * 0.07, bw * 0.56, bh * 0.07 + 1);
    else if (roof < 0.34) {
      g.beginPath();
      g.moveTo(x + bw * 0.3, top);
      g.lineTo(x + bw * 0.5, top - bh * 0.16);
      g.lineTo(x + bw * 0.7, top);
      g.fill();
    }
    if (near && bh > 0.13 * h && rand() < 0.55) {
      const ah = (0.02 + rand() * 0.03) * h;
      g.fillRect(x + bw / 2 - u, top - ah, Math.max(1, 2 * u), ah);
      lights.push({ kind: 'red', x: x + bw / 2, y: top - ah, ph: rand() * 6.28 });
    }
    if (near && rand() < 0.16 && bw > 0.04 * w) {
      lights.push({ kind: 'sign', x: x + bw * 0.15, y: top + bh * (0.12 + rand() * 0.2), w: bw * 0.7, h: Math.max(3, 0.006 * h), col: rand() < 0.5 ? 'b' : 'c', ph: rand() * 6.28 });
    }
    const gx = ww * 2.3;
    const gy = wh * 2.1;
    for (let wy = top + gy * 0.8; wy < TH - gy * 0.6; wy += gy) {
      for (let wx = x + gx * 0.55; wx < x + bw - ww - gx * 0.3; wx += gx) {
        const r = rand();
        if (r < (near ? 0.3 : 0.16)) {
          g.fillStyle = rand() < 0.68 ? `rgba(255,212,150,${near ? 0.5 + rand() * 0.4 : 0.22})` : `rgba(150,215,255,${near ? 0.45 + rand() * 0.4 : 0.2})`;
          g.fillRect(wx, wy, ww, wh);
        } else if (near && r < 0.322 && lights.length < 90) {
          lights.push({ kind: 'win', x: wx, y: wy, w: ww, h: wh, ph: rand() * 6.28, sp: 0.25 + rand() * 0.9 });
        }
      }
    }
    x += bw + (rand() < 0.25 ? rand() * 0.008 * w : 0);
  }
  if (!near) {
    // 먼 도시는 아래쪽이 안개에 묻힌다(대기 원근)
    g.globalCompositeOperation = 'source-atop';
    const fog = g.createLinearGradient(0, 0, 0, TH);
    fog.addColorStop(0, 'rgba(60,56,120,0)');
    fog.addColorStop(1, 'rgba(60,56,120,.45)');
    g.fillStyle = fog;
    g.fillRect(0, 0, TW, TH);
  }
  return { c, TW, TH, lights };
}

export function createScene() {
  let w = 1; let h = 1; let u = 1; let lvl = 2; let yH = 1; let f = 1;
  let stars = []; let shapes = []; let bokeh = []; let pulses = []; let far = null; let near = null;
  const meteors = [];
  let nextMeteor = 4; let wave = -1; let nextWave = 6; let zOff = 0;
  const rand = Math.random;

  function resize(W, H, level, horizon) {
    w = W; h = H; u = h / 1080; lvl = level;
    yH = h * horizon;
    f = h * 0.9;
    const r = seeded(20261030);
    far = cityTile(w, h, u, false, r);
    near = cityTile(w, h, u, true, r);
    stars = [];
    const counts = [[0, 0, 0], [50, 30, 14], [90, 60, 28]][level];
    counts.forEach((n, layer) => {
      for (let i = 0; i < n; i++) {
        stars.push({ x: rand(), y: rand() ** 1.4, layer, r: (0.9 + layer * 0.6 + rand() * 0.6) * u, a: 0.3 + rand() * 0.6, sp: 0.6 + rand() * 2.2, ph: rand() * 6.28 });
      }
    });
    shapes = [];
    for (let i = 0; i < [0, 4, 7][level]; i++) {
      const z = 5 + i * 1.6 + rand() * 1.2;
      // 높이: 하늘 위쪽(-0.75z)부터 바닥 바로 위(+0.4)까지 — 가운데 큰 글자판 둘레(위·아래 띠, 양옆)에서 보이게
      shapes.push({ s: SOLIDS[i % SOLIDS.length], x: (rand() - 0.5) * 24, y: i % 3 === 2 ? 0.1 + rand() * 0.3 : -(0.45 + rand() * 0.3) * z, z, size: 0.35 + rand() * 0.45,
        rx: rand() * 6, ry: rand() * 6, vx: (rand() - 0.5) * 0.5, vy: 0.15 + rand() * 0.35, ph: rand() * 6.28, col: i % 2 ? 'b' : 'c' });
    }
    bokeh = [];
    for (let i = 0; i < [0, 5, 9][level]; i++) {
      bokeh.push({ x: rand(), y: 0.1 + rand() * 0.85, r: (0.035 + rand() * 0.06) * h, v: (16 + rand() * 20) * u, a: 0.05 + rand() * 0.07, sp: 0.1 + rand() * 0.2, ph: rand() * 6.28, col: ['a', 'b', 'c', 'd'][i % 4] });
    }
    pulses = [];
    for (let i = 0; i < [0, 6, 12][level]; i++) pulses.push({ col: 0, z: -1, v: 0, len: 0 });
  }

  const zBottom = (camH) => (camH * f) / (h - yH);
  const fog = (z, zb) => Math.max(0, 1 - (z - zb) / (ZFAR - zb)) ** 1.7;

  function nebula(t, cam, pal, dim) {
    const blobs = [[0.18, 0.28, 0.5, pal.a, 0.2], [0.8, 0.18, 0.42, pal.c, 0.13], [0.52, 0.55, 0.55, pal.d, 0.1]];
    blobs.forEach(([bx, by, br, col, a], i) => {
      const x = bx * w + Math.sin(t * 0.03 + i * 2) * 0.04 * w - cam.sx * 8 * u;
      const y = by * yH + Math.cos(t * 0.025 + i) * 0.03 * h;
      const R = br * w;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.45);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, rgb(col, a * dim));
      g.addColorStop(0.5, rgb(col, a * 0.35 * dim));
      g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.restore();
    });
  }

  function skyStars(t, dt, cam, dim) {
    const speed = [1.2, 2.6, 4.8];
    const sway = [5, 11, 22];
    for (const s of stars) {
      const x = (((s.x * w - (t * speed[s.layer] + cam.sx * sway[s.layer]) * u) % w) + w) % w;
      const y = s.y * (yH - 24 * u);
      const k = 1 - Math.max(0, (y / yH - 0.6) / 0.4);
      ctx.fillStyle = `rgba(225,232,255,${s.a * (0.6 + 0.4 * Math.sin(t * s.sp + s.ph)) * k * dim})`;
      ctx.fillRect(x, y, s.r, s.r);
    }
    if (lvl < 2) return;
    if (t > nextMeteor) {
      nextMeteor = t + 5 + rand() * 7;
      meteors.push({ x: (0.2 + rand() * 0.8) * w, y: rand() * yH * 0.35, vx: -(650 + rand() * 450) * u, vy: (220 + rand() * 160) * u, life: 0.9 });
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life -= dt;
      if (m.life <= 0) { meteors.splice(i, 1); continue; }
      const k = Math.min(1, m.life * 2.2);
      const x2 = m.x - m.vx * 0.14; const y2 = m.y - m.vy * 0.14;
      const g = ctx.createLinearGradient(m.x, m.y, x2, y2);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k * dim})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(x2, y2); ctx.stroke();
      m.x += m.vx * dt; m.y += m.vy * dt;
    }
  }

  function beams(t, cam, pal, dim) {
    const list = lvl === 2 ? [[0.13, 0.17, 0], [0.5, 0.12, 2.1], [0.87, 0.15, 4.2]] : [[0.25, 0.15, 0], [0.75, 0.13, 3]];
    const col = mix(pal.c, WHITE, 0.3);
    const L = h * 1.3;
    for (const [bx, sp, ph] of list) {
      const x = bx * w - cam.sx * 16 * u;
      const y = yH - 0.03 * h;
      const ang = -Math.PI / 2 + Math.sin(t * sp + ph) * 0.42;
      const ex = x + Math.cos(ang) * L; const ey = y + Math.sin(ang) * L;
      const nx = -Math.sin(ang); const ny = Math.cos(ang);
      const wb = 5 * u; const we = L * 0.075;
      const g = ctx.createLinearGradient(x, y, ex, ey);
      g.addColorStop(0, rgb(col, 0.2 * dim));
      g.addColorStop(0.55, rgb(col, 0.06 * dim));
      g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + nx * wb, y + ny * wb);
      ctx.lineTo(ex + nx * we, ey + ny * we);
      ctx.lineTo(ex - nx * we, ey - ny * we);
      ctx.lineTo(x - nx * wb, y - ny * wb);
      ctx.fill();
    }
  }

  function city(layer, off, t, pal, dim, lights) {
    const { c, TW, TH } = layer;
    const x0 = -(((off % TW) + TW) % TW);
    ctx.drawImage(c, x0, yH - TH);
    if (x0 + TW < w) ctx.drawImage(c, x0 + TW, yH - TH);
    if (!lights) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const l of layer.lights) {
      const x = (((l.x - off) % TW) + TW) % TW;
      if (x > w + 20 * u) continue;
      const y = yH - TH + l.y;
      if (l.kind === 'red') {
        if (Math.sin(t * 2.4 + l.ph) < 0.35) continue;
        ctx.fillStyle = `rgba(255,60,60,${0.22 * dim})`;
        ctx.fillRect(x - 6 * u, y - 6 * u, 12 * u, 12 * u);
        ctx.fillStyle = 'rgba(255,90,90,.95)';
        ctx.fillRect(x - 1.6 * u, y - 1.6 * u, 3.2 * u, 3.2 * u);
      } else if (l.kind === 'win') {
        if (Math.sin(t * l.sp + l.ph) < 0.45) continue;
        ctx.fillStyle = 'rgba(255,214,150,.75)';
        ctx.fillRect(x, y, l.w, l.h);
      } else {
        const flick = Math.sin(t * 9 + l.ph) > -0.92 ? 1 : 0.25;
        ctx.fillStyle = rgb(pal[l.col], 0.2 * flick * dim);
        ctx.fillRect(x - 4 * u, y - 4 * u, l.w + 8 * u, l.h + 8 * u);
        ctx.fillStyle = rgb(mix(pal[l.col], WHITE, 0.35), 0.9 * flick);
        ctx.fillRect(x, y, l.w, l.h);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function floor(t, dt, cam, pal, dim, speed) {
    const camH = 1 + cam.y;
    const zb = zBottom(camH);
    const cx = w / 2;
    const glowPass = lvl > 0;
    zOff += dt * 0.5 * speed;
    const fr = zOff % DZ;
    // 가로줄(앞으로 다가온다)
    for (let n = 1; ; n++) {
      const z = n * DZ - fr;
      if (z < zb * 0.97) continue;
      if (z > ZFAR) break;
      const y = yH + (camH * f) / z;
      const a = fog(z, zb) * dim;
      const lw = Math.max(0.5, Math.min(1, zb / z) * 1.6) * u;
      if (glowPass) {
        ctx.strokeStyle = rgb(pal.b, a * 0.16);
        ctx.lineWidth = lw * 5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.strokeStyle = rgb(pal.b, a * 0.75);
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // 세로줄(카메라가 옆으로 흐르면 가까운 쪽이 더 많이 움직인다)
    const zn = zb * 0.8;
    const span = 34;
    ctx.beginPath();
    for (let i = Math.floor((cam.x - span) / DX); i <= Math.ceil((cam.x + span) / DX); i++) {
      const X = i * DX - cam.x;
      const xn = cx + (X * f) / zn; const xf = cx + (X * f) / ZFAR;
      if ((xn < -w && xf < 0) || (xn > 2 * w && xf > w)) continue;
      ctx.moveTo(xf, yH + (camH * f) / ZFAR);
      ctx.lineTo(xn, yH + (camH * f) / zn);
    }
    const g = ctx.createLinearGradient(0, yH, 0, h);
    g.addColorStop(0, rgb(pal.b, 0));
    g.addColorStop(0.3, rgb(pal.b, 0.3 * dim));
    g.addColorStop(1, rgb(pal.b, 0.85 * dim));
    ctx.strokeStyle = g;
    if (glowPass) {
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 6 * u;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();
    // 줄을 타고 다가오는 빛 알갱이
    const head = mix(pal.b, WHITE, 0.55);
    for (const p of pulses) {
      p.z -= p.v * dt * speed;
      if (p.z < zb * 0.85) Object.assign(p, { col: Math.round(cam.x / DX) + Math.round((rand() - 0.5) * 22), z: ZFAR * (0.6 + rand() * 0.4), v: 2.5 + rand() * 4, len: 0.8 + rand() * 1.4 });
      const X = p.col * DX - cam.x;
      const x1 = cx + (X * f) / p.z; const y1 = yH + (camH * f) / p.z;
      const x2 = cx + (X * f) / (p.z + p.len); const y2 = yH + (camH * f) / (p.z + p.len);
      const a = fog(p.z, zb) * dim;
      const lg = ctx.createLinearGradient(x2, y2, x1, y1);
      lg.addColorStop(0, rgb(head, 0));
      lg.addColorStop(1, rgb(head, a));
      ctx.strokeStyle = lg;
      ctx.lineWidth = Math.max(1, Math.min(1, zb / p.z) * 4.5) * u;
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // 가끔 지나가는 빛 물결
    if (lvl > 0) {
      if (wave < 0 && t > nextWave) wave = ZFAR;
      if (wave > 0) {
        wave -= dt * 8 * speed;
        if (wave < zb) { wave = -1; nextWave = t + 8 + rand() * 7; } else {
          const y = yH + (camH * f) / wave;
          const a = fog(wave, zb) * dim;
          const wc = mix(pal.c, WHITE, 0.3);
          ctx.strokeStyle = rgb(wc, a * 0.22);
          ctx.lineWidth = 16 * u * Math.min(1, zb / wave * 1.5);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          ctx.strokeStyle = rgb(wc, a * 0.9);
          ctx.lineWidth = 2.4 * u;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
      }
    }
    // 수평선
    const hc = mix(pal.c, WHITE, 0.4);
    ctx.strokeStyle = rgb(hc, 0.18 * dim);
    ctx.lineWidth = 10 * u;
    ctx.beginPath(); ctx.moveTo(0, yH); ctx.lineTo(w, yH); ctx.stroke();
    ctx.strokeStyle = rgb(hc, 0.7 * dim);
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.moveTo(0, yH); ctx.lineTo(w, yH); ctx.stroke();
  }

  function solids(t, dt, cam, pal, dim) {
    const cx = w / 2;
    for (const s of shapes) {
      s.rx += s.vx * dt; s.ry += s.vy * dt;
      const R = (cx / f) * s.z + s.size + 1;
      const X = ((((s.x - cam.x) + R) % (2 * R)) + 2 * R) % (2 * R) - R;
      const Y = s.y + Math.sin(t * 0.4 + s.ph) * 0.12 - cam.y * 2;
      const cX = Math.cos(s.rx); const sX = Math.sin(s.rx); const cY = Math.cos(s.ry); const sY = Math.sin(s.ry);
      const pts = s.s.v.map(([vx, vy, vz]) => {
        const x1 = vx * cY + vz * sY; const z1 = -vx * sY + vz * cY;
        const y2 = vy * cX - z1 * sX; const z2 = vy * sX + z1 * cX;
        const Z = s.z + z2 * s.size;
        return [cx + ((X + x1 * s.size) * f) / Z, yH + ((Y + y2 * s.size) * f) / Z];
      });
      const a = Math.max(0, 1 - s.z / 20) * dim;
      const col = mix(pal[s.col], WHITE, 0.25);
      ctx.beginPath();
      for (const [i, j] of s.s.e) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); }
      if (lvl === 2) {
        ctx.strokeStyle = rgb(col, a * 0.2);
        ctx.lineWidth = 5 * u;
        ctx.stroke();
      }
      ctx.strokeStyle = rgb(col, a * 0.6);
      ctx.lineWidth = 1.3 * u;
      ctx.stroke();
      ctx.fillStyle = rgb(mix(col, WHITE, 0.5), a);
      for (const [x, y] of pts) ctx.fillRect(x - 1.6 * u, y - 1.6 * u, 3.2 * u, 3.2 * u);
    }
  }

  function lens(t, cam, pal, dim) {
    for (const b of bokeh) {
      const span = w + 2 * b.r;
      const x = ((((b.x * span - t * b.v - cam.sx * 60 * u) % span) + span) % span) - b.r;
      const y = b.y * h + Math.sin(t * b.sp + b.ph) * 24 * u;
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
      const col = pal[b.col];
      g.addColorStop(0, rgb(col, b.a * 0.55 * dim));
      g.addColorStop(0.72, rgb(col, b.a * dim));
      g.addColorStop(0.86, rgb(col, b.a * 0.5 * dim));
      g.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - b.r, y - b.r, 2 * b.r, 2 * b.r);
    }
  }

  let ctx = null;
  /** t: 초 · dt: 지난 장과의 초 · cam: { x, y, sx, sy } · pal: { a, b, c, d }(rgb 배열) · o: { dim, city, shapes, speed } */
  function draw(context, t, dt, cam, pal, o) {
    ctx = context;
    const { dim } = o;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    let g = ctx.createLinearGradient(0, 0, 0, yH);
    g.addColorStop(0, '#030409');
    g.addColorStop(0.55, rgb(mix([7, 7, 20], pal.a, 0.2 * dim), 1));
    g.addColorStop(1, rgb(mix([12, 8, 30], pal.a, 0.55 * dim), 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, yH + 1);
    g = ctx.createLinearGradient(0, yH, 0, h);
    g.addColorStop(0, rgb(mix([10, 6, 24], pal.a, 0.4 * dim), 1));
    g.addColorStop(0.4, '#06050d');
    g.addColorStop(1, '#020205');
    ctx.fillStyle = g;
    ctx.fillRect(0, yH, w, h - yH);

    ctx.globalCompositeOperation = 'lighter';
    nebula(t, cam, pal, dim);
    skyStars(t, dt, cam, dim);
    if (lvl > 0) beams(t, cam, pal, dim);
    // 수평선 너머 빛(도시가 그 앞에 실루엣으로 선다)
    ctx.save();
    ctx.translate(w / 2 - cam.sx * 10 * u, yH);
    ctx.scale(1, 0.32);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
    g.addColorStop(0, rgb(mix(pal.c, WHITE, 0.15), 0.5 * dim));
    g.addColorStop(0.4, rgb(pal.c, 0.16 * dim));
    g.addColorStop(1, rgb(pal.c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-w * 0.55, -w * 0.55, w * 1.1, w * 1.1);
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    if (o.city) {
      city(far, t * 6 * u + cam.sx * 10 * u, t, pal, dim, false);
      city(near, t * 14 * u + cam.sx * 24 * u, t, pal, dim, lvl > 0);
    }
    ctx.globalCompositeOperation = 'lighter';
    floor(t, dt, cam, pal, dim, o.speed);
    if (o.shapes && lvl > 0) solids(t, dt, cam, pal, dim);
    if (lvl > 0) lens(t, cam, pal, dim);

    ctx.globalCompositeOperation = 'source-over';
    g = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.32, w / 2, h * 0.46, Math.hypot(w / 2, h * 0.6));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  return { resize, draw };
}
