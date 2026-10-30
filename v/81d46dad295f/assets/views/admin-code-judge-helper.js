// 관리자 · 코드 심사(50)의 AI 채점 — 운영 담당 컴퓨터(gjc 가 깔린 맥)의 채점 도우미(tools/judge-finals-app.mjs, JUDGE_URL)를 이 화면의
// 버튼으로 부른다. 도우미는 그 컴퓨터에서만 켜져 있다(AI-code-judge.command 를 한 번 실행하면 로그인할 때마다 저절로 켜진다).
// 처음에는 [채점 도우미 연결]을 눌러 연결한다(배포본은 Chrome 이 '이 기기의 다른 앱 및 서비스' 접근을 묻는다 → 허용). 연결에 성공한
// 브라우저는 다음부터 저절로 연결한다(localStorage — [이 브라우저에서 연결 그만두기]로 잊는다). 다른 컴퓨터에서는 누르지 않는 한
// 도우미를 부르지 않는다(권한 창이 뜨지 않게).
// 먼저 토큰 없이 /api/ping 으로 그 자리에 같은 판의 채점 도우미가 있는지 보고, 요청에는 관리자 토큰 대신 서버에서 받은 채점 도우미
// 토큰(adminFinalsHelperToken — 코드 심사 요청만 되는 좁은 토큰)을 보낸다. 도우미 자리를 다른 프로그램이 차지해도 관리자 토큰은 넘어가지 않는다.
import { html, useState, useEffect, useRef, api, session } from '../lib.js';
import { JUDGE_URL, LOCAL } from '../config.js';
import { JUDGE_VERSION } from '../endpoints.js';

const REMEMBER = 'vh.judgeHelper';
function remembered() {
  try { return window.localStorage.getItem(REMEMBER) === '1'; } catch (e) { return false; }
}
function remember(on) {
  try {
    if (on) window.localStorage.setItem(REMEMBER, '1');
    else window.localStorage.removeItem(REMEMBER);
  } catch (e) { /* 저장소가 없으면 이번만 */ }
}

/**
 * 관리자 토큰 → 채점 도우미 토큰(모듈에 둔다 — 화면을 다시 열어도 다시 받지 않는다). 같은 관리자 토큰이면 서버가 늘 같은 토큰을 주므로
 * (만료·관리자 코드 묶음이 같다) 도우미가 그 토큰을 거절하면 관리자 로그인이 끝난 것이다.
 */
let minted = { admin: '', token: '' };
async function helperToken() {
  const admin = session.get('admin');
  if (minted.token && minted.admin === admin) return minted.token;
  const res = await api('adminFinalsHelperToken', { token: admin });
  minted = { admin, token: res.token };
  return res.token;
}

