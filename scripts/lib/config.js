// 공통 경로·설정. 모든 스크립트는 실행 위치와 무관하게 프로젝트 루트 기준으로 동작한다.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE_DIR = path.join(ROOT, 'naver-profile');
const DRAFTS_DIR = path.join(ROOT, 'drafts');
const DEBUG_DIR = path.join(ROOT, 'debug');
const CONFIG_FILE = path.join(ROOT, 'data', 'config.json');

function loadConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return {
    blogId: process.env.NAVER_BLOG_ID || fileConfig.blogId || '',
    // 사람이 화면을 보며 확인할 수 있도록 기본은 브라우저 창을 띄운다.
    headless: process.env.HEADLESS === '1',
    slowMo: Number(process.env.SLOW_MO || fileConfig.slowMo || 60),
    // 하루 자동 임시저장 상한 (네이버 약관상 자동화는 회색지대 — 올릴수록 위험도 커진다)
    dailySaveLimit: Number(fileConfig.dailySaveLimit || 2),
    // 예약 발행 계획 기본값 (plan_schedule.js)
    schedule: { start: '07:00', every: 120, end: '21:00', ...(fileConfig.schedule || {}) },
  };
}

// 상대경로는 프로젝트 루트 기준으로 해석한다 (`!` 명령이 다른 위치에서 실행돼도 깨지지 않게).
function resolveFromRoot(p) {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

module.exports = { ROOT, PROFILE_DIR, DRAFTS_DIR, DEBUG_DIR, CONFIG_FILE, loadConfig, resolveFromRoot };
