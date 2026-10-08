// 앱 껍데기: 머리·꼬리, 라우팅, 설정(config) 불러오기, 알림(toast).
import {
  html, render, useState, useEffect, useRef, useCallback, useErrorBoundary, useRoute, api, AppCtx, ApiFailure, parseHash, reportError, BUILD,
} from './lib.js';
import { HomeView } from './views/home.js';
import { ApplyView, JoinView } from './views/apply.js';
import { BoardView } from './views/board.js';
import { MeView } from './views/me.js';
import { JudgeView } from './views/judge.js';
import { TeachView } from './views/teach.js';
import { AdminView } from './views/admin.js';
import { PrivacyView } from './views/privacy.js';
import { startUpdates, updateWaiting } from './update.js';

const NAV = [
  ['home', '#/', '안내'],
  ['apply', '#/apply', '참가 신청'],
  ['board', '#/board', '참가현황'],
  ['me', '#/me', '내 신청'],
];

/** 화면 모드: 처음 들어오면 신청자 화면, 머리의 전환 단추로 심사위원·관리자 화면(각자 코드로 로그인). 강사 화면(#/teach)은 꼬리의 링크로. */
const MODES = [
  ['participant', '#/', '신청자'],
  ['judge', '#/judge', '심사위원'],
  ['admin', '#/admin', '관리자'],
];

function modeOf(routeName) {
  return routeName === 'judge' || routeName === 'admin' || routeName === 'teach' ? routeName : 'participant';
}

function Header({ route }) {
  const mode = modeOf(route.name);
  const current = route.name === 'join' ? 'apply' : route.name;
  return html`<header class="top">
    <div class=${mode === 'admin' ? 'top-in wide' : 'top-in'}>
      <a class="brand" href="#/" aria-label="DIT 바이브코딩 해커톤 처음으로">
        <span class="brand-mark">DIT</span>
        <span class="brand-name"><span class="brand-long">바이브코딩 </span>해커톤</span>
        <span class="brand-year">2026</span>
      </a>
      ${mode === 'participant' ? html`<nav class="nav" aria-label="신청자 메뉴">
        ${NAV.map(([key, href, label]) => html`<a href=${href} aria-current=${current === key ? 'page' : undefined}>${label}</a>`)}
      </nav>` : ''}
      <nav class="modes" aria-label="화면 모드">
        ${MODES.map(([key, href, label]) => html`<a href=${href} aria-current=${mode === key ? 'true' : undefined}>${label}</a>`)}
      </nav>
    </div>
  </header>`;
}

function Footer({ config }) {
  const c = config && config.event.contact;
  return html`<footer class="foot">
    <div class="wrap foot-in">
      <div>
        <div>동의과학대학교 DIT AI허브센터 · AID전환중점전문대학지원사업</div>
        ${c ? html`<div>문의 ${c.name} · <span class="num">${c.phone}</span> · <a href=${`mailto:${c.email}`}>${c.email}</a></div>` : ''}
      </div>
      <nav aria-label="보조 메뉴">
        <a href="#/privacy">개인정보 처리 안내</a>
        <a href="#/teach">강사 화면</a>
      </nav>
    </div>
  </footer>`;
}

function Toast({ toast }) {
  if (!toast) return null;
  return html`<div class=${`toast${toast.kind === 'err' ? ' err' : ''}`} role="status" aria-live="polite">${toast.text}</div>`;
}

/** 캐시를 거치지 않고 지금 화면을 다시 부르는 주소(?r= 는 앱이 뜨면 지운다). */
const freshHref = () => `${location.pathname}?r=${Date.now()}${location.hash}`;

