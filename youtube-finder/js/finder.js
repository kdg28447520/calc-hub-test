// 탭 1 — 잘나가는 영상 찾기
import { findVideos, sortVideos } from './youtube.js?v=4';
import { $, esc, toast, copyText, fmtNum, fmtFull, fmtDur, fmtAge, store } from './ui.js?v=4';

export const PRESETS = [
  {
    id: 'hot1m', label: '🔥 100만+ 역주행 떡상',
    desc: '구독자 5만 이하 · 조회수 100만 이상 · 배율순',
    place: 'kr', format: 'any', days: 90, count: 200, subsMin: 0, subsMax: 50000, minViews: 1000000, sort: 'ratio',
  },
  {
    id: 'small', label: '작은 채널의 대박 영상',
    desc: '구독자 1만 이하 · 조회수 10만 이상',
    place: 'kr', format: 'any', days: 90, count: 200, subsMin: 0, subsMax: 10000, minViews: 100000, sort: 'ratio',
  },
  {
    id: 'shorts', label: '요즘 뜨는 쇼츠',
    desc: '쇼츠 3분 이하 · 최근 30일',
    place: 'kr', format: 'shorts', days: 30, count: 100, subsMin: 0, subsMax: '', minViews: 100000, sort: 'ratio',
  },
  {
    id: 'global', label: '해외에서 뜨는 긴 영상',
    desc: '롱폼 · 영어 권역 · 최근 90일',
    place: 'global', format: 'long', days: 90, count: 100, subsMin: 0, subsMax: '', minViews: 100000, sort: 'ratio',
  },
  {
    id: 'jp', label: '🇯🇵 일본 시니어 떡상',
    desc: '@seniortheater_jp용 · 일본어 권역 · 롱폼',
    place: 'jp', format: 'long', days: 90, count: 100, subsMin: 0, subsMax: 100000, minViews: 50000, sort: 'ratio',
    query: 'シニア 人生 話',
  },
];

const SORTS = [
  { id: 'ratio', label: '구독자 대비 순' },
  { id: 'views', label: '조회수 순' },
  { id: 'subs', label: '구독자 순' },
  { id: 'new', label: '최신 순' },
];

const F = {
  q: $('#q'), place: $('#fPlace'), format: $('#fFormat'), days: $('#fDays'), count: $('#fCount'),
  subsMin: $('#fSubsMin'), subsMax: $('#fSubsMax'), views: $('#fViews'),
};

const state = {
  key: store.get('yf.key'),
  videos: [],
  sort: 'ratio',
  activePreset: '',
  meta: null,
  busy: false,
};

const readFilters = () => ({
  query: F.q.value.trim(),
  key: state.key,
  place: F.place.value,
  format: F.format.value,
  days: F.days.value,
  count: F.count.value,
  subsMin: F.subsMin.value === '' ? 0 : Number(F.subsMin.value),
  subsMax: F.subsMax.value === '' ? '' : Number(F.subsMax.value),
  minViews: F.views.value === '' ? 0 : Number(F.views.value),
});

const writeFilters = p => {
  F.place.value = p.place ?? 'kr';
  F.format.value = p.format ?? 'any';
  F.days.value = String(p.days ?? 90);
  F.count.value = String(p.count ?? 200);
  F.subsMin.value = p.subsMin ?? 0;
  F.subsMax.value = p.subsMax ?? '';
  F.views.value = p.minViews ?? 100000;
  if (p.query) F.q.value = p.query;
  setSort(p.sort || 'ratio');
};

export function setKey(key) {
  state.key = key;
  store.set('yf.key', key);
}

/* ---------------- 그리기 ---------------- */
function renderPresets() {
  const box = $('#presets');
  box.innerHTML = PRESETS.map(p => `
    <button class="preset${state.activePreset === p.id ? ' on' : ''}" data-preset="${p.id}" type="button">
      <b>${esc(p.label)}</b>
      <span>${esc(p.desc)}</span>
    </button>`).join('');
}

