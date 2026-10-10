// 강사 콘솔의 작은 부품: 복사 단추, 낭독 대본, 인쇄용 마크다운 한 줄 꾸미기(**굵게**, `코드`), 시계.
import { html, useState, useEffect, useRef, copyText } from '../lib.js';
import { itemOf, copyOf } from './teach-prompts.js';
import { SCRIPTS } from './teach-script.js';

/** 글 속 **굵게** 와 `코드` 를 꾸민다(그 밖의 글은 그대로 글자로 넣는다 — innerHTML 을 쓰지 않는다). */
export function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return html`${parts.map((p) => (p.startsWith('**') ? html`<b>${p.slice(2, -2)}</b>`
    : p.startsWith('`') ? html`<code class="ic">${p.slice(1, -1)}</code>` : p))}`;
}

/** 클립보드를 못 쓸 때 글을 보여 주는 읽기 전용 칸: 나타나면 전체가 선택되어 있어 Ctrl+C(맥은 Cmd+C)만 누르면 된다. */
export function SelectBox({ text }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.focus(); ref.current.select(); } }, [text]);
  return html`<textarea ref=${ref} class="textarea con-selectbox" readonly rows="6" aria-label="복사할 글" value=${text}></textarea>`;
}

/** [복사] 단추: 누르면 그 글(copyOf)을 클립보드에 넣고 잠깐 「복사됨」으로 바뀐다. 못 넣으면 글을 선택된 칸으로 보여 준다. */
export function CopyBtn({ id, label }) {
  const [state, setState] = useState('');
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const item = itemOf(id);
  if (!item) return null;
  const click = async () => {
    const ok = await copyText(copyOf(id));
    setState(ok ? 'ok' : 'fail');
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setState(''), 2200);   // 실패하면 글이 보이는 채로 둔다
  };
  return html`<span class="con-copywrap"><button type="button" class=${`btn btn-sm${state === 'ok' ? ' btn-primary' : ''}`} data-copy=${id} onClick=${click}>
    ${state === 'ok' ? '복사됨' : label || `${item.title} 복사`}
  </button>${state === 'fail' ? html`<${SelectBox} text=${copyOf(id)} />` : ''}</span>`;
}

/** 복사할 글을 접어서 보여 준다(펼치면 글 전체, [복사]) — 강사도 학생도 무엇을 붙여 넣는지 눈으로 본다. */
export function CopyBlock({ id }) {
  const item = itemOf(id);
  if (!item) return null;
  return html`<details class="con-copyblock">
    <summary><b>${item.title}</b></summary>
    <pre class="prompt">${copyOf(id)}</pre>
  </details>
  <div class="btn-row"><${CopyBtn} id=${id} /></div>`;
}

/** 낭독 대본: 펼쳐서 글자 그대로 읽는다. 큰 글자(읽기 쉽게)로 보여 주고 [크게] 로 더 키운다. */
export function ScriptBox({ id, open, onToggle }) {
  const s = SCRIPTS[id];
  const [big, setBig] = useState(false);
  if (!s) return null;
  return html`<div class="con-scriptbox">
    <button type="button" class="btn btn-sm" aria-expanded=${open ? 'true' : 'false'} onClick=${onToggle}>${open ? '대본 접기' : `${s.title} 대본 펼치기`}</button>
    ${open ? html`<div class=${`con-script${big ? ' big' : ''}`}>
      <div class="con-script-h"><span class="small muted">${s.note} 글자 그대로 읽습니다.</span>
        <button type="button" class="link-btn" onClick=${() => setBig(!big)}>${big ? '작게' : '크게'}</button></div>
      ${s.paras.map((p) => html`<p>${p}</p>`)}
    </div>` : ''}
  </div>`;
}

/** 지금 시각과 교육 시작부터 지난 분. 15초마다 갱신. */
export function useClock(startedAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 60000)) : 0;
  return { now, elapsed };
}
