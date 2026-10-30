// 내 신청: 로그인(학번+비밀번호) → 팀 현황, 초대, 제출, 예선(prelim.js), 본선 결과물 제출(저장소 등록 → 만족도 조사 → 최종 제출,
// me-finals.js)·멘토링 요청, 본인 정보 정정·철회.
import {
  html, useState, useEffect, useRef, useApp, api, session, digits, fmtWhen, toMs, STATUS_LABEL,
} from '../lib.js';
import {
  Field, LoadFailed, Modal, Slots, Status, Veil, MemberFields, useBusy, checkMember, serverErrors, focusFirstError,
} from '../ui.js';
import { InviteBox, TeamFields, checkTeam } from './apply.js';
import { PrelimPanel } from './prelim.js';
import { AccessPanel, DeadlineClock, SurveyPanel, FinalPanel, HelpPanel, useFinalsPoll } from './me-finals.js';

const CHECK_LABEL = { ok: '확인 완료', warn: '확인 필요', missing: '찾을 수 없음', error: '점검 실패' };
const CHECK_TONE = { ok: 'ok', warn: 'warn', missing: 'bad', error: 'bad' };

function Login({ onDone, message }) {
  const { config, notify } = useApp();
  const [studentNo, setStudentNo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(message || '');
  const [busy, run] = useBusy();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('login', { studentNo: digits(studentNo), pin });
        session.set('member', res.token);
        notify('로그인했습니다.');
        onDone(res.view);
      } catch (err) {
        setError(err.message);
      }
    });
  };
  return html`<div class="wrap page">
    <div class="page-h"><div><h1>내 신청</h1><p>신청할 때 정한 학번과 비밀번호로 들어옵니다. 팀장과 팀원 모두 같은 방법입니다.</p></div></div>
    <div class="two-col">
      <form class="box" onSubmit=${submit} style="display:grid;gap:16px">
        <${Field} label="학번" id="login-no">
          <input id="login-no" class="input num" inputmode="numeric" autocomplete="username" maxlength="9" value=${studentNo} onInput=${(e) => setStudentNo(digits(e.target.value))} />
        <//>
        <${Field} label="비밀번호" id="login-pin">
          <input id="login-pin" class="input" type="password" autocomplete="current-password" maxlength="20" value=${pin} onInput=${(e) => setPin(e.target.value)} />
        <//>
        ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
        <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '확인 중…' : '로그인'}</button>
      </form>
      <div class="panel">
        <div class="panel-h"><h2>아직 신청하지 않았다면</h2></div>
        <p class="muted" style="margin:0">팀장은 팀을 만들고, 팀원은 팀장이 보낸 초대 링크로 합류합니다.</p>
        <div class="btn-row"><a class="btn" href="#/apply">팀 만들기</a><a class="btn" href="#/join">초대 코드로 합류</a></div>
        <p class="small muted">비밀번호를 잊었다면 문의처로 연락해 주세요. 본인 확인 후 임시 비밀번호를 알려 드립니다.</p>
        <div class="mustread"><span class="label-red">필독</span><div><strong>${config.training.notice}</strong><p>${config.training.detail}</p></div></div>
      </div>
    </div>
  </div>`;
}

function StatusNotice({ view, config }) {
  const t = view.team;
  const leader = view.me.role === 'leader';
  if (t.status === 'draft') {
    return html`<div class="notice warn">
      <b>아직 신청 전입니다.</b> ${t.count < config.teamSize ? `팀원 ${config.teamSize - t.count}명이 더 합류해야 합니다. ` : ''}
      ${leader ? '4명이 모두 모이면 아래 [신청서 제출]을 눌러 주세요.' : '4명이 모이면 팀장이 제출합니다.'}
    </div>`;
  }
  const refill = t.count < config.teamSize
    ? html` <b>팀원이 빠져 지금 ${t.count}명입니다.</b> ${leader ? '아래 초대 링크로 새 팀원을 받아 주세요. 신청서는 새 명단으로 자동으로 다시 만들어집니다.' : '팀장이 새 팀원을 받습니다.'}`
    : '';
  if (t.status === 'submitted') {
    return html`<div class=${`notice ${refill ? 'warn' : 'ok'}`}><b>접수 완료</b> (${fmtWhen(t.submittedAt)}). ${t.app ? '참가 신청서(한글·PDF)가 만들어져 운영진에게 전달되었습니다. ' : ''}${config.selection.short} 본선 진출 팀은 이 화면과 연락처로 안내합니다.${refill}</div>`;
  }
  if (t.status === 'selected') {
    return html`<div class=${`notice ${refill ? 'warn' : 'ok'}`}><b>본선 진출 팀입니다.</b> ${config.selection.finals} ${config.training.notice}${refill}</div>`;
  }
  if (t.status === 'waitlist') {
    const no = view.prelim && view.prelim.result ? view.prelim.result.waitNo : 0;
    return html`<div class="notice warn"><b>예비${no ? ` ${no}번` : ''} 팀입니다.</b> 본선 진출 팀에 결원이 생기면 ${no ? '순번대로' : '차례로'} 연락드립니다.</div>`;
  }
  return html`<div class="notice"><b>이번 본선에는 진출하지 못했습니다.</b> 관심 가져 주셔서 고맙습니다.</div>`;
}

