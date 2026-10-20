// 관리자 · 예선 심사(gas/PrelimJudge.js, 심사 도구: 운영 담당 컴퓨터의 gjc). ① 심사 묶음 받기(모든 팀 마감 뒤, 개인정보를 가린 제출본 JSON)
// → ② 운영 담당 컴퓨터에서 node tools/judge.mjs prepare 로 채점 폴더를 만들고, gjc 가 tools/JUDGING.md 대로 팀마다 앱을 직접 열어
// 3번 채점한 뒤 collect 로 scores.json 을 만든다 → ③ scores.json 올리기 → ④ 순위·갈림·동점 확인, 규칙을 어긴 팀은 심사 제외(사유)
// → ⑤ 선발 확정(본선 진출·예비·미선발을 칸반에 반영) → [설정]에서 본선 진출 발표(그 뒤로는 잠긴다).
import {
  html, useState, useEffect, useApp, api, session, fmtShort, copyText, saveFile,
} from '../lib.js';
import { Modal, useBusy } from '../ui.js';

const token = () => session.get('admin');
/** 운영 담당 컴퓨터가 Windows 면 채점 명령을 PowerShell 모양으로 보인다(~ 를 풀지 않는다). */
const WINDOWS = /^win/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');

/** 팀의 심사 단계(서버 judgeTeamState_)와 표시(이름, 색). */
const STATE = {
  scored: ['채점됨', 'ok'],
  unscored: ['채점 전', 'warn'],
  unbundled: ['묶음에 없음', 'warn'],
  out: ['심사 제외', 'bad'],
  missed: ['미제출', 'bad'],
  running: ['진행 중', 'warn'],
  idle: ['미시작', ''],
};
const STATUS = { submitted: '접수 완료', selected: '본선 진출', waitlist: '예비', rejected: '미선발' };

function Row({ t, rubric, busy, locked, onOut, onIn }) {
  const [label, tone] = STATE[t.state] || [t.state, ''];
  const spread = t.spread.map((k) => (k === 'total' ? '총점' : (rubric.find((c) => c.key === k) || { label: k }).label));
  const runs = t.runs.map((r, i) => `${i + 1}회 ${r.join(' / ')} = ${r.reduce((a, x) => a + x, 0)}점`).join('\n');
  return html`<tr>
    <td class="num">${t.rank || '-'}${t.tie ? html` <span class="flag">동점</span>` : ''}</td>
    <td class="mono">${t.code || '-'}</td>
    <td>${t.name}<div class="small muted">${t.dept}</div></td>
    <td><span class=${`pstate ${tone}`}>${label}</span>${t.out ? html`<div class="small muted wrap-cell">${t.out}</div>` : ''}</td>
    ${rubric.map((c, i) => html`<td class="num">${t.avg ? t.avg[i] : '-'}</td>`)}
    <td class="num" title=${runs}><b>${t.total === null ? '-' : t.total}</b></td>
    <td class="small">${spread.length ? html`<span class="flag" title="3번의 채점이 크게 갈린 항목 — 근거(report.md)를 확인하세요">갈림: ${spread.join(', ')}</span>` : ''}</td>
    <td class="small">${STATUS[t.status] || t.status}</td>
    <td class="nowrap">${locked ? '' : ['scored', 'unscored', 'unbundled'].includes(t.state)
      ? html`<button class="link-btn" disabled=${busy} onClick=${() => onOut(t)}>제외</button>`
      : t.state === 'out' ? html`<button class="link-btn" disabled=${busy} onClick=${() => onIn(t)}>제외 풀기</button>` : ''}</td>
  </tr>`;
}

function OutDialog({ team, busy, onSave, onClose }) {
  const [reason, setReason] = useState('');
  return html`<${Modal} title=${`심사 제외 · ${team.code} ${team.name}`} onClose=${onClose}>
    <div class="stack" style="gap:12px">
      <p style="margin:0">예선 규칙을 어긴 팀(과제 공유, 다른 팀 앱·코드 베끼기, 실제 개인정보·비밀값 사용, 심사 조작 시도 등)을 순위에서 뺍니다. 선발 확정 때 미선발이 됩니다.</p>
      <textarea class="textarea" rows="3" maxlength="200" placeholder="사유(관리자만 봅니다)" aria-label="제외 사유" value=${reason}
        onInput=${(e) => setReason(e.target.value)}></textarea>
      <p class="small muted" style="margin:0">팀원에게는 사유 없이 '운영 담당 판정으로 심사에서 제외되었습니다.'만 보입니다.</p>
      <div class="btn-row">
        <button class="btn btn-primary" disabled=${busy || !reason.trim()} onClick=${() => onSave(reason.trim())}>제외</button>
        <button class="btn btn-ghost" onClick=${onClose}>닫기</button>
      </div>
    </div>
  <//>`;
}

