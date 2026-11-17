// 탭 2 — 내 영상 자막·템플릿 편집기. 영상·소리는 브라우저 밖으로 나가지 않는다.
import { PRESETS, CAP_STYLES, FONTS, withCapStyle, renderFrame, drawThumb, ensureFonts } from './templates.js?v=4';
import { parseSrt, toSrt, splitLong, splitCue, remapCues, activeCue, clockT, parseClock } from './cues.js?v=4';
import { decodeFile, analyzeSilence, buildKeep, keepLength, peaksOf, audioCtx } from './audio.js?v=4';
import { transcribeGroq, transcribeLocal } from './groq.js?v=4';
import { recordVideo, pickMime, aacSupported } from './export.js?v=4';
import { $, esc, toast, fmtDur, download, store } from './ui.js?v=4';

const MAX_SEC = 600;

const video = document.createElement('video');
video.playsInline = true;
video.preload = 'auto';
video.setAttribute('playsinline', '');
video.crossOrigin = 'anonymous';
video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
document.body.appendChild(video);

const view = $('#preview');
const vctx = view.getContext('2d');

const S = {
  file: null, url: '', duration: 0, vw: 0, vh: 0, audio: null,
  cues: [], cuts: [], cutOn: false, cutHistory: [], wins: null,
  tplId: store.get('yf.tpl', 't01'), capStyle: store.get('yf.capStyle', ''), ratio: store.get('yf.ratio', ''),
  hlColor: store.get('yf.hl', '#FFD21E'),
  title: ['', ''], bottom: '',
  stickers: [], opt: { cap: { family: '' }, title: { family: '' }, bottom: { family: '' } },
  boxes: [], playing: false, drag: null, busy: false, exporting: false,
};

/* ---------------- 준비 ---------------- */
const tplOf = () => PRESETS.find(p => p.id === S.tplId) || PRESETS[0];
const styleOf = () => CAP_STYLES.find(c => c.id === S.capStyle) || CAP_STYLES[0];
const currentTpl = () => withCapStyle(tplOf(), styleOf());
const outRatio = () => S.ratio || (S.vw && S.vh && S.vw > S.vh ? '16:9' : '9:16');
const outSize = () => (outRatio() === '16:9' ? [1920, 1080] : [1080, 1920]);

const blank = document.createElement('canvas');
blank.width = 1080; blank.height = 1920;
{
  const g = blank.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 1920);
  gr.addColorStop(0, '#3A424C'); gr.addColorStop(0.55, '#242A31'); gr.addColorStop(1, '#14181D');
  g.fillStyle = gr; g.fillRect(0, 0, 1080, 1920);
  g.fillStyle = 'rgba(255,255,255,.06)';
  g.beginPath(); g.arc(540, 900, 210, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.beginPath(); g.moveTo(505, 845); g.lineTo(505, 955); g.lineTo(590, 900); g.closePath(); g.fill();
}

const srcNow = () => (S.file && video.readyState >= 2 ? { el: video, w: S.vw, h: S.vh } : { el: blank, w: 1080, h: 1920 });

function cueAt(t) {
  if (!S.cues.length) return { text: '자막은 여기에 이렇게 나와요', hl: [2], progress: 0.4, active: 2 };
  const c = activeCue(S.cues, t);
  if (!c) return null;
  const p = Math.max(0, Math.min(1, (t - c.start) / Math.max(0.01, c.end - c.start)));
  const n = c.text.split(/\s+/).filter(Boolean).length;
  return { text: c.text, hl: c.hl || [], progress: p, active: Math.min(n - 1, Math.floor(p * n)) };
}

function drawAt(t) {
  const W = view.width, H = view.height;
  const st = {
    tpl: currentTpl(), title: S.title, bottom: S.bottom, stickers: S.stickers,
    opt: { ...S.opt, hlColor: S.hlColor }, cue: cueAt(t),
  };
  const r = renderFrame(vctx, W, H, st, srcNow());
  S.boxes = r.boxes || [];
}

