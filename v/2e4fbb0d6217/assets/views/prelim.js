// 예선(팀별 48시간) — 「내 신청」의 [예선 시작]·과제·남은 시간·[예선 제출](gas/Prelim.js).
// 시작: 세션 코드 → 서버가 코드를 확인하고 지금 누르면 정해질 마감 시각을 알려 줌 → 팀원 모두 확인 → [시작].
// 남은 시간은 서버 시각 기준이다: 화면 자료(view)를 받을 때마다 서버 시각과 이 기기 시계의 차이를 재어 보정한다
// (휴대폰 시계가 틀려도 맞다). 마감은 마감 시각의 그 분이 끝날 때까지다(서버와 같은 규칙).
import {
  html, useState, useRef, useApp, useInterval, api, session, fmtWhen, toMs,
} from '../lib.js';
import { Field, Modal, useBusy, serverErrors } from '../ui.js';

/** 서버 시각 − 이 기기 시각(ms). 새 화면 자료(서버 시각 now)를 받을 때마다 다시 잰다. */
function useServerOffset(now) {
  const ref = useRef({ now: null, offset: 0 });
  if (ref.current.now !== now) ref.current = { now, offset: toMs(now) - Date.now() };
  return ref.current.offset;
}

/** 제출을 받는 마지막 순간(ms): 마감 시각의 그 분이 끝날 때까지. */
function endMs(deadline) {
  return toMs(deadline) + 59999;
}

function remainText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}시간 ${two(Math.floor((s % 3600) / 60))}분 ${two(s % 60)}초`;
}

function sizeText(n) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

export function PrelimPanel({ view, onView }) {
  const p = view.prelim;
  if (!p) return null;
  if (p.state === 'ready') return html`<${ReadyPanel} view=${view} onView=${onView} />`;
  return html`<${RunningPanel} view=${view} onView=${onView} />`;
}

function ReadyPanel({ view, onView }) {
  const [open, setOpen] = useState(false);
  const hours = view.prelim.hours;
  return html`<section class="panel">
    <div class="panel-h"><h2>예선</h2><span class="small muted">팀별 ${hours}시간</span></div>
    <p style="margin:0">의무 교육 끝 무렵, 강사가 화면에 띄우는 <b>세션 코드</b>를 넣고 [예선 시작]을 누릅니다. 팀에서 한 사람만 누르면 됩니다(팀장이 아니어도 됩니다).</p>
    <ul class="bullets">
      <li>누르는 순간 과제가 무작위로 정해지고 ${hours}시간이 흐르기 시작합니다. 시작은 팀마다 한 번뿐이고 되돌릴 수 없습니다.</li>
      <li>마감 전까지 GitHub 저장소 주소를 [예선 제출]로 제출합니다. 한 번도 제출하지 않으면 탈락입니다.</li>
    </ul>
    <div><button class="btn btn-accent btn-lg" onClick=${() => setOpen(true)}>예선 시작</button></div>
    ${open ? html`<${StartDialog} hours=${hours} onView=${onView} onClose=${() => setOpen(false)} />` : ''}
  </section>`;
}

function StartDialog({ hours, onView, onClose }) {
  const { notify } = useApp();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const token = session.get('member');

  const started = (v) => {
    onView(v);
    onClose();
    const by = v.prelim ? v.prelim.by : '';
    notify(by === '나' ? '예선을 시작했습니다. 과제와 남은 시간을 확인하세요.'
      : `이미 ${by ? `${by} 님이` : '다른 팀원이'} 예선을 시작했습니다. 같은 과제·같은 마감입니다.`);
  };
  const next = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('prelimStart', { token, code });
        if (res.already) { started(res.view); return; }
        setError('');
        setChecked(false);
        setPreview(res.preview);
      } catch (err) {
        setError(err.message);
      }
    });
  };
  const start = () => run(async () => {
    try {
      started((await api('prelimStart', { token, code, confirm: true })).view);
    } catch (err) {
      if (err.ambiguous) {
        // 연결이 끊겨 답을 못 받았다 — 서버에서는 시작됐을 수 있으므로 지금 상태를 다시 읽는다.
        try {
          const now = (await api('me', { token })).view;
          if (now.prelim && now.prelim.state !== 'ready') { started(now); return; }
        } catch (x) { /* 아래에서 원래 오류를 보여 준다 */ }
      }
      setError(err.message);
      if (err.field === 'code') setPreview(null);
    }
  });

  return html`<${Modal} title="예선 시작" onClose=${onClose}>
    ${preview ? html`<div class="stack" style="gap:14px">
      <div class="notice warn"><b>시작은 되돌릴 수 없습니다.</b> 누르는 순간 과제가 무작위로 정해지고 ${hours}시간이 흐르기 시작합니다.</div>
      <dl class="facts">
        <dt>마감</dt><dd class="num">${fmtWhen(preview.deadline)}<small>지금 누르면 이 시각이 마감입니다(그 분이 끝날 때까지 제출). 실제 마감은 [시작]을 누른 시각으로 정해집니다.</small></dd>
        <dt>세션</dt><dd>${preview.session}</dd>
      </dl>
      <label class="check"><input type="checkbox" checked=${checked} onChange=${(e) => setChecked(e.target.checked)} /><span>팀원 모두 마감 시각을 확인했습니다.</span></label>
      ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
      <div class="btn-row">
        <button class="btn btn-accent btn-lg" disabled=${busy || !checked} onClick=${start}>${busy ? '시작하는 중…' : '시작'}</button>
        <button class="btn btn-ghost" disabled=${busy} onClick=${() => { setPreview(null); setError(''); }}>코드 다시 넣기</button>
      </div>
    </div>` : html`<form class="stack" style="gap:14px" onSubmit=${next} novalidate>
      <p style="margin:0">강사가 화면에 띄운 세션 코드 6자리를 넣으세요. 코드는 그 회차에서만, 만든 때부터 3시간 동안 쓸 수 있습니다.</p>
      <${Field} label="세션 코드" id="prelim-code" error=${error}>
        <input id="prelim-code" class="input mono code-big" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12"
          value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} />
      <//>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit" disabled=${busy || code.replace(/[^0-9A-Z]/gi, '').length !== 6}>${busy ? '확인하는 중…' : '다음'}</button>
        <button class="btn btn-ghost" type="button" onClick=${onClose}>닫기</button>
      </div>
    </form>`}
  <//>`;
}

