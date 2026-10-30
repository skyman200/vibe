// 강사 콘솔의 현황 계산(순수 함수 — 화면 코드를 가져오지 않는다. Node 시험이 그대로 읽는다): 출석, 시작·첫 제출, [결과 복사] 글.
// 출석 명단 teams 는 공개 참가현황의 접수 완료 팀 [{ key, name, members: [{ name }] }], checked 는 { 'teamKey:번호': true }.

const mark = (t, i) => `${t.key}:${i}`;

/** 세션 코드마다 시작한 팀을 이름 → 첫 제출 여부로 합친다(같은 팀이 여러 코드에 있으면 제출한 쪽을 쓴다). skip 은 건너뛸 세션 id. */
export function startedNames(data, skip = []) {
  const names = new Map();
  data.sessions.filter((s) => s.teams.length && !skip.includes(s.id)).forEach((s) => s.teams.forEach((t) => {
    if (!names.has(t.name) || t.submitted) names.set(t.name, t.submitted);
  }));
  return names;
}

/** 한 명이라도 출석 체크한 팀 */
export function presentTeams(teams, checked) {
  return (teams || []).filter((t) => t.members.some((m, i) => checked[mark(t, i)]));
}

/** 출석: 온 사람 수 / 접수 명단 전체, 한 명 이상 온 팀 수, 온 팀 가운데 팀원이 빠진 팀 이름 */
export function attendance(teams, checked) {
  const all = teams || [];
  const present = presentTeams(all, checked);
  return {
    here: all.reduce((n, t) => n + t.members.filter((m, i) => checked[mark(t, i)]).length, 0),
    total: all.reduce((n, t) => n + t.members.length, 0),
    n: present.length,
    absent: present.filter((t) => t.members.some((m, i) => !checked[mark(t, i)])).map((t) => t.name),
  };
}

/**
 * 시작 현황: 분모는 출석 체크한 팀. missing 은 아직 시작하지 않은 팀, notSubmitted 는 시작했지만 첫 제출 전인 팀,
 * unchecked 는 이번 교육 중에 시작했는데 출석 체크가 없는 팀(출석 칸에서 체크하면 현황에 들어간다).
 * before 는 [교육 시작] 때 이미 있던 세션 id — 지난 회차의 세션에서 시작한 팀을 unchecked 에 넣지 않으려고 뺀다(시계를 비교하지 않는다:
 * 서버와 이 PC 의 시계가 다를 수 있다).
 */
export function startStatus(data, teams, checked, before = []) {
  const names = startedNames(data);
  const present = presentTeams(teams, checked);
  const presentNames = new Set(present.map((t) => t.name));
  return {
    total: present.length,
    started: present.filter((t) => names.has(t.name)).length,
    submitted: present.filter((t) => names.get(t.name)).length,
    missing: present.filter((t) => !names.has(t.name)).map((t) => t.name),
    notSubmitted: present.filter((t) => names.has(t.name) && !names.get(t.name)).map((t) => t.name),
    unchecked: [...startedNames(data, before).keys()].filter((n) => !presentNames.has(n)),
  };
}

/** [결과 복사]로 만드는 글: 운영 담당 단톡방에 그대로 붙여 넣는다. */
export function summaryText({ label, att, status, notes, clockAt }) {
  const lines = [
    `[의무 교육 결과] ${label || '회차'} · ${clockAt}`,
    `출석: ${att.here}/${att.total}명 (팀 ${att.n}개)`,
    `예선 시작: ${status.started}팀 · 첫 제출 ${status.submitted}팀`,
  ];
  if (status.missing.length) lines.push(`아직 시작하지 않은 팀: ${status.missing.join(', ')}`);
  if (att.absent.length) lines.push(`결석이 있는 팀: ${att.absent.join(', ')}`);
  if (status.unchecked.length) lines.push(`출석 체크 없이 시작한 팀: ${status.unchecked.join(', ')}`);
  if (notes.trim()) lines.push('받은 질문·특이사항:', notes.trim());
  return lines.join('\n');
}
