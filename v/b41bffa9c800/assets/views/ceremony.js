// 시상식(#/ceremony): 행사장 큰 화면에 수상 팀을 한 팀씩 발표한다 — 관리자 [심사] → 최종 결과 → [시상식 화면 열기](같은 탭, 전체 화면).
// 순서(stage-logic.js ceremonySteps): 시작 → 동상(상 소개 → 팀마다) → 은상 → 금상 → 모두(시상대: 왼쪽 은 · 가운데 금 · 오른쪽 동).
// 팀마다 조명·도는 트로피·팀 이름(프로젝트 이름)·색종이, 금상은 더 긴 긴장(2.5초)·빛줄기·불꽃·금가루. 소리는 없다(행사장 음향이 따로).
// 넘기기: → 스페이스 PageDown Enter 클릭(다음 — 긴장 중이면 바로 공개) · ← Backspace PageUp 오른쪽 클릭(이전) · Home·End · F 전체 화면 · B(.) 화면 가리기.
// 수상 팀은 열 때 한 번 관리자 결과(adminResults — 고른 상이 공식 결과)를 읽어 이 탭 메모리에만 둔다(공개 전 결과가 저장소에 남지 않게).
// 관리자 로그인도 메모리에만 있어 새로 고치면 여기서 다시 로그인한다. #/ceremony?practice=1 은 가짜 팀으로 연습(늘 '연습' 표시) —
// 이것도 관리자만(admin.js AdminGate): [심사] → 최종 결과 · [설정]의 [시상식 연습]으로 같은 탭에서 연다. 나가면 관리자 [심사]로.
import { html, useState, useEffect, useRef, useApp, api, session } from '../lib.js';
import { ceremonySteps, ceremonyKey, PRACTICE_ROWS } from './stage-logic.js';
import { useFx, SPARKS, TOSS_MS, papersOf } from './stage-fx.js';
import { useWakeLock, useFullscreen, useIdle } from './tv-bits.js';
import { Trophy, preloadTrophies } from './stage-trophy.js';
import { AdminLogin, AdminGate } from './admin.js';

/** 팀 이름을 보이기 전 긴장(ms) */
const SUSPENSE = { gold: 2500, silver: 1100, bronze: 900 };

function Podium({ tiers }) {
  const by = {};
  tiers.forEach((t) => { by[t.key] = t; });
  return html`<div class="podium">
    ${['silver', 'gold', 'bronze'].filter((k) => by[k]).map((k) => html`<div class=${`pod ${k}`} key=${k}>
      <div class="pod-names">${by[k].teams.map((x) => html`<div><b>${x.name}</b><span>${x.projectName}</span></div>`)}</div>
      <div class="pod-block"><${Trophy} tier=${k} /><span>${by[k].label}</span></div>
    </div>`)}
  </div>`;
}

