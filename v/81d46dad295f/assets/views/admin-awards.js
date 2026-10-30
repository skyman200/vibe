// 관리자 [심사] → 최종 결과: 점수표와 수상 팀 고르기(팀마다 금·은·동). 처음에는 점수 순서대로 골라 두고, [수상 팀 저장]한 것이 공식 결과다
// (공개 참가현황·엑셀·시상식이 모두 따른다 — gas/Admin.js apiAdminAwards_). [점수대로]는 고른 것을 지워 점수 순서로 되돌린다.
// [시상식 화면 열기]는 이 탭을 전체 화면 시상식(ceremony.js — 실전: 고른 진짜 수상 팀)으로, [시상식 연습]은 같은 탭에 가짜 팀 연습.
// 대회 모드에서 관리자 화면 맨 위 「행사장 큰 화면」(StageBar)도 여기 둔다 — 실전 모션그래픽 켜기·끄기(설정 stageShow), 행사장 화면 열기,
// 시상식 화면 열기, 실전 장면 고르기(시간표대로 · 제출 마감! · 심사 중 · 수상 축하)와 심사 중 화면에 띄울 팀(발표 순서 · 다음 팀),
// 화면에 함께 나오는 심사위원 이름, 장면마다 현황판 연습 · 시상식 연습.
// 연습은 관리자만(admin.js AdminGate) 열고 같은 탭으로 간다 — 관리자 로그인은 탭 메모리에만 있어 새 탭에서는 다시 로그인해야 하므로.
import { html, useState, useRef, useApp, api, session } from '../lib.js';
import { useBusy } from '../ui.js';
import { PREVIEW_SCENES, LIVE_SCENES, judgingOrder, moveItem, matchOrder } from './stage-logic.js';

const TIERS = [['gold', '금상', '금'], ['silver', '은상', '은'], ['bronze', '동상', '동']];
const KEY_OF = { 금상: 'gold', 은상: 'silver', 동상: 'bronze' };

/** 지금 공식 결과의 수상 팀 { teamId: gold|silver|bronze } */
function officialPicks(r) {
  const out = {};
  r.rows.forEach((x) => { if (!x.dq && KEY_OF[x.award]) out[x.teamId] = KEY_OF[x.award]; });
  return out;
}
/** 지금 화면에서 저장하지 않아 다른 화면으로 가면 사라질 것: '수상 선택'([심사]) · '설정'([설정]) · '' */
const unsaved = () => (document.querySelector('.award-dirty') ? '수상 선택' : document.querySelector('.settings-dirty') ? '설정' : '');

/** 이 탭을 시상식 화면(실전 — 저장한 공식 결과)으로. 버튼을 누른 이 순간에만 전체 화면을 켤 수 있다(브라우저 규칙) — 주소만 바꾸므로 시상식 화면에서도 그대로 */
function openCeremony(lost) {
  if (lost && !confirm(`저장하지 않은 ${lost}이 있습니다. 시상식 화면은 저장한 공식 결과로 열리고, 저장하지 않은 것은 사라집니다. 계속할까요?`)) return;
  if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  location.hash = '#/ceremony';
}

