// 팀 만들기(팀장)와 초대 링크로 합류(팀원). 각자 본인 정보만 입력하고 본인이 동의한다.
import {
  html, useState, useEffect, useApp, api, session, go, digits, copyText, inviteLink, josa,
} from '../lib.js';
import {
  Field, DeptSelect, MemberFields, ConsentFields, Slots, Veil, useBusy,
  emptyMember, checkMember, emptyAgree, checkAgree, serverErrors, focusFirstError,
} from '../ui.js';

const AI_TOOLS = ['Claude Code', 'Codex', 'ChatGPT', 'Gemini', 'Cursor', 'GitHub Copilot'];

/**
 * 응답을 못 받고 다시 보낸 요청이 '이미 있음'(학번 중복)이나 '자리 없음'(4번째 합류가 이미 반영됨)으로 거절되면,
 * 첫 요청이 실제로 반영됐는지 방금 입력한 학번·비밀번호로 로그인해 확인한다(맞으면 성공으로 이어 간다).
 */
async function recoverAfterAmbiguous(err, me, matches) {
  if (!err.ambiguous || !['DUPLICATE', 'CLOSED'].includes(err.code)) return null;
  try {
    const res = await api('login', { studentNo: digits(me.studentNo), pin: me.pin });
    return matches(res.view) ? res : null;
  } catch (e) {
    return null;
  }
}

/** 팀 항목 규칙은 서버가 준다(config.teamFields: { 항목: [라벨, 최소, 최대] }). */
export function checkTeam(t, rules) {
  const e = {};
  Object.entries(rules).forEach(([k, [label, min, max]]) => {
    const v = String(t[k] || '').trim();
    if (!v) e[`team.${k}`] = `${label}${josa(label, '을', '를')} 입력해 주세요.`;
    else if (v.length < min) e[`team.${k}`] = `${min}자 이상 입력해 주세요.`;
    else if (v.length > max) e[`team.${k}`] = `${max}자 이내로 줄여 주세요.`;
  });
  if (!t.repDept) e['team.repDept'] = '대표 학과를 고르세요.';
  return e;
}

export function TeamFields({ t, set, errors, config }) {
  const rules = config.teamFields;
  const max = (k) => rules[k][2];
  const err = (k) => errors[`team.${k}`];
  const count = (k) => html`<span class="counter">${String(t[k] || '').length}/${max(k)}</span>`;
  const toggleTool = (tool) => {
    const list = String(t.aiTools || '').split(',').map((s) => s.trim()).filter(Boolean);
    const next = list.includes(tool) ? list.filter((x) => x !== tool) : list.concat(tool);
    set('aiTools', next.join(', '));
  };
  const tools = String(t.aiTools || '').split(',').map((s) => s.trim());
  return html`<div class="grid-2">
    <${Field} label="팀명" id="team-name" required error=${err('name')} hint=${`${rules.name[1]}~${max('name')}자. 다른 팀과 겹칠 수 없습니다.`}>
      <input id="team-name" class="input" maxlength=${max('name')} value=${t.name} onInput=${(e) => set('name', e.target.value)} />
    <//>
    <${Field} label="대표 학과(추천 학과)" id="team-repDept" required error=${err('repDept')} hint="팀을 추천하는 학과. 보통 팀장 학과입니다.">
      <${DeptSelect} id="team-repDept" value=${t.repDept} departments=${config.departments} onChange=${(v) => set('repDept', v)} />
    <//>
    <${Field} label="참가 주제(안)" id="team-topic" required error=${err('topic')} hint="예: 우리 학과 실습 일정 관리의 불편 해결">
      <input id="team-topic" class="input" maxlength=${max('topic')} value=${t.topic} onInput=${(e) => set('topic', e.target.value)} />
    <//>
    <${Field} label="프로젝트명(안)" id="team-projectName" required error=${err('projectName')}>
      <input id="team-projectName" class="input" maxlength=${max('projectName')} value=${t.projectName} onInput=${(e) => set('projectName', e.target.value)} />
    <//>
    <${Field} label="프로젝트 개요" id="team-summary" required error=${err('summary')} cls="span-2" hint="해결하려는 문제나 아이디어를 적어 주세요.">
      <textarea id="team-summary" class="textarea" maxlength=${max('summary')} value=${t.summary} onInput=${(e) => set('summary', e.target.value)}></textarea>
      ${count('summary')}
    <//>
    <${Field} label="활용 예정 AI 도구" id="team-aiTools" required error=${err('aiTools')} cls="span-2">
      <input id="team-aiTools" class="input" maxlength=${max('aiTools')} value=${t.aiTools} onInput=${(e) => set('aiTools', e.target.value)} placeholder="눌러서 고르거나 직접 적어 주세요" />
      <div class="chips">${AI_TOOLS.map((tool) => html`<button type="button" class="chip" aria-pressed=${tools.includes(tool) ? 'true' : 'false'} onClick=${() => toggleTool(tool)}>${tool}</button>`)}</div>
    <//>
    <${Field} label="참가 동기 및 기대사항" id="team-motivation" required error=${err('motivation')} cls="span-2">
      <textarea id="team-motivation" class="textarea" maxlength=${max('motivation')} value=${t.motivation} onInput=${(e) => set('motivation', e.target.value)}></textarea>
      ${count('motivation')}
    <//>
  </div>`;
}

