// 강사: 관리자가 발급한 강사 코드로 로그인 → 90분 교육 진행 콘솔(teach-plan.js). 칸마다 강사가 할 일·할 말·복사 단추·낭독 대본,
// 출석, 세션 코드, 시작한 팀 현황이 한 화면에 있다. 강사 화면에는 과제·개인정보가 오지 않는다(gas/Prelim.js teachBoard_).
// 진행 상태(교육 시작 시각·끝낸 칸·출석·메모)는 이 탭(sessionStorage)에만 남는다. 현황은 30초마다 새로 읽는다.
import { html, useState, useEffect, useRef, useApp, useInterval, api, session, copyText } from '../lib.js';
import { Field, LoadFailed, useBusy } from '../ui.js';
import { timeline, STEPS, clock, TOTAL_MIN, LESSON_URL } from './teach-plan.js';
import { StepCard } from './teach-step.js';
import { useRoster, PinnedCode } from './teach-panels.js';
import { attendance, startStatus, summaryText } from './teach-status.js';
import { useClock } from './teach-bits.js';
import { HelpPanel } from './teach-help.js';

const EXPIRED = '로그인이 끝났습니다. 강사 코드를 다시 넣어 주세요.';
const KEY = 'vh.console';   // 로그인 토큰(session 'teach' → 'vh.teach')과 다른 칸이어야 한다: 같으면 진행 상태가 토큰을 덮어쓴다

function load() {
  try { return JSON.parse(window.sessionStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
}
function save(v) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* 저장소가 없으면 이 탭 안에서만 */ }
}

function TeachLogin({ onDone, message }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(message || '');
  const [busy, run] = useBusy();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('teachLogin', { code });
        session.set('teach', res.token);
        onDone();
      } catch (err) {
        setError(err.message);
      }
    });
  };
  return html`<div class="wrap page">
    <div class="page-h"><div><h1>강사</h1><p>운영 담당에게 받은 강사 코드를 입력하세요.</p></div></div>
    <form class="box" style="max-width:440px;display:grid;gap:14px" onSubmit=${submit}>
      <${Field} label="강사 코드" id="teach-code" error=${error}>
        <input id="teach-code" class="input mono" autocomplete="off" placeholder="XXXX-XXXX" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} />
      <//>
      <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '확인 중…' : '들어가기'}</button>
    </form>
  </div>`;
}

/** 칸의 상태: done(끝남) · now(지금) · todo. 교육을 시작하기 전에는 모두 todo, 준비 칸만 열려 있다. */
function stateOf(step, doneMap, current) {
  if (doneMap[step.id] && doneMap[step.id].__done) return 'done';
  return step.id === current ? 'now' : 'todo';
}