function RunningPanel({ view, onView }) {
  const p = view.prelim;
  const offset = useServerOffset(view.phase.now);
  const [, setTick] = useState(0);
  const left = endMs(p.deadline) - (Date.now() + offset);
  const open = p.state === 'running' && left > 0;
  useInterval(() => setTick((n) => n + 1), open ? 1000 : 0);
  const t = p.task;
  return html`<section class="panel">
    <div class="panel-h"><h2>예선</h2><span class="small muted num">시작 ${fmtWhen(p.startedAt)}${p.by ? ` · ${p.by}` : ''}</span></div>
    <div class=${`countdown${open ? (left < 3600e3 ? ' soon' : '') : ' over'}`} role="timer">
      <span class="small">${open ? '남은 시간' : '예선 마감'}</span>
      <b class="num">${open ? remainText(left) : '마감되었습니다'}</b>
      <span class="small num">마감 ${fmtWhen(p.deadline)}</span>
    </div>
    ${t ? html`<div class="box task">
      <p class="overline">과제</p>
      <h3>${t.title}</h3>
      <dl class="facts">
        <dt>대상</dt><dd>${t.target}</dd>
        <dt>상황</dt><dd>${t.situation}</dd>
        <dt>꼭 있어야 하는 기능</dt><dd><ol>${t.features.map((f) => html`<li>${f}</li>`)}</ol></dd>
      </dl>
      <ul class="bullets" style="margin-top:12px">${p.rules.map((r) => html`<li>${r}</li>`)}</ul>
      <p class="small muted" style="margin:10px 0 0">받은 과제를 다른 팀에 알리거나 다른 팀의 과제를 물으면 두 팀 모두 실격입니다. 과제 문구에 관한 질문은 운영 담당에게 개인 메시지로 합니다.</p>
    </div>` : ''}
    <${SubmitBox} view=${view} onView=${onView} open=${open} />
  </section>`;
}

