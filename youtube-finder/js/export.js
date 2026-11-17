// MP4/WebM 내보내기 — 캔버스와 소 리를 묶어 실시간으로 녹화한다.
const CANDIDATES = [
  ['video/mp4;codecs=avc1', 'mp4'],
  ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9,opus', 'webm'],
  ['video/webm;codecs=vp8,opus', 'webm'],
  ['video/webm', 'webm'],
];

export function pickMime(prefer = 'mp4') {
  if (typeof MediaRecorder === 'undefined') return { mime: '', ext: 'webm', supported: false };
  const mp4 = CANDIDATES.filter(c => c[1] === 'mp4');
  const webm = CANDIDATES.filter(c => c[1] === 'webm');
  const order = prefer === 'webm' ? [...webm, ...mp4] : [...mp4, ...webm];
  for (const [mime, ext] of order) {
    try { if (MediaRecorder.isTypeSupported(mime)) return { mime, ext, supported: true }; } catch { /* 다음 후보 */ }
  }
  return { mime: '', ext: 'webm', supported: true };
}

// 이 브라우저가 MP4에 AAC 소리를 넣을 수 있는지(크롬은 Opus만 넣는다)
export function aacSupported() {
  try { return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2'); }
  catch { return false; }
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas  녹화할 캔버스(완성 크기)
 * @param {HTMLVideoElement} o.video
 * @param {MediaStream|null} o.audioStream
 * @param {{s:number,e:number}[]} o.cuts  잘라낼 구간(원본 시각)
 * @param {number} o.duration 원본 길이
 * @param {number} o.outDuration 자른 뒤 길이
 * @param {(t:number)=>void} o.draw  현재 시각 t로 캔버스를 그리는 함수
 * @param {(p:number)=>void} o.onProgress
 * @param {{cancelled:boolean}} o.signal
 */
export async function recordVideo(o) {
  const { canvas, video, audioStream, cuts = [], duration, outDuration, draw, onProgress, signal = {} } = o;
  const { mime, ext, supported } = pickMime(o.prefer || 'mp4');
  if (!supported) throw new Error('이 브라우저는 영상 녹화를 지원하지 않아요. 크롬이나 사파리 최신 버전에서 해 주세요.');
  const stream = canvas.captureStream(30);
  if (audioStream) {
    audioStream.getAudioTracks().forEach(t => { try { stream.addTrack(t); } catch { /* 이미 있으면 무시 */ } });
  }
  const options = { videoBitsPerSecond: o.bitrate || 7000000, audioBitsPerSecond: 128000 };
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { ...options, mimeType: mime } : options); }
  catch { rec = new MediaRecorder(stream, options); }

  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const finished = new Promise((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }));
    rec.onerror = e => reject(e?.error || new Error('녹화 중 문제가 생겼어요'));
  });

  video.pause();
  try { video.currentTime = 0; } catch { /* noop */ }
  await new Promise(r => setTimeout(r, 120));
  rec.start(500);
  try { await video.play(); } catch { /* 자동재생이 막혀도 녹화는 계속 */ }

  const cutsSorted = cuts.filter(c => c.e > c.s).sort((a, b) => a.s - b.s);
  const skipTo = t => {
    const c = cutsSorted.find(x => t >= x.s - 0.01 && t < x.e - 0.02);
    return c ? Math.min(c.e, duration - 0.02) : null;
  };
  const guard = (duration + 40) * 1000;
  const startedAt = performance.now();

  await new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const tick = () => {
      if (done) return;
      if (signal.cancelled) return finish();
      const t = video.currentTime;
      const jump = skipTo(t);
      if (jump != null) { try { video.currentTime = jump; } catch { /* noop */ } }
      try { draw(t); } catch { /* 한 프레임 실패는 넘어간다 */ }
      const p = outDuration > 0 ? Math.min(1, t / duration) : 0;
      onProgress?.(p);
      if (video.ended || (t >= duration - 0.04 && video.readyState >= 2)) return finish();
      if (performance.now() - startedAt > guard) return finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  video.pause();
  try { rec.stop(); } catch { /* noop */ }
  const blob = await finished;
  stream.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
  return { blob, ext, mime: rec.mimeType || mime };
}
