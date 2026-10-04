// 로그인 쿠키 판정을 가짜 쿠키로 확인한다. 네이버에 접속하지 않는다.
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { sessionStatus } = require('../scripts/lib/session');

const launch = () => chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const cookie = (name, expires) => ({ name, value: 'x', domain: '.naver.com', path: '/', ...(expires ? { expires } : {}) });

test('쿠키 없음 / 임시 쿠키 / 유지 쿠키 판정', async () => {
  const browser = await launch();
  try {
    const empty = await browser.newContext();
    assert.deepStrictEqual(await sessionStatus(empty), { ok: false, missing: ['NID_AUT', 'NID_SES'], sessionOnly: [], persistent: false });

    const temp = await browser.newContext();
    await temp.addCookies([cookie('NID_AUT'), cookie('NID_SES')]);
    const t = await sessionStatus(temp);
    assert.strictEqual(t.ok, true);
    assert.deepStrictEqual(t.sessionOnly, ['NID_AUT', 'NID_SES']);
    assert.strictEqual(t.persistent, false);

    const kept = await browser.newContext();
    const nextYear = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    await kept.addCookies([cookie('NID_AUT', nextYear), cookie('NID_SES', nextYear)]);
    assert.strictEqual((await sessionStatus(kept)).persistent, true);
  } finally {
    await browser.close();
  }
});