function CheckList({ check }) {
  if (!check) return null;
  return html`<div style="margin-top:8px">
    ${check.items && check.items.length ? html`<ul class="checklist">
      ${check.items.map((i) => html`<li><span class=${i.ok ? 'y' : 'n'}>${i.ok ? '✓' : '✕'}</span>README ${i.label}</li>`)}
    </ul>` : ''}
    <div class="small" style="margin-top:6px">${check.message}${check.files === null ? '' : ` 보관한 파일 ${check.files}개.`}</div>
  </div>`;
}

function SubmitBox({ view, onView, open }) {
  const { notify } = useApp();
  const sub = view.prelim.submission;
  const [repoUrl, setRepoUrl] = useState(sub ? sub.url : '');
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  const token = session.get('member');

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('prelimSubmit', { token, repoUrl: repoUrl.trim() });
        onView(res.view);
        setErrors({});
        const s = res.view.prelim.submission;
        if (res.same) notify(`이미 같은 커밋(${s.sha.slice(0, 7)})을 제출했습니다. 새로 푸시했다면 GitHub 에 올라갔는지 확인하세요.`);
        else if (res.stale) notify('다른 팀원이 더 나중에 한 제출이 남았습니다. 아래 제출 내용을 확인하세요.', 'err');
        else notify(`제출했습니다 · 커밋 ${s.sha.slice(0, 7)}`);
      } catch (err) {
        if (err.ambiguous) {
          // 답을 못 받았다 — 서버에는 반영됐을 수 있으므로 지금 제출 상태를 다시 읽어 보여 준다.
          try { onView((await api('me', { token })).view); } catch (x) { /* 원래 오류를 보여 준다 */ }
        }
        setErrors(serverErrors(err));
      }
    });
  };

  return html`<div class="panel">
    <div class="panel-h"><h2>예선 제출</h2><span class="small muted">마지막 제출 하나만 심사합니다</span></div>
    ${sub ? html`<div class=${`notice ${sub.check && sub.check.state === 'warn' ? 'warn' : 'ok'}`}>
      <b>제출됨 · 커밋 <span class="mono">${sub.sha.slice(0, 7)}</span> · ${fmtWhen(sub.at)}</b>${sub.by ? ` (${sub.by})` : ''}
      <div class="small" style="margin-top:4px"><a href=${sub.url} target="_blank" rel="noopener">${sub.url}</a> · 보관본 ${sizeText(sub.size)}</div>
      <${CheckList} check=${sub.check} />
    </div>` : html`<div class=${`notice ${open ? 'warn' : 'bad'}`}>${open
      ? '아직 제출하지 않았습니다. 마감 전까지 한 번 이상 제출해야 합니다. 한 번도 제출하지 않으면 탈락입니다.'
      : '마감 전까지 제출하지 않았습니다.'}</div>`}
    ${open ? html`<form class="stack" style="gap:12px" onSubmit=${submit} novalidate>
      <${Field} label="GitHub 저장소 주소" id="prelim-repo" required error=${errors.repoUrl} hint="https://github.com/계정/저장소 — 저장소 첫 화면 주소, 공개(Public)">
        <input id="prelim-repo" class="input mono" inputmode="url" autocomplete="off" placeholder="https://github.com/계정/저장소" value=${repoUrl} onInput=${(e) => setRepoUrl(e.target.value)} />
      <//>
      ${errors._form ? html`<div class="err" role="alert">${errors._form}</div>` : ''}
      <div><button class="btn btn-primary" type="submit" disabled=${busy || !repoUrl.trim()}>${busy ? '저장소를 받아 보관하는 중…' : sub ? '다시 제출' : '제출'}</button></div>
      <p class="small muted" style="margin:0">제출하는 순간의 저장소(최신 커밋)를 서버에 보관하고 그것만 심사합니다. 제출 뒤에 푸시한 내용은 다시 제출해야 심사에 들어갑니다. 마감 직전에는 GitHub 가 느릴 수 있으니 1시간 전까지 마지막 제출을 마치세요.</p>
    </form>` : ''}
  </div>`;
}
