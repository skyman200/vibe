// 본선 멘토 화면(mentor.js)과 관리자 [본선] 탭(admin-finals.js)이 함께 쓰는 칸: 시계 막대, 멘토링 요청 줄, 본선 팀 표,
// 멘토링 순회 기록, 강사·멘토 체크리스트, 진행 공지.
// 자료는 gas/Finals.js finalsBoard_ 의 답(data): { submit, surveyPhase, kickoffAt, startDeadline, deadline, submitOpen, readmeItems,
// teams, rounds, memoMax, checklist, mentorSheetAt, me, now }. 쓰기는 부른 쪽의 send(action, payload, 알림 글) — 새 현황을 받아 화면에
// 쓰고 그 답(실패면 null)을 돌려준다.
import {
  html, useState, useApp, useInterval, useServerOffset, endMs, toMs, fmtWhen, fmtShort, copyText,
} from '../lib.js';
import { Modal } from '../ui.js';
import { LECTURE_CHECKLIST, fillCall, callStates, roundTimes, roundAt } from './finals-plan.js';
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

/** 팀의 순회 기록에 적힌 머문 시간(분) 합 */
export function visitMinutes(t) {
  return Object.keys(t.visits || {}).reduce((n, k) => n + (Number(t.visits[k].minutes) || 0), 0);
}

/** 출발점 칸: 출발점 시각(등록 마감 뒤면 늦음) · 기록 전(저장소는 등록했는데 서버가 아직 커밋을 보지 못함 — 빈 저장소·비공개·주소 오류) */
function StartCell({ t, data }) {
  if (t.startAt) {
    const late = data.startDeadline && toMs(t.startAt) > endMs(data.startDeadline);
    return html`<span class="num">${fmtShort(t.startAt)}</span>${late ? html` <span class="pstate warn">늦음</span>` : ''}`;
  }
  return t.repo ? html`<span class="pstate warn">기록 전</span>` : '-';
}

/** 본선 팀 표: 저장소(출발점·점검·마지막 변경)·서비스·만족도 조사 응답 수·최종 제출·멘토링 받은 횟수·순회(분). extra(t): 관리자 단추 칸 */
export function TeamTable({ data, ms, extra }) {
  const started = data.teams.filter((t) => t.startAt).length;
  const kicked = data.kickoffAt && ms >= toMs(data.kickoffAt);
  return html`<section class="panel">
    <div class="panel-h"><h2>본선 팀</h2><span class="small muted">${data.kickoffAt ? (kicked
      ? `출발점 ${started}/${data.teams.length}팀(등록 마감 ${fmtShort(data.startDeadline)}) · `
      : `본선 시작(${fmtShort(data.kickoffAt)}) 뒤 새 저장소를 등록하면 출발점이 기록됩니다 · `) : ''}저장소는 5분마다 최신 커밋을 보고 바뀌면 다시 점검합니다</span></div>
    ${data.teams.length ? html`<div class="table-box"><table class="dtable finals-table">
      <thead><tr><th>테이블</th><th>팀</th><th>저장소</th><th>출발점</th><th>점검</th><th>마지막 변경</th><th>서비스</th><th>만족도</th><th>최종 제출</th><th>멘토링</th><th>순회</th>${extra ? html`<th></th>` : ''}</tr></thead>
      <tbody>${data.teams.map((t) => {
        const c = t.repo && t.repo.check;
        const st = c ? CHECK[c.state] || ['-', ''] : null;
        const visit = visitMinutes(t);
        return html`<tr key=${t.key}>
          <td class="num">${t.order || '-'}</td>
          <td><b>${t.name}</b>${t.dq ? html` <span class="pstate bad">실격</span>` : ''}<div class="small muted">${t.projectName}</div></td>
          <td>${t.repo ? html`<a href=${t.repo.url} target="_blank" rel="noopener">${t.repo.url.replace('https://github.com/', '')}</a>
            ${c && c.sha ? html`<div class="small muted mono">${c.branch || '?'}@${c.sha}</div>` : ''}` : html`<span class="pstate bad">미등록</span>`}</td>
          <td class="small"><${StartCell} t=${t} data=${data} /></td>
          <td class="wrap-cell">${st ? html`<span class=${`pstate ${st[1]}`}>${st[0]}</span>
            ${c.missing && c.missing.length ? html`<div class="small">README 빠짐: ${c.missing.join(', ')}</div>` : ''}
            ${c.env && c.env.length ? html`<div class="small err">비밀값 파일: ${c.env.join(', ')}</div>` : ''}` : '-'}</td>
          <td class="small num">${c && c.changedAt ? html`${fmtShort(c.changedAt)}<div class="muted">${ago(ms, c.changedAt)}</div>` : '-'}</td>
          <td>${t.serviceUrl ? html`<a href=${t.serviceUrl} target="_blank" rel="noopener">열기</a>` : '-'}</td>
          <td class="num">${t.survey.done}/${t.survey.total}</td>
          <td>${t.final ? html`<span class="pstate ok">제출</span><div class="small muted num">${fmtShort(t.final.at)}${t.final.by === '운영진' ? ' · 운영진' : ''}</div>` : html`<span class="pstate">${data.submit === 'closed' ? '미제출' : '아직'}</span>`}</td>
          <td class="num">${t.helped || '-'}</td>
          <td class="num">${visit ? `${visit}분` : '-'}</td>
          ${extra ? html`<td>${extra(t)}</td>` : ''}
        </tr>`;
      })}</tbody>
    </table></div>` : html`<p class="muted" style="margin:0">${data.published ? '본선 진출 팀이 없습니다.' : '본선 진출 팀을 발표하면 여기에 나옵니다.'}</p>`}
  </section>`;
}

