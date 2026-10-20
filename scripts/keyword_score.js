#!/usr/bin/env node
// 검색량 대비 블로그 문서 수가 적은(경쟁이 약한) 키워드를 찾는다. 네이버 공식 API만 쓴다.
//   - 월간 검색량: 네이버 검색광고 API 키워드도구 GET /keywordstool (monthlyPcQcCnt + monthlyMobileQcCnt)
//   - 블로그 문서 수: 네이버 검색 API GET /v1/search/blog.json 의 total (display=1, 글 목록은 저장하지 않는다)
// 결과: data/keywords/<날짜>.md — 경쟁도(문서 수 ÷ 월간 검색량)가 낮은 순.
//
// 사용: node scripts/keyword_score.js 연말정산 청년도약계좌 …   (힌트 키워드, 최대 5개씩 묶어 조회)
//       node scripts/keyword_score.js --from-trends               (최신 data/trends 파일의 비즈니스·경제 검색어)
// .env (커밋 금지, 값은 출력하지 않는다):
//   NAVER_SEARCHAD_API_KEY / NAVER_SEARCHAD_SECRET / NAVER_SEARCHAD_CUSTOMER_ID  — searchad.naver.com > 도구 > API 사용 관리
//   NAVER_CLIENT_ID / NAVER_CLIENT_SECRET                                         — developers.naver.com 애플리케이션(검색 API)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/config');
const { loadEnv } = require('./generate_image');

const SEARCHAD = 'https://api.searchad.naver.com';
const OPENAPI = 'https://openapi.naver.com/v1/search/blog.json';
const OUT_DIR = path.join(ROOT, 'data', 'keywords');

// 공식 샘플(signaturehelper.py)과 같은 방식: base64(HMAC-SHA256(secret, "timestamp.method.uri"))
function signature(timestamp, method, uri, secret) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${method}.${uri}`).digest('base64');
}

// 검색한 사람이 다음에 할 행동(신청·조회·비용 확인)을 담은 검색어. 이런 키워드가 제목감이다 (writing-rules 5-7).
const ACTION_WORDS = /신청|기간|지급일|지급|방법|비용|가격|요금|조회|대상|조건|자격|서류|날짜|일정|예매|환급|보상|계산/;
const isAction = (k) => ACTION_WORDS.test(k);

// 검색량이 아주 적으면 API가 "< 10"을 준다 → 5로 본다.
function parseCount(v) {
  if (typeof v === 'number') return v;
  return /</.test(String(v)) ? 5 : Number(String(v).replace(/[^\d]/g, '')) || 0;
}

// rows: [{keyword, searches, docs}] → 경쟁도 낮은 순. 검색량이 minSearches 미만이면 뺀다.
function scoreRows(rows, { minSearches = 100 } = {}) {
  return rows
    .filter((r) => r.searches >= minSearches && Number.isFinite(r.docs))
    .map((r) => ({ ...r, ratio: r.docs / r.searches }))
    .sort((a, b) => a.ratio - b.ratio || b.searches - a.searches);
}

function toMarkdown(scored, { date, hints }) {
  const lines = [
    `# 키워드 기회 — ${date}`,
    '',
    `- 힌트: ${hints.join(', ')}`,
    '- 월간 검색량: 네이버 검색광고 키워드도구(PC+모바일, 최근 30일). 문서 수: 네이버 검색 API 블로그 total.',
    '- 경쟁도 = 블로그 문서 수 ÷ 월간 검색량. 낮을수록 글이 적은데 찾는 사람은 많다. 상위 노출을 보장하는 숫자는 아니다.',
    '',
    '- 행동형 ✔ = 신청·기간·지급일·비용처럼 검색한 사람의 다음 행동이 담긴 검색어 (제목 우선 후보).',
    '',
    '| 순위 | 키워드 | 월간 검색량 | 블로그 문서 수 | 경쟁도 | 행동형 |',
    '|---|---|---|---|---|---|',
  ];
  scored.forEach((r, i) => lines.push(`| ${i + 1} | ${r.keyword} | ${r.searches.toLocaleString()} | ${r.docs.toLocaleString()} | ${r.ratio.toFixed(1)} | ${isAction(r.keyword) ? '✔' : ''} |`));
  return `${lines.join('\n')}\n`;
}

