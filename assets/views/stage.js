// 현황판 모션그래픽(#/board?tv=1 — 관리자 설정 「대형 화면 모션그래픽」, 대회 모드일 때만): 행사장 100인치 화면용.
// 장면은 시각으로 정한다(stage-logic.js sceneAt): 결과물 제출 마감 카운트다운 → '제출 마감!'(1분) → 심사 중 → 수상 축하(시상 결과 공개 뒤).
// 관리자가 「행사장 큰 화면」에서 장면(제출 마감! · 심사 중 · 수상 축하)을 고르면 그 장면을 그대로 두고(liveScene), 심사 중에는 고른 팀
// (번호·팀·프로젝트 · 다음 팀)과 심사위원 이름이 함께 나온다(board-tv.js 가 몇 초마다 읽는 stage).
// 남은 시간은 LED 점 글자판(stage-led.js — 흰 네모 점 5×7, 자리 고정)으로, 배경은 3D 장면(stage-fx.js·stage-scene.js — 약한 패럴랙스)이다.
// 1시간 안은 노란 점, 10분 안은 판의 꺼진 점과 배경이 빨갛게 뛰고(숫자는 흰색 그대로), 마지막 1분은 초만 화면 가득. 점수는 어디에도 없다.
// 아래 띠와 편집기 장식은 공개 참가현황의 본선 팀(번호·팀 이름·프로젝트)으로 — 실전 화면에 가짜 팀은 나오지 않는다(수상 축하도 공개된 진짜 팀).
// ?preview=<장면>(stage-logic.js PREVIEW_SCENES)은 연습: 관리자가 로그인한 탭에서(board-tv.js AdminGate) 그 장면이 시작하는 가상 시각부터
// 실제 시간만큼 흐른다 — 행사장 화면과 서버에는 아무 영향이 없다. 숫자 1~8 키로 장면을 바꾼다. 수상 축하 연습은 공개 전이면 가짜 팀(연습 표시).
import { html, useState, useEffect, useApp, useInterval, toMs, fmtWhen } from '../lib.js';
import { countdownView, sceneAt, previewTime, winnersByTier, liveScene, byOrder, nextTeam, PREVIEW_SCENES, PRACTICE_ROWS, PRACTICE_JUDGES } from './stage-logic.js';
import { useFx, SPARKS, TOSS_MS, papersOf } from './stage-fx.js';
import { NowNext, kstClock, useFullscreen, useIdle } from './tv-bits.js';
import { finalsBlocks } from './finals-plan.js';
import { Trophy, preloadTrophies } from './stage-trophy.js';
import { Led } from './stage-led.js';

const KEYWORDS = ['바이브코딩', '프롬프트 → 코드', 'AI와 함께', '커밋', '푸시', '배포', 'main 브랜치', '로그인', 'README', '휴대폰에서도',
  '버그 잡기', '4인 1조', '27시간', 'DIT 2026'];
const SLOGANS = {
  calm: ['아이디어를 코드로', '한 줄의 프롬프트가 서비스가 된다', '커밋은 자주, 푸시는 바로', 'AI와 함께 끝까지'],
  warn: ['마지막 커밋은 main 브랜치에', '팀원 모두 만족도 조사 → [최종 제출]', '서비스 주소가 휴대폰에서 열리나요?', 'README 필수 항목을 채웠나요?'],
  alert: ['지금 커밋·푸시!', '[최종 제출]을 눌렀나요?', '마감 뒤 커밋은 반영되지 않습니다'],
};
/** 편집기 장식: [프롬프트, 생기는 코드 줄] — 어느 팀의 것도 아닌 흔한 일(제목 줄에 진짜 팀 이름이 돈다) */
const PROMPTS = [
  ['첫 화면에 오늘 할 일을 보여 줘', ['export default function Today() {', '  const items = useToday();', '  return <List items={items} />;', '}']],
  ['로그인하면 내 것만 보이게 해 줘', ['const { user } = await auth();', 'const rows = await db.item.findMany({', '  where: { userId: user.id },', '});']],
  ['휴대폰에서도 깨지지 않게 다듬어 줘', ['@media (max-width: 390px) {', '  .card { width: 100%; }', '  .menu { display: grid; }', '}']],
  ['배포하고 주소 알려 줘', ['$ git push origin main', '$ vercel --prod', '✓ Production: 배포 완료']],
];
/** 본선 팀 한 줄: '3번 팀 이름 · 프로젝트' */
const teamLine = (t) => `${t.order ? `${t.order}번 ` : ''}${t.name}${t.projectName ? ` · ${t.projectName}` : ''}`;
/** 일정표의 시상식 칸(심사 중 화면에 시각을 보인다) */
const AWARD_BLOCK = finalsBlocks().find((b) => b.what.includes('시상식'));