function FinalizeDialog({ data, busy, onSave, onClose }) {
  const ranked = data.teams.filter((t) => t.rank).sort((a, b) => a.rank - b.rank);
  const selected = ranked.slice(0, data.selectTarget);
  const wait = ranked.slice(data.selectTarget);
  const rest = data.teams.filter((t) => !t.rank);
  const names = (list) => list.map((t) => `${t.code ? `${t.code} ` : ''}${t.name}`).join(', ') || '없음';
  return html`<${Modal} title="선발 확정" onClose=${onClose} wide>
    <div class="stack" style="gap:12px">
      <dl class="facts">
        <dt>본선 진출 ${selected.length}</dt><dd>${names(selected)}</dd>
        <dt>예비 ${wait.length}</dt><dd>${names(wait)}<small>이 순서가 예비 순번입니다.</small></dd>
        <dt>미선발 ${rest.length}</dt><dd>${names(rest)}<small>시작하지 않았거나 제출하지 않았거나 심사에서 제외된 팀</small></dd>
      </dl>
      <p style="margin:0">접수한 모든 팀의 상태를 이대로 바꿉니다(칸반에서 손으로 옮긴 것도 덮어씁니다). 발표 전에는 다시 확정할 수 있고, 팀원에게는 [설정] → 본선 진출 발표를 켜야 보입니다.</p>
      <div class="btn-row">
        <button class="btn btn-primary" disabled=${busy} onClick=${onSave}>${busy ? '확정하는 중…' : '확정'}</button>
        <button class="btn btn-ghost" onClick=${onClose}>닫기</button>
      </div>
    </div>
  <//>`;
}

