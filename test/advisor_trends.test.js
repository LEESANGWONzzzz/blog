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

test('formatOwnRanks: 우리 글 조회수 목록을 찾고 트렌드(남의 글)는 뺀다', () => {
  const { formatOwnRanks } = require('../scripts/advisor_trends');
  const own = {
    '/trend/main-inflow-content-ranks?date=2026-11-04': { data: [{ title: '남의 홈판 글', cv: 999 }] },
    '/blog/menu?x=1': { data: [{ title: '메뉴', id: 1 }] },
    '/stats/cv-ranks?date=2026-11-04': {
      data: { list: [
        { title: '성시경 연말 콘서트 일반예매 12일 8시', cv: 42, publishDate: '2026-11-04 07:00' },
        { title: '종합소득세 중간예납 11월 30일까지', cv: 9 },
      ] },
    },
  };
  const { markdown, count } = formatOwnRanks(own);
  assert.strictEqual(count, 2);
  assert.match(markdown, /1\. 성시경 연말 콘서트 일반예매 12일 8시 — 조회 42 \(2026-11-04 07:00\)/);
  assert.match(markdown, /2\. 종합소득세 중간예납 11월 30일까지 — 조회 9/);
  assert.doesNotMatch(markdown, /남의 홈판 글/);
});

test('formatOwnRanks: 목록이 없으면 화면 글자를 남긴다', () => {
  const { formatOwnRanks } = require('../scripts/advisor_trends');
  const { markdown, count } = formatOwnRanks({}, { screenText: '조회수 순위\n1 글 42' });
  assert.strictEqual(count, 0);
  assert.match(markdown, /화면 글자를 그대로/);
  assert.match(markdown, /1 글 42/);
});

test('trend_summary는 우리 글 조회수 섹션을 홈판 제목으로 읽지 않는다', () => {
  const { parseTrendFile } = require('../scripts/trend_summary');
  const { formatOwnRanks } = require('../scripts/advisor_trends');
  const md = formatTrends({ '/trend/main-inflow-content-ranks?date=2026-11-04': { data: [{ title: '홈판 글' }] } }, {}).markdown
    + '\n' + formatOwnRanks({ '/cv-ranks': { data: [{ title: '우리 글', cv: 3 }] } }).markdown;
  assert.deepStrictEqual(parseTrendFile(md).titles, ['홈판 글']);
});
