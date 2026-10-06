// 이미지 생성 스크립트 — 실제 API를 부르지 않고 가짜 fetch로 확인한다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildRequest, generateOne, validatePlan, writeManualPrompts, loadEnv } = require('../scripts/generate_image');

const cfg = { apiKey: 'sk-test', model: 'gpt-image-1', size: '1024x1024' };
const item = { file: 'input/images/generated/a-01.png', prompt: '달력과 동전', role: '표지' };

test('요청: 모델·크기·키·공통 스타일 문구', () => {
  const { url, init } = buildRequest(item, cfg);
  const body = JSON.parse(init.body);
  assert.strictEqual(url, 'https://api.openai.com/v1/images/generations');
  assert.strictEqual(init.headers.Authorization, 'Bearer sk-test');
  assert.strictEqual(body.model, 'gpt-image-1');
  assert.strictEqual(body.response_format, undefined);
  assert.match(body.prompt, /^달력과 동전/);
  assert.match(body.prompt, /Do not include/);
  assert.strictEqual(JSON.parse(buildRequest(item, { ...cfg, model: 'dall-e-3' }).init.body).response_format, 'b64_json');
});

test('응답 b64 → 이미지 바이트, 오류는 메시지 포함', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from('PNG').toString('base64') }] }) });
  assert.strictEqual((await generateOne(item, cfg, ok)).toString(), 'PNG');
  const bad = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'model not found' } }) });
  await assert.rejects(generateOne(item, cfg, bad), /model not found/);
});

test('계획 검사: 생성 이미지는 generated 폴더에만', () => {
  assert.doesNotThrow(() => validatePlan([item]));
  assert.throws(() => validatePlan([{ ...item, file: 'input/photos/_mosaic/a.png' }]), /generated/);
  assert.throws(() => validatePlan([]), /비어/);
});

test('키 없음 → 수동 프롬프트 파일', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-'));
  const out = writeManualPrompts(path.join(dir, 'images.json'), [item]);
  const md = fs.readFileSync(out, 'utf8');
  assert.match(md, /input\/images\/generated\/a-01.png/);
  assert.match(md, /달력과 동전/);
});

test('.env 읽기 (따옴표 제거)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, 'OPENAI_API_KEY="abc"\n# 주석\nOPENAI_IMAGE_MODEL=x\n');
  assert.deepStrictEqual(loadEnv(f), { OPENAI_API_KEY: 'abc', OPENAI_IMAGE_MODEL: 'x' });
});
