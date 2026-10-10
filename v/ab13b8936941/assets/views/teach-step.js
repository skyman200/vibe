// 강사 콘솔의 한 칸(진행표의 한 단계): 목표·강사가 할 일(할 말·복사·대본·현황)·팀이 할 일·참고·끝날 때 묻는 말·늦으면.
import { html, useState } from '../lib.js';
import { Rich, CopyBtn, ScriptBox, SelectBox } from './teach-bits.js';
import { Roster, Structure, SessionPanel } from './teach-panels.js';

function Panel({ kind, ctx }) {
  if (kind === 'roster') return html`<${Roster} roster=${ctx.roster} checked=${ctx.checked} setChecked=${ctx.setChecked} />`;
  if (kind === 'structure') return html`<${Structure} />`;
  if (kind === 'session') return html`<${SessionPanel} data=${ctx.data} busy=${ctx.busy} call=${ctx.call} />`;   // 코드 만들기(예선 시작 칸)와 지금 끝내기(마무리 칸)
  return null;
}

function actsList(step, ctx, openScript, setOpenScript) {
  return html`<ol class="con-acts">${step.acts.map((a) => html`<li>
    <div class="con-act-t">${a.min ? html`<span class="con-act-m num">${a.min}분</span>` : ''}<${Rich} text=${a.text} /></div>
    ${a.say ? html`<blockquote class="con-say">${a.say}</blockquote>` : ''}
    ${a.script ? html`<${ScriptBox} id=${a.script} open=${openScript === a.script} onToggle=${() => setOpenScript(openScript === a.script ? '' : a.script)} />` : ''}
    ${a.copy ? html`<div class="btn-row">${[].concat(a.copy).map((id) => html`<${CopyBtn} id=${id} />`)}</div>` : ''}
    ${a.panel ? html`<${Panel} kind=${a.panel} ctx=${ctx} />` : ''}
  </li>`)}</ol>`;
}

export function StepCard({ step, state, ctx }) {
  const [openScript, setOpenScript] = useState('');
  const checks = ctx.done[step.id] || {};
  const tick = (key) => ctx.setDone({ ...ctx.done, [step.id]: { ...checks, [key]: !checks[key] } });
  const label = state === 'now' ? '지금' : state === 'done' ? '끝남' : '';   // todo 칸은 목표 한 줄만 보인다(차례가 오면 펼쳐진다)
  return html`<section class=${`con-step ${state}`} id=${`step-${step.id}`} data-step=${step.id} aria-current=${state === 'now' ? 'step' : undefined}>
    <header class="con-h">
      <div><span class="con-time num">${ctx.timeText}</span><h2>${step.title}</h2></div>
      <div class="btn-row">${label ? html`<span class=${`pstate ${state === 'now' ? 'ok' : ''}`}>${label}</span>` : ''}
        ${ctx.mode === 'run' && state === 'now' && step.kind !== 'close' ? html`<button type="button" class="btn btn-sm" onClick=${() => ctx.go(step.id, 'done')}>끝남 → 다음</button>` : ''}
        ${state === 'done' && step.kind !== 'prep' ? html`<button type="button" class="link-btn" onClick=${() => ctx.go(step.id, 'open')}>다시 열기</button>` : ''}</div>
    </header>
    ${state === 'now' ? html`<div class="con-b">
      <p class="con-goal"><b>목표</b> ${step.goal}</p>
      ${step.prep ? html`<ul class="con-preplist">${step.prep.map((p, i) => html`<li><label class="check">
        <input type="checkbox" checked=${!!checks[`p${i}`]} onChange=${() => tick(`p${i}`)} /><span><${Rich} text=${p} /></span></label></li>`)}</ul>` : ''}
      ${step.prep ? html`<details class="con-more"><summary>자세한 방법 보기</summary>${actsList(step, ctx, openScript, setOpenScript)}</details>` : actsList(step, ctx, openScript, setOpenScript)}
      ${step.kind === 'lesson' || step.kind === 'start' ? html`<div class="con-teamdo">
        <h3>팀이 할 일 <span class="small muted">— 학생 화면 「교육 따라 하기」에도 같은 글이 나옵니다</span></h3>
        <ol>${step.team.map((t) => html`<li><${Rich} text=${t} /></li>`)}</ol>
        ${step.copy && step.copy.length ? html`<div class="btn-row">${step.copy.map((id) => html`<${CopyBtn} id=${id} />`)}</div>` : ''}
      </div>` : ''}
      ${step.tips && step.tips.length ? html`<ul class="con-tips">${step.tips.map((t) => html`<li><${Rich} text=${t} /></li>`)}</ul>` : ''}
      ${step.ask ? html`<p class="con-ask"><b>끝날 때 묻기</b> 「${step.ask}」</p>` : ''}
      ${step.late ? html`<p class="con-late small"><b>늦어지면</b> ${step.late}</p>` : ''}
      ${step.kind === 'start' ? html`<${StartStatus} ctx=${ctx} />` : ''}
      ${step.kind === 'rules' ? html`<${NotesBox} ctx=${ctx} />` : ''}
      ${step.kind === 'close' ? html`<${CloseBox} ctx=${ctx} />` : ''}
    </div>` : state === 'todo' ? html`<p class="con-todo small muted">${step.goal}</p>` : ''}
  </section>`;
}

