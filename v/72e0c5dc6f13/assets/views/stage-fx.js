// 대형 화면 배경 효과(캔버스 한 장, 새 라이브러리 없이 Canvas 2D): 3D 장면(stage-scene.js — 밤하늘·도시·원근 바닥·와이어 도형·빛망울,
// 약한 패럴랙스) 위에 시상식의 색종이(위에서 쏟아지기 · 양쪽 아래에서 쏘아 올리기) · 불꽃 · 금가루. 숫자와 글자는 DOM 이 그린다(캔버스는 배경만).
// 색종이는 공기 저항을 받아(빠르게 날아오르다 느려지고) 종이마다 다른 빠르기로 팔랑이며 떨어진다.
// 색은 장면이 바뀌면 1초 남짓에 걸쳐 옮겨 간다. 카메라 흔들림(-1~1)을 화면 요소의 --cam-x·--cam-y 로 넘겨
// DOM 장식(LED 판 기울기·편집기)도 배경과 함께 움직인다.
// 느리면 스스로 줄인다: 3초마다 한 장 그리는 데 든 시간(평균)과 초당 장 수를 보고 2(전부) → 1(별·보케·도형 줄임·해상도 낮춤)
// → 0(하늘·도시·격자만, 네 장에 한 번). 동작 줄이기(prefers-reduced-motion)를 켠 기기는 0 에서 멈춘 그림 한 장만 그린다.
// 4K 화면도 내부 해상도는 폭 1920(단계 1·0 은 1280)을 넘기지 않는다 — 배경이라 조금 흐려도 되고, 큰 화면에서 장 수를 지킨다.
import { useEffect, useRef, useState } from '../lib.js';
import { createScene } from './stage-scene.js';

/** 장면 색: [하늘·수평선, 바닥 격자, 빛(서치라이트·수평선), 덧색] */
const TONES = {
  neon: ['#7c3aed', '#22d3ee', '#ec4899', '#3b82f6'],
  warn: ['#b45309', '#f59e0b', '#f472b6', '#7c3aed'],
  alert: ['#991b1b', '#ef4444', '#f97316', '#be123c'],
  gold: ['#92400e', '#f5b301', '#ffd54a', '#7c3aed'],
  silver: ['#334155', '#cbd5e1', '#e2e8f0', '#3b82f6'],
  bronze: ['#7c2d12', '#f0a36b', '#c2703d', '#7c3aed'],
};
const toRgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const PAL = Object.fromEntries(Object.entries(TONES).map(([k, list]) => [k, list.map(toRgb)]));
const KEYS = ['a', 'b', 'c', 'd'];

export const SPARKS = {
  neon: ['#a78bfa', '#67e8f9', '#f9a8d4', '#ffffff'],
  gold: ['#ffd700', '#ffec8b', '#fff8dc', '#ffb300'],
  silver: ['#ffffff', '#e5e7eb', '#cbd5e1', '#93c5fd'],
  bronze: ['#f4a460', '#cd7f32', '#ffdab9', '#ffffff'],
  party: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff'],
};

/** 금상·은상·동상 화면이 나오고 색종이를 쏘아 올리기까지(ms) */
export const TOSS_MS = 2000;
/** 상 색종이: 그 상 빛깔이 절반 남짓, 나머지는 여러 색 */
export const papersOf = (tier) => (SPARKS[tier] || SPARKS.gold).concat(SPARKS[tier] || SPARKS.gold, SPARKS.party);

