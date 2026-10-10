// 강사 콘솔의 칸: 출석(roster), 웹앱 구조(structure), 세션 코드 표(session — 예선 시작 칸에서 만들고 마무리 칸에서 끝낸다). 현황 계산은 teach-status.js.
// 출석 명단은 공개 참가현황(접수 완료 팀의 가린 이름)으로 받는다 — 강사 화면에는 개인정보를 보내지 않는다.
import { html, useState, useEffect, api, fmtShort } from '../lib.js';
import { SessionCodes } from './admin-prelim.js';
import { STRUCTURE, FLOW, WORDS } from './teach-plan.js';
import { Rich } from './teach-bits.js';

/** 접수 완료 팀(이름 + 가린 팀원 이름 4명)을 받는다. 실패하면 null(출석은 손으로 팀 이름만 적게 안내). */
export function useRoster() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const b = await api('board');
      setTeams(b.teams.filter((t) => t.column === 'applied' || t.column === 'selected' || t.column === 'waitlist' || t.column === 'building' || t.column === 'submitted'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };
  useEffect(() => { load(); }, []);
  return { teams, error, reload: load };
}

/** 출석: 팀마다 [전원] 또는 사람마다 눌러 확인. 이 탭에만 남는다(새로 고쳐도 유지 — sessionStorage). */
export function Roster({ roster, checked, setChecked }) {
  const { teams, error, reload } = roster;
  if (!teams) {
    return html`<div class="notice">${error ? html`참가 팀 명단을 받지 못했습니다. ${error} <button class="link-btn" onClick=${reload}>다시 받기</button>` : '참가 팀 명단을 받는 중…'}</div>`;
  }
  const keyOf = (t, i) => `${t.key}:${i}`;
  const teamAll = (t, on) => {
    const next = { ...checked };
    t.members.forEach((m, i) => { next[keyOf(t, i)] = on; });
    setChecked(next);
  };
  const total = teams.reduce((n, t) => n + t.members.length, 0);
  const here = teams.reduce((n, t) => n + t.members.filter((m, i) => checked[keyOf(t, i)]).length, 0);
  return html`<div class="con-roster" data-roster>
    <div class="con-roster-h"><b>출석 ${here} / ${total}명</b>
      <span class="small muted">팀원 이름은 가려서 보입니다. 이 교육에 온 사람만 누르세요. 못 온 팀원은 보충 회차 대상입니다.</span></div>
    <div class="con-rgrid">${teams.map((t) => {
      const n = t.members.filter((m, i) => checked[keyOf(t, i)]).length;
      return html`<div class=${`con-rteam${n === t.members.length ? ' full' : n ? ' part' : ''}`}>
        <div class="con-rteam-h"><b>${t.name}</b><span class="small num">${n}/${t.members.length}</span>
          <button type="button" class="link-btn" onClick=${() => teamAll(t, n !== t.members.length)}>${n === t.members.length ? '모두 해제' : '전원'}</button></div>
        <div class="con-rteam-m">${t.members.map((m, i) => html`<label class="check small">
          <input type="checkbox" checked=${!!checked[keyOf(t, i)]} onChange=${(e) => setChecked({ ...checked, [keyOf(t, i)]: e.target.checked })} />
          <span>${m.name}</span></label>`)}</div>
      </div>`;
    })}</div>
  </div>`;
}

export function Structure() {
  return html`<div class="con-structure">
    <div class="table-box"><table class="dtable">
      <thead><tr><th>부분</th><th>어디</th><th>하는 일</th><th>돌아가는 곳</th></tr></thead>
      <tbody>${STRUCTURE.map((r) => html`<tr>${r.map((c, i) => html`<td class="wrap-cell${i === 0 ? ' b' : ''}">${c}</td>`)}</tr>`)}</tbody>
    </table></div>
    <p class="small" style="margin:10px 0 6px"><b>한 번의 흐름</b> — <${Rich} text=${FLOW} /></p>
    <div class="con-words">${WORDS.map(([w, d]) => html`<div><b>${w}</b><span class="small muted"> — ${d}</span></div>`)}</div>
  </div>`;
}

/** 세션 코드 만들기·크게 보기·지금 끝내기(관리자 화면과 같은 칸)와, 코드마다 시작한 팀 표. */
export function SessionPanel({ data, busy, call }) {
  return html`<div class="con-sessionpanel"><${SessionCodes} data=${data} busy=${busy} call=${call} autoBig=${false} /></div>`;
}

/**
 * 예선 시작 칸 동안 화면 위에 고정해 두는 세션 코드(가장 최근에 만든 유효한 코드). 학생은 프로젝터의 이 큰 글자를 보고 입력한다.
 * [크게 보기] 창은 현황을 가리므로 쓰지 않아도 된다. 코드가 없으면 만들라고 안내한다.
 */
export function PinnedCode({ data }) {
  const live = data.sessions.find((s) => s.active);
  if (!live) return html`<div class="con-pinned empty" data-pinned><span>사용할 수 있는 세션 코드가 없습니다. 「예선 시작과 첫 제출」 칸에서 회차 이름을 넣고 [세션 코드 만들기]를 누르세요.</span></div>`;
  return html`<div class="con-pinned" data-pinned>
    <div class="con-pinned-m small"><b>${live.label}</b><span>학생은 「내 신청」 → [예선 시작]에 넣습니다</span><span>${fmtShort(live.expiresAt)}까지 유효 · 시작 ${live.started}팀</span></div>
    <div class="code-pinned codeline">${live.code}</div>
  </div>`;
}