/** 연습 화면으로(같은 탭 링크의 onClick). lost: 저장하지 않아 사라질 것('수상 선택'·'설정') · full: 전체 화면(누른 순간에만 켤 수 있다) */
function goPractice(e, lost, full) {
  if (lost && !confirm(`저장하지 않은 ${lost}이 있습니다. 연습 화면으로 가면 사라집니다. 계속할까요?`)) {
    e.preventDefault();
    return;
  }
  if (full && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
}

const samePicks = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((id) => a[id] === b[id]);

/** r: 관리자 결과(computeResults_) · flags·toggle: 심사 마감·시상 결과 공개 · want: 설정의 상마다 팀 수 */
export function ResultsPanel({ r, flags, toggle, want, reload }) {
  const { notify } = useApp();
  const [busy, run] = useBusy();
  const saved = officialPicks(r);
  const [draft, setDraft] = useState(saved);
  const dirty = !samePicks(draft, saved);
  const pick = (id, key) => setDraft((d) => {
    const n = { ...d };
    if (n[id] === key) delete n[id];
    else n[id] = key;
    return n;
  });
  const send = (picks, done) => run(async () => {
    try {
      await api('adminAwards', { token: session.get('admin'), picks });
      notify(done);
      await reload();
    } catch (err) {
      notify(err.message, 'err');
    }
  });
  const toScore = () => {
    if (r.picked) send(null, '점수 순서대로 되돌렸습니다.');
    else setDraft(saved);
  };
  const count = (key) => Object.keys(draft).filter((id) => draft[id] === key).length;

  return html`<section class=${`panel${dirty ? ' award-dirty' : ''}`}>
    <div class="panel-h"><h2>최종 결과</h2>
      <div class="btn-row">
        <label class="check small"><input type="checkbox" checked=${flags.scoringLocked} onChange=${(e) => toggle('scoringLocked', e.target.checked, e.target.checked ? '심사를 마감했습니다.' : '심사를 다시 열었습니다.')} /><span>심사 마감</span></label>
        <label class="check small"><input type="checkbox" checked=${flags.resultsPublished} onChange=${(e) => toggle('resultsPublished', e.target.checked, e.target.checked ? '시상 결과를 공개했습니다.' : '시상 결과를 비공개로 돌렸습니다.')} /><span>시상 결과 공개</span></label>
      </div>
    </div>
    ${r.warnings.length ? html`<div class="notice warn">${r.warnings.map((w) => html`<div>${w}</div>`)}</div>` : r.rows.length ? html`<div class="notice ok">모든 심사가 끝났습니다.</div>` : ''}
    <div class="award-bar">
      <span class="small"><b>${r.picked ? '공식 결과: 고른 수상 팀' : '공식 결과: 점수 순서(아직 고르지 않음)'}</b>
        <span class="num"> · 고른 팀 ${TIERS.map(([k, label]) => `${label} ${count(k)}/${want[k]}`).join(' · ')}</span></span>
      <span class="btn-row">
        <button type="button" class="btn btn-sm btn-primary" disabled=${busy || (!dirty && r.picked)} onClick=${() => send(draft, '수상 팀을 저장했습니다. 공개 참가현황·엑셀·시상식이 이 결과를 따릅니다.')}>수상 팀 저장</button>
        <button type="button" class="btn btn-sm" disabled=${busy || (!r.picked && !dirty)} onClick=${toScore}>점수대로</button>
        <button type="button" class="btn btn-sm" disabled=${busy} onClick=${() => openCeremony(dirty && '수상 선택')}>시상식 화면 열기</button>
        <a class="btn btn-sm btn-ghost" href="#/ceremony?practice=1" onClick=${(e) => goPractice(e, dirty && '수상 선택', true)}>시상식 연습</a>
      </span>
    </div>
    <div class="table-box"><table class="dtable">
      <thead><tr><th>순위</th><th>시상</th><th>수상 고르기</th><th>팀</th><th>코드(50)</th><th>대면 평균(50)</th><th>심사위원</th><th>감점</th><th>총점</th></tr></thead>
      <tbody>${r.rows.map((x) => html`<tr key=${x.teamId}>
        <td class="num"><b>${x.dq ? '실격' : x.rank || '-'}</b></td>
        <td>${x.award ? html`<span class="award">${x.award}</span>` : ''}${x.scoreAward !== x.award ? html`<div class="small muted">점수대로 ${x.scoreAward || '비수상'}</div>` : ''}</td>
        <td>${x.dq ? html`<span class="small muted">고를 수 없음</span>` : html`<span class="award-pick" role="group" aria-label=${`${x.name} 수상 고르기`}>
          ${TIERS.map(([k, label, short]) => html`<button type="button" class=${`pick-${k}`} aria-pressed=${draft[x.teamId] === k ? 'true' : 'false'} title=${label} onClick=${() => pick(x.teamId, k)}>${short}</button>`)}
        </span>`}</td>
        <td>${x.name}${x.dq ? html` <span class="pstate bad">실격</span>` : ''}</td><td class="num">${x.code === null ? '-' : x.code}</td><td class="num">${x.live === null ? '-' : x.live.toFixed(2)}</td>
        <td class="num">${x.liveCount}/${x.judgeCount}</td>
        <td class="num">${x.penalty ? html`<b>-${x.penalty}</b><div class="small muted">${x.lateNote}</div>` : ''}</td><td class="num"><b>${x.total === null ? '-' : x.total.toFixed(2)}</b></td>
      </tr>`)}</tbody>
    </table></div>
    <p class="small muted" style="margin:0">총점 = 코드 심사 + 대면 심사 평균 − 늦은 제출 감점(설정의 기준 시각 뒤 최종 제출·미제출 팀). 같으면 대면 점수가 높은 팀이 위. 실격 팀은 순위·시상 없이 맨 아래. 시상 수는 설정에서 바꿀 수 있습니다.
      수상 고르기는 처음에 점수 순서대로 채워 두었습니다 — 심사위원 협의로 바꿀 때 누르고(같은 단추를 다시 누르면 비수상) [수상 팀 저장]을 누르세요.</p>
  </section>`;
}

/**
 * 심사 순서 붙여 넣기 칸: 한 줄에 한 팀(단톡방 글 그대로) → 알아본 순서를 바로 보여 주고, 모르는 줄·겹친 줄·글에 없는 팀(맨 뒤에 둠)을 알린다.
 * teams: 지금 심사 순서의 팀(관리자 답 — 팀원 이름으로도 알아본다)
 */
function OrderPaste({ text, setText, teams, busy, save }) {
  const m = matchOrder(text, teams.map((t) => ({ id: t.id, name: t.name, members: t.members.map((x) => x.name) })));
  const name = (id) => teams.find((t) => t.id === id).name;
  return html`<div class="sb-paste">
    <label for="order-paste"><b>순서 붙여 넣기</b> <span class="small muted">한 줄에 한 팀씩 — 단톡방 글을 그대로 붙여 넣어도 됩니다(팀 이름이나 팀원 이름으로 알아봅니다)</span></label>
    <textarea id="order-paste" class="textarea" rows="7" value=${text} onInput=${(e) => setText(e.target.value)}
      placeholder=${'1번째 김태균(spk_기계공학과)\n2번째 홍예은(CORE_물리치료과)\n…'}></textarea>
    ${m.order.length ? html`<ol class="sb-preview" aria-label="알아본 심사 순서">${m.order.map((id, i) => html`<li><b class="num">${i + 1}</b>${name(id)}</li>`)}
      ${m.missing.map((id, i) => html`<li class="muted"><b class="num">${m.order.length + i + 1}</b>${name(id)} <small>(글에 없음 — 맨 뒤)</small></li>`)}</ol>` : ''}
    ${m.unknown.length || m.dup.length ? html`<div class="notice warn small">
      ${m.unknown.length ? html`<div>알아보지 못한 줄(빼고 저장): ${m.unknown.join(' / ')}</div>` : ''}
      ${m.dup.length ? html`<div>같은 팀이 또 나온 줄(뺌): ${m.dup.join(' / ')}</div>` : ''}
    </div>` : ''}
    <div class="btn-row">
      <button type="button" class="btn btn-sm btn-primary" disabled=${busy || !m.order.length} onClick=${() => save(m.order.concat(m.missing))}>이 순서로 저장</button>
      <button type="button" class="btn btn-sm btn-ghost" onClick=${() => setText(null)}>닫기</button>
    </div>
  </div>`;
}

/**
 * 관리자 화면 맨 위(대회 모드) 「행사장 큰 화면」. 실전: 모션그래픽 켜기·끄기(설정 stageShow 를 곧바로 저장 — 행사장 현황판이 몇 초 안에 따른다),
 * 행사장 화면 열기(새 탭 — 로그인 없이 열리는 공개 현황판 #/board?tv=1), 시상식 화면 열기(이 탭, 저장한 공식 결과),
 * 켜져 있으면 장면 단추와 심사 팀 칩(누르면 곧바로 adminStage — 전체를 다시 읽지 않는다)·[◀ 이전 팀]·[다음 팀 ▶]·심사위원 이름.
 * 심사 팀 칩은 끌어 놓으면 심사 순서가 바뀌고 놓는 순간 저장된다(adminStageOrder — 마우스·터치 모두, 칩에서 Alt+←/→ 도). 테이블 번호는 그대로.
 * [순서 붙여 넣기]: 단톡방에서 받은 순서 글을 그대로 붙여 넣으면 팀을 알아봐(matchOrder) 미리 보여 주고 [이 순서로 저장]. 실격 팀은 빠진다.
 * 심사위원 화면의 팀 목록도 이 순서다(gas/Judge.js).
 * 연습: 장면마다 현황판 연습 · 시상식 연습(이 탭, 관리자만 — 행사장 화면과 서버에는 영향 없음, 수상 장면은 가짜 팀).
 * data: 관리자 화면 답(settings · stage · teams · judges).
 */
export function StageBar({ data, reload }) {
  const settings = data.settings;
  const { notify } = useApp();
  const [busy, run] = useBusy();
  const [ctl, setCtl] = useState(data.stage || { scene: 'auto', teamId: '', order: [] });
  const on = settings.stageShow === 'Y';
  const published = settings.resultsPublished === 'Y';
  const byId = {};
  data.teams.forEach((t) => { byId[t.id] = t; });
  const dq = new Set(data.results.rows.filter((r) => r.dq).map((r) => r.teamId));   // 실격 팀은 심사하지 않는다
  const saved = judgingOrder(data.teams.filter((t) => t.status === 'selected' && !dq.has(t.id)), ctl.order || []).map((t) => t.id);
  const [paste, setPaste] = useState(null);   // 붙여 넣기 칸(null 이면 닫힘)
  // 끄는 동안의 순서(놓으면 저장, 답이 오면 지운다) — 포인터 이벤트 사이에서는 ref 로 최신 값을 본다
  const [moving, setMoving] = useState(null);
  const [dragId, setDragId] = useState('');
  const drag = useRef(null);
  const live = useRef(null);
  const dragged = useRef(false);
  const teams = (moving || saved).map((id) => byId[id]);
  const judges = data.judges.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)).map((j) => j.name);
  const current = teams.find((t) => t.id === ctl.teamId) || null;
  const label = (t) => `${teams.indexOf(t) + 1}번째 ${t.name}`;
  const send = (scene, teamId, done) => run(async () => {
    try {
      const res = await api('adminStage', { token: session.get('admin'), scene, teamId });
      setCtl(res.stage);
      notify(done);
    } catch (err) {
      notify(err.message, 'err');
    }
  });
  const sceneName = (k) => LIVE_SCENES.find(([x]) => x === k)[1];
  const chooseScene = (k) => send(k, ctl.teamId, `행사장 화면: ${sceneName(k)}`);
  // 팀을 누르면 심사 중 장면으로 바꾸고 그 팀을 크게 띄운다
  const chooseTeam = (t) => send('judging', t.id, `행사장 화면: 심사 중 · ${label(t)}`);
  const step = (d) => {
    const i = current ? teams.indexOf(current) : -1;
    const t = teams[i < 0 ? (d > 0 ? 0 : teams.length - 1) : i + d];
    if (t) chooseTeam(t);
  };
  // 심사 순서 저장: 같으면 보내지 않는다. 다른 저장 중이면 되돌리고 알린다(한 번에 하나씩)
  const commit = (list, after) => {
    if (list.join(',') === saved.join(',')) {
      setMoving(null);
      if (after) { after(); notify('지금 심사 순서와 같습니다.'); }
      return;
    }
    if (busy) { setMoving(null); notify('저장하는 중입니다. 잠시 뒤 다시 해 주세요.', 'err'); return; }
    run(async () => {
      try {
        const res = await api('adminStageOrder', { token: session.get('admin'), order: list });
        setCtl(res.stage);
        if (after) after();
        notify('심사 순서를 바꿨습니다 — 행사장 화면의 다음 팀과 심사위원 화면의 목록도 이 순서를 따릅니다.');
      } catch (err) {
        notify(err.message, 'err');
      } finally {
        setMoving(null);
      }
    });
  };
  const grab = (e, id) => {
    if (e.button !== 0) return;
    dragged.current = false;
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
    live.current = saved;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const slide = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.moved = true;
      setDragId(d.id);
    }
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const chip = over && over.closest('[data-team]');
    const list = live.current;
    const to = chip ? list.indexOf(chip.dataset.team) : -1;
    const from = list.indexOf(d.id);
    if (to < 0 || to === from) return;
    live.current = moveItem(list, from, to);
    setMoving(live.current);
  };
  const drop = (cancel) => {
    const d = drag.current;
    drag.current = null;
    setDragId('');
    if (!d || !d.moved) return;
    dragged.current = true;   // 놓은 뒤 따라오는 click 은 팀 고르기가 아니다
    if (cancel) setMoving(null);
    else commit(live.current);
  };
  const nudge = (e, id) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const from = saved.indexOf(id);
    const to = from + (e.key === 'ArrowLeft' ? -1 : 1);
    if (to >= 0 && to < saved.length) commit(moveItem(saved, from, to));
  };
  const tvUrl = `${location.href.split('#')[0]}#/board?tv=1`;
  const toggle = () => {
    const ask = on ? '실전 모션그래픽을 끌까요? 행사장 화면이 곧 팀 현황판으로 돌아갑니다.'
      : '실전 모션그래픽을 켤까요? 행사장 화면(현황판 TV)이 곧(15초 안에) 모션그래픽으로 바뀝니다.';
    const lost = unsaved();
    if (!confirm(lost ? `${ask}\n저장하지 않은 ${lost}은 사라집니다.` : ask)) return;
    run(async () => {
      try {
        await api('adminSettings', { token: session.get('admin'), settings: { stageShow: on ? 'N' : 'Y' } });
        notify(on ? '실전 모션그래픽을 껐습니다. 행사장 화면이 곧 팀 현황판으로 돌아갑니다.' : '실전 모션그래픽을 켰습니다. 행사장 화면이 곧 바뀝니다.');
        await reload();
      } catch (err) {
        notify(err.message, 'err');
      }
    });
  };
  const practice = (e, full) => goPractice(e, unsaved(), full);
  return html`<section class="panel stage-bar" aria-label="행사장 큰 화면">
    <div class="panel-h"><h2>행사장 큰 화면 <span class=${`pstate${on ? ' ok' : ''}`}>${on ? '실전 모션그래픽 켜짐' : '모션그래픽 꺼짐 · 팀 현황판'}</span></h2>
      <div class="btn-row">
        <button type="button" class=${`btn btn-sm${on ? '' : ' btn-primary'}`} disabled=${busy} onClick=${toggle}>${on ? '실전 끄기' : '실전 켜기'}</button>
        <a class="btn btn-sm" href="#/board?tv=1" target="_blank" rel="noopener">행사장 화면 열기</a>
        <button type="button" class="btn btn-sm" onClick=${() => openCeremony(unsaved())}>시상식 화면 열기</button>
      </div>
    </div>
    ${on ? html`<div class="sb-row">
      <span class="sb-k">화면</span>
      <div class="seg" role="group" aria-label="행사장 화면 장면">
        ${LIVE_SCENES.map(([k, name, hint]) => html`<button type="button" data-scene=${k} aria-pressed=${ctl.scene === k ? 'true' : 'false'} disabled=${busy || (k === 'winners' && !published)}
          onClick=${() => chooseScene(k)}><b>${name}</b><small>${k === 'winners' && !published ? '시상 결과 공개 뒤에 고를 수 있음' : hint}</small></button>`)}
      </div>
    </div>
    <div class="sb-row">
      <span class="sb-k">심사 순서<small>끌어서 바꾸기</small></span>
      <div class="team-chips" role="group" aria-label="심사 순서(끌어서 바꾸기) · 누르면 행사장 화면에">
        ${teams.map((t, i) => html`<button type="button" key=${t.id} data-team=${t.id} class=${`chip${dragId === t.id ? ' dragging' : ''}`}
          aria-pressed=${t.id === ctl.teamId ? 'true' : 'false'} title="끌어서 심사 순서 바꾸기 · 누르면 행사장 화면에(Alt+←/→ 로도 옮김)"
          onPointerDown=${(e) => grab(e, t.id)} onPointerMove=${slide} onPointerUp=${() => drop(false)} onPointerCancel=${() => drop(true)}
          onKeyDown=${(e) => nudge(e, t.id)}
          onClick=${() => { if (dragged.current) { dragged.current = false; return; } if (!busy) chooseTeam(t); }}>
          <b class="num">${i + 1}</b><span class="chip-name">${t.name}</span>${t.presentOrder ? html`<small>테이블 ${t.presentOrder}</small>` : ''}</button>`)}
      </div>
      <span class="btn-row">
        <button type="button" class="btn btn-sm" disabled=${busy || !teams.length} onClick=${() => step(-1)}>◀ 이전 팀</button>
        <button type="button" class="btn btn-sm btn-primary" disabled=${busy || !teams.length} onClick=${() => step(1)}>다음 팀 ▶</button>
        <button type="button" class="btn btn-sm btn-ghost" disabled=${busy || !ctl.teamId} onClick=${() => send(ctl.scene, '', '심사 팀을 화면에서 내렸습니다.')}>팀 내리기</button>
        <button type="button" class="btn btn-sm btn-ghost" aria-expanded=${paste !== null ? 'true' : 'false'} onClick=${() => setPaste(paste === null ? '' : null)}>순서 붙여 넣기</button>
      </span>
    </div>
    ${paste !== null ? html`<${OrderPaste} text=${paste} setText=${setPaste} teams=${teams} busy=${busy}
      save=${(list) => commit(list, () => setPaste(null))} />` : ''}
    <div class="sb-row small"><span class="sb-k">심사위원</span>
      ${judges.length ? html`<span>${judges.join(' · ')} <span class="muted">— 심사 중 화면에 함께 나옵니다</span></span>`
        : html`<span class="muted">등록된 심사위원이 없습니다 — [심사] 탭에서 추가하면 화면에 함께 나옵니다</span>`}
    </div>
    <p class="small muted">지금: <b>${sceneName(ctl.scene)}</b>${current ? ` · 심사 팀 ${label(current)}` : ''}. 팀을 누르면 행사장 화면이 「심사 중」으로 바뀌고 그 팀이 크게 나옵니다(몇 초 안에).
      심사 팀을 <b>끌어서 놓으면</b> 심사 순서가 바로 바뀝니다(테이블 번호는 그대로) — [다음 팀 ▶]·화면의 '다음 팀'·심사위원 화면의 목록이 이 순서를 따릅니다.
      단톡방에서 받은 순서는 [순서 붙여 넣기]로 한 번에 넣습니다.
      [시간표대로]를 누르면 남은 시간 → 제출 마감! → 심사 중 → 수상 축하(시상 결과 공개 뒤)로 저절로 바뀝니다.${' '}
      행사장 컴퓨터에서는 <span class="mono">${tvUrl}</span> 을 열고 [전체 화면]을 누르세요(로그인 필요 없음).</p>`
      : html`<p class="small muted">[실전 켜기]를 누르면 행사장 화면이 모션그래픽(남은 시간 → 제출 마감! → 심사 중 → 수상 축하)으로 바뀌고, 여기서 장면과 심사 팀을 고를 수 있습니다.${' '}
      행사장 컴퓨터에서는 <span class="mono">${tvUrl}</span> 을 열고 [전체 화면]을 누르세요(로그인 필요 없음).</p>`}
    <div class="stage-links small">연습(관리자만 · 이 탭에서 열고 [나가기]로 돌아옵니다 · 행사장 화면에는 영향 없음 · 수상 장면은 가짜 팀):
      ${PREVIEW_SCENES.map(([k, label], i) => html`${i ? ' · ' : ' '}<a href=${`#/board?tv=1&preview=${k}`} onClick=${(e) => practice(e, false)}>${label}</a>`)}
      ${' · '}<a href="#/ceremony?practice=1" onClick=${(e) => practice(e, true)}>시상식 연습</a></div>
  </section>`;
}
