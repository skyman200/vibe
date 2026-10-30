// 본선 멘토 화면(#/mentor): 운영진에게 받은 멘토 코드와 자기 이름으로 들어가 멘토링 요청을 요청 순서대로 맡고([가는 중]) 끝낸다([완료]).
// 본선 팀의 출발점·저장소 점검·만족도 조사 응답 수·최종 제출, 멘토링 순회 기록([도착]·[떠남]·메모 — [드라이브에 저장]),
// 강사·멘토 체크리스트, 시각마다 읽거나 단톡방에 붙여 넣을 진행 공지(복사)도 본다.
// 팀원 이름·연락처는 보이지 않는다. 현황은 20초마다 새로 읽고, 탭 제목 앞의 (숫자)가 아무도 맡지 않은 요청 수다.
import { html, useState, useEffect, useRef, useApp, useInterval, api, session } from '../lib.js';
import { Field, LoadFailed, useBusy } from '../ui.js';
import { ClockBar, HelpQueue, TeamTable, VisitLog, Checklist, RunSheet, useFinalsNow } from './finals-panels.js';

const EXPIRED = '로그인이 끝났습니다. 멘토 코드와 이름을 다시 넣어 주세요.';
const DONE = {
  take: '맡았습니다. 그 팀 자리로 가 주세요.',
  done: '완료했습니다.',
  release: '되돌렸습니다. 다른 멘토가 맡을 수 있습니다.',
};

function MentorLogin({ onDone, message }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState(message ? { _form: message } : {});
  const [busy, run] = useBusy();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('mentorLogin', { code, name: name.trim() });
        session.set('mentor', res.token);
        onDone();
      } catch (err) {
        setErrors(err.field === 'name' ? { name: err.message } : { code: err.message });
      }
    });
  };
  return html`<div class="wrap page">
    <div class="page-h"><div><h1>본선 멘토</h1><p>운영 담당에게 받은 멘토 코드와 이름을 넣으세요. 요청을 맡으면 그 팀 화면에 이름이 보입니다.</p></div></div>
    <form class="box" style="max-width:440px;display:grid;gap:14px" onSubmit=${submit}>
      ${errors._form ? html`<div class="notice bad">${errors._form}</div>` : ''}
      <${Field} label="멘토 코드" id="mentor-code" error=${errors.code}>
        <input id="mentor-code" class="input mono" autocomplete="off" placeholder="XXXX-XXXX" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} />
      <//>
      <${Field} label="이름" id="mentor-name" error=${errors.name} hint="팀에게 보일 이름(예: 김멘토) · 12자까지">
        <input id="mentor-name" class="input" autocomplete="name" maxlength="12" value=${name} onInput=${(e) => setName(e.target.value)} />
      <//>
      <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '확인 중…' : '들어가기'}</button>
    </form>
  </div>`;
}

function Board({ data, busy, act, send, reload, logout, state, message }) {
  const ms = useFinalsNow(data.now);
  const waiting = data.teams.filter((t) => t.help && t.help.state === 'open').length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = waiting ? `(${waiting}) ${base}` : base;
  }, [waiting, data]);
  useEffect(() => () => { document.title = document.title.replace(/^\(\d+\) /, ''); }, []);
  return html`<div class="wrap-wide page">
    <div class="page-h">
      <div><h1>본선 멘토</h1><p><b>${data.me}</b> 님 · 요청은 먼저 들어온 순서로 맡아 주세요. 이 화면을 켜 두면 20초마다 새 요청을 읽습니다.</p></div>
      <div class="btn-row">
        <button class="btn btn-sm" disabled=${busy} onClick=${reload}>새로 고침</button>
        <button class="btn btn-sm btn-ghost" onClick=${() => logout('')}>로그아웃</button>
      </div>
    </div>
    ${state === 'failed' ? html`<div class="notice bad"><b>새로 읽지 못했습니다.</b> ${message} 아래 현황은 마지막으로 읽은 것입니다.</div>` : ''}
    <div class="stack">
      <${ClockBar} data=${data} ms=${ms} />
      <${HelpQueue} data=${data} ms=${ms} busy=${busy} act=${act} />
      <${TeamTable} data=${data} ms=${ms} />
      <${VisitLog} data=${data} ms=${ms} busy=${busy} send=${send} />
      <${Checklist} data=${data} busy=${busy} send=${send} />
      <${RunSheet} data=${data} ms=${ms} />
    </div>
  </div>`;
}

export function MentorView() {
  const [state, setState] = useState(session.get('mentor') ? 'loading' : 'login');
  const [message, setMessage] = useState('');
  const [data, setData] = useState(null);
  const [busy, run] = useBusy();
  const { notify } = useApp();

  const logout = (msg) => {
    session.clear('mentor');
    setData(null);
    setMessage(msg);
    setState('login');
  };
  // 맡기·완료 응답은 새 현황을 돌려주므로 늘 화면에 쓰고, 그 전에 시작해 늦게 도착한 읽기는 버린다
  const seq = useRef(0);
  const loadBoard = async () => {
    const mine = seq.current;
    try {
      const res = await api('mentorBoard', { token: session.get('mentor') });
      if (mine !== seq.current) return;
      setData(res);
      setMessage('');
      setState('ready');
    } catch (err) {
      if (err.code === 'AUTH') logout(EXPIRED);
      else if (mine !== seq.current) return;
      else {
        setMessage(err.message);
        setState('failed');
      }
    }
  };
  useEffect(() => { if (state === 'loading') loadBoard(); }, [state]);
  useInterval(() => { if (data && document.visibilityState !== 'hidden') loadBoard(); }, 20000);
  // 다른 탭에 있다 돌아오면 바로 읽는다(숨긴 동안은 읽지 않으므로)
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible' && session.get('mentor')) loadBoard(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // 쓰기(요청 맡기·순회 기록·체크리스트·드라이브 저장): 답은 새 현황. → 그 답, 실패면 null
  const send = (action, payload, done) => run(async () => {
    try {
      const res = await api(action, { token: session.get('mentor'), ...payload });
      seq.current += 1;
      setData(res);
      setMessage('');
      setState('ready');
      notify(done);
      return res;
    } catch (err) {
      if (err.code === 'AUTH') { logout(EXPIRED); return null; }
      notify(err.message, 'err');
      // 그사이 다른 멘토가 맡았거나 팀이 취소했다(STATE·NOT_FOUND), 또는 반영됐는지 모른다 — 현황을 다시 읽는다
      if (err.code === 'STATE' || err.code === 'NOT_FOUND' || err.ambiguous) loadBoard();
      return null;
    }
  });
  const act = (team, op) => send('mentorHelp', { key: team.key, op, at: team.help.at }, DONE[op]);

  if (state === 'login') return html`<${MentorLogin} message=${message} onDone=${() => { setMessage(''); setState('loading'); }} />`;
  if (state === 'failed' && !data) return html`<${LoadFailed} message=${message} retry=${() => setState('loading')} />`;
  if (!data) return html`<div class="wrap page"><p class="muted">불러오는 중…</p></div>`;
  return html`<${Board} data=${data} busy=${busy} act=${act} send=${send} reload=${loadBoard} logout=${logout} state=${state} message=${message} />`;
}
