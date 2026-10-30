// 행사장 큰 화면(현황판 board-tv.js · 모션그래픽 stage.js · 시상식 ceremony.js)이 함께 쓰는 조각: 남은 시간·한국 시각 글,
// 기기 시계 보정, 화면 꺼짐 막기(Wake Lock), 전체 화면, 지금·다음 일정(finals-plan.js). 참가현황 머리(board.js)·본선 화면도 쓴다.
import { html, useState, useEffect, useRef, toMs } from '../lib.js';
import { nowNext } from './finals-plan.js';

const two = (n) => String(n).padStart(2, '0');

/** 남은 시간 'HH:MM:SS'(시는 24를 넘을 수 있다) */
export function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** 한국 시각 'HH:MM:SS' */
export function kstClock(ms) {
  const d = new Date(ms + 9 * 3600e3);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}

/**
 * 기기 시계 보정: 참가현황 답의 시각(phase.now)은 캐시 때문에 수십 초 늦을 수 있어 그대로 믿지 않는다. 기기 시계가 그보다도
 * 늦을 때만(서버가 본 시각이 기기보다 앞섬) 그만큼 앞당긴다. 기기 시계가 빠른 경우는 고치지 못한다.
 */
export function useSkew(now) {
  const ref = useRef(0);
  const seen = toMs(now) - Date.now();
  if (Number.isFinite(seen) && seen > ref.current) ref.current = seen;
  return ref.current;
}

/** 화면이 꺼지지 않게 요청한다(탭이 다시 보이면 다시 요청). */
export function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const ask = async () => {
      try {
        if (navigator.wakeLock && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch (e) { /* 지원하지 않거나 거절 — 화면 꺼짐은 TV 설정에서 끈다 */ }
    };
    ask();
    const onVisible = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) lock.release().catch(() => {});
    };
  }, []);
}

/** [전체 화면인가, 켜고 끄기] */
export function useFullscreen() {
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  };
  return [full, toggle];
}

/**
 * 마우스를 ms 동안 움직이지 않으면 참 — 큰 화면에서 커서와 조작 단추를 숨긴다. 키(발표용 리모컨)는 깨우지 않는다(넘길 때마다
 * 단추가 나오지 않게).
 */
export function useIdle(ms) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), ms);
    };
    const events = ['mousemove', 'mousedown', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [ms]);
  return idle;
}

/** 브라우저 전체 화면(F11·키오스크)인가 — fullscreenElement 가 없으므로 창 크기로 본다(다시 그릴 때마다) */
export function kioskWindow() {
  return Math.abs(window.innerHeight - screen.height) <= 2 && Math.abs(window.innerWidth - screen.width) <= 2;
}

/** 지금·다음 일정. 다음 칸이 다음 날이면 '내일'. 일정이 모두 끝나면 없다. */
export function NowNext({ ms, cls = 'tv-plan' }) {
  const { now, next } = nowNext(ms);
  if (!now && !next) return null;
  const day = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const when = (b) => {
    if (b.date === day(ms)) return '';
    if (b.date === day(ms + 86400e3)) return '내일 ';
    return `${Number(b.date.slice(5, 7))}. ${Number(b.date.slice(8, 10))}. `;
  };
  return html`<div class=${cls}>
    ${now ? html`<div><span class="tv-tag now">지금</span><b class="num">${now.start}–${now.end}</b> ${now.what}${now.note ? html` <span class="tv-note">· ${now.note}</span>` : ''}</div>` : ''}
    ${next ? html`<div><span class="tv-tag">다음</span><b class="num">${when(next)}${next.start}</b> ${next.what}</div>` : ''}
  </div>`;
}