/** 저절로 다시 그려도 다시 난 오류: 오류 줄과 배포 버전을 보여 준다(화면 캐처만으로 원인을 찾을 수 있게). */
function RenderFailed({ err, retry }) {
  const line = `${(err && err.name) || 'Error'}: ${String(err && err.message !== undefined ? err.message : err).slice(0, 160)}`;
  return html`<div class="wrap page"><div class="notice bad" role="alert">
    <b>화면을 그리는 중 오류가 났습니다.</b>${updateWaiting() ? ' 새 버전이 올라와 있습니다. 새로 고치면 새 버전으로 열립니다.' : ''}${' '}
    <button class="link-btn" type="button" onClick=${retry}>다시 시도</button> · <a href=${freshHref()}>새로 고침</a>
    <div class="small" style="margin-top:8px">계속되면 이 화면을 캡처해 문의처로 보내 주세요.</div>
    <div class="small mono">${line} · ${BUILD || 'dev'}</div>
  </div></div>`;
}

/**
 * 화면을 그리다(또는 화면의 effect 에서) 난 오류를 받는다. 오류는 기록·보고하고(lib.js reportError) 처음 한 번은
 * 저절로 다시 그린다 — 잠깐 생긴 오류는 사용자가 모르고 지나가게. 같은 화면에서 또 나면(30초마다 새로 고치는
 * 참가현황처럼 되풀이되는 오류가 숨지 않게) 오류 내용과 함께 [다시 시도]·[새로 고침]을 보여 준다. 화면을 옮기면 다시
 * 한 번 저절로 고친다(화면마다 새로 만들어진다). 다시 그려도 로그인(sessionStorage)과 설정은 그대로다.
 * 새 버전 탓은 새 버전이 실제로 올라와 있을 때만 한다(화면 스크립트는 배포마다 따로인 v/<버전> 폴더에서 받아
 * 한 화면 안에서 버전이 섞일 수 없다).
 */
function Boundary({ where, children }) {
  const healed = useRef(false);
  const [err, reset] = useErrorBoundary((e) => reportError(e, where));
  const heal = !!err && !healed.current;
  useEffect(() => {
    if (!heal) return;
    healed.current = true;
    reset();
  }, [err]);
  if (!err) return children;
  if (heal) return html`<div class="wrap page"><p class="muted">다시 그리는 중…</p></div>`;
  return html`<${RenderFailed} err=${err} retry=${reset} />`;
}

function Loading({ error, retry }) {
  return html`<div class="wrap page">
    ${error
      ? html`<div class="notice bad"><b>불러오지 못했습니다.</b> ${error} <button class="link-btn" onClick=${retry}>다시 시도</button></div>`
      : html`<p class="muted">불러오는 중…</p>`}
  </div>`;
}

/**
 * 배포본 index.html 에 들어 있는 설정(tools/build-pages.mjs 가 올릴 때 넣는다). 이것으로 첫 화면을 곧바로 그리고
 * (미리 그려 둔 안내 화면과 똑같이 그려져 화면이 바뀌지 않는다), 이어서 받은 최신 설정으로 바꾼다. 로컬 개발에는 없다.
 */
function bootConfig() {
  const el = document.getElementById('boot-config');
  if (!el) return null;
  try {
    const c = JSON.parse(el.textContent);
    return c && c.ok ? c : null;
  } catch (e) {
    return null;
  }
}

