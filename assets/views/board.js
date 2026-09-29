// 공개 참가현황 칸반. 서버가 학번·연락처·이메일을 보내지 않으므로 화면에는 흐린 자리표시만 있다.
import { html, useState, useEffect, useApp, api, useInterval, fmtShort } from '../lib.js';
import { Modal, Slots, Veil } from '../ui.js';

const SERIES = ['공학계열', '보건계열', '자연과학계열', '인문사회계열', '예체능계열'];
const COL_NOTE = {
  forming: '아직 신청 전입니다. 4명이 모이면 팀장이 제출합니다.',
  applied: '4인 1조로 신청서를 낸 팀입니다.',
  selected: '진리관 컨벤션홀 본선에 참가할 팀입니다.',
  waitlist: '본선 진출 팀에 결원이 생기면 차례로 안내합니다.',
  building: '결과물을 아직 내지 않은 팀입니다.',
  submitted: 'GitHub 저장소를 제출한 팀입니다.',
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

export function BoardView() {
  const { config } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [series, setSeries] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const load = async () => {
    try {
      const d = await api('board');
      setData(d);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);
  useInterval(load, 30000);

  const size = config.teamSize;
  const needle = q.trim().toLowerCase();
  const visible = (t) => (!series || t.repDept.series === series)
    && (!needle || [t.name, t.projectName, t.topic, t.repDept.name, ...t.depts].join(' ').toLowerCase().includes(needle));

  const ph = data ? data.phase : config.phase;
  const contest = data && data.mode === 'contest';
  const AWARD_ORDER = { 금상: 0, 은상: 1, 동상: 2 };
  const winners = data ? data.teams.filter((t) => t.award).sort((a, b) => AWARD_ORDER[a.award] - AWARD_ORDER[b.award] || a.rank - b.rank) : [];

  return html`<div class="wrap-wide page">
    <div class="page-h">
      <div>
        <h1>${contest ? '대회 진행 현황' : '참가현황'}</h1>
        <p class="num">
          ${contest
            ? html`본선 ${ph.selectedTeams}팀 · 결과물 제출 ${data.teams.filter((t) => t.column === 'submitted').length}팀`
            : html`접수 완료 <b>${ph.appliedTeams}팀</b>(${ph.applicants}명 / 정원 ${ph.applicantCap}명) · 팀 구성 중 ${ph.formingTeams}팀 · 본선 ${ph.selectTarget}팀`}
        </p>
      </div>
      <div class="btn-row">
        <span class="small muted">${data ? `${fmtShort(data.phase.now)} 기준 · 30초마다 새로 고침` : ''}</span>
        <button class="btn btn-sm" onClick=${load}>새로 고침</button>
      </div>
    </div>

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
    ${!data ? html`<p class="muted">불러오는 중…</p>` : html`<div class="board">
      ${data.columns.map((col) => {
        const cards = data.teams.filter((t) => t.column === col.key && visible(t));
        return html`<section class=${`col${col.key === 'forming' ? ' dashed' : ''}`} aria-label=${col.label}>
          <div class="col-h"><h3>${col.label}</h3><span class="count">${cards.length}${cards.length !== col.count ? html`<small> / ${col.count}</small>` : ''}</span></div>
          <div class="col-note">${COL_NOTE[col.key] || ''}</div>
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
