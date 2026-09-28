// 화면 부품: 입력 칸, 학과 선택, 동의, 가림 표시, 대화상자, 4인 칸, 상태 표시.
import {
  html, useState, useEffect, useRef, groupBySeries, phoneMask, STATUS_LABEL, RX, digits,
} from './lib.js';

export function Field({ label, id, error, hint, required, optional, children, cls }) {
  return html`<div class=${`field${error ? ' bad' : ''}${cls ? ` ${cls}` : ''}`}>
    <label for=${id}>${label}${required ? html`<span class="req" aria-hidden="true">*</span>` : ''}${optional ? html`<span class="opt">선택</span>` : ''}</label>
    ${children}
    ${error ? html`<div class="err" role="alert">${error}</div>` : hint ? html`<div class="hint">${hint}</div>` : ''}
  </div>`;
}

export function DeptSelect({ id, value, onChange, departments, placeholder = '학과를 고르세요' }) {
  return html`<select id=${id} class="select" value=${value} onChange=${(e) => onChange(e.target.value)}>
    <option value="">${placeholder}</option>
    ${groupBySeries(departments).map((g) => html`<optgroup label=${g.series}>
      ${g.items.map((d) => html`<option value=${d.code}>${d.name}</option>`)}
    </optgroup>`)}
  </select>`;
}

export function Seg({ name, options, value, onChange }) {
  return html`<div class="seg" role="radiogroup" aria-label=${name}>
    ${options.map((o) => html`<label>
      <input type="radio" name=${name} value=${o} checked=${value === o} onChange=${() => onChange(o)} />
      <span>${o}</span>
    </label>`)}
  </div>`;
}

