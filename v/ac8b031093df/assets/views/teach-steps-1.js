// 진행표 1/3: 입장·출석·오리엔테이션, 1단계. 필드: acts(강사가 할 일 — min 분, text, say 할 말, script 낭독 대본, copy 복사할 글, panel 인라인 칸),
// team(팀이 할 일, 교육 따라 하기 화면에도 나온다), tips(참고), ask(끝날 때 묻는 말), late(늦으면).
import { STARTER_URL } from './teach-consts.js';

export const STEPS_1 = [
  {
    id: 'prep', kind: 'prep', min: 0, title: '교육 전 준비',
    goal: '교육 시작 30분 전까지 시연 환경을 만들어 둔다. 시계는 [교육 시작]을 누를 때부터 간다.',
    acts: [
      { min: 0, text: '강의실 인터넷(학교 와이파이), 프로젝터, 전원 콘센트(팀당 2구 이상)를 확인한다. 와이파이가 느리면 휴대전화 핫스팟을 대안으로 안내한다.' },
      { min: 0, text: `시연 저장소를 미리 만든다. 시작 저장소(${STARTER_URL})로 이번 회차의 \`demo-dues-N\`(N은 회차 번호, 예: \`demo-dues-1\`)을 **Public**으로 만들고, 그 Codespace를 열어 터미널에 아래 세 줄 가운데 앞의 두 줄(\`git config …\`, \`npm install\`)까지 넣어 둔다. 지난 회차의 시연 저장소는 지우지 않고 회차마다 번호를 올린다.`, copy: ['setup'] },
      { min: 0, text: 'Codespace는 30분 동안 쓰지 않으면 멈춘다. 시연 계정의 GitHub 설정(Settings → Codespaces → Default idle timeout)을 240분으로 올려 둔다. 멈춰 있으면 [Restart codespace]를 누르고 1분쯤 기다린다.' },
      { min: 0, text: '시연 PC의 브라우저 탭을 열어 둔다: GitHub 로그인, 시작 저장소, `demo-dues-N`의 Codespace, 전날 리허설한 `demo-rehearsal-N`(AI가 엉뚱한 결과를 내거나 느리면 이것을 띄워 같은 장면을 보여 주고 넘어간다), 이 강사 화면, 「교육 따라 하기」 화면. 프로젝터에서 코드가 보이도록 브라우저 화면을 키운다(Ctrl 키와 + 키, 맥은 Cmd 키와 + 키).' },
      { min: 0, text: '시연 계정의 Copilot 무료 플랜 채팅 한도가 남았는지 확인한다. 한도에 걸리면 같은 요청을 브라우저 AI 채팅에 넣어 이어 간다.' },
    ],
    team: [],
    prep: [
      '강의실 인터넷·프로젝터·전원을 확인했다',
      '시연 저장소 `demo-dues-N`을 Public으로 만들고 Codespace에서 `git config`와 `npm install`을 해 두었다',
      'Codespaces 유휴 시간을 240분으로 올렸다',
      '시연 PC의 탭을 열어 두었다(GitHub·시작 저장소·시연 Codespace·리허설 저장소·이 화면·교육 따라 하기)',
      'Copilot 무료 한도가 남아 있다',
    ],
    tips: ['교육 전날: 시연 네 단계를 처음부터 끝까지 한 번 해 보고, 그 결과 저장소 `demo-rehearsal-N`을 지우지 않고 둔다(같은 이름으로는 다시 만들 수 없으니 회차마다 번호를 올린다).'],
  },
  {
    id: 'open', kind: 'open', min: 7, title: '입장·출석·오리엔테이션',
    goal: '출석을 확인하고, 오늘 할 일과 웹앱의 구조를 알려 준다.',
    acts: [
      { min: 2, text: '팀별로 모여 앉게 하고 와이파이와 전원을 연결하게 한다. 출석을 확인한다(팀마다 [전원] 또는 온 사람만 누른다).', panel: 'roster' },
      { min: 3, text: '오리엔테이션 대본을 글자 그대로 읽는다.', script: 'a1' },
      { min: 2, text: '웹앱의 구조 표를 화면에 띄워 1분 설명하고, 세 낱말(저장소·커밋·동기화)을 알려 준다. 학생에게 「교육 따라 하기」 주소를 알려 준다.', panel: 'structure' },
    ],
    team: [],
    ask: '노트북이 켜지고 와이파이에 연결된 팀은 손을 들어 주세요.',
  },
  {
    id: 's1', kind: 'lesson', min: 15, title: '1단계 · 팀 저장소와 Codespaces',
    goal: '팀원 4명이 같은 저장소의 Codespace에서 앱을 띄우고, 커밋을 한 번씩 올린다.',
    acts: [
      { min: 1, text: `시작 저장소(${STARTER_URL})에서 [Use this template] → [Create a new repository]의 이름 칸과 Public을 보여 준다. 만들기는 누르지 않고, 교육 전에 같은 방법으로 만든 시연 저장소로 넘어간다.`, say: '팀장이 이렇게 팀 저장소를 만듭니다. 이름에 팀명이나 이름을 넣지 않습니다.' },
      { min: 1, text: '시연 저장소의 [Settings] → [Collaborators] → [Add people] 화면만 보여 준다.', say: '팀원 세 명을 GitHub 아이디로 초대하고, 팀원은 수락합니다. 수락한 뒤에 Codespace를 엽니다.' },
      { min: 1, text: '[Code] → [Codespaces] 탭의 [Create codespace on main] 단추를 보여 주고, 미리 열어 둔 Codespace 탭으로 바꾼다. 터미널에 npm run dev → [Open in Browser] → 항목 하나를 추가한다.', say: '설치 없이 브라우저 안에서 편집기와 터미널을 씁니다. 이 화면이 프론트엔드, 터미널에서 돌아가는 것이 백엔드입니다.', copy: 'setup' },
      { min: 1, text: 'README.md의 팀원 역할 한 줄을 고치고 [Source Control] → 메시지 → [Commit] → [Sync Changes]. GitHub 저장소 화면에서 커밋을 확인한다.', say: '받아 오고, 고치고, 커밋하고, 올립니다. 이 순서를 지키면 팀원과 겹치지 않습니다.' },
    ],
    team: [
      '팀장: 시작 저장소 화면에서 [Use this template] → [Create a new repository] → 이름 `practice` → **Public** → [Create repository].',
      '팀장: [Settings] → [Collaborators] → [Add people]로 팀원 3명을 GitHub 아이디로 초대한다. 팀원: 주소창에 `github.com/팀장아이디/practice`를 열고 [View invitation] → [Accept invitation]으로 **초대를 수락한다**. 수락하기 전에 Codespace를 열면 올릴 때 포크(fork)를 만들라는 창이 뜬다. 그때는 그 Codespace를 지우고(github.com/codespaces) 수락한 뒤 새로 연다.',
      '팀원 각자: 저장소 첫 화면에서 [Code] → [Codespaces] 탭 → [Create codespace on main]. 편집기가 열린다(처음에는 1~2분).',
      '아래쪽 터미널에 세 줄을 차례로 넣는다(아래 [복사]).',
      '「서버가 켜졌습니다」가 나오면 [Open in Browser]를 누른다. 알림을 놓쳤으면 터미널 옆 [PORTS] 탭의 3000 줄에서 지구본 모양을 누른다. 시작 앱에서 항목을 하나 추가해 본다.',
      '차례로 커밋·동기화한다(기획 → 프론트엔드 → 백엔드 → 검증). 앞 사람이 「올렸다」고 하면 다음 사람이 [Source Control] → 위쪽 …(점 세 개) 메뉴 → [Pull]로 받아 오고, `README.md`의 「팀원 역할」에서 자기 줄 하나를 채운 뒤(예: `- 백엔드: API와 저장`, 이름은 쓰지 않는다) 메시지를 적고 [Commit] → [Sync Changes]. **자기 차례 전에는 README를 고치지 않는다.**',
      '마지막 사람이 올리면 팀장이 GitHub 저장소 화면을 새로 고쳐 커밋 목록에 팀원 4명이 모두 있는지 본다.',
    ],
    copy: ['setup'],
    tips: [
      '이 저장소(`practice`)는 연습용이다. 예선 저장소는 [예선 시작] 뒤에 같은 방법으로 새로 만든다.',
      'github.dev(키보드 `.`)는 터미널이 없어 서버를 켤 수 없다. 꼭 [Code] → [Codespaces]로 연다.',
    ],
    ask: '팀원 4명 모두 앱이 떠 있고 커밋이 올라온 팀은 손을 들어 주세요.',
    late: '6번(차례로 커밋)은 2단계의 첫 올리기로 대신해도 된다.',
  },
];
