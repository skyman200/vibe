// 안내: 공지(notice.hwpx) 내용을 한 장짜리 행사 안내문처럼.
import { html, useApp, fmtWhen, untilText } from '../lib.js';

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

const PRIZES = [
  ['금상', '1팀', '2,000,000원'],
  ['은상', '2팀', '각 1,400,000원'],
  ['동상', '2팀', '각 1,000,000원'],
];

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

export function HomeView() {
  const { config } = useApp();
  const e = config.event;
  const ph = config.phase;
  const state = applyStateText(ph, e);
  const canCreate = ph.apply === 'open';

  return html`<div class="wrap">
    <section class="poster">
      <div>
        <p class="overline">2026학년도 DIT AID전환중점전문대학지원사업</p>
        <h1>DIT <span class="red">바이브코딩</span><br />해커톤</h1>
        <p class="lede">생성형 AI와 함께 이틀 동안 웹·앱 서비스를 기획하고 만드는 팀 대항전입니다. 전공은 묻지 않습니다.</p>
        <div class="btn-row">
          ${canCreate
            ? html`<a class="btn btn-accent btn-lg" href="#/apply">팀 만들기</a>`
            : html`<span class="btn btn-lg" aria-disabled="true">${ph.apply === 'before' ? '접수 전' : '접수 마감'}</span>`}
          <a class="btn btn-lg" href="#/board">참가현황 보기</a>
        </div>
        <p class="small muted" style="margin-top:14px">팀원은 팀장이 보낸 초대 링크로 합류합니다. 이미 신청했다면 <a href="#/me">내 신청</a>에서 확인하세요.</p>
      </div>
      <dl class="facts">
        <dt>일시</dt><dd>${e.period}</dd>
        <dt>장소</dt><dd>${e.venue}</dd>
        <dt>대상</dt><dd>본교 재학생<small>팀 단위 참가(학과 추천) · 4인 1조</small></dd>
        <dt>선발</dt><dd>최종 ${ph.selectTarget}팀<small>신청은 ${ph.applicantCap}명(${ph.teamCap}팀)까지 받아 심사 후 선발합니다</small></dd>
        <dt>접수</dt><dd class="num">${fmtWhen(e.applyStart)} ~ ${fmtWhen(e.applyEnd)}</dd>
        <dt>제공</dt><dd>팀당 Claude Code 또는 Codex</dd>
      </dl>
    </section>

    <div class="ticker" aria-label="접수 현황">
      <div><b>${ph.appliedTeams}팀</b><span>접수 완료</span></div>
      <div><b>${ph.applicants}<span class="of"> / ${ph.applicantCap}명</span></b><span>신청 인원 / 정원</span></div>
      <div><b>${ph.formingTeams}팀</b><span>팀 구성 중(4명 모집 중)</span></div>
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
        <li><span class="n">03</span><h3>4명이 되면 팀장이 제출</h3>
          <p>4인 1조가 아니면 제출되지 않습니다. 접수 후 심사를 거쳐 ${ph.selectTarget}팀을 선발해 안내합니다.</p></li>
      </ol>
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
        <tbody>${PRIZES.map(([a, b, c]) => html`<tr><td><b>${a}</b></td><td class="num">${b}</td><td class="num">${c}</td></tr>`)}</tbody>
        <tfoot><tr><td>합계</td><td class="num">5팀</td><td class="num">6,800,000원</td></tr></tfoot>
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