/** onRotate(팀장 「내 신청」에서만): 초대 코드를 새로 만들어 지금 링크를 쓸 수 없게 한다. */
export function InviteBox({ team, onRotate }) {
  const { config, notify } = useApp();
  const need = config.teamSize - team.count;
  const link = inviteLink(team.id, team.inviteCode);
  const manual = `${team.id}-${team.inviteCode}`;
  const message = `[DIT 바이브코딩 해커톤] '${team.name}' 팀 초대\n아래 링크를 열고 본인 정보를 입력해 합류해 주세요. (본인만 입력·동의)\n${link}`;
  const copy = async (text, what) => notify((await copyText(text)) ? `${what}을 복사했습니다.` : '복사하지 못했습니다. 직접 선택해 복사해 주세요.', 'ok');
  return html`<div class="invite">
    <div>
      <h3>팀원 초대</h3>
      <p class="small muted" style="margin:4px 0 0">팀원 ${need}명에게 이 링크를 보내세요. 팀원이 각자 본인 정보를 입력하고 동의해야 합류됩니다.</p>
    </div>
    <div class="linkrow">
      <input class="input" readonly value=${link} aria-label="초대 링크" onFocus=${(e) => e.target.select()} />
      <button type="button" class="btn btn-primary" onClick=${() => copy(link, '초대 링크')}>링크 복사</button>
    </div>
    <div class="btn-row" style="justify-content:space-between">
      <div><span class="small muted">초대 코드 </span><span class="code-big">${manual}</span></div>
      <button type="button" class="btn btn-sm" onClick=${() => copy(message, '보낼 문구')}>카톡용 문구 복사</button>
    </div>
    ${onRotate ? html`<p class="small muted" style="margin:0">링크가 모르는 사람에게 퍼졌다면 <button type="button" class="link-btn" onClick=${onRotate}>새 링크 만들기</button> — 지금 링크로는 더 이상 합류할 수 없게 됩니다.</p>` : ''}
  </div>`;
}

function Closed({ phase }) {
  const text = phase.apply === 'before' ? '아직 접수 기간이 아닙니다.'
    : phase.apply === 'full' ? `접수 정원(${phase.applicantCap}명)이 모두 찼습니다.` : '접수 기간이 끝났습니다.';
  return html`<div class="notice warn"><b>${text}</b> 이미 만든 팀은 <a href="#/me">내 신청</a>에서 확인할 수 있습니다.</div>`;
}

