// 관리자 · 본선(gas/Finals.js · gas/Survey.js · gas/Integrity.js · gas/MentorLog.js): 멘토 코드, 멘토 화면과 같은 현황(시계·멘토링 요청·
// 본선 팀·순회 기록·체크리스트·진행 공지), 운영진의 최종 제출 처리(만족도 조사를 못 마친 팀 — 결석 등)·취소, 본선 개발 기록(새 출발
// 확인 표시·관측 줄·보관본·증거 묶음)과 실격 처리·취소, 만족도 조사 응답률·문항별 평균·역량 변화·응답 시트. 30초마다 새로 읽는다.
import { html, useState, useEffect, useRef, useApp, useInterval, api, session, fmtShort, fmtWhen } from '../lib.js';
import { Modal, useBusy } from '../ui.js';
import { ClockBar, HelpQueue, TeamTable, VisitLog, Checklist, RunSheet, useFinalsNow } from './finals-panels.js';

const token = () => session.get('admin');
const DONE = { take: '맡았습니다.', done: '완료했습니다.', release: '되돌렸습니다.' };

/** 멘토 코드(하나를 멘토 모두가 함께 쓰고 각자 이름을 넣는다): 만들기·다시 만들기(예전 코드와 그 로그인 무효)·없애기. 코드는 만든 순간에만 보인다. */
function MentorCodePanel({ data, busy, call }) {
  const [shown, setShown] = useState('');
  const url = `${location.origin}${location.pathname}#/mentor`;
  const make = async () => {
    if (data.mentor.on && !confirm('멘토 코드를 다시 만들까요? 예전 코드와 그 코드로 들어간 멘토 화면은 더 이상 쓸 수 없습니다.')) return;
    const res = await call('adminMentorCode', {}, '멘토 코드를 만들었습니다.');
    if (res) setShown(res.mentorCode);
  };
  const off = () => {
    if (confirm('멘토 코드를 없앨까요? 멘토 화면에 더 이상 들어갈 수 없습니다.')) call('adminMentorCode', { off: true }, '멘토 코드를 없앴습니다.');
  };
  return html`<section class="panel">
      <div class="panel-h"><h2>멘토 코드</h2><span class="small muted">강사(멘토를 겸함)가 멘토 화면에서 멘토링 요청을 맡고 진행 공지를 볼 때 씁니다</span></div>
      <div class="btn-row">
        ${data.mentor.on ? html`<span class="pstate ok">있음</span><span class="small muted">${fmtShort(data.mentor.at)} 발급</span>` : html`<span class="pstate">없음</span>`}
        <button class="btn btn-sm" disabled=${busy} onClick=${make}>${data.mentor.on ? '다시 만들기' : '멘토 코드 만들기'}</button>
        ${data.mentor.on ? html`<button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${off}>없애기</button>` : ''}
      </div>
      <p class="small muted" style="margin:0">코드 하나를 멘토 모두가 함께 쓰고, 들어갈 때 각자 이름을 넣습니다(요청을 맡으면 그 팀 화면에 보입니다). 로그인은 36시간 유지됩니다.
        멘토 화면(<span class="mono">${url}</span>)에는 팀 이름·저장소·멘토링 요청 글·만족도 조사 응답 수만 보이고 팀원 개인정보는 보이지 않습니다.</p>
    </section>
    ${shown ? html`<${Modal} title="멘토 코드" onClose=${() => setShown('')} wide>
      <p class="code-huge" style="font-size:clamp(32px,8vw,72px)">${shown}</p>
      <p class="small" style="text-align:center">이 코드는 지금만 보입니다. 멘토에게 전해 주세요. 멘토 화면: <span class="mono">${url}</span></p>
    <//>` : ''}`;
}

const avgText = (v) => (v === null || v === undefined ? '-' : v.toFixed(2));

