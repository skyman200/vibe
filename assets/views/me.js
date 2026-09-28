// 내 신청: 로그인(학번+비밀번호) → 팀 현황, 초대, 제출, 결과물(GitHub) 제출, 본인 정보 정정·철회.
import {
  html, useState, useEffect, useApp, api, session, digits, fmtWhen, fileToBase64, STATUS_LABEL,
} from '../lib.js';
import {
  Field, Modal, Slots, Status, Veil, MemberFields, FormTemplates, useBusy, checkMember, serverErrors, focusFirstError,
} from '../ui.js';
import { InviteBox, TeamFields, checkTeam } from './apply.js';

const CHECK_LABEL = { ok: '확인 완료', warn: '확인 필요', missing: '찾을 수 없음', error: '점검 실패' };
const CHECK_TONE = { ok: 'ok', warn: 'warn', missing: 'bad', error: 'bad' };

function Login({ onDone, message }) {
  const { notify } = useApp();
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
        <p class="small muted">비밀번호를 잊었다면 문의처로 연락해 주세요. 본인 확인 후 도와드립니다.</p>
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
      ${leader ? '4명이 모이고 신청서 파일을 올리면 아래 [신청서 제출]을 눌러 주세요.' : '4명이 모이면 팀장이 신청서 파일을 올리고 제출합니다.'}
    </div>`;
  }
  if (t.status === 'submitted') {
    return html`<div class="notice ok"><b>접수 완료</b> (${fmtWhen(t.submittedAt)}). 심사를 거쳐 선발 결과를 이 화면과 연락처로 안내합니다.</div>`;
  }
  if (t.status === 'selected') {
    return html`<div class="notice ok"><b>본선 참가팀으로 선정되었습니다.</b> ${config.training.notice} ${t.count < config.teamSize ? `지금 ${t.count}명이라 충원이 필요합니다. 문의처로 연락해 주세요.` : ''}</div>`;
  }
  if (t.status === 'waitlist') return html`<div class="notice warn"><b>예비 팀입니다.</b> 선정 팀에 결원이 생기면 차례로 연락드립니다.</div>`;
  return html`<div class="notice"><b>이번에는 선정되지 않았습니다.</b> 관심 가져 주셔서 고맙습니다.</div>`;
}

const FORM_EXTS = ['pdf', 'doc', 'docx', 'hwpx'];
const FORM_MAX_BYTES = 10 * 1024 * 1024;

/** 신청서 파일: 팀장이 양식을 적고 서명한 파일을 올린다(서버가 형식·내용을 다시 확인). */
function FormPanel({ view, onView }) {
  const { notify } = useApp();
  const t = view.team;
  const leader = view.me.role === 'leader';
  const [busy, run] = useBusy();
  const [error, setError] = useState('');
  const pick = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
    if (!FORM_EXTS.includes(ext)) {
      setError('PDF, 워드(.doc·.docx), 한글(.hwpx) 파일만 올릴 수 있습니다. 한글(.hwp) 파일은 .hwpx 나 PDF 로 저장해 주세요.');
      return;
    }
    if (file.size > FORM_MAX_BYTES) {
      setError('파일이 너무 큽니다. 10MB 이하로 올려 주세요.');
      return;
    }
    setError('');
    run(async () => {
      try {
        const data = await fileToBase64(file);
        const res = await api('teamForm', { token: session.get('member'), file: { name: file.name, data } });
        onView(res.view);
        notify('신청서 파일을 올렸습니다.');
      } catch (err) {
        setError(err.message);
      }
    });
  };
  return html`<section class="panel">
    <div class="panel-h"><h2>신청서 파일</h2><span class="small muted">PDF · 워드 · 한글(.hwpx), 10MB 이하</span></div>
    ${t.form
      ? html`<dl class="kv"><dt>올린 파일</dt><dd>${t.form.name}</dd><dt>올린 시각</dt><dd>${fmtWhen(t.form.at)} · ${t.form.size}</dd></dl>`
      : html`<div class="notice warn">${leader
        ? '아직 올리지 않았습니다. 양식을 내려받아 팀 정보를 적고 팀장이 서명(또는 날인)한 뒤 올려 주세요.'
        : '팀장이 아직 신청서 파일을 올리지 않았습니다.'}</div>`}
    <${FormTemplates} />
    ${view.can.form ? html`<div class="btn-row">
      <label class=${`btn filepick${t.form ? '' : ' btn-primary'}`} aria-disabled=${busy ? 'true' : 'false'}>
        ${busy ? '올리는 중…' : t.form ? '다른 파일로 바꾸기' : '파일 골라 올리기'}
        <input type="file" accept=".pdf,.doc,.docx,.hwpx" disabled=${busy} onChange=${pick} aria-label="신청서 파일 고르기" />
      </label>
      <span class="small muted">팀원이 바뀌면 신청서를 다시 올려야 합니다.</span>
    </div>` : ''}
    ${error ? html`<div class="err" role="alert">${error}</div>` : ''}
  </section>`;
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
      : html`<ul class="checklist"><li><span class="y">✓</span>팀원 4명이 모두 합류하고 각자 동의했습니다.</li><li><span class="y">✓</span>신청서 파일을 올렸습니다.</li></ul>`}
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
    run(async () => {
      try {
        const res = await api('repoSubmit', { token: session.get('member'), repoUrl: repoUrl.trim(), serviceUrl: serviceUrl.trim(), agree });
        onView(res.view);
        setErrors({});
        notify('결과물을 제출했습니다.');
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

  return html`<section class="panel">
    <div class="panel-h"><h2>결과물 제출</h2><span class="small muted num">마감 ${fmtWhen(config.event.submitDeadline)}</span></div>
    ${repo ? html`<dl class="kv">
      <dt>GitHub</dt><dd><a href=${repo.url} target="_blank" rel="noopener">${repo.url}</a></dd>
      ${repo.serviceUrl ? html`<dt>서비스</dt><dd><a href=${repo.serviceUrl} target="_blank" rel="noopener">${repo.serviceUrl}</a></dd>` : ''}
      <dt>제출</dt><dd>${fmtWhen(repo.at)}${repo.by ? ` · ${repo.by}` : ''}</dd>
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
      <${Field} label="서비스 주소" id="service-url" optional error=${errors.serviceUrl} hint="배포한 경우 https:// 주소">
        <input id="service-url" class="input mono" inputmode="url" placeholder="https://" value=${serviceUrl} onInput=${(e) => setServiceUrl(e.target.value)} />
      <//>
      <label class="check"><input type="checkbox" checked=${agree} onChange=${(e) => setAgree(e.target.checked)} />
        <span>저장소를 심사 기간 동안 공개로 두고, API 키 같은 비밀정보가 들어 있지 않음을 확인합니다.</span></label>
      ${errors.agree || errors._form ? html`<div class="err" role="alert">${errors.agree || errors._form}</div>` : ''}
      <div><button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '점검하며 제출하는 중…' : repo ? '다시 제출' : '제출'}</button></div>
    </form>` : ''}
  </section>`;
}

function MembersPanel({ view, onView }) {
  const { notify } = useApp();
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
  const rows = t.members.concat(Array.from({ length: Math.max(0, 4 - t.count) }, () => null));
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
        ? `${confirm.m.name}(${confirm.m.deptName}) 님을 팀에서 내보냅니다. 그 사람의 신청 정보는 삭제되고, 접수 완료 상태였다면 다시 '팀 구성 중'이 됩니다.`
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
    const errs = checkTeam(form);
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
  return html`<section class="danger">
    <div class="btn-row">
      <button class="btn btn-sm" onClick=${logout}>로그아웃</button>
      ${!leader || alone ? html`<button class="btn btn-sm btn-danger" onClick=${() => setModal('withdraw')}>신청 철회</button>` : ''}
      ${leader ? html`<button class="btn btn-sm btn-danger" onClick=${() => setModal('dissolve')}>팀 신청 취소</button>` : ''}
    </div>
    ${leader && !alone ? html`<p class="small muted" style="margin:0">팀장이 혼자 빠지려면 먼저 다른 팀원에게 팀장을 넘겨 주세요.</p>` : ''}
    ${modal === 'withdraw' ? html`<${Modal} title="신청 철회" onClose=${close}>
      <p>철회하면 내 신청 정보(학번·연락처·이메일 등)가 바로 삭제됩니다. ${leader ? '팀장 혼자이므로 팀도 함께 삭제됩니다.' : '팀 인원이 줄어 접수 완료 상태였다면 다시 \'팀 구성 중\'이 됩니다.'}</p>
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

  useEffect(() => {
    if (state !== 'loading') return;
    api('me', { token: session.get('member') }).then((res) => {
      setView(res.view);
      setState('ready');
    }).catch((err) => {
      if (err.code === 'AUTH') session.clear('member');
      setMessage(err.message);
      setState('login');
    });
  }, [state]);

  if (state === 'loading') return html`<div class="wrap page"><p class="muted">불러오는 중…</p></div>`;
  if (state === 'login' || !view) {
    return html`<${Login} message=${message} onDone=${(v) => { setView(v); setMessage(''); setState('ready'); }} />`;
  }

  const t = view.team;
  const leader = view.me.role === 'leader';
  const onLeft = (text) => { notify(text); setView(null); setMessage(''); setState('login'); };

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
        ${view.can.invite && t.inviteCode ? html`<${InviteBox} team=${t} />` : ''}
        <${FormPanel} view=${view} onView=${setView} />
        <${SubmitPanel} view=${view} onView=${setView} />
        <${RepoPanel} view=${view} onView=${setView} config=${config} />
        <${MembersPanel} view=${view} onView=${setView} />
        <${TeamPanel} view=${view} onView=${setView} config=${config} />
      </div>
      <div class="stack">
        <div class="mustread"><span class="label-red">필독</span><div><strong>${config.training.notice}</strong><p>${config.training.detail}</p></div></div>
        <${MyInfoPanel} view=${view} onView=${setView} config=${config} />
        <${DangerPanel} view=${view} onLeft=${onLeft} />
      </div>
    </div>
  </div>`;
}
