// 요청 재시도 규칙(브라우저 lib.js 와 운영 점검 스크립트 test/e2e/*.mjs 가 함께 쓴다 — 브라우저 전용 코드 없음).
// - BUSY: 서버가 이 요청을 받고 아무것도 바꾸지 않았다고 답한 경우(잠금을 얻지 못함) → 항상 다시 시도.
// - NETWORK: 이 요청의 답을 못 받은 경우(연결 실패·제한 시간 초과·다른 답 — 서버에 반영됐을 수도 있음) → 두 번 해도 안전한 요청만 다시 시도.
//   아래 요청은 두 번 실행되면 안 되거나(새 코드 발급·삭제) 결과를 잃으면 안 되므로 NETWORK 재시도를 하지 않는다.
//   예선 제출(prelimSubmit)은 한 번에 저장소 압축 파일(최대 30MB)을 받아 보관하므로, 끊겼을 때 다시 보내면 서버가 같은 일을
//   겹쳐 한다 — 다시 보내지 않고 호출 측이 제출 상태를 다시 읽는다. 예선 심사 묶음은 다시 보내도 된다: 머리(adminPrelimBundle)는
//   심사 번호를 한 번만 정해 같은 답이고, 팀마다 받는 adminPrelimBundleTeam 은 읽기만 한다.

export const NO_NETWORK_RETRY = new Set([
  'adminCode', 'adminJudgeAdd', 'adminJudgeReset', 'adminJudgeRemove', 'adminMemberRemove', 'adminDeleteTeam', 'adminPurge',
  'adminPinReset', 'meWithdraw', 'meUpdate', 'teamDissolve', 'teamKick', 'teamTransfer', 'teamInvite', 'adminPrelimSession', 'adminTeachCode', 'prelimSubmit',
]);

export const MAX_ATTEMPTS = 6;
export const FIRST_WAIT_MS = 700;
export const MAX_WAIT_MS = 8000;

export function retryable(code, action) {
  return code === 'BUSY' || (code === 'NETWORK' && !NO_NETWORK_RETRY.has(action));
}

/**
 * 받은 JSON 이 이 요청의 답인가. 서버(gas/Api.js doPost)는 모든 답에 action 을 싣는다. action 이 다르거나 없으면 답이 아니다
 * — 받지 못한 것(NETWORK)으로 다룬다. 요청이 앞단에서 본문 없는 GET 으로 바뀌어 doGet 이 답한 것(BUSY, action 없음)도 그렇다:
 * 그 GET 이 어느 POST 에서 왔는지, 그 POST 가 실행됐는지 모르므로 두 번 해도 안전한 요청만 다시 보내고 호출 측이 상태를 다시 확인한다.
 */
export function answers(data, action) {
  return !!data && typeof data.ok === 'boolean' && data.action === action;
}

/** 지터가 있는 대기 시간(ms)과 다음 기준값. */
export function backoff(base) {
  return { wait: base * (0.5 + Math.random()), next: Math.min(base * 2, MAX_WAIT_MS) };
}
