const test = require('node:test');
const assert = require('node:assert');
const { lintDraft } = require('../scripts/lint_draft');
const { compareInOrder } = require('../scripts/naver_draft');

const para = (s) => ({ type: 'text', content: s });

function validDraft() {
  const filler = '연금저축 세액공제 한도는 국세청 기준으로 확인됩니다. 저도 처음엔 몰랐어요.';
  const blocks = [para('2026 연금저축 세액공제 한도 때문에 고민이시죠. 저도 그랬어요.')];
  for (let i = 0; i < 8; i += 1) {
    blocks.push({ type: 'subtitle', content: `연금저축 한도 질문 ${i}은 무엇인가요?` });
    blocks.push(para(filler.repeat(2)));
    blocks.push({ type: 'image', path: `input/photos/_mosaic/${i}.jpg`, caption: i % 2 ? '' : '캡션' });
    blocks.push(para(filler.repeat(2)));
  }
  blocks.push(para('투자 판단과 책임은 본인에게 있습니다.'));
  return {
    title: '2026 연금저축 세액공제 한도 직장인이 놓친 조건',
    persona: { 연령직군: '37세 직장인', 소득구간: '5800만', 자산단계: '현금 3천', 투자경험: 'ETF 6개월', 현재감정: '불안' },
    keywords: { main: '2026 연금저축 세액공제 한도', sub: ['연금저축 한도', '세액공제'] },
    hook_pattern: '공감형',
    sponsored: null,
    blocks: blocks.filter((b, i) => !(b.type === 'image' && i > 30)),
    tags: ['연금저축', '세액공제', '연말정산', '절세', '직장인'],
    place: null,
    video: null,
  };
}

test('확인필요 마커가 있으면 저장 불가', () => {
  const d = validDraft();
  d.blocks[1] = para('한도는 [[확인필요: 연금저축 세액공제 한도 2026]]입니다.');
  const r = lintDraft(d);
  assert.ok(r.errors.some((e) => e.includes('확인필요')));
});

test('quote 블록과 빈 블록은 오류', () => {
  const d = validDraft();
  d.blocks.splice(2, 0, { type: 'quote', content: '강조' }, para('  '));
  const r = lintDraft(d);
  assert.ok(r.errors.some((e) => e.includes('quote 금지')));
  assert.ok(r.errors.some((e) => e.includes('빈 text')));
});

test('제목 특수문자·길이 검사', () => {
  const d = validDraft();
  d.title = '연금저축!! 한도';
  const r = lintDraft(d);
  assert.ok(r.errors.some((e) => e.includes('특수문자')));
  assert.ok(r.errors.some((e) => e.includes('title 길이')));
});

test('텍스트 500자 연속이면 실패', () => {
  const d = validDraft();
  d.blocks = [para('가'.repeat(260)), para('나'.repeat(260))];
  const r = lintDraft(d);
  assert.ok(r.errors.some((e) => e.includes('연속')));
});

test('사진 재사용·태그 개수·표 문법', () => {
  const d = validDraft();
  d.blocks.push({ type: 'image', path: 'input/photos/_mosaic/0.jpg' });
  d.blocks.push(para('| 항목 | 값 |'));
  d.tags = ['하나'];
  const r = lintDraft(d);
  assert.ok(r.errors.some((e) => e.includes('재사용')));
  assert.ok(r.errors.some((e) => e.includes('tags')));
  assert.ok(r.errors.some((e) => e.includes('표 문법')));
});

test('줄 앞뒤 공백은 경고', () => {
  const d = validDraft();
  d.blocks[0] = para('문장입니다. \n 다음 문장.');
  const r = lintDraft(d);
  assert.ok(r.warnings.some((w) => w.includes('앞뒤 공백')));
});

test('예제 테스트 초안은 test 모드로 통과', () => {
  const d = require('../drafts/example/draft.json');
  const r = lintDraft(d);
  assert.deepStrictEqual(r.errors, []);
});

test('텍스트 대조: 순서·누락 검출', () => {
  const pieces = ['첫 문단.', '둘째 문단.'];
  assert.deepStrictEqual(compareInOrder(pieces, '제목\n첫 문단.\n\n둘째\n문단.'), []);
  assert.deepStrictEqual(compareInOrder(pieces, '둘째 문단.\n첫 문단.'), ['둘째 문단.']);
});