/** 만족도 조사(실전 바이브코딩 개발자 교육): 응답 수·응답률, 교육 평가 문항별 평균(1~5), 역량 자기평가(교육 전·후·변화), 응답 시트. */
function SurveyResult({ survey }) {
  const edu = survey.items.filter((i) => i.group !== 'self');
  const self = survey.items.filter((i) => i.group === 'self');
  const growth = survey.growth === null || survey.growth === undefined ? '-' : `${survey.growth > 0 ? '+' : ''}${survey.growth.toFixed(2)}`;
  return html`<section class="panel">
    <div class="panel-h"><h2>${survey.title || '만족도 조사'}</h2>
      ${survey.url ? html`<a class="btn btn-sm" href=${survey.url} target="_blank" rel="noopener">응답 시트 열기</a>` : ''}</div>
    <div class="statline"><span>응답 <b>${survey.count}</b>/${survey.total}명</span>
      <span>응답률 <b>${survey.rate === null || survey.rate === undefined ? '-' : `${survey.rate}%`}</b></span></div>
    <div class="statline"><span class="muted">교육 평가</span>
      ${edu.map((i) => html`<span key=${i.key}>${i.label} <b>${avgText(i.avg)}</b></span>`)}</div>
    ${self.length ? html`<div class="statline"><span class="muted">역량 자기평가</span>
      ${self.map((i) => html`<span key=${i.key}>${i.label} <b>${avgText(i.avg)}</b></span>`)}
      <span>변화(교육 후 − 교육 전) <b>${growth}</b></span></div>` : ''}
    <p class="small muted" style="margin:0">마감 당일(10. 30.) 0시부터 본선 팀원이 「내 신청」에서 응답하고, 팀원 모두 응답해야 그 팀이 [최종 제출]을 누를 수 있습니다.
      응답은 이름·학번 없이 구글 드라이브의 응답 시트에 쌓이며(평균은 5점 만점), 전체 파기를 해도 지워지지 않습니다(통계용).
      대상은 본선 진출 팀의 팀원 모두입니다.</p>
  </section>`;
}

const FLAG = { jump: '급증', prelim: '예선 코드', oldCommits: '본선 전 커밋', late: '출발점 늦음', repoChanged: '저장소 바꿈' };
const STRONG = { prelim: 1, oldCommits: 1 };
const kb = (n) => (n === null || n === undefined || n === '' ? '-' : `${Math.round(Number(n) / 102.4) / 10}KB`);
const sha7 = (x) => (x ? String(x).slice(0, 7) : '');

function Flags({ g }) {
  if (!g || !g.flags.length) return html`<span class="small muted">없음</span>`;
  return html`<span class="integ-flags">${g.flags.map((f) => html`<span key=${f} class=${`pstate ${STRONG[f] ? 'bad' : 'warn'}`}>${FLAG[f] || f}${
    f === 'prelim' && g.prelimSame ? ` ${g.prelimSame.files}개` : f === 'oldCommits' ? ` ${g.oldCommits.length}개` : f === 'jump' && g.jump ? ` +${kb(g.jump.added)}` : ''}</span>`)}</span>`;
}