function SubmitPanel({ view, onView }) {
  const { notify } = useApp();
  const [busy, run] = useBusy();
  const [error, setError] = useState('');
  if (view.me.role !== 'leader' || view.team.status !== 'draft') return null;
  const submit = () => run(async () => {
    try {
      const res = await api('teamSubmit', { token: session.get('member') });
      onView(res.view);
      notify('신청서를 제출했습니다.');
    } catch (err) {
      if (err.ambiguous || err.code === 'STATE') {
        try {
          const now = await api('me', { token: session.get('member') });
          onView(now.view);
          if (now.view.team.status !== 'draft') { notify('신청서를 제출했습니다.'); return; }
        } catch (e) { /* 아래에서 원래 오류를 보여 준다 */ }
      }
      setError(err.message);
    }
  });
  return html`<section class="panel">
    <div class="panel-h"><h2>신청서 제출</h2><span class="small muted">4인 1조일 때만 제출됩니다</span></div>
    ${view.submitBlockers.length ? html`<ul class="checklist">${view.submitBlockers.map((b) => html`<li><span class="n">✕</span>${b}</li>`)}</ul>`
      : html`<ul class="checklist"><li><span class="y">✓</span>팀원 4명이 모두 합류하고 각자 동의했습니다.</li></ul>`}
    <p class="small muted" style="margin:0">제출하면 입력한 내용으로 공지 양식의 참가 신청서(한글·PDF)가 자동으로 만들어져 운영진에게 전달됩니다. 따로 작성하거나 올릴 파일은 없습니다.</p>
    ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
    <div><button class="btn btn-accent btn-lg" disabled=${!view.can.submit || busy} onClick=${submit}>${busy ? '제출하는 중…' : '신청서 제출'}</button></div>
  </section>`;
}

function CheckResult({ check }) {
  if (!check) return null;
  return html`<div class=${`notice ${CHECK_TONE[check.state]}`}>
    <b>${CHECK_LABEL[check.state]}</b> ${check.message}
    ${check.items && check.items.length ? html`<ul class="checklist" style="margin-top:8px">
      ${check.items.map((i) => html`<li><span class=${i.ok ? 'y' : 'n'}>${i.ok ? '✓' : '✕'}</span>README ${i.label}</li>`)}
    </ul>` : ''}
    <div class="small" style="margin-top:6px">점검 ${fmtWhen(check.at)}</div>
  </div>`;
}

/**
 * 새 출발 규칙 안내(gas/Integrity.js startView_): 본선 시작 전 · 출발점 등록 전(마감 전·뒤) · 출발점 기록됨 · 실격.
 * start: { kickoffAt, startDeadline, deadline, open, firstAt, dq }
 */
