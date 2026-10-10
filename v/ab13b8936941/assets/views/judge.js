// 심사위원: 코드로 로그인 → 발표 순서대로 팀을 골라 대면 심사(50점) 채점.
import { html, useState, useEffect, useApp, api, session, fmtShort } from '../lib.js';
import { Field, LoadFailed, useBusy } from '../ui.js';

const LEVELS = ['매우 우수', '우수', '보통', '미흡', '매우 미흡'];
const levelPoints = (max) => [1, 0.8, 0.6, 0.4, 0.2].map((r) => Math.round(max * r));

function JudgeLogin({ onDone, message }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(message || '');
  const [busy, run] = useBusy();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('judgeLogin', { code });
        session.set('judge', res.token);
        onDone();
      } catch (err) {
        setError(err.message);
      }
    });
  };
  return html`<div class="wrap page">
    <div class="page-h"><div><h1>심사위원</h1><p>운영진에게 받은 심사위원 코드를 입력하세요.</p></div></div>
    <form class="box" style="max-width:440px;display:grid;gap:14px" onSubmit=${submit}>
      <${Field} label="심사위원 코드" id="judge-code" error=${error}>
        <input id="judge-code" class="input mono" autocomplete="off" placeholder="XXXX-XXXX" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} />
      <//>
      <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '확인 중…' : '들어가기'}</button>
    </form>
  </div>`;
}

function Stepper({ id, value, max, disabled, onChange }) {
  const n = value === '' ? '' : Number(value);
  const bump = (d) => onChange(Math.min(max, Math.max(0, (n === '' ? 0 : n) + d)));
  return html`<div class="stepper">
    <button type="button" aria-label="1점 빼기" disabled=${disabled} onClick=${() => bump(-1)}>−</button>
    <input id=${id} inputmode="numeric" value=${n} disabled=${disabled} aria-label="점수"
      onInput=${(e) => {
        const v = e.target.value.replace(/[^0-9]/g, '');
        onChange(v === '' ? '' : Math.min(max, Number(v)));
      }} />
    <button type="button" aria-label="1점 더하기" disabled=${disabled} onClick=${() => bump(1)}>+</button>
    <span class="max">/${max}</span>
  </div>`;
}

function ScorePanel({ team, rubric, locked, onSaved, onNext }) {
  const { notify } = useApp();
  const initial = () => {
    const v = {};
    rubric.forEach((c) => { v[c.key] = team.score ? team.score[c.key] : ''; });
    v.comment = team.score ? team.score.comment : '';
    return v;
  };
  const [vals, setVals] = useState(initial);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();

  const filled = rubric.every((c) => vals[c.key] !== '');
  const total = rubric.reduce((a, c) => a + (vals[c.key] === '' ? 0 : Number(vals[c.key])), 0);
  const dirty = rubric.some((c) => (team.score ? team.score[c.key] : '') !== vals[c.key]) || (team.score ? team.score.comment : '') !== vals.comment;

  const save = (next) => run(async () => {
    try {
      const payload = { token: session.get('judge'), teamId: team.id, comment: vals.comment };
      rubric.forEach((c) => { payload[c.key] = vals[c.key]; });
      const res = await api('judgeScore', payload);
      onSaved(team.id, res.score);
      notify(`${team.name} 점수를 저장했습니다.`);
      if (next) onNext();
    } catch (err) {
      setError(err.message);
    }
  });

  return html`<div class="panel">
    <div class="panel-h">
      <div>
        <p class="overline">${team.presentOrder ? `발표 ${team.presentOrder}번` : '발표 순서 미정'} · ${team.repDept.name}</p>
        <h2 style="font-size:24px;margin-top:2px">${team.name}</h2>
      </div>
      <div class="score-total"><b>${filled ? total : '–'}</b><span class="muted">/ 50</span></div>
    </div>
    <dl class="kv">
      <dt>프로젝트</dt><dd>${team.projectName}</dd>
      <dt>주제</dt><dd>${team.topic}</dd>
      <dt>저장소</dt><dd>${team.repoUrl ? html`<a href=${team.repoUrl} target="_blank" rel="noopener">${team.repoUrl}</a>` : html`<span class="muted">아직 제출하지 않음</span>`}</dd>
      ${team.serviceUrl ? html`<dt>서비스</dt><dd><a href=${team.serviceUrl} target="_blank" rel="noopener">${team.serviceUrl}</a></dd>` : ''}
    </dl>
    <details><summary class="small">프로젝트 개요 보기</summary><p style="white-space:pre-wrap;margin-top:8px">${team.summary}</p></details>
    ${locked ? html`<div class="notice warn">심사가 마감되어 점수를 바꿀 수 없습니다.</div>` : ''}
    <div>
      ${rubric.map((c) => html`<div class="crit">
        <div><h3>${c.label}</h3><p>${c.desc}</p></div>
        <${Stepper} id=${`sc-${c.key}`} value=${vals[c.key]} max=${c.max} disabled=${locked} onChange=${(v) => setVals((s) => ({ ...s, [c.key]: v }))} />
        <div class="quick">
          ${levelPoints(c.max).map((p, i) => html`<button type="button" disabled=${locked} aria-pressed=${vals[c.key] === p ? 'true' : 'false'}
            onClick=${() => setVals((s) => ({ ...s, [c.key]: p }))}>${LEVELS[i]} ${p}</button>`)}
        </div>
      </div>`)}
    </div>
    <${Field} label="의견" id="judge-comment" optional hint="집계·동점 협의 때 참고합니다(500자 이내).">
      <textarea id="judge-comment" class="textarea" maxlength="500" disabled=${locked} value=${vals.comment} onInput=${(e) => setVals((s) => ({ ...s, comment: e.target.value }))}></textarea>
    <//>
    ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
    <div class="btn-row">
      <button class="btn btn-primary" disabled=${locked || !filled || busy} onClick=${() => save(true)}>저장하고 다음 팀</button>
      <button class="btn" disabled=${locked || !filled || busy} onClick=${() => save(false)}>저장</button>
      ${dirty && !locked ? html`<span class="small muted">저장하지 않은 변경이 있습니다.</span>` : team.score ? html`<span class="small muted">${fmtShort(team.score.updatedAt)} 저장됨</span>` : ''}
    </div>
  </div>`;
}

