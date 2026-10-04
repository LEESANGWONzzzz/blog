#!/usr/bin/env node
// 초안 JSON을 네이버 블로그 에디터에 입력하고 "임시저장"까지만 한다. 발행은 하지 않는다.
//
// 사용:
//   node scripts/naver_draft.js drafts/<글폴더>/draft.json            # 임시저장
//   node scripts/naver_draft.js drafts/<글폴더>/draft.json --dry-run  # 검사·입력 계획만 출력
//   node scripts/naver_draft.js drafts/<글폴더>/draft.json --resave   # 이미 저장한 초안을 한 번 더 저장 (중복 초안 생김)
//   node scripts/naver_draft.js drafts/<글폴더>/draft.json --keep-open # 끝난 뒤 Enter 칠 때까지 창 유지
//
// 단계별 진행 상황은 같은 폴더의 status.json에 남는다 (draft_status.js가 읽음).
// 어떤 실패도 초안 재작성 사유가 아니다 — 실패한 단계(대개 selectors.js)만 고쳐 다시 돌린다.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');
const { ROOT, PROFILE_DIR, DEBUG_DIR, loadConfig, resolveFromRoot } = require('./lib/config');
const { installGuard, assertGuard, safeClick } = require('./lib/publish_guard');
const { lintDraft, printReport } = require('./lint_draft');
const SEL = require('./lib/selectors');
const { sessionStatus } = require('./lib/session');

const STEPS = ['lint', 'open_editor', 'title', 'body', 'save', 'verify'];

// ---------- status.json ----------
function statusPath(draftFile) {
  return path.join(path.dirname(draftFile), 'status.json');
}
function readStatus(draftFile) {
  const p = statusPath(draftFile);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return { steps: {}, saved: false };
}
function writeStatus(draftFile, status) {
  status.updatedAt = new Date().toISOString();
  fs.writeFileSync(statusPath(draftFile), `${JSON.stringify(status, null, 2)}\n`);
}
function mark(draftFile, status, step, ok, detail) {
  status.steps[step] = { ok, at: new Date().toISOString(), ...(detail ? { detail } : {}) };
  if (!ok) status.lastError = { step, detail };
  writeStatus(draftFile, status);
}

// ---------- 텍스트 정규화·대조 ----------
function normalizeLine(line) {
  return line.trim();
}
function normalizeBlockText(content) {
  return content.split('\n').map(normalizeLine).join('\n');
}
function squash(s) {
  return s.replace(/[\s​‌‍﻿]/g, '');
}
// 기대 조각들이 실제 텍스트 안에 순서대로 들어 있는지 확인한다.
function compareInOrder(expectedPieces, actualText) {
  const actual = squash(actualText);
  const missing = [];
  let pos = 0;
  for (const piece of expectedPieces) {
    const p = squash(piece);
    if (!p) continue;
    const idx = actual.indexOf(p, pos);
    if (idx === -1) missing.push(piece);
    else pos = idx + p.length;
  }
  return missing;
}
function expectedPieces(draft) {
  const pieces = [];
  for (const b of draft.blocks) {
    if (b.type === 'text' || b.type === 'subtitle') pieces.push(normalizeBlockText(b.content));
    if (b.type === 'image' && b.caption) pieces.push(b.caption.trim());
  }
  return pieces;
}

// ---------- 에디터 조작 ----------
async function first(scope, candidates, { timeout = 15000, state = 'visible' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of candidates) {
      const loc = scope.locator(sel).first();
      if ((await loc.count()) > 0 && (state !== 'visible' || (await loc.isVisible()))) return loc;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`요소를 찾지 못했습니다 (selectors.js 실측 필요): ${candidates.join(' | ')}`);
}

async function tryFirst(scope, candidates, timeout = 1500) {
  try {
    return await first(scope, candidates, { timeout });
  } catch {
    return null;
  }
}

// "작성 중인 글이 있습니다" 팝업과 도움말 패널이 보이면 취소/닫기
async function dismissPopups(frame) {
  const popup = frame.getByText(SEL.draftPopupText);
  if ((await popup.count()) > 0 && (await popup.first().isVisible())) {
    const cancel = await tryFirst(frame, SEL.draftPopupCancel);
    if (cancel) {
      await safeClick(cancel);
      console.log('  · "작성 중인 글이 있습니다" 팝업 → 취소');
    }
  }
  const help = await tryFirst(frame, SEL.helpClose, 500);
  if (help) await safeClick(help);
}

async function getEditorFrame(page) {
  for (const sel of SEL.editorFrame) {
    const handle = await page.$(sel);
    if (handle) {
      const frame = await handle.contentFrame();
      if (frame) return frame;
    }
  }
  return page.mainFrame();
}

async function countIn(frame, candidates) {
  let max = 0;
  for (const sel of candidates) max = Math.max(max, await frame.locator(sel).count());
  return max;
}

