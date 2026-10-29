// 현황판(#/board?tv=1): 행사장 TV 에 하루 종일 띄워 두는 큰 화면. 머리·꼬리 없이 시계, 결과물 제출 마감까지 남은 시간,
// 지금·다음 일정(finals-plan.js), 본선 팀의 제출 단계(저장소 등록 전 · 등록함 · 최종 제출)만 보인다 — 팀원·멘토링 정보는 없다.
// 공개 참가현황(board)을 20초마다 읽고, 읽지 못하면 마지막 화면을 두고 '다시 연결 중'을 띄운다. 화면이 꺼지지 않게(Wake Lock)
// 요청하고, [전체 화면]을 누를 수 있다(새로 고치면 전체 화면이 풀리므로 TV 는 브라우저 키오스크·F11 을 권한다).
// 관리자 설정 「대형 화면 모션그래픽」(답의 stage — 대회 모드일 때만)을 켜면 다음 읽기(20초 안)에 모션그래픽(stage.js)으로 바뀌고,
// 끄면 이 현황판으로 돌아온다. ?preview= 를 붙이면 설정과 상관없이 모션그래픽 미리 보기(관리자가 새 탭에서 확인 — 행사장 화면은 그대로).
import { html, useState, useEffect, api, useApp, useInterval, toMs, fmtWhen } from '../lib.js';
import { hms, kstClock, useSkew, useWakeLock, useFullscreen, kioskWindow, NowNext } from './tv-bits.js';
import { StageShow } from './stage.js';

const STAGE = {
  building: ['저장소 등록 전', 'idle'],
  registered: ['저장소 등록함', 'reg'],
  submitted: ['최종 제출', 'done'],
};
const STAGE_CLOSED = { building: ['미제출', 'idle'], submitted: ['제출 완료', 'done'] };

export function TvBoard() {
  const { route } = useApp();
  const preview = route.query.get('preview');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(0);
  const [, setTick] = useState(0);
  const [full, toggleFull] = useFullscreen();
  useWakeLock();

  const load = async () => {
    try {
      const d = await api('board');
      setData(d);
      setError('');
      setLoadedAt(Date.now());
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
    document.documentElement.classList.add('tv');
    return () => document.documentElement.classList.remove('tv');
  }, []);
  const stage = preview !== null || !!(data && data.stage);
  useInterval(load, 20000);
  // 모션그래픽은 스스로 0.25초마다 다시 그린다
  useInterval(() => setTick((n) => n + 1), stage ? 0 : 1000);

  const skew = useSkew(data ? data.phase.now : '');
  if (stage) return html`<${StageShow} data=${data} skew=${skew} error=${error} preview=${preview} />`;
  const ms = Date.now() + skew;
  const contest = data && data.mode === 'contest' && data.contest;
  const deadline = contest ? toMs(data.contest.deadline) + 59999 : NaN;
  const left = deadline - ms;
  const closed = contest && left <= 0;
  // 칸 이름·수는 받은 답의 단계를 따른다(캐시 때문에 마감 직후에도 잠깐 마감 전 칸으로 올 수 있다 — 남은 시간만 시계로 정한다)
  const shut = contest && data.phase.submit === 'closed';
  const teams = contest ? data.teams.slice().sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999)) : [];
  const count = (k) => teams.filter((t) => t.column === k).length;
  const step = (t) => (shut ? STAGE_CLOSED[t.column] || STAGE_CLOSED.building : STAGE[t.column] || STAGE.building);
  const kiosk = kioskWindow();

  return html`<div class="tv-wrap">
    <header class="tv-head">
      <div class="tv-title"><span class="brand-mark">DIT</span> 바이브코딩 해커톤 경진대회 2026 <span class="tv-sub">본선 현황판</span></div>
      <div class="tv-clock num" aria-label="지금 시각">${kstClock(ms)}</div>
    </header>

    ${contest ? html`<section class=${`tv-count${closed ? ' over' : left < 3600e3 ? ' soon' : ''}`} role="timer">
      <div class="tv-count-l">${closed ? '결과물 제출 마감' : '결과물 제출 마감까지'}</div>
      <div class="tv-count-n num">${closed ? '심사 중' : hms(left)}</div>
      <div class="tv-count-r num">마감 ${fmtWhen(data.contest.deadline)}</div>
    </section>` : ''}

    <${NowNext} ms=${ms} />

    ${contest ? html`<section class="tv-teams">
      <div class="tv-sum num">
        ${shut ? html`<span>제출 완료 <b>${count('submitted')}</b>/${teams.length}</span><span>미제출 <b>${teams.length - count('submitted')}</b></span>`
          : html`<span>최종 제출 <b>${count('submitted')}</b>/${teams.length}</span><span>저장소 등록 <b>${count('registered') + count('submitted')}</b>/${teams.length}</span>`}
      </div>
      <div class="tv-grid">
        ${teams.map((t) => html`<div class=${`tv-tile ${step(t)[1]}`} key=${t.key}>
          <div class="tv-order num">${t.order || '-'}</div>
          <div class="tv-name">${t.name}</div>
          <div class="tv-proj">${t.projectName}</div>
          <div class="tv-stage">${step(t)[0]}</div>
        </div>`)}
      </div>
    </section>` : html`<section class="tv-wait">${data ? '대회 모드가 켜지면 본선 팀 현황이 여기에 나옵니다.' : '불러오는 중…'}</section>`}

    <footer class="tv-foot">
      <span>${error ? html`<b class="tv-err">다시 연결하는 중 — ${error}</b>` : loadedAt ? `마지막 업데이트 ${kstClock(loadedAt + skew)} · 20초마다 새로 고침` : ''}</span>
      <span class="tv-actions">
        ${full || kiosk ? '' : html`<span>TV 는 브라우저 전체 화면(F11)을 쓰면 새 버전으로 다시 열려도 유지됩니다</span>`}
        <button class="btn btn-sm" onClick=${toggleFull}>${full ? '전체 화면 끝내기' : '전체 화면'}</button>
        <a class="btn btn-sm btn-ghost" href="#/board">나가기</a>
      </span>
    </footer>
  </div>`;
}