function latestTrendQueries(topics = ['비즈니스·경제']) {
  const dir = path.join(ROOT, 'data', 'trends');
  if (!fs.existsSync(dir)) return [];
  const file = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().pop();
  if (!file) return [];
  const out = [];
  let on = false;
  for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
    if (line.startsWith('### ')) on = topics.includes(line.slice(4).trim());
    else if (on) {
      const m = line.match(/^\d+\.\s+(.+?)\s+\(/);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

async function relatedKeywords(hints, env) {
  const uri = '/keywordstool';
  const ts = String(Date.now());
  const qs = new URLSearchParams({ hintKeywords: hints.map((h) => h.replace(/\s+/g, '')).join(','), showDetail: '1' });
  const res = await fetch(`${SEARCHAD}${uri}?${qs}`, {
    headers: {
      'X-Timestamp': ts,
      'X-API-KEY': env.NAVER_SEARCHAD_API_KEY,
      'X-Customer': String(env.NAVER_SEARCHAD_CUSTOMER_ID),
      'X-Signature': signature(ts, 'GET', uri, env.NAVER_SEARCHAD_SECRET),
    },
  });
  if (!res.ok) throw new Error(`검색광고 API ${res.status} — 키·고객 ID를 확인하세요 (값은 출력하지 않음).`);
  const body = await res.json();
  return (body.keywordList || []).map((k) => ({
    keyword: k.relKeyword,
    searches: parseCount(k.monthlyPcQcCnt) + parseCount(k.monthlyMobileQcCnt),
  }));
}

async function blogDocCount(keyword, env) {
  const res = await fetch(`${OPENAPI}?${new URLSearchParams({ query: keyword, display: '1' })}`, {
    headers: { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET },
  });
  if (!res.ok) throw new Error(`검색 API ${res.status} — 클라이언트 ID·시크릿을 확인하세요 (값은 출력하지 않음).`);
  return (await res.json()).total;
}

async function main() {
  const args = process.argv.slice(2);
  const hints = args.includes('--from-trends') ? latestTrendQueries().slice(0, 10) : args.filter((a) => !a.startsWith('--'));
  if (!hints.length) throw new Error('힌트 키워드를 주거나 --from-trends 를 쓰세요 (트렌드 파일이 없으면 advisor_trends.js 먼저).');
  const env = { ...loadEnv(), ...process.env };
  const need = ['NAVER_SEARCHAD_API_KEY', 'NAVER_SEARCHAD_SECRET', 'NAVER_SEARCHAD_CUSTOMER_ID', 'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`.env에 ${missing.join(', ')} 가 없습니다.`);

  const seen = new Map();
  for (let i = 0; i < hints.length; i += 5) {
    for (const r of await relatedKeywords(hints.slice(i, i + 5), env)) {
      if (!seen.has(r.keyword)) seen.set(r.keyword, r);
    }
  }
  // 문서 수는 검색량 상위 40개만 조회한다 (검색 API 하루 25,000회 한도 안에서 넉넉하게).
  const top = [...seen.values()].sort((a, b) => b.searches - a.searches).slice(0, 40);
  for (const r of top) {
    r.docs = await blogDocCount(r.keyword, env);
    await new Promise((ok) => setTimeout(ok, 150));
  }
  const date = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${date}.md`);
  const scored = scoreRows(top);
  fs.writeFileSync(file, toMarkdown(scored, { date, hints }));
  console.log(`✔ ${path.relative(ROOT, file)} (키워드 ${scored.length}개, 경쟁도 낮은 순)`);
  scored.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. ${r.keyword} — 검색 ${r.searches.toLocaleString()} / 문서 ${r.docs.toLocaleString()}`));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { signature, parseCount, scoreRows, toMarkdown, latestTrendQueries, isAction };