function resizeCanvas() {
  const [W, H] = outSize();
  const w = Math.round(W / 2), h = Math.round(H / 2);
  if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  view.style.aspectRatio = `${W} / ${H}`;
  const wrap = $('#previewWrap');
  wrap.style.aspectRatio = `${W} / ${H}`;
  wrap.style.maxWidth = W > H ? '640px' : '430px';
  const card = wrap.closest('.preview-card');
  if (card) card.style.maxWidth = W > H ? '680px' : '440px';
}

export function redraw() {
  resizeCanvas();
  drawAt(video.currentTime || 0);
}

function busy(on, text) {
  S.busy = on;
  $('#previewBusy').hidden = !on;
  if (text) $('#busyText').textContent = text;
}

/* ---------------- 영상 넣기 ---------------- */
async function loadFile(file) {
  if (!file) return;
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name)) {
    toast('영상 파일을 넣어 주세요'); return;
  }
  if (S.url) URL.revokeObjectURL(S.url);
  S.file = file;
  S.audio = null; S.wins = null; S.cuts = []; S.cutHistory = [];
  S.url = URL.createObjectURL(file);
  video.src = S.url;
  busy(true, '영상 여는 중');
  try {
    await new Promise((res, rej) => {
      const ok = () => { cleanup(); res(); };
      const bad = () => { cleanup(); rej(new Error('이 브라우저에서 열 수 없는 형식이에요. MP4로 바꿔 보세요.')); };
      const cleanup = () => { video.removeEventListener('loadedmetadata', ok); video.removeEventListener('error', bad); };
      video.addEventListener('loadedmetadata', ok);
      video.addEventListener('error', bad);
    });
  } catch (e) {
    busy(false);
    toast(e.message);
    return;
  }
  S.duration = video.duration || 0;
  S.vw = video.videoWidth || 0;
  S.vh = video.videoHeight || 0;
  if (!S.ratio) S.ratio = S.vw > S.vh ? '16:9' : '9:16';
  $('#dropZone').hidden = true;
  $('#fileInfo').textContent = `${file.name.slice(0, 34)} · ${fmtDur(S.duration)} · ${S.vw}×${S.vh}`;
  if (S.duration > MAX_SEC) {
    $('#fileInfo').className = 'pill warn';
    $('#fileInfo').textContent = `10분 초과 · ${fmtDur(S.duration)}`;
    toast('10분이 넘는 영상이에요. 10분까지 잘라 넣기를 권해요');
  } else {
    $('#fileInfo').className = 'pill';
  }
  setRatioUI();
  syncButtons();
  busy(false);
  redraw();
  updatePlayer();
  renderTimeline();
}

function clearFile() {
  S.file = null; S.audio = null; S.cues = []; S.cuts = []; S.wins = null;
  video.removeAttribute('src'); video.load();
  if (S.url) URL.revokeObjectURL(S.url);
  S.url = '';
  $('#dropZone').hidden = false;
  $('#fileInfo').textContent = '영상 없음';
  $('#fileInfo').className = 'pill';
  buildCues(); renderTimeline(); syncButtons(); redraw(); updatePlayer();
}

/* ---------------- 재생 ---------------- */
function cutAt(t) {
  if (!S.cutOn) return null;
  return S.cuts.find(c => t >= c.s - 0.01 && t < c.e - 0.02) || null;
}

function updatePlayer() {
  const d = S.duration || 0, t = video.currentTime || 0;
  $('#seek').value = d ? String(Math.round((t / d) * 1000)) : '0';
  $('#time').textContent = `${clockT(t)} / ${clockT(d)}`;
}

let rafId = 0;
function loop() {
  if (!S.playing) { rafId = 0; return; }
  const t = video.currentTime;
  const c = cutAt(t);
  if (c) { try { video.currentTime = Math.min(c.e, S.duration); } catch { /* noop */ } }
  drawAt(video.currentTime);
  updatePlayer();
  rafId = requestAnimationFrame(loop);
}

function playPause(force) {
  if (!S.file) { toast('먼저 영상을 넣어 주세요'); return; }
  const want = force === undefined ? video.paused : force;
  if (want) {
    video.play().then(() => {
      S.playing = true;
      $('#playIcon').innerHTML = '<path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" fill="currentColor"/>';
      if (!rafId) loop();
    }).catch(() => toast('재생할 수 없어요'));
  } else {
    video.pause(); S.playing = false;
    $('#playIcon').innerHTML = '<path d="M8 5.5v13l11-6.5L8 5.5z" fill="currentColor"/>';
    drawAt(video.currentTime);
    updatePlayer();
  }
}