function Show({ rows, practice, exit }) {
  const { config } = useApp();
  const [steps] = useState(() => ceremonySteps(rows));
  const [i, setI] = useState(0);
  const [seen, setSeen] = useState(() => new Set());
  const [black, setBlack] = useState(false);
  const [full, toggleFull] = useFullscreen();
  const idle = useIdle(2500);
  const s = steps[i];
  const wait = s.kind === 'team' ? SUSPENSE[s.key] : 0;
  const shown = !wait || seen.has(i);
  const reveal = (n) => setSeen((x) => new Set(x).add(n));
  const now = useRef({});
  now.current = { i, shown, black, n: steps.length };
  const next = () => {
    const c = now.current;
    if (c.black) setBlack(false);
    else if (!c.shown) reveal(c.i);
    else setI((n) => Math.min(c.n - 1, n + 1));
  };
  const prev = () => {
    const c = now.current;
    if (c.black) setBlack(false);
    else setI((n) => Math.max(0, n - 1));
  };
  useEffect(() => {
    if (!wait || shown) return undefined;
    const t = setTimeout(() => reveal(i), wait);
    return () => clearTimeout(t);
  }, [i]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = ceremonyKey(e.key);
      if (!k) return;
      e.preventDefault();
      if (k === 'next') next();
      else if (k === 'prev') prev();
      else if (k === 'first') setI(0);
      else if (k === 'last') setI(now.current.n - 1);
      else if (k === 'full') toggleFull();
      else if (k === 'black') setBlack((b) => !b);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goldish = s.key === 'gold' || s.kind === 'finale';
  const [canvas, fx, level] = useFx({
    tone: s.kind === 'intro' ? 'neon' : s.kind === 'finale' ? 'gold' : s.key,
    dim: shown ? 1 : 0.55,
    layers: { city: true, shapes: s.kind === 'intro', dust: goldish && shown, fireworks: goldish && shown && s.kind !== 'tier' },
  });
  useEffect(() => {
    const f = fx.current;
    if (!f || !shown) return undefined;
    const later = [];
    const at = (ms, fn) => later.push(setTimeout(fn, ms));
    // 금상·은상·동상 화면(상 소개 · 팀 이름이 나온 뒤)은 2초 뒤 양쪽 아래에서 색종이를 뿌린다(다음으로 넘기면 취소)
    if (s.kind === 'tier' || s.kind === 'team') at(TOSS_MS, () => f.toss(papersOf(s.key), s.key === 'gold' ? 340 : 240));
    if (s.kind === 'tier') f.burst(0.5, 0.42, SPARKS[s.key], 90);
    if (s.kind === 'finale') f.confetti(SPARKS.party, 300);
    if (s.kind === 'team') {
      f.burst(0.5, 0.42, SPARKS[s.key], 150);
      if (s.key === 'gold') [[0.22, 0.3], [0.78, 0.3], [0.35, 0.2], [0.65, 0.2]].forEach(([x, y], k) => at(300 + k * 380, () => f.burst(x, y, SPARKS.gold, 130)));
    }
    return () => later.forEach(clearTimeout);
  }, [i, shown]);

  let body;
  if (s.kind === 'intro') {
    body = html`<div class="cer-intro">
      <div class="cer-event">${config.event.name}</div>
      <div class="cer-title">시상식</div>
      <div class="cer-counts num">${s.counts.length ? s.counts.map(([l, n]) => `${l} ${n}팀`).join(' · ') : '수상 팀이 없습니다 — [심사] → 최종 결과에서 고른 뒤 다시 여세요'}</div>
    </div>`;
  } else if (s.kind === 'tier') {
    body = html`<div class=${`cer-tiercard ${s.key}`} key=${i}>
      <${Trophy} tier=${s.key} spin />
      <div class="cer-tier">${s.label}</div>
      <div class="cer-sub num">${s.count}팀</div>
    </div>`;
  } else if (s.kind === 'team') {
    body = html`<div class=${`cer-team ${s.key}${shown ? ' shown' : ' wait'}`} key=${i}>
      <div class="cer-spot" aria-hidden="true"></div>
      ${s.key === 'gold' && shown ? html`<div class="cer-beams" aria-hidden="true"></div>` : ''}
      <div class="cer-tier">${s.label}${s.count > 1 ? html` <span class="num">${s.index}/${s.count}</span>` : ''}</div>
      <${Trophy} tier=${s.key} spin />
      ${shown ? html`<div class="cer-name">${s.team.name}</div><div class="cer-proj">${s.team.projectName}</div>`
        : html`<div class="cer-drum" aria-label="발표 직전"><i></i><i></i><i></i></div>`}
    </div>`;
  } else {
    body = html`<${Podium} tiers=${s.tiers} />`;
  }

  return html`<div class=${`ceremony c-${s.kind}${idle ? ' idle' : ''}`} data-fx=${level}
    onClick=${(e) => { if (!e.target.closest('.cer-ctl')) next(); }} onContextMenu=${(e) => { e.preventDefault(); prev(); }}>
    <canvas class="stage-fx" ref=${canvas} aria-hidden="true"></canvas>
    <section class="cer-main" aria-live="polite">${body}</section>
    ${practice ? html`<div class="cer-practice">연습 — 가짜 팀</div>` : ''}
    <div class=${`cer-ctl${idle ? ' hide' : ''}`} onMouseDown=${(e) => e.preventDefault()}>
      <span class="cer-keys">→ 다음 · ← 이전 · F 전체 화면 · B 가리기</span>
      <b class="num">${i + 1}/${steps.length}</b>
      <button type="button" class="btn btn-sm" onClick=${prev}>이전</button>
      <button type="button" class="btn btn-sm" onClick=${next}>다음</button>
      <button type="button" class="btn btn-sm" onClick=${toggleFull}>${full ? '전체 화면 끝내기' : '전체 화면'}</button>
      <button type="button" class="btn btn-sm btn-ghost" onClick=${exit}>나가기</button>
    </div>
    ${black ? html`<div class="cer-black"></div>` : ''}
  </div>`;
}

/** 관리자: 이 탭의 로그인으로 공식 결과를 한 번 읽는다 */
function Official({ exit }) {
  const [state, setState] = useState(session.get('admin') ? 'loading' : 'login');
  const [rows, setRows] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (state !== 'loading') return;
    api('adminResults', { token: session.get('admin') }).then((res) => {
      setRows(res.results.rows);
      setState('ready');
    }).catch((err) => {
      setMessage(err.message);
      if (err.code === 'AUTH') {
        session.clear('admin');
        setState('login');
      } else {
        setState('failed');
      }
    });
  }, [state]);
  if (state === 'login') return html`<div class="tv-login"><${AdminLogin} message=${message} onDone=${() => { setMessage(''); setState('loading'); }} /></div>`;
  if (state === 'failed') {
    return html`<div class="cer-wait"><p>수상 팀을 불러오지 못했습니다. ${message}</p>
      <div class="btn-row"><button class="btn" type="button" onClick=${() => setState('loading')}>다시 시도</button><button class="btn btn-ghost" type="button" onClick=${exit}>나가기</button></div></div>`;
  }
  if (state !== 'ready') return html`<div class="cer-wait"><p>수상 팀을 불러오는 중…</p></div>`;
  return html`<${Show} rows=${rows} exit=${exit} />`;
}

export function CeremonyView() {
  const { route } = useApp();
  const practice = route.query.get('practice') === '1';
  useWakeLock();
  useEffect(() => {
    preloadTrophies();
    document.documentElement.classList.add('tv');
    return () => document.documentElement.classList.remove('tv');
  }, []);
  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    location.hash = '#/admin?tab=judging';
  };
  if (!practice) return html`<${Official} key="admin" exit=${exit} />`;
  return html`<${AdminGate} key="practice" lead="시상식 연습(가짜 팀)은 관리자만 열 수 있습니다. 행사장 화면에는 영향이 없습니다.">
    <${Show} rows=${PRACTICE_ROWS} practice exit=${exit} />
  <//>`;
}