function App() {
  const route = useRoute();
  const [config, setConfig] = useState(bootConfig);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const loadConfig = useCallback(async () => {
    setError('');
    try {
      const c = await api('config');
      setConfig(c);
      return c;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => { loadConfig(); }, []);

  const notify = useCallback((text, kind = 'ok') => {
    setToast({ text, kind, at: Date.now() });
  }, []);
  useEffect(() => {
    const onRetry = (e) => {
      if (e.detail.attempt === 1 || e.detail.attempt === 3) {
        setToast({ text: '접속이 몰려 잠시 기다리는 중입니다. 자동으로 다시 시도하니 창을 닫지 마세요.', kind: 'ok', at: Date.now() });
      }
    };
    window.addEventListener('api-retry', onRetry);
    return () => window.removeEventListener('api-retry', onRetry);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === 'err' ? 5200 : 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const titles = {
      home: '안내', apply: '팀 만들기', join: '팀 합류', board: '참가현황', me: '내 신청',
      judge: '심사', teach: '강사', admin: '관리자', privacy: '개인정보 처리 안내',
    };
    document.title = `${titles[route.name] || '안내'} — DIT 바이브코딩 해커톤 2026`;
  }, [route.name]);

  let view;
  // 첫 화면(안내)은 설정을 기다리지 않고 바로 그린다(제목·버튼은 고정 문구, 행사 정보는 받는 대로 채움).
  if (!config && route.name === 'home' && !error) view = html`<${HomeView} />`;
  else if (!config) view = html`<${Loading} error=${error} retry=${loadConfig} />`;
  else if (route.name === 'apply') view = html`<${ApplyView} />`;
  else if (route.name === 'join') view = html`<${JoinView} route=${route} />`;
  else if (route.name === 'board') view = html`<${BoardView} />`;
  else if (route.name === 'me') view = html`<${MeView} />`;
  else if (route.name === 'judge') view = html`<${JudgeView} />`;
  else if (route.name === 'teach') view = html`<${TeachView} />`;
  else if (route.name === 'admin') view = html`<${AdminView} />`;
  else if (route.name === 'privacy') view = html`<${PrivacyView} />`;
  else view = html`<${HomeView} />`;

  return html`<${AppCtx.Provider} value=${{ config, reloadConfig: loadConfig, notify, route }}>
    <${Header} route=${route} />
    <main id="main"><${Boundary} key=${route.name} where="view">${view}<//></main>
    <${Footer} config=${config} />
    <${Toast} toast=${toast} />
  <//>`;
}

/**
 * 화면 밖(이벤트 처리·비동기 작업)에서 난 이 사이트 스크립트의 오류도 기록한다. 확장 프로그램·앱 안 브라우저가 넣은
 * 스크립트의 오류와, 서버 응답 실패(ApiFailure — 화면이 따로 알린다)는 뺀다.
 */
const OWN_SCRIPTS = new URL('.', import.meta.url).href;
const ours = (text) => typeof text === 'string' && text.includes(OWN_SCRIPTS);
window.addEventListener('error', (e) => {
  if (ours(e.filename) || (e.error && ours(e.error.stack))) reportError(e.error || e.message, 'window');
});
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && !(e.reason instanceof ApiFailure) && ours(e.reason.stack)) reportError(e.reason, 'promise');
});

/** index.html 이 주소만 보고 미리 그린 안내 화면을 숨기는(html.deep) 화면 — 그 스크립트의 목록과 같다(test/index-html.test.mjs). */
const DEEP_ROUTES = ['apply', 'join', 'board', 'me', 'judge', 'admin', 'privacy', 'teach'];

// 다른 사이트가 이 화면을 틀(iframe) 안에 넣어 클릭을 가로채지 못하게 한다(GitHub Pages 는 헤더를 못 붙이므로 스크립트로).
const root = document.getElementById('app');
if (window.top !== window.self) {
  root.textContent = '이 화면은 다른 사이트 안에서 열 수 없습니다.';
} else {
  // 안내가 아닌 화면으로 바로 들어왔으면(초대 링크 등) 미리 그려 둔 안내 화면을 비우고 그린다 — 다른 화면이 안내 화면의
  // 요소를 이어 쓰지 않게. html.deep 이 아니라 주소로 정한다(스크립트가 10초 넘게 늦으면 index.html 이 deep 을 뗀다).
  if (DEEP_ROUTES.includes(parseHash().name)) root.textContent = '';
  // 머리·꼬리·알림까지 포함해 앱 전체도 오류를 받는다(받는 곳이 없으면 그 뒤로 화면이 멈춘다).
  render(html`<${Boundary} where="app"><${App} /><//>`, root);
  document.documentElement.classList.remove('deep');
  // 10초 넘게 걸려 떴으면 index.html 이 띄운 '화면을 불러오지 못했습니다' 안내를 거둔다
  const bootfail = document.querySelector('.bootfail');
  if (bootfail) bootfail.remove();
  window.__vhBooted = true;
  startUpdates();   // 새 버전이 올라가면 열려 있는 화면도 바꾼다(update.js)
  // [다시 불러오기]가 붙인 ?r= 는 지운다(주소를 공유할 때 따라가지 않게)
  if (/[?&]r=\d+/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
}
