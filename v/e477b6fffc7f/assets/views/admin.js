// 관리자: 개인정보 원문을 보는 유일한 화면. 칸반(끌어서 상태 변경)·참가자·예선(admin-prelim.js)·심사·설정·엑셀.
import {
  html, useState, useEffect, useApp, api, session, fmtWhen, fmtShort, copyText, groupBySeries, fileToBase64, STATUS_LABEL, josaRo,
} from '../lib.js';
import {
  Field, DeptSelect, FormTemplates, LoadFailed, Modal, Slots, Status, useBusy, serverErrors, focusFirstError,
} from '../ui.js';
import { TeamFields, checkTeam } from './apply.js';
import { PrelimTab } from './admin-prelim.js';

const COLUMNS = [
  ['draft', '팀 구성 중'],
  ['submitted', '접수 완료'],
  ['selected', '본선 진출'],
  ['waitlist', '예비'],
  ['rejected', '미선발'],
];
const MOVABLE = ['submitted', 'selected', 'waitlist', 'rejected'];

const token = () => session.get('admin');

/* ── 엑셀(.xlsx): 서버가 준 표를 브라우저에서 파일로 만든다 ── */
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'assets/vendor/xlsx.mini.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('엑셀 모듈을 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
}

function textWidth(v) {
  let w = 0;
  for (const ch of String(v === null || v === undefined ? '' : v)) w += /[ㄱ-ㆎ가-힣]/.test(ch) ? 2 : 1.1;
  return w;
}

async function downloadExcel() {
  const res = await api('adminExport', { token: token() });
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  res.sheets.forEach((sheet) => {
    const aoa = [sheet.header, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = sheet.header.map((_, i) => ({ wch: Math.min(60, Math.max(6, ...aoa.map((r) => textWidth(r[i]) + 2))) }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, aoa.length - 1), c: sheet.header.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  XLSX.writeFile(wb, res.filename);
  return res;
}

function AdminLogin({ onDone, message }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(message || '');
  const [busy, run] = useBusy();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        const res = await api('adminLogin', { code });
        session.set('admin', res.token);
        onDone();
      } catch (err) {
        setError(err.message);
      }
    });
  };
  return html`<div class="wrap page">
    <div class="page-h"><div><h1>관리자</h1><p>참가자 개인정보 원문을 볼 수 있는 화면입니다. 공용 PC에서는 사용 후 로그아웃하세요.</p></div></div>
    <form class="box" style="max-width:440px;display:grid;gap:14px" onSubmit=${submit}>
      <${Field} label="관리자 코드" id="admin-code" error=${error}>
        <input id="admin-code" class="input mono" type="password" autocomplete="off" value=${code} onInput=${(e) => setCode(e.target.value)} />
      <//>
      <button class="btn btn-primary" type="submit" disabled=${busy}>${busy ? '확인 중…' : '들어가기'}</button>
    </form>
  </div>`;
}

/* ───────────── 칸반 ───────────── */

function AdminCard({ t, onOpen, onDragStart, onDragEnd, dragging }) {
  const movable = MOVABLE.includes(t.status);
  const short = t.status !== 'draft' && t.count < 4;
  return html`<article class=${`card${dragging ? ' dragging' : ''}`} role="button" tabindex="0" draggable=${movable ? 'true' : 'false'}
    onDragStart=${(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(t.id); }}
    onDragEnd=${onDragEnd}
    onClick=${() => onOpen(t.id)} onKeyDown=${(e) => { if (e.key === 'Enter') onOpen(t.id); }}>
    <div class="card-top"><h4>${t.name}</h4>${t.result && t.result.award ? html`<span class="award">${t.result.award}</span>` : ''}</div>
    <div class="proj">${t.projectName}</div>
    <div class="dept">${t.repDept.name} · ${t.repDept.series}</div>
    <ul class="mem">
      ${t.members.map((m) => html`<li><span class="role">${m.role === 'leader' ? '팀장' : '팀원'}</span><span class="who">${m.name} · ${m.deptName}</span><span class="num small muted">${m.studentNo}</span></li>`)}
    </ul>
    <div class="card-foot">
      <span>${short ? html`<span class="flag">${t.count}/4명 충원 필요</span>` : html`<span class="num">${t.count}/4명</span>`}${t.app && (t.app.error || !t.app.pdf) ? html` · <span class="flag">신청서 확인</span>` : ''}${t.source === 'offline' ? ' · 서면' : ''}</span>
      <span>${t.repo.url ? 'GitHub 제출' : t.submittedAt ? `접수 ${fmtShort(t.submittedAt)}` : `생성 ${fmtShort(t.createdAt)}`}</span>
    </div>
  </article>`;
}

function KanbanTab({ data, reload, openTeam }) {
  const { notify } = useApp();
  const [dragId, setDragId] = useState('');
  const [over, setOver] = useState('');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const visible = (t) => !needle || [t.name, t.projectName, t.repDept.name, ...t.members.map((m) => `${m.name} ${m.studentNo} ${m.deptName}`)]
    .join(' ').toLowerCase().includes(needle);

  const move = async (teamId, status) => {
    const t = data.teams.find((x) => x.id === teamId);
    if (!t || t.status === status) return;
    try {
      await api('adminStatus', { token: token(), teamId, status });
      notify(`${t.name} → ${STATUS_LABEL[status]}`);
      reload();
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  return html`<div>
    <div class="toolbar">
      <div class="statline">
        ${Object.entries(data.bySeries).map(([s, n]) => html`<span>${s} <b>${n}</b></span>`)}
      </div>
      <input class="input" type="search" placeholder="팀·이름·학번 검색" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="검색" />
    </div>
    <p class="small muted" style="margin:-4px 0 12px">카드를 끌어 다른 칸에 놓으면 상태가 바뀝니다. 휴대기기에서는 카드를 눌러 상태를 고르세요. 신청이 본선 팀 수(${data.phase.selectTarget}팀)를 넘으면 의무 교육 후 평가 결과로 '본선 진출'·'예비'·'미선발' 칸에 나눕니다. 본선 진출은 ${data.phase.selectTarget}팀까지이고, 참가자에게는 [설정 → 본선 진출 발표]를 켜야 보입니다.</p>
    <div class="board">
      ${COLUMNS.map(([key, label]) => {
        const cards = data.teams.filter((t) => t.status === key && visible(t));
        const droppable = MOVABLE.includes(key);
        const target = key === 'selected' ? html`<small> / ${data.phase.selectTarget}</small>` : '';
        return html`<section class=${`col${key === 'draft' ? ' dashed' : ''}${over === key ? ' drop' : ''}`} aria-label=${label}
          onDragOver=${(e) => { if (droppable) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key); } }}
          onDragLeave=${() => setOver('')}
          onDrop=${(e) => { e.preventDefault(); setOver(''); const id = e.dataTransfer.getData('text/plain'); setDragId(''); if (droppable) move(id, key); }}>
          <div class="col-h"><h3>${label}</h3><span class="count">${cards.length}${target}</span></div>
          <div class="cards">
            ${cards.length ? cards.map((t) => html`<${AdminCard} key=${t.id} t=${t} onOpen=${openTeam} dragging=${dragId === t.id}
              onDragStart=${setDragId} onDragEnd=${() => { setDragId(''); setOver(''); }} />`) : html`<div class="empty-col">없음</div>`}
          </div>
        </section>`;
      })}
    </div>
  </div>`;
}

/* ───────────── 서면 신청 입력·팀원 정정 ───────────── */

const emptyPaper = () => ({ deptCode: '', studentNo: '', name: '', phone: '', email: '', shirt: '', agreeMedia: false });