function AlreadySignedIn() {
  const [on, setOn] = useState(!!session.get('member'));
  if (!on) return null;
  return html`<div class="notice" style="margin-bottom:24px">
    이 기기에 이미 신청한 계정이 로그인되어 있습니다. 본인의 신청은 <a href="#/me">내 신청</a>에서 보세요.
    다른 사람이 신청하려면 <button class="link-btn" onClick=${() => { session.clear('member'); setOn(false); }}>로그아웃</button> 후 진행하세요.
  </div>`;
}

export function ApplyView() {
  const { config, reloadConfig } = useApp();
  const [team, setTeam] = useState({ name: '', repDept: '', topic: '', projectName: '', summary: '', aiTools: '', motivation: '' });
  const [me, setMe] = useState(emptyMember());
  const [agree, setAgree] = useState(emptyAgree());
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  const [created, setCreated] = useState(null);

  const setT = (k, v) => setTeam((t) => ({ ...t, [k]: v }));
  const setM = (k, v) => {
    setMe((m) => ({ ...m, [k]: v }));
    if (k === 'deptCode' && !team.repDept) setT('repDept', v);
  };

  if (created) {
    return html`<div class="wrap page">
      <div class="page-h"><div><p class="overline">팀 만들기 완료 · 1/4명</p><h1>${created.team.name}</h1>
        <p>아직 신청 전입니다. 팀원 3명이 합류하면 팀장이 「내 신청」에서 제출합니다.</p></div></div>
      <div class="two-col">
        <${InviteBox} team=${created.team} />
        <div class="panel">
          <div class="panel-h"><h2>남은 순서</h2></div>
          <${Slots} count=${created.team.count} />
          <ol class="bullets" style="padding:0">
            <li>팀원 3명이 초대 링크로 합류합니다(각자 본인 정보·동의).</li>
            <li>4명이 모이면 팀장이 <a href="#/me">내 신청</a>에서 [신청서 제출]을 누릅니다.</li>
            <li>참가 신청서(한글·PDF)는 입력한 내용으로 자동으로 만들어집니다. 따로 쓰거나 올릴 파일은 없습니다.</li>
            <li>로그인은 학번과 방금 정한 비밀번호로 합니다.</li>
          </ol>
          <a class="btn btn-primary" href="#/me">내 신청으로 가기</a>
        </div>
      </div>
    </div>`;
  }

  const submit = (ev) => {
    ev.preventDefault();
    const e = { ...checkTeam(team, config.teamFields), ...checkMember(me, { withPin: true }), ...checkAgree(agree, config.training.notice) };
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError();
      return;
    }
    run(async () => {
      try {
        const res = await api('teamCreate', {
          team,
          me: { ...me, studentNo: digits(me.studentNo), pin2: undefined },
          agree,
        });
        session.set('member', res.token);
        setCreated(res.view);
        reloadConfig();
        window.scrollTo(0, 0);
      } catch (err) {
        const wanted = team.name.trim().replace(/\s+/g, ' ');
        const done = await recoverAfterAmbiguous(err, me, (v) => v.me.role === 'leader' && v.team.name === wanted);
        if (done) {
          session.set('member', done.token);
          setCreated(done.view);
          window.scrollTo(0, 0);
          return;
        }
        setErrors(serverErrors(err));
        focusFirstError();
        if (err.code === 'FULL' || err.code === 'CLOSED') reloadConfig();
      }
    });
  };

  return html`<div class="wrap page">
    <div class="page-h">
      <div>
        <h1>팀 만들기</h1>
        <p>신청은 이 화면에서 온라인으로만 받습니다. 팀장이 먼저 팀을 만들고 팀원 3명에게 초대 링크를 보냅니다. <b>4명이 모두 합류해 각자 동의하면</b> 팀장이 제출합니다. 참가 신청서(한글·PDF)는 입력한 내용으로 자동으로 만들어집니다.</p>
      </div>
      <a class="btn btn-sm" href="#/join">초대 코드로 합류하기</a>
    </div>
    <${AlreadySignedIn} />
    ${config.phase.apply !== 'open' ? html`<${Closed} phase=${config.phase} />` : html`
    <form class="form" onSubmit=${submit} novalidate>
      <fieldset class="fs">
        <div class="fs-h"><h2><span class="step">1</span>팀 정보</h2><p>공지의 참가 신청서 항목</p></div>
        <${TeamFields} t=${team} set=${setT} errors=${errors} config=${config} />
      </fieldset>
      <fieldset class="fs">
        <div class="fs-h"><h2><span class="step">2</span>팀장 정보</h2><p>본인 정보만 입력합니다</p></div>
        <${MemberFields} m=${me} set=${setM} errors=${errors} config=${config} withPin />
      </fieldset>
      <fieldset class="fs">
        <div class="fs-h"><h2><span class="step">3</span>확인과 동의</h2><p>팀원도 합류할 때 각자 동의합니다</p></div>
        <${ConsentFields} agree=${agree} setAgree=${setAgree} errors=${errors} config=${config} />
      </fieldset>
      <div class="form-foot">
        <button class="btn btn-accent btn-lg" type="submit" disabled=${busy}>${busy ? '만드는 중…' : '팀 만들고 초대 링크 받기'}</button>
        ${errors._form ? html`<span class="form-error" role="alert">${errors._form}</span>` : html`<span class="small muted">팀을 만든 뒤에도 접수 마감 전까지 수정할 수 있습니다.</span>`}
      </div>
    </form>`}
  </div>`;
}

