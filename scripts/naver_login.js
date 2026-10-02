#!/usr/bin/env node
// 프로젝트 전용 브라우저 프로필(naver-profile/)로 네이버에 로그인해 세션을 저장한다.
// 아이디·비밀번호·2단계 인증은 사람이 브라우저 창에 직접 입력한다. 이 스크립트는 비밀번호를 받지도, 저장하지도 않는다.
//
// 사용: node scripts/naver_login.js   (로그인을 마친 뒤 이 터미널로 돌아와 Enter)

const readline = require('readline');
const { chromium } = require('playwright');
const { PROFILE_DIR, loadConfig } = require('./lib/config');
const { installGuard } = require('./lib/publish_guard');
const SEL = require('./lib/selectors');

function waitForEnter(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, () => {
    rl.close();
    resolve();
  }));
}

async function hasSession(context) {
  const cookies = await context.cookies('https://naver.com');
  const names = new Set(cookies.map((c) => c.name));
  return SEL.sessionCookies.every((n) => names.has(n));
}

async function main() {
  const config = loadConfig();
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });
  await installGuard(context);

  try {
    const page = context.pages()[0] || (await context.newPage());
    if (await hasSession(context)) {
      console.log('이미 로그인 세션이 있습니다. 다시 로그인하려면 브라우저 창에서 로그아웃 후 진행하세요.');
    }
    await page.goto(SEL.loginUrl);
    console.log('\n브라우저 창에서 네이버 아이디·비밀번호·2단계 인증을 직접 완료하세요.');
    console.log('(로그인 상태 유지에 체크하면 세션이 더 오래 갑니다.)');
    await waitForEnter('로그인을 마쳤으면 이 터미널을 클릭한 뒤 Enter를 누르세요 > ');

    if (!(await hasSession(context))) {
      console.error('✖ 로그인 쿠키를 찾지 못했습니다. 로그인이 끝나지 않은 것 같습니다. 다시 실행해 주세요.');
      process.exitCode = 1;
      return;
    }
    if (!config.blogId) {
      console.log('⚠ data/config.json에 blogId가 없습니다. 블로그 주소 blog.naver.com/<여기> 값을 넣어 주세요.');
    }
    console.log('✓ 로그인 세션 저장 완료 (naver-profile/ — 외부 공유 금지)');
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
