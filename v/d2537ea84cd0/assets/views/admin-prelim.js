// 관리자 · 예선(gas/Prelim.js): 회차별 세션 코드 만들기·끝내기, 팀별 시작·과제·마감·마지막 제출(보관본), 남은 과제 수,
// 예선 심사(admin-judge.js), 강사 코드.
// 과제 내용은 운영 담당만 본다. 강사는 강사 화면(teach.js)에서 세션 코드 칸(SessionCodes)만 쓴다. 진행 현황은 1분마다 새로 읽는다.
import {
  html, useState, useEffect, useApp, useInterval, api, session, fmtShort,
} from '../lib.js';
import { Modal, useBusy } from '../ui.js';
import { JudgePanel } from './admin-judge.js';

const token = () => session.get('admin');

/** 팀의 예선 진행 단계와 표시(이름, 색). */
const STATE = {
  idle: ['미시작', 'idle'],
  running: ['진행 중 · 미제출', 'warn'],
  submitted: ['진행 중 · 제출함', 'ok'],
  done: ['마감 · 제출함', 'ok'],
  missed: ['마감 · 미제출', 'bad'],
};

function teamState(t) {
  const p = t.prelim;
  if (!p) return 'idle';
  if (p.state === 'running') return p.submission ? 'submitted' : 'running';
  return p.submission ? 'done' : 'missed';
}

function sizeText(n) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

function TeamRow({ t }) {
  const p = t.prelim;
  const s = p && p.submission;
  const [label, tone] = STATE[teamState(t)];
  return html`<tr>
    <td>${t.name}<div class="small muted">${t.dept}</div></td>
    <td><span class=${`pstate ${tone}`}>${label}</span></td>
    <td class="small">${p ? p.session || '-' : '-'}</td>
    <td class="small num">${p ? fmtShort(p.startedAt) : '-'}</td>
    <td class="small num">${p ? fmtShort(p.deadline) : '-'}</td>
    <td>${p ? html`<span class="mono small">${p.task.id}</span> ${p.task.title}` : '-'}</td>
    <td>${s ? html`<a href=${s.url} target="_blank" rel="noopener">${s.url.replace('https://github.com/', '')}</a>
      <div class="small"><span class="mono">${s.sha.slice(0, 7)}</span> · ${fmtShort(s.at)}${s.check && s.check.state === 'warn'
        ? html` · <span class="flag" title=${s.check.message}>확인 필요</span>` : ''}</div>` : '-'}</td>
    <td class="small">${s ? html`<a href=${s.file} target="_blank" rel="noopener">${sizeText(s.size)}</a>` : '-'}</td>
  </tr>`;
}

/**
 * 세션 코드 칸(관리자 [예선] 탭과 강사 화면이 같이 쓴다): 회차 이름으로 만들기 → 크게 보기, 지금 끝내기, 코드마다 시작한 팀
 * (이름·첫 제출 여부). call(action, payload, 성공 알림)은 새 현황을 돌려주고, 실패하면 null.
 */
export function SessionCodes({ data, busy, call }) {
  const [label, setLabel] = useState('');
  const [big, setBig] = useState(null);
  const create = async (e) => {
    e.preventDefault();
    const res = await call('adminPrelimSession', { label: label.trim() }, '세션 코드를 만들었습니다.');
    if (res) {
      setLabel('');
      setBig(res.sessions[0]);
    }
  };
  const end = (x) => {
    if (confirm(`${x.label} 세션 코드를 지금 끝낼까요? 이 코드로는 더 이상 예선을 시작할 수 없습니다.`)) {
      call('adminPrelimSessionEnd', { id: x.id }, '세션 코드를 끝냈습니다.');
    }
  };
  return html`<section class="panel">
      <div class="panel-h"><h2>세션 코드</h2><span class="small muted">회차마다 새로 만듭니다 · 만든 때부터 ${data.codeHours}시간 유효</span></div>
      <form class="btn-row" onSubmit=${create}>
        <input class="input" style="max-width:280px" maxlength="30" placeholder="회차 이름(예: 10/12(월) 1회차)" aria-label="회차 이름"
          value=${label} onInput=${(e) => setLabel(e.target.value)} />
        <button class="btn btn-primary" type="submit" disabled=${busy || label.trim().length < 2}>세션 코드 만들기</button>
      </form>
      ${data.sessions.length ? html`<div class="table-box"><table class="dtable">
        <thead><tr><th>회차</th><th>코드</th><th>만든 시각</th><th>유효</th><th>시작한 팀</th><th>팀(첫 제출)</th><th></th></tr></thead>
        <tbody>${data.sessions.map((x) => html`<tr>
          <td>${x.label}</td>
          <td class="codeline">${x.code}</td>
          <td class="small num">${fmtShort(x.createdAt)}</td>
          <td class="small num">${x.active ? `${fmtShort(x.expiresAt)}까지` : x.endedAt ? `끝냄 ${fmtShort(x.endedAt)}` : '만료'}</td>
          <td class="num">${x.started}</td>
          <td class="small">${x.teams.length ? x.teams.map((t, i) => html`${i ? ', ' : ''}${t.name}${t.submitted ? '' : html` <span class="flag">제출 전</span>`}`) : '-'}</td>
          <td class="nowrap">${x.active ? html`<button class="link-btn" onClick=${() => setBig(x)}>크게 보기</button>${' · '}<button class="link-btn" disabled=${busy} onClick=${() => end(x)}>지금 끝내기</button>` : ''}</td>
        </tr>`)}</tbody>
      </table></div>` : html`<p class="small muted" style="margin:0">아직 만든 세션 코드가 없습니다.</p>`}
      <p class="small muted" style="margin:0">교육 2:40(예선 시작) 전에는 코드를 화면에 띄우지 않습니다. 회차가 끝나면 [지금 끝내기]를 누릅니다. 교육 기간 안에 시작하지 않은 팀은 탈락입니다.</p>
    </section>
    ${big ? html`<${Modal} title=${`세션 코드 · ${big.label}`} onClose=${() => setBig(null)} wide>
      <p class="code-huge">${big.code}</p>
      <p class="small muted" style="text-align:center">${fmtShort(big.expiresAt)}까지 유효 · 「내 신청」 → [예선 시작]에 넣습니다.</p>
    <//>` : ''}`;
}

