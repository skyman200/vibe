// 관리자 · 본선 코드 심사(gas/FinalsJudge.js). ① 마감 커밋 기록(마감 1초 뒤 자동, 빠진 팀만 손으로) → ② [AI 채점 시작] → ③ [점수 올리기]:
// 이 화면의 버튼이 운영 담당 컴퓨터의 채점 도우미(tools/judge-finals-app.mjs — admin-code-judge-helper.js 가 부른다)를 움직인다. 도우미가
// 서버에서 개인정보·비밀값을 가린 코드 심사 묶음을 받아 그 컴퓨터의 gjc 로 팀마다 3번 채점하고, [점수 올리기]로 항목별 3회 평균을 올린다
// → 갈림·출처를 보고 필요하면 팀 상세에서 직접 고친다. 대면 심사는 심사위원 화면에서 따로.
import { html, useState, useEffect, useRef, useApp, api, session, fmtShort, fmtWhen } from '../lib.js';
import { Modal, useBusy } from '../ui.js';
import { AiCell, HelperLink, failures, progressText, runCounter, useJudgeHelper } from './admin-code-judge-helper.js';

const token = () => session.get('admin');

/** 팀의 코드 심사 단계(서버 finalsTeamState_)와 표시(이름, 색). */
const STATE = {
  scored: ['채점됨', 'ok'],
  unscored: ['채점 전', 'warn'],
  unbundled: ['묶음 전', 'warn'],
  unpinned: ['마감 커밋 없음', 'bad'],
  norepo: ['저장소 없음', 'bad'],
  open: ['제출 중', ''],
};
/** 지금 코드 심사 점수의 출처(서버 finalsJudgeBoard_). */
const SOURCE = { ai: 'AI 3회 평균', manual: '직접 입력', 'ai-old': '지난 커밋의 AI 점수' };

/** 마감 커밋 자동 기록(마감 1초 뒤 트리거) 예약 상태. 예약이 빠졌으면 마감 시각의 커밋을 기록할 수 없으므로 크게 알린다. */
function PinSchedule({ pin, busy, onFix }) {
  if (pin.state === 'passed') return '';
  if (pin.state === 'scheduled') return html`<p class="small muted" style="margin:0">마감 커밋은 ${fmtWhen(pin.at)}에 자동으로 기록합니다.</p>`;
  return html`<div class="notice bad" role="alert"><b>마감 커밋 자동 기록이 예약되어 있지 않습니다.</b> 이대로면 마감 시각의 커밋을 기록하지 못합니다.
    <button type="button" class="link-btn" disabled=${busy} onClick=${onFix}>다시 예약</button></div>`;
}

function Row({ t, rubric, openTeam, ai }) {
  const [label, tone] = STATE[t.state] || [t.state, ''];
  const spread = t.spread.map((k) => (k === 'total' ? '총점' : (rubric.find((c) => c.key === k) || { label: k }).label));
  const runs = t.runs.map((r, i) => `${i + 1}회 ${r.join(' / ')} = ${r.reduce((a, x) => a + x, 0)}점`).join('\n');
  return html`<tr>
    <td class="num">${t.order || '-'}</td>
    <td><button class="link-btn" onClick=${() => openTeam(t.id)}>${t.name}</button>
      ${t.state !== 'open' && !t.final ? html`<div class="small muted">최종 제출 안 함</div>` : ''}</td>
    <td>${t.repo ? html`<a href=${t.repo} target="_blank" rel="noopener">${t.repo.replace('https://github.com/', '')}</a>` : html`<span class="muted">미제출</span>`}</td>
    <td class="mono small">${t.pinned || '-'}${t.pinNote ? html`<div class="small muted wrap-cell">${t.pinNote}</div>` : ''}</td>
    <td class="mono">${t.code || '-'}</td>
    <td><span class=${`pstate ${tone}`}>${label}</span></td>
    ${rubric.map((c) => html`<td class="num">${t.score[c.key] === null ? '-' : t.score[c.key]}</td>`)}
    <td class="num" title=${runs}><b>${t.score.total === null ? '-' : t.score.total}</b></td>
    <td class="small">${t.source ? SOURCE[t.source] || t.source : ''}
      ${t.overrode ? html` <span class="flag" title=${`팀 상세에서 직접 입력한 점수(${fmtShort(t.overrode)})를 이 AI 점수로 바꿨습니다. 고친 점수가 맞으면 팀 상세에서 다시 입력하세요.`}>직접 입력을 바꿈</span>` : ''}
      ${spread.length ? html` <span class="flag" title="3번의 채점이 크게 갈린 항목 — 근거([보고서 보기])를 확인하세요">갈림: ${spread.join(', ')}</span>` : ''}</td>
    ${ai}
  </tr>`;
}