function StartNotice({ start, phase }) {
  if (!start) return null;
  if (start.dq) {
    return html`<div class="notice bad start-notice"><b>본선 실격 처리되었습니다</b>(${fmtWhen(start.dq.at)}). 사유: ${start.dq.reason}
      <div class="small" style="margin-top:6px">순위·시상에서 빠집니다. 이의가 있으면 운영진(AI허브센터 051-860-3116)에 알려 주세요.</div></div>`;
  }
  if (phase === 'closed') return null;
  const rule = '본선 결과물은 본선 시작 뒤 새로 만든 GitHub 저장소에서 개발합니다 — 본선 전에 만든 코드(예선 결과물 포함)를 가져오면 실격입니다(공개 시작 저장소 vibe-starter 는 써도 됩니다).';
  if (!start.open) {
    return html`<div class="notice start-notice">저장소 등록은 본선 시작 <b class="num">${fmtWhen(start.kickoffAt)}</b> 뒤에 열립니다. ${rule}</div>`;
  }
  if (!start.firstAt) {
    const late = Date.now() > toMs(start.startDeadline) + 59999;
    return html`<div class=${`notice start-notice ${late ? 'bad' : 'warn'}`}>
      ${late ? html`<b>출발점 등록 마감(${fmtWhen(start.startDeadline)})이 지났습니다.</b> 지금 등록하면 늦은 출발로 기록됩니다. `
        : html`<b class="num">${fmtWhen(start.startDeadline)}</b>까지 1교시에 새로 만든 저장소를 등록하세요(출발점). `}
      첫 커밋이 있어야 출발점이 기록됩니다 — 아직 커밋이 없으면 README 하나라도 올리고 [저장소 다시 점검]을 누르세요.
      ${start.error ? html`<div class="small" style="margin-top:6px">서버가 마지막 커밋을 기록하지 못했습니다(${start.error}). 잠시 뒤 [저장소 다시 점검]을 눌러 주세요.</div>` : ''}
      <div class="small" style="margin-top:6px">${rule}</div></div>`;
  }
  return html`<div class="notice ok start-notice"><b>출발점 기록 ${fmtWhen(start.firstAt)}</b> — 서버가 이 저장소의 새 커밋을 5분마다 기록합니다.
    커밋·푸시는 자주(1시간에 한 번은) 해 주세요. 서버가 기록한 개발 과정이 우리 팀이 본선에서 직접 만들었다는 증거가 됩니다.</div>`;
}