const pickBy = (list, every) => list[Math.floor(Date.now() / every) % list.length];

/** 프롬프트를 치면 코드가 생기는 편집기(배경 장식, 9초마다 다음 프롬프트 · 제목 줄은 본선 팀을 차례로) */
function TypingPanel({ slow, teams }) {
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), slow ? 400 : 90);
  const t = now % 9000;
  const k = Math.floor(now / 9000);
  const [prompt, code] = PROMPTS[k % PROMPTS.length];
  const team = teams.length ? teams[k % teams.length] : null;
  const lines = t < 3600 ? 0 : Math.min(code.length, Math.floor((t - 3600) / 500) + 1);
  return html`<div class="stage-editor" aria-hidden="true">
    <div class="ed-bar"><i></i><i></i><i></i><span>${team ? teamLine(team) : 'prompt → app.tsx'}</span></div>
    <div class="ed-prompt"><b>›</b> ${prompt.slice(0, Math.floor(t / 65))}<span class="ed-caret"></span></div>
    <pre class="ed-code">${code.slice(0, lines).map((l) => html`<div>${l}</div>`)}</pre>
  </div>`;
}

function Countdown({ view, deadline, level }) {
  return html`<div class="stage-count" role="timer" aria-label="결과물 제출 마감까지 남은 시간">
    <div class="stage-label">결과물 제출 마감 <span class="num">${fmtWhen(deadline)}</span>까지</div>
    <div class="led-box">
      <${Led} text=${view.big} tone=${view.tone} min=${view.mode === 'sec' ? 11 : 0} cls="led-main" level=${level} />
      ${view.small ? html`<${Led} text=${view.small} tone=${view.tone} cls="led-sub" level=${level} />` : ''}
    </div>
    <div class="sr"><span class="stage-big">${view.big}</span>${view.small ? html`<span class="stage-small">:${view.small}</span>` : ''}</div>
    <div class="stage-slogan">${pickBy(SLOGANS[view.tone], 6000)}</div>
  </div>`;
}

/**
 * 심사 중: 지금 심사 팀(관리자가 고름 — 번호·팀·프로젝트, 바뀌면 새로 떠오른다)·심사위원 이름·다음 팀과 시상식 시각.
 * 코드 심사 항목 이름만(점수 없음) 훑는 모양은 팀을 고르지 않았으면 크게, 골랐으면 한 줄로 작게.
 */
function Judging({ rubric, team, next, judges }) {
  return html`<div class=${`stage-judge${team ? ' has-team' : ''}`}>
    <div class="stage-label">순회 시연 심사 · AI 코드 심사</div>
    <div class="judge-h">심사 중</div>
    ${team ? html`<div class="judge-now" key=${team.name}>
      <div class="jn-tag">지금 심사</div>
      <div class="jn-name">${team.order ? html`<b class="num">${team.order}</b>` : ''}<span>${team.name}</span></div>
      ${team.projectName ? html`<div class="jn-proj">${team.projectName}</div>` : ''}
    </div>` : ''}
    ${judges.length ? html`<div class="judge-panel"><span class="jp-h">심사위원</span>${judges.map((n) => html`<span class="jp-name">${n}</span>`)}</div>` : ''}
    <div class="scan" aria-hidden="true">
      ${rubric.map((c, i) => html`<div class="scan-row" style=${`--d:${(i * 0.45).toFixed(2)}s`}>
        <span class="scan-k">${c.label}</span><i class="scan-bar"><b></b></i>
      </div>`)}
    </div>
    <div class="judge-next">${next ? html`다음 <b>${next.order ? `${next.order}번 ` : ''}${next.name}</b>${AWARD_BLOCK ? ' · ' : ''}` : ''}${AWARD_BLOCK ? html`시상식 <b class="num">${AWARD_BLOCK.start}</b>` : ''}</div>
  </div>`;
}

