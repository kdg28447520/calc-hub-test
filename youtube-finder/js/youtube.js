// YouTube Data API v3 검색. 키는 브라우저에만 있고 구글에만 물어본다.

const API = 'https://www.googleapis.com/youtube/v3/';
const PLACES = {
  kr: { regionCode: 'KR', relevanceLanguage: 'ko' },
  jp: { regionCode: 'JP', relevanceLanguage: 'ja' },
  global: { regionCode: 'US', relevanceLanguage: 'en' },
};
export const SHORT_MAX = 180;

function errText(err) {
  try { return JSON.stringify(err?.error || err); } catch { return ''; }
}
function makeError(status, body) {
  const t = errText(body);
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(t)) return new Error('오늘 쓸 수 있는 검색량을 다 썼어요. 한국 시간 오후 4~5시에 다시 채워집니다.');
  if (/API_KEY_INVALID|keyInvalid|API key not valid/i.test(t)) return new Error('API 키가 맞지 않아요. 복사할 때 글자가 빠지지 않았는지 확인해 주세요.');
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/i.test(t)) return new Error('YouTube Data API v3가 아직 꺼져 있어요. 안내 2번을 먼저 해 주세요. 방금 켰다면 몇 분 뒤 다시 해 보세요.');
  if (/referrer|ipRefererBlocked|forbidden/i.test(t)) return new Error('이 키는 이 사이트에서 쓰도록 허용되지 않았어요. 구글 클라우드 키 설정에서 웹사이트 제한을 풀어 주세요.');
  if (status === 400) return new Error('검색 조건을 유튜브가 받아들이지 않았어요. 조건을 조금 바꿔 보세요.');
  if (status === 403) return new Error('유튜브가 이 요청을 막았어요. 잠시 뒤 다시 해 보세요.');
  return new Error(`유튜브에서 답을 받지 못했어요 (${status}).`);
}

async function get(path, params, key) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  url.searchParams.set('key', key);
  const res = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* noop */ }
    throw makeError(res.status, body);
  }
  return res.json();
}

export function isoToSeconds(d) {
  const m = String(d || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export function daysAgo(iso) {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}

/**
 * @param {object} o { query, key, place, format, days, count, subsMin, subsMax, minViews, onStep }
 */
export async function findVideos(o) {
  const q = String(o.query || '').trim();
  if (!q) throw new Error('찾을 주제를 먼저 적어 주세요.');
  const key = String(o.key || '').trim();
  if (!/^AIza[\w-]{30,}$/.test(key)) throw new Error('API 키는 AIza로 시작해요.');
  const count = Math.min(200, Math.max(10, Number(o.count) || 50));
  const place = PLACES[o.place] || PLACES.kr;
  const days = Number(o.days) || 0;
  const publishedAfter = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : undefined;

  // 1) 검색(조회수 많은 순으로) — 50개씩, 한 번에 100단위
  const ids = [];
  let pageToken;
  let pages = Math.ceil(count / 50);
  for (let i = 0; i < pages; i++) {
    o.onStep?.(`유튜브에서 찾는 중 (${i + 1}/${pages})`, 0.1 + 0.5 * (i / pages));
    const r = await get('search', {
      part: 'snippet', type: 'video', q: q.slice(0, 100), maxResults: 50, order: 'viewCount',
      videoDuration: o.format === 'shorts' ? 'short' : 'any',
      publishedAfter, ...place,
    }, key);
    for (const it of r.items || []) {
      const id = it.id?.videoId;
      if (id && !ids.includes(id)) ids.push(id);
    }
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  if (!ids.length) return { videos: [], scanned: 0 };

  // 2) 영상 통계(1단위/묶음)
  o.onStep?.('조회수와 길이 확인 중', 0.65);
  const vids = [];
  for (const part of chunks(ids, 50)) {
    const r = await get('videos', { part: 'snippet,statistics,contentDetails', id: part.join(','), maxResults: 50 }, key);
    for (const it of r.items || []) {
      const s = it.snippet || {}, st = it.statistics || {};
      const sec = isoToSeconds(it.contentDetails?.duration);
      vids.push({
        id: it.id,
        title: s.title || '',
        tags: Array.isArray(s.tags) ? s.tags.slice(0, 20) : [],
        channelId: s.channelId || '',
        channelTitle: s.channelTitle || '',
        publishedAt: s.publishedAt || '',
        thumb: (s.thumbnails?.high || s.thumbnails?.medium || s.thumbnails?.default || {}).url || '',
        seconds: sec,
        views: Number(st.viewCount || 0),
        likes: Number(st.likeCount || 0),
        url: `https://www.youtube.com/watch?v=${it.id}`,
        channelUrl: `https://www.youtube.com/channel/${s.channelId || ''}`,
        subs: null,
      });
    }
  }

  // 3) 채널 구독자 수
  o.onStep?.('채널 규모 확인 중', 0.85);
  const chIds = [...new Set(vids.map(v => v.channelId).filter(Boolean))];
  const subsMap = new Map();
  for (const part of chunks(chIds, 50)) {
    const r = await get('channels', { part: 'statistics', id: part.join(','), maxResults: 50 }, key);
    for (const it of r.items || []) {
      const n = Number(it.statistics?.subscriberCount);
      subsMap.set(it.id, Number.isFinite(n) ? n : null);
    }
  }
  for (const v of vids) {
    v.subs = subsMap.has(v.channelId) ? subsMap.get(v.channelId) : null;
    v.ratio = v.subs > 0 ? v.views / v.subs : null;
    v.isShort = v.seconds > 0 && v.seconds <= SHORT_MAX;
    v.ageDays = daysAgo(v.publishedAt);
  }

  // 4) 조건 거르기
  const subsMin = Number(o.subsMin) || 0;
  const subsMax = o.subsMax === '' || o.subsMax == null ? Infinity : Number(o.subsMax);
  const minViews = Number(o.minViews) || 0;
  const filtered = vids.filter(v => {
    if (o.format === 'shorts' && !v.isShort) return false;
    if (o.format === 'long' && v.seconds <= SHORT_MAX) return false;
    if (v.views < minViews) return false;
    if (subsMin || Number.isFinite(subsMax)) {
      if (v.subs == null) return false;
      if (v.subs < subsMin) return false;
      if (v.subs > subsMax) return false;
    }
    return true;
  });
  return { videos: filtered, scanned: vids.length, searched: ids.length };
}

export function sortVideos(list, by) {
  const a = list.slice();
  if (by === 'views') a.sort((x, y) => y.views - x.views);
  else if (by === 'subs') a.sort((x, y) => (y.subs ?? -1) - (x.subs ?? -1));
  else if (by === 'new') a.sort((x, y) => new Date(y.publishedAt) - new Date(x.publishedAt));
  else a.sort((x, y) => (y.ratio ?? -1) - (x.ratio ?? -1) || y.views - x.views);
  return a;
}
