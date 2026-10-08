// 배포 주소(한 곳에서만 관리). 브라우저(config.js)와 Vercel 함수(api/public.js)가 함께 쓴다.
// 사이트 주소(https://skyman200.github.io/vibe/)는 index.html 의 canonical·og 태그에 있다.
// - GAS_URL: Apps Script 웹앱(쓰기·로그인)
// - PUBLIC_API_URL: 공개 읽기(설정·참가현황)를 CDN 에 캐시하는 Vercel 함수
// - LOG_API_URL: 화면 오류 보고를 받아 운영 디스코드로 알리는 Vercel 함수(api/log.js)
export const GAS_URL = 'https://script.google.com/macros/s/AKfycbwUeqrihIhWRDhp2XwdhygGm9JwLrlZdlTfd5zOJ1c7MEUoDXjj6L5NLt-JqX1PCKat/exec';
export const PUBLIC_API_URL = 'https://dit-vibe-hackathon.vercel.app/api/public';
export const LOG_API_URL = 'https://dit-vibe-hackathon.vercel.app/api/log';
