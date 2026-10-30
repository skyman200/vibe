// 관리자 [심사] → 최종 결과: 점수표와 수상 팀 고르기(팀마다 금·은·동). 처음에는 점수 순서대로 골라 두고, [수상 팀 저장]한 것이 공식 결과다
// (공개 참가현황·엑셀·시상식이 모두 따른다 — gas/Admin.js apiAdminAwards_). [점수대로]는 고른 것을 지워 점수 순서로 되돌린다.
// [시상식 화면 열기]는 이 탭을 전체 화면 시상식(ceremony.js — 실전: 고른 진짜 수상 팀)으로, [시상식 연습]은 같은 탭에 가짜 팀 연습.
// 대회 모드에서 관리자 화면 맨 위 「행사장 큰 화면」(StageBar)도 여기 둔다 — 실전 모션그래픽 켜기·끄기(설정 stageShow), 행사장 화면 열기,
// 시상식 화면 열기, 실전 장면 고르기(시간표대로 · 제출 마감! · 심사 중 · 수상 축하)와 심사 중 화면에 띄울 팀(발표 순서 · 다음 팀),
// 화면에 함께 나오는 심사위원 이름, 장면마다 현황판 연습 · 시상식 연습.
// 연습은 관리자만(admin.js AdminGate) 열고 같은 탭으로 간다 — 관리자 로그인은 탭 메모리에만 있어 새 탭에서는 다시 로그인해야 하므로.
import { html, useState, useApp, api, session } from '../lib.js';
import { useBusy } from '../ui.js';
import { PREVIEW_SCENES, LIVE_SCENES, byOrder } from './stage-logic.js';

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
      <thead><tr><th>순위</th><th>시상</th><th>수상 고르기</th><th>팀</th><th>코드(50)</th><th>대면 평균(50)</th><th>심사위원</th><th>총점</th></tr></thead>
      <tbody>${r.rows.map((x) => html`<tr key=${x.teamId}>
        <td class="num"><b>${x.dq ? '실격' : x.rank || '-'}</b></td>
        <td>${x.award ? html`<span class="award">${x.award}</span>` : ''}${x.scoreAward !== x.award ? html`<div class="small muted">점수대로 ${x.scoreAward || '비수상'}</div>` : ''}</td>
        <td>${x.dq ? html`<span class="small muted">고를 수 없음</span>` : html`<span class="award-pick" role="group" aria-label=${`${x.name} 수상 고르기`}>
          ${TIERS.map(([k, label, short]) => html`<button type="button" class=${`pick-${k}`} aria-pressed=${draft[x.teamId] === k ? 'true' : 'false'} title=${label} onClick=${() => pick(x.teamId, k)}>${short}</button>`)}
        </span>`}</td>
        <td>${x.name}${x.dq ? html` <span class="pstate bad">실격</span>` : ''}</td><td class="num">${x.code === null ? '-' : x.code}</td><td class="num">${x.live === null ? '-' : x.live.toFixed(2)}</td>
        <td class="num">${x.liveCount}/${x.judgeCount}</td><td class="num"><b>${x.total === null ? '-' : x.total.toFixed(2)}</b></td>
      </tr>`)}</tbody>
    </table></div>
    <p class="small muted" style="margin:0">총점 = 코드 심사 + 대면 심사 평균. 같으면 대면 점수가 높은 팀이 위. 실격 팀은 순위·시상 없이 맨 아래. 시상 수는 설정에서 바꿀 수 있습니다.
      수상 고르기는 처음에 점수 순서대로 채워 두었습니다 — 심사위원 협의로 바꿀 때 누르고(같은 단추를 다시 누르면 비수상) [수상 팀 저장]을 누르세요.</p>
  </section>`;
}

/**
 * 관리자 화면 맨 위(대회 모드) 「행사장 큰 화면」. 실전: 모션그래픽 켜기·끄기(설정 stageShow 를 곧바로 저장 — 행사장 현황판이 몇 초 안에 따른다),
 * 행사장 화면 열기(새 탭 — 로그인 없이 열리는 공개 현황판 #/board?tv=1), 시상식 화면 열기(이 탭, 저장한 공식 결과),
 * 켜져 있으면 장면 단추와 심사 팀 칩(누르면 곧바로 adminStage — 전체를 다시 읽지 않는다)·[◀ 이전 팀]·[다음 팀 ▶]·심사위원 이름.
 * 연습: 장면마다 현황판 연습 · 시상식 연습(이 탭, 관리자만 — 행사장 화면과 서버에는 영향 없음, 수상 장면은 가짜 팀).
 * data: 관리자 화면 답(settings · stage · teams · judges).
 */
export function StageBar({ data, reload }) {
  const settings = data.settings;
  const { notify } = useApp();
  const [busy, run] = useBusy();
  const [ctl, setCtl] = useState(data.stage || { scene: 'auto', teamId: '' });
  const on = settings.stageShow === 'Y';
  const published = settings.resultsPublished === 'Y';
  const teams = byOrder(data.teams.filter((t) => t.status === 'selected'), 'presentOrder');
  const judges = data.judges.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)).map((j) => j.name);
  const current = teams.find((t) => t.id === ctl.teamId) || null;
  const label = (t) => `${t.presentOrder ? `${t.presentOrder}번 ` : ''}${t.name}`;
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
      <span class="sb-k">심사 팀</span>
      <div class="team-chips" role="group" aria-label="심사 중 화면에 띄울 팀">
        ${teams.map((t) => html`<button type="button" class="chip" aria-pressed=${t.id === ctl.teamId ? 'true' : 'false'} disabled=${busy} onClick=${() => chooseTeam(t)}>
          <b class="num">${t.presentOrder || '-'}</b>${t.name}</button>`)}
      </div>
      <span class="btn-row">
        <button type="button" class="btn btn-sm" disabled=${busy || !teams.length} onClick=${() => step(-1)}>◀ 이전 팀</button>
        <button type="button" class="btn btn-sm btn-primary" disabled=${busy || !teams.length} onClick=${() => step(1)}>다음 팀 ▶</button>
        <button type="button" class="btn btn-sm btn-ghost" disabled=${busy || !ctl.teamId} onClick=${() => send(ctl.scene, '', '심사 팀을 화면에서 내렸습니다.')}>팀 내리기</button>
      </span>
    </div>
    <div class="sb-row small"><span class="sb-k">심사위원</span>
      ${judges.length ? html`<span>${judges.join(' · ')} <span class="muted">— 심사 중 화면에 함께 나옵니다</span></span>`
        : html`<span class="muted">등록된 심사위원이 없습니다 — [심사] 탭에서 추가하면 화면에 함께 나옵니다</span>`}
    </div>
    <p class="small muted">지금: <b>${sceneName(ctl.scene)}</b>${current ? ` · 심사 팀 ${label(current)}` : ''}. 팀을 누르면 행사장 화면이 「심사 중」으로 바뀌고 그 팀이 크게 나옵니다(몇 초 안에) — [다음 팀 ▶]은 발표 순서대로.
      [시간표대로]를 누르면 남은 시간 → 제출 마감! → 심사 중 → 수상 축하(시상 결과 공개 뒤)로 저절로 바뀝니다.${' '}
      행사장 컴퓨터에서는 <span class="mono">${tvUrl}</span> 을 열고 [전체 화면]을 누르세요(로그인 필요 없음).</p>`
      : html`<p class="small muted">[실전 켜기]를 누르면 행사장 화면이 모션그래픽(남은 시간 → 제출 마감! → 심사 중 → 수상 축하)으로 바뀌고, 여기서 장면과 심사 팀을 고를 수 있습니다.${' '}
      행사장 컴퓨터에서는 <span class="mono">${tvUrl}</span> 을 열고 [전체 화면]을 누르세요(로그인 필요 없음).</p>`}
    <div class="stage-links small">연습(관리자만 · 이 탭에서 열고 [나가기]로 돌아옵니다 · 행사장 화면에는 영향 없음 · 수상 장면은 가짜 팀):
      ${PREVIEW_SCENES.map(([k, label], i) => html`${i ? ' · ' : ' '}<a href=${`#/board?tv=1&preview=${k}`} onClick=${(e) => practice(e, false)}>${label}</a>`)}
      ${' · '}<a href="#/ceremony?practice=1" onClick=${(e) => practice(e, true)}>시상식 연습</a></div>
  </section>`;
}
