// 대형 화면(행사장 100인치) 모션그래픽의 계산만 모은 곳 — 현황판 모션그래픽(stage.js)·시상식(ceremony.js)·시험(test/stage-logic.test.mjs)이
// 함께 쓴다. 순수 계산(브라우저 전용 코드 없음). 시각은 모두 ms(epoch)이고, 마감 end 는 마감 시각의 그 분이 끝난 다음 ms 다
// (서버가 13:30 분까지 받는다 — lib.js endMs + 1).

const two = (n) => String(n).padStart(2, '0');

/** 마감 뒤 '제출 마감!'을 보여 주는 시간 */
export const BURST_MS = 60e3;

/**
 * 남은 시간(ms) → 큰 숫자 모양. 초는 올림이라 마지막 순간은 1 → 0(마감)이다.
 * - hm: 1시간 이상 — 시:분 크게, 초는 옆에 작게(시는 24를 넘을 수 있다: 26:59)
 * - ms: 1시간 안 — 분:초 크게. tone warn(노랑), 10분 안은 alert(배경이 빨갛게 뛴다 — 숫자는 가만히)
 * - sec: 마지막 1분 — 초만 화면 가득
 * - burst: 마감(0 이하) · none: 마감 시각을 모름
 */
export function countdownView(left) {
  if (!Number.isFinite(left)) return { mode: 'none', big: '', small: '', tone: 'calm' };
  const sec = Math.ceil(left / 1000);
  if (sec <= 0) return { mode: 'burst', big: '', small: '', tone: 'alert' };
  if (sec < 60) return { mode: 'sec', big: String(sec), small: '', tone: 'alert' };
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (sec < 3600) return { mode: 'ms', big: `${two(m)}:${two(s)}`, small: '', tone: sec < 600 ? 'alert' : 'warn' };
  return { mode: 'hm', big: `${two(h)}:${two(m)}`, small: two(s), tone: 'calm' };
}

/**
 * 지금 장면: before(제출 시작 전) · countdown · burst(마감 직후 1분) · judging(심사 중) · winners(시상 결과 공개 뒤 — 수상 팀이 있을 때).
 * 마감을 모르면(대회 모드가 아님) before.
 */
export function sceneAt(ms, { open, end, winners }) {
  if (winners) return 'winners';
  if (!Number.isFinite(end) || ms < open) return 'before';
  if (ms < end) return 'countdown';
  if (ms < end + BURST_MS) return 'burst';
  return 'judging';
}

/** 미리 보기 장면 [키, 단추 이름] — #/board?tv=1&preview=<키> 로 바로 열 수도 있다(preview=1 은 지금 그대로). */
export const PREVIEW_SCENES = [
  ['live', '지금 그대로'],
  ['far', '마감 3시간 전'],
  ['hour', '마감 40분 전'],
  ['ten', '마감 10분 전'],
  ['minute', '마지막 1분'],
  ['burst', '마감 순간'],
  ['judging', '심사 중'],
  ['winners', '수상 축하'],
];

/**
 * 실전 장면 [키, 단추 이름, 설명] — 관리자 화면 맨 위 「행사장 큰 화면」에서 고른다(gas/Admin.js STAGE_SCENES, 현황판은 stage 를 몇 초마다 읽음).
 * 시간표대로는 시각으로 정한 장면(남은 시간 → 제출 마감! → 심사 중 → 수상 축하)이고, 나머지는 고른 장면을 그대로 둔다.
 */
export const LIVE_SCENES = [
  ['auto', '시간표대로', '남은 시간 → 제출 마감! → 심사 중 → 수상 축하'],
  ['burst', '제출 마감!', '마감 화면을 계속'],
  ['judging', '심사 중', '심사 팀 · 심사위원 이름'],
  ['winners', '수상 축하', '시상 결과 공개 뒤'],
];

/** 실전에서 보일 장면: 고른 장면(ctl) · 시간표대로(또는 모름)면 시각으로 정한 장면(auto). 수상 축하는 공개된 수상 팀이 있을 때만(없으면 시간표대로). */
export function liveScene(ctl, auto, hasWinners) {
  if (ctl === 'burst' || ctl === 'judging') return ctl;
  if (ctl === 'winners' && hasWinners) return 'winners';
  return auto;
}

