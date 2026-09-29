// 안내: 공지(notice.hwpx) 내용을 한 장짜리 행사 안내문처럼.
import {
  html, useApp, useState, useEffect, useRef, fmtWhen, untilText,
} from '../lib.js';

const SCHEDULE = [
  ['1일차 · 10. 29.(목) 교육과 개발', [
    ['09:30 – 10:00', '등록 및 팀별 자리 배치', ''],
    ['10:00 – 10:30', '개회식 및 해커톤 안내', '규정 · 심사 기준 · 일정'],
    ['10:30 – 12:00', '바이브코딩 개발자 교육', ''],
    ['12:00 – 13:00', '점심', ''],
    ['13:00 – 18:00', '팀별 기획 및 개발', '멘토링 병행'],
    ['18:00 – 19:00', '저녁', ''],
    ['19:00 – 20:00', '팀별 개발(자율)', '20시 종료'],
  ]],
  ['2일차 · 10. 30.(금) 마무리와 심사', [
    ['09:00 – 12:00', '팀별 개발 및 결과물 완성', '멘토링 병행'],
    ['12:00 – 13:00', '점심', ''],
    ['13:00 – 13:30', '결과물 제출(GitHub·서비스 주소) 및 발표 준비', ''],
    ['13:30 – 16:00', '팀별 발표 및 시연(대면 심사)', '팀당 5분'],
    ['16:00 – 16:30', '심사 결과 집계', '코드 50% + 대면 50%'],
    ['16:30 – 17:00', '시상식 및 폐회', ''],
  ]],
];

/** 팀당 상금(공지 기준). 시상 팀 수는 관리자 설정(config.event.awards)을 따른다. */
const PRIZES = [
  ['gold', '금상', 2000000],
  ['silver', '은상', 1400000],
  ['bronze', '동상', 1000000],
];
const won = (n) => `${n.toLocaleString('ko-KR')}원`;
const manWon = (n) => `${(n / 10000).toLocaleString('ko-KR')}만 원`;