function renderSorts() {
  $('#sorts').innerHTML = SORTS.map(s =>
    `<button class="sort${state.sort === s.id ? ' on' : ''}" data-sort="${s.id}" type="button">${esc(s.label)}</button>`
  ).join('');
}

function figureFor(v) {
  const day = v.ageDays;
  return {
    views: fmtNum(v.views),
    subs: v.subs == null ? '비공개' : fmtNum(v.subs),
    age: fmtAge(day),
    ratio: v.ratio == null ? '-' : `${v.ratio.toFixed(1)}배`,
  };
}

function cardHTML(v) {
  const f = figureFor(v);
  const big = v.ratio != null && v.ratio >= 10;
  return `
  <article class="vcard" data-id="${esc(v.id)}">
    <a class="thumb" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">
      ${v.thumb ? `<img loading="lazy" src="${esc(v.thumb)}" alt="">` : ''}
      <span class="dur">${fmtDur(v.seconds)}${v.isShort ? ' · 쇼츠' : ''}</span>
      ${v.ratio != null ? `<span class="mult${big ? ' hot' : ''}">구독자 대비 ${f.ratio}</span>` : ''}
    </a>
    <div class="vbody">
      <h3 class="vtitle">${esc(v.title)}</h3>
      <p class="vch">${esc(v.channelTitle)}</p>
      <div class="vstats">
        <div class="stat"><span>조회수</span><b>${f.views}<em>회</em></b></div>
        <div class="stat"><span>구독자</span><b>${f.subs}</b></div>
        <div class="stat"><span>올린 날</span><b>${f.age}</b></div>
        <div class="stat ratio"><span>구독자 대비</span><b>${f.ratio}</b></div>
      </div>
      <div class="vactions">
        <a class="btn ghost" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">영상 보기</a>
        <a class="btn ghost" href="${esc(v.channelUrl)}" target="_blank" rel="noopener noreferrer">채널 보기</a>
        <button class="btn ghost" data-copy="${esc(v.id)}" type="button">제목·태그 복사</button>
      </div>
    </div>
  </article>`;
}

export function render() {
  const list = sortVideos(state.videos, state.sort);
  const box = $('#cards');
  if (!state.videos.length) {
    box.innerHTML = state.meta
      ? `<div class="empty"><b>조건에 맞는 영상이 없어요</b>조건을 조금 넓혀 보세요. (확인한 영상 ${state.meta.scanned}개)</div>`
      : `<div class="empty"><b>아직 찾은 영상이 없어요</b>주제를 적고 <b>찾기</b>를 누르면 구독자 대비 터진 영상부터 보여 드려요.</div>`;
    return;
  }
  box.innerHTML = list.map(cardHTML).join('');
  const m = state.meta || {};
  $('#resultTitle').textContent = `조건에 맞는 영상 ${list.length}개`;
  $('#resultSub').textContent = `${m.scanned ? `확인 ${m.scanned}개 중 · ` : ''}${state.sort === 'ratio' ? '조회수 ÷ 구독자 배율이 큰 순서' : SORTS.find(s => s.id === state.sort)?.label}`;
  renderSorts();
}

function skeletons(n = 6) {
  $('#cards').innerHTML = Array.from({ length: n }, () => '<div class="skel"></div>').join('');
}

