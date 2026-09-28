// API 주소.
// - API_URL: 쓰기·로그인 요청. 로컬 개발(tools/dev-server.mjs)은 같은 서버의 /api, 배포본은 Apps Script 웹앱.
// - PUBLIC_URL: 공개 읽기(설정·참가현황). 배포본은 Vercel 함수(web/api/public.js)가 CDN 에 캐시하고
//   동시에 몰린 요청을 하나로 합쳐, 접속이 몰려도 Apps Script 에는 거의 요청이 가지 않는다.
import { GAS_URL, PUBLIC_API_URL } from './endpoints.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export const API_URL = LOCAL ? '/api' : GAS_URL;
export const PUBLIC_URL = LOCAL ? '/api/public' : PUBLIC_API_URL;