video.addEventListener('ended', () => {
  S.playing = false;
  $('#playIcon').innerHTML = '<path d="M8 5.5v13l11-6.5L8 5.5z" fill="currentColor"/>';
  updatePlayer();
});
video.addEventListener('seeked', () => { if (!S.playing) { drawAt(video.currentTime); updatePlayer(); } });

/* ---------------- 소리 연결(내보내기용) ---------------- */
let graph = null;
function ensureGraph() {
  if (graph) return graph;
  const ctx = audioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const src = ctx.createMediaElementSource(video);
  const spk = ctx.createGain();
  const dest = ctx.createMediaStreamDestination();
  src.connect(spk).connect(ctx.destination);
  src.connect(dest);
  graph = { ctx, src, spk, dest };
  return graph;
}

/* ---------------- 자막 목록 ---------------- */
function buildCues() {
  const box = $('#cueList');
  $('#cueCount').textContent = `${S.cues.length}줄`;
  if (!S.cues.length) {
    box.innerHTML = `<p class="hint">아직 자막이 없어요. 위에서 <b>받아쓰기</b>를 하거나 <b>줄 추가</b>로 직접 넣어 주세요.</p>`;
    return;
  }
  box.innerHTML = S.cues.map((c, i) => {
    const ws = c.text.split(/\s+/).filter(Boolean);
    return `
    <div class="cue" data-i="${i}">
      <div class="cue-top">
        <input type="text" class="t0" data-i="${i}" value="${clockT(c.start)}" aria-label="시작 시간">
        <span style="color:var(--ink3);font-size:11px">~</span>
        <input type="text" class="t1" data-i="${i}" value="${clockT(c.end)}" aria-label="끝 시간">
        <button class="del" data-del="${i}" type="button" aria-label="줄 삭제">×</button>
      </div>
      <textarea class="cue-text" data-i="${i}" rows="1">${esc(c.text)}</textarea>
      <div class="cue-words">${ws.map((w, k) =>
        `<button class="w${(c.hl || []).includes(k) ? ' on' : ''}" data-hl="${i}:${k}" type="button">${esc(w)}</button>`).join('')}</div>
    </div>`;
  }).join('');
  syncButtons();
}

function syncButtons() {
  const has = S.cues.length > 0;
  $('#btnSplitLong').disabled = !has;
  $('#btnClearCues').disabled = !has;
  $('#btnTranscribe').disabled = !S.file || S.busy;
  $('#btnAnalyze').disabled = !S.file || S.busy;
  $('#btnExport').disabled = !S.file || S.busy || S.exporting;
  $('#playToggle').disabled = !S.file;
  $('#btnSrtOut').disabled = !has;
  $('#btnUndoCut').disabled = !S.cutHistory.length;
  $('#btnResetCut').disabled = !S.cuts.length;
}

/* ---------------- 자동 컷 타임라인 ---------------- */
let peaks = null;
function renderTimeline() {
  const cv = $('#tl');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 340, h = 64;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#F2F4F6'; g.fillRect(0, 0, w, h);
  const d = S.duration || 1;
  const p = peaks;
  if (p) {
    g.fillStyle = '#C9D2DC';
    const step = w / p.length;
    for (let i = 0; i < p.length; i++) {
      const bh = Math.max(1.5, p[i] * (h - 12));
      g.fillRect(i * step, (h - bh) / 2, Math.max(1, step - 0.4), bh);
    }
  }
  // 잘라낸 구간
  for (const c of S.cuts) {
    const x = (c.s / d) * w, cw = Math.max(1, ((c.e - c.s) / d) * w);
    g.fillStyle = 'rgba(240,68,82,.26)';
    g.fillRect(x, 0, cw, h);
    g.fillStyle = 'rgba(240,68,82,.85)';
    g.fillRect(x, 0, Math.max(1, cw), 2);
    g.fillRect(x, h - 2, Math.max(1, cw), 2);
  }
  g.fillStyle = '#3182F6';
  const px = ((video.currentTime || 0) / d) * w;
  g.fillRect(px - 1, 0, 2, h);
  const kept = S.cutOn && S.cuts.length ? keepLength(buildKeep(S.cuts, d)) : d;
  $('#cutInfo').textContent = !S.cuts.length ? (S.cutOn ? '자동 컷 켜짐 · 찾은 구간 없음' : '자동 컷 꺼짐')
    : `${S.cutOn ? '자동 컷 적용' : '자동 컷 대기'} · ${fmtDur(d)} → ${fmtDur(kept)} (${Math.round(d - kept)}초 줄임)`;
  $('#cutInfo').className = S.cutOn && S.cuts.length ? 'pill soft' : 'pill';
}

