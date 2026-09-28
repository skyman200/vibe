// 앱 껍데기: 머리·꼬리, 라우팅, 설정(config) 불러오기, 알림(toast).
import {
  html, render, useState, useEffect, useCallback, useRoute, api, AppCtx,
} from './lib.js';
import { HomeView } from './views/home.js';
import { ApplyView, JoinView } from './views/apply.js';
import { BoardView } from './views/board.js';
import { MeView } from './views/me.js';
import { JudgeView } from './views/judge.js';
import { AdminView } from './views/admin.js';
import { PrivacyView } from './views/privacy.js';

const NAV = [
  ['home', '#/', '안내'],
  ['apply', '#/apply', '참가 신청'],
  ['board', '#/board', '참가현황'],
  ['me', '#/me', '내 신청'],
];

function Header({ route }) {
  const current = route.name === 'join' ? 'apply' : route.name;
  return html`<header class="top">
    <div class="top-in">
      <a class="brand" href="#/" aria-label="DIT 바이브코딩 해커톤 처음으로">
        <span class="brand-mark">DIT</span>
        <span class="brand-name">바이브코딩 해커톤</span>
        <span class="brand-year">2026</span>
      </a>
      <nav class="nav" aria-label="주 메뉴">
        ${NAV.map(([key, href, label]) => html`<a href=${href} aria-current=${current === key ? 'page' : undefined}>${label}</a>`)}
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
        <a href="#/judge">심사위원</a>
        <a href="#/admin">관리자</a>
      </nav>
    </div>
  </footer>`;
}

function Toast({ toast }) {
  if (!toast) return null;
  return html`<div class=${`toast${toast.kind === 'err' ? ' err' : ''}`} role="status" aria-live="polite">${toast.text}</div>`;
}

function Loading({ error, retry }) {
  return html`<div class="wrap page">
    ${error
      ? html`<div class="notice bad"><b>불러오지 못했습니다.</b> ${error} <button class="link-btn" onClick=${retry}>다시 시도</button></div>`
      : html`<p class="muted">불러오는 중…</p>`}
  </div>`;
}

function App() {
  const route = useRoute();
  const [config, setConfig] = useState(null);
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
      judge: '심사', admin: '관리자', privacy: '개인정보 처리 안내',
    };
    document.title = `${titles[route.name] || '안내'} — DIT 바이브코딩 해커톤 2026`;
  }, [route.name]);

  let view;
  if (!config) view = html`<${Loading} error=${error} retry=${loadConfig} />`;
  else if (route.name === 'apply') view = html`<${ApplyView} />`;
  else if (route.name === 'join') view = html`<${JoinView} route=${route} />`;
  else if (route.name === 'board') view = html`<${BoardView} />`;
  else if (route.name === 'me') view = html`<${MeView} />`;
  else if (route.name === 'judge') view = html`<${JudgeView} />`;
  else if (route.name === 'admin') view = html`<${AdminView} />`;
  else if (route.name === 'privacy') view = html`<${PrivacyView} />`;
  else view = html`<${HomeView} />`;

  return html`<${AppCtx.Provider} value=${{ config, reloadConfig: loadConfig, notify, route }}>
    <${Header} route=${route} />
    <main id="main">${view}</main>
    <${Footer} config=${config} />
    <${Toast} toast=${toast} />
  <//>`;
}

// 다른 사이트가 이 화면을 틀(iframe) 안에 넣어 클릭을 가로채지 못하게 한다(GitHub Pages 는 헤더를 못 붙이므로 스크립트로).
if (window.top !== window.self) {
  document.getElementById('app').textContent = '이 화면은 다른 사이트 안에서 열 수 없습니다.';
} else {
  render(html`<${App} />`, document.getElementById('app'));
}
