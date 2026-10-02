#!/usr/bin/env node
// 초안 JSON 형식 검사기. CLAUDE.md의 형식 규칙을 기계적으로 확인한다.
//   errors   → 임시저장 금지 (naver_draft.js가 중단)
//   warnings → 저장은 되지만 고치는 것을 권장
//
// 사용: node scripts/lint_draft.js drafts/<글폴더>/draft.json

const fs = require('fs');
const path = require('path');
const { resolveFromRoot } = require('./lib/config');

const BLOCK_TYPES = new Set(['text', 'subtitle', 'divider', 'image']);
const HOOK_PATTERNS = new Set(['손실회피형', '현장몰입형', '반전형', '공감형']);
const PERSONA_KEYS = ['연령직군', '소득구간', '자산단계', '투자경험', '현재감정'];
const MARKER = /\[\[확인필요:[^\]]*\]\]/g;
const TITLE_ALLOWED = /^[가-힣ㄱ-ㅎA-Za-z0-9 ]+$/;

const LIMITS = {
  titleMin: 25,
  titleMax: 32,
  bodyMin: 1800,
  bodyMax: 2200,
  bodyHardMax: 3000,
  textRunFail: 500,
  textRunWarn: 400,
  sentenceMax: 40,
  tagsMin: 5,
  tagsMax: 10,
  imagesMin: 4,
  imagesMax: 8,
  keywordMax: 7,
};

