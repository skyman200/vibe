// 오류 보고에서 개인정보 꼴(이메일·전화번호·6자리 넘는 숫자열 — 학번 등)을 지운다.
// 화면(lib.js reportError)과 오류 보고 함수(web/api/log.js)가 같이 쓴다(화면에서 한 번, 디스코드로 보내기 전에 한 번 더).
// 스크립트 주소(https://…)는 그대로 둔다 — 사파리·파이어폭스 스택의 '함수@https://…'가 이메일로 지워지거나
// 주소 안 버전 해시의 숫자가 지워지면 원인 줄을 찾을 수 없다.
const URL_PART = /(https?:\/\/[^\s()<>]+)/;

export function scrub(value, max) {
  return String(value === undefined || value === null ? '' : value)
    .split(URL_PART)
    .map((part, i) => (i % 2 ? part : part
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>')
      .replace(/\d{2,3}[-. ]\d{3,4}[-. ]\d{4}/g, '<phone>')
      .replace(/\d{6,}/g, '<num>')))
    .join('')
    .slice(0, max);
}
