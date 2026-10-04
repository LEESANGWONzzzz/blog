const test = require('node:test');
const assert = require('node:assert');
const { parseCsv, loadPerformance, guessTitleHook, analyze, toMarkdown } = require('../scripts/analyze_performance');

test('CSV: 따옴표 안 쉼표·BOM·빈 줄 처리', () => {
  const rows = parseCsv('제목,조회수\r\n"A, B","1,234"\n\nC,5\n');
  assert.deepStrictEqual(rows, [['제목', '조회수'], ['A, B', '1,234'], ['C', '5']]);
  const posts = loadPerformance('﻿제목,조회수\n"A, B","1,234"\n');
  assert.deepStrictEqual(posts, [{ title: 'A, B', views: 1234 }]);
});

test('머리글이 없으면 오류', () => {
  assert.throws(() => loadPerformance('a,b\n1,2\n'), /제목/);
});

test('제목 유형 추정', () => {
  assert.strictEqual(guessTitleHook('ISA vs 연금저축 뭐가 나을까'), '비교형');
  assert.strictEqual(guessTitleHook('이거 모르면 연말정산 손해'), '손실회피형');
  assert.strictEqual(guessTitleHook('2026 청년도약계좌 조건 정리'), '숫자형');
  assert.strictEqual(guessTitleHook('달러예금 지금 들어도 될까요'), '질문형');
});

test('상위 그룹 교집합 단어와 초안 정보 결합', () => {
  const posts = [
    { title: '연금저축 한도 놓친 직장인 이야기', views: 900 },
    { title: '연금저축 세액공제 모르면 손해', views: 800 },
    { title: '연금저축 IRP 비교 정리', views: 700 },
    { title: '오늘의 환율 메모', views: 50 },
    { title: '주말 가계부 정리', views: 40 },
    { title: '청년 적금 후기', views: 30 },
    { title: '카드 포인트 정리', views: 20 },
    { title: '전기요금 메모', views: 10 },
  ];
  const index = new Map([['연금저축IRP비교정리', { title_hook: '비교형', hook_pattern: '반전형', keywords: { main: '연금저축 IRP' } }]]);
  const r = analyze(posts, index, 0.3);
  assert.strictEqual(r.topN, 3);
  assert.strictEqual(r.sharedWords[0].word, '연금저축');
  assert.strictEqual(r.sharedWords[0].top, 3);
  const irp = r.posts.find((p) => p.title.includes('IRP'));
  assert.strictEqual(irp.titleHookGuessed, false);
  assert.strictEqual(irp.hookPattern, '반전형');
  const md = toMarkdown(r, { date: '2026-10-04' });
  assert.match(md, /10개 미만/);
  assert.match(md, /연금저축 — 상위 3개/);
});