/** 진행 공지(finals-plan.js): 시각마다 읽거나 단톡방에 붙여 넣는 글과 [복사], 교육 끝에 알려 줄 것. */
export function RunSheet({ data, ms }) {
  const { notify } = useApp();
  const v = { deadline: fmtWhen(data.deadline), start: data.startDeadline ? fmtWhen(data.startDeadline) : '출발점 등록 마감', readme: data.readmeItems.join(', ') };
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

const hhmm = (iso) => (iso ? fmtShort(iso).split(' ')[1] : '');

/** 순회 기록 한 칸의 상태: here(도착했고 아직 떠나지 않음) · done(머문 시간 있음) · none */
function visitState(v) {
  if (!v) return 'none';
  if (v.minutes !== null && v.minutes !== undefined) return 'done';
  return v.arriveAt && !v.leaveAt ? 'here' : 'none';
}

/** 머문 시간·메모 고치기, 이 라운드 기록 지우기. */
function VisitEdit({ team, round, label, v, memoMax, busy, send, onClose }) {
  const [minutes, setMinutes] = useState(v && v.minutes !== null && v.minutes !== undefined ? String(v.minutes) : '');
  const [memo, setMemo] = useState(v ? v.memo || '' : '');
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    const m = minutes.trim();
    if (m !== '' && !/^\d{1,3}$/.test(m)) { setError('머문 시간은 분 단위 정수로 넣어 주세요.'); return; }
    const res = await send('mentorVisit', { key: team.key, round, op: 'save', minutes: m, memo }, '순회 기록을 저장했습니다.');
    if (res) onClose();
  };
  const clear = async () => {
    if (!confirm(`${team.name} 팀의 ${label} 기록을 지울까요?`)) return;
    const res = await send('mentorVisit', { key: team.key, round, op: 'clear' }, '이 라운드 기록을 지웠습니다.');
    if (res) onClose();
  };
  return html`<${Modal} title=${`${team.order ? `${team.order}번 ` : ''}${team.name} · ${label}`} onClose=${onClose}>
    <form style="display:grid;gap:14px" onSubmit=${save}>
      ${v && v.arriveAt ? html`<p class="small muted" style="margin:0">도착 ${fmtShort(v.arriveAt)}${v.leaveAt ? ` · 떠남 ${hhmm(v.leaveAt)}` : ''}${v.by ? ` · ${v.by} 기록` : ''}</p>` : ''}
      <div class="field"><label for="visit-min">머문 시간(분)</label>
        <input id="visit-min" class="input num" inputmode="numeric" maxlength="3" placeholder="예: 8" value=${minutes} onInput=${(e) => { setMinutes(e.target.value); setError(''); }} />
        ${error ? html`<div class="err" role="alert">${error}</div>` : html`<div class="hint">[떠남]을 누르면 서버 시각으로 셈합니다. 0~180분, 비우면 셈하지 않습니다.</div>`}</div>
      <div class="field"><label for="visit-memo">메모</label>
        <input id="visit-memo" class="input" maxlength=${memoMax} placeholder="예: 배포 오류 해결 · 로그인 화면 점검" value=${memo} onInput=${(e) => setMemo(e.target.value)} />
        <div class="hint">${memo.length}/${memoMax}자 · 팀원 이름·연락처는 적지 않습니다</div></div>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit" disabled=${busy}>저장</button>
        ${v ? html`<button class="btn btn-ghost" type="button" disabled=${busy} onClick=${clear}>이 라운드 기록 지우기</button>` : ''}
      </div>
    </form>
  <//>`;
}

