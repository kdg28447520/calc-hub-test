// 화면 전환과 API 키 관리
import { initFinder, setKey, runSearch, render } from './finder.js?v=6';
import { initEditor, refreshEditor } from './editor.js?v=6';
import { $, toast, store, esc } from './ui.js?v=6';

const KEY_STORE = 'yf.key';
let tab = 'find';

function showTab(name) {
  tab = name;
  const isFind = name === 'find';
  $('#tabFind').hidden = !isFind;
  $('#tabEdit').hidden = isFind;
  $('#keyScreen').hidden = true;
  Array.from($('#tabs').children).forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (isFind) { try { render(); } catch { /* noop */ } }
  else { try { refreshEditor(); } catch { /* noop */ } }
  window.scrollTo(0, 0);
}

function showKey(force) {
  $('#tabFind').hidden = true;
  $('#tabEdit').hidden = true;
  $('#keyScreen').hidden = false;
  const k = store.get(KEY_STORE);
  if (k) $('#keyInput').value = k;
  $('#keyMsg').textContent = '';
  $('#keyMsg').className = 'msg';
  setTimeout(() => $('#keyInput').focus(), 60);
  if (force) window.scrollTo({ top: 0 });
}

async function verifyKey(key) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', 'dQw4w9WgXcQ');
  url.searchParams.set('key', key);
  const res = await fetch(url);
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* noop */ }
    const t = JSON.stringify(body || {});
    if (/API_KEY_INVALID|keyInvalid|API key not valid/i.test(t)) throw new Error('키가 맞지 않아요. 복사가 잘 됐는지 확인해 주세요.');
    if (/SERVICE_DISABLED|has not been used|accessNotConfigured|is disabled/i.test(t)) throw new Error('YouTube Data API v3가 꺼져 있어요. 2번을 먼저 눌러 주세요.');
    if (/quota/i.test(t)) throw new Error('오늘 한도를 다 썼어요. 내일 다시 해 주세요.');
    if (/referrer|forbidden|blocked/i.test(t)) throw new Error('이 키는 웹사이트 제한에 걸려 있어요. 구글 클라우드 키 설정을 확인해 주세요.');
    throw new Error(`키를 확인하지 못했어요 (${res.status})`);
  }
  return true;
}

async function submitKey(e) {
  e.preventDefault();
  const key = $('#keyInput').value.trim();
  const msg = $('#keyMsg');
  msg.className = 'msg';
  msg.textContent = '확인하는 중…';
  $('#keySubmit').disabled = true;
  try {
    if (!/^AIza[\w-]{30,}$/.test(key)) throw new Error('AIza로 시작하는 39글자 키를 넣어 주세요.');
    await verifyKey(key);
    store.set(KEY_STORE, key);
    setKey(key);
    msg.className = 'msg ok';
    msg.textContent = '확인됐어요. 바로 시작할게요';
    setTimeout(() => showTab('find'), 420);
  } catch (err) {
    msg.className = 'msg bad';
    msg.textContent = err.message || '확인하지 못했어요';
  } finally {
    $('#keySubmit').disabled = false;
  }
}

function boot() {
  initFinder();
  initEditor();

  $('#keyForm').addEventListener('submit', submitKey);
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  $('#changeKey').addEventListener('click', () => showKey(true));
  document.addEventListener('yf:needkey', () => showKey(true));

  const saved = store.get(KEY_STORE);
  if (saved) { setKey(saved); showTab('find'); }
  else showKey(false);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
