// 대형 화면 남은 시간의 LED 점 글자판 — 참고 사진(흰 네모 점 5×7 시계)처럼 꺼진 점이 희미하게 깔린 판 위에 켜진 점이 빛난다.
// 점 배치는 stage-logic.js ledBitmap(숫자·쌍점은 5×7 글꼴, 칸 너비 고정이라 숫자가 바뀌어도 판이 흔들리지 않는다),
// 그 밖의 글자(제출 마감! 같은 한글)는 여기서 글꼴을 작은 격자에 4배로 그려 칸마다 덮인 양으로 점을 켠다.
// 그리기: 캔버스 한 장(기기 픽셀 최대 2배) · 점이 켜질 때 0.08초, 꺼질 때 0.16초 잔광 · 7초마다 빛이 판을 비스듬히 훑는다 ·
// warn(1시간 안)은 노란 점 · alert(10분 안)는 꺼진 점이 빨갛게 뛴다(숫자는 흰색 그대로). 크기는 CSS 가 정한다(--p 점 간격 × --cols·--rows).
// 느린 기기(배경 효과 단계 0)·동작 줄이기는 움직이지 않고 바뀔 때만 한 번 그린다.
import { html, useEffect, useRef } from '../lib.js';
import { ledBitmap } from './stage-logic.js';

/** 점 한 변(점 간격에 대한 비) — 사진은 약 0.72 */
const DOT = 0.74;

/** 글꼴을 rows 줄 격자로 래스터(4배로 그려 칸마다 덮인 양이 절반 넘으면 켬, 글자 사이 한 칸). 굵기 500·20줄이면 '출'의 ㅊ·ㅜ·ㄹ 사이가 떨어진다 */
function rasterRows(text, rows, family) {
  const S = 4;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = (px) => `500 ${px}px ${family}`;
  g.font = font(100);
  const m = g.measureText(text);
  // 글자 테두리 값(actualBoundingBox*)이 없는 오래된 브라우저는 글꼴 크기·너비로 어림한다
  const px = (100 * rows * S) / ((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 100);
  g.font = font(px);
  const asc = g.measureText(text).actualBoundingBoxAscent || px * 0.8;
  const parts = [...text].map((ch) => {
    if (ch === ' ') return { ch, w: Math.max(2, Math.round(rows * 0.3)) * S, left: 0 };
    const mm = g.measureText(ch);
    const left = mm.actualBoundingBoxLeft || 0;
    const right = mm.actualBoundingBoxRight || mm.width || px;
    return { ch, w: Math.max(1, Math.ceil((left + right) / S)) * S, left };
  });
  const width = parts.reduce((s, p) => s + p.w, 0) + S * (parts.length - 1);
  // 그래도 못 재면 빈 판(읽을 글자는 화면의 숨은 글자가 그대로 있다)
  if (!Number.isFinite(width) || width < S) return Array.from({ length: rows }, () => '.'.repeat(rows));
  c.width = width;
  c.height = rows * S;
  g.font = font(px);
  g.fillStyle = '#fff';
  let x = 0;
  parts.forEach((p) => {
    if (p.ch !== ' ') g.fillText(p.ch, x + p.left, asc);
    x += p.w + S;
  });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const cols = c.width / S;
  const out = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) sum += d[((y * S + yy) * c.width + cx * S + xx) * 4 + 3];
      line += sum / (S * S * 255) > 0.5 ? '#' : '.';
    }
    out.push(line);
  }
  return out;
}

// 같은 글자는 같은 점 배열(효과가 바뀐 글자만 다시 그리도록 객체를 그대로 돌려준다)
const cache = new Map();
function bitmap(text, min, rows) {
  const key = `${text}|${min}|${rows}`;
  if (!cache.has(key)) {
    if (cache.size > 300) cache.clear();
    // 5×7 글꼴에 없는 글자만 화면 글꼴로 래스터한다
    cache.set(key, ledBitmap(text, { min, raster: (t) => rasterRows(t, rows, getComputedStyle(document.body).fontFamily || 'sans-serif') }));
  }
  return cache.get(key);
}

