/* SOULBIND — data layer: elements, icons, pets, skills, synergies */
window.PA = window.PA || {};
(function (PA) {
  'use strict';

  var ELEMENTS = {
    fire:    { name: '화염', color: '#f2683c' },
    thunder: { name: '번개', color: '#9a86ff' },
    frost:   { name: '서리', color: '#5cc9df' },
    dark:    { name: '암흑', color: '#c2557f' },
    earth:   { name: '대지', color: '#bfa068' }
  };
  var ELEMENT_ORDER = ['fire', 'thunder', 'frost', 'dark', 'earth'];

  /* ---------- icons (line art, viewBox 32) ---------- */
  var PET_ICON = {
    ignis:
      '<path d="M9.2 12.2c0-3 2.9-5.2 6.8-5.2s6.8 2.2 6.8 5.2v4.4c0 5.2-3 9.2-6.8 9.2s-6.8-4-6.8-9.2z"/>' +
      '<path d="M9.4 11.4 8 5.6l4.6 2.6M22.6 11.4 24 5.6l-4.6 2.6"/>' +
      '<path d="M13 21.8h6M13.8 21.8v2.6M18.2 21.8v2.6"/>' +
      '<circle cx="13.2" cy="17.4" r="1.05" fill="currentColor" stroke="none"/>' +
      '<circle cx="18.8" cy="17.4" r="1.05" fill="currentColor" stroke="none"/>',
    saram:
      '<path d="M7.6 22.4c0-4 3-6.6 7-6.6h3.6c2.4 0 3.8-1.2 3.8-3.2"/>' +
      '<path d="M22 12.6c2 0 3.2 1.4 3.2 3.2 0 2.2-2 3.4-4.4 3.4"/>' +
      '<path d="M14 15.8v-3.2M9.6 16.2v-2.6M11 22.4V25M17 22.4V25"/>' +
      '<path d="M18.6 9.8c-.8-2 .2-3.8 2-4.6.2 1.8-.4 4.4-2 4.6z"/>' +
      '<circle cx="23.2" cy="15.4" r=".95" fill="currentColor" stroke="none"/>',
    voltcat:
      '<path d="M9.2 12.4c0-3.2 3-5.4 6.8-5.4s6.8 2.2 6.8 5.4v4.2c0 5.2-3 9-6.8 9s-6.8-3.8-6.8-9z"/>' +
      '<path d="M9.6 11.6 9 5.2l4.6 3M22.4 11.6 23 5.2l-4.6 3"/>' +
      '<path d="M6.6 19h-3M7 21.6l-2.4 1.8M25.4 19h3M25 21.6l2.4 1.8"/>' +
      '<circle cx="13.2" cy="17.4" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="18.8" cy="17.4" r="1" fill="currentColor" stroke="none"/>',
    hound:
      '<path d="M9 13c0-3.4 3.2-6 7-6s7 2.6 7 6v3.4c0 4.6-2.6 7.6-6 8.6"/>' +
      '<path d="M9 13 7.4 6.8l4.4 3M23 13l1.8-6.2-4.6 3"/>' +
      '<path d="M15.8 4.4 13 10.4h3.2L14.6 15"/>' +
      '<path d="M10.8 21.2c-2 1.4-2.6 3-2.6 5"/>' +
      '<circle cx="12.8" cy="16.4" r="1" fill="currentColor" stroke="none"/>' +
      '<circle cx="18.4" cy="16.4" r="1" fill="currentColor" stroke="none"/>',
    frost:
      '<path d="M16 6.6 21.6 12v4c0 5.4-2.6 9.6-5.6 9.6s-5.6-4.2-5.6-9.6v-4z"/>' +
      '<path d="M10.6 11.8 9.4 5.4l4.2 3M21.4 11.8l1.2-6.4-4.2 3"/>' +
      '<path d="M16 20v3.4M13.4 23.4h5.2"/>' +
      '<path d="M21.8 23.6c3.6 1 5.4-1 4.4-4.6"/>' +
      '<circle cx="13.6" cy="16" r=".95" fill="currentColor" stroke="none"/>' +
      '<circle cx="18.4" cy="16" r=".95" fill="currentColor" stroke="none"/>',
    glacier:
      '<path d="M8.6 25.2c4.6 0 6.2-2.6 6.2-5.8 0-3 1.6-5 5-5h1.6"/>' +
      '<path d="M21.4 11.2c1.8 0 3.2 1.2 3.2 3s-1.4 3-3.2 3"/>' +
      '<path d="M8.6 25.2c-1.4 0-2.6-.6-2.6-1.8s1.2-2 2.8-1.8"/>' +
      '<path d="M15 14.4c-.4-2.6 1-4.4 2.8-5"/>' +
      '<circle cx="23.2" cy="13.6" r=".9" fill="currentColor" stroke="none"/>',
    nox:
      '<path d="M16 12.4c-3.2-3.4-8.6-3.6-11 .4 2 .4 3.2 3 1.4 6.4 3-1.6 6.4-.8 9.6 2.4 3.2-3.2 6.6-4 9.6-2.4-1.8-3.4-.6-6 1.4-6.4-2.4-4-7.8-3.8-11-.4z"/>' +
      '<path d="M14 10.8 13 7.6l3 1.4 3-1.4-1 3.2"/>' +
      '<circle cx="14" cy="16" r=".9" fill="currentColor" stroke="none"/>' +
      '<circle cx="18" cy="16" r=".9" fill="currentColor" stroke="none"/>',
    morse:
      '<path d="M16 6c4.6 0 8 3.4 8 7.6 0 2.4-1.2 3.6-1.2 5.4 0 1.6.6 2.6.6 4.4 0 2.2-1.6 3.6-3.6 3.6h-7.6c-2 0-3.6-1.4-3.6-3.6 0-1.8.6-2.8.6-4.4 0-1.8-1.2-3-1.2-5.4C8 9.4 11.4 6 16 6z"/>' +
      '<circle cx="12.8" cy="13.8" r="1.7"/><circle cx="19.2" cy="13.8" r="1.7"/>' +
      '<path d="M14.6 19.8h2.8M13.4 23.2v1.8M16 23.2v1.8M18.6 23.2v1.8"/>',
    terra:
      '<path d="M9.4 14.6c0-3.8 3-6.8 6.6-6.8s6.6 3 6.6 6.8v3c0 4.4-2.8 7.4-6.6 7.4s-6.6-3-6.6-7.4z"/>' +
      '<circle cx="10.4" cy="9.2" r="2.4"/><circle cx="21.6" cy="9.2" r="2.4"/>' +
      '<ellipse cx="16" cy="19.2" rx="3.2" ry="2.3"/>' +
      '<path d="M14.8 18.6v.9M17.2 18.6v.9"/>',
    gargoyle:
      '<path d="M11 14c0-3 2.2-5 5-5s5 2 5 5v5.6c0 4-2.2 6.4-5 6.4s-5-2.4-5-6.4z"/>' +
      '<path d="M11.4 11.6 10 6.4l3.4 2M20.6 11.6 22 6.4l-3.4 2"/>' +
      '<path d="M11 16c-3.4-1.6-6.6-.8-7.6 2.6 2.4-.6 4.4.6 5.4 3M21 16c3.4-1.6 6.6-.8 7.6 2.6-2.4-.6-4.4.6-5.4 3"/>' +
      '<circle cx="14" cy="15.8" r=".95" fill="currentColor" stroke="none"/>' +
      '<circle cx="18" cy="15.8" r=".95" fill="currentColor" stroke="none"/>'
  };

  /* ---------- skill glyphs (viewBox 24) ---------- */
  var GLYPH = {
    volley:  '<path d="M3 12h11M10 8l4 4-4 4M17 6h4M17 18h4"/>',
    zone:    '<ellipse cx="12" cy="10" rx="7" ry="4.4"/><path d="M9 17.4h.01M12 20h.01M15 17.4h.01"/>',
    chain:   '<path d="M4 18.4l4.2-5.6 3 3.2 4.2-6.4 4 3.4"/>',
    beam:    '<path d="M3 12h13M12 7.4l4.6 4.6-4.6 4.6M19.6 9v6"/>',
    nova:    '<circle cx="12" cy="12" r="7.4"/><circle cx="12" cy="12" r="3.4"/>',
    drain:   '<path d="M12 3.6c3.4 4.2 5.6 6.6 5.6 9.4a5.6 5.6 0 0 1-11.2 0c0-2.8 2.2-5.2 5.6-9.4z"/><path d="M12 10v5.6"/>',
    quake:   '<path d="M2.6 18.6h18.8M8 18.6l3.2-7.4M16.4 18.6l-2.4-8M11.2 11.2l4.6-4.2"/>',
    shield:  '<path d="M12 3.4 19 6v6c0 4.4-3 7.4-7 8.6-4-1.2-7-4.2-7-8.6V6z"/>',
    flame:   '<path d="M12 3c2.6 3.2 1 4.8 2.6 6.8s3 3.2 3 5.4a5.6 5.6 0 0 1-11.2 0c0-2.2 1.2-3.8 2.4-4.8.6 1.6 1.6 2.2 2.2 2.2.4-2.2-1.4-4.4 1-9.6z"/>',
    bolt:    '<path d="M13.2 2.6 5.6 13.2h4.8l-1 8.2 7.8-11h-5z"/>',
    snow:    '<path d="M12 3v18M4.4 7.5l15.2 9M19.6 7.5 4.4 16.5"/>',
    crescent:'<path d="M15.2 3.2a9 9 0 1 0 5.6 15.2A9.4 9.4 0 0 1 15.2 3.2z"/>',
    mountain:'<path d="M2.6 19h18.8L14.8 7l-3.4 6-2.6-3.4z"/>',
    chevron: '<path d="M5.4 6l6 6-6 6M13 6l5.6 6-5.6 6"/>',
    diamond: '<path d="M12 3.4 15.8 12 12 20.6 8.2 12z"/>',
    plus:    '<path d="M12 5v14M5 12h14"/>',
    soul:    '<path d="M12 3.4 19 12l-7 8.6L5 12z"/>',
    star:    '<path d="M12 4.2l2.3 5.2 5.5.6-4.1 3.8 1.1 5.5L12 16.6l-4.8 2.7 1.1-5.5-4.1-3.8 5.5-.6z"/>',
    burst:   '<path d="M12 3.6v4.2M12 16.2v4.2M3.6 12h4.2M16.2 12h4.2M6.1 6.1l3 3M14.9 14.9l3 3M17.9 6.1l-3 3M9.1 14.9l-3 3"/>',
    hand:    '<path d="M8.4 20.4c-2.2-2-3.4-4.4-3.4-7 0-1 .8-1.6 1.6-1.6s1.6.6 1.6 1.6V4.8a1.5 1.5 0 0 1 3 0v6.4M11.2 11.2V3.6a1.5 1.5 0 0 1 3 0v7.6M14.2 11.6V5.4a1.5 1.5 0 0 1 3 0v7.4c.6-.6 1.4-.8 2.2-.4 1.4.8 1 2.4.4 4.2-.8 2.4-2 3.8-3.6 5"/>'
  };

  function svgPet(petId) {
    return '<svg viewBox="0 0 32 32" aria-hidden="true">' + (PET_ICON[petId] || PET_ICON.ignis) + '</svg>';
  }
  function svgSkill(glyph) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (GLYPH[glyph] || GLYPH.soul) + '</svg>';
  }

  /* ---------- grade scaling ---------- */
  var GRADE_MUL = [0, 1, 1.5, 2.2];
  var GRADE_ROMAN = ['', 'I', 'II', 'III'];
  var GRADE_WORD = ['', '기본', '강화', '각성'];

  function gmul(g) { return GRADE_MUL[g] || 1; }
  function r(v) { return Math.round(v); }

  function effectLine(sk, grade) {
    var m = gmul(grade);
    switch (sk.type) {
      case 'volley': return '투사체 ' + sk.count + '발 · 발당 ' + r(sk.power * m) + ' 피해';
      case 'nova':   return '반경 ' + sk.radius + ' · ' + r(sk.power * m) + ' 피해' + (sk.slow ? ' · 둔화 ' + sk.slow + '% ' + sk.slowDur + '초' : '');
      case 'chain':  return sk.count + '명 연쇄 · 명중당 ' + r(sk.power * m) + ' 피해';
      case 'beam':   return '일직선 관통 · ' + r(sk.power * m) + ' 피해' + (sk.freeze ? ' · 빙결 ' + sk.freeze + '초' : '');
      case 'zone':   return '반경 ' + sk.radius + ' · ' + sk.duration + '초 · 틱당 ' + r(sk.dot * m) + ' 피해';
      case 'drain':  return '반경 ' + sk.radius + ' · ' + r(sk.power * m) + ' 피해 · 피해의 ' + sk.healPct + '% 회복';
      case 'quake':  return '반경 ' + sk.radius + ' · ' + r(sk.power * m) + ' 피해 · 기절 ' + sk.stun + '초';
      case 'shield': return '보호막 ' + r(sk.amount * m) + ' · ' + sk.duration + '초 · 반사 ' + r(sk.thorns * m);
      default: return '';
    }
  }

  var STAT_META = {
    atk:        { label: '공격력', unit: '%' },
    aspd:       { label: '공격속도', unit: '%' },
    crit:       { label: '치명타율', unit: '%' },
    critDmg:    { label: '치명타 피해', unit: '%' },
    lifesteal:  { label: '피해 흡혈', unit: '%' },
    dr:         { label: '받는 피해 감소', unit: '%' },
    maxHp:      { label: '최대 체력', unit: '', flat: true },
    thorns:     { label: '반사 피해', unit: '', flat: true },
    dodge:      { label: '회피율', unit: '%' },
    cdr:        { label: '쿨타임 감소', unit: '%' },
    soulGain:   { label: '웨이브 영혼석', unit: '개' },
    regen:      { label: '초당 재생', unit: '', dec: 1 },
    fireDmg:    { label: '화염 피해', unit: '%' },
    thunderDmg: { label: '번개 피해', unit: '%' },
    frostDmg:   { label: '서리 피해', unit: '%' },
    darkDmg:    { label: '암흑 피해', unit: '%' },
    earthDmg:   { label: '대지 피해', unit: '%' },
    petAtk:     { label: '펫 공격력', unit: '%' },
    burnChance: { label: '적중 시 화상 확률', unit: '%' },
    slowChance: { label: '적중 시 둔화 확률', unit: '%' }
  };

  function passiveLines(p, grade) {
    var m = gmul(grade), out = [];
    Object.keys(p.stats).forEach(function (k) {
      var meta = STAT_META[k]; if (!meta) return;
      var v = p.stats[k] * m;
      var val;
      if (k === 'soulGain') val = Math.max(1, Math.round(v));
      else if (meta.dec) val = Math.round(v * 10) / 10;
      else val = Math.round(v);
      out.push(meta.label + ' +' + val + meta.unit);
    });
    return out;
  }

  /* ---------- pets ---------- */
  var PETS = [
    {
      id: 'ignis', name: '이그니스', title: '불꽃 늑대', element: 'fire', shape: 'wolf', rarity: '희귀',
      active:  { id: 'ignis_a',  name: '불꽃 송곳니', element: 'fire', type: 'volley', glyph: 'volley', count: 2, power: 21, cd: 4.2, text: '가장 가까운 적 2곳에 불꽃을 내던집니다.' },
      passive: { id: 'ignis_p',  name: '발화', element: 'fire', glyph: 'flame', stats: { burnChance: 26 }, text: '공격이 적을 불태워 3초간 지속 피해를 줍니다.' }
    },
    {
      id: 'saram', name: '사라만', title: '용암 도롱뇽', element: 'fire', shape: 'lizard', rarity: '영웅',
      active:  { id: 'saram_a',  name: '용암 분출', element: 'fire', type: 'zone', glyph: 'zone', radius: 62, dot: 4, duration: 4, cd: 7.5, text: '적 무리 아래에 용암을 터뜨려 지속 피해를 줍니다.' },
      passive: { id: 'saram_p',  name: '열기', element: 'fire', glyph: 'flame', stats: { fireDmg: 18 }, text: '몸에서 뿜는 열기로 화염 피해가 강해집니다.' }
    },
    {
      id: 'voltcat', name: '볼트캣', title: '정전기 고양이', element: 'thunder', shape: 'cat', rarity: '희귀',
      active:  { id: 'voltcat_a', name: '연쇄 번개', element: 'thunder', type: 'chain', glyph: 'chain', count: 3, power: 16, cd: 4.6, text: '번개가 적들 사이를 튕기며 연쇄합니다.' },
      passive: { id: 'voltcat_p', name: '정전기', element: 'thunder', glyph: 'chevron', stats: { aspd: 14 }, text: '몸에 흐르는 전류로 공격이 빨라집니다.' }
    },
    {
      id: 'hound', name: '뇌견', title: '뇌광 사냥개', element: 'thunder', shape: 'hound', rarity: '영웅',
      active:  { id: 'hound_a',  name: '뇌광 돌진', element: 'thunder', type: 'beam', glyph: 'beam', power: 30, length: 460, cd: 6.4, text: '번개 줄기를 일직선으로 내지르며 꿰뚫습니다.' },
      passive: { id: 'hound_p',  name: '감전', element: 'thunder', glyph: 'bolt', stats: { thunderDmg: 16, slowChance: 22 }, text: '맞은 적을 감전시켜 움직임과 번개 저항을 무너뜨립니다.' }
    },
    {
      id: 'frost', name: '프로스트', title: '서리 여우', element: 'frost', shape: 'fox', rarity: '희귀',
      active:  { id: 'frost_a',  name: '서리 회오리', element: 'frost', type: 'nova', glyph: 'nova', radius: 94, power: 17, slow: 45, slowDur: 2.5, cd: 5.2, text: '주변을 얼려 피해를 주고 적을 늦춥니다.' },
      passive: { id: 'frost_p',  name: '혹한', element: 'frost', glyph: 'snow', stats: { frostDmg: 16, slowChance: 24 }, text: '스치는 것만으로 적의 발을 묶습니다.' }
    },
    {
      id: 'glacier', name: '빙사', title: '빙결 뱀', element: 'frost', shape: 'serpent', rarity: '전설',
      active:  { id: 'glacier_a', name: '빙결 창', element: 'frost', type: 'beam', glyph: 'beam', power: 34, length: 470, freeze: 1.1, cd: 6.8, text: '얼음 창을 내질러 꿰뚫은 적을 얼립니다.' },
      passive: { id: 'glacier_p', name: '서릿발', element: 'frost', glyph: 'star', stats: { crit: 9, frostDmg: 12 }, text: '얼음 결정이 약점을 파고들어 치명타를 돕습니다.' }
    },
    {
      id: 'nox', name: '녹스', title: '그림자 박쥐', element: 'dark', shape: 'bat', rarity: '희귀',
      active:  { id: 'nox_a',    name: '그림자 흡수', element: 'dark', type: 'drain', glyph: 'drain', radius: 112, power: 21, healPct: 50, cd: 5.6, text: '주변 생명력을 빨아들여 피해를 주고 회복합니다.' },
      passive: { id: 'nox_p',    name: '야습', element: 'dark', glyph: 'crescent', stats: { lifesteal: 9 }, text: '어둠 속에서 긁어낸 피해만큼 생기를 되찾습니다.' }
    },
    {
      id: 'morse', name: '모르스', title: '망령 사냥개', element: 'dark', shape: 'skull', rarity: '영웅',
      active:  { id: 'morse_a',  name: '망령의 손', element: 'dark', type: 'zone', glyph: 'hand', radius: 72, dot: 5, duration: 4, cd: 8.2, text: '망령의 손이 솟아올라 적을 붙잡고 갉아먹습니다.' },
      passive: { id: 'morse_p',  name: '영혼 수확', element: 'dark', glyph: 'soul', stats: { soulGain: 1 }, text: '웨이브를 정리할 때마다 영혼석을 더 거둡니다.' }
    },
    {
      id: 'terra', name: '테라', title: '바위 곰', element: 'earth', shape: 'bear', rarity: '영웅',
      active:  { id: 'terra_a',  name: '지진 강타', element: 'earth', type: 'quake', glyph: 'quake', radius: 106, power: 24, stun: 0.9, cd: 7, text: '땅을 내리쳐 주변을 뒤흔들고 적을 멈춥니다.' },
      passive: { id: 'terra_p',  name: '철갑', element: 'earth', glyph: 'shield', stats: { dr: 11 }, text: '두꺼운 갑각이 받는 피해를 줄입니다.' }
    },
    {
      id: 'gargoyle', name: '가고일', title: '석상 수호자', element: 'earth', shape: 'gargoyle', rarity: '전설',
      active:  { id: 'gargoyle_a', name: '돌가시 방벽', element: 'earth', type: 'shield', glyph: 'shield', amount: 34, duration: 6, thorns: 8, cd: 8.6, text: '돌가시 방벽을 세워 피해를 막고 되돌려줍니다.' },
      passive: { id: 'gargoyle_p', name: '재생', element: 'earth', glyph: 'plus', stats: { regen: 1.4, thorns: 5 }, text: '돌 틈으로 생명력이 재생되고 가시가 돋습니다.' }
    }
  ];

  var PET_BY_ID = {};
  PETS.forEach(function (p) { PET_BY_ID[p.id] = p; });

  var RARITY_WEIGHT = { '희귀': 60, '영웅': 30, '전설': 10 };
  var RARITY_COLOR = { '희귀': '#6f8fb8', '영웅': '#9a86ff', '전설': '#c9a86a' };

  /* ---------- synergies ---------- */
  var SYNERGIES = [
    { id: 'ember',      name: '연소',   color: 'fire',    need: { fire: 2 },                desc: '화염 피해 +45%',                 mods: { fireDmg: 45 } },
    { id: 'overload',   name: '과전류', color: 'thunder', need: { thunder: 2 },             desc: '공격속도 +30%',                  mods: { aspd: 30 } },
    { id: 'permafrost', name: '빙결',   color: 'frost',   need: { frost: 2 },               desc: '서리 피해 +25% · 적 둔화',         mods: { frostDmg: 25, slowAura: 18 } },
    { id: 'bloodpact',  name: '혈맹',   color: 'dark',    need: { dark: 2 },                desc: '가한 피해 12% 회복',              mods: { lifesteal: 12 } },
    { id: 'bastion',    name: '철벽',   color: 'earth',   need: { earth: 2 },               desc: '최대 체력 +28% · 피해 -12%',       mods: { maxHpPct: 28, dr: 12 } },
    { id: 'arcfire',    name: '과부하', color: 'fire',    need: { fire: 1, thunder: 1 },    desc: '쿨타임 -35% · 폭발 피해 +20%',      mods: { cdr: 35, allDmg: 20 } },
    { id: 'chill',      name: '한기',   color: 'frost',   need: { frost: 1, dark: 1 },      desc: '서리·암흑 피해 +25%',             mods: { frostDmg: 25, darkDmg: 25 } },
    { id: 'magma',      name: '용암',   color: 'fire',    need: { fire: 1, earth: 1 },      desc: '화염 피해 +20% · 최대 체력 +15%',   mods: { fireDmg: 20, maxHpPct: 15 } },
    { id: 'tempest',    name: '폭풍',   color: 'thunder', need: { thunder: 1, frost: 1 },   desc: '공격속도 +15% · 서리 피해 +15%',    mods: { aspd: 15, frostDmg: 15 } },
    { id: 'resonance',  name: '공명',   color: 'gold',    need: { distinct: 3 },            desc: '모든 피해 +18% · 쿨타임 -10%',      mods: { allDmg: 18, cdr: 10 } }
  ];

  function evalSynergies(elementCounts, distinctCount) {
    return SYNERGIES.filter(function (s) {
      var need = s.need;
      if (need.distinct) return distinctCount >= need.distinct;
      return Object.keys(need).every(function (k) { return (elementCounts[k] || 0) >= need[k]; });
    });
  }

  function pickPet() {
    var total = 0, i;
    for (i = 0; i < PETS.length; i++) total += RARITY_WEIGHT[PETS[i].rarity];
    var roll = Math.random() * total;
    for (i = 0; i < PETS.length; i++) {
      roll -= RARITY_WEIGHT[PETS[i].rarity];
      if (roll <= 0) return PETS[i];
    }
    return PETS[0];
  }

  PA.DATA = {
    ELEMENTS: ELEMENTS, ELEMENT_ORDER: ELEMENT_ORDER,
    PETS: PETS, PET_BY_ID: PET_BY_ID,
    SYNERGIES: SYNERGIES,
    RARITY_COLOR: RARITY_COLOR,
    GRADE_ROMAN: GRADE_ROMAN, GRADE_WORD: GRADE_WORD,
    GRADE_MUL: GRADE_MUL,
    gmul: gmul,
    svgPet: svgPet, svgSkill: svgSkill,
    effectLine: effectLine, passiveLines: passiveLines,
    evalSynergies: evalSynergies, pickPet: pickPet,
    BOND_WAVES: [0, 2, 4] /* index by level-1: waves needed for Lv2, Lv3 */
  };
})(window.PA);