/* ---------------- 받아쓰기 ---------------- */
async function ensureAudio() {
  if (S.audio) return S.audio;
  busy(true, '소리를 읽는 중');
  S.audio = await decodeFile(S.file);
  busy(false);
  return S.audio;
}

async function doTranscribe() {
  if (!S.file || S.busy) return;
  const mode = $('#sttMode').value;
  const msg = $('#sttMsg');
  msg.className = 'msg'; msg.textContent = '';
  const bar = $('#sttProg'), fill = $('#sttBar'), pct = $('#sttPct');
  const setP = (p, text) => {
    bar.hidden = false;
    fill.style.width = `${Math.round(p * 100)}%`;
    pct.textContent = `${Math.round(p * 100)}%`;
    if (text) busy(true, text);
  };
  try {
    busy(true, '받아쓰기 준비 중');
    S.busy = true; syncButtons();
    setP(0.02, '받아쓰기 준비 중');
    const audio = await ensureAudio();
    let out;
    if (mode === 'local') {
      out = await transcribeLocal(audio, { model: 'base', language: 'korean', onProgress: (p, t) => setP(0.05 + p * 0.9, t) });
    } else {
      const key = $('#groqKey').value.trim();
      store.set('yf.groq', key);
      out = await transcribeGroq(audio, key, { onProgress: (p, t) => setP(p, t) });
    }
    if (!out.cues.length) throw new Error('소리에서 말을 찾지 못했어요. 목소리가 작거나 소리 없는 영상일 수 있어요.');
    S.cues = out.cues;
    buildCues();
    redraw();
    setP(1);
    msg.className = 'msg ok';
    msg.textContent = `${S.cues.length}줄을 받아 적었어요. 아래에서 고치면 바로 화면에 반영돼요.`;
    toast('받아쓰기 끝');
  } catch (e) {
    msg.className = 'msg bad';
    msg.textContent = e.message || '받아쓰기에 실패했어요';
    bar.hidden = true;
  } finally {
    busy(false);
    S.busy = false; syncButtons();
    setTimeout(() => { bar.hidden = true; fill.style.width = '0'; }, 1200);
  }
}

async function doAnalyze() {
  if (!S.file || S.busy) return;
  try {
    busy(true, '무음 찾는 중');
    S.busy = true; syncButtons();
    const audio = await ensureAudio();
    busy(true, '무음 찾는 중');
    const opt = {
      thresholdDb: Number($('#cutThr').value),
      minLen: Number($('#cutMinLen').value),
      pad: Number($('#cutPad').value),
    };
    const out = analyzeSilence(audio, opt);
    S.cutHistory.push(S.cuts.map(c => ({ ...c })));
    S.cuts = out.cuts;
    peaks = peaksOf(out.wins, 600);
    S.cutOn = true;
    $('#cutOn').checked = true;
    renderTimeline();
    toast(out.cuts.length ? `${out.cuts.length}곳을 잘라냈어요` : '자를 무음이 없었어요');
  } catch (e) {
    toast(e.message || '소리를 분석하지 못했어요');
  } finally {
    busy(false);
    S.busy = false; syncButtons();
  }
}

