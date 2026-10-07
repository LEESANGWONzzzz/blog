const test = require('node:test');
const assert = require('node:assert');
const { tagLine, editorBlocks, expectedPieces, expectedStructure } = require('../scripts/naver_draft');

const draft = {
  blocks: [{ type: 'text', content: '본문입니다.' }, { type: 'text', content: '면책 문구입니다.' }],
  tags: ['온누리상품권', '#소상공인', '골목 상권'],
};

test('태그 문단: # 붙이고 공백 제거', () => {
  assert.strictEqual(tagLine(draft.tags), '#온누리상품권 #소상공인 #골목상권');
  assert.strictEqual(tagLine([]), '');
});

test('태그 문단은 맨 끝에 붙고 대조·구조 검사에도 들어간다', () => {
  const blocks = editorBlocks(draft);
  assert.strictEqual(blocks.length, 3);
  assert.strictEqual(blocks[2].content, '#온누리상품권 #소상공인 #골목상권');
  assert.deepStrictEqual(expectedPieces(draft, blocks).slice(-1), ['#온누리상품권 #소상공인 #골목상권']);
  assert.deepStrictEqual(expectedStructure(blocks), expectedStructure(draft.blocks)); // 연속 text는 하나로 묶임
});

test('끄기·테스트 초안이면 붙이지 않는다', () => {
  assert.strictEqual(editorBlocks(draft, { tagsInBody: false }).length, 2);
  assert.strictEqual(editorBlocks({ ...draft, test: true }).length, 2);
});
