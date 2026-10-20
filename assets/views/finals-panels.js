// 본선 멘토 화면(mentor.js)과 관리자 [본선] 탭(admin-finals.js)이 함께 쓰는 칸: 시계 막대, 멘토링 요청 줄, 본선 팀 표, 진행 공지.
// 자료는 gas/Finals.js finalsBoard_ 의 답(data): { submit, surveyPhase, deadline, submitOpen, readmeItems, teams, me, now }.
import {
  html, useState, useApp, useInterval, useServerOffset, endMs, toMs, fmtWhen, fmtShort, copyText,
} from '../lib.js';
import { LECTURE_CHECKLIST, fillCall, callStates } from './finals-plan.js';
import { hms } from './board-tv.js';

const CHECK = { ok: ['확인 완료', 'ok'], warn: ['확인 필요', 'warn'], missing: ['찾을 수 없음', 'bad'], error: ['점검 실패', 'bad'] };

/** 서버 시각에 맞춘 지금(ms), 1초마다 다시 그린다. now: 마지막 답의 서버 시각 */
export function useFinalsNow(now) {
  const offset = useServerOffset(now);
  const [, setTick] = useState(0);
  useInterval(() => setTick((n) => n + 1), 1000);
  return Date.now() + offset;
}

const minsAgo = (ms, at) => Math.max(0, Math.floor((ms - toMs(at)) / 60000));
const ago = (ms, at) => {
  const m = minsAgo(ms, at);
  return m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 ${m % 60}분 전`;
};

/** 검은 시계 막대: 결과물 제출 마감까지, 멘토링 대기·가는 중, 최종 제출 수. children: 오른쪽 단추 */
export function ClockBar({ data, ms, children }) {
  const left = endMs(data.deadline) - ms;
  const open = data.submit === 'open' && left > 0;
  const n = (state) => data.teams.filter((t) => t.help && t.help.state === state).length;
  return html`<div class="con-clockbar finals-bar">
    <div><span class="muted">${open ? '결과물 제출 마감까지' : data.submit === 'before' ? '결과물 제출 시작' : '결과물 제출 마감'}</span>${' '}
      <b class="num">${open ? hms(left) : data.submit === 'before' ? fmtWhen(data.submitOpen) : fmtWhen(data.deadline)}</b></div>
    <div class="num">멘토링 대기 <b>${n('open')}</b> · 가는 중 ${n('taken')} · 최종 제출 ${data.teams.filter((t) => t.final).length}/${data.teams.length}</div>
    ${children ? html`<div class="btn-row">${children}</div>` : ''}
  </div>`;
}

/**
 * 멘토링 요청 줄: 대기(요청 순서) → 가는 중. 대기 요청은 [가는 중]으로 맡고, 내가 맡은 요청은 [완료]·[되돌리기].
 * 관리자(me '운영진')는 누가 맡은 요청이든 [완료]·[되돌리기]를 할 수 있다. act(team, op)
 */
export function HelpQueue({ data, ms, busy, act }) {
  const rows = data.teams.filter((t) => t.help).sort((a, b) => {
    if (a.help.state !== b.help.state) return a.help.state === 'open' ? -1 : 1;
    return a.help.at < b.help.at ? -1 : 1;
  });
  const admin = data.me === '운영진';
  return html`<section class="panel">
    <div class="panel-h"><h2>멘토링 요청</h2><span class="small muted">요청 순서대로 · [가는 중]을 누르면 그 팀 화면에 내 이름이 보입니다</span></div>
    ${rows.length ? html`<ol class="help-q">${rows.map((t) => {
      const h = t.help;
      const mine = h.state === 'taken' && h.taker === data.me;
      return html`<li class=${`help-item ${h.state}${mine ? ' mine' : ''}`} key=${t.key}>
        <div class="help-who"><b>${t.order ? `${t.order}번 ` : ''}${t.name}</b>
          <span class="small muted num">${fmtShort(h.at)} 요청 · ${ago(ms, h.at)}</span></div>
        <div class="help-note">${h.note}</div>
        <div class="btn-row">
          ${h.state === 'open'
            ? html`<button class="btn btn-sm btn-primary" disabled=${busy} onClick=${() => act(t, 'take')}>가는 중</button>`
            : html`<span class=${`pstate ${mine ? 'ok' : 'warn'}`}>${mine ? '내가 가는 중' : `${h.taker} 가는 중`} · ${ago(ms, h.takenAt)}</span>`}
          ${h.state === 'taken' && (mine || admin) ? html`
            <button class="btn btn-sm btn-accent" disabled=${busy} onClick=${() => act(t, 'done')}>완료</button>
            <button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => act(t, 'release')}>되돌리기</button>` : ''}
        </div>
      </li>`;
    })}</ol>` : html`<p class="muted" style="margin:0">지금 들어온 요청이 없습니다.</p>`}
  </section>`;
}

/** 본선 팀 표: 저장소(점검·마지막 변경)·서비스·만족도 조사 응답 수·최종 제출·멘토링 받은 횟수. extra(t): 관리자 단추 칸 */
export function TeamTable({ data, ms, extra }) {
  return html`<section class="panel">
    <div class="panel-h"><h2>본선 팀</h2><span class="small muted">저장소는 5분마다 최신 커밋을 보고 바뀌면 다시 점검합니다</span></div>
    ${data.teams.length ? html`<div class="table-box"><table class="dtable finals-table">
      <thead><tr><th>순서</th><th>팀</th><th>저장소</th><th>점검</th><th>마지막 변경</th><th>서비스</th><th>만족도</th><th>최종 제출</th><th>멘토링</th>${extra ? html`<th></th>` : ''}</tr></thead>
      <tbody>${data.teams.map((t) => {
        const c = t.repo && t.repo.check;
        const st = c ? CHECK[c.state] || ['-', ''] : null;
        return html`<tr key=${t.key}>
          <td class="num">${t.order || '-'}</td>
          <td><b>${t.name}</b><div class="small muted">${t.projectName}</div></td>
          <td>${t.repo ? html`<a href=${t.repo.url} target="_blank" rel="noopener">${t.repo.url.replace('https://github.com/', '')}</a>
            ${c && c.sha ? html`<div class="small muted mono">${c.branch || '?'}@${c.sha}</div>` : ''}` : html`<span class="pstate bad">미등록</span>`}</td>
          <td class="wrap-cell">${st ? html`<span class=${`pstate ${st[1]}`}>${st[0]}</span>
            ${c.missing && c.missing.length ? html`<div class="small">README 빠짐: ${c.missing.join(', ')}</div>` : ''}
            ${c.env && c.env.length ? html`<div class="small err">비밀값 파일: ${c.env.join(', ')}</div>` : ''}` : '-'}</td>
          <td class="small num">${c && c.changedAt ? html`${fmtShort(c.changedAt)}<div class="muted">${ago(ms, c.changedAt)}</div>` : '-'}</td>
          <td>${t.serviceUrl ? html`<a href=${t.serviceUrl} target="_blank" rel="noopener">열기</a>` : '-'}</td>
          <td class="num">${t.survey.done}/${t.survey.total}</td>
          <td>${t.final ? html`<span class="pstate ok">제출</span><div class="small muted num">${fmtShort(t.final.at)}${t.final.by === '운영진' ? ' · 운영진' : ''}</div>` : html`<span class="pstate">${data.submit === 'closed' ? '미제출' : '아직'}</span>`}</td>
          <td class="num">${t.helped || '-'}</td>
          ${extra ? html`<td>${extra(t)}</td>` : ''}
        </tr>`;
      })}</tbody>
    </table></div>` : html`<p class="muted" style="margin:0">${data.published ? '본선 진출 팀이 없습니다.' : '본선 진출 팀을 발표하면 여기에 나옵니다.'}</p>`}
  </section>`;
}

/** 진행 공지(finals-plan.js): 시각마다 읽거나 단톡방에 붙여 넣는 글과 [복사], 교육 끝에 알려 줄 것. */
export function RunSheet({ data, ms }) {
  const { notify } = useApp();
  const v = { deadline: fmtWhen(data.deadline), readme: data.readmeItems.join(', ') };
  const copy = async (text) => {
    if (await copyText(text)) notify('복사했습니다. 단톡방에 붙여 넣으세요.');
    else notify('복사하지 못했습니다. 글을 길게 눌러 복사해 주세요.', 'err');
  };
  const tag = { now: html`<span class="pstate warn">지금</span>`, soon: html`<span class="pstate">곧</span>`, done: html`<span class="small muted">지남</span>`, later: '' };
  return html`<section class="panel">
    <div class="panel-h"><h2>진행 공지</h2><span class="small muted">시각이 되면 행사장에서 읽거나 단톡방에 붙여 넣습니다</span></div>
    <details class="con-more">
      <summary>교육 끝에 꼭 알려 줄 것 ${LECTURE_CHECKLIST.length}가지</summary>
      <ol class="calls-check">${LECTURE_CHECKLIST.map((x) => html`<li>${fillCall(x, v)}</li>`)}</ol>
    </details>
    <ol class="calls">${callStates(ms).map((c) => html`<li class=${`call ${c.state}`} key=${c.at}>
      <div class="call-h"><b class="num">${fmtShort(c.at)}</b> <b>${c.title}</b> ${tag[c.state]}
        <button class="btn btn-sm" onClick=${() => copy(fillCall(c.text, v))}>복사</button></div>
      <p class="call-t">${fillCall(c.text, v)}</p>
    </li>`)}</ol>
  </section>`;
}