/* ---------------- 내보내기 ---------------- */
async function doExport() {
  if (!S.file || S.exporting) return;
  const note = $('#expMsg');
  note.className = 'msg'; note.textContent = '';
  const prefer = $('#fmtSel')?.value || 'mp4';
  const { mime, ext, supported } = pickMime(prefer);
  if (!supported) { note.className = 'msg bad'; note.textContent = '이 브라우저에서는 영상 녹화를 지원하지 않아요.'; return; }
  playPause(false);
  S.exporting = true; S.busy = true; syncButtons();
  busy(true, '내보내기 준비 중');
  const bar = $('#expProg'), fill = $('#expBar'), pct = $('#expPct');
  bar.hidden = false;
  const [W, H] = outSize();
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const cuts = S.cutOn ? S.cuts : [];
  const d = S.duration;
  const outDur = cuts.length ? keepLength(buildKeep(cuts, d)) : d;
  try {
    await ensureFonts([...(S.title || []), S.bottom, ...S.cues.map(c => c.text), ...S.stickers.map(s => s.text)].join(' '));
    const g = ensureGraph();
    if (g.ctx.state === 'suspended') await g.ctx.resume().catch(() => {});
    video.pause();
    const { blob, ext: realExt } = await recordVideo({
      canvas: cv, video, audioStream: g.dest.stream, cuts, duration: d, outDuration: outDur, prefer,
      bitrate: H >= 1080 ? 8000000 : 5000000,
      draw: t => {
        const st = {
          tpl: currentTpl(), title: S.title, bottom: S.bottom, stickers: S.stickers,
          opt: { ...S.opt, hlColor: S.hlColor }, cue: cueAt(t),
        };
        renderFrame(ctx, W, H, st, srcNow());
      },
      onProgress: p => {
        fill.style.width = `${Math.round(p * 100)}%`;
        pct.textContent = `${Math.round(p * 100)}%`;
        busy(true, `녹화 중 ${Math.round((p * outDur))}초 / ${Math.round(outDur)}초`);
      },
    });
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const name = `자막영상_${stamp}.${realExt || ext}`;
    download(blob, name);
    note.className = 'msg ok';
    note.textContent = `${name} · ${(blob.size / 1048576).toFixed(1)}MB 로 저장했어요.${(realExt || ext) === 'webm' ? ' (WebM으로 저장됨)' : ''}`;
    toast('영상을 내려받았어요');
  } catch (e) {
    note.className = 'msg bad';
    note.textContent = e.message || '내보내기에 실패했어요';
  } finally {
    busy(false);
    S.exporting = false; S.busy = false;
    bar.hidden = true; fill.style.width = '0';
    syncButtons();
    updatePlayer();
  }
}

/* ---------------- 꾸미기 목록 ---------------- */
function buildTemplates() {
  const box = $('#tplGrid');
  $('#tplCount').textContent = `${PRESETS.length}종`;
  box.innerHTML = PRESETS.map(p => `
    <button class="tpl${S.tplId === p.id ? ' on' : ''}" data-tpl="${p.id}" type="button" title="${esc(p.name)}">
      <canvas></canvas><span>${esc(p.name)}</span>
    </button>`).join('');
  box.querySelectorAll('.tpl').forEach(btn => {
    const p = PRESETS.find(x => x.id === btn.dataset.tpl);
    const c = btn.querySelector('canvas');
    try { drawThumb(c, p); } catch { /* 그림 실패는 넘어감 */ }
  });
}

function buildCaps() {
  $('#capGrid').innerHTML = CAP_STYLES.map(c =>
    `<button class="chip${S.capStyle === c.id ? ' on' : ''}" data-cap="${c.id}" type="button">${esc(c.name)}</button>`).join('');
}

const SWATCHES = [
  { v: '#FFD21E', n: '노랑' }, { v: '#2BD9E8', n: '하늘' }, { v: '#FF5C8A', n: '분홍' },
  { v: '#FF8A3D', n: '주황' }, { v: '#35D07F', n: '초록' }, { v: '#FFFFFF', n: '흰색' },
];
function buildSwatches() {
  $('#swatches').innerHTML =
    `<button class="swatch-none${S.hlColor ? '' : ' on'}" data-sw="" type="button">없음</button>` +
    SWATCHES.map(s => `<button class="sw${S.hlColor === s.v ? ' on' : ''}" data-sw="${s.v}" type="button" title="${s.n}" style="background:${s.v}"></button>`).join('');
}

