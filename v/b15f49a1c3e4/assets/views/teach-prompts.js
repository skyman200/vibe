// 교육 시연·따라 하기에서 그대로 복사해 쓰는 글(강사 화면·교육 따라 하기 화면·지침서가 같은 글을 쓴다). 순수 데이터 — 화면 코드를 가져오지 않는다.
// 시연 주제는 "동아리 회비 장부"로 고정이다(예선 과제와 겹치지 않는다). p6 은 끝에 p1~p5 의 글을 붙여 복사한다(copyOf).

export const COPY_ITEMS = [
  {
    id: 'setup',
    title: '터미널에 넣을 세 줄',
    kind: 'cmd',
    text: `git config --global pull.rebase false
npm install
npm run dev`,
  },
  {
    id: 'p1',
    title: '요청 1 · 화면(프론트엔드)',
    kind: 'prompt',
    text: `동아리 총무가 쓰는 "회비 장부" 웹앱의 화면(프론트엔드)을 만들어 줘.
상황: 회비를 걷고 간식·MT 비용으로 쓴 돈을 기록하고, 남은 돈을 바로 알고 싶다.
고칠 파일: public/index.html, public/style.css, public/app.js (server.js는 아직 고치지 마)
꼭 필요한 기능:
1) 날짜, 내용, 금액, 구분(수입/지출)을 넣고 [기록]을 누르면 목록에 추가된다(날짜가 최근인 것부터 보인다)
2) 목록의 줄마다 [삭제] 버튼이 있다
3) 화면 위쪽에 총수입, 총지출, 잔액이 보인다
데이터: 기록 하나는 { id, date, memo, amount, type }이고 type은 "income" 또는 "expense"야.
지금은 app.js 안의 가짜 기록 5개로 시작해(서버 연결은 다음 단계에서 한다).
입력한 글자는 textContent로 화면에 넣어 줘(innerHTML로 넣지 마). 화면은 하나, 휴대폰에서도 보기 좋게.`,
  },
  {
    id: 'p2',
    title: '요청 2 · 고치기 예',
    kind: 'prompt',
    text: `금액을 비우거나 0을 넣고 [기록]을 누르면 0원짜리 기록이 생긴다.
날짜·내용이 비었거나 금액이 1 이상이 아니면 기록하지 말고, 입력칸 아래에 이유를 보여 줘.`,
  },
  {
    id: 'p3',
    title: '요청 3 · 백엔드',
    kind: 'prompt',
    text: `이제 백엔드(server.js)를 회비 장부에 맞게 바꿔 줘. 화면 파일(public/)은 고치지 마.
기록 하나는 { id, date, memo, amount, type }이고 type은 "income" 또는 "expense"야.
data/seed.json에 가짜 기록 5개를 넣고, 실행 중 데이터는 지금처럼 data/db.json에 저장해.
API:
1) GET /api/entries — 기록 목록(날짜가 최근인 것부터)
2) POST /api/entries — 기록 추가. 날짜·내용이 비었거나, 금액이 1 이상의 정수가 아니거나, type이 틀리면 400과 { "error": "이유" }
3) DELETE /api/entries/:id — 기록 삭제. 없는 id면 404(주소로 받은 :id는 글자이므로 숫자로 바꿔 비교해)
예전 /api/items는 지워 줘. 새 라이브러리는 설치하지 말고 지금 있는 express와 Node.js 기본 모듈만 써.`,
  },
  {
    id: 'p4',
    title: '요청 4 · API 확인 명령',
    kind: 'prompt',
    text: `방금 만든 API 세 개를 Codespace 터미널에서 확인하는 curl 명령을 알려 줘. 서버는 3000번 포트야.
정상 추가, 내용이 빈 추가(400이 나와야 함), 없는 id 삭제(404가 나와야 함)를 하나씩.`,
  },
  {
    id: 'p5',
    title: '요청 5 · 화면과 API 연결',
    kind: 'prompt',
    text: `이제 화면(public/app.js)이 가짜 기록 대신 서버 API를 쓰게 연결해 줘. server.js는 고치지 마.
1) 화면을 열면 GET /api/entries로 목록을 받아 그린다
2) [기록]을 누르면 POST /api/entries로 보내고, 성공하면 목록을 다시 받아 그린다. 실패하면 서버가 준 error를 입력칸 아래에 보여 준다
3) [삭제]를 누르면 DELETE /api/entries/:id를 부르고 목록을 다시 받아 그린다
4) 서버에 연결하지 못하면(답이 오지 않거나 JSON이 아니면) "서버에 연결하지 못했습니다"를 보여 준다
app.js 안의 가짜 기록은 지워 줘.`,
  },
  {
    id: 'p6',
    title: '요청 6 · README (요청 1~5를 붙여서)',
    kind: 'prompt',
    withPrevious: true,
    text: `README.md 양식의 빈칸을 지금 코드에 맞게 채워 줘. 제목(## 줄)은 그대로 둬.
주요 기능 표에는 기능마다 화면과 API(예: POST /api/entries)를 적어 줘.
실행 방법은 npm install → npm run dev → 브라우저에서 3000번 포트 순서로 써 줘.
AI 활용 내역에는 아래에 붙인 요청 1~5를 글자 그대로 넣고, 사람이 확인한 것(새로 고침해도 남는지, 빈칸·잘못된 금액이 거절되는지)을 적어 줘.
팀원 역할에는 이름 없이 역할만 적어 줘.`,
  },
];

export const itemOf = (id) => COPY_ITEMS.find((x) => x.id === id);

/** [복사] 단추로 클립보드에 넣을 글. p6 은 p1~p5 를 그 아래에 붙여 한 번에 준다(AI 활용 내역에 그대로 들어간다). */
export function copyOf(id) {
  const p = itemOf(id);
  if (!p) return '';
  if (!p.withPrevious) return p.text;
  const before = COPY_ITEMS.filter((x) => x.kind === 'prompt' && x.id < p.id).map((x) => `[${x.title}]\n${x.text}`).join('\n\n');
  return `${p.text}\n\n${before}`;
}
