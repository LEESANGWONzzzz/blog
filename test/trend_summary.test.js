const test = require('node:test');
const assert = require('node:assert');
const { formatTrends } = require('../scripts/advisor_trends');
const { parseTrendFile, summarize, toMarkdown } = require('../scripts/trend_summary');

const day = (order, titles) => formatTrends({
  '/accounts/preferred-category/x': { categoryTree: [{ categories: order.map((name, i) => ({ id: i + 1, name })) }] },
  '/trend/category-inflow-ranks?date=2026-11-01': { data: order.map((_, i) => String(i + 1)) },
  '/trend/main-inflow-content-ranks?date=2026-11-01': { data: titles.map((title) => ({ title })) },
}).markdown;

test('advisor_trends 파일에서 주제 순위·홈판 제목을 다시 읽는다', () => {
  const p = parseTrendFile(day(['스타·연예인', '비즈니스·경제'], ['열흘 만에 가격이 바뀌었는데…', '40대 순자산 평균은?']));
  assert.deepStrictEqual(p.order, ['스타·연예인', '비즈니스·경제']);
  assert.deepStrictEqual(p.titles, ['열흘 만에 가격이 바뀌었는데…', '40대 순자산 평균은?']);
});

test('여러 날 요약: 자주·높게 나온 주제 먼저, 제목 패턴 비율', () => {
  const days = [
    parseTrendFile(day(['패션·미용', '스타·연예인'], ['이 가격이면 살까…', '3년 만에 바뀐 이유'])),
    parseTrendFile(day(['스타·연예인', '비즈니스·경제'], ['월급 300이면 얼마?'])),
  ];
  const s = summarize(days);
  assert.strictEqual(s.topics[0].name, '스타·연예인');
  assert.strictEqual(s.topics[0].days, 2);
  const cut = s.patterns.find((x) => x.name.startsWith('답을 뒤로'));
  assert.strictEqual(cut.count, 1);
  assert.strictEqual(s.patterns.find((x) => x.name === '숫자 들어감').count, 2);
  assert.match(toMarkdown(s, ['2026-11-01', '2026-11-02']), /2026-11-01 ~ 2026-11-02 \(2일\)/);
});