function buildFonts() {
  const opt = (sel, cur) => FONTS.map(f => `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.name}</option>`).join('');
  $('#fontSel').innerHTML = opt('cap', S.opt.cap.family || 'pretendard');
  $('#titleFontSel').innerHTML = opt('title', S.opt.title.family || 'pretendard');
}

function buildStickers() {
  const box = $('#stickerList');
  const names = { label: '라벨', effect: '효과음', thought: '속마음' };
  box.innerHTML = S.stickers.map((s, i) => `
    <div class="sticker" data-st="${i}">
      <span class="k">${names[s.kind] || '라벨'}</span>
      <input type="text" data-sttext="${i}" value="${esc(s.text || '')}" placeholder="내용">
      <button class="del" data-stdel="${i}" type="button" aria-label="지우기">×</button>
    </div>`).join('');
}

function syncLook() {
  $('#tplTitle').value = S.title.join('\n');
  $('#tplBottom').value = S.bottom;
  buildTemplates(); buildCaps(); buildSwatches(); buildFonts(); buildStickers();
  Array.from($('#ratioSeg').children).forEach(b => b.classList.toggle('on', (b.dataset.ratio || '') === (S.ratio || '')));
}

function setRatioUI() {
  Array.from($('#ratioSeg').children).forEach(b => b.classList.toggle('on', (b.dataset.ratio || '') === (S.ratio || '')));
}

function updateFormatHint() {
  const v = $('#fmtSel').value;
  const el = $('#exportNote');
  if (v === 'mp4' && !aacSupported()) {
    el.textContent = 'MP4(H.264)로 저장해요. 이 브라우저는 소리를 Opus로 넣어서, 유튜브 업로드가 막히면 WebM을 골라 주세요. 재생하며 녹화하니 영상 길이만큼 걸립니다.';
  } else if (v === 'webm') {
    el.textContent = 'WebM(VP9+Opus)은 유튜브 업로드에 그대로 쓰기 좋아요. 재생하며 녹화하니 영상 길이만큼 걸립니다.';
  } else {
    el.textContent = '영상을 재생하며 그대로 녹화합니다. 10분 영상이면 10분쯤 걸려요.';
  }
}

/* ---------------- 내보내기/파일 도우미 ---------------- */
function downloadSrt() {
  if (!S.cues.length) { toast('내보낼 자막이 없어요'); return; }
  const cuts = S.cutOn ? S.cuts : [];
  const list = cuts.length ? remapCues(S.cues, buildKeep(cuts, S.duration)) : S.cues;
  const text = toSrt(list);
  download(new Blob([text], { type: 'application/x-subrip;charset=utf-8' }), '자막.srt');
  toast('SRT를 내려받았어요');
}

async function importSrt(file) {
  try {
    const text = await file.text();
    const cues = parseSrt(text);
    if (!cues.length) { toast('SRT에서 자막을 찾지 못했어요'); return; }
    S.cues = cues;
    buildCues(); redraw();
    $('#sttMsg').className = 'msg ok';
    $('#sttMsg').textContent = `${cues.length}줄을 불러왔어요.`;
  } catch {
    toast('파일을 읽지 못했어요');
  }
}

