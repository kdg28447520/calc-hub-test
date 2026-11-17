// SRT·VTT 읽기/쓰기와 자막 줄 다루기

export const words = t => String(t || '').trim().split(/\s+/).filter(Boolean);
export const clock = s => {
  const v = Math.max(0, Number(s) || 0);
  const m = Math.floor(v / 60), sec = Math.floor(v % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
export const clockT = s => {
  const v = Math.max(0, Number(s) || 0);
  const m = Math.floor(v / 60);
  return `${m}:${(v % 60).toFixed(1).padStart(4, '0')}`;
};
export function parseClock(v) {
  const m = String(v).trim().match(/^(?:(\d+):)?(\d+):?(\d+(?:\.\d+)?)?$/);
  if (!m) return NaN;
  if (m[3] === undefined) return (+m[1] || 0) * 60 + (+m[2] || 0);
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}
function srtTime(v) {
  const t = Math.max(0, Number(v) || 0);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
function readSrtTime(v) {
  const m = String(v).trim().replace(',', '.').match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return NaN;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

export function parseSrt(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/^WEBVTT.*?\n/i, '');
  const blocks = src.split(/\n{2,}/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) continue;
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1;
    const tl = lines[i];
    if (!tl || !tl.includes('-->')) continue;
    const [a, b] = tl.split('-->');
    const start = readSrtTime(a), end = readSrtTime(b.trim().split(/\s+/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const body = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!body) continue;
    out.push({ start, end: Math.max(end, start + 0.2), text: body });
  }
  out.sort((x, y) => x.start - y.start);
  return out;
}

export function toSrt(cues) {
  return (cues || []).map((c, i) =>
    `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${String(c.text || '').trim()}\n`
  ).join('\n');
}

// 긴 줄을 글자 수에 맞춰 시간을 나눠 쪼갠다
export function splitLong(cues, maxChars = 22) {
  const out = [];
  for (const c of cues) {
    const text = String(c.text || '').trim();
    if (text.length <= maxChars) { out.push({ ...c }); continue; }
    const ws = words(text);
    const groups = [];
    let cur = '';
    for (const w of ws) {
      if (cur && (cur + ' ' + w).length > maxChars) { groups.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) groups.push(cur);
    const total = groups.reduce((a, g) => a + g.length, 0) || 1;
    const dur = Math.max(0.4, c.end - c.start);
    let t = c.start;
    groups.forEach((g, i) => {
      const d = dur * (g.length / total);
      out.push({ start: +t.toFixed(2), end: +(t + d).toFixed(2), text: g, hl: [] });
      t += d;
    });
  }
  return out;
}

export function splitCue(cues, index) {
  const list = cues.slice();
  const c = list[index];
  if (!c) return list;
  const ws = words(c.text);
  if (ws.length < 2) return list;
  const half = Math.ceil(ws.length / 2);
  const mid = c.start + (c.end - c.start) / 2;
  list.splice(index, 1,
    { start: c.start, end: +mid.toFixed(2), text: ws.slice(0, half).join(' '), hl: [] },
    { start: +mid.toFixed(2), end: c.end, text: ws.slice(half).join(' '), hl: [] });
  return list;
}

// 자동 컷으로 지운 구간을 자막 시간에도 반영
export function remapCues(cues, keep) {
  if (!keep || !keep.length) return cues;
  const map = t => {
    let acc = 0;
    for (const k of keep) {
      if (t < k.s) return acc;
      if (t <= k.e) return acc + (t - k.s);
      acc += k.e - k.s;
    }
    return acc;
  };
  return cues.map(c => ({ ...c, start: +map(c.start).toFixed(2), end: +map(c.end).toFixed(2) }))
    .filter(c => c.end - c.start > 0.08);
}

export function activeCue(cues, t) {
  for (const c of cues) if (t >= c.start && t < c.end) return c;
  return null;
}
