// 정보 카드: 계획 검사, 숫자 대조, 실제 렌더링(로컬 브라우저, 네트워크 없음)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { validatePlan, numberTokens, checkAgainstDraft, render } = require('../scripts/make_cards');
const { resolveFromRoot } = require('../scripts/lib/config');

const card = { file: 'input/images/cards/_test-01.png', kind: 'number', title: '한 달 납입 한도', big: '최대 50만 원', items: ['만기 3년'] };

test('계획 검사', () => {
  assert.doesNotThrow(() => validatePlan([card]));
  assert.throws(() => validatePlan([{ ...card, file: 'input/images/generated/x.png' }]), /cards/);
  assert.throws(() => validatePlan([{ ...card, kind: 'quote' }]), /kind/);
  assert.throws(() => validatePlan([{ ...card, big: undefined }]), /big/);
  assert.throws(() => validatePlan([{ ...card, items: ['1', '2', '3', '4', '5', '6'] }]), /5개/);
});

test('숫자 표현 추출', () => {
  assert.deepStrictEqual(numberTokens('월 최대 50만 원, 6% 또는 12%, 10월 7일'), ['50만원', '6%', '12%', '10월', '7일']);
});

test('카드 숫자가 본문에 없으면 잡아낸다', () => {
  const draft = { blocks: [{ type: 'text', content: '월 납입은 최대 50만 원이고 만기는 3년입니다.' }] };
  assert.deepStrictEqual(checkAgainstDraft([card], draft), []);
  const wrong = { ...card, big: '최대 60만 원' };
  assert.deepStrictEqual(checkAgainstDraft([wrong], draft), ['input/images/cards/_test-01.png: "60만원"']);
});

test('실제 PNG 렌더링, 넘치는 글자는 실패', async () => {
  const opts = { executablePath: process.env.PW_CHROMIUM_PATH };
  const abs = resolveFromRoot(card.file);
  try {
    await render([card], opts);
    const buf = fs.readFileSync(abs);
    assert.strictEqual(buf.subarray(1, 4).toString(), 'PNG');
    const long = { ...card, kind: 'list', big: undefined, items: Array(5).fill('아주 긴 항목 '.repeat(12)) };
    await assert.rejects(render([long], opts), /다 안 들어갑니다/);
  } finally {
    fs.rmSync(abs, { force: true });
  }
});
