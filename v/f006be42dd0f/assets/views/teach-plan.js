// 의무 교육 진행표(90분, 강사 혼자). 강사 화면(teach.js)·교육 따라 하기 화면(lesson.js)·지침서(tools/build-guide.mjs)가 이 데이터 하나를 쓴다.
// 순수 데이터와 작은 함수만 둔다 — 화면 코드를 가져오지 않는다(Node 시험이 그대로 읽는다).
import { SCRIPTS } from './teach-script.js';
import { COPY_ITEMS } from './teach-prompts.js';
import { STEPS_1 } from './teach-steps-1.js';
import { STEPS_2 } from './teach-steps-2.js';
import { STEPS_3 } from './teach-steps-3.js';

export { SCRIPTS, COPY_ITEMS };
export { STARTER_URL, SITE_URL, LESSON_URL, TEACH_URL, GEMINI_URL, TOTAL_MIN } from './teach-consts.js';

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

/** 웹앱의 구조 표(오리엔테이션에서 화면에 띄워 1분 설명): [부분, 어디, 하는 일, 돌아가는 곳] — Gemini 캔버스로 만든 앱 기준 */
export const STRUCTURE = [
  ['화면', '캔버스에 뜬 앱', '입력칸·단추·목록처럼 눈에 보이는 부분. 화면은 3개 이하로 만든다', '앱을 연 사람의 브라우저'],
  ['동작', 'AI가 쓴 HTML·JavaScript(캔버스의 코드)', '단추를 누르면 입력값을 확인하고, 목록에 더하고, 합계를 다시 계산한다', '앱을 연 사람의 브라우저'],
  ['저장', '브라우저 저장소(localStorage)', '넣은 데이터를 브라우저에 적어 두어 새로 고침해도 남게 한다. 기기·브라우저마다 따로 저장된다', '앱을 연 사람의 브라우저'],
  ['공유 링크', 'g.co/gemini/share/…', '로그인하지 않은 사람도 이 주소로 앱을 열어 쓴다. 만든 때의 앱으로 고정되므로 고친 뒤에는 링크를 새로 만든다', 'Google 서버가 앱을 보내 준다'],
];

export const FLOW = '값을 넣고 [추가]를 누른다 → 앱이 브라우저 저장소(localStorage)에 저장한다 → 새로 고침한다 → 저장한 데이터가 그대로 다시 보인다. 예선 심사도 이 흐름을 앱에서 실제로 써 보며 본다.';

/** 오리엔테이션 끝에 화면에 적는 세 낱말: [낱말, 뜻] */
export const WORDS = [
  ['캔버스', 'Gemini 입력창에서 켜는 도구 — 요청하면 AI가 만든 앱이 채팅 옆에 떠서 바로 눌러 볼 수 있다'],
  ['공유 링크', '로그인하지 않은 사람도 앱을 열어 쓸 수 있는 주소(g.co/gemini/share/…), 만든 때의 앱으로 고정된다'],
  ['저장', '넣은 데이터가 새로 고침해도 남는 것 — 앱이 브라우저 저장소(localStorage)에 적어 둔다'],
];

/** 강사가 도와도 되는 것 / 도우면 안 되는 것(공정성 원칙: 도구 조작·화면 위치·오류 메시지 읽기는 돕고, 과제 내용·요청 문장·디자인은 돕지 않는다) */
export const HELP_OK = [
  '구글 계정 로그인, gemini.google.com 열기, [캔버스]·[공유 및 내보내기]·[공유] 같은 단추의 위치',
  '공유 링크 복사, 시크릿 창이나 휴대폰에서 링크 열기, 「이 앱은 다른 사용자가 만들었습니다」 창에서 [계속] 누르기',
  '사이트(「내 신청」) 로그인, 세션 코드 입력, [예선 시작]·[예선 제출] 화면 사용법',
  '화면에 뜬 오류 메시지가 무슨 뜻인지 읽어 주기(오류 문구를 그대로 같은 채팅에 붙여 넣게 하는 것까지)',
  '연습(할 일 보드)에서 요청 틀의 빈칸이 무엇을 뜻하는지 설명하기(빈칸을 대신 채워 주지는 않는다)',
];
export const HELP_NO = [
  '예선 과제의 내용: 무엇을 만들지, 어떤 기능·화면을 넣을지, 과제 문구를 어떻게 풀지에 대한 의견',
  '요청 문장을 대신 써 주거나 고쳐 주기, "이렇게 물어보라"고 구체적으로 알려 주기',
  '디자인(색·배치·꾸밈)에 대한 의견, 앱을 대신 고쳐 주기',
  '다른 팀의 과제·앱·공유 링크를 보여 주거나 전해 주기',
  '예상 점수나 "이 정도면 붙는다" 같은 평가',
];