export function JudgePanel({ reload }) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState('');
  const [outTeam, setOutTeam] = useState(null);
  const [finalize, setFinalize] = useState(false);
  const [progress, setProgress] = useState('');
  const [busy, run] = useBusy();

  const load = async () => {
    try {
      setData(await api('adminPrelimJudge', { token: token() }));
      setError('');
    } catch (err) {
      if (err.code === 'AUTH') reload();
      else setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);

  /** 요청 → 새 심사 현황. 실패하면 알리고 null. */
  const call = (action, payload, done) => run(async () => {
    try {
      const board = await api(action, { token: token(), ...payload });
      setData(board);
      if (done) notify(done);
      return board;
    } catch (err) {
      if (err.code === 'AUTH') { reload(); return null; }
      notify(err.message, 'err');
      if (err.ambiguous) load();   // 반영됐는지 모른다 — 다시 읽는다
      return null;
    }
  });

  if (!data) {
    return error ? html`<div class="notice bad"><b>예선 심사를 불러오지 못했습니다.</b> ${error} <button class="link-btn" onClick=${load}>다시 시도</button></div>`
      : html`<p class="muted">불러오는 중…</p>`;
  }
  const c = data.counts;
  const locked = data.published;
  const ties = data.teams.filter((t) => t.tie).map((t) => t.code);
  const scoredNow = !!data.bundleId && data.scoredBundle === data.bundleId;
  const name = file || 'prelim-judge-bundle-….json';
  const cmd = WINDOWS ? `node tools\\judge.mjs prepare "$env:USERPROFILE\\Downloads\\${name}"` : `node tools/judge.mjs prepare ~/Downloads/${name}`;
  const blockers = [];
  if (c.running) blockers.push(`아직 마감되지 않은 팀이 ${c.running}팀 있습니다.`);
  if (c.unbundled) blockers.push(`심사 묶음에 들어가지 않은 제출이 ${c.unbundled}팀 있습니다. 묶음을 다시 받아 처음부터 채점해 올려 주세요.`);
  if (!c.unbundled && !scoredNow) blockers.push(data.bundleId ? '지금 심사 묶음의 점수를 아직 올리지 않았습니다.' : '심사 묶음을 아직 받지 않았습니다.');
  if (ties.length) blockers.push(`모든 항목 점수가 같은 팀: ${ties.join(', ')} — 이 팀만 다시 채점(node tools/judge.mjs prepare <묶음 파일> --redo ${ties.join(',')} → gjc 로 채점 → collect)해 점수를 다시 올려 주세요.`);

  /** 묶음의 머리(심사 번호)를 받고 팀마다 한 번씩 받아 한 파일로 내려받는다. 한 팀이라도 못 받으면 내려받지 않는다. */
  const getBundle = () => run(async () => {
    try {
      const { bundle, filename, codes, ...board } = await api('adminPrelimBundle', { token: token() });
      setData(board);
      const teams = [];
      for (const code of codes) {
        setProgress(`${teams.length + 1}/${codes.length}팀`);
        teams.push((await api('adminPrelimBundleTeam', { token: token(), code, bundleId: bundle.bundleId })).team);
      }
      saveFile(filename, new Blob([JSON.stringify({ ...bundle, teams })], { type: 'application/json' }));
      setFile(filename);
      notify(`심사 묶음을 내려받았습니다: ${filename}`);
    } catch (err) {
      if (err.code === 'AUTH') { reload(); return; }
      notify(err.code === 'STALE' || err.code === 'STATE' || err.code === 'LOCKED' ? err.message
        : `심사 묶음을 다 받지 못했습니다. 다시 눌러 주세요. (${err.message})`, 'err');
      load();
    } finally {
      setProgress('');
    }
  });
  const upload = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let scores;
    try {
      scores = JSON.parse(await f.text());
    } catch (err) {
      notify('scores.json 을 읽지 못했습니다(JSON 이 아닙니다).', 'err');
      return;
    }
    await call('adminPrelimScores', { scores }, '점수를 올렸습니다. 순위와 표시를 확인하세요.');
  };
  const saveOut = async (reason) => {
    if (await call('adminPrelimOut', { teamId: outTeam.id, reason }, `${outTeam.name} 팀을 심사에서 제외했습니다.`)) setOutTeam(null);
  };
  const saveIn = (t) => {
    if (confirm(`${t.name} 팀의 심사 제외를 풀까요?`)) call('adminPrelimOut', { teamId: t.id, reason: '' }, `${t.name} 팀의 심사 제외를 풀었습니다.`);
  };
  const saveFinal = async () => {
    if (await call('adminPrelimFinalize', {}, '선발을 확정했습니다. 칸반에서 확인한 뒤 [설정]에서 본선 진출을 발표하세요.')) {
      setFinalize(false);
      reload();
    }
  };

  return html`<section class="panel">
    <div class="panel-h"><h2>예선 심사</h2>
      <div class="btn-row"><span class="small muted">gjc 가 팀마다 ${data.runs}번 채점한 평균 · 본선 ${data.selectTarget}팀 · ${fmtShort(data.now)} 기준</span>
        <button class="btn btn-sm" disabled=${busy} onClick=${load}>새로 고침</button></div>
    </div>
    ${locked ? html`<div class="notice">본선 진출을 발표해 예선 심사가 잠겼습니다. 보기만 됩니다.</div>` : ''}
    <div class="chips">${Object.keys(STATE).filter((k) => c[k]).map((k) => html`<span class=${`pstate ${STATE[k][1]}`}>${STATE[k][0]} ${c[k]}</span>`)}</div>
    <ol class="jsteps">
      <li><b>심사 묶음 받기</b> 예선을 시작한 모든 팀의 마감이 지난 뒤에 받습니다. 성명·학번·연락처·이메일·학과·팀명·프로젝트명·GitHub 계정과 저장소 이름을 가린 제출본(JSON)이고, 팀에는 무작위 심사 번호가 붙습니다. 앱 주소는 채점할 때 열어 봐야 하므로 가리지 않습니다. 팀마다 차례로 읽어 한 파일로 묶습니다.
        <div class="btn-row"><button class="btn btn-sm btn-primary" disabled=${busy || locked || !!c.running} onClick=${getBundle}>${busy ? (progress ? `팀 읽는 중 ${progress}` : '처리 중…') : '심사 묶음 받기'}</button>
          <span class="small muted">${data.bundledAt ? `묶음 ${data.bundleId} · ${fmtShort(data.bundledAt)} 받음` : '아직 받지 않음'}</span></div></li>
      <li><b>gjc 로 채점</b> 운영 PC 의 이 저장소 폴더에서 <code class="ic">${'node tools/judge.mjs prepare <묶음 파일>'}</code> 로 채점 폴더(judge-${data.bundleId || '<묶음 번호>'}/)를 만든 뒤, gjc 에게 "tools/JUDGING.md 대로 채점해" 라고 시킵니다. gjc 가 팀마다 앱을 직접 열어 3번 채점하고 <code class="ic">${'node tools/judge.mjs collect <채점 폴더>'}</code> 로 scores.json 과 report.md 를 만듭니다. GitHub 저장소만 낸 팀을 실행해 보려면 Docker Desktop 을 켜 둡니다.
        <div class="btn-row"><code class="cmd">${cmd}</code><button class="btn btn-sm" onClick=${async () => notify((await copyText(cmd)) ? '명령을 복사했습니다.' : '복사하지 못했습니다.')}>복사</button></div></li>
      <li><b>점수 올리기</b> scores.json 을 고릅니다. 묶음 번호가 지금과 같고 모든 팀의 점수가 맞아야 한 번에 반영합니다.
        <div class="btn-row"><label class="btn btn-sm" aria-disabled=${busy || locked ? 'true' : 'false'}>scores.json 고르기<input type="file" accept=".json,application/json" hidden disabled=${busy || locked} onChange=${upload} /></label>
          <span class="small muted">${data.scoredAt ? `${fmtShort(data.scoredAt)} 올림${scoredNow ? '' : ' — 지난 묶음의 점수입니다'}` : '아직 올리지 않음'}</span></div></li>
      <li><b>확인·제외</b> 아래 표에서 순위와 갈림(3번의 채점이 크게 다름)·동점을 보고, 의심스러우면 근거(report.md)와 제출본을 확인합니다. 규칙을 어긴 팀은 [제외]합니다.</li>
      <li><b>선발 확정</b> 1~${data.selectTarget}위 본선 진출, 나머지 채점 팀은 순위대로 예비, 시작·제출하지 않았거나 제외된 팀은 미선발로 칸반에 반영합니다. 발표 전까지 다시 확정할 수 있습니다.
        <div class="btn-row"><button class="btn btn-sm btn-primary" disabled=${busy || locked || blockers.length > 0} onClick=${() => setFinalize(true)}>선발 확정</button>
          <span class="small muted">${data.finalizedAt ? `${fmtShort(data.finalizedAt)} 확정함` : '아직 확정하지 않음'}</span></div>
        ${!locked && blockers.length ? html`<ul class="bullets small" style="margin-top:6px">${blockers.map((b) => html`<li>${b}</li>`)}</ul>` : ''}</li>
    </ol>
    <div class="table-box"><table class="dtable">
      <thead><tr><th>순위</th><th>번호</th><th>팀</th><th>심사</th>${data.rubric.map((r) => html`<th title=${r.desc}>${r.label} ${r.max}</th>`)}<th>총점</th><th>표시</th><th>상태</th><th></th></tr></thead>
      <tbody>${data.teams.map((t) => html`<${Row} key=${t.id} t=${t} rubric=${data.rubric} busy=${busy} locked=${locked} onOut=${setOutTeam} onIn=${saveIn} />`)}</tbody>
    </table></div>
    <p class="small muted" style="margin:0">총점은 항목별 3회 평균의 합입니다(총점 칸에 마우스를 올리면 3번의 점수). 동점이면 ${data.rubric.map((r) => r.label).join(' → ')} 순으로 가리고, 그래도 같으면 그 팀들만 다시 채점합니다.</p>
    ${outTeam ? html`<${OutDialog} team=${outTeam} busy=${busy} onSave=${saveOut} onClose=${() => setOutTeam(null)} />` : ''}
    ${finalize ? html`<${FinalizeDialog} data=${data} busy=${busy} onSave=${saveFinal} onClose=${() => setFinalize(false)} />` : ''}
  </section>`;
}