// 컴포넌트(인용구·구분선·사진) 삽입 뒤 커서를 그 아래 새 본문 문단으로 옮긴다.
async function moveCursorBelowLastComponent(page, frame) {
  const lastIsText = await frame.evaluate(() => {
    const comps = document.querySelectorAll('.se-component');
    const last = comps[comps.length - 1];
    return !!(last && last.classList.contains('se-text'));
  });
  if (lastIsText) {
    const para = frame.locator(SEL.bodyParagraph[0]).last();
    await para.click();
    await page.keyboard.press('End');
  } else {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
  }
}

async function typeText(page, content) {
  const lines = normalizeBlockText(content).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    await page.keyboard.insertText(lines[i]);
    if (i < lines.length - 1) await page.keyboard.press('Shift+Enter');
  }
}

async function insertBlock(page, frame, block, index) {
  await dismissPopups(frame);
  switch (block.type) {
    case 'text':
      await typeText(page, block.content);
      // 문단 끝 → 새 문단 + 빈 줄 하나 (문단 사이 빈 줄 자동 삽입)
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      break;
    case 'subtitle': {
      const before = await countIn(frame, ['.se-component.se-quotation']);
      await safeClick(await first(frame, SEL.toolbar.quotation));
      await frame.waitForFunction((n) => document.querySelectorAll('.se-component.se-quotation').length > n, before);
      await (await first(frame, SEL.lastQuoteParagraph)).click();
      await typeText(page, block.content);
      await moveCursorBelowLastComponent(page, frame);
      break;
    }
    case 'divider': {
      await safeClick(await first(frame, SEL.toolbar.horizontalLine));
      await moveCursorBelowLastComponent(page, frame);
      break;
    }
    case 'image': {
      const abs = resolveFromRoot(block.path);
      const before = await countIn(frame, ['.se-component.se-image']);
      const button = await first(frame, SEL.toolbar.image);
      const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), safeClick(button)]);
      await chooser.setFiles(abs);
      await frame.waitForFunction(
        (n) => document.querySelectorAll('.se-component.se-image').length > n,
        before,
        { timeout: 60000 },
      );
      if (block.caption && block.caption.trim()) {
        await (await first(frame, SEL.lastImageCaption)).click();
        await page.keyboard.insertText(block.caption.trim());
      }
      await moveCursorBelowLastComponent(page, frame);
      break;
    }
    default:
      throw new Error(`blocks[${index}]: 알 수 없는 타입 ${block.type}`);
  }
}

async function extractEditorText(frame) {
  const root = await first(frame, SEL.contentRoot, { timeout: 5000 });
  return root.evaluate((el) => el.innerText);
}

