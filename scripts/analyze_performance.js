#!/usr/bin/env node
// 내 블로그 글 성과 분석 — 조회수 상위 글들의 "교집합"(겹치는 제목 유형·후킹·키워드 단어)을 찾는다.
// 네이버에 접속하지 않는다. 크리에이터 어드바이저에서 사람이 옮겨 적은 CSV만 읽는다.
//
// 입력 CSV (첫 줄은 머리글): 제목,조회수
//   예) data/performance.csv
//       제목,조회수
//       2026 연금저축 세액공제 한도 직장인이 놓친 조건,"1,234"
//
// 사용: node scripts/analyze_performance.js data/performance.csv [--top 0.3]
// drafts/*/draft.json과 제목이 같으면 그 글의 title_hook·hook_pattern·키워드를 함께 쓴다.

const fs = require('fs');
const path = require('path');
const { DRAFTS_DIR, resolveFromRoot } = require('./lib/config');

const TITLE_HOOKS = ['숫자형', '비교형', '손실회피형', '질문형', '반전형'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

function loadPerformance(csvText) {
  const rows = parseCsv(csvText.replace(/^﻿/, ''));
  const [header, ...data] = rows;
  const ti = header.findIndex((h) => /제목|title/i.test(h));
  const vi = header.findIndex((h) => /조회|views?/i.test(h));
  if (ti === -1 || vi === -1) throw new Error('CSV 첫 줄에 "제목"과 "조회수" 열이 있어야 합니다.');
  return data
    .map((r) => ({ title: (r[ti] || '').trim(), views: Number(String(r[vi] || '').replace(/[^\d]/g, '')) }))
    .filter((p) => p.title && Number.isFinite(p.views));
}

const squash = (s) => s.replace(/\s/g, '');

function loadDraftIndex(dir = DRAFTS_DIR) {
  const index = new Map();
  if (!fs.existsSync(dir)) return index;
  for (const d of fs.readdirSync(dir)) {
    const f = path.join(dir, d, 'draft.json');
    if (!fs.existsSync(f)) continue;
    try {
      const draft = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (draft.title && !draft.test) index.set(squash(draft.title), draft);
    } catch {
      // 깨진 초안은 건너뛴다
    }
  }
  return index;
}

// 초안 정보가 없는 글은 제목만 보고 유형을 추정한다 (추정이라고 표시).
function guessTitleHook(title) {
  if (/vs|비교|차이|보다|어디가|뭐가 나/i.test(title)) return '비교형';
  if (/손해|놓치|놓친|모르면|날린|날렸|실수|후회|안 하면|하지 마/.test(title)) return '손실회피형';
  if (/\d/.test(title)) return '숫자형';
  if (/[?？]|까요|나요|인가요/.test(title)) return '질문형';
  if (/사실은|오히려|알고 보니|반전|틀렸/.test(title)) return '반전형';
  return '기타';
}

function words(title) {
  return [...new Set(title.split(/[\s,·]+/).map((w) => w.replace(/[^가-힣A-Za-z0-9]/g, '')).filter((w) => w.length >= 2))];
}

function analyze(posts, draftIndex, topRatio = 0.3) {
  const sorted = [...posts].sort((a, b) => b.views - a.views);
  const topN = Math.max(3, Math.ceil(sorted.length * topRatio));
  const enriched = sorted.map((p, i) => {
    const draft = draftIndex.get(squash(p.title));
    const titleHook = draft && TITLE_HOOKS.includes(draft.title_hook) ? draft.title_hook : guessTitleHook(p.title);
    return {
      ...p,
      rank: i + 1,
      top: i < topN,
      titleHook,
      titleHookGuessed: !(draft && draft.title_hook),
      hookPattern: draft ? draft.hook_pattern : null,
      mainKeyword: draft && draft.keywords ? draft.keywords.main : null,
      hasNumber: /\d/.test(p.title),
      length: p.title.length,
      words: words(p.title),
    };
  });

  const top = enriched.filter((p) => p.top);
  const rest = enriched.filter((p) => !p.top);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, p) => s + p.views, 0) / arr.length) : 0);

  const groupBy = (key) => {
    const groups = new Map();
    for (const p of enriched) {
      const k = p[key] || '(정보 없음)';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    return [...groups.entries()]
      .map(([k, arr]) => ({ key: k, count: arr.length, inTop: arr.filter((p) => p.top).length, avgViews: avg(arr) }))
      .sort((a, b) => b.avgViews - a.avgViews);
  };

  // 상위 글 2개 이상에 나오는 단어 = 교집합 후보. 하위 글에 얼마나 나오는지도 같이 본다.
  const wordStats = new Map();
  for (const p of enriched) {
    for (const w of p.words) {
      if (!wordStats.has(w)) wordStats.set(w, { word: w, top: 0, rest: 0 });
      wordStats.get(w)[p.top ? 'top' : 'rest'] += 1;
    }
  }
  const sharedWords = [...wordStats.values()]
    .filter((s) => s.top >= 2)
    .sort((a, b) => b.top - a.top || a.rest - b.rest);

  return {
    total: enriched.length,
    topN: top.length,
    avgTop: avg(top),
    avgRest: avg(rest),
    posts: enriched,
    byTitleHook: groupBy('titleHook'),
    byHookPattern: groupBy('hookPattern'),
    sharedWords,
    numberRate: {
      top: top.filter((p) => p.hasNumber).length / (top.length || 1),
      rest: rest.filter((p) => p.hasNumber).length / (rest.length || 1),
    },
    avgLength: {
      top: Math.round(top.reduce((s, p) => s + p.length, 0) / (top.length || 1)),
      rest: Math.round(rest.reduce((s, p) => s + p.length, 0) / (rest.length || 1)),
    },
  };
}

