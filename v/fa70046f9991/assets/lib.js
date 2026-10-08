// 공용: Preact(htm), API 호출, 세션, 라우터, 날짜·형식 도우미.
import {
  html, render, useState, useEffect, useRef, useCallback, createContext, useContext, useErrorBoundary,
} from './vendor/preact-htm.js';
import { API_URL, PUBLIC_URL, LOG_URL } from './config.js';
import { MAX_ATTEMPTS, FIRST_WAIT_MS, retryable, backoff, answers } from './retry.js';
import { scrub } from './scrub.js';

export { html, render, useState, useEffect, useRef, useCallback, createContext, useContext, useErrorBoundary };

/** 배포 버전: 배포본은 화면 스크립트를 v/<버전>/assets/ 에서 받는다(tools/build-pages.mjs). 로컬 개발은 ''. */
export const BUILD = (/\/v\/([0-9a-f]{12})\/assets\//.exec(import.meta.url) || [])[1] || '';

/* ── 화면 오류 기록 ──
 * 화면을 그리다 난 오류(와 요청에 엉뚱한 답이 온 일, where 'api')를 이 탭(sessionStorage 'vh.errors', 최근 5개)에 남기고 운영 로그(LOG_URL → 디스코드)로 보낸다.
 * 무엇이 깨졌는지 알기 위한 기술 정보만 보낸다: 화면 이름(주소의 첫 칸 — 초대 코드 같은 인자는 뺀다), 배포 버전,
 * 오류 이름·메시지·스택 앞부분, 브라우저 정보. 입력값·학번·이름 같은 개인정보는 보내지 않는다(scrub.js 가 이메일·전화번호·
 * 긴 숫자열을 지운다). 같은 오류는 한 번만, 화면을 한 번 열 때마다 5건까지 보낸다.
 */
const ERROR_KEY = 'vh.errors';
const sentErrors = new Set();

export function reportError(err, where) {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : '알 수 없는 오류');
  console.error('화면 오류', where, err);
  const entry = {
    at: new Date().toISOString(),
    where,
    route: /^[\w-]{0,20}$/.test(parseHash().name) ? parseHash().name : 'other',
    build: BUILD || 'dev',
    name: scrub(e.name, 60),
    message: scrub(e.message, 300),
    stack: scrub(e.stack, 1500),
    ua: scrub(navigator.userAgent, 300),
  };
  try {
    const st = window.sessionStorage;
    const list = JSON.parse(st.getItem(ERROR_KEY) || '[]');
    st.setItem(ERROR_KEY, JSON.stringify(list.concat(entry).slice(-5)));
  } catch (x) { /* 저장소가 없으면 보내기만 한다 */ }
  const sig = [entry.where, entry.route, entry.name, entry.message].join('|');
  if (sentErrors.has(sig) || sentErrors.size >= 5) return;
  sentErrors.add(sig);
  const body = JSON.stringify(entry);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(LOG_URL, body)) return;
  } catch (x) { /* 아래 fetch 로 */ }
  try {
    fetch(LOG_URL, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => {});
  } catch (x) { /* 보고는 화면을 막지 않는다 */ }
}

export class ApiFailure extends Error {
  constructor(message, code, field) {
    super(message);
    this.code = code || 'ERROR';
    this.field = field || '';
  }
}

/** 공개 읽기(설정·참가현황)는 CDN 캐시를 거치는 PUBLIC_URL 로, 나머지는 Apps Script(API_URL)로 보낸다. */
const PUBLIC_ACTIONS = new Set(['config', 'board']);
const NETWORK_MESSAGE = '접속이 몰려 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';

/**
 * 요청 + 응답 읽기를 제한 시간 안에. 망이 끊긴 연결(방화벽이 패킷을 버림, 잠든 HTTP/2 연결 등)은 fetch 가 오류 없이
 * 끝없이 기다리므로, 시간을 넘기면 끊고 연결 오류(NETWORK)로 다룬다 — 그래야 다시 시도·다른 길로 넘어간다.
 */
