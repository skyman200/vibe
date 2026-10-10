// 새 버전 자동 적용: 사이트를 새로 올리면(tools/publish-pages.mjs) 이미 열려 있거나 예전 캐시로 뜬 화면도 새 버전으로 바뀐다.
// - 배포본은 화면 스크립트를 v/<버전>/assets/ 에서 받으므로 이 파일 주소로 자기 버전을 안다. 사이트 맨 위 version.json 이
//   지금 올라가 있는 버전이다(tools/build-pages.mjs). 로컬 개발(버전 폴더 없음)에서는 아무것도 하지 않는다.
// - 확인: 뜬 직후, 1분마다(화면이 보일 때), 창으로 돌아오거나 다른 화면으로 옮길 때.
// - 다르면 곧바로 캐시를 거치지 않는 주소로 다시 연다(보던 화면 그대로, 관리자 로그인도 유지).
//   단, 입력 중인 내용이 있거나 한 번만 보이는 코드(새 관리자 코드·임시 비밀번호·심사위원 코드)가 떠 있으면 잃지 않도록
//   아래에 안내만 띄우고, 저장하거나 다른 화면으로 옮기는 순간 적용한다([지금 적용]으로 바로 적용할 수도 있다).
import { session, BUILD } from './lib.js';

const VERSION_URL = new URL('../../../version.json', import.meta.url).href;
const TRIED = 'vh.updateTried';
const CHECK_EVERY_MS = 60000;

let target = '';        // 올라가 있는 새 버전(아직 적용 전)
let dirty = false;      // 이 화면에서 입력했고 아직 저장하지 않았다
let bar = null;

function store() {
  try { return window.sessionStorage; } catch (e) { return null; }
}

/** 잃으면 안 되는 것이 화면에 있나: 저장 전 입력, 한 번만 보이는 코드(강사 코드·세션 코드 창 포함), 방금 만든 초대 링크 */
function busy() {
  return dirty || !!document.querySelector('.codeline, .code-huge, .invite');
}

async function latest() {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 5000) : 0;
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (!res.ok) return '';
    const v = await res.json();
    return v && /^[0-9a-f]{12}$/.test(v.id) ? v.id : '';
  } catch (e) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function reload() {
  const st = store();
  // 새로 고쳤는데도 같은 예전 버전이 뜨면(전달망 반영 지연) 되풀이하지 않는다 — 3분 안에 같은 목표로 한 번만.
  try {
    const t = JSON.parse((st && st.getItem(TRIED)) || 'null');
    if (t && t.target === target && t.from === BUILD && Date.now() - t.at < 180000) return false;
    if (st) st.setItem(TRIED, JSON.stringify({ target, from: BUILD, at: Date.now() }));
  } catch (e) { /* 저장소가 없으면 그냥 새로 고친다 */ }
  session.handoffAdmin();
  location.replace(`${location.pathname}?r=${Date.now()}${location.hash}`);
  return true;
}

function showBar() {
  if (bar) return;
  bar = document.createElement('div');
  bar.className = 'updatebar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>새 버전이 나왔습니다. 입력한 내용을 저장하거나 다른 화면으로 옮기면 자동으로 적용됩니다.</span>';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '지금 적용';
  btn.onclick = () => { dirty = false; bar.remove(); bar = null; reload(); };
  bar.appendChild(btn);
  document.body.appendChild(bar);
}

function tryApply() {
  if (!target) return;
  if (busy()) { showBar(); return; }
  if (!reload()) showBar();
}

async function check() {
  if (!BUILD || document.hidden) return;
  const id = await latest();
  if (id && id !== BUILD) {
    target = id;
    tryApply();
  }
}

export function startUpdates() {
  if (!BUILD) return;
  // 무사히 새 버전으로 떴으면 되풀이 방지 기록을 지운다
  const st = store();
  try {
    const t = JSON.parse((st && st.getItem(TRIED)) || 'null');
    if (t && t.target === BUILD && st) st.removeItem(TRIED);
  } catch (e) { /* 무시 */ }
  document.addEventListener('input', (e) => {
    if (e.target && e.target.closest && e.target.closest('#main, .dialog')) dirty = true;
  }, true);
  window.addEventListener('hashchange', () => { dirty = false; if (target) tryApply(); else check(); });
  window.addEventListener('api-saved', () => { dirty = false; if (target) setTimeout(tryApply, 400); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  setInterval(check, CHECK_EVERY_MS);
  check();
}

/** 새 버전이 올라와 있는데 아직 적용하지 않았나(화면 오류 안내가 새 버전 탓을 할 때는 이것이 참일 때뿐이다). */
export function updateWaiting() {
  return !!target;
}
