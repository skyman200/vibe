// 관리자 [심사] → 최종 결과: 점수표와 수상 팀 고르기(팀마다 금·은·동). 처음에는 점수 순서대로 골라 두고, [수상 팀 저장]한 것이 공식 결과다
// (공개 참가현황·엑셀·시상식이 모두 따른다 — gas/Admin.js apiAdminAwards_). [점수대로]는 고른 것을 지워 점수 순서로 되돌린다.
// [시상식 화면 열기]는 이 탭을 전체 화면 시상식(ceremony.js)으로, [연습으로 열기]는 새 탭에 가짜 팀 연습.
// [설정]의 「대형 화면 모션그래픽」 미리 보기 링크(StagePreviewLinks)도 여기 둔다.
import { html, useState, useApp, api, session } from '../lib.js';
import { useBusy } from '../ui.js';
import { PREVIEW_SCENES } from './stage-logic.js';

const TIERS = [['gold', '금상', '금'], ['silver', '은상', '은'], ['bronze', '동상', '동']];
const KEY_OF = { 금상: 'gold', 은상: 'silver', 동상: 'bronze' };

/** 지금 공식 결과의 수상 팀 { teamId: gold|silver|bronze } */
function officialPicks(r) {
  const out = {};
  r.rows.forEach((x) => { if (!x.dq && KEY_OF[x.award]) out[x.teamId] = KEY_OF[x.award]; });
  return out;
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
  const openCeremony = () => {
    if (dirty && !confirm('저장하지 않은 수상 선택이 있습니다. 저장한 공식 결과로 시상식 화면을 열까요?')) return;
    // 버튼을 누른 이 순간에만 전체 화면을 켤 수 있다(브라우저 규칙) — 주소만 바꾸므로 시상식 화면에서도 그대로
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    location.hash = '#/ceremony';
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
        <button type="button" class="btn btn-sm" disabled=${busy} onClick=${openCeremony}>시상식 화면 열기</button>
        <a class="btn btn-sm btn-ghost" href="#/ceremony?practice=1" target="_blank" rel="noopener">연습으로 열기</a>
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

/** [설정] 「대형 화면 모션그래픽」 아래: 장면마다 미리 보기(새 탭 — 행사장 화면·설정과 상관없다) */
export function StagePreviewLinks() {
  return html`<div class="stage-links small">미리 보기(새 탭 · 행사장 화면에는 영향 없음):
    ${PREVIEW_SCENES.map(([k, label]) => html` <a href=${`#/board?tv=1&preview=${k}`} target="_blank" rel="noopener">${label}</a>`)}
    ${' · '}<a href="#/ceremony?practice=1" target="_blank" rel="noopener">시상식 연습</a></div>`;
}
