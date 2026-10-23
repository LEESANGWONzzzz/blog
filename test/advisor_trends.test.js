const test = require('node:test');
const assert = require('node:assert');
const { formatTrends } = require('../scripts/advisor_trends');

test('formatTrends: 주제 이름 매핑·우선 주제 순서·홈판 상위 글', () => {
  const captured = {
    '/accounts/preferred-category/naver_blog?': {
      categoryTree: [{ categories: [{ id: 'star', name: '스타·연예인' }, { id: 'travel', name: '국내여행' }, { id: 'biz', name: '비즈니스·경제' }] }],
    },
    '/trend/category?service=naver_blog&categories=travel%2Cstar&date=2026-10-17': {
      data: [
        { category: 'travel', queryList: [{ query: '단풍 명소', rank: 1, rankChange: 3 }] },
        { category: 'star', queryList: [{ query: '하영', rank: 1, rankChange: 0 }, { query: '안상호', rank: 2, rankChange: -1 }, { query: '정윤하', rank: 3 }] },
      ],
    },
    '/trend/main-inflow-content-ranks?service=naver_blog&interval=day&date=2026-10-17': {
      data: [{ title: '홈판 글 하나', url: 'https://blog.naver.com/x/1' }],
    },
    '/trend/main-inflow-referrer-domain?service=naver_blog&interval=day&date=2026-10-17': {
      data: [{ referrerDomain: 'm.naver.com', ratio: 0.8343 }],
    },
  };
  const { markdown, counts } = formatTrends(captured, { date: '2026-10-17' });
  assert.deepStrictEqual(counts, { topics: 2, mainContents: 1 });
  assert.ok(markdown.indexOf('### 스타·연예인') < markdown.indexOf('### 국내여행'));
  assert.match(markdown, /1\. 하영 \(-\)/);
  assert.match(markdown, /2\. 안상호 \(▼1\)/);
  assert.match(markdown, /3\. 정윤하 \(new\)/);
  assert.match(markdown, /1\. 홈판 글 하나/);
  assert.doesNotMatch(markdown, /blog\.naver\.com\/x/); // 남의 글 주소는 적지 않는다
  assert.match(markdown, /m\.naver\.com 83\.4%/);
});

test('formatTrends: 데이터가 없으면 받지 못함 표시', () => {
  const { markdown, counts } = formatTrends({}, {});
  assert.deepStrictEqual(counts, { topics: 0, mainContents: 0 });
  assert.match(markdown, /받지 못함/);
});

test('hasData: 빈 목록만 받았으면 false', () => {
  const { hasData } = require('../scripts/advisor_trends');
  assert.strictEqual(hasData({ '/trend/main-inflow-content-ranks?date=2026-10-23': { data: [] } }), false);
  assert.strictEqual(hasData({ '/trend/main-inflow-content-ranks?date=2026-10-22': { data: [{ title: 'a' }] } }), true);
});
