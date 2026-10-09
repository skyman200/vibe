// 교육 따라 하기(#/lesson): 학생(팀)이 교육 중 단계마다 할 일과 AI 에게 붙여 넣을 요청을 복사해 쓰는 화면. 로그인 없이 열린다
// (강사 진행표 teach-plan.js 의 「팀이 할 일」과 복사 글이 그대로 나온다 — 강사가 말로 설명한 것을 학생이 다시 볼 수 있게).
// 예선 과제·개인정보는 여기에 없다.
import { html, useState, useEffect } from '../lib.js';
import { clock, timeline, STARTER_URL, SITE_URL } from './teach-plan.js';
import { Rich, CopyBlock } from './teach-bits.js';

const LESSON = () => timeline().filter((s) => s.kind === 'lesson' || s.kind === 'start');

/** 주소의 ?s= 단계. 없거나 모르는 값이면 첫 단계. */
function stepFromHash(steps) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '').get('s');
  return steps.some((s) => s.id === q) ? q : steps[0].id;
}

export function LessonView() {
  const steps = LESSON();
  const [cur, setCur] = useState(() => stepFromHash(steps));
  useEffect(() => {
    const base = location.hash.split('?')[0];
    history.replaceState(null, '', `${base}?s=${cur}`);   // replaceState 는 hashchange 를 부르지 않는다
  }, [cur]);
  useEffect(() => {
    const onHash = () => setCur(stepFromHash(steps));   // 주소창에서 단계를 바꾼 경우
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const step = steps.find((s) => s.id === cur);
  const at = steps.indexOf(step);
  const prev = steps[at - 1];
  const next = steps[at + 1];
  const goTo = (id) => { setCur(id); window.scrollTo(0, 0); };
  return html`<div class="wrap page lesson">
    <div class="page-h"><div><h1>교육 따라 하기</h1>
      <p>강사가 보여 주는 것을 팀이 같은 순서로 따라 합니다. 단계를 고르고, 아래 [복사]로 AI에게 붙여 넣을 글을 복사하세요. 팀원은 단계마다 키보드를 잡는 사람을 바꿉니다.</p></div></div>
    <nav class="lesson-nav" aria-label="단계">
      ${steps.map((s) => html`<a href=${`#/lesson?s=${s.id}`} data-lesson=${s.id} aria-current=${s.id === cur ? 'true' : undefined}
        onClick=${(e) => { e.preventDefault(); setCur(s.id); window.scrollTo(0, 0); }}>${s.title.replace(' · ', ' ')}</a>`)}
    </nav>
    <section class="lessonstep" data-lesson-step=${step.id}>
      <h2>${step.title}</h2>
      <p class="small muted">${clock(step.start)}~${clock(step.end)} · ${step.min}분 · ${step.goal}</p>
      <h3 style="margin:0">팀이 할 일</h3>
      <ol>${step.team.map((t) => html`<li><${Rich} text=${t} /></li>`)}</ol>
      ${(step.copy || []).map((id) => html`<${CopyBlock} id=${id} />`)}
      ${step.tips && step.tips.length ? html`<ul class="con-tips">${step.tips.map((t) => html`<li><${Rich} text=${t} /></li>`)}</ul>` : ''}
      ${step.id === 's1' ? html`<p class="small" style="margin:0">시작 저장소: <a href=${STARTER_URL} target="_blank" rel="noopener">${STARTER_URL}</a></p>` : ''}
      ${step.id === 'start' ? html`<p class="small" style="margin:0">「내 신청」: <a href=${`${SITE_URL}#/me`}>${SITE_URL}#/me</a></p>` : ''}
      <div class="btn-row lesson-pager">
        ${prev ? html`<button type="button" class="btn btn-sm" data-lesson-prev onClick=${() => goTo(prev.id)}>← ${prev.title.replace(' · ', ' ')}</button>` : ''}
        ${next ? html`<button type="button" class="btn btn-sm btn-primary" data-lesson-next onClick=${() => goTo(next.id)}>다음 단계 → ${next.title.replace(' · ', ' ')}</button>` : ''}
      </div>
    </section>
    <p class="small muted">막히면 손을 들어 강사를 부르세요. 강사는 도구 사용법과 연습을 도와줍니다. 예선 과제를 무엇으로, 어떻게 만들지는 돕지 않습니다. 오류가 나면 화면이나 터미널의 오류 글을 그대로 복사해 AI에게 붙여 넣고 「이 오류가 났어. 무엇이 문제이고 어떻게 고쳐?」라고 물어보세요.</p>
  </div>`;
}