/**
 * 멘토링 순회 기록: 라운드를 고르고(지금 열린 라운드가 먼저), 테이블 번호 순서로 팀 자리에 가서 [도착] → [떠남]. 머문 시간은 서버가
 * 셈하고 [고치기]로 바꾸거나 메모를 남긴다. [드라이브에 저장]은 기록을 구글 드라이브 스프레드시트에 지금 옮긴다(5분마다 자동으로도).
 * sheetUrl: 관리자만(시트 주소)
 */
export function VisitLog({ data, ms, busy, send, sheetUrl }) {
  const rounds = data.rounds || [];
  const times = roundTimes();
  const [pick, setPick] = useState('');
  const [edit, setEdit] = useState(null);
  // 지금 열린 라운드 → 없으면 가장 최근에 시작한 라운드 → 없으면 첫 라운드
  const started = rounds.filter((x) => times[x.key] && times[x.key].startMs <= ms);
  const round = pick || roundAt(ms) || (started.length ? started[started.length - 1].key : rounds[0] && rounds[0].key) || '';
  const r = rounds.find((x) => x.key === round);
  if (!rounds.length) return '';
  const visit = (t, op) => send('mentorVisit', { key: t.key, round, op }, op === 'arrive' ? `${t.name} 팀 도착을 적었습니다.` : `${t.name} 팀을 떠났습니다.`);
  const doneN = data.teams.filter((t) => visitState(t.visits && t.visits[round]) === 'done').length;
  return html`<section class="panel">
    <div class="panel-h"><h2>멘토링 순회 기록</h2>
      <div class="btn-row">
        <span class="small muted">${data.mentorSheetAt ? `드라이브에 저장 ${fmtShort(data.mentorSheetAt)}` : '드라이브에 아직 저장 전'}</span>
        <button class="btn btn-sm" disabled=${busy} onClick=${() => send('mentorExport', {}, '드라이브 스프레드시트에 저장했습니다.')}>드라이브에 저장</button>
        ${sheetUrl ? html`<a class="btn btn-sm btn-ghost" href=${sheetUrl} target="_blank" rel="noopener">시트 열기</a>` : ''}
      </div></div>
    <div class="seg visit-rounds" role="radiogroup" aria-label="라운드">
      ${rounds.map((x) => html`<label key=${x.key}>
        <input type="radio" name="visit-round" value=${x.key} checked=${x.key === round} onChange=${() => setPick(x.key)} />
        <span>${x.label}${roundAt(ms) === x.key ? ' · 지금' : ''}${times[x.key] ? html`<small class="visit-time">${times[x.key].text}</small>` : ''}</span>
      </label>`)}
    </div>
    <p class="small muted" style="margin:0">${r ? r.label : ''} 기록 ${doneN}/${data.teams.length}팀 · 팀 자리에 가면 [도착], 나올 때 [떠남] — 머문 시간은 서버 시각으로 셈합니다. 메모 ${data.memoMax || 60}자까지.</p>
    ${data.teams.length ? html`<ol class="visit-q">${data.teams.map((t) => {
      const v = t.visits && t.visits[round];
      const st = visitState(v);
      return html`<li class=${`visit-item ${st}`} key=${t.key}>
        <div class="help-who"><b>${t.order ? `${t.order}번 ` : ''}${t.name}</b>${t.dq ? html` <span class="pstate bad">실격</span>` : ''}
          <span class="small muted num">합계 ${visitMinutes(t)}분</span></div>
        <div class="visit-st">
          ${st === 'here' ? html`<div><span class="pstate warn">${hhmm(v.arriveAt)} 도착 · ${minsAgo(ms, v.arriveAt)}분째</span></div>` : ''}
          ${st === 'done' ? html`<div><b class="num">${v.minutes}분</b>${v.arriveAt ? html` <span class="small muted num">${hhmm(v.arriveAt)}${v.leaveAt ? `–${hhmm(v.leaveAt)}` : ''}</span>` : ''}</div>` : ''}
          ${st === 'none' ? html`<div class="small muted">아직</div>` : ''}
          ${v && v.memo ? html`<div class="small">${v.memo}</div>` : ''}
          ${v && v.by ? html`<div class="small muted">${v.by} 기록</div>` : ''}
        </div>
        <div class="btn-row">
          ${st === 'none' ? html`<button class="btn btn-sm btn-primary" disabled=${busy} onClick=${() => visit(t, 'arrive')}>도착</button>` : ''}
          ${st === 'here' ? html`<button class="btn btn-sm btn-accent" disabled=${busy} onClick=${() => visit(t, 'leave')}>떠남</button>` : ''}
          <button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => setEdit(t)}>${st === 'none' && !v ? '직접 적기' : '고치기·메모'}</button>
        </div>
      </li>`;
    })}</ol>` : html`<p class="muted" style="margin:0">본선 진출 팀을 발표하면 여기에 나옵니다.</p>`}
    ${data.teams.length ? html`<details class="con-more">
      <summary>팀별 라운드 합계 보기</summary>
      <div class="table-box" style="margin-bottom:14px"><table class="dtable">
        <thead><tr><th>테이블</th><th>팀</th>${rounds.map((x) => html`<th key=${x.key}>${x.label}(분)</th>`)}<th>합계(분)</th></tr></thead>
        <tbody>${data.teams.map((t) => html`<tr key=${t.key}>
          <td class="num">${t.order || '-'}</td><td>${t.name}</td>
          ${rounds.map((x) => {
            const v = t.visits && t.visits[x.key];
            const st = visitState(v);
            return html`<td class="num" key=${x.key}>${st === 'done' ? v.minutes : st === 'here' ? '방문 중' : '-'}</td>`;
          })}
          <td class="num"><b>${visitMinutes(t)}</b></td>
        </tr>`)}</tbody>
      </table></div>
    </details>` : ''}
    ${edit ? html`<${VisitEdit} team=${edit} round=${round} label=${r ? r.label : ''} v=${edit.visits && edit.visits[round]} memoMax=${data.memoMax || 60}
      busy=${busy} send=${send} onClose=${() => setEdit(null)} />` : ''}
  </section>`;
}

/** 강사·멘토 체크리스트: 항목마다 확인(누가 언제 — 서버에 남고 드라이브 시트 '체크리스트' 탭에도 옮겨진다)·풀기. */
export function Checklist({ data, busy, send }) {
  const list = data.checklist || [];
  if (!list.length) return '';
  const done = list.filter((i) => i.at).length;
  const toggle = (i) => send('mentorCheck', { item: i.key, on: !i.at }, i.at ? '확인을 풀었습니다.' : '확인했습니다.');
  return html`<section class="panel">
    <div class="panel-h"><h2>강사·멘토 체크리스트</h2><span class="small muted">${done}/${list.length} 확인 · 누른 사람과 시각이 남습니다</span></div>
    <ul class="check-list">${list.map((i) => html`<li key=${i.key} class=${i.at ? 'on' : ''}>
      <label class="check">
        <input type="checkbox" checked=${!!i.at} disabled=${busy} onChange=${() => toggle(i)} />
        <span>${i.text}${i.at ? html`<span class="small muted num"> · ${fmtShort(i.at)} ${i.by}</span>` : ''}</span>
      </label>
    </li>`)}</ul>
  </section>`;
}
