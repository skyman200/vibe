// 공개 참가현황 칸반. 서버가 학번·연락처·이메일을 보내지 않으므로 화면에는 흐린 자리표시만 있다.
// 대회 모드에는 결과물 제출 마감까지 남은 시간과 지금·다음 일정을 위에 두고, #/board?tv=1 은 행사장 TV 용 현황판(board-tv.js)이다.
import { html, useState, useEffect, useApp, api, useInterval, fmtShort, fmtWhen, toMs } from '../lib.js';
import { Modal, Slots, Veil } from '../ui.js';
import { TvBoard } from './board-tv.js';
import { NowNext, useSkew, hms } from './tv-bits.js';

const SERIES = ['공학계열', '보건계열', '자연과학계열', '인문사회계열', '예체능계열'];
const COL_NOTE = {
  forming: '아직 신청 전입니다. 4명이 모이면 팀장이 제출합니다.',
  applied: '4인 1조로 신청서를 낸 팀입니다.',
  selected: '진리관 컨벤션홀 본선에 참가할 팀입니다.',
  waitlist: '본선 진출 팀에 결원이 생기면 차례로 안내합니다.',
  building: '아직 GitHub 저장소를 등록하지 않은 팀입니다.',
  registered: '저장소를 등록하고 개발 중인 팀입니다. 마감 당일 팀원 모두 만족도 조사를 마치면 최종 제출합니다.',
  submitted: '팀원 모두 만족도 조사를 마치고 최종 제출한 팀입니다. 마감 전 커밋은 계속 반영됩니다.',
};
/** 결과물 제출이 마감된 뒤의 칸 설명 */
const COL_NOTE_CLOSED = {
  building: '마감까지 최종 제출하지 않은 팀입니다.',
  submitted: '최종 제출한 팀입니다. 마감 시각의 커밋으로 심사합니다.',
};

function roleText(role) {
  return role === 'leader' ? '팀장' : '팀원';
}

function Card({ t, size, onOpen }) {
  const open = () => onOpen(t);
  const empty = Math.max(0, size - t.count);
  return html`<article class="card" role="button" tabindex="0" aria-label=${`${t.name} 신청 내용 보기`}
    onClick=${open} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
    <div class="card-top"><h4>${t.name}</h4>${t.award ? html`<span class="award">${t.award}</span>` : ''}</div>
    <div class="proj">${t.projectName}</div>
    <div class="dept">${t.repDept.name}</div>
    <ul class="mem">
      ${t.members.map((m) => html`<li><span class="role">${roleText(m.role)}</span><span class="who">${m.name} · ${m.deptName}</span><${Veil} kind="studentNo" /></li>`)}
      ${Array.from({ length: empty }, () => html`<li><span class="role">팀원</span><span class="who empty">모집 중</span><span></span></li>`)}
    </ul>
    <div class="card-foot"><span>${t.repDept.series}</span><span class="num">${t.count}/${size}명</span></div>
  </article>`;
}

export function PublicSheet({ t, size, onClose }) {
  const rows = t.members.concat(Array.from({ length: Math.max(0, size - t.count) }, () => null));
  return html`<${Modal} title=${t.name} onClose=${onClose}>
    <div class="stack">
      <dl class="kv">
        <dt>참가 주제(안)</dt><dd>${t.topic}</dd>
        <dt>프로젝트명(안)</dt><dd>${t.projectName}</dd>
        <dt>대표 학과</dt><dd>${t.repDept.name} · ${t.repDept.series}</dd>
        ${t.award ? html`<dt>시상</dt><dd><span class="award">${t.award}</span></dd>` : ''}
      </dl>
      <div>
        <div class="panel-h" style="margin-bottom:10px"><h2>팀원 정보</h2><${Slots} count=${t.count} size=${size} /></div>
        <div class="scroll-x">
          <table class="sheet">
            <thead><tr><th>구분</th><th>학과</th><th>학번</th><th>성명</th><th>연락처</th><th>이메일</th></tr></thead>
            <tbody>
              ${rows.map((m, i) => (m ? html`<tr>
                <td>${m.role === 'leader' ? '팀장' : `팀원 ${i}`}</td><td>${m.deptName}</td><td><${Veil} kind="studentNo" /></td>
                <td>${m.name}</td><td><${Veil} kind="phone" /></td><td><${Veil} kind="email" /></td>
              </tr>` : html`<tr><td>팀원 ${i}</td><td class="muted" colspan="5">아직 합류하지 않았습니다</td></tr>`))}
            </tbody>
          </table>
        </div>
        <p class="small muted" style="margin-top:10px">개인정보 보호를 위해 학번·연락처·이메일은 가리고 성명은 일부만 보여 줍니다. 원문은 관리자만 볼 수 있습니다.</p>
      </div>
    </div>
  <//>`;
}

/** 대회 모드 머리: 결과물 제출 마감까지 남은 시간(1초마다), 지금·다음 일정, 현황판(TV) 링크. */
function ContestStrip({ data }) {
  const [, setTick] = useState(0);
  const skew = useSkew(data.phase.now);
  const ms = Date.now() + skew;
  // 공개 참가현황은 캐시를 거쳐 조금 늦을 수 있어 열림·마감은 답의 단계(phase.submit) 대신 시각으로 정한다
  const left = toMs(data.contest.deadline) + 59999 - ms;
  const before = ms < toMs(data.contest.open);
  const open = !before && left > 0;
  useInterval(() => setTick((n) => n + 1), 1000);
  return html`<div class="contest-strip">
    <div class=${`countdown${open ? (left < 3600e3 ? ' soon' : '') : ' over'}`} role="timer">
      <span class="small">${open ? '결과물 제출 마감까지' : before ? '결과물 제출 시작' : '결과물 제출'}</span>
      <b class="num">${open ? hms(left) : before ? fmtWhen(data.contest.open) : '마감되었습니다'}</b>
      <span class="small num">마감 ${fmtWhen(data.contest.deadline)}</span>
    </div>
    <${NowNext} ms=${ms} cls="contest-plan" />
    <a class="btn btn-sm" href="#/board?tv=1">현황판 크게 띄우기</a>
  </div>`;
}

