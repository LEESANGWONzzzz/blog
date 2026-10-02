// 발행 차단 가드 — 이 파일을 제거하거나 우회하지 말 것.
//
// 두 겹으로 막는다.
//  1) 브라우저 안: 모든 프레임에 init script를 심어, 발행 버튼을 향한 클릭·키 입력을
//     캡처 단계에서 가로채 없앤다. 사람이 직접 눌러도 이 자동화 창에서는 발행되지 않는다.
//     (발행은 평소 쓰는 브라우저에서 임시저장함을 열어 사람이 한다.)
//  2) 스크립트 안: safeClick()이 클릭 직전에 대상이 발행 버튼인지 검사하고, 맞으면 예외를 던진다.
//
// 가드가 설치됐는지 assertGuard()로 확인하고, 실패하면 호출 측이 즉시 중단해야 한다.

const PUBLISH_SELECTOR = 'button[data-testid="seOnePublishBtn"]';
// 셀렉터가 바뀌어도 막히도록, 버튼 글자에 "발행"이 들어가면 모두 발행 버튼으로 취급한다
// (예약발행 포함). 임시저장 버튼("저장")은 해당하지 않는다.
const PUBLISH_TEXT = /발행/;

function guardSource({ selector, textPattern }) {
  /* eslint-disable no-undef */
  const isPublishTarget = (node) => {
    if (!node || typeof node.closest !== 'function') return false;
    const el = node.closest(`${selector}, button, [role="button"], a`);
    if (!el) return false;
    if (el.matches(selector)) return true;
    const label = `${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-testid') || ''}`;
    return new RegExp(textPattern).test(label) || /publish/i.test(el.getAttribute('data-testid') || '');
  };
  const block = (event) => {
    const target = event.composedPath ? event.composedPath()[0] : event.target;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (isPublishTarget(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.__NAVER_PUBLISH_GUARD_BLOCKED__ = (window.__NAVER_PUBLISH_GUARD_BLOCKED__ || 0) + 1;
      console.warn('[publish-guard] 발행 버튼 입력을 차단했습니다.');
    }
  };
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown', 'submit']) {
    window.addEventListener(type, block, true);
  }
  window.__NAVER_PUBLISH_GUARD__ = 'installed';
  /* eslint-enable no-undef */
}

async function installGuard(context) {
  await context.addInitScript(guardSource, { selector: PUBLISH_SELECTOR, textPattern: PUBLISH_TEXT.source });
}

// frame 또는 page를 받는다. 가드가 없으면 예외.
// 설치 표시만 보지 않고, 숨긴 "발행" 버튼을 실제로 눌러 막히는지 확인한다
// (document.open() 등으로 리스너만 지워지고 표시는 남는 경우를 잡기 위해).
async function assertGuard(frameOrPage, label = 'frame') {
  let state;
  try {
    state = await frameOrPage.evaluate(() => {
      if (window.__NAVER_PUBLISH_GUARD__ !== 'installed') return 'missing';
      const probe = document.createElement('button');
      probe.textContent = '발행';
      probe.style.display = 'none';
      let fired = false;
      probe.addEventListener('click', () => { fired = true; });
      (document.body || document.documentElement).appendChild(probe);
      probe.click();
      probe.remove();
      return fired ? 'bypassed' : 'ok';
    });
  } catch (err) {
    throw new Error(`[publish-guard] 가드 설치 확인 실패 (${label}): ${err.message} — 즉시 중단합니다.`);
  }
  if (state !== 'ok') {
    throw new Error(`[publish-guard] 가드 설치 실패 (${label}, ${state}) — 즉시 중단합니다.`);
  }
}

// 스크립트가 클릭하는 모든 버튼은 이 함수를 거친다.
async function safeClick(locator, options = {}) {
  const info = await locator.evaluate((el) => ({
    text: (el.textContent || '').trim(),
    aria: el.getAttribute('aria-label') || '',
    testid: el.getAttribute('data-testid') || '',
  }));
  const label = `${info.text} ${info.aria} ${info.testid}`;
  if (PUBLISH_TEXT.test(label) || /publish/i.test(info.testid) || info.testid === 'seOnePublishBtn') {
    throw new Error(`[publish-guard] 발행 버튼 클릭 시도를 차단했습니다: "${label.trim()}"`);
  }
  await locator.click(options);
}

module.exports = { PUBLISH_SELECTOR, PUBLISH_TEXT, installGuard, assertGuard, safeClick };