function Console({ data, busy, call, load: reload, logout, state, message }) {
  const { notify } = useApp();
  const saved = load();
  const [startedAt, setStartedAt] = useState(saved.startedAt || 0);
  const [done, setDone] = useState(saved.done || {});
  const [checked, setChecked] = useState(saved.checked || {});
  const [notes, setNotes] = useState(saved.notes || '');
  const [before, setBefore] = useState(saved.before || []);   // [교육 시작] 때 이미 있던 세션 id(지난 회차) — 이번 교육의 현황에서 뺀다
  const [resultText, setResultText] = useState('');
  const roster = useRoster();
  const { elapsed } = useClock(startedAt);
  useEffect(() => { save({ startedAt, done, checked, notes, before }); }, [startedAt, done, checked, notes, before]);

  const tl = timeline();
  const doneIds = tl.filter((s) => done[s.id] && done[s.id].__done).map((s) => s.id);
  const current = (tl.find((s) => !doneIds.includes(s.id) && (s.id !== 'prep' || startedAt === 0)) || tl[tl.length - 1]).id;
  // 세션 코드를 화면 위에 고정하는 때: 규칙 낭독이 끝난 뒤 마무리 칸 전까지. 입장 칸을 다시 열어 늦은 출석을 고치는 동안에도 코드가 프로젝터에서 사라지지 않는다.
  const pinCode = !!startedAt && doneIds.includes('rules') && current !== 'close';
  const go = (id, action) => {
    if (action === 'done') setDone({ ...done, [id]: { ...(done[id] || {}), __done: true } });
    else setDone({ ...done, [id]: { ...(done[id] || {}), __done: false } });
  };
  const start = () => { setBefore(data.sessions.map((s) => s.id)); setStartedAt(Date.now()); if (!(done.prep && done.prep.__done)) go('prep', 'done'); };
  // 새 회차: 시계·끝낸 칸·출석·메모를 모두 비운다(지난 회차의 출석이 이번 [결과 복사]에 섞이면 안 된다)
  const reset = () => { setStartedAt(0); setDone({}); setChecked({}); setNotes(''); setBefore([]); setResultText(''); save({}); };

  // 현황: 출석한 팀 가운데 시작·첫 제출(계산은 teach-status.js)
  const status = startStatus(data, roster.teams, checked, before);
  const copyResult = async () => {
    const text = summaryText({
      label: (data.sessions[0] && data.sessions[0].label) || '',
      att: attendance(roster.teams, checked), status, notes,
      clockAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
    if (await copyText(text)) notify('결과를 복사했습니다. 단톡방에 붙여 넣으세요.', 'ok');
    else setResultText(text);   // 클립보드를 못 쓰면 글을 화면에 보여 직접 선택해 복사한다
  };

  // 칸을 넘기면 새 '지금' 칸이 화면 위로 오게 한다(처음 열 때나 새로 고친 뒤에는 움직이지 않는다)
  const lastCurrent = useRef(current);
  useEffect(() => {
    if (startedAt && lastCurrent.current !== current) {
      const el = document.getElementById(`step-${current}`);
      if (el) {
        const top = document.querySelector('.top');
        const bar = document.querySelector('.con-sticky');
        const stuck = bar && window.getComputedStyle(bar).position === 'sticky';
        const offset = (top ? top.getBoundingClientRect().height : 0) + (stuck ? bar.getBoundingClientRect().height : 0) + 10;
        window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - offset);
      }
    }
    lastCurrent.current = current;
  }, [current, startedAt]);

  const ctx = { roster, checked, setChecked, data, busy, call, done, setDone, go, notes, setNotes, copyResult, resultText, status, reload, mode: startedAt ? 'run' : 'prep' };
  const ahead = startedAt ? elapsed - (tl.find((s) => s.id === current) || { start: 0 }).start : 0;
  return html`<div class="wrap page con">
    <div class="page-h">
      <div><h1>의무 교육 진행</h1><p>순서대로 눌러 가며 진행합니다. 총 ${TOTAL_MIN}분 · 혼자 진행하는 기준입니다. 학생에게는 「교육 따라 하기」 주소를 알려 주세요.</p></div>
      <div class="btn-row">
        <button class="btn btn-sm" disabled=${busy} onClick=${reload}>새로 고침</button>
        <button class="btn btn-sm btn-ghost" onClick=${() => { if (!startedAt || confirm('로그아웃하면 이 탭의 진행 상태(출석·메모)도 지워집니다. 결과를 이미 복사했나요?')) { reset(); logout(''); } }}>로그아웃</button>
      </div>
    </div>
    ${state === 'failed' ? html`<div class="notice bad"><b>새로 읽지 못했습니다.</b> ${message} 아래 현황은 마지막으로 읽은 것입니다.</div>` : ''}
    <div class="con-sticky">
    <div class="con-clockbar" data-clockbar>
      ${startedAt ? html`<div><b class="num">${clock(elapsed)}</b> / ${clock(TOTAL_MIN)}<span class="small muted"> · ${elapsed > TOTAL_MIN ? `${elapsed - TOTAL_MIN}분 넘음` : `${TOTAL_MIN - elapsed}분 남음`}</span></div>
        <div class="small muted">학생 화면 <span class="mono">${LESSON_URL}</span></div>
        <button type="button" class="btn btn-sm btn-ghost" onClick=${() => { if (confirm('교육 시계와 끝낸 칸, 출석, 메모를 모두 지우고 처음부터 다시 할까요?')) reset(); }}>처음으로</button>`
        : html`<div><b>교육 시계는 [교육 시작]을 누르면 시작합니다.</b><span class="small muted"> 위의 준비를 마친 뒤 누르세요.</span></div>
        <button type="button" class="btn btn-primary" data-start onClick=${start}>교육 시작</button>`}
    </div>
    ${pinCode ? html`<${PinnedCode} data=${data} />` : ''}
    </div>
    <div class="con-steps">${tl.map((s) => {
      const st = stateOf(s, done, current);
      const gap = startedAt && st === 'now' ? ahead : 0;
      return html`<${StepCard} step=${s} state=${st} ctx=${{ ...ctx, timeText: s.min === 0 ? '교육 시작 전' : `${clock(s.start)}~${clock(s.end)} · ${s.min}분${gap > 2 ? ` · ${gap}분 지남` : ''}` }} />`;
    })}</div>
    <${HelpPanel} />
    <p class="small muted" style="margin-top:20px">${STEPS.length}칸. 진행 상태는 이 탭에만 남습니다(탭을 닫으면 지워집니다).</p>
  </div>`;
}

export function TeachView() {
  const [state, setState] = useState(session.get('teach') ? 'loading' : 'login');
  const [message, setMessage] = useState('');
  const [data, setData] = useState(null);
  const [busy, run] = useBusy();
  const { notify } = useApp();

  const logout = (msg) => {
    session.clear('teach');
    setData(null);
    setMessage(msg);
    setState('login');
  };
  // 쓰기(코드 만들기·끝내기) 응답은 새 현황을 돌려주므로 늘 화면에 쓰고, 그 전에 시작해 늦게 도착한 읽기는 버린다(옛 읽기가 방금 만든 세션 코드를 덮지 않게)
  const seq = useRef(0);
  const loadBoard = async () => {
    const mine = seq.current;
    try {
      const res = await api('teachPrelim', { token: session.get('teach') });
      if (mine !== seq.current) return;
      setData(res);
      setMessage('');
      setState('ready');
    } catch (err) {
      if (err.code === 'AUTH') logout(EXPIRED);
      else if (mine !== seq.current) return;   // 그 사이 쓰기가 끝나 더 새 현황이 있다 — 옛 읽기의 실패는 알리지 않는다
      else {
        // 이미 보이는 현황은 두고 오류만 알린다(다음 30초에 다시 읽는다) — 화면에 띄운 목록이 말없이 멈추지 않게
        setMessage(err.message);
        setState('failed');
      }
    }
  };
  useEffect(() => { if (state === 'loading') loadBoard(); }, [state]);
  useInterval(() => { if (data) loadBoard(); }, 30000);

  const call = (action, payload, done) => run(async () => {
    try {
      const res = await api(action, { token: session.get('teach'), ...payload });
      seq.current += 1;
      setData(res);
      setMessage('');
      setState('ready');
      notify(done);
      return res;
    } catch (err) {
      if (err.code === 'AUTH') { logout(EXPIRED); return null; }
      notify(err.message, 'err');
      if (err.ambiguous) loadBoard();   // 반영됐는지 모른다 — 현황을 다시 읽는다
      return null;
    }
  });

  if (state === 'login') return html`<${TeachLogin} message=${message} onDone=${() => { setMessage(''); setState('loading'); }} />`;
  if (state === 'failed' && !data) return html`<${LoadFailed} message=${message} retry=${() => setState('loading')} />`;
  if (!data) return html`<div class="wrap page"><p class="muted">불러오는 중…</p></div>`;
  return html`<${Console} data=${data} busy=${busy} call=${call} load=${loadBoard} logout=${logout} state=${state} message=${message} />`;
}