/** 브라우저에서 파일로 저장(서버가 준 base64). */
function saveBase64({ name, mime, data }) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 관리자가 입력하는 참가자 칸(서면 신청·팀원 추가·정정). prefix: 서버 오류 칸 이름 앞부분(members.0. / member.) */
function PaperMemberFields({ m, set, errors, prefix, departments, idp }) {
  const { config } = useApp();
  const err = (k) => errors[prefix + k];
  return html`<div class="grid-3">
    <${Field} label="학과" id=${`${idp}-dept`} required error=${err('deptCode')}>
      <${DeptSelect} id=${`${idp}-dept`} value=${m.deptCode} departments=${departments} onChange=${(v) => set('deptCode', v)} />
    <//>
    <${Field} label="학번" id=${`${idp}-no`} required error=${err('studentNo')}>
      <input id=${`${idp}-no`} class="input num" inputmode="numeric" maxlength="9" value=${m.studentNo} onInput=${(e) => set('studentNo', e.target.value.replace(/[^0-9]/g, ''))} />
    <//>
    <${Field} label="성명" id=${`${idp}-name`} required error=${err('name')}>
      <input id=${`${idp}-name`} class="input" maxlength="30" value=${m.name} onInput=${(e) => set('name', e.target.value)} />
    <//>
    <${Field} label="연락처" id=${`${idp}-phone`} required error=${err('phone')}>
      <input id=${`${idp}-phone`} class="input num" inputmode="tel" maxlength="13" value=${m.phone} onInput=${(e) => set('phone', e.target.value)} />
    <//>
    <${Field} label="이메일" id=${`${idp}-email`} optional error=${err('email')}>
      <input id=${`${idp}-email`} class="input" inputmode="email" maxlength="100" value=${m.email} onInput=${(e) => set('email', e.target.value)} />
    <//>
    <${Field} label="티셔츠 사이즈" id=${`${idp}-shirt`} optional error=${err('shirt')}>
      <select id=${`${idp}-shirt`} class="select" value=${m.shirt} onChange=${(e) => set('shirt', e.target.value)}>
        <option value="">모름</option>${config.shirtSizes.map((s) => html`<option value=${s}>${s}</option>`)}
      </select>
    <//>
  </div>`;
}

/** 서면 원본 파일 고르기(형식·크기는 서버가 다시 확인한다). */
function FilePick({ label, file, onPick, error }) {
  const { config } = useApp();
  const [local, setLocal] = useState('');
  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
    if (!config.form.types.includes(ext)) { setLocal('PDF, 워드(.doc·.docx), 한글(.hwpx) 파일만 첨부할 수 있습니다. 한글(.hwp)은 .hwpx 나 PDF 로 저장해 주세요.'); return; }
    if (f.size > config.form.maxBytes) { setLocal(`${Math.round(config.form.maxBytes / 1048576)}MB 이하 파일만 첨부할 수 있습니다.`); return; }
    setLocal('');
    onPick(f);
  };
  return html`<div class="btn-row">
    <label class="btn btn-sm filepick">${label}<input type="file" accept=".pdf,.doc,.docx,.hwpx" onChange=${pick} aria-label=${label} /></label>
    ${file ? html`<span class="small">${file.name}</span>` : ''}
    ${local || error ? html`<div class="err" role="alert" style="width:100%">${local || error}</div>` : ''}
  </div>`;
}

/** 서면(오프라인)으로 받은 신청 입력 → 곧바로 접수 완료. */
function PaperApplication({ data, onClose, onDone }) {
  const { config, notify } = useApp();
  const [team, setTeam] = useState({ name: '', repDept: '', topic: '', projectName: '', summary: '', aiTools: '', motivation: '' });
  const [members, setMembers] = useState([emptyPaper(), emptyPaper(), emptyPaper(), emptyPaper()]);
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  const setT = (k, v) => setTeam((t) => ({ ...t, [k]: v }));
  const setM = (i) => (k, v) => setMembers((list) => list.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const save = (e) => {
    e.preventDefault();
    const errs = checkTeam(team, config.teamFields);
    if (!consent) errs.consent = '서면 신청서에서 팀원 4명의 필수 동의를 확인하고 체크해 주세요.';
    setErrors(errs);
    if (Object.keys(errs).length) { focusFirstError(); return; }
    run(async () => {
      try {
        const payload = { token: token(), team, members, consent };
        if (file) payload.file = { name: file.name, data: await fileToBase64(file) };
        const res = await api('adminTeamAdd', payload);
        notify('서면 신청을 접수했습니다. 참가 신청서(한글·PDF)를 만들었습니다.');
        onDone(res.teamId);
      } catch (err) {
        setErrors(serverErrors(err));
        focusFirstError();
      }
    });
  };
  return html`<${Modal} title="서면 신청 입력" onClose=${onClose} wide>
    <form class="form" onSubmit=${save} novalidate>
      <div class="stack">
        <p class="small muted" style="margin:0">종이로 받은 신청서를 입력하면 곧바로 '접수 완료'가 됩니다(접수 기간·정원과 관계없이). 입력한 내용으로 참가 신청서(한글·PDF)를 만들고, 서명한 원본은 아래에서 함께 첨부할 수 있습니다. 입력한 참가자는 비밀번호가 없어 로그인할 수 없습니다 — 필요하면 팀 상세에서 [비밀번호 재설정]으로 만들어 주세요.</p>
        <${FormTemplates} />
      </div>
      <fieldset class="fs">
        <div class="fs-h"><h2>팀 정보</h2></div>
        <${TeamFields} t=${team} set=${setT} errors=${errors} config=${{ ...config, departments: data.departments }} />
      </fieldset>
      ${members.map((m, i) => html`<fieldset class="fs">
        <div class="fs-h"><h2>${i === 0 ? '팀장' : `팀원 ${i}`}</h2></div>
        <${PaperMemberFields} m=${m} set=${setM(i)} errors=${errors} prefix=${`members.${i}.`} departments=${data.departments} idp=${`paper-${i}`} />
      </fieldset>`)}
      <fieldset class="fs">
        <div class="fs-h"><h2>동의와 원본</h2></div>
        <label class=${`check consent${errors.consent ? ' bad' : ''}`}><input type="checkbox" checked=${consent} onChange=${(e) => setConsent(e.target.checked)} />
          <span>서면 신청서에서 팀원 4명 각자의 필수 동의(개인정보 수집·이용, 국외 이전, 의무 교육 참석 확약)를 확인했습니다.</span></label>
        ${errors.consent ? html`<div class="err" role="alert">${errors.consent}</div>` : ''}
        <${FilePick} label=${file ? '다른 파일로 바꾸기' : '서명한 원본 첨부(선택)'} file=${file} onPick=${setFile} error=${errors.form} />
      </fieldset>
      <div class="form-foot">
        <button class="btn btn-accent btn-lg" type="submit" disabled=${busy}>${busy ? '접수하는 중…' : '접수하기'}</button>
        ${errors._form || errors.members ? html`<span class="form-error" role="alert">${errors._form || errors.members}</span>` : ''}
      </div>
    </form>
  <//>`;
}

/** 팀 상세의 참가 신청서: 서버가 만든 한글·PDF(내려받기·다시 만들기)와 서면 원본 첨부. */
function AppFilesPanel({ team, call, busy }) {
  const { notify } = useApp();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const download = async (kind) => {
    try {
      saveBase64(await api('adminAppFile', { token: token(), teamId: team.id, kind }));
    } catch (err) {
      notify(err.message, 'err');
    }
  };
  const attach = async (f) => {
    setFile(f);
    setError('');
    const res = await call('adminForm', { file: { name: f.name, data: await fileToBase64(f) } }, '서면 원본을 첨부했습니다.');
    if (!res) setError('첨부하지 못했습니다. 파일 형식을 확인해 주세요.');
    setFile(null);
  };
  const app = team.app;
  return html`<section class="panel">
    <div class="panel-h"><h2>참가 신청서</h2><span class="small muted">${team.source === 'offline' ? '서면 신청(관리자 입력)' : '온라인 신청'}</span></div>
    ${!app ? html`<p class="small muted" style="margin:0">팀장이 제출하면 신청 내용으로 참가 신청서(한글·PDF)가 만들어집니다.</p>` : html`
      ${app.error ? html`<div class="notice bad" role="alert"><b>신청서를 만들지 못했습니다.</b> ${app.error.replace(/^\S+\s/, '')} — 5분 안에 자동으로 다시 만들거나 [다시 만들기]를 누르세요.</div>` : ''}
      <p class="small muted" style="margin:0">${app.pdf ? html`${fmtWhen(app.at)}에 지금 내용으로 만들었습니다. 팀 정보·팀원이 바뀌면 자동으로 다시 만듭니다. 드라이브(소유자 계정): <a href=${app.pdf} target="_blank" rel="noopener">PDF</a> · <a href=${app.hwpx} target="_blank" rel="noopener">한글</a>` : '만드는 중입니다…'}</p>
      <div class="btn-row">
        <button class="btn btn-sm btn-primary" disabled=${!app.pdf} onClick=${() => download('pdf')}>PDF 내려받기</button>
        <button class="btn btn-sm" disabled=${!app.hwpx} onClick=${() => download('hwpx')}>한글 내려받기</button>
        <button class="btn btn-sm btn-ghost" disabled=${busy} onClick=${() => call('adminAppRefresh', {}, '신청서를 다시 만들었습니다.')}>다시 만들기</button>
      </div>`}
    <dl class="kv">
      <dt>서면 원본</dt><dd>${team.form
        ? html`${team.form.name} <span class="small muted">${team.form.size} · ${fmtWhen(team.form.at)}</span>
          <button class="link-btn" onClick=${() => download('form')}>내려받기</button>${' · '}<button class="link-btn" disabled=${busy} onClick=${() => { if (confirm('첨부한 서면 원본을 지울까요? 드라이브 휴지통으로 갑니다.')) call('adminForm', { remove: true }, '첨부를 지웠습니다.'); }}>지우기</button>`
        : html`<span class="muted">없음</span>`}</dd>
    </dl>
    <${FilePick} label=${busy && file ? '올리는 중…' : team.form ? '다른 파일로 바꾸기' : '서명한 원본 첨부'} file=${null} onPick=${attach} error=${error} />
  </section>`;
}

/** 팀원 정정·추가(교체) 칸. mode: {kind:'edit', m} | {kind:'add'} */
function MemberEditor({ mode, teamId, data, onSaved, onClose }) {
  const init = mode.kind === 'edit'
    ? { deptCode: mode.m.deptCode, studentNo: mode.m.studentNo, name: mode.m.name, phone: mode.m.phone, email: mode.m.email, shirt: mode.m.shirt, agreeMedia: mode.m.agreeMedia }
    : emptyPaper();
  const [m, setMember] = useState(init);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setMember((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (mode.kind === 'add' && !consent) { setErrors({ consent: '서면으로 받은 본인 동의를 확인하고 체크해 주세요.' }); return; }
    try {
      await api(mode.kind === 'edit' ? 'adminMemberUpdate' : 'adminMemberAdd',
        { token: token(), teamId, key: mode.kind === 'edit' ? mode.m.key : undefined, member: m, consent });
      onClose();
      onSaved(mode.kind === 'edit' ? '참가자 정보를 고쳤습니다.' : '팀원을 추가했습니다.');
    } catch (err) {
      setErrors(serverErrors(err));
    }
  };
  return html`<div class="panel">
    <b>${mode.kind === 'edit' ? `${mode.m.name} 정보 고치기` : '팀원 추가(교체)'}</b>
    ${mode.kind === 'add' ? html`<p class="small muted" style="margin:0">서면으로 본인 동의를 받은 사람을 넣습니다. 온라인으로 받으려면 팀장이 「내 신청」의 초대 링크를 보내면 됩니다.</p>` : ''}
    <${PaperMemberFields} m=${m} set=${set} errors=${errors} prefix="member." departments=${data.departments} idp="adm-member" />
    ${mode.kind === 'add' ? html`<label class=${`check consent${errors.consent ? ' bad' : ''}`}><input type="checkbox" checked=${consent} onChange=${(e) => setConsent(e.target.checked)} />
      <span>이 사람의 필수 동의(개인정보 수집·이용, 국외 이전, 의무 교육 참석 확약)를 서면으로 받았습니다.</span></label>` : ''}
    ${errors.consent || errors._form || errors.member ? html`<div class="err" role="alert">${errors.consent || errors._form || errors.member}</div>` : ''}
    <div class="btn-row"><button class="btn btn-sm btn-primary" onClick=${save}>저장</button><button class="btn btn-sm" onClick=${onClose}>취소</button></div>
  </div>`;
}

/** 팀 정보(신청 내용) 고치기. */
function TeamEditor({ team, data, onSaved, onClose }) {
  const { config } = useApp();
  const [t, setT] = useState({ name: team.name, repDept: team.repDept.code, topic: team.topic, projectName: team.projectName, summary: team.summary, aiTools: team.aiTools, motivation: team.motivation });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const errs = checkTeam(t, config.teamFields);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await api('adminTeam', { token: token(), teamId: team.id, patch: t });
      onClose();
      onSaved('팀 정보를 고쳤습니다.');
    } catch (err) {
      setErrors(serverErrors(err));
    }
  };
  return html`<div class="stack">
    <${TeamFields} t=${t} set=${set} errors=${errors} config=${{ ...config, departments: data.departments }} />
    ${errors._form ? html`<div class="err" role="alert">${errors._form}</div>` : ''}
    <div class="btn-row"><button class="btn btn-sm btn-primary" onClick=${save}>저장</button><button class="btn btn-sm" onClick=${onClose}>취소</button></div>
  </div>`;
}

