// 요청 재시도 규칙(브라우저 lib.js 와 운영 점검 스크립트 test/e2e/*.mjs 가 함께 쓴다 — 브라우저 전용 코드 없음).
// - BUSY: 서버가 잠금을 얻지 못해 아무것도 바꾸지 않은 경우 → 항상 다시 시도.
// - NETWORK: 응답을 못 받은 경우(서버에 반영됐을 수도 있음) → 두 번 해도 안전한 요청만 다시 시도.
//   아래 요청은 두 번 실행되면 안 되거나(새 코드 발급·삭제) 결과를 잃으면 안 되므로 NETWORK 재시도를 하지 않는다.

export const NO_NETWORK_RETRY = new Set([
  'adminCode', 'adminJudgeAdd', 'adminJudgeReset', 'adminJudgeRemove', 'adminMemberRemove', 'adminDeleteTeam', 'adminPurge',
  'adminPinReset', 'meWithdraw', 'meUpdate', 'teamDissolve', 'teamKick', 'teamTransfer', 'teamInvite',
]);

export const MAX_ATTEMPTS = 6;
export const FIRST_WAIT_MS = 700;
export const MAX_WAIT_MS = 8000;

export function retryable(code, action) {
  return code === 'BUSY' || (code === 'NETWORK' && !NO_NETWORK_RETRY.has(action));
}

/** 지터가 있는 대기 시간(ms)과 다음 기준값. */
export function backoff(base) {
  return { wait: base * (0.5 + Math.random()), next: Math.min(base * 2, MAX_WAIT_MS) };
}