/** 공개 참가현황. #/board?tv=1 이면 현황판(TV). 같은 화면에서 주소만 바뀌어도 서로 다른 화면으로 새로 그린다. */
export function BoardView() {
  const { route } = useApp();
  return route.query.get('tv') === '1' ? html`<${TvBoard} />` : html`<${KanbanBoard} />`;
}

function KanbanBoard() {
  const { config } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [series, setSeries] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [slow, setSlow] = useState(false);

  const load = async () => {
    try {
      const d = await api('board');
      setData(d);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    const t = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(t);
  }, []);
  useInterval(load, 30000);

  const size = config.teamSize;
  const needle = q.trim().toLowerCase();
  const visible = (t) => (!series || t.repDept.series === series)
    && (!needle || [t.name, t.projectName, t.topic, t.repDept.name, ...t.depts].join(' ').toLowerCase().includes(needle));

  const ph = data ? data.phase : config.phase;
  const contest = data && data.mode === 'contest';
  // 접수가 끝나면 팀 구성 중인 팀은 더 모이거나 제출할 수 없다(서버가 막는다) — 그 칸과 수는 보이지 않는다.
  // 관리자 칸반에는 남아 [팀 삭제]로 정리한다.
  const closed = ph.apply === 'closed';
  const columns = data ? data.columns.filter((c) => !(closed && c.key === 'forming')) : [];
  const AWARD_ORDER = { 금상: 0, 은상: 1, 동상: 2 };
  const winners = data ? data.teams.filter((t) => t.award).sort((a, b) => AWARD_ORDER[a.award] - AWARD_ORDER[b.award] || a.rank - b.rank) : [];
  const count = (k) => data.teams.filter((t) => t.column === k).length;
  const notes = contest && ph.submit === 'closed' ? { ...COL_NOTE, ...COL_NOTE_CLOSED } : COL_NOTE;

  return html`<div class="wrap-wide page">
    <div class="page-h">
      <div>
        <h1>${contest ? '대회 진행 현황' : '참가현황'}</h1>
        <p class="num">
          ${contest
            ? html`본선 ${ph.selectedTeams}팀 · ${ph.submit === 'closed'
              ? `제출 완료 ${count('submitted')}팀 · 미제출 ${count('building')}팀`
              : `저장소 등록 ${count('registered') + count('submitted')}팀 · 최종 제출 ${count('submitted')}팀`}`
            : html`접수 완료 <b>${ph.appliedTeams}팀</b>(${ph.applicants}명 / 정원 ${ph.applicantCap}명)${closed ? '' : ` · 팀 구성 중 ${ph.formingTeams}팀`} · 본선 ${ph.selectTarget}팀`}
        </p>
      </div>
      <div class="btn-row">
        <span class="small muted">${data ? `${fmtShort(data.phase.now)} 기준 · 30초마다 새로 고침` : ''}</span>
        <button class="btn btn-sm" onClick=${load}>새로 고침</button>
      </div>
    </div>

    ${contest && data.contest ? html`<${ContestStrip} data=${data} />` : ''}

    ${winners.length ? html`<div class="box box-ink" style="margin-bottom:24px">
      <p class="overline">시상 결과</p>
      <table class="table"><tbody>
        ${winners.map((t) => html`<tr><td style="width:80px"><span class="award">${t.award}</span></td><td><b>${t.name}</b></td><td class="muted">${t.projectName}</td></tr>`)}
      </tbody></table>
    </div>` : ''}

    <div class="toolbar">
      <div class="chips" role="group" aria-label="계열 필터">
        <button class="chip" aria-pressed=${series === '' ? 'true' : 'false'} onClick=${() => setSeries('')}>전체</button>
        ${SERIES.map((s) => html`<button class="chip" aria-pressed=${series === s ? 'true' : 'false'} onClick=${() => setSeries(s)}>${s.replace('계열', '')}</button>`)}
      </div>
      <input class="input" type="search" placeholder="팀명·프로젝트·학과 검색" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="검색" />
    </div>

    ${error ? html`<div class="notice bad" style="margin-bottom:16px">${error}</div>` : ''}
    ${!data ? html`<p class="muted">불러오는 중…</p>
      ${slow && !error ? html`<div class="notice warn">연결이 느립니다. 자동으로 계속 시도하고 있습니다. <button class="link-btn" onClick=${load}>지금 다시 시도</button></div>` : ''}` : html`<div class="board">
      ${columns.map((col) => {
        const cards = data.teams.filter((t) => t.column === col.key && visible(t));
        return html`<section class=${`col${col.key === 'forming' ? ' dashed' : ''}`} aria-label=${col.label}>
          <div class="col-h"><h3>${col.label}</h3><span class="count">${cards.length}${cards.length !== col.count ? html`<small> / ${col.count}</small>` : ''}</span></div>
          <div class="col-note">${notes[col.key] || ''}</div>
          <div class="cards">
            ${cards.length ? cards.map((t) => html`<${Card} key=${t.key} t=${t} size=${size} onOpen=${setOpen} />`)
              : html`<div class="empty-col">${needle || series ? '조건에 맞는 팀이 없습니다.' : '아직 없습니다.'}</div>`}
          </div>
        </section>`;
      })}
    </div>`}
    ${open ? html`<${PublicSheet} t=${open} size=${size} onClose=${() => setOpen(null)} />` : ''}
  </div>`;
}