/** 예선 시작 칸의 현황: 출석한 팀 가운데 시작하지 않은 팀과 첫 제출 전인 팀(30초마다 새로 읽는다). */
function StartStatus({ ctx }) {
  const s = ctx.status;
  return html`<div class="con-startstat" data-startstat>
    <div class="con-startstat-h"><b>시작 ${s.started} / ${s.total}팀</b> · 첫 제출 ${s.submitted}팀
      <button type="button" class="link-btn" onClick=${ctx.reload}>새로 고침</button></div>
    ${s.missing.length ? html`<p class="notice warn small" style="margin:8px 0 0"><b>아직 시작하지 않은 팀</b> ${s.missing.join(', ')}</p>`
      : s.total ? html`<p class="notice ok small" style="margin:8px 0 0">출석한 팀이 모두 시작했습니다.</p>` : ''}
    ${s.notSubmitted.length ? html`<p class="small muted" style="margin:6px 0 0">첫 제출 전: ${s.notSubmitted.join(', ')}</p>` : ''}
    ${s.unchecked.length ? html`<p class="notice small" style="margin:6px 0 0"><b>출석 체크 없이 시작한 팀</b> ${s.unchecked.join(', ')} — 출석 칸(입장 칸)에서 체크하면 위 숫자에 들어갑니다.</p>` : ''}
    ${!s.total ? html`<p class="notice warn small" style="margin:6px 0 0">출석 체크한 팀이 없어 시작 현황의 분모가 0입니다. 입장 칸의 출석 명단에서 온 팀을 체크하세요.</p>` : ''}
  </div>`;
}

/** 받은 질문·특이사항 메모(규칙 칸에서 질문을 받을 때 적고, 마무리 칸의 [결과 복사]에 들어간다). 이 탭에만 남는다. */
function NotesBox({ ctx, id }) {
  return html`<div class="con-notes">
    <label class="label" for=${id || 'teach-notes-rules'}>받은 질문·특이사항(운영 담당에게 넘길 것)</label>
    <textarea id=${id || 'teach-notes-rules'} class="textarea" rows="3" value=${ctx.notes} onInput=${(e) => ctx.setNotes(e.target.value)}
      placeholder="예: 규칙 질문 — 「화면 3개는 어떻게 세나요?」 → 부록 E대로 답함"></textarea>
  </div>`;
}

/** 마무리 칸: 질문 메모와 [결과 복사]. */
function CloseBox({ ctx }) {
  return html`<div class="con-closebox">
    <${NotesBox} ctx=${ctx} id="teach-notes" />
    <div class="btn-row"><button type="button" class="btn btn-primary" data-copy-result onClick=${ctx.copyResult}>결과 복사</button>
      <span class="small muted">출석·시작·첫 제출·질문을 글로 복사합니다. 운영 담당 단톡방에 붙여 넣으세요.</span></div>
    ${ctx.resultText ? html`<div><p class="small" style="margin:0 0 6px"><b>복사하지 못했습니다.</b> 아래 글이 선택되어 있으니 Ctrl+C(맥은 Cmd+C)로 복사하세요.</p><${SelectBox} text=${ctx.resultText} /></div>` : ''}
  </div>`;
}