/** ② AI 채점 칸의 도우미 부분: 도우미 정보 · 알림 · [AI 채점 시작]/[이어서 채점] · [멈추기] · 개인정보 확인 · 메모 · 실패 까닭. */
function JudgeControls({ st, board, busy, act, forget }) {
  const count = runCounter(st.work);
  const started = count('done') > 0;
  const fails = failures(st.work);
  const canJudge = !busy && !st.busy && !board.open && !board.locked;
  return html`
    <p class="small muted" style="margin:6px 0 0">채점 도우미${st.practice ? '(연습)' : ''}: ${st.server} · 채점 폴더 <code class="ic">${st.folder}</code> · ${st.gjc.ok === false ? html`<b class="flag">${st.gjc.text}</b>` : st.gjc.text}
      · <button type="button" class="link-btn small" onClick=${forget}>이 브라우저에서 연결 그만두기</button></p>
    ${st.error ? html`<div class="notice bad" role="alert">${st.error}</div>` : ''}
    ${st.notice ? html`<div class="notice ok" role="status">${st.notice}</div>` : ''}
    <div class="btn-row">
      <button type="button" class="btn btn-sm btn-primary" disabled=${!canJudge} onClick=${() => act('start')}
        title=${board.open ? '제출 마감 뒤에 채점할 수 있습니다' : board.locked ? '심사를 마감해 잠겼습니다' : '바뀐 팀·끝나지 않은 회차만 채점합니다'}>${started && count('done') < count.total ? '이어서 채점' : 'AI 채점 시작'}</button>
      ${st.judging || st.phase === 'fetch' || st.phase === 'redo' ? html`<button type="button" class="btn btn-sm" disabled=${st.stopping} onClick=${() => act('stop')}>멈추기</button>` : ''}
      <span class="small" role="status">${progressText(st) || (board.open ? `제출 마감(${fmtWhen(board.deadline)}) 뒤에 눌러집니다.` : board.locked ? '심사를 마감해 잠겼습니다.' : '')}</span>
    </div>
    ${st.pii ? html`<div class="notice warn" role="alert"><b>개인정보처럼 보이는 글이 남아 있어 채점 전에 멈췄습니다.</b> 서버의 가리기가 놓친 것일 수 있습니다.
      예시 값(가짜 번호·이메일)이면 [그대로 채점], 진짜 개인정보로 보이면 [취소]하고 그 팀 저장소를 확인하세요.
      <ul>${st.pii.slice(0, 40).map((x) => html`<li>${x}</li>`)}${st.pii.length > 40 ? html`<li>그 밖에 ${st.pii.length - 40}곳</li>` : ''}</ul>
      <div class="btn-row" style="margin-top:8px"><button type="button" class="btn btn-sm btn-primary" disabled=${busy || st.busy} onClick=${() => act('start', { force: true })}>그대로 채점</button>
        <button type="button" class="btn btn-sm" disabled=${busy} onClick=${() => act('cancel')}>취소</button></div></div>` : ''}
    ${st.notes.length ? html`<ul class="bullets small">${st.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
    ${st.secrets.length ? html`<details class="small"><summary>비밀값처럼 보이는 글 ${st.secrets.length}곳(코드 품질에서 봅니다)</summary><ul>${st.secrets.map((x) => html`<li>${x}</li>`)}</ul></details>` : ''}
    ${fails.length ? html`<ul class="bullets small">${fails.map((f) => html`<li class=${f.state === 'wait' ? 'flag' : 'ai-bad'}>${f.code} ${f.n}회${f.state === 'wait' ? '(다시 시도 대기)' : ''}: ${f.why}</li>`)}</ul>` : ''}`;
}

/** ③ 점수 올리기 칸의 도우미 부분: 올리기 전에 살펴볼 것 · [점수 올리기] · [보고서 보기] · [채점 폴더 열기]. */
function UploadControls({ st, board, busy, act, upload, report }) {
  const res = st.result;
  const moved = !!(res && res.ok && res.bundleId !== board.bundleId);
  const canUpload = !busy && !st.busy && !board.open && !board.locked && !!(res && res.ok) && !moved;
  return html`
    ${moved ? html`<div class="notice warn">채점한 뒤 서버의 코드 심사 묶음이 바뀌었습니다(팀이 들어오거나 마감 커밋이 바뀜). [AI 채점 시작]을 다시 누르면 바뀐 팀만 다시 채점합니다.</div>` : ''}
    ${res && res.ok ? html`<div class="small">올리기 전에 살펴볼 것: ${res.look.length ? html`<ul class="bullets small">${res.look.map((l) => html`<li>${l.replace(/^- /, '')}</li>`)}</ul>` : '없음'}</div>`
      : res ? html`<div class="notice bad">채점하지 못한 회차가 있어 올릴 수 없습니다(문제 ${res.count}개):<ul>${res.problems.map((p) => html`<li>${p}</li>`)}</ul></div>` : ''}
    <div class="btn-row">
      <button type="button" class="btn btn-sm btn-primary" disabled=${!canUpload} onClick=${upload}>점수 올리기</button>
      <button type="button" class="btn btn-sm" disabled=${busy || !(res && res.ok)} onClick=${report}>보고서 보기</button>
      <button type="button" class="btn btn-sm" disabled=${busy || !st.work} onClick=${() => act('open')}>채점 폴더 열기</button>
    </div>`;
}

/**
 * [심사] 탭의 코드 심사(50). pin: 관리자 화면의 마감 커밋 자동 기록 예약 상태, reload: 관리자 화면 다시 읽기(점수·결과 표),
 * stamp: 관리자 화면의 자료 — 관리자 화면을 다시 읽을 때마다(심사 마감, 팀 상세에서 고친 코드 점수·저장소·마감 커밋 등) 이 표도 다시 읽는다.
 * 고친 시각은 초 단위라 시각·값으로 견주면 같은 초의 수정을 놓친다(관리자 화면은 스스로 다시 읽지 않으니 요청이 늘지 않는다).
 * 도우미가 묶음을 받거나 점수를 올리면 이 표를 다시 읽는다.
 */
export function CodeJudgePanel({ pin, reload, openTeam, stamp }) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const [reportText, setReportText] = useState(null);
  const seq = useRef(0);

  /** 코드 심사 현황 읽기. 늦게 온 예전 답이 새 답을 덮지 않게 마지막 요청의 답만 쓴다. */
  const load = async () => {
    const n = ++seq.current;
    try {
      const board = await api('adminFinalsJudge', { token: token() });
      if (n !== seq.current) return;
      setData(board);
      setError('');
    } catch (err) {
      if (n !== seq.current) return;
      if (err.code === 'AUTH') reload();
      else setError(err.message);
    }
  };
  useEffect(() => { load(); }, [stamp]);
  // 도우미의 일(묶음 받기·코드 다시 받기)이 끝나면 서버의 코드 심사 현황(묶음 받은 때·팀 단계)이 바뀌었으니 다시 읽는다
  const helper = useJudgeHelper({ onAuth: reload, onSettled: () => { load(); } });

  if (!data) {
    return error ? html`<section class="panel"><div class="notice bad"><b>코드 심사를 불러오지 못했습니다.</b> ${error} <button class="link-btn" onClick=${load}>다시 시도</button></div></section>`
      : html`<section class="panel"><p class="muted">불러오는 중…</p></section>`;
  }
  const c = data.counts;
  const scoredNow = !!data.bundleId && data.scoredBundle === data.bundleId;
  const st = helper.link === 'on' ? helper.st : null;
  const work = new Map(st && st.work ? st.work.teams.map((t) => [t.code, t]) : []);
  const notes = [];
  if (!data.open && c.unpinned) notes.push(`마감 커밋을 기록하지 못한 팀이 ${c.unpinned}팀 있습니다. [마감 커밋 기록]을 눌러 채운 뒤 채점하세요.`);
  if (!data.open && c.norepo) notes.push(`저장소를 내지 않은 팀이 ${c.norepo}팀 있습니다. AI 채점에 들어가지 않으니 팀 이름을 눌러 팀 상세에서 점수를 직접 넣으세요.`);
  if (c.unbundled) notes.push(`AI 채점에 들어가지 않은 팀이 ${c.unbundled}팀 있습니다. [AI 채점 시작]을 다시 누른 뒤(바뀐 팀만 다시 채점합니다) [점수 올리기]를 눌러 주세요.`);
  else if (c.unscored) notes.push(data.bundledAt ? `채점 전인 팀이 ${c.unscored}팀 있습니다(마감 커밋이 바뀐 팀 포함). [AI 채점 시작] → [점수 올리기]를 눌러 주세요.` : '아직 AI 채점을 하지 않았습니다([AI 채점 시작]).');

  const pinned = (res) => notify(res.pins.length
    ? `마감 커밋 기록 ${res.pins.filter((p) => p.ok).length}/${res.pins.length}팀`
    : '새로 기록할 팀이 없습니다(모두 마감 시각에 기록됨).');
  const recordPins = () => run(async () => {
    try {
      pinned(await api('adminPin', { token: token() }));
    } catch (err) {
      if (err.code === 'AUTH') { reload(); return; }
      if (err.code !== 'EARLY') notify(err.message, 'err');
      else if (confirm('아직 제출 마감 전입니다. 지금의 최신 커밋을 임시로 기록할까요? 마감 시각에 자동으로 다시 기록합니다.')) {
        try {
          pinned(await api('adminPin', { token: token(), force: true }));
        } catch (e) {
          notify(e.message, 'err');
        }
      }
    }
    await load();
    reload();
  });
  const fixPin = () => run(async () => {
    try {
      const res = await api('adminPinSchedule', { token: token() });
      const okay = res.deadlinePin.state === 'scheduled';
      notify(okay ? `마감 커밋 자동 기록을 ${fmtWhen(res.deadlinePin.at)}에 예약했습니다.` : '예약하지 못했습니다. 잠시 후 다시 시도해 주세요.', okay ? 'ok' : 'err');
    } catch (err) {
      notify(err.message, 'err');
    }
    reload();
  });

  /** 도우미 버튼. 거절(다른 일 중 등)은 알림으로, 일의 결과(오류·알림)는 도우미 칸에 남는다. */
  const act = (path, body) => run(async () => {
    const res = await helper.act(path, body);
    if (!res.ok && res.error && res.code !== 'AUTH') notify(res.error, 'err');
    return res;
  });
  const upload = () => {
    const warn = [];
    // 파일이 없어 AI 없이 0점인 팀(압축 파일 오류·빈 저장소) — 올리면 그 팀의 코드 심사 점수가 0점이 된다
    const empty = st.work ? st.work.teams.filter((t) => t.files === 0).map((t) => `${t.code}(${t.flags && t.flags.includes('압축 파일 오류') ? '코드를 받지 못함' : '빈 저장소'})`) : [];
    if (empty.length) warn.push(`AI 없이 0점인 팀: ${empty.join(', ')} — 올린 뒤 팀 상세에서 점수를 직접 넣을 수 있습니다(코드를 받지 못한 팀은 올리기 전에 [다시 채점]으로 다시 받아 볼 수 있습니다).`);
    // 팀 상세에서 직접 넣은 점수: 이번에 새로 채점한 팀이면 AI 점수로 바뀐다(지난번에 올린 채점과 같으면 서버가 그대로 둔다)
    const manual = data.teams.filter((t) => t.code && t.source === 'manual').map((t) => `${t.code}(${t.name})`);
    if (manual.length) warn.push(`직접 입력한 코드 심사 점수가 있는 팀: ${manual.join(', ')} — 그 팀을 이번에 새로 채점했으면 AI 점수로 바뀝니다(지난번에 올린 채점과 같으면 그대로 둡니다).`);
    if (warn.length && !confirm(`${warn.join('\n\n')}\n\n점수를 올릴까요?`)) return;
    // 올린 점수는 관리자 화면의 결과 표에도 들어간다 — 관리자 화면을 다시 읽으면 이 표도 다시 읽는다(stamp)
    act('upload').then((res) => { if (res && res.state) reload(); });
  };
  const report = () => act('report').then((res) => { if (res && res.ok) setReportText(res.text); });
  const redo = (code) => { if (confirm(`${code} 의 채점 3회를 지우고 다시 채점할까요?`)) act('redo', { code }); };
  const wipe = () => { if (confirm('채점 폴더를 통째로 지울까요? 시상이 끝난 뒤에만 지우세요.')) act('wipe'); };
  const status = [
    data.open ? `${fmtWhen(data.deadline)} 마감 뒤에 채점할 수 있습니다`
      : data.bundledAt ? `묶음 ${fmtShort(data.bundledAt)} 받음${data.bundledId === data.bundleId ? '' : ' — 그 뒤 묶음이 바뀌었습니다([AI 채점 시작]을 다시)'}` : '아직 채점하지 않음',
    data.scoredAt ? `점수 ${fmtShort(data.scoredAt)} 올림${scoredNow ? '' : ' — 지난 묶음의 점수입니다'}` : '',
  ].filter(Boolean).join(' · ');
  const redoOff = busy || !st || st.busy || data.open || data.locked;

  return html`<section class="panel">
    <div class="panel-h"><h2>코드 심사(50)</h2>
      <div class="btn-row"><span class="small muted">gjc 가 팀마다 ${data.runs}번 채점한 항목별 평균 · ${fmtShort(data.now)} 기준</span>
        <button class="btn btn-sm" disabled=${busy} onClick=${() => { load(); reload(); }}>새로 고침</button></div>
    </div>
    ${data.locked ? html`<div class="notice">심사를 마감해 코드 심사가 잠겼습니다. 보기만 됩니다(아래 최종 결과의 심사 마감을 풀면 다시 됩니다).</div>` : ''}
    <div class="chips">${Object.keys(STATE).filter((k) => c[k]).map((k) => html`<span class=${`pstate ${STATE[k][1]}`}>${STATE[k][0]} ${c[k]}</span>`)}</div>
    <ol class="jsteps">
      <li><b>마감 커밋 기록</b> 제출 마감(${fmtWhen(data.deadline)}) 1초 뒤 서버가 팀마다 main(기본) 브랜치의 최신 커밋을 자동으로 기록합니다. 연결 오류로 빠진 팀이나 저장소 주소를 고친 팀만 손으로 채웁니다.
        <${PinSchedule} pin=${pin} busy=${busy} onFix=${fixPin} />
        <div class="btn-row"><button class="btn btn-sm" disabled=${busy} onClick=${recordPins} title="기록이 없는 팀만 지금 채웁니다.">마감 커밋 기록</button></div></li>
      <li><b>AI 채점</b> 서버는 AI 를 부르지 않습니다. 운영 담당 컴퓨터(gjc 가 깔린 맥)의 채점 도우미가 서버에서 개인정보·비밀값을 가린 마감 커밋의 코드(팀 이름·저장소 주소·커밋 없이 무작위 심사 번호 F01…만)를 받아 gjc 로 팀마다 3번 채점합니다(팀 코드는 실행하지 않습니다).
        도우미는 그 컴퓨터의 이 저장소 폴더에서 <code class="ic">AI-code-judge.command</code> 를 한 번 더블클릭해 켜 둡니다(로그인할 때마다 저절로 켜짐). 버튼은 그 컴퓨터에서 연 이 화면에서 누릅니다.
        미리 해 보려면 <code class="ic">AI-code-judge-practice.command</code>(그 컴퓨터 안의 연습 서버 — 실제 점수와 상관없음).
        <${HelperLink} link=${helper.link} fail=${helper.fail} connect=${helper.connect} forget=${helper.forget} />
        ${st ? html`<${JudgeControls} st=${st} board=${data} busy=${busy} act=${act} forget=${helper.forget} />` : ''}</li>
      <li><b>점수 올리기 · 확인</b> 채점이 끝나면 살펴볼 것을 보고 [점수 올리기]를 누릅니다. 갈림(3번의 채점이 크게 다름)이 있으면 [보고서 보기]에서 근거를 봅니다. 고칠 점수는 팀 이름을 눌러 팀 상세에서 직접 고칩니다(출처 '직접 입력' — 같은 채점을 다시 올려도 그대로 남고, 그 팀을 다시 채점해 올리면 새 AI 점수로 바뀌며 '직접 입력을 바꿈'으로 표시됩니다).
        ${st ? html`<${UploadControls} st=${st} board=${data} busy=${busy} act=${act} upload=${upload} report=${report} />` : ''}
        <p class="small muted" style="margin:6px 0 0">${status}</p>
        ${notes.length ? html`<ul class="bullets small" style="margin-top:6px">${notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}</li>
      <li><b>정리(시상 뒤)</b> 채점 폴더에는 팀 코드 사본과 채점 근거가 남아 있습니다. 시상이 끝나면 [채점 자료 지우기]를 누른 뒤 그 컴퓨터에서 <code class="ic">AI-code-judge-off.command</code> 로 도우미를 끕니다.
        ${st ? html`<div class="btn-row"><button type="button" class="btn btn-sm btn-danger" disabled=${busy || st.busy || !st.work} onClick=${wipe}>채점 자료 지우기</button></div>` : ''}</li>
    </ol>
    <div class="table-box"><table class="dtable">
      <thead><tr><th>순서</th><th>팀</th><th>저장소</th><th>마감 커밋</th><th>번호</th><th>심사</th>${data.rubric.map((r) => html`<th title=${r.desc}>${r.label} ${r.max}</th>`)}<th>합계</th><th>출처</th>${st ? html`<th>AI 채점(이 컴퓨터)</th>` : ''}</tr></thead>
      <tbody>${data.teams.map((t) => html`<${Row} key=${t.id} t=${t} rubric=${data.rubric} openTeam=${openTeam}
        ai=${st ? html`<${AiCell} w=${t.code ? work.get(t.code) : null} now=${st.now} disabled=${redoOff} onRedo=${redo} />` : ''} />`)}</tbody>
    </table></div>
    <p class="small muted" style="margin:0">합계 칸에 마우스를 올리면 서버에 올린 3번의 점수가 보입니다. 저장소 주소를 고쳐 마감 커밋이 바뀐 팀은 '지난 커밋의 AI 점수'로 표시되니 [AI 채점 시작]으로 다시 채점해 올리세요.</p>
    ${reportText !== null ? html`<${Modal} title="AI 채점 보고서(report.md)" wide onClose=${() => setReportText(null)}><pre class="report">${reportText}</pre></${Modal}>` : ''}
  </section>`;
}
