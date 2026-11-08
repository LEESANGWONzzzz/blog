#!/usr/bin/env node
// 저장된 네이버 로그인이 살아 있는지 확인만 한다 (창 없이, 아무것도 입력·저장하지 않음).
// 사용: node scripts/session_check.js   (BLOG_ACCOUNT=easypapa 면 이지파파 프로필)
// 종료 코드: 0 = 로그인 있음, 1 = 없음
const fs = require('fs');
const { chromium } = require('playwright');
const { PROFILE_DIR, ACCOUNT } = require('./lib/config');
const { sessionStatus } = require('./lib/session');

(async () => {
  const who = ACCOUNT || '기본(경제 블로그)';
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log(`✖ [${who}] 로그인 폴더가 없습니다 (${PROFILE_DIR}). naver_login.js 를 먼저 실행하세요.`);
    process.exit(1);
  }
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true });
  try {
    const s = await sessionStatus(ctx);
    if (s.ok) {
      console.log(`✔ [${who}] 네이버 로그인 있음${s.persistent ? '' : ' (단, 브라우저를 닫으면 지워지는 로그인 — "로그인 상태 유지"로 다시 로그인 권장)'}`);
      process.exitCode = 0;
    } else {
      console.log(`✖ [${who}] 네이버 로그인 없음 (빠진 쿠키: ${s.missing.join(', ')}). naver_login.js 로 다시 로그인하고 "로그인 상태 유지"를 체크하세요.`);
      process.exitCode = 1;
    }
  } finally {
    await ctx.close();
  }
})();