/* ───────────── 팀 상세 ───────────── */

function TeamDrawer({ team, data, onClose, reload }) {
  const { notify } = useApp();
  const [memo, setMemo] = useState(team.memo);
  const [order, setOrder] = useState(team.presentOrder);
  const [repoUrl, setRepoUrl] = useState(team.repo.url);
  const [serviceUrl, setServiceUrl] = useState(team.repo.serviceUrl);
  const [code, setCode] = useState(() => {
    const v = {};
    data.rubric.code.forEach((c) => { v[c.key] = team.code[c.key] === null ? '' : String(team.code[c.key]); });
    v.codeNote = team.code.note || '';
    return v;
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const [tempPin, setTempPin] = useState(null);
  const [editTeam, setEditTeam] = useState(false);
  const [memberMode, setMemberMode] = useState(null);
  const [busy, run] = useBusy();
  const saved = async (msg) => { notify(msg); await reload(); };
  const judgeName = Object.fromEntries(data.judges.map((j) => [j.id, j.name]));
  // 바뀐 칸만 보낸다(저장소 주소가 그대로면 제출·마감 커밋 기록을 건드리지 않게).
  const saveRepo = () => {
    const patch = {};
    if (repoUrl.trim() !== team.repo.url) patch.repoUrl = repoUrl;
    if (serviceUrl.trim() !== team.repo.serviceUrl) patch.serviceUrl = serviceUrl;
    if (!Object.keys(patch).length) { notify('바뀐 내용이 없습니다.'); return; }
    call('adminTeam', { patch }, '결과물 주소를 저장했습니다.');
  };

  const call = (action, payload, done) => run(async () => {
    try {
      const res = await api(action, { token: token(), teamId: team.id, ...payload });
      if (done) notify(done);
      await reload();
      return res;
    } catch (err) {
      notify(err.message, 'err');
      return null;
    }
  });

  return html`<${Modal} title=${team.name} onClose=${onClose} wide>
    <div class="stack">
      <div class="btn-row">
        <${Status} status=${team.status} />
        <span class="small muted">초대 코드 <span class="mono">${team.id}-${team.inviteCode}</span></span>
        <span style="flex:1"></span>
        ${team.status === 'draft' ? html`<span class="small muted">팀 구성 중인 팀은 상태를 바꿀 수 없습니다(4명 + 팀장 제출 필요).</span>`
          : MOVABLE.map((s) => (team.status === s
            ? html`<span class="btn btn-sm btn-primary" aria-current="true">${STATUS_LABEL[s]}</span>`
            : html`<button class="btn btn-sm" disabled=${busy}
              onClick=${() => call('adminStatus', { status: s }, `${STATUS_LABEL[s]}${josaRo(STATUS_LABEL[s])} 바꿨습니다.`)}>${STATUS_LABEL[s]}</button>`))}
      </div>

      <section class="panel">
        <div class="panel-h"><h2>팀원(원문)</h2><${Slots} count=${team.count} /></div>
        <div class="scroll-x"><table class="sheet">
          <thead><tr><th>구분</th><th>학과</th><th>학번</th><th>성명</th><th>연락처</th><th>이메일</th><th>티셔츠</th><th>촬영 동의</th><th>필수 동의</th><th></th></tr></thead>
          <tbody>${team.members.map((m) => html`<tr>
            <td>${m.role === 'leader' ? '팀장' : '팀원'}</td><td>${m.deptName}</td><td class="num">${m.studentNo}</td><td>${m.name}</td>
            <td class="num nowrap">${m.phone}</td><td>${m.email}</td><td>${m.shirt}</td><td>${m.agreeMedia ? '동의' : '미동의'}</td>
            <td class="small nowrap">${fmtShort(m.agreePrivacyAt)}${m.agreeBy === 'paper' ? ' · 서면' : ''}</td>
            <td class="nowrap"><button class="link-btn" disabled=${busy} onClick=${() => setMemberMode({ kind: 'edit', m })}>고치기</button>${' · '}<button class="link-btn" disabled=${busy} onClick=${async () => {
              if (!confirm(`${m.name} 님의 비밀번호를 임시 비밀번호로 바꿀까요? 본인 확인을 마친 뒤에만 하세요.`)) return;
              const res = await call('adminPinReset', { key: m.key }, '임시 비밀번호를 만들었습니다.');
              if (res) setTempPin({ name: m.name, pin: res.pin });
            }}>비밀번호 재설정</button>${' · '}<button class="link-btn" disabled=${busy} onClick=${() => { if (confirm(`${m.name} 님의 신청 정보를 삭제할까요?`)) call('adminMemberRemove', { key: m.key }, '참가자를 삭제했습니다.'); }}>삭제</button></td>
          </tr>`)}</tbody>
        </table></div>
        ${memberMode ? html`<${MemberEditor} key=${memberMode.kind + (memberMode.m ? memberMode.m.key : '')} mode=${memberMode} teamId=${team.id} data=${data} onSaved=${saved} onClose=${() => setMemberMode(null)} />`
          : team.count < 4 ? html`<div class="btn-row"><button class="btn btn-sm" onClick=${() => setMemberMode({ kind: 'add' })}>팀원 추가(교체)</button>
            <span class="small muted">빠질 사람을 [삭제]한 뒤 새 사람을 넣으면 교체됩니다. 신청서는 새 명단으로 다시 만들어집니다.</span></div>` : ''}
        ${tempPin ? html`<div class="notice ok" role="status" style="margin-top:12px">
          <b>${tempPin.name}</b> 님의 임시 비밀번호: <span class="codeline">${tempPin.pin}</span>
          <div class="small">본인에게만 전달하고, 로그인 뒤 「내 신청 → 정정 → 비밀번호 바꾸기」로 바꾸게 하세요. 이 창을 닫으면 다시 볼 수 없습니다.</div>
        </div>` : ''}
      </section>

      <section class="panel">
        <div class="panel-h"><h2>신청 내용</h2><span class="small muted">생성 ${fmtWhen(team.createdAt)}${team.submittedAt ? ` · 접수 ${fmtWhen(team.submittedAt)}` : ''}
          ${editTeam ? '' : html` · <button class="link-btn" onClick=${() => setEditTeam(true)}>고치기</button>`}</span></div>
        ${editTeam ? html`<${TeamEditor} team=${team} data=${data} onSaved=${saved} onClose=${() => setEditTeam(false)} />` : html`<dl class="kv">
          <dt>대표 학과</dt><dd>${team.repDept.name} · ${team.repDept.series}</dd>
          <dt>참가 주제(안)</dt><dd>${team.topic}</dd>
          <dt>프로젝트명(안)</dt><dd>${team.projectName}</dd>
          <dt>프로젝트 개요</dt><dd>${team.summary}</dd>
          <dt>AI 도구</dt><dd>${team.aiTools}</dd>
          <dt>참가 동기</dt><dd>${team.motivation}</dd>
        </dl>`}
      </section>

      <${AppFilesPanel} team=${team} call=${call} busy=${busy} />

      <section class="panel">
        <div class="panel-h"><h2>운영 메모</h2></div>
        <div class="grid-2">
          <${Field} label="관리자 메모" id="adm-memo" cls="span-2"><textarea id="adm-memo" class="textarea" maxlength="500" value=${memo} onInput=${(e) => setMemo(e.target.value)}></textarea><//>
          <${Field} label="발표 순서" id="adm-order" hint="심사위원 화면의 순서"><input id="adm-order" class="input num" inputmode="numeric" maxlength="3" value=${order} onInput=${(e) => setOrder(e.target.value.replace(/[^0-9]/g, ''))} /><//>
        </div>
        <div><button class="btn btn-sm btn-primary" disabled=${busy} onClick=${() => call('adminTeam', { patch: { memo, presentOrder: order } }, '저장했습니다.')}>메모·순서 저장</button></div>
      </section>

      <section class="panel">
        <div class="panel-h"><h2>결과물</h2>${team.repo.at ? html`<span class="small muted">${fmtWhen(team.repo.at)}${team.repo.by ? ` · ${team.repo.by}` : ''}</span>` : ''}</div>
        ${team.repo.check ? html`<div class=${`notice ${team.repo.check.state === 'ok' ? 'ok' : team.repo.check.state === 'warn' ? 'warn' : 'bad'}`}>${team.repo.check.message}</div>` : ''}
        ${team.repo.pinnedSha || team.repo.pinnedNote ? html`<p class="small">고정 커밋 <span class="mono">${team.repo.pinnedSha ? team.repo.pinnedSha.slice(0, 12) : '-'}</span> ${team.repo.pinnedNote}</p>` : ''}
        <div class="grid-2">
          <${Field} label="GitHub 저장소" id="adm-repo" hint="팀 대신 고칠 때만"><input id="adm-repo" class="input mono" value=${repoUrl} onInput=${(e) => setRepoUrl(e.target.value)} /><//>
          <${Field} label="서비스 주소" id="adm-svc"><input id="adm-svc" class="input mono" value=${serviceUrl} onInput=${(e) => setServiceUrl(e.target.value)} /><//>
        </div>
        <div class="btn-row">
          <button class="btn btn-sm" disabled=${busy} onClick=${saveRepo}>주소 저장</button>
          ${team.repo.url ? html`<button class="btn btn-sm" disabled=${busy} onClick=${() => call('adminRepoCheck', {}, '저장소를 다시 점검했습니다.')}>저장소 점검</button>
            <a class="btn btn-sm btn-ghost" href=${team.repo.url} target="_blank" rel="noopener">GitHub 열기</a>` : ''}
        </div>
      </section>

      ${team.status === 'selected' ? html`<section class="panel">
        <div class="panel-h"><h2>코드 심사(50)</h2><span class="small muted">${team.code.total === null ? '미입력' : `${team.code.total}점`}</span></div>
        <div class="grid-4">
          ${data.rubric.code.map((c) => html`<${Field} label=${`${c.label} (${c.max})`} id=${`adm-${c.key}`}>
            <input id=${`adm-${c.key}`} class="input num" inputmode="numeric" value=${code[c.key]} onInput=${(e) => setCode((s) => ({ ...s, [c.key]: e.target.value.replace(/[^0-9]/g, '') }))} />
          <//>`)}
        </div>
        <${Field} label="근거" id="adm-codeNote"><textarea id="adm-codeNote" class="textarea" maxlength="1000" value=${code.codeNote} onInput=${(e) => setCode((s) => ({ ...s, codeNote: e.target.value }))}></textarea><//>
        <div><button class="btn btn-sm btn-primary" disabled=${busy} onClick=${() => call('adminCodeScore', Object.fromEntries(Object.entries(code).map(([k, v]) => [k, k === 'codeNote' ? v : v === '' ? '' : Number(v)])), '코드 심사 점수를 저장했습니다.')}>점수 저장</button></div>
        <div class="small muted">대면 심사: ${team.live.count}/${data.judges.length}명 채점${team.live.avg !== null ? ` · 평균 ${team.live.avg.toFixed(2)}점` : ''}
          ${team.live.byJudge.map((s) => html`<div>${judgeName[s.judgeId] || s.judgeId}: ${s.total}점 ${s.comment ? `— ${s.comment}` : ''}</div>`)}</div>
      </section>` : ''}

      <section class="danger">
        ${confirmDelete ? html`<div class="panel">
          <p style="margin:0">팀과 팀원 ${team.count}명의 정보를 모두 삭제합니다. 팀명 <b>${team.name}</b>을 입력하세요.</p>
          <input class="input" value=${typed} onInput=${(e) => setTyped(e.target.value)} aria-label="팀명 확인" />
          <div class="btn-row">
            <button class="btn btn-danger" disabled=${busy || typed.trim() !== team.name} onClick=${async () => {
              const ok = await call('adminDeleteTeam', { confirm: typed.trim() }, '팀을 삭제했습니다.');
              if (ok) onClose();
            }}>삭제</button>
            <button class="btn" onClick=${() => setConfirmDelete(false)}>취소</button>
          </div>
        </div>` : html`<div><button class="btn btn-sm btn-danger" onClick=${() => setConfirmDelete(true)}>팀 삭제</button></div>`}
      </section>
    </div>
  <//>`;
}

/* ───────────── 참가자 표 ───────────── */

function PeopleTab({ data, openTeam }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = [];
  data.teams.forEach((t) => t.members.forEach((m) => rows.push({ t, m })));
  const shown = rows.filter(({ t, m }) => (!status || t.status === status)
    && (!needle || [t.name, m.name, m.studentNo, m.deptName, m.phone, m.email].join(' ').toLowerCase().includes(needle)));
  return html`<div>
    <div class="toolbar">
      <div class="chips">
        <button class="chip" aria-pressed=${status === '' ? 'true' : 'false'} onClick=${() => setStatus('')}>전체 ${rows.length}</button>
        ${COLUMNS.map(([k, label]) => html`<button class="chip" aria-pressed=${status === k ? 'true' : 'false'} onClick=${() => setStatus(k)}>${label} ${rows.filter((r) => r.t.status === k).length}</button>`)}
      </div>
      <input class="input" type="search" placeholder="이름·학번·연락처 검색" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="검색" />
    </div>
    <div class="table-box"><table class="dtable">
      <thead><tr><th>상태</th><th>팀명</th><th>구분</th><th>학과</th><th>학번</th><th>성명</th><th>연락처</th><th>이메일</th><th>티셔츠</th><th>촬영</th><th>합류</th></tr></thead>
      <tbody>${shown.map(({ t, m }) => html`<tr>
        <td><${Status} status=${t.status} /></td>
        <td><button class="link-btn" onClick=${() => openTeam(t.id)}>${t.name}</button></td>
        <td>${m.role === 'leader' ? '팀장' : '팀원'}</td><td>${m.deptName}</td><td class="num">${m.studentNo}</td><td>${m.name}</td>
        <td class="num">${m.phone}</td><td>${m.email}</td><td>${m.shirt}</td><td>${m.agreeMedia ? '동의' : '-'}</td><td class="small">${fmtShort(m.joinedAt)}</td>
      </tr>`)}</tbody>
    </table></div>
    <p class="small muted">${shown.length}명 표시</p>
  </div>`;
}

/* ───────────── 심사 ───────────── */

function buildPrompt(data) {
  const selected = data.teams.filter((t) => t.status === 'selected').sort((a, b) => (Number(a.presentOrder) || 999) - (Number(b.presentOrder) || 999));
  const rubric = data.rubric.code.map((c) => `- ${c.label}(${c.max}점): ${c.desc}`).join('\n');
  const teams = selected.map((t, i) => `${i + 1}. teamId=${t.id} / 팀명=${t.name} / 저장소=${t.repo.url || '(미제출)'} / 기준 커밋=${t.repo.pinnedSha || '(기록 전 — 마감 커밋 기록 후 사용)'}`).join('\n');
  return `당신은 ${data.settings.eventName} 코드 심사위원입니다. 아래 모든 팀을 똑같은 기준으로 평가하세요.

[평가 규칙]
- 각 저장소를 내려받아 '기준 커밋'으로 체크아웃한 상태만 봅니다(git checkout <커밋>). 마감 이후 커밋은 반영하지 않습니다.
- 커밋 횟수는 점수에 반영하지 않습니다. API 키 등 비밀정보가 저장소에 있으면 코드 품질에서 감점합니다.
- README 필수 항목: 프로젝트 개요, 주요 기능, 기술 스택, 실행 방법, AI 활용 내역(사용 도구·주요 프롬프트), 팀원 역할.

[평가 항목 — 합계 50점, 정수]
${rubric}

[팀 목록]
${teams}

[출력] 설명 없이 JSON 배열만 출력합니다.
[{"teamId":"...","teamName":"...","tech":0,"ai":0,"quality":0,"docs":0,"note":"항목별 근거를 3줄 이내로"}]`;
}

function JudgingTab({ data, reload, openTeam }) {
  const { notify } = useApp();
  const [name, setName] = useState('');
  const [issued, setIssued] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, run] = useBusy();
  const selected = data.teams.filter((t) => t.status === 'selected').sort((a, b) => (Number(a.presentOrder) || 999) - (Number(b.presentOrder) || 999));
  const r = data.results;

  const call = (action, payload, done) => run(async () => {
    try {
      const res = await api(action, { token: token(), ...payload });
      if (done) notify(done);
      await reload();
      return res;
    } catch (err) {
      notify(err.message, 'err');
      return null;
    }
  });

  const addJudge = async (e) => {
    e.preventDefault();
    const res = await call('adminJudgeAdd', { name }, '심사위원을 추가했습니다.');
    if (res) { setIssued(res); setName(''); }
  };
  const pinned = (res) => notify(res.pins.length
    ? `마감 커밋 기록 ${res.pins.filter((p) => p.ok).length}/${res.pins.length}팀`
    : '새로 기록할 팀이 없습니다(모두 마감 시각에 기록됨).');
  const pin = () => run(async () => {
    try {
      pinned(await api('adminPin', { token: token() }));
    } catch (err) {
      if (err.code !== 'EARLY') { notify(err.message, 'err'); return; }
      if (!confirm('아직 제출 마감 전입니다. 지금의 최신 커밋을 임시로 기록할까요? 마감 시각에 자동으로 다시 기록합니다.')) return;
      try {
        pinned(await api('adminPin', { token: token(), force: true }));
      } catch (e) {
        notify(e.message, 'err');
      }
    }
    reload();
  });
  const fixPin = () => run(async () => {
    try {
      const res = await api('adminPinSchedule', { token: token() });
      const okay = res.deadlinePin.state === 'scheduled';
      notify(okay ? `마감 커밋 자동 기록을 ${fmtWhen(res.deadlinePin.at)}에 예약했습니다.` : '예약하지 못했습니다. 잠시 후 다시 시도해 주세요.', okay ? 'ok' : 'err');
    } catch (err) {
      notify(err.message, 'err');
    }
    reload();
  });
  const importBulk = () => run(async () => {
    let rows;
    try {
      const text = bulk.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
      rows = JSON.parse(text);
    } catch (e) {
      setBulkResult({ errors: ['JSON 형식이 아닙니다. 대괄호 [ ] 로 감싼 배열인지 확인하세요.'] });
      return;
    }
    try {
      const res = await api('adminCodeScoreBulk', { token: token(), rows });
      setBulkResult(res);
      notify(`${res.updated}팀 점수를 반영했습니다.`);
      reload();
    } catch (err) {
      setBulkResult({ errors: [err.message] });
    }
  });
  const [flags, setFlags] = useState({ scoringLocked: data.settings.scoringLocked === 'Y', resultsPublished: data.settings.resultsPublished === 'Y' });
  const toggle = async (key, value, done) => {
    setFlags((f) => ({ ...f, [key]: value }));
    const res = await call('adminSettings', { settings: { [key]: value } }, done);
    if (!res) setFlags((f) => ({ ...f, [key]: !value }));
  };

  return html`<div class="stack">
    <section class="panel">
      <div class="panel-h"><h2>심사위원</h2><span class="small muted">대면 심사 평균에는 지금 등록된 심사위원만 들어갑니다</span></div>
      <table class="dtable"><thead><tr><th>이름</th><th>채점</th><th>등록</th><th></th></tr></thead><tbody>
        ${data.judges.map((j) => html`<tr><td>${j.name}</td><td class="num">${j.scored}/${selected.length}</td><td class="small">${fmtShort(j.createdAt)}</td>
          <td class="nowrap"><button class="link-btn" onClick=${async () => { const res = await call('adminJudgeReset', { judgeId: j.id }, '코드를 다시 발급했습니다.'); if (res) setIssued(res); }}>코드 재발급</button>${' · '}<button class="link-btn" onClick=${() => { if (confirm(`${j.name} 심사위원을 삭제할까요? 입력한 점수는 평균에서 빠집니다.`)) call('adminJudgeRemove', { judgeId: j.id }, '삭제했습니다.'); }}>삭제</button></td></tr>`)}
      </tbody></table>
      <form class="btn-row" onSubmit=${addJudge}>
        <input class="input" style="max-width:260px" placeholder="심사위원 이름" value=${name} onInput=${(e) => setName(e.target.value)} aria-label="심사위원 이름" />
        <button class="btn btn-primary" type="submit" disabled=${busy || name.trim().length < 2}>추가하고 코드 받기</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-h"><h2>코드 심사(50)</h2>
        <div class="btn-row">
          <button class="btn btn-sm" disabled=${busy} onClick=${pin} title="마감 시각에 자동으로 기록합니다. 기록이 없는 팀만 지금 채웁니다.">마감 커밋 기록</button>
          <button class="btn btn-sm" onClick=${() => setShowPrompt(true)}>AI 심사 지시문</button>
          <button class="btn btn-sm" onClick=${() => { setBulk(''); setBulkResult(null); }}>점수 JSON 붙여넣기</button>
        </div>
      </div>
      <${PinSchedule} pin=${data.deadlinePin} busy=${busy} onFix=${fixPin} />
      <div class="table-box"><table class="dtable">
        <thead><tr><th>순서</th><th>팀</th><th>저장소</th><th>고정 커밋</th>${data.rubric.code.map((c) => html`<th>${c.label}</th>`)}<th>코드 합계</th><th>대면 평균</th></tr></thead>
        <tbody>${selected.map((t) => html`<tr>
          <td class="num">${t.presentOrder || '-'}</td>
          <td><button class="link-btn" onClick=${() => openTeam(t.id)}>${t.name}</button></td>
          <td>${t.repo.url ? html`<a href=${t.repo.url} target="_blank" rel="noopener">${t.repo.url.replace('https://github.com/', '')}</a>` : html`<span class="muted">미제출</span>`}</td>
          <td class="mono small">${t.repo.pinnedSha ? t.repo.pinnedSha.slice(0, 8) : '-'}</td>
          ${data.rubric.code.map((c) => html`<td class="num">${t.code[c.key] === null ? '-' : t.code[c.key]}</td>`)}
          <td class="num"><b>${t.code.total === null ? '-' : t.code.total}</b></td>
          <td class="num">${t.live.avg === null ? '-' : `${t.live.avg.toFixed(2)} (${t.live.count})`}</td>
        </tr>`)}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-h"><h2>최종 결과</h2>
        <div class="btn-row">
          <label class="check small"><input type="checkbox" checked=${flags.scoringLocked} onChange=${(e) => toggle('scoringLocked', e.target.checked, e.target.checked ? '심사를 마감했습니다.' : '심사를 다시 열었습니다.')} /><span>심사 마감</span></label>
          <label class="check small"><input type="checkbox" checked=${flags.resultsPublished} onChange=${(e) => toggle('resultsPublished', e.target.checked, e.target.checked ? '시상 결과를 공개했습니다.' : '시상 결과를 비공개로 돌렸습니다.')} /><span>시상 결과 공개</span></label>
        </div>
      </div>
      ${r.warnings.length ? html`<div class="notice warn">${r.warnings.map((w) => html`<div>${w}</div>`)}</div>` : r.rows.length ? html`<div class="notice ok">모든 심사가 끝났습니다.</div>` : ''}
      <div class="table-box"><table class="dtable">
        <thead><tr><th>순위</th><th>시상</th><th>팀</th><th>코드(50)</th><th>대면 평균(50)</th><th>심사위원</th><th>총점</th></tr></thead>
        <tbody>${r.rows.map((x) => html`<tr>
          <td class="num"><b>${x.rank || '-'}</b></td><td>${x.award ? html`<span class="award">${x.award}</span>` : ''}</td>
          <td>${x.name}</td><td class="num">${x.code === null ? '-' : x.code}</td><td class="num">${x.live === null ? '-' : x.live.toFixed(2)}</td>
          <td class="num">${x.liveCount}/${x.judgeCount}</td><td class="num"><b>${x.total === null ? '-' : x.total.toFixed(2)}</b></td>
        </tr>`)}</tbody>
      </table></div>
      <p class="small muted" style="margin:0">총점 = 코드 심사 + 대면 심사 평균. 같으면 대면 점수가 높은 팀이 위. 시상 수는 설정에서 바꿀 수 있습니다.</p>
    </section>

    ${issued ? html`<${Modal} title="심사위원 코드" onClose=${() => setIssued(null)}>
      <p><b>${issued.judge.name}</b> 심사위원에게 아래 코드를 전달하세요. 이 창을 닫으면 다시 볼 수 없습니다(필요하면 재발급).</p>
      <p class="codeline">${issued.code}</p>
      <div class="btn-row"><button class="btn btn-primary" onClick=${async () => notify((await copyText(`${location.origin}${location.pathname}#/judge  코드: ${issued.code}`)) ? '주소와 코드를 복사했습니다.' : '복사하지 못했습니다.')}>주소와 코드 복사</button></div>
    <//>` : ''}
    ${showPrompt ? html`<${Modal} title="AI 코드 심사 지시문" onClose=${() => setShowPrompt(false)} wide>
      <p class="small muted">Claude Code 등에 그대로 붙여 넣으면 모든 팀을 같은 기준으로 분석해 JSON을 돌려줍니다. 결과는 [점수 JSON 붙여넣기]로 반영하세요.</p>
      <pre class="prompt">${buildPrompt(data)}</pre>
      <div class="btn-row"><button class="btn btn-primary" onClick=${async () => notify((await copyText(buildPrompt(data))) ? '지시문을 복사했습니다.' : '복사하지 못했습니다.')}>복사</button></div>
    <//>` : ''}
    ${bulk !== null ? html`<${Modal} title="코드 심사 점수 붙여넣기" onClose=${() => setBulk(null)} wide>
      <p class="small muted">형식: [{"teamId" 또는 "teamName", "tech", "ai", "quality", "docs", "note"}] — 행마다 검사해 통과한 팀만 반영합니다.</p>
      <textarea class="textarea mono" style="min-height:220px" value=${bulk} onInput=${(e) => setBulk(e.target.value)}></textarea>
      ${bulkResult ? html`<div class=${`notice ${bulkResult.errors && bulkResult.errors.length ? 'warn' : 'ok'}`} style="margin-top:10px">
        ${bulkResult.updated !== undefined ? html`<div>${bulkResult.updated}팀 반영</div>` : ''}
        ${(bulkResult.errors || []).map((e) => html`<div>${e}</div>`)}
      </div>` : ''}
      <div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" disabled=${busy || !bulk.trim()} onClick=${importBulk}>반영</button></div>
    <//>` : ''}
    <p class="small muted">팀 이름을 누르면 상세 화면에서 코드 심사 점수를 한 팀씩 입력할 수도 있습니다.</p>
  </div>`;
}

/* ───────────── 설정 ───────────── */

const SETTING_GROUPS = [
  ['행사', [['eventName', '행사명', 'text'], ['eventPeriod', '행사 일시(표시용)', 'text'], ['venue', '장소', 'text']]],
  ['기간(한국 시각)', [['applyStart', '접수 시작', 'datetime'], ['applyEnd', '접수 마감', 'datetime'], ['submitOpen', '결과물 제출 시작', 'datetime'], ['submitDeadline', '결과물 제출 마감', 'datetime']]],
  ['인원', [['applicantCap', '접수 정원(명) — 4의 배수 권장', 'number'], ['selectTarget', '본선 진출 팀 수', 'number']]],
  ['시상 팀 수', [['awardGold', '금상', 'number'], ['awardSilver', '은상', 'number'], ['awardBronze', '동상', 'number']]],
  ['문의처', [['contactName', '문의처', 'text'], ['contactPhone', '전화', 'text'], ['contactEmail', '이메일', 'text']]],
];

/** 마감 커밋 자동 기록(마감 1초 뒤 트리거) 예약 상태. 예약이 빠졌으면 마감 시각의 커밋을 기록할 수 없으므로 크게 알린다. */
function PinSchedule({ pin, busy, onFix }) {
  if (pin.state === 'passed') return '';
  if (pin.state === 'scheduled') return html`<p class="small muted" style="margin:0">마감 커밋은 ${fmtWhen(pin.at)}에 자동으로 기록합니다.</p>`;
  return html`<div class="notice bad" role="alert"><b>마감 커밋 자동 기록이 예약되어 있지 않습니다.</b> 이대로면 마감 시각의 커밋을 기록하지 못합니다.
    <button type="button" class="link-btn" disabled=${busy} onClick=${onFix}>다시 예약</button></div>`;
}

/** 전체 파기 결과: 법적 파기 기록이라 사라지는 알림 대신 화면에 남긴다. 실패한 단계는 직접 할 일과 함께 보여 준다. */
function PurgeResult({ res }) {
  const f = res.files;
  const bad = !res.oldMirror.trashed || f.error || f.failed > 0;
  return html`<div class=${`notice ${bad ? 'bad' : 'ok'}`} role="status">
    <b>파기 완료: 팀 ${res.purged.teams}개, 참가자 ${res.purged.members}명.</b>
    <ul>
      <li>신청서 파일 ${f.trashed}개를 휴지통으로 보냈습니다.${f.error ? ' 신청서 폴더를 열지 못해 파일 정리를 못 했습니다 — 드라이브에서 폴더 안 파일을 직접 지워 주세요.' : f.failed ? ` ${f.failed}개는 보내지 못했습니다 — 드라이브에서 직접 지워 주세요.` : ''}</li>
      <li>${res.oldMirror.trashed ? '이전 보기용 사본은 휴지통으로 보내고 새 파일로 바꿨습니다.'
        : html`이전 보기용 사본을 휴지통으로 보내지 못했습니다 — <a href=${res.oldMirror.url} target="_blank" rel="noopener">이전 사본 열기</a> 후 직접 삭제해 주세요(개인정보가 남아 있습니다).`}</li>
      <li>${res.mirror}</li>
      <li>드라이브 휴지통을 비워야 파기가 끝납니다.</li>
    </ul>
  </div>`;
}

/** 새 참가 신청 디스코드 알림: 채널 웹후크 주소를 저장·확인·끈다. 주소 원문은 서버가 돌려주지 않는다(가린 값만). */
function DiscordPanel({ discord, reload }) {
  const { notify } = useApp();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const act = (payload, done) => run(async () => {
    try {
      await api('adminDiscord', { token: token(), ...payload });
      setError('');
      setUrl('');
      notify(done);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  });
  const last = discord.last;
  return html`<div class="stack">
    <p class="small muted" style="margin:0">팀장이 신청서를 제출(접수 완료)하면 디스코드 채널로 바로 알립니다. 참가현황에 공개되는 팀명·대표 학과·참가 주제·프로젝트명과 접수 수만 보내고, 팀원의 학번·이름·연락처는 보내지 않습니다. 디스코드가 잠시 안 되면 5분 안에 다시 보냅니다.</p>
    <p style="margin:0"><b>${discord.on ? '켜짐' : '꺼짐'}</b>${discord.on ? html` <span class="small muted mono">${discord.hint}</span>` : ''}
      ${last ? html` · <span class=${`small ${last.ok ? 'muted' : 'err'}`}>마지막 알림 ${fmtWhen(last.at)} ${last.ok ? '보냄' : `실패 — ${last.error}`}</span>` : ''}
      ${discord.waiting ? html` · <span class="small err">다시 보낼 알림 ${discord.waiting}건</span>` : ''}</p>
    <${Field} label=${discord.on ? '다른 채널로 바꾸기(웹후크 주소)' : '웹후크 주소'} id="set-discord" error=${error}
      hint="디스코드 채널 설정 → 연동 → 웹후크 → [웹후크 URL 복사]로 받은 주소">
      <input id="set-discord" class="input mono" type="password" autocomplete="off" placeholder="https://discord.com/api/webhooks/…" value=${url} onInput=${(e) => setUrl(e.target.value.trim())} />
    <//>
    <div class="btn-row">
      <button type="button" class="btn btn-sm btn-primary" disabled=${busy || !url} onClick=${() => act({ url }, '디스코드 알림을 켰습니다. [확인 메시지 보내기]로 채널을 확인하세요.')}>저장</button>
      <button type="button" class="btn btn-sm" disabled=${busy || !discord.on} onClick=${() => act({ test: true }, '확인 메시지를 보냈습니다. 디스코드 채널을 확인하세요.')}>확인 메시지 보내기</button>
      <button type="button" class="btn btn-sm btn-ghost" disabled=${busy || !discord.on} onClick=${() => { if (confirm('디스코드 알림을 끌까요?')) act({ clear: true }, '디스코드 알림을 껐습니다.'); }}>끄기</button>
    </div>
  </div>`;
}

function SettingsTab({ data, reload, onCodeChanged }) {
  const { notify, reloadConfig } = useApp();
  const s = data.settings;
  const [form, setForm] = useState({ ...s });
  const [disabled, setDisabled] = useState(new Set(String(s.disabledDepts || '').split(',').filter(Boolean)));
  const [errors, setErrors] = useState({});
  const [newCode, setNewCode] = useState('');
  const [purge, setPurge] = useState('');
  const [purged, setPurged] = useState(null);
  const [busy, run] = useBusy();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = (e) => {
    e.preventDefault();
    const patch = {};
    Object.keys(form).forEach((k) => { if (k !== 'disabledDepts' && form[k] !== s[k]) patch[k] = form[k]; });
    const dd = Array.from(disabled).sort().join(',');
    if (dd !== String(s.disabledDepts || '')) patch.disabledDepts = dd;
    if (!Object.keys(patch).length) { notify('바뀐 내용이 없습니다.'); return; }
    run(async () => {
      try {
        const res = await api('adminSettings', { token: token(), settings: patch });
        setErrors({});
        if (res.deadlinePin && res.deadlinePin.state !== 'scheduled' && res.deadlinePin.state !== 'passed') {
          notify('설정은 저장했지만 마감 커밋 자동 기록을 예약하지 못했습니다. [심사] 탭에서 [다시 예약]을 눌러 주세요.', 'err');
        } else {
          notify('설정을 저장했습니다.');
        }
        await reload();
        reloadConfig();
      } catch (err) {
        setErrors({ [err.field || '_form']: err.message });
      }
    });
  };
  const input = (k, label, type) => html`<${Field} label=${label} id=${`set-${k}`} error=${errors[k]}>
    ${type === 'datetime'
      ? html`<input id=${`set-${k}`} class="input num" type="datetime-local" value=${form[k]} onInput=${(e) => set(k, e.target.value)} />`
      : html`<input id=${`set-${k}`} class=${`input${type === 'number' ? ' num' : ''}`} inputmode=${type === 'number' ? 'numeric' : undefined} value=${form[k]} onInput=${(e) => set(k, e.target.value)} />`}
  <//>`;
  const yn = (k, label, hint) => html`<label class="check"><input type="checkbox" checked=${form[k] === 'Y'} onChange=${(e) => set(k, e.target.checked ? 'Y' : 'N')} /><span><b>${label}</b><div class="small muted">${hint}</div>${errors[k] ? html`<div class="err" role="alert">${errors[k]}</div>` : ''}</span></label>`;

  return html`<form class="form" onSubmit=${save}>
    ${SETTING_GROUPS.map(([title, fields]) => html`<fieldset class="fs">
      <div class="fs-h"><h2>${title}</h2></div>
      <div class="grid-3">${fields.map(([k, label, type]) => input(k, label, type))}</div>
    </fieldset>`)}

    <fieldset class="fs">
      <div class="fs-h"><h2>의무 교육</h2><p>고정 문구는 바꿀 수 없습니다</p></div>
      <div class="mustread"><span class="label-red">필독</span><div><strong>${data.trainingNotice}</strong></div></div>
      <${Field} label="교육 일시·장소 안내(고정 문구 아래에 표시)" id="set-trainingDetail" error=${errors.trainingDetail}>
        <input id="set-trainingDetail" class="input" value=${form.trainingDetail} onInput=${(e) => set('trainingDetail', e.target.value)} />
      <//>
    </fieldset>

    <fieldset class="fs">
      <div class="fs-h"><h2>공개와 게시판</h2></div>
      ${yn('selectionPublished', '본선 진출 발표', '켜면 참가자 화면과 참가현황에 본선 진출·예비가 보입니다. 미선발 팀은 게시판에 나오지 않습니다.')}
      ${yn('resultsPublished', '시상 결과 공개', '켜면 참가현황 맨 위에 수상 팀이 나옵니다.')}
      <label class="check"><input type="checkbox" checked=${form.boardMode === 'contest'} onChange=${(e) => set('boardMode', e.target.checked ? 'contest' : 'recruit')} />
        <span><b>대회 모드</b><div class="small muted">참가현황을 본선 팀의 '개발 중 → 결과물 제출' 칸반으로 바꿉니다(대회 당일, 본선 진출 발표 뒤에만).</div>${errors.boardMode ? html`<div class="err" role="alert">${errors.boardMode}</div>` : ''}</span></label>
    </fieldset>

    <fieldset class="fs">
      <div class="fs-h"><h2>개인정보 고지</h2><p>동의 화면에 그대로 나옵니다</p></div>
      <${Field} label="보유·이용 기간" id="set-retention" error=${errors.retention}><textarea id="set-retention" class="textarea" value=${form.retention} onInput=${(e) => set('retention', e.target.value)}></textarea><//>
      <${Field} label="처리 위탁" id="set-processor" error=${errors.processor}><textarea id="set-processor" class="textarea" value=${form.processor} onInput=${(e) => set('processor', e.target.value)}></textarea><//>
    </fieldset>

    <fieldset class="fs">
      <div class="fs-h"><h2>신청 가능 학과</h2><p>NDS 기준 ${data.departments.length}개 · ${data.departmentsAsOf} · 체크 해제하면 선택 목록에서 빠집니다</p></div>
      ${errors.disabledDepts ? html`<div class="err">${errors.disabledDepts}</div>` : ''}
      <div class="deptlist">
        ${groupBySeries(data.departments).map((g) => html`<div>
          <h4>${g.series}</h4>
          ${g.items.map((d) => html`<label><input type="checkbox" checked=${!disabled.has(d.code)} onChange=${(e) => {
            const next = new Set(disabled);
            if (e.target.checked) next.delete(d.code); else next.add(d.code);
            setDisabled(next);
          }} />${d.name}</label>`)}
        </div>`)}
      </div>
    </fieldset>

    <div class="form-foot">
      <button class="btn btn-primary btn-lg" type="submit" disabled=${busy}>설정 저장</button>
      ${errors._form ? html`<span class="form-error">${errors._form}</span>` : html`<span class="small muted">저장한 값은 곧바로 모든 화면에 반영됩니다.</span>`}
    </div>

    <fieldset class="fs">
      <div class="fs-h"><h2>디스코드 알림</h2><p>새 참가 신청이 접수되면 알림</p></div>
      <${DiscordPanel} discord=${data.discord} reload=${reload} />
    </fieldset>

    <fieldset class="fs">
      <div class="fs-h"><h2>보안</h2></div>
      <div class="grid-2">
        <div class="panel">
          <b>관리자 코드 바꾸기</b>
          <p class="small muted" style="margin:0">새 코드를 만들면 기존 코드와 다른 관리자 로그인은 모두 끊깁니다. 새 코드가 화면에 나오기 전에 창을 닫지 마세요. 코드를 잃어버렸으면 Apps Script 편집기에서 resetAdminCode 를 실행하면 실행 로그에 새 코드가 나옵니다.</p>
          ${newCode ? html`<p class="codeline">${newCode}</p><p class="small">이 코드를 안전한 곳에 적어 두세요. 다시 볼 수 없습니다.</p>` : ''}
          <div><button type="button" class="btn" disabled=${busy} onClick=${() => { if (confirm('관리자 코드를 새로 만들까요?')) run(async () => {
            try { const res = await api('adminCode', { token: token() }); session.set('admin', res.token); setNewCode(res.code); onCodeChanged(); } catch (err) { notify(err.message, 'err'); }
          }); }}>새 관리자 코드 만들기</button></div>
        </div>
        <div class="panel">
          <b>저장 공간</b>
          <div class="storage">
            <div class="bar"><span class=${data.storage.bytes / data.storage.limit > 0.8 ? 'high' : ''} style=${`width:${Math.min(100, (data.storage.bytes / data.storage.limit) * 100).toFixed(1)}%`}></span></div>
            <span class="small muted num">${Math.round(data.storage.bytes / 1024)}KB / ${Math.round(data.storage.limit / 1024)}KB 사용. 80%를 넘으면 장난으로 만든 '팀 구성 중' 팀을 정리하세요.</span>
          </div>
        </div>
      </div>
      <div class="btn-row">
        <span class="small muted">소유자 계정으로만 열립니다 — 보기용 스프레드시트 사본(5분마다 자동 갱신, 고쳐도 원본에는 반영되지 않음): <a href=${data.sheetUrl} target="_blank" rel="noopener">열기</a> · 신청서 파일 폴더: <a href=${data.formFolderUrl} target="_blank" rel="noopener">열기</a> · 감사 기록(로그인·내려받기·상태 변경, 파기 대상 아님): <a href=${data.auditUrl} target="_blank" rel="noopener">열기</a>.</span>
        <button type="button" class="btn btn-sm" disabled=${busy} onClick=${() => run(async () => {
          try { const res = await api('adminSync', { token: token() }); notify(res.message); } catch (err) { notify(err.message, 'err'); }
        })}>지금 갱신</button>
      </div>
    </fieldset>

    <fieldset class="fs">
      <div class="fs-h"><h2>개인정보 파기</h2><p>보유 기간이 끝나면 실행합니다</p></div>
      <p class="small" style="margin:0">팀·참가자·점수·심사위원 정보를 모두 지웁니다. 신청서 폴더의 파일과 보기용 스프레드시트 사본 파일은 드라이브 휴지통으로 보내고 사본은 새로 만듭니다('버전 기록'까지 지우기 위해). 되돌릴 수 없으니 먼저 [엑셀로 저장]으로 보관할 자료를 받아 두세요. 파기를 끝내려면 드라이브 휴지통을 비우세요. 확인 문구 <b>전체 파기</b>를 입력합니다.</p>
      <div class="linkrow" style="max-width:420px"><input class="input" value=${purge} onInput=${(e) => setPurge(e.target.value)} aria-label="확인 문구" />
        <button type="button" class="btn btn-danger" disabled=${busy || purge !== '전체 파기'} onClick=${() => run(async () => {
          try { const res = await api('adminPurge', { token: token(), confirm: purge }); setPurged(res); setPurge(''); reload(); } catch (err) { notify(err.message, 'err'); }
        })}>전체 파기</button></div>
      ${purged ? html`<${PurgeResult} res=${purged} />` : ''}
    </fieldset>
  </form>`;
}

/* ───────────── 관리자 화면 ───────────── */

export function AdminView() {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [state, setState] = useState(session.get('admin') ? 'loading' : 'login');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('kanban');
  const [openId, setOpenId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [paper, setPaper] = useState(false);

  const load = async () => {
    try {
      const res = await api('adminBoard', { token: token() });
      setData(res);
      setState('ready');
    } catch (err) {
      setMessage(err.message);
      if (err.code === 'AUTH') {
        session.clear('admin');
        setState('login');
      } else if (data) {
        notify(err.message, 'err');
      } else {
        setState('failed');
      }
    }
  };
  useEffect(() => { if (state === 'loading') load(); }, [state]);

  if (state === 'login') return html`<${AdminLogin} message=${message} onDone=${() => { setMessage(''); setState('loading'); }} />`;
  if (state === 'failed' && !data) return html`<${LoadFailed} message=${message} retry=${() => setState('loading')} />`;
  if (!data) return html`<div class="wrap page"><p class="muted">불러오는 중…</p></div>`;

  const ph = data.phase;
  const team = data.teams.find((t) => t.id === openId);
  const excel = async () => {
    setExporting(true);
    try {
      const res = await downloadExcel();
      notify(`엑셀 파일을 만들었습니다: ${res.filename}`);
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setExporting(false);
    }
  };

  return html`<div class="wrap-wide page">
    <div class="page-h">
      <div>
        <h1>관리자</h1>
        <p class="num">접수 <b>${ph.appliedTeams}팀</b>(${ph.applicants}명 / 정원 ${ph.applicantCap}명) · 본선 진출 <b>${ph.selectedTeams}/${ph.selectTarget}팀</b> · 팀 구성 중 ${ph.formingTeams}팀 · 접수 ${ph.apply === 'open' ? '진행 중' : ph.apply === 'full' ? '정원 마감' : ph.apply === 'before' ? '시작 전' : '마감'}</p>
      </div>
      <div class="btn-row">
        <button class="btn" onClick=${() => setPaper(true)}>서면 신청 입력</button>
        <button class="btn btn-primary" onClick=${excel} disabled=${exporting}>${exporting ? '만드는 중…' : '엑셀로 저장'}</button>
        <button class="btn" onClick=${load}>새로 고침</button>
        <button class="btn btn-ghost" onClick=${() => { session.clear('admin'); setData(null); setState('login'); }}>로그아웃</button>
      </div>
    </div>
    <div class="tabs" role="tablist">
      ${[['kanban', '칸반'], ['people', '참가자'], ['prelim', '예선'], ['judging', '심사'], ['settings', '설정']].map(([k, label]) => html`<button role="tab" aria-selected=${tab === k ? 'true' : 'false'} onClick=${() => setTab(k)}>${label}</button>`)}
    </div>
    ${tab === 'kanban' ? html`<${KanbanTab} data=${data} reload=${load} openTeam=${setOpenId} />` : ''}
    ${tab === 'people' ? html`<${PeopleTab} data=${data} openTeam=${setOpenId} />` : ''}
    ${tab === 'prelim' ? html`<${PrelimTab} reload=${load} />` : ''}
    ${tab === 'judging' ? html`<${JudgingTab} data=${data} reload=${load} openTeam=${setOpenId} />` : ''}
    ${tab === 'settings' ? html`<${SettingsTab} key=${JSON.stringify(data.settings)} data=${data} reload=${load} onCodeChanged=${() => notify('관리자 코드를 바꿨습니다.')} />` : ''}
    ${team ? html`<${TeamDrawer} key=${team.id + team.updatedAt} team=${team} data=${data} reload=${load} onClose=${() => setOpenId('')} />` : ''}
    ${paper ? html`<${PaperApplication} data=${data} onClose=${() => setPaper(false)} onDone=${async (id) => { setPaper(false); await load(); setOpenId(id); }} />` : ''}
  </div>`;
}