export function Consent({ id, required, title, rows, checked, onChange, error, children }) {
  return html`<div class=${`consent${error ? ' bad' : ''}`}>
    <label class="check consent-h" for=${id}>
      <input id=${id} type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} />
      <span>
        <span class=${required ? 'tag-req' : 'tag-opt'}>${required ? '[필수]' : '[선택]'}</span>
        <strong>${title}</strong>
        ${children}
      </span>
    </label>
    ${rows && rows.length ? html`<dl>${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>` : ''}
    ${error ? html`<div class="err consent-err" role="alert">${error}</div>` : ''}
  </div>`;
}

/** 공개 화면의 학번·연락처·이메일 자리. 원문은 서버가 보내지 않으므로 가짜 글자를 흐리게 보여 준다. */
const VEIL_TEXT = { studentNo: '202600000', phone: '010-0000-0000', email: 'hidden@dit.ac.kr' };
export function Veil({ kind }) {
  return html`<span class="veil" title="개인정보 보호를 위해 가렸습니다">
    <span class="blur" aria-hidden="true">${VEIL_TEXT[kind]}</span><span class="sr">비공개</span>
  </span>`;
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const last = document.activeElement;
    if (ref.current) ref.current.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (last && last.focus) last.focus();
    };
  }, []);
  return html`<div class="overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class=${`dialog${wide ? ' dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" ref=${ref}>
      <div class="dialog-h"><h2>${title}</h2><button class="close" type="button" aria-label="닫기" onClick=${onClose}>×</button></div>
      ${children}
    </div>
  </div>`;
}

export function Slots({ count, size = 4 }) {
  return html`<div class=${`slots${count >= size ? ' done' : ''}`} role="img" aria-label=${`${size}명 중 ${count}명`}>
    ${Array.from({ length: size }, (_, i) => html`<span class=${`slot${i < count ? ' on' : ''}`}></span>`)}
  </div>`;
}

export function Status({ status, label }) {
  return html`<span class=${`st st-${status}`}>${label || STATUS_LABEL[status] || status}</span>`;
}

/** 비동기 버튼: 누르는 동안 중복 제출을 막는다. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    if (busy) return undefined;
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

/* ── 참가자 본인 정보 입력(팀 만들기·합류·정정 공용) ── */
export function emptyMember() {
  return { deptCode: '', studentNo: '', name: '', phone: '', email: '', shirt: '', pin: '', pin2: '' };
}

export function checkMember(m, { withPin }) {
  const e = {};
  if (!m.deptCode) e['me.deptCode'] = '학과를 고르세요.';
  if (!RX.studentNo.test(digits(m.studentNo))) e['me.studentNo'] = '학번은 숫자 9자리입니다. (예: 202612345)';
  if (String(m.name).trim().length < 2) e['me.name'] = '성명을 입력해 주세요.';
  if (!RX.phone.test(digits(m.phone))) e['me.phone'] = '휴대전화 번호를 확인해 주세요.';
  if (!RX.email.test(String(m.email).trim())) e['me.email'] = '이메일 주소를 확인해 주세요.';
  if (!m.shirt) e['me.shirt'] = '티셔츠 사이즈를 고르세요.';
  if (withPin) {
    if (String(m.pin).length < 6 || /\s/.test(m.pin)) e['me.pin'] = '비밀번호는 공백 없이 6자 이상입니다.';
    else if (m.pin !== m.pin2) e['me.pin2'] = '비밀번호가 서로 다릅니다.';
  }
  return e;
}

export function MemberFields({ m, set, errors, config, withPin, prefix = 'me' }) {
  const err = (k) => errors[`me.${k}`];
  const id = (k) => `${prefix}-${k}`;
  return html`<div class="grid-2">
    <${Field} label="학과" id=${id('deptCode')} required error=${err('deptCode')} hint="NDS 학사시스템 기준 재학생 학과">
      <${DeptSelect} id=${id('deptCode')} value=${m.deptCode} departments=${config.departments} onChange=${(v) => set('deptCode', v)} />
    <//>
    <${Field} label="학번" id=${id('studentNo')} required error=${err('studentNo')}>
      <input id=${id('studentNo')} class="input num" inputmode="numeric" autocomplete="off" maxlength="9" placeholder="202612345"
        value=${m.studentNo} onInput=${(e) => set('studentNo', digits(e.target.value).slice(0, 9))} />
    <//>
    <${Field} label="성명" id=${id('name')} required error=${err('name')}>
      <input id=${id('name')} class="input" autocomplete="name" maxlength="30" value=${m.name} onInput=${(e) => set('name', e.target.value)} />
    <//>
    <${Field} label="휴대전화" id=${id('phone')} required error=${err('phone')}>
      <input id=${id('phone')} class="input num" type="tel" inputmode="numeric" autocomplete="tel" placeholder="010-1234-5678"
        value=${m.phone} onInput=${(e) => set('phone', phoneMask(e.target.value))} />
    <//>
    <${Field} label="이메일" id=${id('email')} required error=${err('email')} hint="행사 안내를 받을 주소">
      <input id=${id('email')} class="input" type="email" autocomplete="email" placeholder="name@dit.ac.kr" maxlength="100"
        value=${m.email} onInput=${(e) => set('email', e.target.value.trim())} />
    <//>
    <${Field} label="티셔츠 사이즈" id=${id('shirt')} required error=${err('shirt')} hint="단체 티셔츠(기념품) 제작용">
      <${Seg} name=${id('shirt')} options=${config.shirtSizes} value=${m.shirt} onChange=${(v) => set('shirt', v)} />
    <//>
    ${withPin ? html`
      <${Field} label="비밀번호" id=${id('pin')} required error=${err('pin')} hint="6자 이상. 「내 신청」에서 확인·수정할 때 씁니다.">
        <input id=${id('pin')} class="input" type="password" autocomplete="new-password" maxlength="20" value=${m.pin} onInput=${(e) => set('pin', e.target.value)} />
      <//>
      <${Field} label="비밀번호 확인" id=${id('pin2')} required error=${err('pin2')}>
        <input id=${id('pin2')} class="input" type="password" autocomplete="new-password" maxlength="20" value=${m.pin2} onInput=${(e) => set('pin2', e.target.value)} />
      <//>` : ''}
  </div>`;
}

/* ── 동의(필수 3 + 선택 1). 문구는 서버 config.privacy 에서 온다. ── */
export function emptyAgree() {
  return { privacy: false, overseas: false, training: false, media: false };
}

export function checkAgree(a, training) {
  const e = {};
  if (!a.privacy) e['agree.privacy'] = '개인정보 수집·이용에 동의해야 신청할 수 있습니다.';
  if (!a.overseas) e['agree.overseas'] = '국외 이전(클라우드 보관)에 동의해야 신청할 수 있습니다.';
  if (!a.training) e['agree.training'] = `${training} 참석 확인에 체크해 주세요.`;
  return e;
}

export function ConsentFields({ agree, setAgree, errors, config }) {
  const p = config.privacy;
  const set = (k) => (v) => setAgree({ ...agree, [k]: v });
  return html`<div class="consents">
    <${Consent} id="agree-training" required title="의무 교육 참석 확약" checked=${agree.training} onChange=${set('training')} error=${errors['agree.training']}>
      <div class="pledge">${config.training.notice}</div>
      <div class="hint">${config.training.detail}</div>
    <//>
    <${Consent} id="agree-privacy" required title="개인정보 수집·이용 동의" checked=${agree.privacy} onChange=${set('privacy')} error=${errors['agree.privacy']}
      rows=${[['수집·이용 목적', p.collect.purpose], ['수집 항목', p.collect.items], ['보유·이용 기간', p.collect.retention], ['동의 거부 권리', p.collect.refuse]]} />
    <${Consent} id="agree-overseas" required title="개인정보 국외 이전(클라우드 보관) 동의" checked=${agree.overseas} onChange=${set('overseas')} error=${errors['agree.overseas']}
      rows=${[['이전 항목', p.overseas.items], ['이전받는 자', p.overseas.recipient], ['이전 국가', p.overseas.country], ['이전 시기·방법', p.overseas.when], ['이용 목적', p.overseas.purpose], ['보유·이용 기간', p.overseas.retention], ['동의 거부 권리', p.overseas.refuse]]} />
    <${Consent} id="agree-media" title="사진·영상 촬영 및 홍보 활용 동의" checked=${agree.media} onChange=${set('media')}
      rows=${[['이용 목적', p.media.purpose], ['항목', p.media.items], ['보유·이용 기간', p.media.retention], ['동의 거부 권리', p.media.refuse]]} />
    <div class="small muted">
      <p>처리 위탁 — ${p.processor}</p>
      <p>공개 범위 — ${p.disclosure} <a href="#/privacy">개인정보 처리 안내 전문</a></p>
    </div>
  </div>`;
}

/** 서버 오류(field 포함)를 폼 오류 표시로 바꾼다. */
export function serverErrors(err) {
  if (err && err.field) return { [err.field]: err.message };
  return { _form: err ? err.message : '요청을 처리하지 못했습니다.' };
}

/** 첫 번째 오류 칸으로 스크롤·포커스 */
export function focusFirstError() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.field.bad input, .field.bad select, .field.bad textarea, .consent.bad input, .form-error');
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el.focus) el.focus({ preventScroll: true });
    }
  });
}
