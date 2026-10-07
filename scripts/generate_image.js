#!/usr/bin/env node
// 글에 넣을 일러스트를 OpenAI 이미지 API로 만든다.
//
// 사용:
//   node scripts/generate_image.js --plan drafts/<글폴더>/images.json
//
// images.json 형식 (Claude가 /write 때 만든다):
//   [{ "file": "input/images/generated/<글폴더>-01.png", "role": "표지", "style": "flat|watercolor", "prompt": "..." }, ...]
//
// - 이미 있는 파일은 다시 만들지 않는다 (비용 절약). 다시 만들려면 파일을 지우고 실행.
// - API 키가 없으면 만들지 않고, ChatGPT에 직접 붙여넣을 수 있도록 같은 폴더에 image_prompts.md를 쓴다 (종료 코드 3).
// - 키는 환경변수 OPENAI_API_KEY 또는 프로젝트 루트의 .env 에서 읽는다. 키를 출력하지 않는다.

const fs = require('fs');
const path = require('path');
const { ROOT, resolveFromRoot } = require('./lib/config');

const API_URL = 'https://api.openai.com/v1/images/generations';

function loadEnv(file = path.join(ROOT, '.env')) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function settings() {
  const env = { ...loadEnv(), ...process.env };
  return {
    apiKey: env.OPENAI_API_KEY || '',
    // 모델 이름은 바뀔 수 있다. 기본값이 거절되면 .env의 OPENAI_IMAGE_MODEL로 바꾼다.
    model: env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    size: env.OPENAI_IMAGE_SIZE || '1024x1024',
  };
}

// 그림체 (images.json 항목의 "style"). 기준은 docs/image-style.md.
const STYLES = {
  // 기본: 개념도·설명 그림
  flat: 'Style: clean flat illustration, white or very light ivory background, navy and mustard-yellow accents, bold simple lines, generous margins, readable on a small phone screen.',
  // 표지·도입용 감성 그림 (따뜻한 수채 애니메이션풍 일상 장면)
  watercolor: 'Style: warm hand-painted watercolor illustration in a Korean slice-of-life animation look, soft golden afternoon light, gentle pastel palette, detailed everyday background (commute, office, home, market), nostalgic and calm mood, square composition with clear empty space at the top for a short title.',
};
const RULES = [
  'Do not include: money piles, gold bars, rising arrows, real or identifiable people, celebrities, real company logos or brand names, fake app or bank screens, charts with numbers, watermarks.',
  'Any Korean text must be short (a few words) and spelled exactly as given in quotes; if no text is quoted, include no text at all.',
].join(' ');
const styleSuffix = (style = 'flat') => `${STYLES[style]} ${RULES}`;
const STYLE_SUFFIX = styleSuffix('flat');

function buildRequest(item, cfg) {
  const body = {
    model: cfg.model,
    prompt: `${item.prompt.trim()}\n\n${styleSuffix(item.style)}`,
    size: item.size || cfg.size,
    n: 1,
  };
  if (/^dall-e/.test(cfg.model)) body.response_format = 'b64_json';
  return {
    url: API_URL,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
    },
  };
}

async function generateOne(item, cfg, fetchImpl = fetch) {
  const { url, init } = buildRequest(item, cfg);
  const res = await fetchImpl(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && json.error.message) || `HTTP ${res.status}`;
    throw new Error(`이미지 생성 실패 (${item.file}): ${msg}`);
  }
  const data = json.data && json.data[0];
  if (data && data.b64_json) return Buffer.from(data.b64_json, 'base64');
  if (data && data.url) {
    const img = await fetchImpl(data.url);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error(`이미지 생성 응답에 이미지가 없습니다 (${item.file}).`);
}

function validatePlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) throw new Error('images.json은 비어 있지 않은 배열이어야 합니다.');
  plan.forEach((it, i) => {
    if (!it.file || !it.prompt) throw new Error(`images.json[${i}]: file과 prompt가 필요합니다.`);
    if (!it.file.startsWith('input/images/generated/')) {
      throw new Error(`images.json[${i}]: 생성 이미지는 input/images/generated/ 아래에만 저장합니다 (${it.file}).`);
    }
    if (it.style && !STYLES[it.style]) throw new Error(`images.json[${i}]: style은 ${Object.keys(STYLES).join('/')} 중 하나입니다.`);
  });
}

function writeManualPrompts(planFile, plan) {
  const out = path.join(path.dirname(planFile), 'image_prompts.md');
  const lines = [
    '# 이미지 프롬프트 (ChatGPT에 직접 붙여넣기용)',
    '',
    'API 키가 없어 자동 생성을 건너뛰었습니다. 아래 프롬프트를 ChatGPT에 하나씩 붙여넣고,',
    '만든 이미지를 적힌 파일 이름 그대로 저장한 뒤 /write를 이어서 진행하세요.',
    '',
  ];
  plan.forEach((it, i) => {
    lines.push(`## ${i + 1}. ${it.role || '이미지'} → \`${it.file}\``, '', '```', `${it.prompt.trim()}\n\n${styleSuffix(it.style)}`, '```', '');
  });
  fs.writeFileSync(out, lines.join('\n'));
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--plan');
  if (pi === -1 || !args[pi + 1]) {
    console.error('사용법: node scripts/generate_image.js --plan drafts/<글폴더>/images.json');
    process.exit(2);
  }
  const planFile = resolveFromRoot(args[pi + 1]);
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  validatePlan(plan);

  const todo = plan.filter((it) => !fs.existsSync(resolveFromRoot(it.file)));
  if (todo.length === 0) {
    console.log('✓ 모든 이미지가 이미 있습니다.');
    return;
  }
  const cfg = settings();
  if (!cfg.apiKey) {
    const out = writeManualPrompts(planFile, todo);
    console.log(`⚠ OPENAI_API_KEY가 없어 자동 생성을 건너뜁니다. 수동 프롬프트: ${path.relative(ROOT, out)}`);
    process.exit(3);
  }
  for (const it of todo) {
    const abs = resolveFromRoot(it.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    process.stdout.write(`  · ${it.role || '이미지'} → ${it.file} ... `);
    const buf = await generateOne(it, cfg);
    fs.writeFileSync(abs, buf);
    console.log('완료');
  }
  console.log(`✓ ${todo.length}장 생성. 글자가 들어간 이미지는 철자를 눈으로 확인하세요.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}

module.exports = { buildRequest, generateOne, validatePlan, writeManualPrompts, loadEnv, STYLE_SUFFIX, styleSuffix };