function toMarkdown(r, { source, date = new Date().toISOString().slice(0, 10) } = {}) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const lines = [
    `# 성과 분석 — ${date}`,
    '',
    `- 데이터: ${source || 'CSV'} · 글 ${r.total}개 · 상위 그룹 ${r.topN}개 (평균 조회수 ${r.avgTop}) vs 나머지 (평균 ${r.avgRest})`,
  ];
  if (r.total < 10) lines.push('- ⚠ 글이 10개 미만이라 교집합은 참고용입니다. 글을 더 쌓은 뒤 다시 분석하세요.');
  lines.push('', '## 조회수 순위', '', '| 순위 | 제목 | 조회수 | 제목 유형 | 도입 후킹 |', '|---|---|---|---|---|');
  for (const p of r.posts) {
    lines.push(`| ${p.rank}${p.top ? ' ★' : ''} | ${p.title} | ${p.views} | ${p.titleHook}${p.titleHookGuessed ? '(추정)' : ''} | ${p.hookPattern || '-'} |`);
  }
  lines.push('', '## 제목 유형별', '', '| 유형 | 글 수 | 상위 그룹 | 평균 조회수 |', '|---|---|---|---|');
  for (const g of r.byTitleHook) lines.push(`| ${g.key} | ${g.count} | ${g.inTop} | ${g.avgViews} |`);
  lines.push('', '## 도입 후킹 패턴별 (도구로 쓴 글만)', '', '| 패턴 | 글 수 | 상위 그룹 | 평균 조회수 |', '|---|---|---|---|');
  for (const g of r.byHookPattern) lines.push(`| ${g.key} | ${g.count} | ${g.inTop} | ${g.avgViews} |`);
  lines.push('', '## 상위 글 교집합 단어 (상위 2개 이상에 등장)', '');
  if (r.sharedWords.length === 0) lines.push('- 없음');
  for (const s of r.sharedWords.slice(0, 15)) lines.push(`- ${s.word} — 상위 ${s.top}개 / 나머지 ${s.rest}개`);
  lines.push(
    '',
    '## 제목 형태',
    '',
    `- 숫자 포함 비율: 상위 ${pct(r.numberRate.top)} / 나머지 ${pct(r.numberRate.rest)}`,
    `- 평균 제목 길이: 상위 ${r.avgLength.top}자 / 나머지 ${r.avgLength.rest}자`,
    '',
    '> 이 표는 상관관계일 뿐 원인이 아닙니다. 발행 시점·검색 유입·홈판 노출 같은 다른 요인이 섞여 있습니다.',
    '',
  );
  return lines.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const ti = args.indexOf('--top');
  const ratio = ti !== -1 ? Number(args[ti + 1]) : 0.3;
  if (!file) {
    console.error('사용법: node scripts/analyze_performance.js data/performance.csv [--top 0.3]');
    process.exit(2);
  }
  const abs = resolveFromRoot(file);
  const posts = loadPerformance(fs.readFileSync(abs, 'utf8'));
  const result = analyze(posts, loadDraftIndex(), ratio);
  const md = toMarkdown(result, { source: path.basename(abs) });
  const out = resolveFromRoot('data/analysis-latest.md');
  fs.writeFileSync(out, md);
  console.log(md);
  console.log(`\n저장: data/analysis-latest.md`);
}

module.exports = { parseCsv, loadPerformance, guessTitleHook, analyze, toMarkdown, TITLE_HOOKS };
