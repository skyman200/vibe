// 강사 콘솔의 「도움말」 창: 질문을 받았을 때 바로 찾아 읽는 세 가지 — 도움 범위(공정성), 질문 답(자주 묻는 질문), 문제 해결.
// 글은 teach-plan.js(HELP_OK/NO)·teach-faq.js·teach-trouble.js 의 데이터이고, 지침서 2장·부록 E·17장이 같은 글이다.
import { html, useState } from '../lib.js';
import { Rich } from './teach-bits.js';
import { HELP_OK, HELP_NO } from './teach-plan.js';
import { FAQ } from './teach-faq.js';
import { TROUBLE } from './teach-trouble.js';

const TABS = [['help', '도움 범위'], ['faq', '질문 답'], ['trouble', '문제 해결']];

function HelpScope() {
  return html`<div class="con-help-scope">
    <h3>도와도 되는 것 <span class="small muted">(환경 문제와 연습)</span></h3>
    <ul>${HELP_OK.map((x) => html`<li><${Rich} text=${x} /></li>`)}</ul>
    <h3>도우면 안 되는 것 <span class="small muted">(예선 과제 내용)</span></h3>
    <ul>${HELP_NO.map((x) => html`<li><${Rich} text=${x} /></li>`)}</ul>
    <p class="small muted">애매하면 돕지 않는다. 범위 밖 질문은 「운영 담당에게 확인해 단톡방으로 모든 팀에 알리겠다」고 답하고 「받은 질문·특이사항」 칸에 적는다.</p>
  </div>`;
}

const has = (text, key) => text.toLowerCase().includes(key);   // 영문은 대소문자를 가리지 않고 찾는다

function Faq({ q }) {
  const key = q.trim().toLowerCase();
  const groups = FAQ.map((g) => ({ ...g, items: g.items.filter(([a, b]) => !key || has(a, key) || has(b, key)) })).filter((g) => g.items.length);
  if (!groups.length) return html`<p class="small muted">맞는 질문이 없습니다. 「운영 담당에게 확인해 단톡방으로 모든 팀에 알리겠다」고 답하세요.</p>`;
  return html`<div class="con-faq">${groups.map((g) => html`<div>
    <h3>${g.title}</h3>
    <dl>${g.items.map(([a, b]) => html`<div><dt>${a}</dt><dd><${Rich} text=${b} /></dd></div>`)}</dl>
  </div>`)}</div>`;
}

function Trouble({ q }) {
  const key = q.trim().toLowerCase();
  const rows = TROUBLE.filter(([a, b]) => !key || has(a, key) || has(b, key));
  if (!rows.length) return html`<p class="small muted">맞는 증상이 없습니다. 해결되지 않으면 그 자리에서 규칙을 새로 만들지 말고 운영 담당(주가은 051-860-3116)에게 전화하세요.</p>`;
  return html`<div class="table-box"><table class="dtable">
    <thead><tr><th>증상</th><th>확인·조치</th></tr></thead>
    <tbody>${rows.map(([a, b]) => html`<tr><td class="wrap-cell b">${a}</td><td class="wrap-cell"><${Rich} text=${b} /></td></tr>`)}</tbody>
  </table></div>`;
}

/** 칸 아래에 접어 둔 도움말: 탭 세 개와 검색 칸. 펼치면 질문 답·문제 해결을 글자로 찾을 수 있다. */
export function HelpPanel() {
  const [tab, setTab] = useState('help');
  const [q, setQ] = useState('');
  return html`<details class="con-helppanel" data-help>
    <summary><b>도움말</b> <span class="small muted">— 도움 범위 · 질문 답 · 문제 해결</span></summary>
    <div class="con-help-b">
      <div class="con-help-tabs" role="tablist">${TABS.map(([k, label]) => html`<button type="button" role="tab" class=${`link-btn${tab === k ? ' on' : ''}`} aria-selected=${tab === k ? 'true' : 'false'}
        data-help-tab=${k} onClick=${() => setTab(k)}>${label}</button>`)}
        ${tab !== 'help' ? html`<input class="input" type="search" aria-label="도움말 검색" placeholder="찾을 말(예: 캔버스, 공유 링크)" value=${q} onInput=${(e) => setQ(e.target.value)} />` : ''}
      </div>
      ${tab === 'help' ? html`<${HelpScope} />` : tab === 'faq' ? html`<${Faq} q=${q} />` : html`<${Trouble} q=${q} />`}
    </div>
  </details>`;
}
