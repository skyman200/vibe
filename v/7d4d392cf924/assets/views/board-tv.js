// 현황판(#/board?tv=1): 행사장 TV 에 하루 종일 띄워 두는 큰 화면. 머리·꼬리 없이 시계, 결과물 제출 마감까지 남은 시간,
// 지금·다음 일정(finals-plan.js), 본선 팀의 제출 단계(저장소 등록 전 · 등록함 · 최종 제출)만 보인다 — 팀원·멘토링 정보는 없다.
// 공개 참가현황(board)을 20초마다 읽고, 읽지 못하면 마지막 화면을 두고 '다시 연결 중'을 띄운다. 화면이 꺼지지 않게(Wake Lock)
// 요청하고, [전체 화면]을 누를 수 있다(새로 고치면 전체 화면이 풀리므로 TV 는 브라우저 키오스크·F11 을 권한다).
import { html, useState, useEffect, useRef, api, useInterval, toMs, fmtWhen } from '../lib.js';
import { nowNext } from './finals-plan.js';

const STAGE = {
  building: ['저장소 등록 전', 'idle'],
  registered: ['저장소 등록함', 'reg'],
  submitted: ['최종 제출', 'done'],
};
const STAGE_CLOSED = { building: ['미제출', 'idle'], submitted: ['제출 완료', 'done'] };

const two = (n) => String(n).padStart(2, '0');

/** 남은 시간 'HH:MM:SS'(시는 24를 넘을 수 있다) */
export function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** 한국 시각 'HH:MM:SS' */
function kstClock(ms) {
  const d = new Date(ms + 9 * 3600e3);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
}

/**
 * 기기 시계 보정: 참가현황 답의 시각(phase.now)은 캐시 때문에 수십 초 늦을 수 있어 그대로 믿지 않는다. 기기 시계가 그보다도
 * 늦을 때만(서버가 본 시각이 기기보다 앞섬) 그만큼 앞당긴다. 기기 시계가 빠른 경우는 고치지 못한다.
 */
export function useSkew(now) {
  const ref = useRef(0);
  const seen = toMs(now) - Date.now();
  if (Number.isFinite(seen) && seen > ref.current) ref.current = seen;
  return ref.current;
}

function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const ask = async () => {
      try {
        if (navigator.wakeLock && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch (e) { /* 지원하지 않거나 거절 — 화면 꺼짐은 TV 설정에서 끈다 */ }
    };
    ask();
    const onVisible = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) lock.release().catch(() => {});
    };
  }, []);
}

function useFullscreen() {
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  };
  return [full, toggle];
}

/** 지금·다음 일정. 다음 칸이 다음 날이면 '내일'. 일정이 모두 끝나면 없다. */
export function NowNext({ ms, cls = 'tv-plan' }) {
  const { now, next } = nowNext(ms);
  if (!now && !next) return null;
  const day = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const when = (b) => {
    if (b.date === day(ms)) return '';
    if (b.date === day(ms + 86400e3)) return '내일 ';
    return `${Number(b.date.slice(5, 7))}. ${Number(b.date.slice(8, 10))}. `;
  };
  return html`<div class=${cls}>
    ${now ? html`<div><span class="tv-tag now">지금</span><b class="num">${now.start}–${now.end}</b> ${now.what}${now.note ? html` <span class="tv-note">· ${now.note}</span>` : ''}</div>` : ''}
    ${next ? html`<div><span class="tv-tag">다음</span><b class="num">${when(next)}${next.start}</b> ${next.what}</div>` : ''}
  </div>`;
}

export function TvBoard() {
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
  useInterval(load, 20000);
  useInterval(() => setTick((n) => n + 1), 1000);

  const skew = useSkew(data ? data.phase.now : '');
  const ms = Date.now() + skew;
  const contest = data && data.mode === 'contest' && data.contest;
  const deadline = contest ? toMs(data.contest.deadline) + 59999 : NaN;
  const left = deadline - ms;
  const closed = contest && left <= 0;
  // 칸 이름·수는 받은 답의 단계를 따른다(캐시 때문에 마감 직후에도 잠깐 마감 전 칸으로 올 수 있다 — 남은 시간만 시계로 정한다)
  const shut = contest && data.phase.submit === 'closed';
  const teams = contest ? data.teams.slice().sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999)) : [];
  const count = (k) => teams.filter((t) => t.column === k).length;
  const stage = (t) => (shut ? STAGE_CLOSED[t.column] || STAGE_CLOSED.building : STAGE[t.column] || STAGE.building);
  // 브라우저 전체 화면(F11·키오스크)은 fullscreenElement 가 없으므로 창 크기로 본다(1초마다 다시 그릴 때)
  const kiosk = Math.abs(window.innerHeight - screen.height) <= 2 && Math.abs(window.innerWidth - screen.width) <= 2;

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
        ${teams.map((t) => html`<div class=${`tv-tile ${stage(t)[1]}`} key=${t.key}>
          <div class="tv-order num">${t.order || '-'}</div>
          <div class="tv-name">${t.name}</div>
          <div class="tv-proj">${t.projectName}</div>
          <div class="tv-stage">${stage(t)[0]}</div>
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