/** 한 팀의 자세한 기록: 예선 제출·출발점·표시의 근거·보관본·증거 묶음·관측 줄(드라이브 '관측' 탭). */
function IntegrityDetail({ team, onClose }) {
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('adminIntegrity', { token: token(), key: team.key }).then(setRes, (err) => setError(err.message));
  }, [team.key]);
  const t = res && res.team;
  const g = t && t.integrity;
  return html`<${Modal} title=${`${team.order ? `${team.order}번 ` : ''}${team.name} · 본선 개발 기록`} onClose=${onClose} wide>
    ${error ? html`<div class="notice bad">${error}</div>` : !res ? html`<p class="muted">불러오는 중…</p>` : html`<div class="stack">
      <dl class="kv">
        <dt>본선 저장소</dt><dd>${t.repoUrl ? html`<a href=${t.repoUrl} target="_blank" rel="noopener">${t.repoUrl}</a> · ${fmtShort(t.repoAt)} 등록` : '미등록'}</dd>
        <dt>출발점</dt><dd>${g && g.firstAt ? html`<span class="num">${fmtShort(g.firstAt)} · <span class="mono">${sha7(g.firstSha)}</span> · 코드 파일 ${g.firstFiles}개 · ${kb(g.firstBytes)}</span>` : '아직 관측한 커밋이 없습니다'}</dd>
        <dt>마지막 관측</dt><dd>${g && g.lastAt ? html`<span class="num">${fmtShort(g.lastAt)} · <span class="mono">${sha7(g.lastSha)}</span> · 코드 파일 ${g.lastFiles}개 · ${kb(g.lastBytes)} · 관측 ${g.obs}회</span>` : '-'}</dd>
        <dt>예선 제출</dt><dd>${t.prelim ? html`<a href=${t.prelim.repoUrl} target="_blank" rel="noopener">${t.prelim.repoUrl}</a> · <span class="mono">${sha7(t.prelim.sha)}</span> · ${fmtShort(t.prelim.submittedAt)}${t.prelim.fileUrl ? html` · <a href=${t.prelim.fileUrl} target="_blank" rel="noopener">예선 보관본</a>` : ''}` : '없음'}</dd>
        <dt>표시</dt><dd><${Flags} g=${g} />${g && g.error ? html`<div class="small err">마지막 관측 실패: ${g.error}</div>` : ''}</dd>
      </dl>
      ${g && g.prelimSame ? html`<div class="notice bad"><b>예선 보관본과 같은 파일 ${g.prelimSame.files}개(${kb(g.prelimSame.bytes)})</b>
        <div class="small mono">${g.prelimSame.paths.join(' · ')}</div></div>` : ''}
      ${g && g.oldCommits.length ? html`<div class="notice bad"><b>본선 시작(${fmtWhen(res.kickoffAt)}) 전 날짜의 커밋</b>
        <div class="small mono">${g.oldCommits.map((c) => `${sha7(c.sha)} ${fmtShort(c.date)}`).join(' · ')}</div>
        <div class="small">커밋 날짜는 만든 사람이 바꿀 수 있어 그것만으로는 증거가 아닙니다 — 증거 묶음의 GitHub 서버 기록(저장소 생성·푸시 시각)과 함께 봅니다.</div></div>` : ''}
      ${g && g.jump ? html`<div class="notice warn"><b>가장 큰 급증</b> <span class="num">${fmtShort(g.jump.at)} · <span class="mono">${sha7(g.jump.sha)}</span> · ${g.jump.minutes}분 사이 +${kb(g.jump.added)}(분당 ${kb(g.jump.rate)})</span>
        <div class="small">AI 도구로는 짧은 시간에 코드가 많이 늘 수 있어 약한 신호입니다 — 순회 기록 메모·관측 줄과 함께 봅니다.</div></div>` : ''}
      ${g && g.archives.length ? html`<div><b>보관본(서버가 받은 압축 파일)</b><ul class="small">${g.archives.map((a) => html`<li key=${a.at}>${a.kind === 'start' ? '출발점' : '급증'} · ${fmtShort(a.at)} · <span class="mono">${sha7(a.sha)}</span> · <a href=${a.url} target="_blank" rel="noopener">열기</a></li>`)}</ul></div>` : ''}
      ${g && g.evidence.length ? html`<div><b>증거 묶음</b><ul class="small">${g.evidence.map((x) => html`<li key=${x.at}>${fmtShort(x.at)} · ${x.name} · ${kb(x.size)} · <span class="mono">SHA-256 ${x.sha256}</span> · <a href=${x.url} target="_blank" rel="noopener">열기</a></li>`)}</ul></div>` : ''}
      ${g && g.dq ? html`<div class="notice bad"><b>실격 처리 ${fmtShort(g.dq.at)}</b><div>사유: ${g.dq.reason}</div><div class="small">증거: ${g.dq.evidence}</div></div>` : ''}
      <div><b>관측 줄</b> <span class="small muted">(드라이브 '관측' 탭 — 서버 시계로 적은 기록)</span>
        ${res.timelineError ? html`<div class="notice bad">${res.timelineError}</div>` : res.timeline.length ? html`<div class="table-box"><table class="dtable">
          <thead><tr><th>관측 시각</th><th>커밋</th><th>코드 파일</th><th>코드 크기</th><th>늘어난 크기</th><th>지난 관측 뒤(분)</th><th>예선과 같은 파일</th><th>본선 전 커밋</th><th>표시</th><th>보관본</th></tr></thead>
          <tbody>${res.timeline.map((r, i) => html`<tr key=${i}>
            <td class="num">${fmtShort(r.at)}</td><td class="mono">${sha7(r.sha)}</td><td class="num">${r.codeFiles === null ? '-' : r.codeFiles}</td>
            <td class="num">${kb(r.codeBytes)}</td><td class="num">${r.added === null ? '-' : kb(r.added)}</td><td class="num">${r.minutes === null ? '-' : r.minutes}</td>
            <td class="num">${r.prelimFiles || '-'}</td><td class="num">${r.oldCommits || '-'}</td><td class="wrap-cell">${r.flags || ''}</td>
            <td>${r.archiveUrl ? html`<a href=${r.archiveUrl} target="_blank" rel="noopener">열기</a>` : ''}</td>
          </tr>`)}</tbody></table></div>` : html`<p class="small muted" style="margin:0">아직 관측 줄이 없습니다.</p>`}
      </div>
    </div>`}
  <//>`;
}

