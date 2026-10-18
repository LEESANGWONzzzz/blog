const test = require('node:test');
const assert = require('node:assert');
const { buildManuscript } = require('../scripts/export_manuscript');

test('원고: 제목 → 본문 → 이미지 자리 → 태그가 마지막 줄', () => {
  const { text, images } = buildManuscript({
    title: '제목입니다',
    tags: ['태그 하나', '#둘'],
    blocks: [
      { type: 'text', content: '첫 문단입니다.' },
      { type: 'subtitle', content: '질문인가요?' },
      { type: 'image', path: 'input/images/cards/a.png', caption: '캡션' },
      { type: 'divider' },
      { type: 'text', content: '출처: 국세청 (2026-10-18 확인)' },
    ],
  });
  assert.strictEqual(text.split('\n')[0], '제목입니다');
  assert.match(text, /\[이미지 1 삽입\]\n\(캡션\) 캡션/);
  assert.strictEqual(text.trim().split('\n').pop(), '#태그하나 #둘');
  assert.doesNotMatch(text, /\n{3,}/);
  assert.deepStrictEqual(images, ['[이미지 1] input/images/cards/a.png']);
});
