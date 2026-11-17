// 화면 틀(템플릿) 15종과 자막 스타일 12종, 그리고 캔버스 그리기.
// 미리보기와 내보내기가 같은 renderFrame()을 쓰기 때문에 화면과 결과물이 어긋나지 않는다.

export const FONTS = [
  { id: 'pretendard', name: '프리텐다드', family: '"Pretendard"', force: 0 },
  { id: 'black', name: '검은고딕', family: '"Black Han Sans"', force: 400 },
  { id: 'dohyeon', name: '도현', family: '"Do Hyeon"', force: 400 },
  { id: 'jua', name: '주아', family: '"Jua"', force: 400 },
  { id: 'gowun', name: '고운돋움', family: '"Gowun Dodum"', force: 400 },
  { id: 'myeongjo', name: '나눔명조', family: '"Nanum Myeongjo"', force: 800 },
  { id: 'pen', name: '나눔손글씨', family: '"Nanum Pen Script"', force: 400 },
  { id: 'song', name: '송명', family: '"Song Myung"', force: 400 },
];
export const fontOf = id => FONTS.find(f => f.id === id) || FONTS[0];
const fontCss = (id, weight, size) => {
  const f = fontOf(id);
  return `${f.force || weight} ${size}px ${f.family}, "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
};

// 글자를 그리기 전에 쓰인 글꼴을 미리 받아 둔다(캔버스는 글꼴을 기다려 주지 않는다).
export async function ensureFonts(allText) {
  if (!document.fonts) return;
  const text = String(allText || '가나다라마바사 0123456789').slice(0, 4000);
  const jobs = [];
  for (const f of FONTS) {
    for (const w of [400, 700, 800, 900]) jobs.push(document.fonts.load(`${f.force || w} 40px ${f.family}`, text).catch(() => null));
  }
  await Promise.all(jobs);
  try { await document.fonts.ready; } catch { /* noop */ }
}

const clamp01 = v => Math.max(0, Math.min(1, v));
// 글자 크기 기준: 가로 영상에서도 세로 영상과 같은 비례로 보이도록 짧은 쪽을 쓴다
const sizeRef = (W, H) => (W > H ? H * 9 / 16 : W);
const HEX = /^#?[0-9a-f]{6}$/i;

function rgba(hex, a) {
  if (!HEX.test(hex)) return hex;
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, rr); return; }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ *
 * 1. 화면 틀 15종
 * frame.kind: band(위 띠) | bands(위·아래 띠) | card(카드) | center(가운데) | full(가득)
 * ------------------------------------------------------------------ */
export const PRESETS = [
  {
    id: 't01', name: '위 검정 띠 + 박스 대사', group: '위 띠',
    frame: { kind: 'band', h: 0.19, bg: '#000000' },
    title: { size: 0.086, y: 0.098, color: '#fff', accent: '#FFD21E', family: 'black', weight: 900, lines: 2 },
    cap: { size: 0.047, weight: 700, family: 'pretendard', color: '#fff', y: 0.79, maxChars: 15, lines: 2, box: { color: '#000', alpha: 0.8, padX: 0.5, padY: 0.2, radius: 0.12 } },
    sample: { title: ['사랑하는 사람한테', '왜 자꾸 *이기려고* 할까?'], bottom: '', stickers: [] },
  },
  {
    id: 't02', name: '위 검정 띠 + 별표 라벨', group: '위 띠',
    frame: { kind: 'band', h: 0.19, bg: '#000000' },
    title: { size: 0.086, y: 0.098, color: '#fff', accent: '#2BD9E8', family: 'black', weight: 900, lines: 2 },
    cap: { size: 0.068, weight: 900, family: 'black', color: '#fff', y: 0.72, maxChars: 11, lines: 2, stroke: { color: '#000', w: 0.17 } },
    sample: { title: ['남편이 갑자기', 'AI한테 물어본 것'], bottom: '', stickers: [{ kind: 'label', text: '충격', x: 0.5, y: 0.45 }] },
  },
  {
    id: 't03', name: '위 흰 띠 + 키워드 색', group: '위 띠',
    frame: { kind: 'band', h: 0.2, bg: '#FFFFFF', line: '#E5E8EB' },
    title: { size: 0.09, y: 0.1, color: '#14181C', accent: '#2E7DF6', family: 'black', weight: 900, lines: 2 },
    cap: { size: 0.056, weight: 800, family: 'pretendard', color: '#fff', y: 0.8, maxChars: 13, lines: 2, stroke: { color: '#000', w: 0.14 } },
    sample: { title: ['월 300만원', '부수입 *만드는 법*'], bottom: '', stickers: [] },
  },
  {
    id: 't04', name: '주황 띠 + 먹색 말풍선 제목', group: '위 띠',
    frame: { kind: 'band', h: 0.2, bg: '#FF6B1A' },
    title: { size: 0.07, y: 0.1, color: '#fff', accent: '#FFD21E', family: 'pretendard', weight: 900, lines: 2, bubble: { color: '#191F28', alpha: 1, padX: 0.45, padY: 0.28, radius: 0.28, tail: true } },
    cap: { size: 0.05, weight: 800, family: 'pretendard', color: '#fff', y: 0.79, maxChars: 14, lines: 2, box: { color: '#191F28', alpha: 0.9, padX: 0.45, padY: 0.2, radius: 0.2 } },
    sample: { title: ['그 말', '듣고 *멈췄다*'], bottom: '', stickers: [] },
  },
  {
    id: 't05', name: '주황 띠 + 먹색 박스 물듦', group: '위 띠',
    frame: { kind: 'band', h: 0.2, bg: '#FF6B1A' },
    title: { size: 0.082, y: 0.1, color: '#191F28', accent: '#FFFFFF', family: 'black', weight: 900, lines: 2 },
    cap: { size: 0.05, weight: 800, family: 'pretendard', color: '#fff', y: 0.8, maxChars: 14, lines: 2, karaoke: '#FF8A3D', box: { color: '#191F28', alpha: 0.95, padX: 0.5, padY: 0.22, radius: 0.22 } },
    sample: { title: ['엄마가 남긴', '*한 줄*'], bottom: '', stickers: [] },
  },
  {
    id: 't06', name: '위아래 검정 띠 + 가로 영상', group: '위·아래',
    frame: { kind: 'bands', top: { h: 0.1, bg: '#000', size: 0.034 }, bottom: { h: 0.2, bg: '#000' } },
    title: { size: 0.032, y: 0.05, color: '#fff', accent: '#FFD21E', family: 'pretendard', weight: 800, lines: 1 },
    cap: { size: 0.042, weight: 700, family: 'pretendard', color: '#fff', y: 0.9, maxChars: 24, lines: 2 },
    sample: { title: ['30년 만에 다시 만난 두 사람'], bottom: '', stickers: [] },
  },
  {
    id: 't07', name: '흐린 배경 + 가로 영상 가운데', group: '위·아래',
    frame: { kind: 'center', bg: '#0E1114', cy: 0.52, margin: 0.04, radius: 0.02, blur: true },
    title: { size: 0.052, y: 0.09, color: '#fff', accent: '#FFD21E', family: 'black', weight: 900, lines: 2, shadow: true },
    cap: { size: 0.045, weight: 700, family: 'pretendard', color: '#fff', y: 0.9, maxChars: 22, lines: 2, box: { color: '#000', alpha: 0.6, padX: 0.5, padY: 0.2, radius: 0.14 } },
    sample: { title: ['이 영상', '끝까지 봐야 함'], bottom: '', stickers: [] },
  },
  {
    id: 't08', name: '위아래 크림 띠 + 아래 해설', group: '위·아래',
    frame: { kind: 'bands', top: { h: 0.16, bg: '#FFF7EA' }, bottom: { h: 0.26, bg: '#FFF7EA' }, line: '#EFE3CE' },
    title: { size: 0.058, y: 0.078, color: '#2B241C', accent: '#C25A16', family: 'myeongjo', weight: 800, lines: 2 },
    cap: { size: 0.04, weight: 700, family: 'gowun', color: '#3B3229', y: 0.9, maxChars: 26, lines: 3 },
    sample: { title: ['“그날 이후로"', '아무도 몰랐던 이야기'], bottom: '', stickers: [] },
  },
  {
    id: 't09', name: 'SNS 카드 + 아래 해설', group: '위·아래',
    frame: { kind: 'card', bg: '#F2F4F6', cardY: 0.14, cardH: 0.56, radius: 0.05, shadow: true, profile: true },
    title: { size: 0.05, y: 0.75, color: '#191F28', accent: '#3182F6', family: 'pretendard', weight: 800, lines: 2 },
    cap: { size: 0.038, weight: 600, family: 'pretendard', color: '#4E5968', y: 0.9, maxChars: 28, lines: 2 },
    sample: { title: ['이렇게 하면', '조회수가 *터집니다*'], bottom: '', stickers: [] },
  },
  {
    id: 't10', name: '그라데이션 제목 + 아래 큰 자막', group: '화면 가득',
    frame: { kind: 'full', bg: '#000', topShade: true, bottomShade: true },
    title: { size: 0.075, y: 0.12, color: '#fff', accent: '#FFD21E', family: 'black', weight: 900, lines: 2, shadow: true },
    cap: { size: 0.06, weight: 900, family: 'black', color: '#fff', y: 0.8, maxChars: 12, lines: 2, stroke: { color: '#000', w: 0.16 } },
    sample: { title: ['아무도 안 알려준', '*사실*'], bottom: '', stickers: [] },
  },
  {
    id: 't11', name: '기울어진 색 박스 제목', group: '화면 가득',
    frame: { kind: 'full', bg: '#000' },
    title: { size: 0.072, y: 0.16, color: '#14181C', accent: '#14181C', family: 'black', weight: 900, lines: 2, tiltBox: { color: '#FFD21E', alpha: 0.96, padX: 0.5, padY: 0.34, radius: 0.06, rot: -0.045 } },
    cap: { size: 0.052, weight: 800, family: 'pretendard', color: '#fff', y: 0.82, maxChars: 14, lines: 2, box: { color: '#000', alpha: 0.72, padX: 0.5, padY: 0.2, radius: 0.14 } },
    sample: { title: ['이거 모르면', '*손해*'], bottom: '', stickers: [] },
  },
  {
    id: 't12', name: '뉴스형 아래 띠', group: '화면 가득',
    frame: { kind: 'full', bg: '#000', bottomBar: 0.22 },
    title: { size: 0.05, y: 0.1, color: '#fff', accent: '#FF6B1A', family: 'pretendard', weight: 800, lines: 2, shadow: true },
    cap: { size: 0.044, weight: 800, family: 'pretendard', color: '#fff', y: 0.885, maxChars: 22, lines: 2, fullBand: { color: '#16191D', alpha: 0.94, edge: '#FF6B1A', padY: 0.5 } },
    sample: { title: ['단독 보도', '현장에 가 봤습니다'], bottom: '', stickers: [] },
  },
  {
    id: 't13', name: '큰 글씨 빠른 어절', group: '화면 가득',
    frame: { kind: 'full', bg: '#000', bottomShade: true },
    title: { size: 0.05, y: 0.1, color: '#fff', accent: '#FFD21E', family: 'black', weight: 900, lines: 1, shadow: true },
    cap: { size: 0.1, weight: 900, family: 'black', color: '#fff', y: 0.66, maxChars: 9, lines: 2, stroke: { color: '#000', w: 0.18 }, chunk: 3, hlColor: '#FFE135' },
    sample: { title: ['3초만 보세요'], bottom: '', stickers: [] },
  },
  {
    id: 't14', name: '지금 말하는 어절 박스', group: '화면 가득',
    frame: { kind: 'full', bg: '#000', topShade: true },
    title: { size: 0.046, y: 0.1, color: '#fff', accent: '#FFD21E', family: 'pretendard', weight: 800, lines: 1, shadow: true },
    cap: { size: 0.07, weight: 900, family: 'black', color: '#fff', y: 0.72, maxChars: 12, lines: 2, stroke: { color: '#000', w: 0.13 }, activeBox: '#FF6B1A' },
    sample: { title: ['말끝마다'], bottom: '', stickers: [] },
  },
  {
    id: 't15', name: '효과음 + 속마음 + 박스 대사', group: '화면 가득',
    frame: { kind: 'band', h: 0.17, bg: '#0B0E11', topShade: true },
    title: { size: 0.07, y: 0.088, color: '#fff', accent: '#FFD21E', family: 'black', weight: 900, lines: 2 },
    cap: { size: 0.047, weight: 700, family: 'pretendard', color: '#fff', y: 0.8, maxChars: 15, lines: 2, box: { color: '#0B0E11', alpha: 0.82, padX: 0.5, padY: 0.22, radius: 0.14 } },
    sample: {
      title: ['결혼 20년 차', '부부의 *속마음*'], bottom: '',
      stickers: [{ kind: 'effect', text: '쿵!', x: 0.26, y: 0.42 }, { kind: 'thought', text: '뭐지…?', x: 0.72, y: 0.58 }],
    },
  },
];

/* ------------------------------------------------------------------ *
 * 2. 자막 스타일 12종
 * ------------------------------------------------------------------ */
export const CAP_STYLES = [
  { id: '', name: '템플릿 기본', cap: null },
  { id: 'c01', name: '검정 박스 대사', cap: { size: 0.047, weight: 700, family: 'pretendard', color: '#fff', y: 0.79, maxChars: 15, lines: 2, box: { color: '#000', alpha: 0.8, padX: 0.5, padY: 0.2, radius: 0.12 } } },
  { id: 'c02', name: '큰 외곽선', cap: { size: 0.066, weight: 900, family: 'black', color: '#fff', y: 0.72, maxChars: 11, lines: 2, stroke: { color: '#000', w: 0.17 } } },
  { id: 'c03', name: '외곽선 + 키워드 색', cap: { size: 0.056, weight: 800, family: 'pretendard', color: '#fff', y: 0.75, maxChars: 13, lines: 2, stroke: { color: '#000', w: 0.14 } } },
  { id: 'c04', name: '먹색 박스', cap: { size: 0.048, weight: 800, family: 'pretendard', color: '#fff', y: 0.8, maxChars: 14, lines: 2, box: { color: '#191F28', alpha: 0.84, padX: 0.52, padY: 0.22, radius: 0.18 } } },
  { id: 'c05', name: '먹색 박스 물듦', cap: { size: 0.049, weight: 800, family: 'pretendard', color: '#fff', y: 0.8, maxChars: 14, lines: 2, karaoke: '#FF8A3D', box: { color: '#191F28', alpha: 0.95, padX: 0.52, padY: 0.22, radius: 0.24 } } },
  { id: 'c06', name: '노랑 하이라이트', cap: { size: 0.05, weight: 900, family: 'black', color: '#191F28', y: 0.8, maxChars: 13, lines: 2, box: { color: '#FFD21E', alpha: 0.97, padX: 0.46, padY: 0.22, radius: 0.1 } } },
  { id: 'c07', name: '흰 글씨 + 그림자', cap: { size: 0.05, weight: 800, family: 'pretendard', color: '#fff', y: 0.8, maxChars: 15, lines: 2, shadow: true } },
  { id: 'c08', name: '굵은 흰 글씨 + 강조색', cap: { size: 0.06, weight: 900, family: 'black', color: '#fff', y: 0.79, maxChars: 12, lines: 2, shadow: true } },
  { id: 'c09', name: '해설 글씨 (밝은 바탕)', cap: { size: 0.045, weight: 600, family: 'gowun', color: '#2B241C', y: 0.86, maxChars: 22, lines: 2 } },
  { id: 'c10', name: '뉴스형 아래 띠', cap: { size: 0.044, weight: 800, family: 'pretendard', color: '#fff', y: 0.885, maxChars: 22, lines: 2, fullBand: { color: '#16191D', alpha: 0.94, edge: '#FF6B1A', padY: 0.5 } } },
  { id: 'c11', name: '빠른 어절 (3개씩)', cap: { size: 0.093, weight: 900, family: 'black', color: '#fff', y: 0.67, maxChars: 9, lines: 2, stroke: { color: '#000', w: 0.19 }, chunk: 3 } },
  { id: 'c12', name: '지금 말하는 어절 박스', cap: { size: 0.07, weight: 900, family: 'black', color: '#fff', y: 0.72, maxChars: 12, lines: 2, stroke: { color: '#000', w: 0.13 }, activeBox: '#FF6B1A' } },
];

export function withCapStyle(tpl, style) {
  if (!style || !style.cap) return tpl;
  return { ...tpl, cap: { ...style.cap } };
}

/* ------------------------------------------------------------------ *
 * 3. 그리기
 * ------------------------------------------------------------------ */
function videoRect(W, H, frame, sw, sh) {
  const k = frame.kind || 'full';
  if (k === 'band') return { x: 0, y: H * frame.h, w: W, h: H * (1 - frame.h), fit: 'cover' };
  if (k === 'bands') {
    const top = frame.top || { h: 0 }, bot = frame.bottom || { h: 0 };
    return { x: 0, y: H * top.h, w: W, h: H * (1 - top.h - bot.h), fit: 'cover' };
  }
  if (k === 'card') return { x: W * 0.045, y: H * frame.cardY, w: W * 0.91, h: H * frame.cardH, r: W * (frame.radius || 0.04), fit: 'cover' };
  if (k === 'full') return { x: 0, y: 0, w: W, h: H, fit: 'cover' };
  // center: 넣은 영상의 비율을 지키며 가운데
  const m = frame.margin || 0, w = W * (1 - 2 * m);
  const h = sh && sw ? Math.min(w * sh / sw, H * 0.7) : w * 9 / 16;
  return { x: (W - w) / 2, y: H * frame.cy - h / 2, w, h, r: W * (frame.radius || 0), fit: 'none' };
}

function drawSource(ctx, r, src) {
  if (!src || !src.el) return false;
  const { el, w, h } = src;
  const sw = w || el.width || 1, sh = h || el.height || 1;
  ctx.save();
  if (r.r) { roundRect(ctx, r.x, r.y, r.w, r.h, r.r); ctx.clip(); }
  else { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); }
  let k;
  if (r.fit === 'none') k = Math.min(r.w / sw, r.h / sh);
  else k = Math.max(r.w / sw, r.h / sh);
  const dw = sw * k, dh = sh * k;
  try { ctx.drawImage(el, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh); } catch { ctx.restore(); return false; }
  ctx.restore();
  return true;
}

function drawBlurBg(ctx, W, H, src, overlay) {
  if (!src || !src.el) return;
  const { el, w, h } = src;
  const sw = w || 1, sh = h || 1, k = Math.max(W / sw, H / sh);
  ctx.save();
  try { ctx.filter = 'blur(26px) saturate(1.15)'; } catch { /* filter 미지원 */ }
  ctx.drawImage(el, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
  ctx.restore();
  ctx.fillStyle = `rgba(8,11,15,${overlay})`;
  ctx.fillRect(0, 0, W, H);
}

/* ---- 글자 ---- */
function layoutWords(ctx, words, maxW, maxChars) {
  const lines = [];
  let line = [], width = 0;
  const sp = ctx.measureText(' ').width;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    const add = line.length ? sp + ww : ww;
    const chars = line.join(' ').length + (line.length ? 1 : 0) + w.length;
    if (line.length && (width + add > maxW || (maxChars && chars > maxChars))) {
      lines.push(line); line = [w]; width = ww;
    } else { line.push(w); width += add; }
  }
  if (line.length) lines.push(line);
  return { lines, space: sp };
}

// 낱말 하나가 줄보다 넓으면 글자 단위로 쪼갠다(한국어 붙여쓰기 대비)
function fitWords(ctx, words, maxW) {
  const out = [];
  for (const w of words) {
    if (ctx.measureText(w).width <= maxW || w.length < 2) { out.push(w); continue; }
    let buf = '';
    for (const ch of w) {
      if (ctx.measureText(buf + ch).width > maxW && buf) { out.push(buf); buf = ch; }
      else buf += ch;
    }
    if (buf) out.push(buf);
  }
  return out;
}

function marked(text) {
  // *별표*로 감싼 낱말 표시
  const parts = String(text || '').split(/(\*[^*]+\*)/).filter(s => s !== '');
  return parts.map(p => (/^\*[^*]+\*$/.test(p) ? { word: p.slice(1, -1), mark: true } : { word: p, mark: false }));
}

function drawWordLine(ctx, items, cx, y, o) {
  // items: [{word, color}]
  const w = items.reduce((a, it, i) => a + ctx.measureText(it.word).width + (i ? o.space : 0), 0);
  let x = o.align === 'left' ? cx : cx - w / 2;
  for (const it of items) {
    const ww = ctx.measureText(it.word).width;
    if (o.stroke) { ctx.lineWidth = o.strokeW; ctx.strokeStyle = o.strokeColor; ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.strokeText(it.word, x, y); }
    ctx.fillStyle = it.color;
    ctx.fillText(it.word, x, y);
    x += ww + o.space;
  }
  return w;
}

function drawRichText(ctx, text, o) {
  // o: {x:centerX, y, size, weight, family, color, markColor, hl:[], stroke, maxW, maxChars, lines, lineH, align, shadow}
  ctx.font = fontCss(o.family, o.weight, o.size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const maxW = o.maxW || 9999;
  // 보낸 줄바꿈은 그대로 한 줄로 살리고, 줄이 넘치면 그 안에서 다시 나눈다
  const srcLines = Array.isArray(text) ? text : String(text ?? '').split('\n');
  const rows = [];
  let idx = 0;
  for (const srcLine of srcLines) {
    const marks = marked(srcLine);
    const flat = [];
    for (const m of marks) {
      const ws = m.word.split(/\s+/).filter(Boolean);
      for (const w of ws) flat.push({ word: w, mark: m.mark, i: idx++ });
    }
    if (!flat.length) continue;
    const fitted = [];
    for (const f of flat) {
      const parts = fitWords(ctx, [f.word], maxW);
      parts.forEach(p => fitted.push({ ...f, word: p }));
    }
    const { lines } = layoutWords(ctx, fitted.map(f => f.word), maxW, o.maxChars);
    let li = 0;
    for (const line of lines) rows.push(line.map(() => fitted[li++]).filter(Boolean));
  }
  if (!rows.length) return { rows: [], lineH: 0, total: 0, top: o.y };
  const space = ctx.measureText(' ').width;
  const capped = rows.slice(0, o.lines || 3);
  const lineH = o.lineH || o.size * 1.34;
  const total = capped.length * lineH;
  let y = o.y - total / 2 + lineH / 2;
  const hlSet = new Set(o.hl || []);
  for (const row of capped) {
    const items = row.map(f => ({
      word: f.word,
      color: o.markColor && f.mark ? o.markColor : (hlSet.has(f.i) ? (o.markColor || '#FFD21E') : o.color),
    }));
    if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = o.size * 0.35; ctx.shadowOffsetY = o.size * 0.06; }
    else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
    drawWordLine(ctx, items, o.x, y, { space, align: o.align, stroke: o.stroke, strokeW: o.stroke ? o.size * o.stroke.w : 0, strokeColor: o.stroke?.color });
    y += lineH;
  }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  return { rows: capped, lineH, total, top: o.y - total / 2, space };
}

function drawTitle(ctx, W, H, t, st) {
  const cfg = t.title;
  if (!cfg) return;
  const scale = (st.opt?.title?.scale || 1);
  const family = st.opt?.title?.family || cfg.family;
  const size = sizeRef(W, H) * cfg.size * scale;
  const text = Array.isArray(st.title) ? st.title.filter(s => String(s).trim() !== '').slice(0, cfg.lines || 2) : String(st.title || '');
  if (!text.length) return;
  const cx = W / 2 + (st.opt?.title?.dx || 0);
  const cy = H * cfg.y + (st.opt?.title?.dy || 0);
  const maxW = W * 0.88;

  // 제목 배경(말풍선·기울인 박스)
  if (cfg.bubble || cfg.tiltBox) {
    const box = cfg.bubble || cfg.tiltBox;
    ctx.save();
    ctx.font = fontCss(family, cfg.weight, size);
    const probe = drawMeasure(ctx, text, size, maxW, cfg.lines || 2, cfg.bubble ? 0.86 : 0.9);
    const bw = probe.w + size * (box.padX || 0.45) * 0.9, bh = probe.h + size * 0.55;
    if (box.rot) { ctx.translate(cx, cy); ctx.rotate(box.rot); ctx.translate(-cx, -cy); }
    ctx.fillStyle = rgba(box.color, box.alpha ?? 1);
    roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, size * (box.radius || 0.2) * 2);
    ctx.fill();
    if (box.tail) {
      ctx.beginPath();
      const tx = cx, ty = cy + bh / 2;
      ctx.moveTo(tx - size * 0.3, ty - 1);
      ctx.lineTo(tx + size * 0.3, ty - 1);
      ctx.lineTo(tx, ty + size * 0.4);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawRichText(ctx, text, {
    x: cx, y: cy, size, weight: cfg.weight || 800, family,
    color: cfg.color, markColor: cfg.accent, maxW, maxChars: 0,
    lines: cfg.lines || 2, shadow: !!cfg.shadow, align: 'center',
  });
}

function drawMeasure(ctx, text, size, maxW, lines, ratio) {
  const srcLines = Array.isArray(text) ? text : String(text || '').split('\n');
  let w = 1, n = 0;
  for (const line of srcLines) {
    const words = String(line).replace(/\*/g, '').split(/\s+/).filter(Boolean);
    const { lines: rows, space } = layoutWords(ctx, words, maxW * ratio, 0);
    for (const r of rows) {
      if (n >= lines) break;
      w = Math.max(w, r.reduce((a, x, i) => a + ctx.measureText(x).width + (i ? space : 0), 0));
      n++;
    }
  }
  return { w, h: Math.max(1, n) * size * 1.34 };
}

function drawCue(ctx, W, H, t, st) {
  const cfg = t.cap;
  if (!cfg) return;
  const cue = st.cue;
  if (!cue) return;
  const scale = (st.opt?.cap?.scale || 1);
  const family = st.opt?.cap?.family || cfg.family;
  const M = sizeRef(W, H);
  const size = M * cfg.size * scale;
  const y = H * (st.opt?.cap?.y ?? cfg.y);
  const cx = W / 2 + (st.opt?.cap?.dx || 0);
  const maxW = W * 0.86;

  ctx.save();
  ctx.font = fontCss(family, cfg.weight, size);
  let text = cue.text || '';
  let hl = cue.hl || [];

  // 어절 묶음(빠른 어절)
  if (cfg.chunk) {
    const words = text.split(/\s+/).filter(Boolean);
    const p = clamp01(cue.progress || 0);
    const n = Math.ceil(words.length / cfg.chunk);
    const at = Math.min(n - 1, Math.floor(p * n));
    const startIdx = at * cfg.chunk;
    text = words.slice(startIdx, startIdx + cfg.chunk).join(' ');
    hl = hl.filter(i => i >= startIdx && i < startIdx + cfg.chunk).map(i => i - startIdx);
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) { ctx.restore(); return; }
  const { lines, space } = layoutWords(ctx, words, maxW, cfg.maxChars);
  const rows = lines.slice(0, cfg.lines || 2);
  const lineH = size * 1.32;
  const total = rows.length * lineH;

  // 박스
  if (cfg.box) {
    const bx = cfg.box;
    const widest = Math.max(...rows.map(r => r.reduce((a, w, i) => a + ctx.measureText(w).width + (i ? space : 0), 0)));
    const padX = size * (bx.padX ?? 0.45), padY = size * (bx.padY ?? 0.2);
    ctx.fillStyle = rgba(bx.color, bx.alpha ?? 0.85);
    if (rows.length) {
      roundRect(ctx, cx - widest / 2 - padX, y - total / 2 - padY, widest + padX * 2, total + padY * 2, size * (bx.radius ?? 0.12));
      ctx.fill();
    }
  }
  // 아래 띠(뉴스형)
  if (cfg.fullBand) {
    const fb = cfg.fullBand;
    const bh = total + size * (fb.padY || 0.5) * 2;
    ctx.fillStyle = rgba(fb.color, fb.alpha ?? 0.94);
    ctx.fillRect(0, y - bh / 2, W, bh);
    if (fb.edge) { ctx.fillStyle = fb.edge; ctx.fillRect(0, y - bh / 2, W * 0.012, bh); }
  }

  let ty = y - total / 2 + lineH / 2;
  let wi = 0;
  for (const row of rows) {
    const rowItems = row.map(() => wi++);
    const width = row.reduce((a, w, i) => a + ctx.measureText(w).width + (i ? space : 0), 0);
    let x = cx - width / 2;
    for (let i = 0; i < row.length; i++) {
      const w = row[i], ww = ctx.measureText(w).width, gi = rowItems[i];
      const on = hl.includes(gi);
      if (cfg.activeBox && cue.active != null) {
        // 지금 말하는 어절 박스
        if (gi === cue.active || (cue.activeWord === w && gi === rowItems[Math.min(row.length - 1, 0)])) {
          ctx.fillStyle = rgba(cfg.activeBox, 0.95);
          roundRect(ctx, x - size * 0.1, ty - size * 0.62, ww + size * 0.2, size * 1.24, size * 0.16);
          ctx.fill();
        }
      }
      if (cfg.stroke) {
        ctx.lineWidth = size * cfg.stroke.w; ctx.strokeStyle = cfg.stroke.color; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
        ctx.strokeText(w, x, ty);
      }
      if (cfg.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * 0.3; ctx.shadowOffsetY = size * 0.05; }
      ctx.fillStyle = on ? (st.opt?.hlColor || cfg.hlColor || '#FFD21E') : cfg.color;
      ctx.fillText(w, x, ty);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      x += ww + space;
    }
    ty += lineH;
  }
  ctx.restore();
}

function drawBottom(ctx, W, H, t, st) {
  const text = String(st.bottom || '').trim();
  if (!text) return;
  const cfg = t.bottom || t.cap || {};
  const size = sizeRef(W, H) * 0.034;
  drawRichText(ctx, text, {
    x: W / 2, y: H * 0.955, size, weight: 700,
    family: st.opt?.bottom?.family || 'gowun', color: cfg.color || '#fff',
    markColor: cfg.accent, maxW: W * 0.86, lines: 2, shadow: true, align: 'center',
  });
}

const STICKER_LABEL = { label: '라벨', effect: '효과음', thought: '속마음' };

function drawStickers(ctx, W, H, st) {
  const boxes = [];
  const list = st.stickers || [];
  list.forEach((s, i) => {
    const text = String(s.text || '').trim();
    if (!text) return;
    const x = W * s.x, y = H * s.y;
    const fam = st.opt?.sticker?.family || 'black';
    let size = sizeRef(W, H) * 0.055;
    ctx.save();
    ctx.font = fontCss(fam, 900, size);
    let tw = ctx.measureText(text).width;
    if (tw > W * 0.8) { size *= (W * 0.8) / tw; ctx.font = fontCss(fam, 900, size); tw = ctx.measureText(text).width; }
    const padX = size * 0.45, padY = size * 0.34;
    if (s.kind === 'effect') {
      ctx.translate(x, y); ctx.rotate(-0.06);
      ctx.fillStyle = '#FFD21E';
      roundRect(ctx, -tw / 2 - padX, -size * 0.72 - padY, tw + padX * 2, size * 1.44 + padY * 2, size * 0.12);
      ctx.fill();
      ctx.fillStyle = '#191F28';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 0);
      boxes.push({ i, x: x - tw / 2 - padX, y: y - size * 0.72 - padY, w: tw + padX * 2, h: size * 1.44 + padY * 2 });
    } else if (s.kind === 'thought') {
      const bh = size * 1.5, bw = tw + padX * 2;
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - bw * 0.18, y + bh * 0.62, size * 0.16, 0, Math.PI * 2);
      ctx.arc(x - bw * 0.26, y + bh * 0.86, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#191F28';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
      boxes.push({ i, x: x - bw / 2, y: y - bh / 2, w: bw, h: bh });
    } else {
      const bh = size * 1.42, bw = tw + padX * 2;
      ctx.fillStyle = '#111417';
      roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, bh * 0.3);
      ctx.fill();
      ctx.fillStyle = '#FF3B30';
      ctx.beginPath(); ctx.arc(x - bw / 2 + size * 0.34, y, size * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x + size * 0.12, y);
      boxes.push({ i, x: x - bw / 2, y: y - bh / 2, w: bw, h: bh });
    }
    ctx.restore();
  });
  return boxes;
}

/* ---- 틀 장식: 영상 뒤에 깔리는 것 ---- */
function drawBackDecor(ctx, W, H, t) {
  const f = t.frame;
  if (f.kind === 'band') {
    ctx.fillStyle = f.bg || '#000';
    ctx.fillRect(0, 0, W, H * f.h);
    if (f.line) { ctx.fillStyle = f.line; ctx.fillRect(0, H * f.h, W, Math.max(1, H * 0.0016)); }
  }
  if (f.kind === 'bands') {
    const top = f.top || { h: 0 }, bot = f.bottom || { h: 0 };
    ctx.fillStyle = top.bg || '#000';
    ctx.fillRect(0, 0, W, H * top.h);
    ctx.fillStyle = bot.bg || '#000';
    ctx.fillRect(0, H * (1 - bot.h), W, H * bot.h);
    if (f.line) { ctx.fillStyle = f.line; ctx.fillRect(0, H * (1 - bot.h), W, Math.max(1, H * 0.0016)); }
  }
  if (f.kind === 'card' && f.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(25,31,40,.16)'; ctx.shadowBlur = W * 0.05; ctx.shadowOffsetY = H * 0.008;
    ctx.fillStyle = '#fff';
    roundRect(ctx, W * 0.045, H * f.cardY, W * 0.91, H * f.cardH, W * (f.radius || 0.04));
    ctx.fill();
    ctx.restore();
  }
  if (f.kind === 'card' && f.profile) drawProfile(ctx, W, H, t);
}

/* ---- 틀 장식: 영상 위에 덮이는 것 ---- */
function drawOverlayDecor(ctx, W, H, t) {
  const f = t.frame;
  if (f.topShade) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.34);
    g.addColorStop(0, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.34);
  }
  if (f.bottomShade) {
    const g = ctx.createLinearGradient(0, H * 0.62, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.78)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.62, W, H * 0.38);
  }
  if (f.bottomBar && f.kind === 'full') {
    const g = ctx.createLinearGradient(0, H * (1 - f.bottomBar - 0.06), 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,.8)');
    ctx.fillStyle = g; ctx.fillRect(0, H * (1 - f.bottomBar - 0.06), W, H * (f.bottomBar + 0.06));
  }
}

function drawProfile(ctx, W, H, t) {
  const y = H * (t.frame.cardY - 0.045);
  ctx.save();
  ctx.fillStyle = '#3182F6';
  ctx.beginPath(); ctx.arc(W * 0.09, y, W * 0.026, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = fontCss('pretendard', 800, sizeRef(W, H) * 0.03);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('구독', W * 0.09, y);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#191F28'; ctx.font = fontCss('pretendard', 800, sizeRef(W, H) * 0.03);
  ctx.fillText('@mychannel', W * 0.133, y - W * 0.012);
  ctx.fillStyle = '#8B95A1'; ctx.font = fontCss('pretendard', 600, sizeRef(W, H) * 0.024);
  ctx.fillText('방금 전 · 조회 1.2만회', W * 0.133, y + W * 0.018);
  ctx.restore();
}

/**
 * @param ctx 캔버스 2D
 * @param W,H 완성 크기
 * @param st { tpl, title[], bottom, cue{text,hl,progress,active}, stickers[], opt{cap,title,bottom,hlColor} }
 * @param src { el, w, h } | null
 */
export function renderFrame(ctx, W, H, st, src) {
  const t = st.tpl;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const f = t.frame || { kind: 'full', bg: '#000' };
  const needsBg = !(f.kind === 'full');
  if (needsBg) { ctx.fillStyle = f.bg || '#000'; ctx.fillRect(0, 0, W, H); }
  else { ctx.fillStyle = f.bg || '#000'; ctx.fillRect(0, 0, W, H); }

  const r = videoRect(W, H, f, src?.w, src?.h);
  if ((f.kind === 'center' || f.kind === 'card') && f.blur) drawBlurBg(ctx, W, H, src, 0.55);

  drawBackDecor(ctx, W, H, t);
  const drew = drawSource(ctx, r, src);
  if (!drew && f.kind !== 'full') {
    // 영상이 없을 때: 빈 자리 표시
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  drawOverlayDecor(ctx, W, H, t);

  drawTitle(ctx, W, H, t, st);
  drawCue(ctx, W, H, t, st);
  drawBottom(ctx, W, H, t, st);
  const boxes = drawStickers(ctx, W, H, st);
  ctx.restore();
  return { boxes, videoRect: r };
}

// 템플릿 목록 미리보기 그림(글자 없이 틀만)
export function drawThumb(canvas, tpl, ratio = '9:16') {
  const W = 180;
  const H = ratio === '16:9' ? Math.round(W * 9 / 16) : Math.round(W * 13 / 9);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const t = { ...tpl };
  renderFrame(ctx, W, H, {
    tpl: t, title: t.sample?.title || [], bottom: '',
    cue: { text: (t.sample?.title || [''])[0] || '자막 예시' }, stickers: (t.sample?.stickers || []).slice(0, 1), opt: {},
  }, null);
}