/** 실격 처리: 팀명 확인 + 사유 + 증거(증거 묶음의 드라이브 주소·SHA-256 등). 가장 최근 증거 묶음이 있으면 증거 칸에 미리 넣는다. */
function DisqualifyModal({ team, g, busy, call, onClose }) {
  const last = g && g.evidence.length ? g.evidence[g.evidence.length - 1] : null;
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState(last ? `${last.url} · SHA-256 ${last.sha256}` : '');
  const submit = async (e) => {
    e.preventDefault();
    const res = await call('adminDisqualify', { key: team.key, confirm: confirmName.trim(), reason: reason.trim(), evidence: evidence.trim() }, `${team.name} 팀을 실격 처리했습니다.`);
    if (res) onClose();
  };
  return html`<${Modal} title=${`${team.name} · 실격 처리`} onClose=${onClose} wide>
    <form style="display:grid;gap:14px" onSubmit=${submit}>
      <div class="notice warn">실격 팀은 순위·시상에서 빠지고 심사위원 화면에 나오지 않습니다. 팀 「내 신청」에 실격 안내가 보이고, 처리와 취소는 감사 기록에 남습니다.
        표시(급증·예선 코드·본선 전 커밋)는 검토 신호일 뿐입니다 — 증거 묶음(GitHub 서버 기록·git 이력·화면 사진·시각 인증)을 보고 판단해 주세요.</div>
      <div class="field"><label for="dq-reason">실격 사유(10~300자)</label>
        <textarea id="dq-reason" class="input" rows="3" maxlength="300" value=${reason} onInput=${(e) => setReason(e.target.value)}
          placeholder="예: 본선 저장소의 첫 커밋(10. 29. 10:41)에 예선 결과물과 같은 파일 37개가 들어 있고, GitHub 기록상 저장소가 10. 20.에 만들어짐"></textarea></div>
      <div class="field"><label for="dq-evidence">증거(5~300자)</label>
        <input id="dq-evidence" class="input" maxlength="300" value=${evidence} onInput=${(e) => setEvidence(e.target.value)} placeholder="증거 묶음의 드라이브 주소 · SHA-256" />
        <div class="hint">${last ? '가장 최근 증거 묶음을 넣어 두었습니다.' : '아직 올린 증거 묶음이 없습니다 — 운영 맥에서 증거 도구로 먼저 만들어 올리세요.'}</div></div>
      <div class="field"><label for="dq-confirm">확인: 팀명 <b>${team.name}</b>을(를) 그대로 입력</label>
        <input id="dq-confirm" class="input" autocomplete="off" value=${confirmName} onInput=${(e) => setConfirmName(e.target.value)} /></div>
      <div class="btn-row"><button class="btn btn-primary" type="submit" disabled=${busy || confirmName.trim() !== team.name}>실격 처리</button>
        <button class="btn btn-ghost" type="button" onClick=${onClose}>닫기</button></div>
    </form>
  <//>`;
}

/**
 * 본선 개발 기록(새 출발 확인): 본선 시작 뒤 새 저장소에서 개발했는지 서버가 관측한 요약. 표시는 검토 신호(실격은 사람이 증거로 판단),
 * 실격 처리·취소, 관측 시트·보관본 폴더.
 */
