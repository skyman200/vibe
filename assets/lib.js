// 공용: Preact(htm), API 호출, 세션, 라우터, 날짜·형식 도우미.
import {
  h, html, render, useState, useEffect, useRef, useMemo, useCallback, createContext, useContext,
} from './vendor/preact-htm.js';
import { API_URL, PUBLIC_URL } from './config.js';

export { h, html, render, useState, useEffect, useRef, useMemo, useCallback, createContext, useContext };

export class ApiFailure extends Error {
  constructor(message, code, field) {
    super(message);
    this.code = code || 'ERROR';
    this.field = field || '';
  }
}

/** 공개 읽기(설정·참가현황)는 CDN 캐시를 거치는 같은 사이트의 /api/public 으로, 나머지는 Apps Script 로 보낸다. */
const PUBLIC_ACTIONS = new Set(['config', 'board']);
/**
 * 자동 재시도 규칙.
 * - BUSY: 서버가 잠금을 얻지 못해 아무것도 바꾸지 않은 경우 → 항상 다시 시도.
 * - NETWORK: 응답을 못 받은 경우(서버에 반영됐을 수도 있음) → 두 번 해도 안전한 요청만 다시 시도.
 *   아래 요청은 두 번 실행되면 안 되거나(새 코드 발급·삭제) 결과를 잃으면 안 되므로 NETWORK 재시도를 하지 않는다.
 */
const NO_NETWORK_RETRY = new Set([
  'adminCode', 'adminJudgeAdd', 'adminJudgeReset', 'adminJudgeRemove', 'adminMemberRemove', 'adminDeleteTeam', 'adminPurge',
  'meWithdraw', 'meUpdate', 'teamDissolve', 'teamKick', 'teamTransfer', 'teamInvite',
]);
const MAX_ATTEMPTS = 6;
const NETWORK_MESSAGE = '접속이 몰려 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';

async function requestOnce(action, payload) {
  let res;
  try {
    res = PUBLIC_ACTIONS.has(action)
      ? await fetch(`${PUBLIC_URL}?action=${action}`)
      : await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload }),
      });
  } catch (e) {
    throw new ApiFailure(NETWORK_MESSAGE, 'NETWORK');
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new ApiFailure(NETWORK_MESSAGE, 'NETWORK');
  }
  if (!data || typeof data.ok !== 'boolean') throw new ApiFailure(NETWORK_MESSAGE, 'NETWORK');
  if (!data.ok) throw new ApiFailure(data.error || '요청을 처리하지 못했습니다.', data.code, data.field);
  return data;
}

/**
 * 요청 + 자동 재시도(지터 있는 지수 대기, 최대 6회). 여러 명이 한꺼번에 몰려도 사용자는 기다리기만 하면 된다.
 * 실패 오류의 ambiguous=true 는 '연결이 끊겨 서버에 반영됐을 수도 있음'을 뜻한다(호출 측이 상태를 다시 확인).
 */
export async function api(action, payload = {}) {
  let wait = 700;
  let ambiguous = false;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await requestOnce(action, payload);
    } catch (err) {
      if (err.code === 'NETWORK' && !PUBLIC_ACTIONS.has(action)) ambiguous = true;
      const retryable = err.code === 'BUSY' || (err.code === 'NETWORK' && !NO_NETWORK_RETRY.has(action));
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        err.ambiguous = ambiguous;
        throw err;
      }
      window.dispatchEvent(new CustomEvent('api-retry', { detail: { action, attempt } }));
      await new Promise((r) => setTimeout(r, wait * (0.5 + Math.random())));
      wait = Math.min(wait * 2, 8000);
    }
  }
}

/** 역할별 로그인 토큰(member/judge/admin). 서버가 만료·무효를 판단한다. */
export const session = {
  get(role) {
    try { return localStorage.getItem('vh.' + role) || ''; } catch (e) { return ''; }
  },
  set(role, token) {
    try { localStorage.setItem('vh.' + role, token); } catch (e) { /* 사생활 보호 모드: 이번 탭에서만 유지 */ }
  },
  clear(role) {
    try { localStorage.removeItem('vh.' + role); } catch (e) { /* 무시 */ }
  },
};