function Winners({ tiers, practice }) {
  // 트로피는 글자 옆에 크게(칸 높이는 그대로) — 금상은 양옆에
  const tier = (t) => html`<div class=${`win-tier ${t.key}`} key=${t.key}>
    <${Trophy} tier=${t.key} />
    <div class="win-body">
      <div class="win-h">${t.label}</div>
      <div class="win-teams">${t.teams.map((x) => html`<div class="win-team"><b>${x.name}</b><span>${x.projectName}</span></div>`)}</div>
    </div>
    ${t.key === 'gold' ? html`<${Trophy} tier="gold" />` : ''}
  </div>`;
  return html`<div class="stage-win">
    <div class="stage-label">${practice ? '연습 화면 — 실제 수상 팀이 아닙니다' : '수상을 축하합니다'}</div>
    <div class="win-grid">
      ${tiers.filter((t) => t.key === 'gold').map(tier)}
      <div class="win-rest">${tiers.filter((t) => t.key !== 'gold').map(tier)}</div>
    </div>
  </div>`;
}

function Picker({ scene, choose, hide }) {
  return html`<nav class=${`stage-picker${hide ? ' hide' : ''}`} aria-label="연습할 장면">
    <span>연습 — 행사장 화면에는 영향이 없습니다</span>
    ${PREVIEW_SCENES.map(([k, label], i) => html`<button type="button" aria-pressed=${scene === k ? 'true' : 'false'} onClick=${() => choose(k)}><b class="num">${i + 1}</b> ${label}</button>`)}
  </nav>`;
}

/**
 * data: 공개 참가현황 답(없으면 아직 못 읽음) · skew: 기기 시계 보정 · preview: ?preview= 값(없으면 null)
 * · ctl: 행사장 큰 화면(gas/Api.js apiStage_ — { scene, team, judges }, 연습·아직 못 읽음은 null)
 */