/** 발표 순서(번호 — 없으면 맨 뒤, 같으면 이름)대로. key: 번호 칸 이름(공개 참가현황 order · 관리자 presentOrder) */
export function byOrder(teams, key = 'order') {
  const n = (t) => Number(t[key]) || 9999;
  return teams.slice().sort((a, b) => n(a) - n(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * 심사 순서(관리자가 끌어서 정함 — gas/Admin.js judgingOrder_ 와 같은 규칙): order(팀 ID)에 든 팀이 먼저 그 차례로,
 * 나머지는 테이블 번호(key)·이름 순으로 뒤에. 테이블 번호는 바꾸지 않는다.
 */
export function judgingOrder(teams, order, key = 'presentOrder') {
  const at = new Map(order.map((id, i) => [id, i]));
  const pos = (t) => (at.has(t.id) ? at.get(t.id) : order.length);
  return byOrder(teams, key).map((t, i) => [t, i]).sort((a, b) => pos(a[0]) - pos(b[0]) || a[1] - b[1]).map(([t]) => t);
}

/** 이름 비교용: 소문자 · 글자(영문·숫자·한글)만 — 'Re:zone' · 'RE:ZONE' · '최강!간호' · '최강간호' 를 같게 */
const squash = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

/**
 * 붙여 넣은 심사 순서(한 줄에 한 팀 — 단톡방 글을 그대로 붙여 넣어도 된다) → 팀 ID 차례. 줄마다 팀 이름(괄호 안·밖 따로도)이
 * 들어 있으면 그 팀(여럿이면 가장 길게 맞은 팀), 없으면 팀원 이름이 들어 있는 팀. 똑같이 맞는 팀이 여럿이면 알아보지 못한 줄.
 * teams: [{ id, name, members: [이름] }] · 답: order(줄 차례) · unknown(알아보지 못한 줄) · dup(같은 팀이 또 나온 줄) · missing(줄에 없는 팀 ID, teams 차례)
 */
export function matchOrder(text, teams) {
  const keys = teams.map((t) => {
    const n = String(t.name || '');
    const names = [n, n.replace(/\(.*?\)/g, ''), ...(n.match(/\((.*?)\)/g) || []).map((x) => x.slice(1, -1))].map(squash).filter((v) => v.length >= 2);
    return { id: t.id, names: [...new Set(names)], members: (t.members || []).map(squash).filter((v) => v.length >= 2) };
  });
  const order = [];
  const unknown = [];
  const dup = [];
  String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const s = squash(line);
    const best = (pick) => {
      let top = 0;
      let hit = [];
      keys.forEach((k) => {
        const len = Math.max(0, ...pick(k).filter((v) => s.includes(v)).map((v) => v.length));
        if (len > top) { top = len; hit = [k.id]; } else if (len && len === top) hit.push(k.id);
      });
      return hit;
    };
    let hit = best((k) => k.names);
    if (!hit.length) hit = best((k) => k.members);
    if (hit.length !== 1) unknown.push(line);
    else if (order.includes(hit[0])) dup.push(line);
    else order.push(hit[0]);
  });
  return { order, unknown, dup, missing: teams.map((t) => t.id).filter((id) => !order.includes(id)) };
}

/** list 의 from 번째를 to 자리로 옮긴 새 배열 */
export function moveItem(list, from, to) {
  const out = list.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** 발표 순서로 그 팀(이름) 다음 팀 — 없거나 마지막이면 null */
export function nextTeam(teams, name) {
  const list = byOrder(teams);
  const i = list.findIndex((t) => t.name === name);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
}

/** 연습 화면의 심사위원(실제 이름은 실전 화면에만) */
export const PRACTICE_JUDGES = ['심사위원 A', '심사위원 B', '심사위원 C'];

const BEFORE_END = { far: 3 * 3600e3 + 5 * 60e3 + 7e3, hour: 40 * 60e3 + 12e3, ten: 10 * 60e3 + 4e3, minute: 64e3, burst: 4e3 };

/** 미리 보기 장면이 시작하는 가상 시각(그 뒤로는 실제 시간만큼 흐른다). live·winners 는 null(지금 시각). */
export function previewTime(scene, end) {
  if (BEFORE_END[scene]) return end - BEFORE_END[scene];
  if (scene === 'judging') return end + 40 * 60e3;   // 마감 40분 뒤(기본 일정이면 14:11 순회 시연 심사 1~7번째 팀)
  return null;
}

/** 시상식 연습·미리 보기용 가짜 팀(실제 팀과 헷갈리지 않게 화면에 늘 '연습' 표시) */
export const PRACTICE_ROWS = [
  { name: '바이브 메이커스', projectName: '강의실 빈자리 알리미', award: '금상', rank: 1 },
  { name: '코드 한 스푼', projectName: '실습 일정 도우미', award: '은상', rank: 2 },
  { name: '프롬프트 장인', projectName: '학과 공지 요약 봇', award: '은상', rank: 3 },
  { name: '새벽 세 시', projectName: '도서관 좌석 알림', award: '동상', rank: 4 },
  { name: '커밋 요정', projectName: '동아리 회계 장부', award: '동상', rank: 5 },
];

/** 상: [키, 이름] — 시상식은 동상부터 */
export const TIERS = [['bronze', '동상'], ['silver', '은상'], ['gold', '금상']];

/** 상마다 팀(같은 상 안에서는 순위가 높은 팀부터, 실격 제외): [{ key, label, teams: [{ name, projectName }] }] — 금상부터 */
export function winnersByTier(rows) {
  return TIERS.slice().reverse().map(([key, label]) => ({
    key,
    label,
    teams: rows.filter((r) => r.award === label && !r.dq)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999) || (a.name < b.name ? -1 : 1))
      .map((r) => ({ name: r.name, projectName: r.projectName })),
  })).filter((t) => t.teams.length);
}