/** 첫 화면에서 차례로 타이핑되는 프롬프트 예시: 전공과 상관없이 말로 설명하면 AI 와 함께 만든다는 것을 보여 준다. */
const PROMPTS = [
  ['간호학과', '실습 일정과 준비물을 한눈에 보는 앱 만들어 줘'],
  ['물리치료과', '환자별 운동 처방을 영상과 함께 보여 주는 웹'],
  ['외식조리산업과', '식재료 재고와 유통기한을 알려 주는 주방 관리 앱'],
  ['소방안전관리과', '건물 소방 점검 결과를 사진으로 남기는 체크리스트'],
  ['반도체전자산업과', '측정값을 올리면 불량을 표시해 주는 대시보드'],
];

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 프롬프트 한 줄을 타이핑 → 잠시 멈춤 → 지우기 → 다음 학과. 탭이 가려져 있으면 쉬고, 동작 줄이기 설정이면 멈춘 글로 보인다. */
function PromptLine() {
  const [shown, setShown] = useState(() => (reducedMotion() ? { i: 0, n: PROMPTS[0][1].length } : { i: 0, n: 0 }));
  useEffect(() => {
    if (reducedMotion()) return undefined;
    let i = 0;
    let n = 0;
    let dir = 1;
    let timer = 0;
    const tick = () => {
      if (document.hidden) { timer = setTimeout(tick, 500); return; }
      const len = Array.from(PROMPTS[i][1]).length;
      let wait = 55 + Math.random() * 45;
      if (dir === 1 && n >= len) { dir = -1; wait = 2200; } else if (dir === -1 && n <= 0) {
        dir = 1;
        i = (i + 1) % PROMPTS.length;
        wait = 380;
      } else {
        n += dir;
        if (dir === -1) wait = 22;
      }
      setShown({ i, n });
      timer = setTimeout(tick, wait);
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, []);
  const [dept, text] = PROMPTS[shown.i];
  return html`<div class="prompt" aria-hidden="true">
    <span class="prompt-dept">${dept}</span>
    <span class="prompt-text"><span class="prompt-mark">›</span> ${Array.from(text).slice(0, shown.n).join('')}<span class="caret"></span></span>
  </div>`;
}

/** 숫자가 0 에서 목표 값까지 올라간다(처음 한 번). 동작 줄이기 설정이면 바로 목표 값. */
function CountUp({ to }) {
  const [v, setV] = useState(() => (reducedMotion() ? to : 0));
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion() || to === from.current) { setV(to); from.current = to; return undefined; }
    const start = performance.now();
    const base = from.current;
    let raf = 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      setV(Math.round(base + (to - base) * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return v;
}

/** 빨간 띠: 행사 핵심을 흘려 보낸다(같은 내용을 두 번 이어 붙여 끊김 없이 돈다). 정보는 옆 표에도 있으므로 화면 읽기에서는 뺀다. */
function Marquee({ items }) {
  const row = html`<span class="marquee-row">${items.map((t) => html`<span>${t}</span><i></i>`)}</span>`;
  return html`<div class="marquee" aria-hidden="true"><div class="marquee-track">${row}${row}</div></div>`;
}

function applyStateText(ph, e) {
  if (ph.apply === 'before') return { big: untilText(e.applyStart), small: `${fmtWhen(e.applyStart)} 접수 시작` };
  if (ph.apply === 'closed') return { big: '마감', small: `${fmtWhen(e.applyEnd)} 접수 마감` };
  if (ph.apply === 'full') return { big: '정원 마감', small: `신청 ${ph.applicantCap}명이 모두 찼습니다` };
  return { big: untilText(e.applyEnd), small: `${fmtWhen(e.applyEnd)} 마감` };
}

function Sec({ n, title, children, id }) {
  return html`<section class="sec" id=${id}>
    <div class="sec-h"><span class="sec-n">${n}</span><h2>${title}</h2></div>
    <div>${children}</div>
  </section>`;
}

function RubricTable({ title, rows, note }) {
  const total = rows.reduce((a, r) => a + r.max, 0);
  return html`<div>
    <h3><span>${title}</span><span class="num">${total}점</span></h3>
    <table class="table">
      <tbody>
        ${rows.map((r) => html`<tr><td><b>${r.label}</b><div class="small muted">${r.desc}</div></td><td class="pts">${r.max}</td></tr>`)}
      </tbody>
    </table>
    <p class="small muted" style="margin-top:10px">${note}</p>
  </div>`;
}

/** 빈칸 자리(설정을 받기 전): 글자 높이만큼의 흐린 막대 — 받은 뒤 같은 자리에 값이 들어가 화면이 흔들리지 않는다. */
const Skel = ({ w = '9em' }) => html`<span class="skel" style=${`width:${w}`}></span>`;

/**
 * 첫 화면 윗부분. 설정(config)을 받기 전에도 바로 그린다 — 제목·소개·버튼은 고정 문구이고, 행사 정보 칸만 빈칸 자리로
 * 두었다가 설정이 오면 같은 자리에 채운다(같은 요소라 제목 움직임이 다시 시작되지 않는다).
 */
function Hero({ config }) {
  const e = config && config.event;
  const ph = config && config.phase;
  const apply = ph ? ph.apply : 'open';
  return html`<section class="poster">
      <div>
        <p class="overline">2026학년도 DIT AID전환중점전문대학지원사업</p>
        <h1 aria-label="DIT 바이브코딩 해커톤">
          <span class="line" aria-hidden="true"><span>DIT <span class="red">바이브코딩</span></span></span>
          <span class="line" aria-hidden="true"><span>해커톤</span></span>
        </h1>
        <${PromptLine} />
        <p class="lede">말로 설명하면 AI가 코드를 씁니다. 이틀 동안 웹·앱 서비스를 기획하고 만드는 팀 대항전입니다. 전공은 묻지 않습니다.</p>
        <div class="btn-row">
          ${apply === 'open'
            ? html`<a class="btn btn-accent btn-lg" href="#/apply">팀 만들기</a>`
            : html`<span class="btn btn-lg" aria-disabled="true">${apply === 'before' ? '접수 전' : '접수 마감'}</span>`}
          <a class="btn btn-lg" href="#/board">참가현황 보기</a>
        </div>
        <p class="small muted" style="margin-top:14px">팀원은 팀장이 보낸 초대 링크로 합류합니다. 이미 신청했다면 <a href="#/me">내 신청</a>에서 확인하세요.</p>
      </div>
      <dl class="facts" aria-busy=${config ? 'false' : 'true'}>
        <dt>일시</dt><dd>${e ? e.period : html`<${Skel} w="14em" />`}</dd>
        <dt>장소</dt><dd>${e ? e.venue : html`<${Skel} w="12em" />`}</dd>
        <dt>대상</dt><dd>본교 재학생<small>팀 단위 참가(학과 추천) · 4인 1조</small></dd>
        <dt>선발</dt><dd>${ph ? `최종 ${ph.selectTarget}팀` : html`<${Skel} w="5em" />`}<small>${ph ? `신청은 ${ph.applicantCap}명(${ph.teamCap}팀)까지 받아 심사 후 선발합니다` : html`<${Skel} w="16em" />`}</small></dd>
        <dt>접수</dt><dd class="num">${e ? `${fmtWhen(e.applyStart)} ~ ${fmtWhen(e.applyEnd)}` : html`<${Skel} w="13em" />`}</dd>
        <dt>제공</dt><dd>팀당 Claude Code 또는 Codex</dd>
      </dl>
    </section>`;
}

export function HomeView() {
  const { config } = useApp();
  if (!config) return html`<div class="wrap"><${Hero} config=${null} /></div>`;
  const e = config.event;
  const ph = config.phase;
  const state = applyStateText(ph, e);
  const awards = e.awards;
  const awardTeams = PRIZES.reduce((a, [k]) => a + awards[k], 0);
  const awardTotal = PRIZES.reduce((a, [k, , amount]) => a + awards[k] * amount, 0);

  return html`<div class="wrap"><${Hero} config=${config} /></div>

  <${Marquee} items=${[
      `총상금 ${manWon(awardTotal)}`,
      e.period,
      '진리관 컨벤션홀',
      '재학생 4인 1조',
      `최종 ${ph.selectTarget}팀 선발`,
      '팀당 Claude Code · Codex 제공',
      `신청 ${fmtWhen(e.applyEnd)} 마감`,
    ]} />

  <div class="wrap">
    <div class="ticker" aria-label="접수 현황">
      <div><b><${CountUp} to=${ph.appliedTeams} />팀</b><span>접수 완료</span></div>
      <div><b><${CountUp} to=${ph.applicants} /><span class="of"> / ${ph.applicantCap}명</span></b><span>신청 인원 / 정원</span></div>
      <div><b><${CountUp} to=${ph.formingTeams} />팀</b><span>팀 구성 중(4명 모집 중)</span></div>
      <div><b>${state.big}</b><span>${state.small}</span></div>
    </div>

    <div style="padding:28px 0 8px">
      <div class="mustread" id="training">
        <span class="label-red">필독</span>
        <div>
          <strong>${config.training.notice}</strong>
          <p>${config.training.detail} 신청할 때 팀원 모두가 각자 참석을 확인합니다.</p>
        </div>
      </div>
    </div>

    <${Sec} n="1" title="신청 방법" id="how">
      <ol class="steps">
        <li><span class="n">01</span><h3>팀장이 팀을 만듭니다</h3>
          <p>팀명과 참가 주제, 프로젝트 구상, 본인 정보를 적고 동의하면 팀 초대 링크가 만들어집니다.</p></li>
        <li><span class="n">02</span><h3>팀원 3명이 합류합니다</h3>
          <p>초대 링크를 받은 팀원이 각자 본인 정보를 입력하고 직접 동의합니다. 다른 사람의 정보를 대신 적지 않습니다.</p></li>
        <li><span class="n">03</span><h3>4명이 모이면 팀장이 제출</h3>
          <p>팀원 4명이 모두 합류해 각자 동의하면 팀장이 [신청서 제출]을 누릅니다. 참가 신청서(한글·PDF)는 입력한 내용으로 자동으로 만들어지므로 따로 쓰거나 올릴 파일이 없습니다. 4인 1조가 아니면 제출되지 않습니다. 접수 후 심사를 거쳐 ${ph.selectTarget}팀을 선발해 안내합니다.</p></li>
      </ol>
      <p class="small muted" style="margin-top:18px">신청은 이 사이트에서 온라인으로만 받습니다. 신청 뒤에도 대회가 끝날 때까지 「내 신청」에서 팀 정보를 고치고 팀원을 바꿀 수 있습니다.</p>
      <p class="small muted" style="margin-top:18px">팀을 꾸리기 어려운 개인은 AI허브센터(${e.contact.phone})로 연락하면 팀 매칭을 도와드립니다.</p>
    <//>

    <${Sec} n="2" title="일정" id="schedule">
      <table class="table">
        ${SCHEDULE.map(([day, rows]) => html`<tbody>
          <tr class="day"><th colspan="3">${day}</th></tr>
          ${rows.map(([t, what, note]) => html`<tr><td class="time">${t}</td><td>${what}</td><td class="small muted">${note}</td></tr>`)}
        </tbody>`)}
      </table>
      <p class="small muted" style="margin-top:10px">세부 일정은 사정에 따라 바뀔 수 있습니다.</p>
    <//>

    <${Sec} n="3" title="심사 기준" id="judging">
      <div class="two">
        <${RubricTable} title="코드 심사" rows=${config.rubric.code}
          note="제출 마감 시점의 GitHub 저장소와 README를 AI가 모든 팀에 같은 기준으로 분석합니다." />
        <${RubricTable} title="대면 심사" rows=${config.rubric.live}
          note="심사위원이 발표·시연을 현장에서 평가하고 평균 점수를 반영합니다." />
      </div>
      <p style="margin-top:18px">100점 만점(코드 50 + 대면 50). 총점이 같으면 대면 심사 점수가 높은 팀이 위입니다.</p>
    <//>

    <${Sec} n="4" title="시상" id="prize">
      <table class="table">
        <thead><tr><th>구분</th><th>팀 수</th><th>상금</th></tr></thead>
        <tbody>${PRIZES.filter(([k]) => awards[k] > 0).map(([k, label, amount]) => html`<tr>
          <td><b>${label}</b></td><td class="num">${awards[k]}팀</td><td class="num">${awards[k] > 1 ? '각 ' : ''}${won(amount)}</td>
        </tr>`)}</tbody>
        <tfoot><tr><td>합계</td><td class="num">${awardTeams}팀</td><td class="num">${won(awardTotal)}</td></tr></tfoot>
      </table>
      <p class="small muted" style="margin-top:10px">상금은 팀 단위로 지급합니다. 교육을 이수하고 결과물을 제출한 참가자에게 디지털 배지를 발급합니다.</p>
    <//>

    <${Sec} n="5" title="결과물 제출" id="submit">
      <ul class="bullets">
        <li><b>GitHub 저장소 주소</b>(심사 기간 동안 공개)와 서비스 주소를 이 사이트의 「내 신청」에서 제출합니다.</li>
        <li>제출 마감은 <b class="num">${fmtWhen(e.submitDeadline)}</b>입니다. 마감 이후의 커밋은 심사에 반영하지 않습니다.</li>
        <li>README에는 ${config.readmeItems.join(', ')}을 적습니다.</li>
        <li>API 키 같은 비밀정보는 저장소에 올리지 않습니다.</li>
      </ul>
    <//>

    <${Sec} n="6" title="문의" id="contact">
      <p style="margin:0">${e.contact.name} · <span class="num">${e.contact.phone}</span> · <a href=${`mailto:${e.contact.email}`}>${e.contact.email}</a></p>
    <//>
  </div>`;
}
