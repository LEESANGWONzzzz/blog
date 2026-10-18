#!/usr/bin/env node
// draft.json을 한 번에 복사할 수 있는 원고(manuscript.txt)로 내보낸다.
// 제목 → 본문(사진 자리는 [이미지 n 삽입]) → 태그(마지막 줄). 마크다운 기호는 쓰지 않는다.
// 임시저장이 실패했거나 다른 곳에 옮겨 쓸 때의 예비본이다.
//
// 사용: node scripts/export_manuscript.js drafts/<글폴더>/draft.json

const fs = require('fs');
const path = require('path');
const { resolveFromRoot } = require('./lib/config');
const { tagLine } = require('./naver_draft');

function buildManuscript(draft) {
  const lines = [draft.title, ''];
  const images = [];
  for (const b of draft.blocks || []) {
    if (b.type === 'text' || b.type === 'subtitle') {
      lines.push(b.content.split('\n').map((l) => l.trim()).join('\n'), '');
    } else if (b.type === 'image') {
      images.push(b);
      lines.push(`[이미지 ${images.length} 삽입]`);
      if (b.caption) lines.push(`(캡션) ${b.caption}`);
      lines.push('');
    }
  }
  const tags = tagLine(draft.tags);
  if (tags) lines.push(tags);
  return {
    text: `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`,
    images: images.map((b, i) => `[이미지 ${i + 1}] ${b.path}`),
  };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('사용: node scripts/export_manuscript.js drafts/<글폴더>/draft.json');
    process.exit(1);
  }
  const abs = resolveFromRoot(file);
  const draft = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { text, images } = buildManuscript(draft);
  const out = path.join(path.dirname(abs), 'manuscript.txt');
  fs.writeFileSync(out, `${text}\n---\n이미지 파일 (원고에는 넣지 않음)\n${images.join('\n')}\n`);
  console.log(`✔ ${path.relative(process.cwd(), out)} (이미지 ${images.length}장)`);
}

module.exports = { buildManuscript };