/* ── 라우터(#/경로/인자?쿼리) ── */
export function parseHash() {
  const raw = decodeURIComponent((location.hash || '#/').slice(1));
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'home', params: parts.slice(1), query: new URLSearchParams(query || '') };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function useInterval(fn, ms) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!ms) return undefined;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/* ── 날짜(항상 한국 시간으로 표시) ── */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** ISO(+09:00) 또는 설정값 'YYYY-MM-DDTHH:mm'(KST) → epoch ms */
export function toMs(v) {
  if (!v) return NaN;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? Date.parse(s + ':00+09:00') : Date.parse(s);
}

function kstParts(v) {
  const ms = toMs(v);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 9 * 3600e3);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: DOW[d.getUTCDay()],
    hh: String(d.getUTCHours()).padStart(2, '0'), mm: String(d.getUTCMinutes()).padStart(2, '0'),
  };
}

/** 10. 7.(수) 23:59 */
export function fmtWhen(v) {
  const p = kstParts(v);
  return p ? `${p.m}. ${p.d}.(${p.dow}) ${p.hh}:${p.mm}` : '';
}

/** 10. 7.(수) */
export function fmtDay(v) {
  const p = kstParts(v);
  return p ? `${p.m}. ${p.d}.(${p.dow})` : '';
}

/** 9.28 15:02 — 목록용 짧은 표기 */
export function fmtShort(v) {
  const p = kstParts(v);
  return p ? `${p.m}.${p.d} ${p.hh}:${p.mm}` : '';
}

/** 마감까지 남은 시간(사람 말투). */
export function untilText(v, now = Date.now()) {
  const ms = toMs(v) - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return '마감';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}분 남음`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours}시간 남음`;
  return `D-${Math.ceil(ms / 86400e3)}`;
}

/* ── 입력 형식(서버와 같은 규칙, 서버가 최종 판단) ── */
export const RX = {
  studentNo: /^20\d{7}$/,
  phone: /^01[016789]\d{7,8}$/,
  email: /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i,
};

/** 마지막 한글 음절의 받침 유무로 조사를 고른다(을/를, 은/는, 이/가). */
export function josa(word, withFinal, withoutFinal) {
  const syllables = String(word).match(/[가-힣]/g);
  if (!syllables) return withFinal;
  return (syllables[syllables.length - 1].charCodeAt(0) - 0xac00) % 28 ? withFinal : withoutFinal;
}

/** 으로/로: 받침이 없거나 ㄹ 받침이면 '로'. */
export function josaRo(word) {
  const syllables = String(word).match(/[가-힣]/g);
  if (!syllables) return '로';
  const final = (syllables[syllables.length - 1].charCodeAt(0) - 0xac00) % 28;
  return final === 0 || final === 8 ? '로' : '으로';
}

export function digits(v) {
  return String(v || '').replace(/[^0-9]/g, '');
}

/** 입력하는 대로 010-1234-5678 모양으로 */
export function phoneMask(v) {
  const d = digits(v).slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

/** 초대 링크: 현재 사이트 주소 + #/join/팀ID/초대코드 */
export function inviteLink(teamId, code) {
  return `${location.origin}${location.pathname}#/join/${teamId}/${code}`;
}

/* ── 앱 전역 컨텍스트 ── */
export const AppCtx = createContext(null);
export function useApp() {
  return useContext(AppCtx);
}

export const STATUS_LABEL = {
  draft: '팀 구성 중', submitted: '접수 완료', selected: '선정', waitlist: '예비', rejected: '미선정',
};

export function groupBySeries(departments) {
  const order = [];
  const map = {};
  departments.forEach((d) => {
    if (!map[d.series]) { map[d.series] = []; order.push(d.series); }
    map[d.series].push(d);
  });
  return order.map((series) => ({ series, items: map[series] }));
}
