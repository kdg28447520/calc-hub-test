// 작은 공용 도구
export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
export function toast(msg, ms = 2400) {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.className = 'toast';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), ms);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 권한이 없을 때의 옛 방식
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

export function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  if (v >= 100000000) return `${(v / 100000000).toFixed(v >= 1000000000 ? 0 : 1).replace(/\.0$/, '')}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '')}만`;
  if (v >= 1000) return v.toLocaleString('ko-KR');
  return String(v);
}
export function fmtFull(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('ko-KR') : '-';
}
export function fmtDur(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export function fmtAge(days) {
  if (days == null || !Number.isFinite(days)) return '-';
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function download(blobOrUrl, filename) {
  const a = document.createElement('a');
  a.download = filename;
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

export const store = {
  get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 못해도 계속 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* noop */ } },
};
