// 의무 교육 진행표(90분, 강사 혼자). 강사 화면(teach.js)·교육 따라 하기 화면(lesson.js)·지침서(tools/build-guide.mjs)가 이 데이터 하나를 쓴다.
// 순수 데이터와 작은 함수만 둔다 — 화면 코드를 가져오지 않는다(Node 시험이 그대로 읽는다).
import { SCRIPTS } from './teach-script.js';
import { COPY_ITEMS } from './teach-prompts.js';
import { STEPS_1 } from './teach-steps-1.js';
import { STEPS_2 } from './teach-steps-2.js';
import { STEPS_3 } from './teach-steps-3.js';

export { SCRIPTS, COPY_ITEMS };
export { STARTER_URL, SITE_URL, LESSON_URL, TEACH_URL, TOTAL_MIN } from './teach-consts.js';

export const STEPS = [...STEPS_1, ...STEPS_2, ...STEPS_3];

/** 각 칸이 시작하는 시각(교육 시작부터 지난 분) */
export function timeline() {
  let at = 0;
  return STEPS.map((s) => {
    const start = at;
    at += s.min;
    return { ...s, start, end: at };
  });
}

/** 시연(강사가 하는 일)에 드는 분과 팀 실습에 남는 분 */
export function demoMin(step) {
  return step.acts.reduce((n, a) => n + a.min, 0);
}

/** 90분 → "1:30" 같은 시각 글자 */
export function clock(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** 웹앱의 구조 표(오리엔테이션에서 화면에 띄워 1분 설명): [부분, 파일, 하는 일, 돌아가는 곳] */
export const STRUCTURE = [
  ['프론트엔드(화면)', 'public/index.html, style.css, app.js', '화면의 뼈대·모양·동작. 버튼을 누르면 API에 요청을 보내고 받은 데이터를 그린다', '사용자의 브라우저'],
  ['백엔드(서버)', 'server.js', '화면 파일을 브라우저에 보내 주고, API 요청을 받아 데이터를 확인·저장한다', 'Codespace'],
  ['API', 'server.js 안의 app.get, app.post 같은 줄', '화면과 서버가 데이터를 주고받는 약속. 방법 + 주소로 부른다(GET 읽기, POST 추가, DELETE 지우기)', ''],
  ['데이터', 'data/seed.json, data/db.json', '처음 가짜 데이터(저장소에 올린다)와 실행 중에 바뀐 데이터(올리지 않는다)', '서버의 파일'],
];

export const FLOW = '사용자가 [추가]를 누른다 → app.js가 POST /api/items로 입력값을 보낸다 → server.js가 값을 확인하고 data/db.json에 저장한다 → app.js가 GET /api/items로 목록을 다시 받아 화면에 그린다. 예선 심사도 이 흐름(화면 → API → 저장 → 다시 보기)이 코드로 이어져 있는지 본다.';

/** 오리엔테이션 끝에 화면에 적는 세 낱말: [낱말, 뜻] */
export const WORDS = [
  ['저장소', '팀이 함께 쓰는 GitHub의 프로젝트 폴더'],
  ['커밋', '고친 내용을 설명과 함께 한 번 저장한 것'],
  ['동기화', '내 커밋을 올리고 팀원의 커밋을 받아 오는 것'],
];

/** 강사가 도와도 되는 것 / 도우면 안 되는 것(공정성 원칙) */
export const HELP_OK = [
  'GitHub 계정·로그인, 저장소 만들기, 팀원 초대, Codespaces 열기, 커밋·동기화, 충돌 풀기, 공개·비공개 설정',
  '터미널 명령(`npm install`, `npm run dev`), 서버 켜고 끄기, 앱 주소(포트) 열기',
  'AI 도구 로그인·실행, 사용량 한도에 걸렸을 때 대처',
  '사이트(「내 신청」) 로그인, 세션 코드 입력, 제출 화면 사용법',
  '오류 메시지가 무슨 뜻인지(어디에 문제가 있는지) 읽어 주기',
];
export const HELP_NO = [
  '무엇을 만들지, 화면을 어떻게 나눌지, 어떤 기능을 넣을지에 대한 의견',
  '코드 작성·수정, 프롬프트를 대신 써 주기, "이렇게 물어보라"고 구체적으로 알려 주기',
  '다른 팀의 과제·화면·코드를 보여 주거나 전해 주기',
  '예상 점수나 "이 정도면 붙는다" 같은 평가',
];
