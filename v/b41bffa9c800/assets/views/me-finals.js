// 「내 신청」의 본선(대회 이틀) 칸: 남은 시간, 심사용 계정, 만족도 조사, 최종 제출, 멘토링 요청(gas/FinalsJudge.js · gas/Survey.js · gas/Finals.js).
// 결과물 제출 순서: ① 저장소 등록(me.js RepoPanel) → ② 마감 당일 팀원 각자 만족도 조사 → ③ 팀원 모두 응답하면 [최종 제출].
// 설문 문항은 응답할 차례인 팀원의 「내 신청」 답(view.survey.form)으로 온다 — 전달망에 오래 남을 수 있는 공개 설정에 두지 않는다.
import {
  html, useState, useApp, useInterval, api, session, fmtWhen, useServerOffset, endMs, remainText,
} from '../lib.js';
import { Field, useBusy, serverErrors, focusFirstError } from '../ui.js';

const token = () => session.get('member');

/** 결과물 제출 마감까지 남은 시간(제출 기간에만 1초마다). 마감 뒤에는 '마감되었습니다'. */
export function DeadlineClock({ view, deadline }) {
  const offset = useServerOffset(view.phase.now);
  const [, setTick] = useState(0);
  const left = endMs(deadline) - (Date.now() + offset);
  const open = view.phase.submit === 'open' && left > 0;
  useInterval(() => setTick((n) => n + 1), open ? 1000 : 0);
  if (view.phase.submit === 'before') return null;
  return html`<div class=${`countdown${open ? (left < 3600e3 ? ' soon' : '') : ' over'}`} role="timer">
    <span class="small">${open ? '결과물 제출 마감까지' : '결과물 제출'}</span>
    <b class="num">${open ? remainText(left) : '마감되었습니다'}</b>
    <span class="small num">마감 ${fmtWhen(deadline)}</span>
  </div>`;
}

/**
 * 기다리는 동안 「내 신청」을 다시 읽는다: 멘토링 요청이 대기·가는 중이면 30초, 내 응답을 마치고 팀원 응답을 기다리면 1분.
 * 화면이 보이지 않을 때는 읽지 않는다(돌아오면 MeView 가 바로 다시 읽는다). view 가 없어도 부를 수 있다(훅 순서).
 * refresh: MeView 의 다시 읽기(읽는 사이 쓰기 답이 화면을 바꿨으면 버리고, 로그인이 끊겼으면 로그인 화면으로).
 */
export function useFinalsPoll(view, refresh) {
  const h = view && view.help;
  const sv = view && view.survey;
  const waitingHelp = !!h && (h.state === 'open' || h.state === 'taken');
  const waitingTeam = !!sv && sv.phase === 'open' && !!sv.done && sv.count < sv.total && !view.team.final;
  useInterval(() => {
    if (document.hidden || !token()) return;
    refresh();
  }, waitingHelp ? 30000 : waitingTeam ? 60000 : 0);
}

function Likert({ item, scale, value, onChange, error }) {
  const name = `sv-${item.key}`;
  return html`<fieldset class=${`field likert${error ? ' bad' : ''}`}>
    <legend>${item.q}</legend>
    <div class="likert-opts">
      ${scale.map((label, i) => html`<label>
        <input type="radio" name=${name} value=${i + 1} checked=${value === i + 1} onChange=${() => onChange(i + 1)} />
        <span><b class="num">${i + 1}</b><small>${label}</small></span>
      </label>`)}
    </div>
    ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
  </fieldset>`;
}

