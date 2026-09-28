// 관리자: 개인정보 원문을 보는 유일한 화면. 칸반(끌어서 상태 변경)·참가자·심사·설정·엑셀.
import {
  html, useState, useEffect, useApp, api, session, fmtWhen, fmtShort, copyText, groupBySeries, STATUS_LABEL, josaRo,
} from '../lib.js';
import { Field, Modal, Slots, Status, useBusy } from '../ui.js';

const COLUMNS = [
  ['draft', '팀 구성 중'],
  ['submitted', '접수 완료'],
  ['selected', '선정'],
  ['waitlist', '예비'],
  ['rejected', '미선정'],
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
      ${short ? html`<span class="flag">${t.count}/4명 충원 필요</span>` : html`<span class="num">${t.count}/4명</span>`}
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
    <p class="small muted" style="margin:-4px 0 12px">카드를 끌어 다른 칸에 놓으면 상태가 바뀝니다. 휴대기기에서는 카드를 눌러 상태를 고르세요. 선정 결과는 [설정 → 선정 결과 공개]를 켜야 참가자에게 보입니다.</p>
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
  const [busy, run] = useBusy();
  const judgeName = Object.fromEntries(data.judges.map((j) => [j.id, j.name]));

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
            <td class="small nowrap">${fmtShort(m.agreePrivacyAt)}</td>
            <td><button class="link-btn" disabled=${busy} onClick=${() => { if (confirm(`${m.name} 님의 신청 정보를 삭제할까요?`)) call('adminMemberRemove', { key: m.key }, '참가자를 삭제했습니다.'); }}>삭제</button></td>
          </tr>`)}</tbody>
        </table></div>
      </section>

      <section class="panel">
        <div class="panel-h"><h2>신청 내용</h2><span class="small muted">생성 ${fmtWhen(team.createdAt)}${team.submittedAt ? ` · 접수 ${fmtWhen(team.submittedAt)}` : ''}</span></div>
        <dl class="kv">
          <dt>대표 학과</dt><dd>${team.repDept.name} · ${team.repDept.series}</dd>
          <dt>참가 주제(안)</dt><dd>${team.topic}</dd>
          <dt>프로젝트명(안)</dt><dd>${team.projectName}</dd>
          <dt>프로젝트 개요</dt><dd>${team.summary}</dd>
          <dt>AI 도구</dt><dd>${team.aiTools}</dd>
          <dt>참가 동기</dt><dd>${team.motivation}</dd>
        </dl>
      </section>

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
          <button class="btn btn-sm" disabled=${busy} onClick=${() => call('adminTeam', { patch: { repoUrl, serviceUrl } }, '결과물 주소를 저장했습니다.')}>주소 저장</button>
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
  const teams = selected.map((t, i) => `${i + 1}. teamId=${t.id} / 팀명=${t.name} / 저장소=${t.repo.url || '(미제출)'} / 기준 커밋=${t.repo.pinnedSha || '(미고정 — 마감 커밋 고정 후 사용)'}`).join('\n');
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
  const pin = async () => {
    try {
      const res = await api('adminPin', { token: token() });
      notify(`커밋 고정 ${res.pins.filter((p) => p.ok).length}/${res.pins.length}팀`);
      reload();
    } catch (err) {
      if (err.code === 'EARLY' && confirm('아직 제출 마감 전입니다. 지금 시각까지의 커밋으로 고정할까요? 마감 후 다시 고정할 수 있습니다.')) {
        const res = await api('adminPin', { token: token(), force: true });
        notify(`커밋 고정 ${res.pins.filter((p) => p.ok).length}/${res.pins.length}팀`);
        reload();
      } else if (err.code !== 'EARLY') notify(err.message, 'err');
    }
  };
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
          <button class="btn btn-sm" onClick=${pin}>마감 커밋 고정</button>
          <button class="btn btn-sm" onClick=${() => setShowPrompt(true)}>AI 심사 지시문</button>
          <button class="btn btn-sm" onClick=${() => { setBulk(''); setBulkResult(null); }}>점수 JSON 붙여넣기</button>
        </div>
      </div>
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
  ['인원', [['applicantCap', '접수 정원(명) — 4의 배수 권장', 'number'], ['selectTarget', '선발 팀 수', 'number']]],
  ['시상 팀 수', [['awardGold', '금상', 'number'], ['awardSilver', '은상', 'number'], ['awardBronze', '동상', 'number']]],
  ['문의처', [['contactName', '문의처', 'text'], ['contactPhone', '전화', 'text'], ['contactEmail', '이메일', 'text']]],
];

function SettingsTab({ data, reload, onCodeChanged }) {
  const { notify, reloadConfig } = useApp();
  const s = data.settings;
  const [form, setForm] = useState({ ...s });
  const [disabled, setDisabled] = useState(new Set(String(s.disabledDepts || '').split(',').filter(Boolean)));
  const [errors, setErrors] = useState({});
  const [newCode, setNewCode] = useState('');
  const [purge, setPurge] = useState('');
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
        await api('adminSettings', { token: token(), settings: patch });
        setErrors({});
        notify('설정을 저장했습니다.');
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
  const yn = (k, label, hint) => html`<label class="check"><input type="checkbox" checked=${form[k] === 'Y'} onChange=${(e) => set(k, e.target.checked ? 'Y' : 'N')} /><span><b>${label}</b><div class="small muted">${hint}</div></span></label>`;

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
      ${yn('selectionPublished', '선정 결과 공개', '켜면 참가자 화면과 참가현황에 선정·예비가 보입니다. 미선정 팀은 게시판에 나오지 않습니다.')}
      ${yn('resultsPublished', '시상 결과 공개', '켜면 참가현황 맨 위에 수상 팀이 나옵니다.')}
      <label class="check"><input type="checkbox" checked=${form.boardMode === 'contest'} onChange=${(e) => set('boardMode', e.target.checked ? 'contest' : 'recruit')} />
        <span><b>대회 모드</b><div class="small muted">참가현황을 본선 팀의 '개발 중 → 결과물 제출' 칸반으로 바꿉니다(대회 당일).</div></span></label>
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
      <div class="fs-h"><h2>보안</h2></div>
      <div class="grid-2">
        <div class="panel">
          <b>관리자 코드 바꾸기</b>
          <p class="small muted" style="margin:0">새 코드를 만들면 기존 코드와 다른 관리자 로그인은 모두 끊깁니다. 새 코드가 화면에 나오기 전에 창을 닫지 마세요.</p>
          ${newCode ? html`<p class="codeline">${newCode}</p><p class="small">이 코드를 안전한 곳에 적어 두세요. 다시 볼 수 없습니다.</p>` : ''}
          <div><button type="button" class="btn" disabled=${busy} onClick=${() => { if (confirm('관리자 코드를 새로 만들까요?')) run(async () => {
            try { const res = await api('adminCode', { token: token() }); session.set('admin', res.token); setNewCode(res.code); onCodeChanged(); } catch (err) { notify(err.message, 'err'); }
          }); }}>새 관리자 코드 만들기</button></div>
        </div>
      </div>
      <div class="btn-row">
        <span class="small muted">보기용 구글 스프레드시트 사본(5분마다 자동 갱신, 소유자 계정으로만 열림): <a href=${data.sheetUrl} target="_blank" rel="noopener">열기</a>. 시트를 고쳐도 원본에는 반영되지 않습니다.</span>
        <button type="button" class="btn btn-sm" disabled=${busy} onClick=${() => run(async () => {
          try { const res = await api('adminSync', { token: token() }); notify(res.message); } catch (err) { notify(err.message, 'err'); }
        })}>지금 갱신</button>
      </div>
    </fieldset>

    <fieldset class="fs">
      <div class="fs-h"><h2>개인정보 파기</h2><p>보유 기간이 끝나면 실행합니다</p></div>
      <p class="small" style="margin:0">팀·참가자·점수·심사위원 정보를 모두 지우고 스프레드시트 사본도 비웁니다. 되돌릴 수 없으니 먼저 [엑셀로 저장]으로 보관할 자료를 받아 두세요. 구글 시트는 '버전 기록'에 이전 내용이 남으므로, 보유 기간이 끝나 파기할 때는 사본 파일도 드라이브에서 삭제(휴지통 비우기 포함)하세요. 확인 문구 <b>전체 파기</b>를 입력합니다.</p>
      <div class="linkrow" style="max-width:420px"><input class="input" value=${purge} onInput=${(e) => setPurge(e.target.value)} aria-label="확인 문구" />
        <button type="button" class="btn btn-danger" disabled=${busy || purge !== '전체 파기'} onClick=${() => run(async () => {
          try { const res = await api('adminPurge', { token: token(), confirm: purge }); notify(`파기 완료: 팀 ${res.purged.teams}개, 참가자 ${res.purged.members}명 · 스프레드시트 사본도 비웠습니다.`); setPurge(''); reload(); } catch (err) { notify(err.message, 'err'); }
        })}>전체 파기</button></div>
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

  const load = async () => {
    try {
      const res = await api('adminBoard', { token: token() });
      setData(res);
      setState('ready');
    } catch (err) {
      if (err.code === 'AUTH') {
        session.clear('admin');
        setMessage(err.message);
        setState('login');
      } else {
        notify(err.message, 'err');
      }
    }
  };
  useEffect(() => { if (state === 'loading') load(); }, [state]);

  if (state === 'login') return html`<${AdminLogin} message=${message} onDone=${() => { setMessage(''); setState('loading'); }} />`;
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
        <p class="num">접수 <b>${ph.appliedTeams}팀</b>(${ph.applicants}명 / 정원 ${ph.applicantCap}명) · 선정 <b>${ph.selectedTeams}/${ph.selectTarget}팀</b> · 팀 구성 중 ${ph.formingTeams}팀 · 접수 ${ph.apply === 'open' ? '진행 중' : ph.apply === 'full' ? '정원 마감' : ph.apply === 'before' ? '시작 전' : '마감'}</p>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onClick=${excel} disabled=${exporting}>${exporting ? '만드는 중…' : '엑셀로 저장'}</button>
        <button class="btn" onClick=${load}>새로 고침</button>
        <button class="btn btn-ghost" onClick=${() => { session.clear('admin'); setData(null); setState('login'); }}>로그아웃</button>
      </div>
    </div>
    <div class="tabs" role="tablist">
      ${[['kanban', '칸반'], ['people', '참가자'], ['judging', '심사'], ['settings', '설정']].map(([k, label]) => html`<button role="tab" aria-selected=${tab === k ? 'true' : 'false'} onClick=${() => setTab(k)}>${label}</button>`)}
    </div>
    ${tab === 'kanban' ? html`<${KanbanTab} data=${data} reload=${load} openTeam=${setOpenId} />` : ''}
    ${tab === 'people' ? html`<${PeopleTab} data=${data} openTeam=${setOpenId} />` : ''}
    ${tab === 'judging' ? html`<${JudgingTab} data=${data} reload=${load} openTeam=${setOpenId} />` : ''}
    ${tab === 'settings' ? html`<${SettingsTab} key=${JSON.stringify(data.settings)} data=${data} reload=${load} onCodeChanged=${() => notify('관리자 코드를 바꿨습니다.')} />` : ''}
    ${team ? html`<${TeamDrawer} key=${team.id + team.updatedAt} team=${team} data=${data} reload=${load} onClose=${() => setOpenId('')} />` : ''}
  </div>`;
}