function RepoPanel({ view, onView, config }) {
  const { notify } = useApp();
  const t = view.team;
  const repo = t.repo;
  const [repoUrl, setRepoUrl] = useState(repo ? repo.url : '');
  const [serviceUrl, setServiceUrl] = useState(repo ? repo.serviceUrl : '');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  if (t.status !== 'selected' && !repo) return null;
  const phase = view.phase.submit;

  const submit = (e) => {
    e.preventDefault();
    const moving = t.final && repo && repoUrl.trim().replace(/(\.git)?\/*$/, '') !== repo.url;
    if (moving && !window.confirm('저장소 주소를 바꾸면 최종 제출이 풀려 다시 눌러야 합니다. 바꿀까요?')) return;
    run(async () => {
      try {
        const res = await api('repoSubmit', { token: session.get('member'), repoUrl: repoUrl.trim(), serviceUrl: serviceUrl.trim(), agree });
        onView(res.view);
        setErrors({});
        if (t.final && !res.view.team.final) notify('저장소가 바뀌어 최종 제출이 풀렸습니다. 아래에서 다시 [최종 제출]을 눌러 주세요.', 'err');
        else if (res.view.start && !res.view.start.firstAt) notify('저장소를 등록했습니다. 첫 커밋을 올리고 [저장소 다시 점검]을 누르면 출발점이 기록됩니다.');
        else notify('저장소를 등록했습니다. 이제 이 저장소에 자주 커밋·푸시하면 됩니다.');
      } catch (err) {
        setErrors(serverErrors(err));
      }
    });
  };
  const recheck = () => run(async () => {
    try {
      const res = await api('repoCheck', { token: session.get('member') });
      onView(res.view);
    } catch (err) {
      notify(err.message, 'err');
    }
  });

  return html`<section class="panel" id="repo">
    <div class="panel-h"><h2>결과물 제출</h2><span class="small muted">① 저장소 등록 → ② 만족도 조사 → ③ 최종 제출</span></div>
    <${DeadlineClock} view=${view} deadline=${config.event.submitDeadline} />
    <${StartNotice} start=${view.start} phase=${phase} />
    ${repo ? html`<dl class="kv">
      <dt>GitHub</dt><dd><a href=${repo.url} target="_blank" rel="noopener">${repo.url}</a></dd>
      ${repo.serviceUrl ? html`<dt>서비스</dt><dd><a href=${repo.serviceUrl} target="_blank" rel="noopener">${repo.serviceUrl}</a></dd>` : ''}
      <dt>등록</dt><dd>${fmtWhen(repo.at)}${repo.by ? ` · ${repo.by}` : ''}</dd>
      ${repo.pinnedSha ? html`<dt>심사 기준 커밋</dt><dd class="mono">${repo.pinnedSha.slice(0, 10)}</dd>` : ''}
    </dl>
    <${CheckResult} check=${repo.check} />
    <div><button class="btn btn-sm" onClick=${recheck} disabled=${busy}>저장소 다시 점검</button></div>` : ''}
    ${phase === 'before' ? html`<div class="notice">결과물 제출은 대회 당일 <b>${fmtWhen(config.event.submitOpen)}</b>부터 열립니다.</div>` : ''}
    ${phase === 'closed' && !repo ? html`<div class="notice bad">제출이 마감되었습니다.</div>` : ''}
    ${view.can.repo ? html`<form class="panel" onSubmit=${submit} novalidate>
      <${Field} label="GitHub 저장소 주소" id="repo-url" required error=${errors.repoUrl} hint="https://github.com/계정/저장소 — 심사 기간 동안 공개(Public)">
        <input id="repo-url" class="input mono" inputmode="url" placeholder="https://github.com/team/project" value=${repoUrl} onInput=${(e) => setRepoUrl(e.target.value)} />
      <//>
      <${Field} label="서비스 주소" id="service-url" optional error=${errors.serviceUrl} hint="배포한 앱 주소(https://) — AI 코드 심사와 2일차 시연 심사 때 이 주소로 엽니다. 배포한 뒤 [다시 등록]으로 넣어도 됩니다.">
        <input id="service-url" class="input mono" inputmode="url" placeholder="https://" value=${serviceUrl} onInput=${(e) => setServiceUrl(e.target.value)} />
      <//>
      <label class="check"><input type="checkbox" checked=${agree} onChange=${(e) => setAgree(e.target.checked)} />
        <span>저장소를 심사 기간 동안 공개로 두고, API 키 같은 비밀정보가 들어 있지 않음을 확인합니다. 이 저장소는 본선 시작 뒤에 새로 만들었고 본선 전에 만든 코드(예선 결과물 포함)를 가져오지 않았음을 서약합니다 — 어기면 실격입니다.</span></label>
      ${errors.agree || errors._form ? html`<div class="err" role="alert">${errors.agree || errors._form}</div>` : ''}
      <div><button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '점검하며 등록하는 중…' : repo ? '다시 등록' : '저장소 등록'}</button></div>
      <p class="small muted" style="margin:0">등록은 한 번이면 됩니다. 그다음에는 이 저장소의 main(기본) 브랜치에 계속 올리면 되고, 심사는 마감 시각의 최신 커밋으로 합니다. 마감 당일에는 팀원 모두 만족도 조사에 응답한 뒤 [최종 제출]을 눌러야 제출이 됩니다.</p>
    </form>` : ''}
  </section>`;
}

function MembersPanel({ view, onView }) {
  const { config, notify } = useApp();
  const teamSize = config.teamSize;
  const t = view.team;
  const leader = view.me.role === 'leader';
  const [confirm, setConfirm] = useState(null);
  const [busy, run] = useBusy();
  const act = (action, key, done) => run(async () => {
    try {
      const res = await api(action, { token: session.get('member'), key });
      onView(res.view);
      notify(done);
      setConfirm(null);
    } catch (err) {
      notify(err.message, 'err');
    }
  });
  const rows = t.members.concat(Array.from({ length: Math.max(0, teamSize - t.count) }, () => null));
  return html`<section class="panel">
    <div class="panel-h"><h2>팀원</h2><${Slots} count=${t.count} /></div>
    <div class="scroll-x"><table class="members">
      <thead><tr><th>구분</th><th>학과</th><th>성명</th><th>학번</th><th>연락처</th>${leader ? html`<th></th>` : ''}</tr></thead>
      <tbody>
        ${rows.map((m) => (m ? html`<tr class=${m.self ? 'me' : ''}>
          <td class="small">${m.role === 'leader' ? '팀장' : '팀원'}${m.self ? ' (나)' : ''}</td>
          <td>${m.deptName}</td><td>${m.name}</td>
          <td class="num">${m.self ? m.studentNo : html`<${Veil} kind="studentNo" />`}</td>
          <td class="num">${m.self ? m.phone : html`<${Veil} kind="phone" />`}</td>
          ${leader ? html`<td class="nowrap">${m.self ? '' : html`
            <button class="link-btn" onClick=${() => setConfirm({ kind: 'transfer', m })}>팀장 넘기기</button>
            ${view.can.kick ? html` · <button class="link-btn" onClick=${() => setConfirm({ kind: 'kick', m })}>내보내기</button>` : ''}`}</td>` : ''}
        </tr>` : html`<tr><td class="small">팀원</td><td class="muted" colspan=${leader ? 5 : 4}>빈자리 — 초대 링크로 합류</td></tr>`))}
      </tbody>
    </table></div>
    <p class="small muted" style="margin:0">다른 팀원의 학번·연락처는 개인정보라서 가립니다.</p>
    ${confirm ? html`<${Modal} title=${confirm.kind === 'kick' ? '팀원 내보내기' : '팀장 넘기기'} onClose=${() => setConfirm(null)}>
      <p>${confirm.kind === 'kick'
        ? `${confirm.m.name}(${confirm.m.deptName}) 님을 팀에서 내보냅니다. 그 사람의 신청 정보는 삭제됩니다. ${t.status === 'draft'
          ? ''
          : '신청은 그대로 유지되고, 초대 링크로 새 팀원을 받으면 신청서가 새 명단으로 다시 만들어집니다.'}`
        : `${confirm.m.name}(${confirm.m.deptName}) 님이 팀장이 되고, 나는 팀원이 됩니다.`}</p>
      <div class="btn-row">
        <button class=${`btn ${confirm.kind === 'kick' ? 'btn-danger' : 'btn-primary'}`} disabled=${busy}
          onClick=${() => act(confirm.kind === 'kick' ? 'teamKick' : 'teamTransfer', confirm.m.key, confirm.kind === 'kick' ? '팀원을 내보냈습니다.' : '팀장을 넘겼습니다.')}>
          ${confirm.kind === 'kick' ? '내보내기' : '팀장 넘기기'}</button>
        <button class="btn" onClick=${() => setConfirm(null)}>취소</button>
      </div>
    <//>` : ''}
  </section>`;
}

function TeamPanel({ view, onView, config }) {
  const { notify } = useApp();
  const t = view.team;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  const start = () => {
    setForm({ name: t.name, repDept: t.repDept.code, topic: t.topic, projectName: t.projectName, summary: t.summary, aiTools: t.aiTools, motivation: t.motivation });
    setErrors({});
    setEditing(true);
  };
  const save = (e) => {
    e.preventDefault();
    const errs = checkTeam(form, config.teamFields);
    setErrors(errs);
    if (Object.keys(errs).length) { focusFirstError(); return; }
    run(async () => {
      try {
        const res = await api('teamUpdate', { token: session.get('member'), team: form });
        onView(res.view);
        setEditing(false);
        notify('팀 정보를 고쳤습니다.');
      } catch (err) {
        setErrors(serverErrors(err));
        focusFirstError();
      }
    });
  };
  return html`<section class="panel">
    <div class="panel-h"><h2>신청 내용</h2>${view.can.editTeam && !editing ? html`<button class="btn btn-sm" onClick=${start}>고치기</button>` : ''}</div>
    ${editing ? html`<form class="form" onSubmit=${save} novalidate>
      <${TeamFields} t=${form} set=${(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors=${errors} config=${config} />
      <div class="btn-row"><button class="btn btn-primary" type="submit" disabled=${busy}>저장</button><button class="btn" type="button" onClick=${() => setEditing(false)}>취소</button>
        ${errors._form ? html`<span class="form-error">${errors._form}</span>` : ''}</div>
    </form>` : html`<dl class="kv">
      <dt>팀명</dt><dd>${t.name}</dd>
      <dt>대표 학과</dt><dd>${t.repDept.name}</dd>
      <dt>참가 주제(안)</dt><dd>${t.topic}</dd>
      <dt>프로젝트명(안)</dt><dd>${t.projectName}</dd>
      <dt>프로젝트 개요</dt><dd>${t.summary}</dd>
      <dt>AI 도구</dt><dd>${t.aiTools}</dd>
      <dt>참가 동기</dt><dd>${t.motivation}</dd>
    </dl>`}
  </section>`;
}

function MyInfoPanel({ view, onView, config }) {
  const { notify } = useApp();
  const me = view.me;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  const start = () => {
    setForm({ deptCode: me.deptCode, studentNo: me.studentNo, name: me.name, phone: me.phone, email: me.email, shirt: me.shirt, agreeMedia: me.agreeMedia, currentPin: '', newPin: '', newPin2: '' });
    setErrors({});
    setEditing(true);
  };
  const save = (e) => {
    e.preventDefault();
    const errs = checkMember(form, { withPin: false });
    if (form.newPin && form.newPin.length < 6) errs.newPin = '새 비밀번호는 6자 이상입니다.';
    if (form.newPin && form.newPin !== form.newPin2) errs.newPin2 = '새 비밀번호가 서로 다릅니다.';
    if (form.newPin && !form.currentPin) errs.currentPin = '현재 비밀번호를 입력해 주세요.';
    setErrors(errs);
    if (Object.keys(errs).length) { focusFirstError(); return; }
    run(async () => {
      try {
        const payload = { token: session.get('member'), me: { ...form, studentNo: digits(form.studentNo) } };
        if (form.newPin) Object.assign(payload, { newPin: form.newPin, currentPin: form.currentPin });
        const res = await api('meUpdate', payload);
        session.set('member', res.token);
        onView(res.view);
        setEditing(false);
        notify('내 정보를 고쳤습니다.');
      } catch (err) {
        setErrors(serverErrors(err));
        focusFirstError();
      }
    });
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return html`<section class="panel">
    <div class="panel-h"><h2>내 정보</h2>${!editing ? html`<button class="btn btn-sm" onClick=${start}>정정</button>` : ''}</div>
    ${editing ? html`<form class="form" onSubmit=${save} novalidate style="gap:18px">
      <${MemberFields} m=${form} set=${set} errors=${errors} config=${config} prefix="edit" />
      <label class="check"><input type="checkbox" checked=${form.agreeMedia} onChange=${(e) => set('agreeMedia', e.target.checked)} />
        <span>[선택] 사진·영상 촬영 및 홍보 활용에 동의합니다.</span></label>
      <details>
        <summary class="small">비밀번호 바꾸기</summary>
        <div class="grid-2" style="margin-top:12px">
          <${Field} label="현재 비밀번호" id="cur-pin" error=${errors.currentPin}><input id="cur-pin" class="input" type="password" autocomplete="current-password" value=${form.currentPin} onInput=${(e) => set('currentPin', e.target.value)} /><//>
          <span></span>
          <${Field} label="새 비밀번호" id="new-pin" error=${errors.newPin}><input id="new-pin" class="input" type="password" autocomplete="new-password" maxlength="20" value=${form.newPin} onInput=${(e) => set('newPin', e.target.value)} /><//>
          <${Field} label="새 비밀번호 확인" id="new-pin2" error=${errors.newPin2}><input id="new-pin2" class="input" type="password" autocomplete="new-password" maxlength="20" value=${form.newPin2} onInput=${(e) => set('newPin2', e.target.value)} /><//>
        </div>
      </details>
      <div class="btn-row"><button class="btn btn-primary" type="submit" disabled=${busy}>저장</button><button class="btn" type="button" onClick=${() => setEditing(false)}>취소</button>
        ${errors._form ? html`<span class="form-error">${errors._form}</span>` : ''}</div>
    </form>` : html`<dl class="kv">
      <dt>학과</dt><dd>${me.deptName}</dd>
      <dt>학번</dt><dd class="num">${me.studentNo}</dd>
      <dt>성명</dt><dd>${me.name}</dd>
      <dt>휴대전화</dt><dd class="num">${me.phone}</dd>
      <dt>이메일</dt><dd>${me.email}</dd>
      <dt>티셔츠</dt><dd>${me.shirt}</dd>
      <dt>필수 동의</dt><dd>${fmtWhen(me.agreedAt)} (수집·이용, 국외 이전, 의무 교육 참석)</dd>
      <dt>사진·영상</dt><dd>${me.agreeMedia ? '동의' : '동의하지 않음'}</dd>
    </dl>`}
  </section>`;
}

function DangerPanel({ view, onLeft }) {
  const leader = view.me.role === 'leader';
  const alone = view.team.count === 1;
  const [modal, setModal] = useState('');
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const logout = () => { session.clear('member'); onLeft('로그아웃했습니다.'); };
  const withdraw = () => run(async () => {
    try {
      await api('meWithdraw', { token: session.get('member'), confirm: true });
      session.clear('member');
      onLeft('신청을 철회했습니다. 내 정보는 삭제되었습니다.');
    } catch (err) {
      setError(err.message);
    }
  });
  const dissolve = () => run(async () => {
    try {
      await api('teamDissolve', { token: session.get('member'), confirm: typed.trim() });
      session.clear('member');
      onLeft('팀 신청을 취소했습니다. 팀과 팀원 정보는 모두 삭제되었습니다.');
    } catch (err) {
      setError(err.message);
    }
  });
  const close = () => { setModal(''); setChecked(false); setTyped(''); setError(''); };
  const leave = view.can.leave;
  return html`<section class="danger">
    <div class="btn-row">
      <button class="btn btn-sm" onClick=${logout}>로그아웃</button>
      ${leave && (!leader || alone) ? html`<button class="btn btn-sm btn-danger" onClick=${() => setModal('withdraw')}>신청 철회</button>` : ''}
      ${leave && leader ? html`<button class="btn btn-sm btn-danger" onClick=${() => setModal('dissolve')}>팀 신청 취소</button>` : ''}
    </div>
    ${!leave ? html`<p class="small muted" style="margin:0" data-noleave>접수 기간이 끝나 신청 철회·팀 신청 취소는 할 수 없습니다. 부득이한 사정이 있으면 문의처로 연락해 주세요.</p>`
      : leader && !alone ? html`<p class="small muted" style="margin:0">팀장이 혼자 빠지려면 먼저 다른 팀원에게 팀장을 넘겨 주세요.</p>` : ''}
    ${modal === 'withdraw' ? html`<${Modal} title="신청 철회" onClose=${close}>
      <p>철회하면 내 신청 정보(학번·연락처·이메일 등)가 바로 삭제됩니다. ${leader ? '팀장 혼자이므로 팀도 함께 삭제됩니다.'
        : view.team.status === 'draft' ? '' : '팀의 신청은 유지되고, 팀장이 새 팀원을 받으면 신청서가 새 명단으로 다시 만들어집니다.'}</p>
      <label class="check"><input type="checkbox" checked=${checked} onChange=${(e) => setChecked(e.target.checked)} /><span>위 내용을 확인했습니다.</span></label>
      ${error ? html`<div class="err" style="margin-top:10px">${error}</div>` : ''}
      <div class="btn-row" style="margin-top:16px"><button class="btn btn-danger" disabled=${!checked || busy} onClick=${withdraw}>철회하고 삭제</button><button class="btn" onClick=${close}>닫기</button></div>
    <//>` : ''}
    ${modal === 'dissolve' ? html`<${Modal} title="팀 신청 취소" onClose=${close}>
      <p>팀과 팀원 ${view.team.count}명의 신청 정보가 모두 삭제됩니다. 되돌릴 수 없습니다. 확인을 위해 팀명 <b>${view.team.name}</b>을 입력해 주세요.</p>
      <input class="input" value=${typed} onInput=${(e) => setTyped(e.target.value)} aria-label="팀명 확인" />
      ${error ? html`<div class="err" style="margin-top:10px">${error}</div>` : ''}
      <div class="btn-row" style="margin-top:16px"><button class="btn btn-danger" disabled=${typed.trim() !== view.team.name || busy} onClick=${dissolve}>팀 신청 취소</button><button class="btn" onClick=${close}>닫기</button></div>
    <//>` : ''}
  </section>`;
}

export function MeView() {
  const { config, notify } = useApp();
  const [view, setView] = useState(null);
  const [state, setState] = useState(session.get('member') ? 'loading' : 'login');
  const [message, setMessage] = useState('');
  // 쓰기(제출·응답·요청 등)의 답은 늘 화면에 쓰고, 그 전에 출발해 늦게 도착한 다시 읽기(폴링·탭 복귀)는 버린다 — 방금 바꾼 화면이 옛 읽기로 되돌아가지 않게
  const seq = useRef(0);
  const writeView = (v) => { seq.current += 1; setView(v); };
  const refresh = () => {
    const mine = seq.current;
    return api('me', { token: session.get('member') }).then((res) => {
      if (mine === seq.current) setView(res.view);
    }).catch((err) => {
      // 로그인이 끊겼으면(철회·내보내기·만료) 로그인 화면으로. 그 밖의 오류는 다음 차례에 다시 읽는다.
      // 읽는 사이 쓰기(학번·비밀번호 변경 등)가 새 로그인을 받았으면 옛 로그인의 AUTH 는 버린다.
      if (err.code !== 'AUTH' || mine !== seq.current) return;
      session.clear('member');
      setMessage(err.message);
      setState('login');
    });
  };
  useFinalsPoll(state === 'ready' ? view : null, refresh);

  useEffect(() => {
    if (state !== 'loading') return;
    api('me', { token: session.get('member') }).then((res) => {
      setView(res.view);
      setState('ready');
    }).catch((err) => {
      setMessage(err.message);
      if (err.code === 'AUTH') {
        session.clear('member');
        setState('login');
      } else {
        setState('failed');
      }
    });
  }, [state]);

  // 카카오톡 등으로 초대 링크를 보내고 돌아오면(탭이 다시 보이면) 팀원 합류 상황을 새로 불러온다.
  useEffect(() => {
    if (state !== 'ready') return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state]);

  if (state === 'loading') return html`<div class="wrap page"><p class="muted">불러오는 중…</p></div>`;
  if (state === 'failed') return html`<${LoadFailed} message=${message} retry=${() => setState('loading')} />`;
  if (state === 'login' || !view) {
    return html`<${Login} message=${message} onDone=${(v) => { setView(v); setMessage(''); setState('ready'); }} />`;
  }

  const t = view.team;
  const leader = view.me.role === 'leader';
  const onLeft = (text) => { notify(text); setView(null); setMessage(''); setState('login'); };
  const rotateInvite = async () => {
    if (!window.confirm('새 초대 링크를 만들까요? 지금 링크로는 더 이상 합류할 수 없습니다.')) return;
    try {
      const res = await api('teamInvite', { token: session.get('member') });
      writeView(res.view);
      notify('새 초대 링크를 만들었습니다. 합류할 팀원에게 다시 보내 주세요.');
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return html`<div class="wrap page">
    <div class="status-head">
      <div>
        <p class="overline">내 신청 · ${leader ? '팀장' : '팀원'} ${view.me.name}</p>
        <h1>${t.name}</h1>
        <p class="muted" style="margin:4px 0 0">${t.projectName} · ${t.repDept.name}</p>
      </div>
      <div style="display:grid;gap:8px;justify-items:end;min-width:180px">
        <${Status} status=${t.status} label=${STATUS_LABEL[t.status]} />
        <div style="width:180px"><${Slots} count=${t.count} /></div>
        <span class="small muted num">${t.count}/${config.teamSize}명</span>
      </div>
    </div>
    <div class="two-col">
      <div class="stack">
        <${StatusNotice} view=${view} config=${config} />
        <${PrelimPanel} view=${view} onView=${writeView} />
        ${view.can.invite && t.inviteCode ? html`<${InviteBox} team=${t} onRotate=${rotateInvite} />` : ''}
        <${SubmitPanel} view=${view} onView=${writeView} />
        <${RepoPanel} view=${view} onView=${writeView} config=${config} />
        <${AccessPanel} view=${view} onView=${writeView} />
        <${SurveyPanel} view=${view} onView=${writeView} />
        <${FinalPanel} view=${view} onView=${writeView} deadline=${config.event.submitDeadline} />
        <${HelpPanel} view=${view} onView=${writeView} />
        <${MembersPanel} view=${view} onView=${writeView} />
        <${TeamPanel} view=${view} onView=${writeView} config=${config} />
      </div>
      <div class="stack">
        <div class="mustread"><span class="label-red">필독</span><div><strong>${config.training.notice}</strong><p>${config.training.detail}</p></div></div>
        <${MyInfoPanel} view=${view} onView=${writeView} config=${config} />
        <${DangerPanel} view=${view} onLeft=${onLeft} />
      </div>
    </div>
  </div>`;
}