async function saveDebug(page, label) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(DEBUG_DIR, `${stamp}-${label}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    const frame = await getEditorFrame(page);
    fs.writeFileSync(`${base}.html`, await frame.content());
    return path.relative(ROOT, base);
  } catch {
    return null;
  }
}

function waitForEnter(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, () => {
    rl.close();
    resolve();
  }));
}

// ---------- 메인 ----------
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const resave = args.includes('--resave');
  const keepOpen = args.includes('--keep-open');
  if (!file) {
    console.error('사용법: node scripts/naver_draft.js drafts/<글폴더>/draft.json [--dry-run] [--resave] [--keep-open]');
    process.exit(2);
  }

  const draftFile = resolveFromRoot(file);
  const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'));
  const status = readStatus(draftFile);

  // 1. 형식 검사 — 오류(확인필요 마커 포함)가 있으면 저장하지 않는다.
  const result = lintDraft(draft, { baseDir: ROOT });
  printReport(result);
  mark(draftFile, status, 'lint', result.errors.length === 0, result.errors.length ? result.errors : undefined);
  if (result.errors.length) {
    console.error('\n✖ 형식 오류가 있어 임시저장하지 않습니다. 초안을 고친 뒤 다시 실행하세요.');
    process.exit(1);
  }

  if (status.saved && !resave) {
    console.log('\n이 초안은 이미 임시저장됐습니다 (중복 저장 방지).');
    console.log('네이버 블로그 → 글쓰기 → 임시저장함에서 확인하세요. 꼭 다시 저장하려면 --resave');
    return;
  }

  if (dryRun) {
    console.log('\n[dry-run] 입력 순서:');
    console.log(`  제목: ${draft.title}`);
    draft.blocks.forEach((b, i) => {
      const preview = b.type === 'image' ? `${b.path}${b.caption ? ` (캡션: ${b.caption})` : ''}` : (b.content || '').replace(/\n/g, ' ⏎ ').slice(0, 40);
      console.log(`  ${String(i).padStart(2)} ${b.type.padEnd(8)} ${preview}`);
    });
    console.log(`  태그(발행 시 사람이 입력): ${(draft.tags || []).join(', ')}`);
    return;
  }

  const config = loadConfig();
  if (!config.blogId) {
    console.error('✖ blogId가 없습니다. data/config.json에 {"blogId": "블로그아이디"}를 넣으세요.');
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: config.headless,
    slowMo: config.slowMo,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });
  await installGuard(context);
  const page = context.pages()[0] || (await context.newPage());
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  let current = 'open_editor';
  try {
    const session = await sessionStatus(context);
    if (!session.ok) {
      throw new Error('로그인 세션이 없습니다. node scripts/naver_login.js 를 다시 실행하고, 네이버 로그인 화면에서 "로그인 상태 유지"를 체크하세요.');
    }

    // 2. 에디터 열기 + 가드 확인
    await page.goto(SEL.writeUrl(config.blogId), { waitUntil: 'domcontentloaded' });
    if (page.url().includes('nidlogin')) throw new Error('로그인 페이지로 이동됐습니다 — 세션 만료. naver_login.js로 다시 로그인하세요.');
    await assertGuard(page, 'page');
    const frame = await getEditorFrame(page);
    await first(frame, SEL.title, { timeout: 30000 });
    await assertGuard(frame, 'editor');
    await dismissPopups(frame);
    mark(draftFile, status, 'open_editor', true);

    // 3. 제목
    current = 'title';
    await (await first(frame, SEL.title)).click();
    await page.keyboard.insertText(draft.title);
    mark(draftFile, status, 'title', true);

    // 4. 본문
    current = 'body';
    await (await first(frame, SEL.bodyParagraph)).click();
    for (let i = 0; i < draft.blocks.length; i += 1) {
      try {
        await insertBlock(page, frame, draft.blocks[i], i);
      } catch (e) {
        throw new Error(`blocks[${i}] (${draft.blocks[i].type}) 입력 실패: ${e.message}`);
      }
    }
    mark(draftFile, status, 'body', true);

    // 5. 임시저장 (발행 아님)
    current = 'save';
    await dismissPopups(frame);
    await assertGuard(frame, 'editor');
    const saveBtn = (await tryFirst(frame, SEL.saveButton, 5000)) || (await first(page, SEL.saveButton));
    await safeClick(saveBtn);
    const toast = (await tryFirst(frame, SEL.saveToast, 8000)) || (await tryFirst(page, SEL.saveToast, 2000));
    status.saved = true;
    mark(draftFile, status, 'save', true, toast ? undefined : '저장 알림을 확인하지 못함 — 임시저장함에서 직접 확인 필요');

    // 6. 텍스트 전문 대조 (1회)
    current = 'verify';
    const actual = await extractEditorText(frame);
    const titleText = await (await first(frame, SEL.titleRoot, { timeout: 5000 })).innerText();
    const missing = compareInOrder(expectedPieces(draft), actual);
    if (squash(titleText) !== squash(draft.title)) missing.unshift(`[제목 불일치] 에디터: "${titleText.trim()}"`);
    if (missing.length) {
      mark(draftFile, status, 'verify', false, missing);
      console.error(`\n⚠ 임시저장은 됐지만 대조 결과 ${missing.length}곳이 다릅니다:`);
      for (const m of missing) console.error(`  - ${m.slice(0, 60)}`);
      process.exitCode = 1;
    } else {
      mark(draftFile, status, 'verify', true);
      console.log('\n✓ 임시저장 완료 · 텍스트 전문 대조 일치');
    }

    const checklist = path.join(path.dirname(draftFile), 'publish_checklist.txt');
    fs.writeFileSync(checklist, [
      '발행 전 사람이 할 일 (자동화는 여기까지 하지 않음)',
      '1. 평소 쓰는 브라우저에서 네이버 블로그 → 글쓰기 → 임시저장함 열기',
      '2. 사진 모자이크·수치·기준일·출처 최종 확인',
      `3. 발행 설정에서 태그 입력: ${(draft.tags || []).map((t) => `#${t}`).join(' ')}`,
      '4. 발행 버튼은 직접 누르기',
      '',
    ].join('\n'));
    console.log(`발행 체크리스트: ${path.relative(ROOT, checklist)}`);
  } catch (e) {
    const dbg = await saveDebug(page, current);
    mark(draftFile, status, current, false, `${e.message}${dbg ? ` (debug: ${dbg}.png/.html)` : ''}`);
    console.error(`\n✖ [${current}] ${e.message}`);
    if (dbg) console.error(`  화면·HTML 저장: ${dbg}.png / .html`);
    console.error('  초안은 다시 쓰지 마세요. node scripts/draft_status.js 로 재개 지점을 확인하세요.');
    process.exitCode = 1;
  } finally {
    if (keepOpen) await waitForEnter('창을 닫으려면 Enter > ');
    await context.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { compareInOrder, expectedPieces, squash, STEPS, readStatus, statusPath };
