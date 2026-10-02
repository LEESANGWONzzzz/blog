// 발행 가드를 실제 브라우저(로컬 HTML)로 검증한다. 네이버에 접속하지 않는다.
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { installGuard, assertGuard, safeClick } = require('../scripts/lib/publish_guard');

const HTML = `
<button data-testid="seOnePublishBtn" onclick="window.published='testid'">확인</button>
<button id="text-publish" onclick="window.published='text'">발행</button>
<button id="save" onclick="window.saved=true">저장</button>
<iframe srcdoc="<button onclick=&quot;parent.framePublished=true&quot;>발행</button>"></iframe>`;

let browser;
let context;
let page;

test.before(async () => {
  // 브라우저 버전이 안 맞는 환경에서는 PW_CHROMIUM_PATH로 실행 파일을 지정할 수 있다.
  browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  context = await browser.newContext();
  await installGuard(context);
  page = await context.newPage();
  // setContent()는 document.open()을 써서 리스너를 지우므로, 실제 탐색(goto)으로 연다.
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`);
});

test.after(async () => {
  await browser.close();
});

test('가드가 페이지와 iframe에 설치된다', async () => {
  await assertGuard(page, 'page');
  await assertGuard(page.frames()[1], 'iframe');
});

test('사람이 발행 버튼을 눌러도 막힌다 (셀렉터·글자·iframe)', async () => {
  await page.click('button[data-testid="seOnePublishBtn"]');
  await page.click('#text-publish');
  await page.frames()[1].click('button');
  await page.focus('#text-publish');
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.evaluate(() => window.published), undefined);
  assert.strictEqual(await page.evaluate(() => window.framePublished), undefined);
});

test('safeClick은 발행 버튼에서 예외, 저장 버튼은 통과', async () => {
  await assert.rejects(safeClick(page.locator('#text-publish')), /발행 버튼 클릭 시도/);
  await assert.rejects(safeClick(page.locator('[data-testid="seOnePublishBtn"]')), /발행 버튼 클릭 시도/);
  await safeClick(page.locator('#save'));
  assert.strictEqual(await page.evaluate(() => window.saved), true);
});

test('리스너가 지워지면(document.open) assertGuard가 잡아낸다', async () => {
  const p2 = await context.newPage();
  await p2.goto('data:text/html,<p>x</p>');
  await assertGuard(p2, 'before');
  await p2.setContent('<button>발행</button>');
  await assert.rejects(assertGuard(p2, 'after-document-open'), /bypassed/);
  await p2.close();
});

test('가드가 없는 컨텍스트는 assertGuard가 실패한다', async () => {
  const bare = await browser.newPage();
  await assert.rejects(assertGuard(bare, 'bare'), /가드 설치 실패/);
  await bare.close();
});