const rgbHex = {};
function rgba(hex, a) {
  if (!rgbHex[hex]) rgbHex[hex] = toRgb(hex).join(',');
  return `rgba(${rgbHex[hex]},${a})`;
}
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** 캔버스에 효과를 건다. host: --cam-x·--cam-y 를 받을 요소 · onLevel(단계): 단계가 내려갈 때 알린다(화면이 CSS 효과도 줄이게). */
export function createFx(canvas, { host, onLevel } = {}) {
  const ctx = canvas.getContext('2d');
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = createScene();
  let level = still ? 0 : 2;
  let tone = 'neon';
  let dim = 1;
  let speed = 1;
  let horizon = 0.74;
  let first = true;   // 처음 정한 색은 옮겨 가지 않고 바로
  const pal = Object.fromEntries(KEYS.map((k, i) => [k, PAL.neon[i].slice()]));
  const on = { city: true, shapes: true, dust: false, fireworks: false };
  let w = 1; let h = 1; let u = 1;   // u: 1080 줄 화면 기준 1px
  const sparks = []; const papers = []; const dust = [];
  let raf = 0; let frame = 0; let last = performance.now();
  let win = { at: last, frame: 0, work: 0, drawn: 0 };
  let nextFirework = 0;

  const newDust = (any) => ({ x: Math.random() * w, y: any ? Math.random() * h : -6 * u, r: (0.6 + Math.random() * 1.8) * u, vy: (12 + Math.random() * 28) * u, vx: (Math.random() - 0.5) * 12 * u, ph: Math.random() * 6.28 });

  function resize() {
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    const k = Math.min(Math.min(window.devicePixelRatio || 1, 2), (level >= 2 ? 1920 : 1280) / cw);
    w = canvas.width = Math.max(1, Math.round(cw * k));
    h = canvas.height = Math.max(1, Math.round(ch * k));
    u = h / 1080;
    scene.resize(w, h, level, horizon);
    dust.length = 0;
    for (let n = [0, 40, 90][level]; n > 0; n--) dust.push(newDust(true));
    if (still) draw(last, 0);
  }

  function draw(now, dt) {
    const t = still ? 30 : now / 1000;
    const goal = PAL[tone] || PAL.neon;
    const k = still ? 1 : 1 - Math.exp(-dt * 2.5);
    KEYS.forEach((key, i) => { for (let c = 0; c < 3; c++) pal[key][c] += (goal[i][c] - pal[key][c]) * k; });
    const sx = still ? 0 : Math.sin(t * 0.13);
    const sy = still ? 0 : Math.sin(t * 0.09 + 1.3);
    scene.draw(ctx, t, dt, { x: t * 0.03 + sx * 0.35, y: sy * 0.05, sx, sy }, pal, { dim, city: on.city, shapes: on.shapes, speed });
    if (host && level > 0 && frame % 2 === 0) {
      host.style.setProperty('--cam-x', sx.toFixed(3));
      host.style.setProperty('--cam-y', sy.toFixed(3));
    }
    ctx.globalCompositeOperation = 'lighter';
    if (on.dust && level) {
      dust.forEach((p, i) => {
        p.y += p.vy * dt;
        p.x += p.vx * dt;
        if (p.y > h + 6 * u) dust[i] = newDust(false);
        ctx.fillStyle = `rgba(255,215,90,${0.35 + 0.6 * Math.sin(t * 3 + p.ph) ** 2})`;
        ctx.fillRect(p.x, p.y, p.r * 1.4, p.r * 1.4);
      });
    }
    if (on.fireworks && level && now > nextFirework) {
      nextFirework = now + 650 + Math.random() * 800;
      burst(0.15 + Math.random() * 0.7, 0.12 + Math.random() * 0.33, Math.random() < 0.6 ? SPARKS.gold : SPARKS.party, level === 2 ? 90 : 40);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy += 140 * u * dt;
      s.vx *= 0.985;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      ctx.fillStyle = rgba(s.c, Math.min(1, s.life / s.max * 1.4));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = papers.length - 1; i >= 0; i--) {
      const p = papers[i];
      // 공기 저항: 가로는 멈추는 쪽으로, 세로는 종이마다 다른 끝 속도(vt)로 — 쏘아 올린 종이도 꼭대기에서 느려져 팔랑 떨어진다
      p.vx -= p.vx * Math.min(1, 1.6 * dt);
      p.vy += 2.2 * (p.vt - p.vy) * dt;
      p.x += (p.vx + Math.sin(t * 2 + p.ph) * 40 * u) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.vy > 0 && p.y > h + 30 * u) { papers.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)));
      ctx.restore();
    }
  }

  /** 불꽃 한 번(x·y 는 화면 비율 0~1) */
  function burst(xr, yr, colors = SPARKS.neon, n = 80) {
    if (!level) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const v = (120 + Math.random() * 380) * u;
      const max = 0.9 + Math.random() * 0.9;
      sparks.push({ x: xr * w, y: yr * h, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, c: pick(colors), r: (2 + Math.random() * 3) * u });
    }
  }
  const paper = (colors, o) => ({ rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10, w: (10 + Math.random() * 12) * u, h: (6 + Math.random() * 10) * u,
    c: pick(colors), ph: Math.random() * 6.28, vt: (110 + Math.random() * 130) * u, ...o });
  /** 색종이 한 번(위에서 쏟아진다) */
  function confetti(colors = SPARKS.party, n = 160) {
    if (!level) return;
    for (let i = 0; i < (level === 2 ? n : Math.round(n * 0.4)); i++) {
      papers.push(paper(colors, { x: Math.random() * w, y: -Math.random() * h * 0.5, vx: (Math.random() - 0.5) * 80 * u, vy: (60 + Math.random() * 140) * u }));
    }
  }
  /** 색종이 대포: 화면 양쪽 아래 모서리에서 가운데 위로 쏘아 올려 화면 가득 흩뿌린다 */
  function toss(colors = SPARKS.party, n = 240) {
    if (!level) return;
    for (let i = 0; i < (level === 2 ? n : Math.round(n * 0.4)); i++) {
      const side = i % 2 ? -1 : 1;                        // 1: 왼쪽 아래에서 오른쪽 위로
      const a = 0.1 + Math.random() * 0.68;               // 똑바로 위에서 기운 각(라디안)
      const v = (1750 + Math.random() * 1250) * u;        // 저항이 있어 화면 위쪽까지 올라갔다가 느려진다
      papers.push(paper(colors, { x: side > 0 ? Math.random() * 0.06 * w : w - Math.random() * 0.06 * w, y: h + Math.random() * 20 * u,
        vx: side * Math.sin(a) * v, vy: -Math.cos(a) * v, vr: (Math.random() - 0.5) * 16 }));
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    // 탭이 가려졌다 돌아오는 등 장이 오래 끊겼으면 재기를 새로 시작한다(끊긴 시간을 느린 기기로 보지 않게)
    if (now - last > 500) {
      last = now;
      win = { at: now, frame, work: 0, drawn: 0 };
      return;
    }
    frame += 1;
    const dt = Math.min(0.05, (now - last) / 1000);
    if (level === 0 && frame % 4) return;
    last = now;
    const a = performance.now();
    draw(now, dt);
    win.work += performance.now() - a;
    win.drawn += 1;
    if (now - win.at > 3000) {
      const fps = ((frame - win.frame) * 1000) / (now - win.at);
      if (level > 0 && (win.work / win.drawn > 12 || fps < 24)) {
        level -= 1;
        resize();
        if (onLevel) onLevel(level);
      }
      win = { at: now, frame, work: 0, drawn: 0 };
    }
  }

  window.addEventListener('resize', resize);
  resize();
  if (!still) raf = requestAnimationFrame(loop);
  return {
    level: () => level,
    /** { tone, dim, speed(바닥이 다가오는 빠르기 배수), horizon(수평선 높이 0~1), layers: { city, shapes, dust, fireworks } } */
    set(o) {
      if (o.tone) tone = o.tone;
      if (first) {
        first = false;
        KEYS.forEach((key, i) => { pal[key] = (PAL[tone] || PAL.neon)[i].slice(); });
      }
      if (typeof o.dim === 'number') dim = o.dim;
      if (typeof o.speed === 'number') speed = o.speed;
      Object.assign(on, o.layers || {});
      if (typeof o.horizon === 'number' && o.horizon !== horizon) {
        horizon = o.horizon;
        resize();
      }
      if (still) draw(last, 0);
    },
    burst,
    confetti,
    toss,
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}

/** 화면 요소에 효과를 건다: [캔버스 ref, 효과(ref.current), 단계]. settings 가 바뀌면(JSON 으로 비교) 그대로 반영한다. */
export function useFx(settings) {
  const ref = useRef(null);
  const fx = useRef(null);
  const [level, setLevel] = useState(2);
  useEffect(() => {
    const f = createFx(ref.current, { host: ref.current.parentElement, onLevel: setLevel });
    fx.current = f;
    f.set(settings);
    setLevel(f.level());
    return () => f.stop();
  }, []);
  const key = JSON.stringify(settings);
  useEffect(() => { if (fx.current) fx.current.set(settings); }, [key]);
  return [ref, fx, level];
}