export function JudgeView() {
  const [data, setData] = useState(null);
  const [state, setState] = useState(session.get('judge') ? 'loading' : 'login');
  const [message, setMessage] = useState('');
  const [sel, setSel] = useState('');

  const load = async () => {
    try {
      const res = await api('judgeBoard', { token: session.get('judge') });
      setData(res);
      setSel((cur) => cur || (res.teams.find((t) => !t.score) || res.teams[0] || {}).id || '');
      setState('ready');
    } catch (err) {
      setMessage(err.message);
      if (err.code === 'AUTH') {
        session.clear('judge');
        setState('login');
      } else {
        setState('failed');
      }
    }
  };
  useEffect(() => { if (state === 'loading') load(); }, [state]);

  if (state === 'login') return html`<${JudgeLogin} message=${message} onDone=${() => { setMessage(''); setState('loading'); }} />`;
  if (state === 'failed' && !data) return html`<${LoadFailed} message=${message} retry=${() => setState('loading')} />`;
  if (!data) return html`<div class="wrap page"><p class="muted">불러오는 중…</p></div>`;

  const team = data.teams.find((t) => t.id === sel);
  const done = data.teams.filter((t) => t.score).length;
  const onSaved = (id, score) => setData((d) => ({ ...d, teams: d.teams.map((t) => (t.id === id ? { ...t, score } : t)) }));
  const onNext = () => {
    const idx = data.teams.findIndex((t) => t.id === sel);
    const next = data.teams.slice(idx + 1).concat(data.teams.slice(0, idx)).find((t) => !t.score && t.id !== sel);
    if (next) setSel(next.id);
    window.scrollTo(0, 0);
  };

  return html`<div class="wrap page">
    <div class="page-h">
      <div><h1>대면 심사</h1><p>${data.judge.name} · ${done}/${data.teams.length}팀 채점</p></div>
      <div class="btn-row">
        <button class="btn btn-sm" onClick=${load}>새로 고침</button>
        <button class="btn btn-sm btn-ghost" onClick=${() => { session.clear('judge'); setData(null); setState('login'); }}>로그아웃</button>
      </div>
    </div>
    ${!data.teams.length ? html`<div class="notice">아직 본선 진출 팀이 없습니다.</div>` : html`<div class="jgrid">
      <ol class="jlist">
        ${data.teams.map((t, i) => html`<li><button aria-current=${t.id === sel ? 'true' : 'false'} onClick=${() => setSel(t.id)}>
          <span class="ord">${t.presentOrder || i + 1}</span>
          <span><b>${t.name}</b><div class="small muted">${t.projectName}</div></span>
          ${t.score ? html`<span class="done">${t.score.total}</span>` : html`<span class="todo">미채점</span>`}
        </button></li>`)}
      </ol>
      ${team ? html`<${ScorePanel} key=${team.id} team=${team} rubric=${data.rubric} locked=${data.locked} onSaved=${onSaved} onNext=${onNext} />` : ''}
    </div>`}
  </div>`;
}
