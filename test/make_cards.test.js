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

test('새 카드 종류: table·compare·chart 계획 검사', () => {
  const base = { file: 'input/images/cards/_test-02.png', title: '제목' };
  assert.doesNotThrow(() => validatePlan([{ ...base, kind: 'table', theme: 'navy', rows: [['원금', '360만 원']], formula: ['360만 원', '×', '3.0%', '=', '10.8만 원'] }]));
  assert.throws(() => validatePlan([{ ...base, kind: 'table' }]), /rows/);
  assert.throws(() => validatePlan([{ ...base, kind: 'list', items: ['a'], theme: 'pink' }]), /theme/);
  assert.throws(() => validatePlan([{ ...base, kind: 'list', items: ['a'], bg: 'input/images/generated/x.png' }]), /bg/);
  assert.throws(() => validatePlan([{ ...base, kind: 'compare', left: { title: 'A', items: ['x'] } }]), /right/);
  const chart = { ...base, kind: 'chart', chart: { type: 'bar', unit: '%', points: [{ label: '2024', value: '3.0' }, { label: '2025', value: 2.5 }] }, note: '출처: 한국은행 · 2025-12-31' };
  assert.doesNotThrow(() => validatePlan([chart]));
  assert.throws(() => validatePlan([{ ...chart, note: undefined }]), /출처/);
  assert.throws(() => validatePlan([{ ...chart, chart: { type: 'pie', points: chart.chart.points } }]), /bar/);
});

test('표·계산식·그래프 숫자도 본문 대조', () => {
  const draft = { blocks: [{ type: 'text', content: '2024년 3.0%에서 2025년 2.5%로 내려갔습니다. 원금은 360만 원입니다.' }] };
  const chart = { file: 'input/images/cards/_t.png', kind: 'chart', title: '금리', chart: { type: 'line', unit: '%', points: [{ label: '2024년', value: '3.0' }, { label: '2025년', value: '2.5' }] } };
  assert.deepStrictEqual(checkAgainstDraft([chart], draft), []);
  const table = { file: 'input/images/cards/_t.png', kind: 'table', title: '계산', rows: [['원금', '360만 원']], formula: ['360만 원', '×', '4.0%'] };
  assert.deepStrictEqual(checkAgainstDraft([table], draft), ['input/images/cards/_t.png: "4.0%"']);
});
