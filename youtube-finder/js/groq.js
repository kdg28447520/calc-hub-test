// 받아쓰기 두 가지 길: Groq Whisper(소리만 전송, 아주 빠름) / 브라우저 로컬 Whisper(내 컴퓨터에서 계산)
import { resample16k, toWav16k } from './audio.js?v=3';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
export const GROQ_MODEL = 'whisper-large-v3';

export async function transcribeGroq(buffer, key, { language = '', onProgress } = {}) {
  if (!key || !/^gsk_[A-Za-z0-9]{20,}$/.test(key.trim())) {
    throw new Error('Groq 키는 gsk_로 시작해요. console.groq.com/keys 에서 만들어 주세요.');
  }
  onProgress?.(0.1, '소리만 뽑는 중');
  const wav = await toWav16k(buffer, p => onProgress?.(0.1 + p * 0.25, '소리만 뽑는 중'));
  const fd = new FormData();
  fd.append('file', wav, 'audio.wav');
  fd.append('model', GROQ_MODEL);
  fd.append('response_format', 'verbose_json');
  fd.append('temperature', '0');
  if (language) fd.append('language', language);
  onProgress?.(0.4, 'Whisper가 듣는 중');
  let res;
  try {
    res = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${key.trim()}` }, body: fd });
  } catch {
    throw new Error('Groq에 닿지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* noop */ }
    if (res.status === 401) throw new Error('Groq 키가 맞지 않아요. 다시 확인해 주세요.');
    if (res.status === 429) throw new Error('Groq 무료 한도를 잠깐 넘었어요. 1분 뒤 다시 해 보세요.');
    if (res.status === 413) throw new Error('영상이 너무 길어 소리가 커요. 10분 이내로 잘라 주세요.');
    throw new Error(`Groq가 답하지 않았어요 (${res.status}) ${detail}`.trim());
  }
  const data = await res.json();
  onProgress?.(0.9, '줄 맞추는 중');
  const segs = Array.isArray(data.segments) ? data.segments : [];
  let cues = segs
    .map(s => ({ start: +Number(s.start).toFixed(2), end: +Number(s.end).toFixed(2), text: String(s.text || '').trim(), hl: [] }))
    .filter(c => c.text && c.end > c.start);
  if (!cues.length && data.text) {
    cues = [{ start: 0, end: Math.min(buffer.duration, 5), text: String(data.text).trim(), hl: [] }];
  }
  return { cues, language: data.language || language || '' };
}

/* ---------- 브라우저 로컬(실험적) ---------- */
const LOCAL_MODELS = {
  tiny: 'Xenova/whisper-tiny',
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
};
let localPipe = null, localName = '';

export async function transcribeLocal(buffer, { model = 'base', language = 'korean', onProgress } = {}) {
  onProgress?.(0.05, '소리를 준비하는 중');
  const audio = await resample16k(buffer);
  const name = LOCAL_MODELS[model] || LOCAL_MODELS.base;
  onProgress?.(0.1, 'Whisper 모델 내려받는 중 (처음 한 번만)');
  let pipe = localPipe;
  if (!pipe || localName !== name) {
    const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    mod.env.allowLocalModels = false;
    pipe = await mod.pipeline('automatic-speech-recognition', name, {
      quantized: true,
      progress_callback: p => {
        if (p.status === 'progress' && p.total) onProgress?.(0.1 + 0.5 * (p.loaded / p.total), 'Whisper 모델 내려받는 중');
      },
    });
    localPipe = pipe; localName = name;
  }
  onProgress?.(0.65, '듣는 중 (영상 길이만큼 걸려요)');
  const out = await pipe(audio, {
    language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true,
  });
  const chunks = Array.isArray(out?.chunks) ? out.chunks : [];
  const cues = chunks
    .map(c => ({ start: +Number(c.timestamp?.[0] ?? 0).toFixed(2), end: +Number(c.timestamp?.[1] ?? 0).toFixed(2), text: String(c.text || '').trim(), hl: [] }))
    .filter(c => c.text && c.end > c.start);
  if (!cues.length && out?.text) cues.push({ start: 0, end: Math.min(buffer.duration, 5), text: String(out.text).trim(), hl: [] });
  onProgress?.(1, '끝');
  return { cues, language };
}