/* ───────────── 합류 ───────────── */

function ManualCode() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const m = /^\s*(T[0-9A-Z]{6})\s*-\s*([0-9A-Z]{8})\s*$/i.exec(code);
    if (!m) {
      setError('초대 코드는 T로 시작하는 7자리-8자리 형식입니다. (예: T4F7KQ2-X9MPA3WR)');
      return;
    }
    go(`#/join/${m[1].toUpperCase()}/${m[2].toUpperCase()}`);
  };
  return html`<form class="box" onSubmit=${submit} style="max-width:520px">
    <${Field} label="초대 코드" id="join-code" error=${error} hint="팀장에게 받은 링크를 열면 이 단계는 건너뜁니다.">
      <input id="join-code" class="input mono" autocomplete="off" placeholder="T4F7KQ2-X9MPA3WR" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} />
    <//>
    <div class="btn-row" style="margin-top:14px"><button class="btn btn-primary" type="submit">팀 확인</button></div>
  </form>`;
}

function TeamPreview({ team }) {
  return html`<div class="box box-ink">
    <p class="overline">합류할 팀</p>
    <h2 style="margin:4px 0 2px;font-size:24px">${team.name}</h2>
    <p class="muted" style="margin:0 0 14px">${team.projectName} · ${team.repDept.name}</p>
    <${Slots} count=${team.count} />
    <table class="members" style="margin-top:12px">
      <thead><tr><th>구분</th><th>학과</th><th>성명</th><th>학번</th></tr></thead>
      <tbody>
        ${team.members.map((m) => html`<tr>
          <td class="small">${m.role === 'leader' ? '팀장' : '팀원'}</td><td>${m.deptName}</td><td>${m.name}</td><td><${Veil} kind="studentNo" /></td>
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

export function JoinView({ route }) {
  const { config } = useApp();
  const [teamId, code] = route.params;
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [me, setMe] = useState(emptyMember());
  const [agree, setAgree] = useState(emptyAgree());
  const [errors, setErrors] = useState({});
  const [busy, run] = useBusy();
  const [joined, setJoined] = useState(null);

  useEffect(() => {
    setPreview(null);
    setLoadError('');
    if (!teamId || !code) return;
    api('invitePreview', { teamId, invite: code }).then(setPreview).catch((e) => setLoadError(e.message));
  }, [teamId, code]);

  const setM = (k, v) => setMe((m) => ({ ...m, [k]: v }));

  if (!teamId || !code) {
    return html`<div class="wrap page">
      <div class="page-h"><div><h1>팀 합류</h1><p>팀장에게 받은 초대 링크를 열거나 초대 코드를 입력하세요.</p></div></div>
      <${ManualCode} />
    </div>`;
  }

  if (joined) {
    const full = joined.team.count >= config.teamSize;
    return html`<div class="wrap page">
      <div class="page-h"><div><p class="overline">합류 완료 · ${joined.team.count}/${config.teamSize}명</p><h1>${joined.team.name}</h1>
        <p>${full ? '4명이 모두 모였습니다. 팀장에게 「내 신청」에서 신청서를 제출해 달라고 알려 주세요.' : `팀원 ${config.teamSize - joined.team.count}명이 더 합류해야 제출할 수 있습니다.`}</p></div></div>
      <div class="panel" style="max-width:560px">
        <${Slots} count=${joined.team.count} />
        <p class="small muted">내 정보는 학번과 방금 정한 비밀번호로 「내 신청」에서 확인·수정할 수 있습니다. 신청 철회는 접수 기간에만 직접 할 수 있고, 그 뒤에는 문의처로 연락해 주세요.</p>
        <a class="btn btn-primary" href="#/me" style="justify-self:start">내 신청으로 가기</a>
      </div>
    </div>`;
  }

  const submit = (ev) => {
    ev.preventDefault();
    const e = { ...checkMember(me, { withPin: true }), ...checkAgree(agree, config.training.notice) };
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError();
      return;
    }
    run(async () => {
      try {
        const res = await api('teamJoin', {
          teamId, invite: code, me: { ...me, studentNo: digits(me.studentNo), pin2: undefined }, agree,
        });
        session.set('member', res.token);
        setJoined(res.view);
        window.scrollTo(0, 0);
      } catch (err) {
        const done = await recoverAfterAmbiguous(err, me, (v) => v.team.id === teamId);
        if (done) {
          session.set('member', done.token);
          setJoined(done.view);
          window.scrollTo(0, 0);
          return;
        }
        setErrors(serverErrors(err));
        focusFirstError();
      }
    });
  };

  return html`<div class="wrap page">
    <div class="page-h"><div><h1>팀 합류</h1><p>본인 정보만 입력하고 본인이 직접 동의합니다.</p></div></div>
    <${AlreadySignedIn} />
    ${loadError ? html`<div class="notice bad"><b>${loadError}</b></div>` : !preview ? html`<p class="muted">팀을 확인하는 중…</p>` : html`
      <div class="two-col">
        <form class="form" onSubmit=${submit} novalidate>
          ${!preview.joinable ? html`<div class="notice warn"><b>합류할 수 없습니다.</b> ${preview.reason}</div>` : html`
            <fieldset class="fs">
              <div class="fs-h"><h2><span class="step">1</span>내 정보</h2><p>본인 정보만 입력합니다</p></div>
              <${MemberFields} m=${me} set=${setM} errors=${errors} config=${config} withPin />
            </fieldset>
            <fieldset class="fs">
              <div class="fs-h"><h2><span class="step">2</span>확인과 동의</h2></div>
              <${ConsentFields} agree=${agree} setAgree=${setAgree} errors=${errors} config=${config} />
            </fieldset>
            <div class="form-foot">
              <button class="btn btn-accent btn-lg" type="submit" disabled=${busy}>${busy ? '합류하는 중…' : `${preview.team.name} 팀에 합류`}</button>
              ${errors._form ? html`<span class="form-error" role="alert">${errors._form}</span>` : ''}
            </div>`}
        </form>
        <div class="aside-first"><${TeamPreview} team=${preview.team} /></div>
      </div>`}
  </div>`;
}