/** 강사 코드(하나): 만들기·다시 만들기(예전 코드와 그 로그인 무효)·없애기. 코드는 만든 순간에만 보여 준다. */
function TeachCodePanel({ data, busy, call }) {
  const [shown, setShown] = useState('');
  const url = `${location.origin}${location.pathname}#/teach`;
  const make = async () => {
    if (data.teach.on && !confirm('강사 코드를 다시 만들까요? 예전 코드와 그 코드로 들어간 강사 화면은 더 이상 쓸 수 없습니다.')) return;
    const res = await call('adminTeachCode', {}, '강사 코드를 만들었습니다.');
    if (res) setShown(res.teachCode);
  };
  const off = () => {
    if (confirm('강사 코드를 없앨까요? 강사 화면에 더 이상 들어갈 수 없습니다.')) call('adminTeachCode', { off: true }, '강사 코드를 없앴습니다.');
  };
  return html`<section class="panel">
      <div class="panel-h"><h2>강사 코드</h2><span class="small muted">강사가 강사 화면에서 세션 코드를 직접 만들고 끝낼 때 씁니다</span></div>
      <div class="btn-row">
        ${data.teach.on ? html`<span class="pstate ok">있음</span><span class="small muted">${fmtShort(data.teach.at)} 발급</span>` : html`<span class="pstate">없음</span>`}
        <button class="btn btn-sm" disabled=${busy} onClick=${make}>${data.teach.on ? '다시 만들기' : '강사 코드 만들기'}</button>
        ${data.teach.on ? html`<button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${off}>없애기</button>` : ''}
      </div>
      <p class="small muted" style="margin:0">강사 화면(<span class="mono">${url}</span>, 사이트 맨 아래 [강사 화면])에는 세션 코드와 코드마다 시작한 팀 이름·첫 제출 여부만 보입니다. 과제와 개인정보는 보이지 않습니다.</p>
    </section>
    ${shown ? html`<${Modal} title="강사 코드" onClose=${() => setShown('')} wide>
      <p class="code-huge" style="font-size:clamp(32px,8vw,72px)">${shown}</p>
      <p class="small" style="text-align:center">이 코드는 지금만 보입니다. 강사에게 전해 주세요. 강사 화면: <span class="mono">${url}</span></p>
    <//>` : ''}`;
}

export function PrelimTab({ reload }) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, run] = useBusy();

  const load = async () => {
    try {
      setData(await api('adminPrelim', { token: token() }));
      setError('');
    } catch (err) {
      if (err.code === 'AUTH') reload();   // 로그인이 끊겼다 — 관리자 화면이 로그인으로 돌아간다
      else setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);
  useInterval(load, 60000);

  const call = (action, payload, done) => run(async () => {
    try {
      const res = await api(action, { token: token(), ...payload });
      setData(res);
      notify(done);
      return res;
    } catch (err) {
      if (err.code === 'AUTH') { reload(); return null; }
      notify(err.message, 'err');
      if (err.ambiguous) load();   // 반영됐는지 모른다 — 목록을 다시 읽는다
      return null;
    }
  });

  if (!data) {
    return error ? html`<div class="notice bad"><b>불러오지 못했습니다.</b> ${error} <button class="link-btn" onClick=${load}>다시 시도</button></div>`
      : html`<p class="muted">불러오는 중…</p>`;
  }
  const counts = {};
  data.teams.forEach((t) => { const k = teamState(t); counts[k] = (counts[k] || 0) + 1; });
  const shown = data.teams.filter((t) => !filter || teamState(t) === filter);

  return html`<div class="stack">
    <${SessionCodes} data=${data} busy=${busy} call=${call} />

    <section class="panel">
      <div class="panel-h"><h2>팀별 진행</h2>
        <div class="btn-row"><span class="small muted">남은 과제 ${data.tasks.total - data.tasks.drawn}/${data.tasks.total} · ${fmtShort(data.now)} 기준</span>
          <button class="btn btn-sm" disabled=${busy} onClick=${load}>새로 고침</button></div>
      </div>
      <div class="chips">
        <button class="chip" aria-pressed=${filter === '' ? 'true' : 'false'} onClick=${() => setFilter('')}>전체 ${data.teams.length}</button>
        ${Object.keys(STATE).map((k) => html`<button class="chip" aria-pressed=${filter === k ? 'true' : 'false'} onClick=${() => setFilter(k)}>${STATE[k][0]} ${counts[k] || 0}</button>`)}
      </div>
      <div class="table-box"><table class="dtable">
        <thead><tr><th>팀</th><th>진행</th><th>세션</th><th>시작</th><th>마감</th><th>과제</th><th>마지막 제출</th><th>보관본</th></tr></thead>
        <tbody>${shown.map((t) => html`<${TeamRow} key=${t.id} t=${t} />`)}</tbody>
      </table></div>
      <p class="small muted" style="margin:0">심사는 각 팀 마지막 제출의 보관본(제출 순간 커밋의 압축 파일, 신청서 폴더)으로만 합니다. 마감은 마감 시각의 그 분이 끝날 때까지입니다.</p>
    </section>

    <${JudgePanel} reload=${reload} />

    <${TeachCodePanel} data=${data} busy=${busy} call=${call} />
  </div>`;
}