async function fetchJson(url, opts, ms) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
  let data;
  try {
    const res = await fetch(url, ctl ? { ...opts, signal: ctl.signal } : opts);
    data = await res.json();
  } catch (e) {
    throw new ApiFailure(NETWORK_MESSAGE, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
  if (!data || typeof data.ok !== 'boolean') throw new ApiFailure(NETWORK_MESSAGE, 'NETWORK');
  return data;
}

/** 공개 읽기 제한 시간(전달망은 보통 0.1~1초). 쓰기·로그인은 서버 처리(신청서 파일 만들기 포함)가 길 수 있어 넉넉히. */
const PUBLIC_TIMEOUT_MS = 8000;
const POST_TIMEOUT_MS = 60000;

/**
 * 쓰기·로그인·관리 요청(공개 읽기가 전달망에서 답을 못 받았을 때도). 서버는 본문의 action 만 쓴다. 주소에도 요청 이름을
 * 붙이는 것은 앞단에서 본문 없는 GET 으로 바뀌어 doGet 에 닿으면 실행 기록에 어느 요청이었는지 남기기 위해서다(gas/Api.js doGet).
 */
async function post(action, payload) {
  return fetchJson(`${API_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  }, POST_TIMEOUT_MS);
}

/**
 * 공개 읽기: CDN 을 먼저 쓰고, CDN(전달망)의 답이 Apps Script 가 이 요청에 한 답이 아니면(연결 실패·502·
 * 다른 답) Apps Script 에 직접 묻는다 — 전달망 장애로 사이트가 열리지 않거나 깨지는 일이 없도록.
 */
async function getPublic(action) {
  let data = null;
  try {
    // 브라우저 캐시를 쓰지 않는다(전달망이 이미 캐시한다) — 브라우저에 남은 예전 응답이 화면을 막는 일이 없게.
    data = await fetchJson(`${PUBLIC_URL}?action=${action}`, { cache: 'no-store' }, PUBLIC_TIMEOUT_MS);
  } catch (e) {
    // 연결이 안 되거나, 제한 시간을 넘기거나, JSON 이 아닌 응답 → Apps Script 로 직접 묻는다.
  }
  if (data && data.action === action) return data;
  return post(action, {});
}

async function requestOnce(action, payload) {
  const data = PUBLIC_ACTIONS.has(action) ? await getPublic(action) : await post(action, payload);
  // 이 요청의 답이 아니면(doGet 의 BUSY 포함) 받지 못한 것(NETWORK)으로 다룬다 — 두 번 해도 안전한 요청만 다시 보내고,
  // 쓰기는 ambiguous 로 호출 측이 상태를 다시 확인한다. 그대로 쓰면 화면은 빈 답으로 깨지고 쓰기는 저장된 줄 안다.
  if (!answers(data, action)) {
    // doGet 의 답이면 그가 받은 주소 인자(query)를 붙인다 — POST 가 어떻게 GET 으로 바뀌었는지 보는 단서(gas/Api.js doGet).
    const query = typeof data.query === 'string' ? ` · 주소 인자 ${data.query.slice(0, 120) || '(없음)'}` : '';
    const stray = new Error(`${action} 요청에 다른 답: ${Object.keys(data).sort().join(',').slice(0, 120)}${query}`);
    stray.name = 'StrayResponse';
    reportError(stray, 'api');
    throw new ApiFailure(NETWORK_MESSAGE, 'NETWORK');
  }
  if (!data.ok) throw new ApiFailure(data.error || '요청을 처리하지 못했습니다.', data.code, data.field);
  return data;
}

/**
 * 요청 + 자동 재시도(retry.js 규칙: 지터 있는 지수 대기, 최대 6회). 여러 명이 한꺼번에 몰려도 사용자는 기다리기만 하면 된다.
 * 실패 오류의 ambiguous=true 는 '연결이 끊겨 서버에 반영됐을 수도 있음'을 뜻한다(호출 측이 상태를 다시 확인).
 */
export async function api(action, payload = {}) {
  let base = FIRST_WAIT_MS;
  let ambiguous = false;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const data = await requestOnce(action, payload);
      // 저장이 끝났다(새 버전 적용을 미뤄 두었다면 이제 적용해도 되는지 update.js 가 본다)
      if (!PUBLIC_ACTIONS.has(action)) window.dispatchEvent(new CustomEvent('api-saved', { detail: { action } }));
      return data;
    } catch (err) {
      if (err.code === 'NETWORK' && !PUBLIC_ACTIONS.has(action)) ambiguous = true;
      if (!retryable(err.code, action) || attempt >= MAX_ATTEMPTS) {
        err.ambiguous = ambiguous;
        throw err;
      }
      window.dispatchEvent(new CustomEvent('api-retry', { detail: { action, attempt } }));
      const b = backoff(base);
      await new Promise((r) => setTimeout(r, b.wait));
      base = b.next;
    }
  }
}

/**
 * 역할별 로그인 토큰. 같은 주소(skyman200.github.io)를 다른 페이지들과 함께 쓰므로 오래 남기지 않는다.
 * - admin: 메모리에만(새로 고치면 다시 로그인) — 개인정보 원문을 볼 수 있는 토큰이라서
 * - member·judge: 이 탭(sessionStorage)에만 — 탭을 닫으면 사라진다
 */
const memoryTokens = {};
function tabStore() {
  try { return window.sessionStorage; } catch (e) { return null; }
}
/** 새 버전을 적용하려고 새로 고칠 때만 관리자 로그인을 이 탭에 30초 맡겨 두었다가(update.js), 다시 뜨자마자 꺼내 지운다. */
const HANDOFF = 'vh.adminHandoff';
(() => {
  const st = tabStore();
  if (!st) return;
  try {
    const h = JSON.parse(st.getItem(HANDOFF) || 'null');
    if (h && h.exp > Date.now() && h.t) memoryTokens.admin = h.t;
  } catch (e) { /* 깨진 값은 버린다 */ }
  st.removeItem(HANDOFF);
})();
export const session = {
  /** 새로 고침 직전: 관리자 로그인이 있으면 30초만 이 탭에 맡긴다. */
  handoffAdmin() {
    const st = tabStore();
    if (st && memoryTokens.admin) st.setItem(HANDOFF, JSON.stringify({ t: memoryTokens.admin, exp: Date.now() + 30000 }));
  },
  get(role) {
    if (role === 'admin') return memoryTokens.admin || '';
    const st = tabStore();
    return (st && st.getItem('vh.' + role)) || memoryTokens[role] || '';
  },
  set(role, token) {
    memoryTokens[role] = token;
    const st = tabStore();
    if (role !== 'admin' && st) st.setItem('vh.' + role, token);
  },
  clear(role) {
    delete memoryTokens[role];
    const st = tabStore();
    if (st) st.removeItem('vh.' + role);
  },
};

/* ── 라우터(#/경로/인자?쿼리) ── */
export function parseHash() {
  let raw = (location.hash || '#/').slice(1);
  try {
    raw = decodeURIComponent(raw);
  } catch (e) {
    /* 깨진 %-표기는 그대로 둔다(앱이 멈추지 않게) */
  }
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

/** 파일 → base64(데이터 URL 앞부분 제외) */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new ApiFailure('파일을 읽지 못했습니다. 다시 골라 주세요.', 'FILE'));
    reader.readAsDataURL(file);
  });
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
  draft: '팀 구성 중', submitted: '접수 완료', selected: '본선 진출', waitlist: '예비', rejected: '미선발',
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