/**
 * 시상식 순서: 시작 → 동상(상 소개 → 팀마다 하나씩) → 은상 → 금상 → 모두(시상대). 받은 팀이 없는 상은 건너뛴다.
 * 같은 상 안에서는 순위가 낮은 팀부터 부른다(마지막이 그 상에서 가장 높은 팀). rows: computeResults_ 의 행(award·name·projectName·rank·dq).
 */
export function ceremonySteps(rows) {
  const tiers = winnersByTier(rows);
  const steps = [{ kind: 'intro', counts: tiers.map((t) => [t.label, t.teams.length]) }];
  tiers.slice().reverse().forEach((t) => {
    steps.push({ kind: 'tier', key: t.key, label: t.label, count: t.teams.length });
    t.teams.slice().reverse().forEach((team, i) => steps.push({ kind: 'team', key: t.key, label: t.label, team, index: i + 1, count: t.teams.length }));
  });
  if (tiers.length) steps.push({ kind: 'finale', tiers });
  return steps;
}

/** 시상식 단추: 다음(→·스페이스·PageDown·Enter·↓, 발표용 리모컨 포함) · 이전(←·PageUp·Backspace·↑) · 처음·끝 · 전체 화면(F) · 화면 가리기(B·.) */
export function ceremonyKey(key) {
  if (['ArrowRight', ' ', 'Spacebar', 'PageDown', 'Enter', 'ArrowDown'].includes(key)) return 'next';
  if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(key)) return 'prev';
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  if (key === 'f' || key === 'F') return 'full';
  if (key === 'b' || key === 'B' || key === '.') return 'black';
  // 리모컨의 '발표 시작'(F5)이 화면을 새로 고치면 관리자 로그인이 풀린다 — 막기만 한다
  if (key === 'F5') return 'block';
  return '';
}

/** 남은 시간 LED 점 글꼴 5×7(참고 사진의 흰 네모 점 시계 그대로: 1 은 깃발 3칸, 4 는 사선). 칸 너비는 고정(쌍점만 1칸) */
export const LED_FONT = {
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '..#..'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  4: ['...##', '..#.#', '.#..#', '#...#', '#####', '....#', '....#'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#...#', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '#...#', '.###.'],
  ':': ['.', '.', '#', '.', '#', '.', '.'],
};
/** LED 판 가장자리의 꺼진 점 줄 수 */
export const LED_MARGIN = 1;

/**
 * 글자 → LED 점: { cols, rows, glyphRows, on(Uint8Array, 줄마다 cols 개, 1 = 켬) } — 가장자리 꺼진 점(LED_MARGIN) 포함.
 * 숫자·쌍점은 LED_FONT(글자 사이 한 칸), 그 밖의 글자가 섞이면 raster(text) 가 돌려주는 줄 문자열('#' 켬)을 쓴다.
 * min: 글자 칸의 최소 너비 — 더 좁은 글자는 가운데에 둔다(마지막 1분의 9 → 1 도 판 크기가 그대로).
 */
export function ledBitmap(text, { min = 0, raster = null } = {}) {
  const chars = [...text];
  const glyph = chars.every((ch) => LED_FONT[ch])
    ? Array.from({ length: 7 }, (_, y) => chars.map((ch) => LED_FONT[ch][y]).join('.'))
    : raster(text);
  const width = glyph[0].length;
  const inner = Math.max(width, min);
  const cols = inner + LED_MARGIN * 2;
  const rows = glyph.length + LED_MARGIN * 2;
  const on = new Uint8Array(cols * rows);
  const x0 = LED_MARGIN + Math.floor((inner - width) / 2);
  glyph.forEach((line, y) => {
    for (let x = 0; x < width; x++) if (line[x] === '#') on[(y + LED_MARGIN) * cols + x0 + x] = 1;
  });
  return { cols, rows, glyphRows: glyph.length, on };
}
