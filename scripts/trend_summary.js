#!/usr/bin/env node
// 며칠치 크리에이터 어드바이저 트렌드(data/trends/YYYY-MM-DD.md)를 모아
// ① 네이버가 지금 유입을 몰아주는 주제 ② 홈판 상위 20개 제목의 패턴을 요약한다.
// 새로 가져오지 않는다 — advisor_trends.js가 이미 저장한 내 계정 집계 파일만 읽는다 (남의 글은 열지 않음).
// 근거: docs/learn/homefeed-20days-2026-11.md ("메인 유입 트렌드 1~20위를 날짜별로 넘겨 보며 역설계")
//
// 사용: node scripts/trend_summary.js [--days 7]   → data/trends/summary-latest.md

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/config');

const TRENDS_DIR = path.join(ROOT, 'data/trends');

// 제목 패턴 (제목 유형·각도만 참고하고 문장은 베끼지 않는다 — writing-rules 5-11)
const PATTERNS = [
  ['답을 뒤로 미룸 (…·~는데·~더니로 끝남)', (t) => /(…|\.\.\.|는데|더니|했지만|인데)\s*["'”’]?\s*$/.test(t)],
  ['물음표 질문', (t) => /\?\s*["'”’]?\s*$/.test(t)],
  ['숫자 들어감', (t) => /\d/.test(t)],
  ['따옴표 인용', (t) => /["'“”‘’]/.test(t)],
  ['이 정도·이것·이유 (지시어로 궁금증)', (t) => /이 정도|이것|이거|이유|정체|비결/.test(t)],
];

function parseTrendFile(text) {
  const order = ((text.match(/^유입 많은 주제 순: (.+)$/m) || [])[1] || '').split(' · ').map((s) => s.trim()).filter(Boolean);
  const sec = text.split('## 네이버 메인(홈판)에서 많이 유입된 콘텐츠')[1] || '';
  const titles = (sec.split('\n## ')[0].match(/^\d+\.\s.+$/gm) || []).map((l) => l.replace(/^\d+\.\s/, '').trim());
  return { order, titles };
}

function summarize(days) {
  const topicRanks = new Map();
  const allTitles = [];
  for (const { order, titles } of days) {
    order.forEach((t, i) => {
      if (!topicRanks.has(t)) topicRanks.set(t, []);
      topicRanks.get(t).push(i + 1);
    });
    allTitles.push(...titles);
  }
  const topics = [...topicRanks.entries()]
    .map(([name, ranks]) => ({ name, days: ranks.length, avg: ranks.reduce((a, b) => a + b, 0) / ranks.length }))
    .sort((a, b) => b.days - a.days || a.avg - b.avg);
  const patterns = PATTERNS.map(([name, test]) => {
    const hits = allTitles.filter(test);
    return { name, count: hits.length, share: allTitles.length ? hits.length / allTitles.length : 0, examples: hits.slice(0, 3) };
  });
  const avgLen = allTitles.length ? allTitles.reduce((a, t) => a + [...t].length, 0) / allTitles.length : 0;
  return { topics, patterns, titleCount: allTitles.length, avgLen };
}

function toMarkdown({ topics, patterns, titleCount, avgLen }, dates) {
  const lines = [`# 트렌드 요약 — ${dates[0] || '?'} ~ ${dates[dates.length - 1] || '?'} (${dates.length}일)`, '',
    '- 출처: 내 계정 크리에이터 어드바이저 트렌드 파일 (advisor_trends.js). 남의 글 본문은 열지 않았다.',
    '- 제목 예시는 **유형·각도 참고용**이다. 문장·단어 배열을 그대로 쓰지 않는다 (writing-rules 5-11).', '',
    '## 유입을 많이 받은 주제 (등장 일수 많은 순 · 평균 순위)', ''];
  if (!topics.length) lines.push('(주제 순위가 담긴 파일이 없음)');
  topics.slice(0, 15).forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.days}일 · 평균 ${t.avg.toFixed(1)}위`));
  lines.push('', `## 홈판 상위 제목 패턴 (제목 ${titleCount}개 · 평균 ${avgLen.toFixed(0)}자)`, '');
  for (const p of patterns) {
    lines.push(`- ${p.name}: ${p.count}개 (${(p.share * 100).toFixed(0)}%)`);
    for (const e of p.examples) lines.push(`  - 예: ${e}`);
  }
  lines.push('', '쓰는 법: 07·13·17시 홈판형 제목 유형을 고를 때 비율이 높은 패턴을 우선 검토한다. 단, 사생활·비하·루머로 궁금증을 만드는 제목은 비율과 상관없이 쓰지 않는다.');
  return lines.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--days');
  const n = i === -1 ? 7 : Number(args[i + 1]) || 7;
  if (!fs.existsSync(TRENDS_DIR)) {
    console.error('data/trends/ 가 없습니다. 먼저 node scripts/advisor_trends.js 를 며칠 돌리세요.');
    process.exit(1);
  }
  const files = fs.readdirSync(TRENDS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().slice(-n);
  if (!files.length) {
    console.error('날짜별 트렌드 파일이 없습니다. node scripts/advisor_trends.js 를 먼저 돌리세요.');
    process.exit(1);
  }
  const days = files.map((f) => parseTrendFile(fs.readFileSync(path.join(TRENDS_DIR, f), 'utf8')));
  const md = toMarkdown(summarize(days), files.map((f) => f.replace('.md', '')));
  const out = path.join(TRENDS_DIR, 'summary-latest.md');
  fs.writeFileSync(out, md);
  console.log(`✔ ${path.relative(ROOT, out)} (${files.length}일치)`);
}

if (require.main === module) main();

module.exports = { parseTrendFile, summarize, toMarkdown, PATTERNS };