const COLORS = {
  calm: ['#ffffff', '#dfe5f5', '200,215,255'],
  warn: ['#fff3b0', '#ffc61a', '255,196,30'],
  alert: ['#ffffff', '#ffe2e2', '255,236,236'],
};
function sprite(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(1, Math.ceil(size));
  draw(c.getContext('2d'), c.width);
  return c;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/** 점 그림: 켜진 점(위가 밝은 구슬) · 빛 번짐 · 꺼진 점 */
function sprites(P, tone) {
  const d = P * DOT;
  const r = P * 0.12;
  const [top, bottom, glow] = COLORS[tone] || COLORS.calm;
  const on = sprite(P, (g, s) => {
    const o = (s - d) / 2;
    const gr = g.createLinearGradient(0, o, 0, o + d);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    rr(g, o, o, d, d, r);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.4)';
    rr(g, o + d * 0.14, o + d * 0.1, d * 0.72, d * 0.2, r * 0.6);
    g.fill();
  });
  const halo = sprite(P * 2.4, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, `rgba(${glow},.32)`);
    gr.addColorStop(0.32, `rgba(${glow},.08)`);
    gr.addColorStop(1, `rgba(${glow},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
  const off = sprite(P, (g, s) => {
    const o = (s - d) / 2;
    g.fillStyle = tone === 'alert' ? '#ff2a2a' : 'rgba(255,255,255,.035)';
    rr(g, o, o, d, d, r);
    g.fill();
  });
  return { on, halo, off };
}

function createLed(canvas) {
  const ctx = canvas.getContext('2d');
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let bm = null; let tone = 'calm'; let level = 2;
  let cur = null; let wait = null; let sp = null;
  let P = 1; let W = 1; let H = 1;
  let raf = 0; let last = 0;
  const born = performance.now();
  const moving = () => !still && level > 0;

  function measure() {
    if (!bm) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const k = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(cw * k);
    H = canvas.height = Math.round(ch * k);
    P = W / bm.cols;
    // 글자 높이(CSS px) — 시험이 100인치 화면에서의 높이를 잰다
    canvas.dataset.glyph = ((bm.glyphRows - 1 + DOT) * (ch / bm.rows)).toFixed(1);
    sp = sprites(P, tone);
    paint(performance.now());
  }

  function paint(now) {
    if (!bm || !sp || !cur) return;
    const t = (now - born) / 1000;
    const { cols, rows } = bm;
    const anim = moving();
    const q = anim ? (t % 7) / 1.4 : 2;
    const band = q < 1 ? (q * 1.6 - 0.3) * W : null;   // 훑는 빛의 자리(비스듬히)
    const spread = 2 * (P * 2.4) ** 2;
    const pulse = tone === 'alert' ? (anim ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2) : 0.5) : 0;
    const offA = tone === 'alert' ? 0.14 + 0.24 * pulse : 1;   // 빨간 바탕 점은 흰 숫자보다 한참 어둡게
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const b = cur[y * cols + x];
        const px = Math.round(x * P);
        const py = Math.round(y * P);
        if (b < 1) { ctx.globalAlpha = (1 - b) * offA; ctx.drawImage(sp.off, px, py); }
        if (b > 0) { ctx.globalAlpha = b; ctx.drawImage(sp.on, px, py); }
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    const hs = sp.halo.width;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const b = cur[y * cols + x];
        const px = Math.round(x * P);
        const py = Math.round(y * P);
        const k = band === null ? 0 : Math.exp(-((px + py * 0.55 - band) ** 2) / spread);
        const a = b * (0.75 + 0.8 * k) + (1 - b) * k * (tone === 'alert' ? 0.2 : 0.1);
        if (a > 0.02) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sp.halo, px + (P - hs) / 2, py + (P - hs) / 2); }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 30) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (let i = 0; i < cur.length; i++) {
      if (wait[i] > 0) { wait[i] -= dt; continue; }
      const goal = bm.on[i];
      const c = cur[i];
      if (c !== goal) cur[i] = goal ? Math.min(1, c + dt / 0.08) : Math.max(0, c - dt / 0.16);
    }
    paint(now);
  }

  const ro = new ResizeObserver(() => measure());
  ro.observe(canvas);
  return {
    /** { bm, tone, level, wipe } — wipe: 처음 켤 때 왼쪽부터 차례로 켠다 */
    set(o) {
      const fresh = !bm || o.bm.cols !== bm.cols || o.bm.rows !== bm.rows;
      const reshade = o.tone !== tone;
      bm = o.bm;
      tone = o.tone;
      level = o.level;
      if (fresh) {
        cur = new Float32Array(bm.cols * bm.rows);
        wait = new Float32Array(bm.cols * bm.rows);
        for (let i = 0; i < cur.length; i++) {
          if (o.wipe && moving()) wait[i] = (i % bm.cols) * 0.014;
          else cur[i] = bm.on[i];
        }
        measure();
      } else if (reshade && sp) {
        sp = sprites(P, tone);
      }
      if (!moving()) {
        cancelAnimationFrame(raf);
        raf = 0;
        cur = Float32Array.from(bm.on);
        paint(performance.now());
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };
}

/**
 * LED 점 글자판 캔버스. text: 숫자·쌍점은 5×7 글꼴, 그 밖은 래스터(rows 줄) · tone: calm|warn|alert · min: 글자 칸 최소 너비
 * level: 배경 효과 단계(0 이면 움직이지 않는다) · wipe: 처음에 왼쪽부터 켜기. 읽을 글자는 부르는 쪽이 따로 둔다(캔버스는 aria-hidden).
 */
export function Led({ text, tone = 'calm', min = 0, rows = 16, cls = '', level = 2, wipe = false }) {
  const ref = useRef(null);
  const led = useRef(null);
  const bm = bitmap(text, min, rows);
  useEffect(() => {
    led.current = createLed(ref.current);
    return () => led.current.stop();
  }, []);
  useEffect(() => { led.current.set({ bm, tone, level, wipe }); }, [bm, tone, level]);
  return html`<canvas class=${`led ${cls}`} ref=${ref} style=${`--cols:${bm.cols};--rows:${bm.rows}`} aria-hidden="true"></canvas>`;
}