/* ---------------- 검색 ---------------- */
export async function runSearch(extra = {}) {
  if (state.busy) return;
  const f = { ...readFilters(), ...extra };
  if (!state.key) { document.dispatchEvent(new CustomEvent('yf:needkey')); return; }
  if (!f.query) { F.q.focus(); toast('찾을 주제를 먼저 적어 주세요'); return; }

  state.busy = true;
  state.meta = null;
  $('#go').disabled = true;
  $('#go').textContent = '찾는 중';
  $('#resultTitle').textContent = '유튜브에 물어보는 중…';
  $('#resultSub').textContent = f.query;
  skeletons();
  try {
    const out = await findVideos({
      ...f,
      onStep: (text, p) => {
        $('#resultTitle').textContent = text;
        $('#resultSub').textContent = `${f.query} · ${Math.round(p * 100)}%`;
      },
    });
    state.videos = out.videos;
    state.meta = out;
    state.sort = extra.sort || SORTS.find(s => s.id === state.sort)?.id || 'ratio';
    if (!out.videos.length) {
      $('#resultTitle').textContent = '조건에 맞는 영상이 없어요';
      $('#resultSub').textContent = `${f.query} · 확인한 영상 ${out.scanned}개`;
    }
    render();
    if (out.videos.length) toast(`${out.videos.length}개를 찾았어요`);
  } catch (err) {
    state.videos = [];
    state.meta = null;
    $('#resultTitle').textContent = '찾지 못했어요';
    $('#resultSub').textContent = err.message || '알 수 없는 오류';
    $('#cards').innerHTML = `<div class="empty"><b>${esc(err.message || '찾지 못했어요')}</b>${/키|API/.test(err.message || '') ? '위쪽 <b>API 키 변경</b>으로 다시 넣어 주세요.' : '잠시 뒤 다시 시도해 주세요.'}</div>`;
    renderSorts();
  } finally {
    state.busy = false;
    $('#go').disabled = false;
    $('#go').textContent = '찾기';
  }
}

function setSort(id) {
  state.sort = id;
  renderSorts();
  if (state.videos.length) render();
}

function copyCard(id) {
  const v = state.videos.find(x => x.id === id);
  if (!v) return;
  const f = figureFor(v);
  const tags = (v.tags || []).join(', ');
  const text = [
    v.title,
    `${v.channelTitle} · 조회수 ${fmtFull(v.views)} · 구독자 ${v.subs == null ? '비공개' : fmtFull(v.subs)} (구독자 대비 ${f.ratio}) · ${f.age}`,
    v.url,
    tags ? `태그: ${tags}` : '',
  ].filter(Boolean).join('\n');
  copyText(text).then(ok => toast(ok ? '제목·태그를 복사했어요' : '복사하지 못했어요. 길게 눌러 복사해 주세요.'));
}

/* ---------------- 이벤트 ---------------- */
export function initFinder() {
  renderPresets();
  renderSorts();
  writeFilters({ place: 'kr', format: 'any', days: 90, count: 200, subsMin: 0, subsMax: 10000, minViews: 100000, sort: 'ratio' });
  render();

  $('#go').addEventListener('click', () => runSearch());
  F.q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });

  $('#presets').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS.find(x => x.id === b.dataset.preset);
    if (!p) return;
    state.activePreset = p.id;
    writeFilters(p);
    renderPresets();
    if (readFilters().query) runSearch({ sort: p.sort });
    else { F.q.focus(); toast(`${p.label} 조건을 잡았어요. 주제를 적어 주세요`); }
  });

  $('#sorts').addEventListener('click', e => {
    const b = e.target.closest('[data-sort]');
    if (b) setSort(b.dataset.sort);
  });

  $('#cards').addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (b) { e.preventDefault(); copyCard(b.dataset.copy); }
  });

  $('#viewsQuick').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    F.views.value = b.dataset.v;
    Array.from($('#viewsQuick').children).forEach(x => x.classList.toggle('on', x === b));
  });

  $('#resetFilters').addEventListener('click', () => {
    state.activePreset = '';
    writeFilters({ place: 'kr', format: 'any', days: 90, count: 200, subsMin: 0, subsMax: 10000, minViews: 100000, sort: 'ratio' });
    renderPresets();
    toast('조건을 처음으로 되돌렸어요');
  });

  // 조건을 손으로 바꾸면 프리셋 표시를 푼다
  ['change', 'input'].forEach(ev => {
    ['fPlace', 'fFormat', 'fDays', 'fCount', 'fSubsMin', 'fSubsMax', 'fViews'].forEach(id => {
      document.getElementById(id)?.addEventListener(ev, () => {
        if (state.activePreset) { state.activePreset = ''; renderPresets(); }
      });
    });
  });
}

export function focusSearch() {
  if (!state.videos.length) F.q.focus();
}