function IntegrityPanel({ data, busy, call }) {
  const b = data.integrity;
  const [detail, setDetail] = useState(null);
  const [dq, setDq] = useState(null);
  if (!b) return '';
  const flagged = b.teams.filter((t) => t.integrity && t.integrity.flags.length).length;
  const undo = (t) => {
    if (confirm(`${t.name} 팀의 실격을 취소할까요? 순위·시상과 심사위원 화면에 다시 들어갑니다.`)) call('adminDisqualify', { key: t.key, off: true }, '실격을 취소했습니다.');
  };
  return html`<section class="panel">
    <div class="panel-h"><h2>본선 개발 기록(새 출발 확인)</h2>
      <div class="btn-row">
        ${b.sheetUrl ? html`<a class="btn btn-sm" href=${b.sheetUrl} target="_blank" rel="noopener">관측 시트 열기</a>` : ''}
        ${b.folderUrl ? html`<a class="btn btn-sm btn-ghost" href=${b.folderUrl} target="_blank" rel="noopener">보관본 폴더</a>` : ''}
      </div></div>
    <p class="small muted" style="margin:0">본선 시작 ${fmtWhen(b.kickoffAt)} · 출발점 등록 마감 ${fmtWhen(b.startDeadline)} · 표시 있는 팀 ${flagged}팀.
      서버가 등록·다시 점검·5분마다 새 커밋을 보면 압축 파일 목차를 읽어 적습니다(시작 저장소 <a href=${b.starter.url} target="_blank" rel="noopener">${b.starter.url.replace('https://github.com/', '')}</a> 와 같은 파일은 뺍니다).
      <b>표시는 검토 신호입니다</b> — 빨강(예선 코드·본선 전 커밋)은 강한 신호, 노랑(급증·늦음·저장소 바꿈)은 약한 신호. 실격은 운영 맥에서
      <span class="mono">VH_ADMIN_CODE=… node tools/finals-evidence.mjs --team 팀명</span> 으로 만든 증거 묶음을 보고 판단합니다(묶음은 이 팀의 증거 목록에 올라갑니다).</p>
    ${b.teams.length ? html`<div class="table-box"><table class="dtable integ-table">
      <thead><tr><th>테이블</th><th>팀</th><th>출발점</th><th>마지막 관측</th><th>표시</th><th>보관본·증거</th><th>실격</th><th></th></tr></thead>
      <tbody>${b.teams.map((t) => {
        const g = t.integrity;
        return html`<tr key=${t.key}>
          <td class="num">${t.order || '-'}</td>
          <td><b>${t.name}</b>${t.repoUrl ? html`<div class="small"><a href=${t.repoUrl} target="_blank" rel="noopener">${t.repoUrl.replace('https://github.com/', '')}</a></div>` : html`<div class="small muted">저장소 미등록</div>`}</td>
          <td class="small num">${g && g.firstAt ? html`${fmtShort(g.firstAt)}<div class="muted mono">${sha7(g.firstSha)} · ${kb(g.firstBytes)}</div>` : '-'}</td>
          <td class="small num">${g && g.lastAt ? html`${fmtShort(g.lastAt)}<div class="muted">${g.lastFiles}개 · ${kb(g.lastBytes)} · ${g.obs}회</div>` : '-'}
            ${g && g.error ? html`<div class="err">관측 실패</div>` : ''}</td>
          <td class="wrap-cell"><${Flags} g=${g} /></td>
          <td class="small num">${g ? `${g.archives.length} · ${g.evidence.length}` : '-'}</td>
          <td>${g && g.dq ? html`<span class="pstate bad">실격</span><div class="small muted num">${fmtShort(g.dq.at)}</div>` : '-'}</td>
          <td><div class="btn-row">
            <button class="btn btn-sm btn-ghost" onClick=${() => setDetail(t)}>자세히</button>
            ${g && g.dq ? html`<button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => undo(t)}>실격 취소</button>`
              : html`<button class="btn btn-sm" disabled=${busy} onClick=${() => setDq(t)}>실격 처리</button>`}
          </div></td>
        </tr>`;
      })}</tbody>
    </table></div>` : html`<p class="muted" style="margin:0">본선 진출 팀을 발표하면 여기에 나옵니다.</p>`}
    ${detail ? html`<${IntegrityDetail} team=${detail} onClose=${() => setDetail(null)} />` : ''}
    ${dq ? html`<${DisqualifyModal} team=${dq} g=${dq.integrity} busy=${busy} call=${call} onClose=${() => setDq(null)} />` : ''}
  </section>`;
}