function splitSentences(text) {
  return text
    .split(/(?<=[.!?。])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// 본문 글자 수 — 공백 포함 기준 (본문 text + 소제목, 캡션 제외)
function bodyText(blocks) {
  return blocks
    .filter((b) => b.type === 'text' || b.type === 'subtitle')
    .map((b) => b.content || '')
    .join('\n');
}

function lintDraft(draft, { baseDir, testMode = false } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!draft || typeof draft !== 'object') {
    return { errors: ['초안이 JSON 객체가 아닙니다.'], warnings, stats: {} };
  }
  testMode = testMode || draft.test === true;

  // 1. 확인필요 마커 — 하나라도 있으면 저장 불가
  const markers = JSON.stringify(draft).match(MARKER) || [];
  for (const m of markers) err(`확인되지 않은 값이 남아 있습니다: ${m}`);

  // 2. 제목
  const title = typeof draft.title === 'string' ? draft.title : '';
  if (!title) err('title이 비어 있습니다.');
  else {
    if (title !== title.trim()) err('title 앞뒤에 공백이 있습니다.');
    if (!testMode && (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax)) {
      err(`title 길이 ${title.length}자 — ${LIMITS.titleMin}~${LIMITS.titleMax}자여야 합니다.`);
    }
    if (!TITLE_ALLOWED.test(title)) err('title에 특수문자가 있습니다 (한글·영문·숫자·공백만 허용).');
  }

  // 3. 페르소나·키워드·후킹
  if (!testMode) {
    const persona = draft.persona || {};
    for (const k of PERSONA_KEYS) {
      if (!persona[k] || !String(persona[k]).trim()) err(`persona.${k}가 비어 있습니다.`);
    }
    if (!HOOK_PATTERNS.has(draft.hook_pattern)) {
      err(`hook_pattern은 ${[...HOOK_PATTERNS].join(' / ')} 중 하나여야 합니다.`);
    }
  }
  const main = draft.keywords && typeof draft.keywords.main === 'string' ? draft.keywords.main.trim() : '';
  const subs = (draft.keywords && Array.isArray(draft.keywords.sub)) ? draft.keywords.sub : [];
  if (!testMode) {
    if (!main) err('keywords.main이 비어 있습니다.');
    if (subs.length < 2 || subs.length > 3) warn(`서브 키워드는 2~3개 권장 (현재 ${subs.length}개).`);
  }

  // 4. 블록
  const blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
  if (blocks.length === 0) err('blocks가 비어 있습니다.');

  const imagePaths = new Set();
  let images = 0;
  let captions = 0;
  let run = 0;
  let longestRun = 0;

  blocks.forEach((b, i) => {
    const where = `blocks[${i}]`;
    if (!b || !BLOCK_TYPES.has(b.type)) {
      err(`${where}: 허용되지 않은 블록 타입 "${b && b.type}" (text/subtitle/divider/image만 사용, quote 금지).`);
      return;
    }
    if (b.type === 'text' || b.type === 'subtitle') {
      const c = typeof b.content === 'string' ? b.content : '';
      if (!c.trim()) {
        err(`${where}: 빈 ${b.type} 블록입니다.`);
        return;
      }
      if (c.split('\n').some((line) => line !== line.trim())) {
        warn(`${where}: 줄 앞뒤 공백이 있습니다 (모바일 들여쓰기로 보임 — 저장 시 자동 제거).`);
      }
      if (/\n\s*\n/.test(c)) warn(`${where}: 블록 안에 빈 줄이 있습니다 (문단 사이 빈 줄은 자동 삽입됨).`);
      if (/^\s*\|.*\|\s*$/m.test(c)) err(`${where}: 표 문법이 있습니다 — "✔ 항목 — 내용" 체크리스트로 바꾸세요.`);

      for (const s of splitSentences(c)) {
        if (s.length > LIMITS.sentenceMax) warn(`${where}: ${s.length}자 문장 — 40자 넘으면 자르기 권장: "${s.slice(0, 20)}…"`);
      }
    }
    if (b.type === 'text') {
      const isLegal = i === 0 || i === blocks.length - 1; // 협찬 표기·투자 면책은 예외
      const n = splitSentences(b.content).length;
      if (!isLegal && n > 2) warn(`${where}: 문장 ${n}개 — 한 문단은 문장 2개가 기본입니다.`);
      run += b.content.replace(/\s/g, '').length;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 0; // subtitle/divider/image는 리듬 파괴 장치
    }
    if (b.type === 'subtitle' && !/[?？]$/.test(b.content.trim())) {
      warn(`${where}: 소제목은 질문형 권장 — "${b.content}"`);
    }
    if (b.type === 'image') {
      images += 1;
      if (!b.path) {
        err(`${where}: image.path가 비어 있습니다.`);
        return;
      }
      if (imagePaths.has(b.path)) err(`${where}: 같은 사진을 재사용했습니다 (${b.path}).`);
      imagePaths.add(b.path);
      if (!b.path.includes('_mosaic')) warn(`${where}: 모자이크 폴더(_mosaic) 밖의 사진입니다 — 개인정보 확인 필요.`);
      if (baseDir) {
        const p = path.isAbsolute(b.path) ? b.path : path.join(baseDir, b.path);
        if (!fs.existsSync(p)) err(`${where}: 사진 파일이 없습니다 (${b.path}).`);
      }
      if (b.caption && b.caption.trim()) captions += 1;
    }
    if (b.type === 'divider' && Object.keys(b).length > 1) warn(`${where}: divider에는 type 외 필드가 필요 없습니다.`);
  });

  if (longestRun >= LIMITS.textRunFail) {
    err(`텍스트만 ${longestRun}자 연속 — ${LIMITS.textRunFail}자 넘으면 실패작입니다 (소제목/구분선/사진으로 끊기).`);
  } else if (longestRun > LIMITS.textRunWarn) {
    warn(`텍스트만 ${longestRun}자 연속 — 300~400자마다 리듬 파괴 장치 권장.`);
  }

  // 5. 분량
  const body = bodyText(blocks);
  const withSpaces = body.replace(/\n/g, '').length;
  const noSpaces = body.replace(/\s/g, '').length;
  if (!testMode) {
    if (withSpaces > LIMITS.bodyHardMax) err(`본문 ${withSpaces}자 — ${LIMITS.bodyHardMax}자를 넘으면 안 됩니다.`);
    else if (withSpaces < LIMITS.bodyMin || withSpaces > LIMITS.bodyMax) {
      warn(`본문 ${withSpaces}자(공백 포함) — 기본 ${LIMITS.bodyMin}~${LIMITS.bodyMax}자.`);
    }
  }

  // 6. 키워드 배치
  if (main && !testMode) {
    const exact = countOccurrences(body, main);
    if (exact < 1) err(`메인 키워드 "${main}"가 띄어쓰기까지 같은 형태로 본문에 한 번도 없습니다.`);
    if (exact > LIMITS.keywordMax) warn(`메인 키워드가 ${exact}회 — 5~7회 권장 (과다 반복 주의).`);
    const head = title.slice(0, Math.ceil(title.length / 2));
    const firstWord = main.split(/\s+/)[0];
    if (title && !head.includes(firstWord)) warn('메인 키워드가 제목 앞쪽에 없습니다.');
    const texts = blocks.filter((b) => b.type === 'text');
    if (texts.length && !texts.slice(0, 2).some((b) => b.content.includes(firstWord))) {
      warn('첫 문단 근처에 메인 키워드가 없습니다.');
    }
    for (const s of subs) {
      if (!blocks.some((b) => b.type === 'subtitle' && b.content.includes(s))) {
        warn(`서브 키워드 "${s}"가 소제목에 없습니다.`);
      }
    }
  }

  // 7. 사진
  if (!testMode) {
    if (images === 0) warn('사진이 없습니다 (기본 4~8장).');
    else if (images < LIMITS.imagesMin || images > LIMITS.imagesMax) warn(`사진 ${images}장 — 4~8장 권장.`);
    if (images > 0 && captions > Math.ceil(images * 0.75)) warn(`캡션 ${captions}/${images}장 — 절반 정도만 권장.`);
  }

  // 8. 태그·장소·협찬
  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  if (!testMode && (tags.length < LIMITS.tagsMin || tags.length > LIMITS.tagsMax)) {
    err(`tags ${tags.length}개 — ${LIMITS.tagsMin}~${LIMITS.tagsMax}개여야 합니다.`);
  }
  if (new Set(tags).size !== tags.length) warn('중복 태그가 있습니다.');
  if (draft.place !== null && draft.place !== undefined) warn('place가 채워져 있습니다 — 은행 지점 방문기 같은 예외인지 확인하세요.');
  if (draft.sponsored) {
    const first = blocks[0];
    if (!first || first.type !== 'text' || !first.content.includes(String(draft.sponsored).trim())) {
      err('협찬 글은 첫 블록(text)에 협찬 표기가 있어야 합니다.');
    }
  }
  if (!testMode && blocks.length && blocks[blocks.length - 1].type !== 'text') {
    warn('마지막 블록이 text가 아닙니다 — 투자 면책 문구 위치를 확인하세요.');
  }

  return { errors, warnings, stats: { title: title.length, withSpaces, noSpaces, images, captions, longestRun, tags: tags.length } };
}

function loadDraft(file) {
  const abs = resolveFromRoot(file);
  return { abs, draft: JSON.parse(fs.readFileSync(abs, 'utf8')) };
}

function printReport({ errors, warnings, stats }) {
  console.log(`제목 ${stats.title}자 · 본문 ${stats.withSpaces}자(공백 제외 ${stats.noSpaces}자) · 사진 ${stats.images}장 · 캡션 ${stats.captions} · 태그 ${stats.tags}개 · 최장 텍스트 연속 ${stats.longestRun}자`);
  for (const e of errors) console.log(`  ✖ ${e}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log(errors.length ? `\n판정: 저장 불가 (오류 ${errors.length}건)` : `\n판정: 저장 가능 (경고 ${warnings.length}건)`);
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: node scripts/lint_draft.js drafts/<글폴더>/draft.json');
    process.exit(2);
  }
  const { abs, draft } = loadDraft(file);
  const result = lintDraft(draft, { baseDir: require('./lib/config').ROOT });
  console.log(`검사 대상: ${path.relative(process.cwd(), abs)}`);
  printReport(result);
  process.exit(result.errors.length ? 1 : 0);
}

module.exports = { lintDraft, loadDraft, printReport, splitSentences, LIMITS };