export function StageShow({ data, skew, error, preview, ctl }) {
  const { config } = useApp();
  const [, setTick] = useState(0);
  useInterval(() => setTick((n) => n + 1), 250);
  const idle = useIdle(3000);
  const [full, toggleFull] = useFullscreen();
  useEffect(preloadTrophies, []);
  const asked = preview === null ? null : PREVIEW_SCENES.some(([k]) => k === preview) ? preview : 'live';
  const [pv, setPv] = useState(asked && { scene: asked, at: Date.now() });
  useEffect(() => { if (asked) setPv({ scene: asked, at: Date.now() }); }, [asked]);
  const choose = (k) => {
    setPv({ scene: k, at: Date.now() });
    history.replaceState(null, '', `${location.pathname}${location.search}#/board?tv=1&preview=${k}`);
  };
  useEffect(() => {
    if (!pv) return undefined;
    const onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= PREVIEW_SCENES.length) choose(PREVIEW_SCENES[n - 1][0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!pv]);

  // 대회 모드가 아니면(미리 보기) 설정의 제출 기간으로 그린다
  const c = (data && data.contest) || { open: config.event.submitOpen, deadline: config.event.submitDeadline };
  const open = toMs(c.open);
  const end = toMs(c.deadline) + 60e3;
  const start = pv ? previewTime(pv.scene, end) : null;
  const ms = start === null || !Number.isFinite(start) ? Date.now() + skew : start + (Date.now() - pv.at);
  const live = !pv || pv.scene === 'live';
  const teams = data && data.mode === 'contest' ? data.teams.filter((t) => t.name) : [];
  // 아래 띠: 본선 팀(없으면 대회 낱말) — 길이에 맞춰 같은 빠르기로 흐른다
  const words = teams.length ? teams.map(teamLine) : KEYWORDS;
  const flow = Math.max(30, Math.round(words.reduce((n, w) => n + w.length + 4, 0) * 0.47));
  const published = data ? winnersByTier(data.teams) : [];
  const practice = !!pv && pv.scene === 'winners' && !published.length;
  const tiers = practice ? winnersByTier(PRACTICE_ROWS) : published;
  const auto = sceneAt(ms, { open, end, winners: live && published.length > 0 });
  // 실전은 관리자가 고른 장면(시간표대로면 시각으로) · 연습은 고른 연습 장면의 시각으로
  const scene = pv ? (pv.scene === 'winners' ? 'winners' : auto) : liveScene(ctl && ctl.scene, auto, published.length > 0);
  // 심사 중: 실전은 고른 팀·심사위원 이름, 연습은 발표 순서 첫 팀과 '심사위원 A·B·C'
  const judgeTeam = pv ? byOrder(teams)[0] || null : (ctl && ctl.team) || null;
  const judges = pv ? PRACTICE_JUDGES : (ctl && ctl.judges) || [];
  const view = countdownView(end - ms);
  const tone = scene === 'winners' ? 'gold' : scene === 'burst' ? 'alert' : scene === 'countdown' && view.tone !== 'calm' ? view.tone : 'neon';
  const [canvas, fx, level] = useFx({
    tone,
    dim: 1,
    speed: tone === 'alert' ? 2.2 : 1,
    layers: { city: true, shapes: scene !== 'winners', dust: scene === 'winners', fireworks: scene === 'winners' },
  });
  useEffect(() => {
    const f = fx.current;
    if (!f) return undefined;
    const later = [];
    // 수상 축하: 화면이 나오고 2초 뒤 양쪽 아래에서 색종이(시상식과 같은 때)
    if (scene === 'winners') later.push(setTimeout(() => f.toss(papersOf('gold'), 300), TOSS_MS));
    if (scene === 'burst') {
      f.confetti(SPARKS.party, 240);
      [[0.5, 0.4], [0.25, 0.3], [0.75, 0.3], [0.35, 0.5], [0.65, 0.5], [0.5, 0.25]].forEach(([x, y], i) => later.push(setTimeout(() => f.burst(x, y, SPARKS.party, 120), i * 450)));
    }
    return () => later.forEach(clearTimeout);
  }, [scene]);

  let body;
  if (scene === 'countdown') body = html`<${Countdown} view=${view} deadline=${c.deadline} level=${level} />`;
  else if (scene === 'burst') {
    body = html`<div class="stage-burst">
      <div class="burst-h sr">제출 마감!</div>
      <div class="led-box burst-box"><${Led} text="제출 마감!" tone="alert" rows=${20} cls="led-burst" level=${level} wipe /></div>
      <div class="stage-sub">수고하셨습니다 · 마감 시각의 main 브랜치 커밋으로 심사합니다</div>
    </div>`;
  }
  else if (scene === 'judging') body = html`<${Judging} rubric=${config.rubric.code} team=${judgeTeam} next=${judgeTeam && nextTeam(teams, judgeTeam.name)} judges=${judges} />`;
  else if (scene === 'winners') body = html`<${Winners} tiers=${tiers} practice=${practice} />`;
  else body = html`<div class="stage-before"><div class="stage-label">결과물 제출 시작</div><div class="before-h num">${fmtWhen(c.open)}</div></div>`;
  const mode = scene === 'countdown' ? ` t-${view.tone} m-${view.mode}` : '';

  return html`<div class=${`stage s-${scene}${mode}${idle ? ' idle' : ''}`} data-fx=${level}>
    <canvas class="stage-fx" ref=${canvas} aria-hidden="true"></canvas>
    ${scene === 'countdown' && view.tone === 'alert' ? html`<div class="stage-pulse" aria-hidden="true"></div>` : ''}
    <header class="stage-top">
      <div class="stage-brand">${config.event.name}</div>
      <div class="stage-clock num" aria-label="지금 시각">${kstClock(ms)}</div>
    </header>
    <section class="stage-main">${body}</section>
    <footer class="stage-bottom">
      <${NowNext} ms=${ms} cls="stage-plan" />
      ${scene === 'countdown' && view.tone !== 'alert' && level > 0 ? html`<${TypingPanel} slow=${level < 2} teams=${teams} />` : ''}
    </footer>
    <div class="marquee" aria-hidden="true"><div class="marquee-in" style=${`--flow:${flow}s`}>${words.concat(words).map((w) => html`<span>${w}</span>`)}</div></div>
    <div class="stage-flags">
      ${pv ? html`<div class="stage-badge">연습 · ${PREVIEW_SCENES.find(([k]) => k === pv.scene)[1]}${practice ? ' · 가짜 팀' : ''}</div>` : ''}
      ${error ? html`<div class="stage-err" role="status">다시 연결하는 중</div>` : ''}
    </div>
    ${pv ? html`<${Picker} scene=${pv.scene} choose=${choose} hide=${idle} />` : ''}
    <div class=${`stage-ctl${idle ? ' hide' : ''}`}>
      <button class="btn btn-sm" type="button" onClick=${toggleFull}>${full ? '전체 화면 끝내기' : '전체 화면'}</button>
      <a class="btn btn-sm btn-ghost" href=${pv ? '#/admin' : '#/board'}>나가기</a>
    </div>
  </div>`;
}
