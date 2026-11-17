// 소리 분석: 무음 찾기, 파형 뽑기, Groq에 보낼 16kHz 모노 WAV 만들기
// 모든 계산은 브라우저 안에서 끝난다.

let actx = null;
export function audioCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

export async function decodeFile(file, onProgress) {
  const buf = await file.arrayBuffer();
  onProgress?.(0.15);
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const audio = await ctx.decodeAudioData(buf);
  onProgress?.(0.4);
  return audio;
}

// 20ms 창으로 음량을 재서 조용한 구간을 찾는다
export function analyzeSilence(buffer, { thresholdDb = -38, minLen = 0.45, pad = 0.08 } = {}) {
  const sr = buffer.sampleRate;
  const chs = Math.min(2, buffer.numberOfChannels);
  const data = [];
  for (let c = 0; c < chs; c++) data.push(buffer.getChannelData(c));
  const win = Math.max(1, Math.floor(sr * 0.02));
  const frames = Math.floor(buffer.length / win);
  const db = new Float32Array(frames);
  const peaks = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0, peak = 0;
    const off = i * win;
    for (let j = 0; j < win; j++) {
      let v = 0;
      for (let c = 0; c < chs; c++) v += data[c][off + j] || 0;
      v /= chs;
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / win);
    db[i] = 20 * Math.log10(rms + 1e-8);
    peaks[i] = peak;
  }

  const spans = [];
  let start = -1;
  for (let i = 0; i < frames; i++) {
    const quiet = db[i] < thresholdDb;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) { spans.push([start * 0.02, i * 0.02]); start = -1; }
  }
  if (start >= 0) spans.push([start * 0.02, frames * 0.02]);

  const duration = buffer.duration;
  const cuts = [];
  for (const [s0, e0] of spans) {
    // 영상 처음/끝의 무음은 그대로 둔다(너무 휑해지지 않게)
    const s = s0 <= 0.02 ? 0 : s0 + pad;
    const e = e0 >= duration - 0.02 ? duration : e0 - pad;
    if (e - s >= minLen) cuts.push({ s: +s.toFixed(2), e: +e.toFixed(2) });
  }
  return { cuts, wins: { db, peaks, winSec: 0.02 }, duration };
}

// 자른 곳을 뺀 나머지 구간
export function buildKeep(cuts, duration) {
  const sorted = (cuts || []).filter(c => c.e > c.s).sort((a, b) => a.s - b.s);
  const keep = [];
  let t = 0;
  for (const c of sorted) {
    const s = Math.max(0, Math.min(c.s, duration));
    if (s > t + 0.02) keep.push({ s: +t.toFixed(3), e: +s.toFixed(3) });
    t = Math.max(t, Math.min(c.e, duration));
  }
  if (duration > t + 0.02) keep.push({ s: +t.toFixed(3), e: +duration.toFixed(3) });
  return keep;
}

export const keepLength = keep => keep.reduce((a, k) => a + (k.e - k.s), 0);

// 타임라인에 그릴 파형(0~1)
export function peaksOf(wins, buckets = 600) {
  const out = new Float32Array(buckets);
  const { peaks } = wins;
  const step = peaks.length / buckets;
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    for (let j = a; j < b && j < peaks.length; j++) if (peaks[j] > m) m = peaks[j];
    out[i] = m;
  }
  const max = Math.max(...out, 0.0001);
  for (let i = 0; i < buckets; i++) out[i] = Math.min(1, out[i] / max);
  return out;
}

// 16kHz 모노로 다시 뽑는다(Whisper가 쓰는 모양)
export async function resample16k(buffer) {
  const target = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(buffer.duration * target), target);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

// Groq Whisper에 보낼 소리(16kHz 모노 WAV). 영상은 보내지 않는다.
export async function toWav16k(buffer, onProgress) {
  const target = 16000;
  const samples = await resample16k(buffer);
  onProgress?.(0.7);  const bytes = 44 + samples.length * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, bytes - 8, true); w(8, 'WAVE');
  w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, target, true); view.setUint32(28, target * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let off2 = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off2 += 2;
  }
  onProgress?.(1);
  return new Blob([ab], { type: 'audio/wav' });
}