/* ---------------- 이벤트 ---------------- */
export function initEditor() {
  syncLook();
  redraw();
  updatePlayer();
  renderTimeline();
  buildCues();
  syncButtons();
  $('#groqKey').value = store.get('yf.groq', '');

  // 파일 넣기
  $('#pickFile').addEventListener('click', () => $('#fileInput').click());
  $('#dropZone').addEventListener('click', () => $('#fileInput').click());
  view.addEventListener('click', () => { if (!S.file) $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; });
  const zone = $('#previewWrap');
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); $('#dropZone').classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); $('#dropZone').classList.remove('over'); }));
  zone.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  // 재생
  $('#playToggle').addEventListener('click', () => playPause());
  $('#seek').addEventListener('input', e => {
    if (!S.duration) return;
    video.currentTime = (Number(e.target.value) / 1000) * S.duration;
    if (!S.playing) { drawAt(video.currentTime); renderTimeline(); }
    updatePlayer();
  });

  // 받아쓰기
  $('#sttMode').addEventListener('change', e => {
    const v = e.target.value;
    $('#groqBox').hidden = v !== 'groq';
    $('#srtBox').hidden = v !== 'srt';
    $('#manualBox').hidden = v !== 'manual';
    if (v === 'srt') $('#srtInput').click();
  });
  $('#btnTranscribe').addEventListener('click', doTranscribe);
  $('#btnGroqHelp').addEventListener('click', () => window.open('https://console.groq.com/keys', '_blank', 'noopener'));
  $('#btnPickSrt').addEventListener('click', () => $('#srtInput').click());
  $('#srtInput').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importSrt(f); e.target.value = ''; });
  $('#btnDownloadSrt').addEventListener('click', downloadSrt);
  $('#groqKey').addEventListener('change', e => store.set('yf.groq', e.target.value.trim()));

  // 자동 컷
  $('#cutOn').addEventListener('change', e => { S.cutOn = e.target.checked; renderTimeline(); redraw(); });
  const slider = (id, out, fmt) => {
    const el = $(id);
    const paint = () => { $(out).textContent = fmt(el.value); };
    el.addEventListener('input', () => { paint(); if (id === '#cutMinLen' || id === '#cutPad') { /* 재분석 필요 */ } });
    paint();
  };
  slider('#cutMinLen', '#vMinLen', v => `${Number(v).toFixed(2)}초`);
  slider('#cutPad', '#vPad', v => `${Number(v).toFixed(2)}초`);
  slider('#cutThr', '#vThr', v => `${v}dB`);
  $('#btnAnalyze').addEventListener('click', doAnalyze);
  $('#btnUndoCut').addEventListener('click', () => {
    if (!S.cutHistory.length) return;
    S.cuts = S.cutHistory.pop();
    renderTimeline(); syncButtons(); redraw();
  });
  $('#btnResetCut').addEventListener('click', () => {
    if (!S.cuts.length) return;
    S.cutHistory.push(S.cuts.map(c => ({ ...c })));
    S.cuts = [];
    renderTimeline(); syncButtons(); redraw();
  });
  $('#tl').addEventListener('click', e => {
    if (!S.cuts.length || !S.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * S.duration;
    const i = S.cuts.findIndex(c => t >= c.s && t <= c.e);
    if (i >= 0) {
      S.cutHistory.push(S.cuts.map(c => ({ ...c })));
      S.cuts.splice(i, 1);
      renderTimeline(); syncButtons(); redraw();
      toast('이 구간을 되살렸어요');
    }
  });

  // 자막 편집
  $('#btnAddCue').addEventListener('click', () => {
    const t = video.currentTime || 0;
    const last = S.cues[S.cues.length - 1];
    const start = S.cues.length ? Math.max(t, last.end) : 0;
    S.cues.push({ start: +start.toFixed(2), end: +(start + 2).toFixed(2), text: '', hl: [] });
    S.cues.sort((a, b) => a.start - b.start);
    buildCues(); redraw();
  });
  $('#btnClearCues').addEventListener('click', () => {
    S.cues = []; buildCues(); redraw();
  });
  $('#btnSplitLong').addEventListener('click', () => {
    const maxChars = currentTpl().cap?.maxChars || 22;
    S.cues = splitLong(S.cues, maxChars);
    buildCues(); redraw();
    toast(`${maxChars}자 기준으로 나눴어요`);
  });

  const list = $('#cueList');
  list.addEventListener('input', e => {
    const i = Number(e.target.dataset.i);
    if (e.target.classList.contains('cue-text')) { S.cues[i].text = e.target.value; S.cues[i].hl = []; redraw(); }
  });
  list.addEventListener('change', e => {
    const i = Number(e.target.dataset.i);
    if (e.target.classList.contains('t0')) { S.cues[i].start = Math.max(0, parseClock(e.target.value) || 0); buildCues(); redraw(); }
    if (e.target.classList.contains('t1')) { S.cues[i].end = Math.max(S.cues[i].start + 0.1, parseClock(e.target.value) || S.cues[i].start + 0.1); buildCues(); redraw(); }
    if (e.target.classList.contains('cue-text')) { buildCues(); }
  });
  list.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) { S.cues.splice(Number(del.dataset.del), 1); buildCues(); redraw(); return; }
    const hl = e.target.closest('[data-hl]');
    if (hl) {
      const [i, k] = hl.dataset.hl.split(':').map(Number);
      const c = S.cues[i];
      c.hl = c.hl || [];
      const at = c.hl.indexOf(k);
      if (at >= 0) c.hl.splice(at, 1); else c.hl.push(k);
      hl.classList.toggle('on');
      redraw();
      return;
    }
    const cue = e.target.closest('.cue');
    if (cue && S.file && !e.target.closest('input, textarea, button')) {
      const i = Number(cue.dataset.i);
      video.currentTime = S.cues[i].start;
      drawAt(video.currentTime); updatePlayer();
    }
  });

  // 꾸미기
  $('#tplGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-tpl]');
    if (!b) return;
    S.tplId = b.dataset.tpl; store.set('yf.tpl', S.tplId);
    buildTemplates(); redraw();
  });
  $('#capGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-cap]');
    if (!b) return;
    S.capStyle = b.dataset.cap; store.set('yf.capStyle', S.capStyle);
    buildCaps(); redraw();
  });
  $('#swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-sw]');
    if (!b) return;
    S.hlColor = b.dataset.sw; store.set('yf.hl', S.hlColor);
    buildSwatches(); redraw();
  });
  $('#ratioSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-ratio]');
    if (!b) return;
    S.ratio = b.dataset.ratio; store.set('yf.ratio', S.ratio);
    setRatioUI(); redraw(); renderTimeline();
  });
  $('#fontSel').addEventListener('change', e => { S.opt.cap.family = e.target.value; redraw(); });
  $('#titleFontSel').addEventListener('change', e => { S.opt.title.family = e.target.value; redraw(); });
  $('#tplTitle').addEventListener('input', e => { S.title = e.target.value.split('\n').slice(0, 2); redraw(); });
  $('#tplBottom').addEventListener('input', e => { S.bottom = e.target.value; redraw(); });
  $('#stickerBtns').addEventListener('click', e => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const kind = b.dataset.add;
    const text = kind === 'effect' ? '쿵!' : kind === 'thought' ? '뭐지…?' : '충격';
    S.stickers.push({ kind, text, x: 0.5, y: 0.45 });
    buildStickers(); redraw();
  });
  $('#stickerList').addEventListener('input', e => {
    const i = Number(e.target.dataset.sttext);
    if (Number.isNaN(i)) return;
    S.stickers[i].text = e.target.value; redraw();
  });
  $('#stickerList').addEventListener('click', e => {
    const d = e.target.closest('[data-stdel]');
    if (!d) return;
    S.stickers.splice(Number(d.dataset.stdel), 1);
    buildStickers(); redraw();
  });

  // 라벨 끌어 옮기기
  view.addEventListener('pointerdown', e => {
    const r = view.getBoundingClientRect();
    const x = (e.clientX - r.left) * (view.width / r.width);
    const y = (e.clientY - r.top) * (view.height / r.height);
    const hit = S.boxes.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (!hit) return;
    view.setPointerCapture(e.pointerId);
    S.drag = { i: hit.i, dx: x - (hit.x + hit.w / 2), dy: y - (hit.y + hit.h / 2) };
    e.preventDefault();
  });
  view.addEventListener('pointermove', e => {
    if (!S.drag) return;
    const r = view.getBoundingClientRect();
    const x = (e.clientX - r.left) * (view.width / r.width);
    const y = (e.clientY - r.top) * (view.height / r.height);
    const s = S.stickers[S.drag.i];
    if (!s) return;
    s.x = Math.max(0.08, Math.min(0.92, (x - S.drag.dx) / view.width));
    s.y = Math.max(0.08, Math.min(0.92, (y - S.drag.dy) / view.height));
    drawAt(video.currentTime || 0);
  });
  const endDrag = () => { if (S.drag) { S.drag = null; } };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  // 내보내기
  $('#btnExport').addEventListener('click', doExport);
  $('#btnSrtOut').addEventListener('click', downloadSrt);
  $('#fmtSel').addEventListener('change', updateFormatHint);
  updateFormatHint();

  window.addEventListener('resize', () => renderTimeline());
}

export function hasVideo() { return !!S.file; }
export function refreshEditor() { redraw(); renderTimeline(); drawAt(video.currentTime || 0); }
export { S as editorState };
