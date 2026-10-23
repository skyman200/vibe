// 관리자 · 본선(gas/Finals.js · gas/Survey.js): 멘토 코드, 멘토 화면과 같은 현황(시계·멘토링 요청·본선 팀·진행 공지),
// 운영진의 최종 제출 처리(만족도 조사를 못 마친 팀 — 결석 등)·취소, 만족도 조사 응답 수·문항별 평균·응답 시트. 30초마다 새로 읽는다.
import { html, useState, useEffect, useRef, useApp, useInterval, api, session, fmtShort } from '../lib.js';
import { Modal, useBusy } from '../ui.js';
import { ClockBar, HelpQueue, TeamTable, RunSheet, useFinalsNow } from './finals-panels.js';

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

/** 만족도 조사: 응답 수, 문항별 평균(1~5), 응답 시트(구글 드라이브). */
function SurveyResult({ survey, total }) {
  return html`<section class="panel">
    <div class="panel-h"><h2>만족도 조사</h2>
      ${survey.url ? html`<a class="btn btn-sm" href=${survey.url} target="_blank" rel="noopener">응답 시트 열기</a>` : ''}</div>
    <div class="statline"><span>응답 <b>${survey.count}</b>/${total}명</span>
      ${survey.items.map((i) => html`<span>${i.label} <b>${i.avg === null ? '-' : i.avg.toFixed(2)}</b></span>`)}</div>
    <p class="small muted" style="margin:0">마감 당일(10. 30.) 0시부터 본선 팀원이 「내 신청」에서 응답하고, 팀원 모두 응답해야 그 팀이 [최종 제출]을 누를 수 있습니다.
      응답은 이름·학번 없이 구글 드라이브의 「본선 만족도 조사」 시트에 쌓이며(평균은 5점 만점), 전체 파기를 해도 지워지지 않습니다(통계용).</p>
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
  const total = data.teams.reduce((n, t) => n + t.survey.total, 0);
  const missing = data.teams.filter((t) => !t.final);

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
    <${SurveyResult} survey=${data.survey} total=${total} />
    <${MentorCodePanel} data=${data} busy=${busy} call=${call} />
    <${RunSheet} data=${data} ms=${ms} />
  </div>`;
}
