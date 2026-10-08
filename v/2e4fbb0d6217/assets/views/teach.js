// 강사: 관리자가 발급한 강사 코드로 로그인 → 교육 회차마다 세션 코드 만들기·크게 보기·끝내기, 코드마다 시작한 팀 이름과
// 첫 제출 여부(gas/Prelim.js teachBoard_). 교실 화면에 띄워도 되도록 과제·학과·개인정보는 받지 않는다. 30초마다 새로 읽는다.
import { html, useState, useEffect, useApp, useInterval, api, session } from '../lib.js';
import { Field, LoadFailed, useBusy } from '../ui.js';
import { SessionCodes } from './admin-prelim.js';

const EXPIRED = '로그인이 끝났습니다. 강사 코드를 다시 넣어 주세요.';

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

export function TeachView() {
  const { notify } = useApp();
  const [state, setState] = useState(session.get('teach') ? 'loading' : 'login');
  const [message, setMessage] = useState('');
  const [data, setData] = useState(null);
  const [busy, run] = useBusy();

  const logout = (msg) => {
    session.clear('teach');
    setData(null);
    setMessage(msg);
    setState('login');
  };
  const load = async () => {
    try {
      setData(await api('teachPrelim', { token: session.get('teach') }));
      setMessage('');
      setState('ready');
    } catch (err) {
      if (err.code === 'AUTH') logout(EXPIRED);
      else {
        // 이미 보이는 목록은 두고 오류만 알린다(다음 30초에 다시 읽는다) — 화면에 띄운 목록이 말없이 멈추지 않게
        setMessage(err.message);
        setState('failed');
      }
    }
  };
  useEffect(() => { if (state === 'loading') load(); }, [state]);
  useInterval(() => { if (data) load(); }, 30000);

  const call = (action, payload, done) => run(async () => {
    try {
      const res = await api(action, { token: session.get('teach'), ...payload });
      setData(res);
      notify(done);
      return res;
    } catch (err) {
      if (err.code === 'AUTH') { logout(EXPIRED); return null; }
      notify(err.message, 'err');
      if (err.ambiguous) load();   // 반영됐는지 모른다 — 목록을 다시 읽는다
      return null;
    }
  });

  if (state === 'login') return html`<${TeachLogin} message=${message} onDone=${() => { setMessage(''); setState('loading'); }} />`;
  if (state === 'failed' && !data) return html`<${LoadFailed} message=${message} retry=${() => setState('loading')} />`;
  if (!data) return html`<div class="wrap page"><p class="muted">불러오는 중…</p></div>`;
  return html`<div class="wrap page">
    <div class="page-h">
      <div><h1>예선 세션 코드</h1><p>회차마다 새로 만들고, 1:45 예선 시작 때 [크게 보기]로 보여 줍니다. 회차가 끝나면 [지금 끝내기]를 누릅니다.</p></div>
      <div class="btn-row">
        <button class="btn btn-sm" disabled=${busy} onClick=${load}>새로 고침</button>
        <button class="btn btn-sm btn-ghost" onClick=${() => logout('')}>로그아웃</button>
      </div>
    </div>
    ${state === 'failed' ? html`<div class="notice bad"><b>새로 읽지 못했습니다.</b> ${message} 아래 목록은 마지막으로 읽은 것입니다.</div>` : ''}
    <${SessionCodes} data=${data} busy=${busy} call=${call} />
  </div>`;
}