export function FinalsTab({ reload }) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const seq = useRef(0);

  const load = async () => {
    const mine = seq.current;
    try {
      const res = await api('adminFinals', { token: token() });
      if (mine !== seq.current) return;
      setData(res);
      setError('');
    } catch (err) {
      if (err.code === 'AUTH') reload();   // 로그인이 끊겼다 — 관리자 화면이 로그인으로 돌아간다
      else if (mine === seq.current) setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);
  useInterval(() => { if (document.visibilityState !== 'hidden') load(); }, 30000);

  // 쓰기 답: 최종 제출 처리는 [본선] 탭 전체, 멘토링 처리는 멘토 화면 현황, 멘토 코드는 그 칸만 — 받은 것만 바꾼다
  const call = (action, payload, done) => run(async () => {
    try {
      const res = await api(action, { token: token(), ...payload });
      const { mentorCode, ...rest } = res;
      seq.current += 1;
      setData((d) => ({ ...d, ...rest }));
      setError('');
      notify(done);
      return res;
    } catch (err) {
      if (err.code === 'AUTH') { reload(); return null; }
      notify(err.message, 'err');
      if (err.code === 'STATE' || err.code === 'NOT_FOUND' || err.ambiguous) load();
      return null;
    }
  });

  const ms = useFinalsNow(data ? data.now : '');
  if (!data) {
    return error ? html`<div class="notice bad"><b>불러오지 못했습니다.</b> ${error} <button class="link-btn" onClick=${load}>다시 시도</button></div>`
      : html`<p class="muted">불러오는 중…</p>`;
  }

  const act = (t, op) => call('mentorHelp', { key: t.key, op, at: t.help.at }, DONE[op]);
  const finalBtn = (t) => {
    if (t.final) {
      return html`<button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => {
        if (confirm(`${t.name} 팀의 최종 제출을 취소할까요? 팀이 다시 [최종 제출]을 눌러야 합니다.`)) call('adminFinal', { key: t.key, off: true }, '최종 제출을 취소했습니다.');
      }}>제출 취소</button>`;
    }
    if (!t.repo) return '';
    const left = t.survey.total - t.survey.done;
    return html`<button class="btn btn-sm" disabled=${busy} onClick=${() => {
      if (confirm(`${t.name} 팀을 운영진이 최종 제출로 처리할까요?${left ? ` 만족도 조사 미응답 ${left}명은 기록에 남습니다.` : ''}`)) call('adminFinal', { key: t.key }, '최종 제출로 처리했습니다.');
    }}>최종 제출 처리</button>`;
  };
  const missing = data.teams.filter((t) => !t.final && !t.dq);

  return html`<div class="stack">
    <${ClockBar} data=${data} ms=${ms}>
      <button class="btn btn-sm" disabled=${busy} onClick=${load}>새로 고침</button>
    <//>
    ${error ? html`<div class="notice bad"><b>새로 읽지 못했습니다.</b> ${error} 아래 현황은 마지막으로 읽은 것입니다.</div>` : ''}
    ${data.published && data.submit !== 'before' && missing.length ? html`<div class=${`notice ${data.submit === 'closed' ? 'bad' : 'warn'}`}>
      <b>${data.submit === 'closed' ? '미제출' : '아직 최종 제출 전'} ${missing.length}팀:</b>${' '}
      ${missing.map((t) => `${t.name}(${!t.repo ? '저장소 미등록' : `만족도 ${t.survey.done}/${t.survey.total}`})`).join(' · ')}
      ${data.submit === 'closed' ? html`<div class="small" style="margin-top:6px">마감 뒤에도 [최종 제출 처리]로 운영진이 처리할 수 있습니다(심사는 마감 시각의 커밋).</div>` : ''}
    </div>` : ''}
    <${HelpQueue} data=${data} ms=${ms} busy=${busy} act=${act} />
    <${TeamTable} data=${data} ms=${ms} extra=${finalBtn} />
    <${IntegrityPanel} data=${data} busy=${busy} call=${call} />
    <${VisitLog} data=${data} ms=${ms} busy=${busy} send=${call} sheetUrl=${data.mentorSheetUrl} />
    <${Checklist} data=${data} busy=${busy} send=${call} />
    <${SurveyResult} survey=${data.survey} />
    <${MentorCodePanel} data=${data} busy=${busy} call=${call} />
    <${RunSheet} data=${data} ms=${ms} />
  </div>`;
}