/** 도우미에 한 번 묻는다 → 답(JSON). 닿지 않으면 { ok:false, code:'DOWN' }, 시간을 넘기면 'SLOW', 도우미의 답이 아니면 'ODD'. */
async function post(path, body, ms, token) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(`${JUDGE_URL}/api/${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body || {}),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => null);
    return data && typeof data.ok === 'boolean' ? data : { ok: false, code: 'ODD', error: `채점 도우미의 답을 읽지 못했습니다(HTTP ${res.status}).` };
  } catch (e) {
    return { ok: false, code: ctl.signal.aborted ? 'SLOW' : 'DOWN' };
  } finally {
    clearTimeout(timer);
  }
}

/** 닿지 않은 까닭: 브라우저가 이 사이트의 로컬 네트워크 접근을 막았으면 'blocked', 아니면 'down'(도우미가 꺼져 있음). */
async function why() {
  if (LOCAL || !navigator.permissions) return 'down';
  for (const name of ['loopback-network', 'local-network-access', 'local-network']) {
    try {
      if ((await navigator.permissions.query({ name })).state === 'denied') return 'blocked';
    } catch (e) { /* 이 브라우저에 없는 권한 이름 */ }
  }
  return 'down';
}

/**
 * 토큰 없이 그 자리에 무엇이 있는지 → 'ok'(같은 판의 채점 도우미) · 'old'(다른 판) · 'odd'(이 화면이 읽을 수 없는 답 — 예전 도우미·다른
 * 프로그램·사이트가 아닌 주소에서 연 화면) · 'slow' · 'down' · 'blocked'. CORS 로 읽지 못하면 no-cors 로 한 번 더 두드려 무엇이 듣고는
 * 있는지(odd) 아무것도 없는지(down·blocked) 가른다.
 */
async function probe(ms) {
  const url = `${JUDGE_URL}/api/ping`;
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) });
    const p = await res.json().catch(() => null);
    return !p || p.app !== 'dit-finals-judge' ? 'odd' : p.version !== JUDGE_VERSION ? 'old' : 'ok';
  } catch (e) {
    if (e.name === 'TimeoutError') return 'slow';
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      return 'odd';
    } catch (e2) {
      return why();
    }
  }
}

/**
 * 도우미 연결 · 상태 읽기. link: off(연결 전) · wait(연결 중) · on · down(닿지 않음) · blocked(브라우저가 막음) · old(판이 다름)
 * · odd(도우미가 아닌 답) · slow(답이 늦음) · fail(도우미나 서버가 거절 — fail 에 까닭).
 * 연결되면 상태를 일하는 중 1.5초, 쉬는 중 5초마다 읽는다(이 표가 보이는 동안만). 연결됐다가 끊기면 5초마다 다시 붙어 본다.
 * onAuth: 관리자 로그인이 끝남(관리자 화면 다시 읽기 → 로그인 화면). onSettled(phase): 도우미의 일(fetch·redo)이 끝남.
 * act(path, body): 버튼 → 답. 늦게 온 예전 답(state.now 가 더 이름)은 새 상태를 덮지 않는다. forget: 이 브라우저에서 그만두기.
 */
export function useJudgeHelper({ onAuth, onSettled }) {
  const [link, setLink] = useState(remembered() ? 'wait' : 'off');
  const [st, setSt] = useState(null);
  const [fail, setFail] = useState('');
  const last = useRef(0);
  const timer = useRef(0);
  const alive = useRef(true);   // 이 표가 보이는 동안
  const want = useRef(remembered());   // 연결하려는 중(연결·저절로 연결) — 그만두면 거짓
  const was = useRef(false);    // 이번에 한 번이라도 연결됐는지 — 끊기면 다시 붙어 본다
  const ready = useRef(false);  // ping 으로 같은 판의 도우미를 확인했는지 — 끊기면 다시 확인
  const phase = useRef('idle');
  const hooks = useRef({ onAuth, onSettled });
  hooks.current = { onAuth, onSettled };
  const live = () => alive.current && want.current;
  const refuse = (text) => { setFail(text); setLink('fail'); };

  const ask = async (path, body, ms) => {
    if (!ready.current) {
      // 처음 연결은 Chrome 이 권한을 묻는 동안 기다린다
      const seen = await probe(was.current ? 15000 : 120000);
      if (!live()) return { ok: false, code: 'GONE' };
      if (seen !== 'ok') { setLink(seen); return { ok: false, code: seen }; }
      ready.current = true;
    }
    let token;
    try {
      token = await helperToken();
    } catch (err) {
      if (!live()) return { ok: false, code: 'GONE' };
      if (err.code === 'AUTH') hooks.current.onAuth();
      else refuse(err.message);
      return { ok: false, code: err.code || 'ERROR', error: err.message };
    }
    const data = await post(path, body, ms, token);
    if (!live()) return data;
    if (data.code === 'DOWN' || data.code === 'SLOW' || data.code === 'ODD') {
      ready.current = false;
      setLink(data.code === 'SLOW' ? 'slow' : data.code === 'ODD' ? 'odd' : await why());
    } else if (data.code === 'AUTH') {
      hooks.current.onAuth();
    } else if (!data.state) {
      refuse(data.error || `알 수 없는 오류(${data.code || '-'})`);
    } else if (data.state.version !== JUDGE_VERSION) {
      ready.current = false;
      setLink('old');
    } else {
      was.current = true;
      remember(true);
      setLink('on');
      if (data.state.now >= last.current) {
        last.current = data.state.now;
        if (phase.current !== 'idle' && data.state.phase === 'idle') hooks.current.onSettled(phase.current);
        phase.current = data.state.phase;
        setSt(data.state);
      }
    }
    return data;
  };

  const schedule = (ms) => {
    clearTimeout(timer.current);
    if (ms && live()) timer.current = setTimeout(tick, ms);
  };
  async function tick() {
    // 도우미가 다시 켜진 뒤 처음 보는 토큰은 서버에 확인하느라 늦을 수 있다
    const data = await ask('state', {}, 45000);
    if (!live()) return;
    schedule(data.state ? (data.state.busy ? 1500 : 5000) : was.current && data.code !== 'AUTH' ? 5000 : 0);
  }

  useEffect(() => {
    alive.current = true;
    if (want.current) tick();
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, []);

  const connect = () => {
    want.current = true;
    ready.current = false;
    setLink('wait');
    tick();
  };
  const forget = () => {
    remember(false);
    want.current = false;
    was.current = false;
    ready.current = false;
    clearTimeout(timer.current);
    setSt(null);
    setLink('off');
  };
  /** 버튼. 오래 걸리는 일(채점 시작·다시 채점)은 도우미가 바로 답하고, 점수 올리기·지우기는 끝낸 뒤 답한다. */
  const act = async (path, body) => {
    const data = await ask(path, body, path === 'upload' || path === 'wipe' ? 300000 : 60000);
    if (data.state) schedule(1500);
    return data;
  };
  return { link, st, fail, connect, forget, act };
}

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 채점 폴더의 모든 회차(3회 × 팀) → 단계별 수를 세는 함수 */
export function runCounter(work) {
  const runs = work ? work.teams.flatMap((t) => t.runs) : [];
  const count = (s) => runs.filter((r) => r.state === s).length;
  count.total = runs.length;
  return count;
}

/** 측정 중·써 보기 중·로그인 대기인 팀 수(팀 칸의 measure·trial) — 없으면 빈 글 */
function stageText(work) {
  const teams = work ? work.teams : [];
  const n = (stage, state) => teams.filter((t) => t[stage] && t[stage].state === state).length;
  return [['측정 중', n('measure', 'running')], ['써 보기 중', n('trial', 'running')], ['로그인 대기', n('measure', 'login')]]
    .filter(([, c]) => c).map(([name, c]) => `${name} ${c}`).join(' · ');
}

/** 진행 한 줄: 묶음 받는 중 · 멈추는 중 · 채점 중(측정·써 보기·로그인 대기, 끝/채점 중/대기/실패, 지난 시간) · 채점 폴더 */
export function progressText(st) {
  const count = runCounter(st.work);
  const stage = stageText(st.work);
  if (st.progress) return st.progress;
  if (st.stopping) return '멈추는 중…';
  if (st.judging) {
    return `채점 중 — ${stage ? `${stage} · ` : ''}끝 ${count('done')}/${count.total} · 채점 중 ${count('running')} · 대기 ${count('queued') + count('wait')}${count('failed') ? ` · 실패 ${count('failed')}` : ''} · ${mmss(st.now - st.judgingSince)} 지남`;
  }
  return st.work ? `채점 폴더: 묶음 ${st.work.bundleId} · 끝 ${count('done')}/${count.total}${stage ? ` · ${stage}` : ''}` : '';
}

/** 실패·틀림·다시 시도 대기 회차의 까닭 */
export function failures(work) {
  return work ? work.teams.flatMap((t) => t.runs.map((r, i) => ({ code: t.code, n: i + 1, ...r })))
    .filter((r) => ['failed', 'bad', 'wait'].includes(r.state) && r.why) : [];
}

/** 한 회차의 칸: 끝(✓ 점수) · 채점 중 · 다시 시도 대기 · 대기 · 실패 · 멈춤 · 틀림(형식이 맞지 않는 답) */
function Run({ r, now }) {
  if (!r) return html`<span class="muted">-</span>`;
  const text = {
    done: html`<span class="ok">✓ ${r.total}</span>`,
    running: `채점 중 ${mmss(now - r.startedAt)}${r.attempt > 1 ? ` (${r.attempt}번째)` : ''}`,
    wait: html`<span class="flag">다시 시도 대기</span>`,
    queued: html`<span class="muted">대기</span>`,
    failed: html`<span class="bad">실패</span>`,
    stopped: html`<span class="muted">멈춤</span>`,
    bad: html`<span class="bad">틀림</span>`,
    none: html`<span class="muted">-</span>`,
  }[r.state] || r.state;
  return html`<span class="ai-run" title=${r.why || ''}>${text}</span>`;
}

/** 측정·써 보기 한 줄(도우미 stages): 하는 중 · 대기 · 로그인 대기 · 끝(요약) · 못 함(까닭 — 써 보기 없이 채점) · 실패 · 멈춤 */
function Stage({ name, s, now }) {
  if (!s || s.state === 'none') return '';
  const text = {
    done: html`<span class="ok">✓</span> ${s.text}`,
    running: `하는 중 ${mmss(now - s.startedAt)}${s.attempt > 1 ? ` (${s.attempt}번째)` : ''}`,
    wait: html`<span class="flag">다시 하기 전 대기</span>`,
    queued: html`<span class="muted">대기</span>`,
    login: html`<span class="flag">로그인 대기</span>`,
    skip: html`<span class="flag">못 함</span> ${s.why}`,
    failed: html`<span class="bad">실패</span>`,
    stopped: html`<span class="muted">멈춤</span>`,
  }[s.state] || s.state;
  return html`<div class="ai-stage wrap-cell" title=${s.why || ''}>${name} ${text}</div>`;
}

/**
 * 로그인 대기(측정이 심사용 계정으로 로그인하지 못함): 까닭 · [직접 로그인 A/B](아직 못 한 계정 — 이 컴퓨터에 Chrome 창이 뜨고 아이디·
 * 비밀번호는 넣어 둔다) · [로그인 없이 진행]. 창이 열려 있는 동안은 그 계정을 보인다.
 */
function LoginWait({ w, manual, now, off, onLogin, onSkip }) {
  const need = w.measure.need.length ? w.measure.need : ['a', 'b'];
  const open = manual && manual.code === w.code;
  return html`<div class="wrap-cell" style="margin:4px 0">
    <div>${w.measure.why}</div>
    ${open ? html`<div class="flag" role="status">계정 ${manual.who.toUpperCase()} 직접 로그인 창이 열려 있습니다(이 컴퓨터의 Chrome, ${mmss(now - manual.since)}) — 로그인하면 저절로 닫힙니다.</div>`
      : html`<div class="btn-row" style="margin:4px 0 0">
      ${need.map((who) => html`<button type="button" class="btn btn-sm" disabled=${off} onClick=${() => onLogin(w.code, who)}>직접 로그인 ${who.toUpperCase()}</button>`)}
      <button type="button" class="link-btn small" disabled=${off} onClick=${() => onSkip(w.code)}>로그인 없이 진행</button></div>`}
  </div>`;
}

/**
 * 코드 심사 표의 'AI 채점' 칸: 측정 · 써 보기(로그인 대기면 [직접 로그인]·[로그인 없이 진행]) · 3회 · AI 평균(갈림) · 받은 자료 · [다시 채점].
 * loginOff: 직접 로그인·로그인 없이 진행을 못 누를 때(도우미가 다른 일 중·직접 로그인 창이 열려 있음 — 다른 팀 채점 중에는 된다).
 */
export function AiCell({ w, now, disabled, onRedo, manual, loginOff, onLogin, onSkip }) {
  if (!w) return html`<td></td>`;
  return html`<td class="small">
    ${!w.measure ? '' : !w.site ? html`<div class="flag">서비스 주소 없음 — 코드로만 채점</div>` : html`<${Stage} name="측정" s=${w.measure} now=${now} />
      ${w.measure.state === 'login' ? html`<${LoginWait} w=${w} manual=${manual} now=${now} off=${loginOff} onLogin=${onLogin} onSkip=${onSkip} />` : ''}
      <${Stage} name="써 보기" s=${w.trial} now=${now} />
      ${w.account ? '' : html`<div class="flag">심사용 계정 없음</div>`}`}
    <div class="ai-runs">${[0, 1, 2].map((i) => html`<${Run} r=${w.runs[i]} now=${now} />`)}</div>
    ${w.total === null || w.total === undefined ? '' : html`<div>AI 평균 <b>${w.total}</b>${w.spread.length ? html` <span class="flag" title="3번의 채점이 크게 갈림 — [보고서 보기]의 근거를 보세요">갈림: ${w.spread.join(', ')}</span>` : ''}</div>`}
    ${w.files === undefined ? '' : html`<div class="muted">자료 ${w.files}개${w.cut || w.dropped ? html` <span class="flag" title=${`자료가 길어 앞부분만 넣은 파일 ${w.cut}개, 뺀 파일 ${w.dropped}개`}>일부만</span>` : ''}${w.flags ? html`<div class="wrap-cell">${w.flags}</div>` : ''}</div>`}
    <button type="button" class="link-btn small" disabled=${disabled} onClick=${() => onRedo(w.code)}>다시 채점</button>
  </td>`;
}

/** 연결 전·연결 문제 안내(연결되면 빈 칸). 문제 안내에는 [다시 연결]과 [이 브라우저에서 연결 그만두기](저절로 연결을 잊는다). */
export function HelperLink({ link, fail, connect, forget }) {
  const allow = LOCAL ? '' : ' Chrome 이 \'이 기기의 다른 앱 및 서비스\' 접근을 물으면 [허용]을 누르세요.';
  const command = LOCAL ? 'AI-code-judge-practice.command' : 'AI-code-judge.command';
  const again = html`<span class="btn-row" style="display:inline-flex;margin:0 0 0 6px"><button type="button" class="btn btn-sm" onClick=${connect}>다시 연결</button>
    <button type="button" class="link-btn small" onClick=${forget}>이 브라우저에서 연결 그만두기</button></span>`;
  if (link === 'off') {
    return html`<div class="btn-row"><button type="button" class="btn btn-sm btn-primary" onClick=${connect}>채점 도우미 연결</button>
      <span class="small muted">운영 담당 컴퓨터(도우미를 켠 맥)의 Chrome 에서만 누릅니다.${allow}</span></div>`;
  }
  if (link === 'wait') return html`<p class="small muted" role="status">채점 도우미에 연결하는 중…${allow}</p>`;
  const box = (tone, head, text) => html`<div class=${`notice ${tone}`} role="alert"><b>${head}</b> ${text} ${again}</div>`;
  if (link === 'blocked') {
    return box('bad', '브라우저가 채점 도우미 연결을 막았습니다.', "주소창 왼쪽의 사이트 정보(조절) 아이콘 → '로컬 네트워크 액세스'(이 기기의 다른 앱 및 서비스)를 [허용]으로 바꾼 뒤 다시 연결하세요.");
  }
  if (link === 'old') {
    return box('warn', '채점 도우미가 이 화면과 맞지 않습니다(예전 도우미).', html`운영 담당 컴퓨터의 저장소 폴더에서 <code class="ic">AI-code-judge.command</code> 를 다시 실행한 뒤 다시 연결하세요.`);
  }
  if (link === 'odd') {
    return box('warn', '채점 도우미 자리에서 이 화면이 읽을 수 없는 답이 왔습니다.', html`예전 채점 도우미나 다른 프로그램이 ${JUDGE_URL} 을 쓰고 있거나, 이 화면을 사이트 주소가 아닌 곳에서 열었습니다.
      저장소 폴더의 <code class="ic">${command}</code> 를 다시 실행하고 ${LOCAL ? '연습 서버' : '사이트'}의 관리자 화면에서 다시 연결하세요.`);
  }
  if (link === 'slow') {
    return box('warn', '채점 도우미가 답하지 않습니다.', `Chrome 이 접근을 묻는 창이 떠 있으면 [허용]을 누르세요. 도우미가 서버 확인으로 늦는 것이면 잠시 뒤 저절로 다시 붙습니다.`);
  }
  if (link === 'down') {
    return box('warn', '채점 도우미에 연결하지 못했습니다.', html`이 컴퓨터에 도우미가 켜져 있지 않습니다. 운영 담당 컴퓨터라면 저장소 폴더의 <code class="ic">${command}</code> 를 더블클릭해 켠 뒤 다시 연결하세요.`);
  }
  if (link === 'fail') return box('bad', '채점 도우미:', fail);
  return '';
}
