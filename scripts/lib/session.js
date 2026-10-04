// 네이버 로그인 쿠키 상태 확인.
// "로그인 상태 유지"를 체크하지 않으면 로그인 쿠키가 세션 쿠키(만료일 없음)로 저장돼
// 브라우저를 닫는 순간 지워진다. 그러면 naver_draft.js에서 "로그인 세션이 없습니다"가 난다.
const SEL = require('./selectors');

async function sessionStatus(context) {
  const cookies = await context.cookies('https://naver.com');
  const byName = new Map(cookies.map((c) => [c.name, c]));
  const missing = SEL.sessionCookies.filter((n) => !byName.has(n));
  // Playwright는 세션 쿠키의 expires를 -1로 준다.
  const sessionOnly = SEL.sessionCookies.filter((n) => byName.has(n) && byName.get(n).expires === -1);
  return { ok: missing.length === 0, missing, sessionOnly, persistent: missing.length === 0 && sessionOnly.length === 0 };
}

module.exports = { sessionStatus };