function SurveyForm({ form, onView }) {
  const { notify } = useApp();
  const [ans, setAns] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  const set = (k, v) => setAns((a) => ({ ...a, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    form.items.forEach((it) => { if (!ans[it.key]) errs[`survey.${it.key}`] = '하나를 골라 주세요.'; });
    form.texts.forEach((t) => { if ((ans[t.key] || '').length > t.max) errs[`survey.${t.key}`] = `${t.max}자까지 쓸 수 있습니다.`; });
    setErrors(errs);
    if (Object.keys(errs).length) { focusFirstError(); return; }
    run(async () => {
      try {
        const res = await api('surveySubmit', { token: token(), answers: ans });
        onView(res.view);
        notify('만족도 조사에 응답했습니다. 고맙습니다.');
      } catch (err) {
        if (err.ambiguous) {
          try {
            const now = await api('me', { token: token() });
            if (now.view.survey && now.view.survey.done) { onView(now.view); notify('만족도 조사에 응답했습니다. 고맙습니다.'); return; }
          } catch (e2) { /* 아래에서 원래 오류를 보여 준다 */ }
        }
        setErrors(serverErrors(err));
        if (err.field) focusFirstError();
      }
    });
  };
  const answered = form.items.filter((it) => ans[it.key]).length;
  const groups = form.groups && form.groups.length ? form.groups : [{ key: '', label: '' }];
  const inGroup = (g) => form.items.filter((it) => !g.key || it.group === g.key);
  return html`<form class="survey" onSubmit=${submit} novalidate>
    ${form.program ? html`<p style="margin:0"><b>${form.program}</b>${form.detail ? html` <span class="muted">(${form.detail})</span>` : ''}과 본선 해커톤을 함께 돌아보는 조사입니다.</p>` : ''}
    <p class="small muted" style="margin:0">문항마다 1(전혀 그렇지 않다)~5(매우 그렇다) 중 하나를 고릅니다. 응답은 이름·학번 없이 운영 계정 구글 드라이브의 시트에 저장되어 교육·행사 개선 통계로만 씁니다.</p>
    ${groups.map((g) => html`<div class="survey-group" key=${g.key}>
      ${g.label ? html`<h3 class="survey-gh">${g.label}</h3>` : ''}
      ${inGroup(g).map((it) => html`<${Likert} key=${it.key} item=${it} scale=${form.scale} value=${ans[it.key]} onChange=${(v) => set(it.key, v)} error=${errors[`survey.${it.key}`]} />`)}
    </div>`)}
    ${form.texts.map((t) => html`<div class=${`field${errors[`survey.${t.key}`] ? ' bad' : ''}`} key=${t.key}>
      <label for=${`sv-${t.key}`}>${t.label}<span class="opt">선택</span></label>
      <textarea id=${`sv-${t.key}`} class="textarea" maxlength=${t.max} value=${ans[t.key] || ''} onInput=${(e) => set(t.key, e.target.value)}></textarea>
      <span class="counter">${(ans[t.key] || '').length}/${t.max}</span>
      ${errors[`survey.${t.key}`] ? html`<div class="err" role="alert">${errors[`survey.${t.key}`]}</div>` : ''}
    </div>`)}
    ${errors._form ? html`<div class="err" role="alert">${errors._form}</div>` : ''}
    <div class="btn-row">
      <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '저장하는 중…' : '응답 제출'}</button>
      <span class="small muted num">${answered}/${form.items.length}문항</span>
    </div>
  </form>`;
}

/** ② 만족도 조사: 본선 팀 · 대회가 시작된 뒤에 보인다. 마감 당일 0시부터 팀원 각자 한 번. */
export function SurveyPanel({ view, onView }) {
  const sv = view.survey;
  const reload = () => api('me', { token: token() }).then((res) => onView(res.view)).catch(() => {});
  if (!sv || view.team.status !== 'selected' || view.phase.submit === 'before') return null;
  let body;
  if (sv.done) {
    body = html`<div class="notice ok"><b>응답했습니다.</b> 고맙습니다.${sv.count < sv.total ? ' 팀원 모두 응답하면 [최종 제출]을 누를 수 있습니다.' : ''}</div>`;
  } else if (sv.phase === 'before') {
    body = html`<div class="notice">만족도 조사는 마감 당일 <b class="num">${fmtWhen(sv.opensAt)}</b>부터 할 수 있습니다. 팀원 모두(각자 로그인) 응답해야 최종 제출이 됩니다. <button class="link-btn" onClick=${reload}>새로 고침</button></div>`;
  } else if (sv.phase === 'closed') {
    body = html`<div class="notice">결과물 제출이 마감되어 만족도 조사도 끝났습니다.</div>`;
  } else if (sv.form) {
    body = html`<${SurveyForm} form=${sv.form} onView=${onView} />`;
  } else {
    body = html`<div class="notice warn">설문을 불러오지 못했습니다. <button class="link-btn" onClick=${reload}>다시 불러오기</button></div>`;
  }
  return html`<section class="panel" id="survey">
    <div class="panel-h"><h2>${sv.form && sv.form.title ? sv.form.title : '만족도 조사'}</h2><span class="small muted num">팀 ${sv.count}/${sv.total}명 응답</span></div>
    ${body}
  </section>`;
}

/** ③ 최종 제출: 저장소 등록 + 팀원 모두 만족도 조사. 팀에서 한 사람만 누르면 된다. */
export function FinalPanel({ view, onView, deadline }) {
  const { notify } = useApp();
  const [busy, run] = useBusy();
  const [error, setError] = useState('');
  const t = view.team;
  const sv = view.survey;
  if (t.status !== 'selected' || !sv || (view.phase.submit === 'before' && !t.final)) return null;
  const pending = t.members.filter((m) => !m.surveyed);
  const submit = () => run(async () => {
    try {
      const res = await api('finalSubmit', { token: token() });
      onView(res.view);
      setError('');
      notify('최종 제출했습니다.');
    } catch (err) {
      try {
        const now = await api('me', { token: token() });
        onView(now.view);
        if (now.view.team.final) { setError(''); notify('최종 제출했습니다.'); return; }
      } catch (e2) { /* 아래에서 원래 오류를 보여 준다 */ }
      setError(err.message);
    }
  });
  let body;
  if (t.final) {
    body = html`<div class="notice ok"><b>최종 제출했습니다.</b> <span class="num">${fmtWhen(t.final.at)}</span>${t.final.by ? ` · ${t.final.by}` : ''}.
      마감(<span class="num">${fmtWhen(deadline)}</span>) 전까지 main(기본) 브랜치에 올린 커밋은 계속 심사에 반영됩니다. 저장소 주소를 바꾸면 다시 최종 제출해야 합니다.</div>`;
  } else {
    body = html`<ul class="checklist">
        <li><span class=${t.repo ? 'y' : 'n'}>${t.repo ? '✓' : '✕'}</span><span>GitHub 저장소 등록${t.repo ? '' : ' — 위 결과물 제출 칸에서'}</span></li>
        <li><span class=${pending.length ? 'n' : 'y'}>${pending.length ? '✕' : '✓'}</span><span>팀원 만족도 조사 <span class="num">${sv.count}/${sv.total}</span>명${pending.length ? ` — 아직: ${pending.map((m) => (m.self ? '나' : m.name)).join(', ')}` : ''}</span></li>
      </ul>
      ${view.phase.submit === 'closed'
        ? html`<div class="notice bad"><b>마감되어 최종 제출할 수 없습니다.</b> 최종 제출하지 않은 팀은 미제출로 처리됩니다. 사정이 있으면 바로 운영진에게 알려 주세요.</div>`
        : html`<p class="small muted" style="margin:0">팀에서 한 사람만 누르면 됩니다. 최종 제출하지 않은 팀은 미제출로 처리됩니다.</p>
          ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
          <div><button class="btn btn-accent btn-lg" disabled=${!view.can.final || busy} onClick=${submit}>${busy ? '제출하는 중…' : '최종 제출'}</button></div>`}`;
  }
  return html`<section class="panel" id="final">
    <div class="panel-h"><h2>최종 제출</h2><span class="small muted">팀원 모두 만족도 조사를 마친 뒤</span></div>
    ${body}
  </section>`;
}

/** 멘토링 요청: 본선 팀 · 대회 중. 한 줄 요청 → 대기 순서 → '○○ 님이 가는 중'. 요청 글은 멘토·운영진만 본다. */
export function HelpPanel({ view, onView }) {
  const { notify } = useApp();
  const h = view.help;
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  if (!h || view.phase.submit === 'before') return null;
  const send = (e) => {
    e.preventDefault();
    const v = note.trim();
    if (!v) { setError('무엇이 막혔는지 한 줄로 적어 주세요.'); return; }
    run(async () => {
      try {
        const res = await api('helpRequest', { token: token(), note: v });
        onView(res.view);
        setEditing(false);
        setError('');
        notify(h.state ? '요청 내용을 고쳤습니다.' : '멘토링을 요청했습니다. 멘토가 요청 순서대로 자리로 갑니다.');
      } catch (err) {
        setError(err.message);
      }
    });
  };
  const cancel = () => run(async () => {
    try {
      const res = await api('helpCancel', { token: token() });
      onView(res.view);
      setEditing(false);
      setNote('');
      notify('멘토링 요청을 취소했습니다.');
    } catch (err) {
      notify(err.message, 'err');
    }
  });
  const showForm = h.can && (!h.state || editing);
  return html`<section class="panel" id="help">
    <div class="panel-h"><h2>멘토링 요청</h2>${h.done ? html`<span class="small muted num">지금까지 ${h.done}번 받음</span>` : ''}</div>
    ${h.state === 'taken' ? html`<div class="notice ok"><b>${h.taker} 님이 자리로 가는 중입니다.</b> 요청: ${h.note}</div>` : ''}
    ${h.state === 'open' ? html`<div class="notice warn"><b class="num">대기 ${h.place}번째</b> (기다리는 팀 ${h.waiting}) · <span class="num">${fmtWhen(h.at)}</span> 요청 — ${h.note}</div>` : ''}
    ${showForm ? html`<form class="help-form" onSubmit=${send} novalidate>
      <div class=${`field${error ? ' bad' : ''}`}>
        <label for="help-note">${h.state ? '요청 내용 고치기' : '무엇이 막혔나요?'}</label>
        <input id="help-note" class="input" maxlength=${h.max} placeholder="예: 배포한 주소가 하얀 화면으로 나와요" value=${note} onInput=${(e) => setNote(e.target.value)} />
        <span class="counter">${note.length}/${h.max}</span>
        ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '보내는 중…' : h.state ? '고치기' : '멘토링 요청'}</button>
        ${editing ? html`<button class="btn btn-ghost" type="button" onClick=${() => { setEditing(false); setError(''); }}>그만두기</button>` : ''}
      </div>
    </form>` : ''}
    ${h.state && !editing ? html`<div class="btn-row">
      ${h.can && h.state === 'open' ? html`<button class="btn btn-sm" disabled=${busy} onClick=${() => { setNote(h.note); setEditing(true); }}>내용 고치기</button>` : ''}
      <button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${cancel}>요청 취소</button>
    </div>` : ''}
    ${!h.can && !h.state ? html`<p class="small muted" style="margin:0">멘토링 요청은 대회 중(결과물 제출 마감 전)에만 받습니다.</p>` : ''}
    ${h.can ? html`<p class="small muted" style="margin:0">요청 내용은 멘토와 운영진만 봅니다. 해결되면 멘토가 [완료]로 닫습니다.</p>` : ''}
  </section>`;
}

const ACCESS_FIELDS = { login: 'access-login', screen1: 'access-screen1', screen2: 'access-screen2', screen3: 'access-screen3',
  account1Id: 'access-a1-id', account1Pw: 'access-a1-pw', account2Id: 'access-a2-id', account2Pw: 'access-a2-pw' };

/**
 * 심사용 계정(AI 코드 심사 — gas/FinalsJudge.js apiRepoAccess_): 로그인 화면 주소, 로그인한 뒤의 주요 화면 주소 3개, 계정 2개.
 * 서버는 비밀번호를 돌려주지 않는다 — 비워 두면 저장한 비밀번호를 그대로 쓴다(아이디를 바꾸면 다시 넣는다).
 * 서비스 주소를 바꾸면(sameSite 가 거짓) 이 주소들도 새 사이트로 고쳐야 심사에 쓴다.
 */
export function AccessPanel({ view, onView }) {
  const { notify } = useApp();
  const t = view.team;
  const repo = t.repo;
  const a = repo && repo.access;
  const [login, setLogin] = useState(a ? a.login : '');
  const [screens, setScreens] = useState(a ? a.screens : ['', '', '']);
  const [ids, setIds] = useState(a ? a.accounts.map((x) => x.id) : ['', '']);
  const [pws, setPws] = useState(['', '']);
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  if (t.status !== 'selected' || !repo) return null;
  const setAt = (list, set, i, v) => set(list.map((x, k) => (k === i ? v : x)));
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('repoAccess', {
          token: token(), login: login.trim(), screens: screens.map((s) => s.trim()),
          accounts: ids.map((id, i) => ({ id: id.trim(), pw: pws[i] })),
        });
        onView(res.view);
        setPws(['', '']);
        setErrors({});
        notify('심사용 계정을 저장했습니다. 두 계정으로 로그인되는지, 주요 화면 주소가 열리는지 직접 한 번 확인해 주세요.');
      } catch (err) {
        setErrors(serverErrors(err));
        if (ACCESS_FIELDS[err.field]) focusFirstError();
      }
    });
  };
  const url = (u) => html`<a class="mono" href=${u} target="_blank" rel="noopener">${u}</a>`;
  const host = (() => { try { return new URL(repo.serviceUrl).host; } catch (e) { return ''; } })();
  let state;
  if (!repo.serviceUrl) {
    state = html`<div class="notice warn">먼저 위 결과물 제출 칸에 <b>서비스 주소</b>(배포한 앱 주소)를 넣고 [다시 등록]을 눌러 주세요. 심사용 계정은 그 사이트의 주소로 넣습니다.</div>`;
  } else if (!a) {
    state = html`<div class="notice warn"><b>아직 넣지 않았습니다.</b> 넣지 않으면 AI 가 로그인한 화면을 써 보지 못해 구동·로그인·보안 점수를 받기 어렵습니다.</div>`;
  } else if (!a.sameSite) {
    state = html`<div class="notice bad"><b>서비스 주소가 바뀌어 아래 주소가 다른 사이트입니다.</b> 새 서비스 주소(${host})에 맞게 고쳐 다시 저장해 주세요 — 고치기 전에는 심사에 쓰지 않습니다.</div>`;
  } else {
    state = html`<div class="notice ok"><b>저장했습니다</b> <span class="num">${fmtWhen(a.at)}</span>. 마감 전까지 고칠 수 있습니다.</div>`;
  }
  return html`<section class="panel" id="access">
    <div class="panel-h"><h2>심사용 계정</h2><span class="small muted">AI 코드 심사 · 2일차 11:00 제출 사전 점검 전까지</span></div>
    <p class="small" style="margin:0">AI 심사가 이 계정으로 로그인해 서비스를 직접 써 봅니다(자료 넣기·고치기·지우기, 계정 2로 계정 1의 자료가 보이지 않는지).
      로그인(이메일 또는 아이디와 비밀번호)은 필수입니다. 심사용 계정 2개를 새로 만들고 화면에는 가짜 자료만 두세요 — 실제 개인정보나 다른 곳에 쓰는 비밀번호를 넣지 않습니다.
      비밀번호는 심사에만 쓰고 이 화면·운영진 화면에 보이지 않으며, 심사가 끝나면 지웁니다.</p>
    ${state}
    ${a ? html`<dl class="kv">
      <dt>로그인 화면</dt><dd>${url(a.login)}</dd>
      ${a.screens.map((u, i) => html`<dt>주요 화면 ${i + 1}</dt><dd>${url(u)}</dd>`)}
      <dt>계정</dt><dd class="mono">${a.accounts.map((x) => x.id).join(' · ')}</dd>
    </dl>` : ''}
    ${view.can.repo && repo.serviceUrl ? html`<form class="panel" onSubmit=${save} novalidate autocomplete="off">
      <${Field} label="로그인 화면 주소" id=${ACCESS_FIELDS.login} required error=${errors.login} hint=${`${host} 의 로그인 화면(https://…)`}>
        <input id=${ACCESS_FIELDS.login} class="input mono" inputmode="url" placeholder=${`https://${host}/login`} value=${login} onInput=${(e) => setLogin(e.target.value)} />
      <//>
      <div class="access-group" id="access-screens">${screens.map((v, i) => html`<${Field} label=${`주요 화면 ${i + 1}`} id=${ACCESS_FIELDS[`screen${i + 1}`]} required error=${errors[`screen${i + 1}`]}
          hint=${i === 0 ? '로그인한 뒤에 보이는 핵심 화면 3개의 주소 — 첫째 화면으로 속도(Lighthouse)를 잽니다' : ''}>
        <input id=${ACCESS_FIELDS[`screen${i + 1}`]} class="input mono" inputmode="url" placeholder=${`https://${host}/…`} value=${v} onInput=${(e) => setAt(screens, setScreens, i, e.target.value)} />
      <//>`)}</div>
      <div class="access-group" id="access-accounts">${[0, 1].map((i) => html`<div class="grid-2">
        <${Field} label=${`계정 ${i + 1} 아이디`} id=${ACCESS_FIELDS[`account${i + 1}Id`]} required error=${errors[`account${i + 1}Id`]}
            hint=${i ? '다른 사람 — 계정 1의 자료가 보이지 않아야 합니다' : '가짜 자료를 넣어 둔 계정(이메일 또는 아이디)'}>
          <input id=${ACCESS_FIELDS[`account${i + 1}Id`]} name=${`judge-account-${i + 1}`} class="input mono" autocomplete="off" autocapitalize="off" spellcheck="false" value=${ids[i]} onInput=${(e) => setAt(ids, setIds, i, e.target.value)} />
        <//>
        <${Field} label=${`계정 ${i + 1} 비밀번호`} id=${ACCESS_FIELDS[`account${i + 1}Pw`]} required=${!a} error=${errors[`account${i + 1}Pw`]}>
          <input id=${ACCESS_FIELDS[`account${i + 1}Pw`]} name=${`judge-password-${i + 1}`} type="password" class="input mono" autocomplete="new-password" placeholder=${a ? '저장됨 — 바꿀 때만 넣기' : ''} value=${pws[i]} onInput=${(e) => setAt(pws, setPws, i, e.target.value)} />
        <//>
      </div>`)}</div>
      ${errors._form ? html`<div class="err" role="alert">${errors._form}</div>` : ''}
      <div><button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '저장하는 중…' : a ? '다시 저장' : '심사용 계정 저장'}</button></div>
      <p class="small muted" style="margin:0">저장한 비밀번호는 다시 보이지 않습니다. 비워 두면 저장한 비밀번호를 그대로 씁니다(아이디를 바꾸면 다시 넣습니다).</p>
    </form>` : ''}
  </section>`;
}
