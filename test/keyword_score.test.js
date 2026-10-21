const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { signature, parseCount, scoreRows, toMarkdown } = require('../scripts/keyword_score');

test('서명: 공식 샘플과 같은 "timestamp.method.uri" HMAC-SHA256 base64', () => {
  const expected = crypto.createHmac('sha256', 's3cret').update('1700000000000.GET./keywordstool').digest('base64');
  assert.strictEqual(signature('1700000000000', 'GET', '/keywordstool', 's3cret'), expected);
});

test('검색량: "< 10"은 5, 숫자 문자열도 읽는다', () => {
  assert.strictEqual(parseCount('< 10'), 5);
  assert.strictEqual(parseCount(1230), 1230);
  assert.strictEqual(parseCount('4,560'), 4560);
});

test('경쟁도: 문서 수 ÷ 검색량 낮은 순, 검색량 적은 키워드는 제외', () => {
  const scored = scoreRows([
    { keyword: '경쟁심함', searches: 1000, docs: 500000 },
    { keyword: '기회', searches: 3000, docs: 3000 },
    { keyword: '너무적음', searches: 50, docs: 10 },
  ]);
  assert.deepStrictEqual(scored.map((r) => r.keyword), ['기회', '경쟁심함']);
  assert.match(toMarkdown(scored, { date: '2026-10-19', hints: ['a'] }), /\| 1 \| 기회 \| 3,000 \| 3,000 \| 1\.0 \|  \|/);
});

test('행동형 검색어 표시', () => {
  const { isAction } = require('../scripts/keyword_score');
  assert.strictEqual(isAction('근로장려금신청기간'), true);
  assert.strictEqual(isAction('근로장려금뜻'), false);
});

test('트렌드 검색어: 비즈니스·경제가 없으면 모든 주제 검색어', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { latestTrendQueries } = require('../scripts/keyword_score');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trends-'));
  assert.deepStrictEqual(latestTrendQueries(undefined, dir), { file: null, queries: [] });
  fs.writeFileSync(path.join(dir, '2026-10-20.md'), '### 스타·연예인\n1. 하영 (-)\n2. 안상호 (▼1)\n');
  assert.deepStrictEqual(latestTrendQueries(undefined, dir).queries, ['하영', '안상호']);
  fs.writeFileSync(path.join(dir, '2026-10-21.md'), '### 스타·연예인\n1. 하영 (-)\n### 비즈니스·경제\n1. 근로장려금 (▲2)\n');
  assert.deepStrictEqual(latestTrendQueries(undefined, dir), { file: '2026-10-21.md', queries: ['근로장려금'] });
});
