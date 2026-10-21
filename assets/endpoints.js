// 배포 주소(한 곳에서만 관리). 브라우저(config.js)와 Vercel 함수(api/public.js), 채점 도우미(tools/judge-finals-app.mjs)가 함께 쓴다.
// - SITE_URL: 사이트 주소(GitHub Pages). index.html 의 canonical·og 태그에도 같은 주소가 있다(test/index-html.test.mjs 가 확인).
// - GAS_URL: Apps Script 웹앱(쓰기·로그인)
// - PUBLIC_API_URL: 공개 읽기(설정·참가현황)를 CDN 에 캐시하는 Vercel 함수
// - LOG_API_URL: 화면 오류 보고를 받아 운영 디스코드로 알리는 Vercel 함수(api/log.js)
// - JUDGE_URL: 본선 AI 코드 심사 채점 도우미 — 운영 담당 컴퓨터(gjc 가 있는 맥)에서만 켜져 있고, 그 컴퓨터에서 연 관리자 화면이 부른다.
//   JUDGE_PRACTICE_URL: 연습·시험용 도우미(이 컴퓨터의 시험 서버 화면이 부른다 — 실제 도우미와 함께 켜 둘 수 있게 포트가 다르다).
//   JUDGE_VERSION: 화면과 도우미가 주고받는 방식의 판 — 바꾸면 운영 담당 컴퓨터에서 AI-code-judge.command 를 다시 실행해야 한다(화면이 알린다).
export const SITE_URL = 'https://skyman200.github.io/vibe/';
export const GAS_URL = 'https://script.google.com/macros/s/AKfycbwUeqrihIhWRDhp2XwdhygGm9JwLrlZdlTfd5zOJ1c7MEUoDXjj6L5NLt-JqX1PCKat/exec';
export const PUBLIC_API_URL = 'https://dit-vibe-hackathon.vercel.app/api/public';
export const LOG_API_URL = 'https://dit-vibe-hackathon.vercel.app/api/log';
export const JUDGE_URL = 'http://127.0.0.1:8790';
export const JUDGE_PRACTICE_URL = 'http://127.0.0.1:8799';
export const JUDGE_VERSION = 3;
