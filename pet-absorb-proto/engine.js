/* SOULBIND — engine: state, combat, canvas render, audio */
(function (PA) {
  'use strict';
  var D = PA.DATA;

  var W = 390, H = 520;
  var canvas = null, ctx = null, stageEl = null;
  var audio = null;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  var S = null;

  /* ---------------- audio ---------------- */
  function AudioEngine() {
    var ac = null, master = null, muted = false;
    try { muted = localStorage.getItem('sb_muted') === '1'; } catch (e) {}
    function ensure() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
      try {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ac = new C();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ac.destination);
      } catch (e) { ac = null; }
      return ac;
    }
    function tone(o) {
      if (!ac || muted) return;
      var t0 = ac.currentTime + (o.delay || 0);
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.gain || 0.06, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + o.dur + 0.02);
    }
    function noise(o) {
      if (!ac || muted) return;
      var t0 = ac.currentTime + (o.delay || 0);
      var len = Math.floor(ac.sampleRate * o.dur);
      var buf = ac.createBuffer(1, len, ac.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      var src = ac.createBufferSource(); src.buffer = buf;
      var f = ac.createBiquadFilter(); f.type = o.type || 'bandpass';
      f.frequency.value = o.f || 1200; f.Q.value = o.q || 0.9;
      var g = ac.createGain(); g.gain.value = o.gain || 0.08;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t0);
    }
    return {
      ensure: ensure,
      isMuted: function () { return muted; },
      setMuted: function (m) {
        muted = !!m;
        try { localStorage.setItem('sb_muted', muted ? '1' : '0'); } catch (e) {}
        if (master) master.gain.value = muted ? 0 : 0.5;
      },
      hit: function () { noise({ f: 1900, q: 1.4, dur: 0.06, gain: 0.05 }); },
      crit: function () { noise({ f: 3200, q: 2, dur: 0.07, gain: 0.07 }); tone({ f: 880, to: 460, dur: 0.09, type: 'triangle', gain: 0.05 }); },
      cast: function (el) {
        var base = el === 'fire' ? 320 : el === 'thunder' ? 520 : el === 'frost' ? 420 : el === 'dark' ? 260 : 180;
        tone({ f: base, to: base * 2.2, dur: 0.22, type: 'sine', gain: 0.05 });
        noise({ f: base * 3, dur: 0.12, gain: 0.035 });
      },
      summon: function () {
        tone({ f: 300, to: 600, dur: 0.3, type: 'triangle', gain: 0.05 });
        tone({ f: 450, to: 900, dur: 0.34, type: 'sine', gain: 0.04, delay: 0.06 });
        noise({ f: 2400, dur: 0.3, gain: 0.03 });
      },
      absorb: function () {
        tone({ f: 620, to: 120, dur: 0.42, type: 'sawtooth', gain: 0.045 });
        tone({ f: 240, to: 620, dur: 0.5, type: 'sine', gain: 0.05, delay: 0.12 });
      },
      awaken: function () {
        [392, 523, 659, 784].forEach(function (f, i) {
          tone({ f: f, duration: 0.3, dur: 0.34, type: 'triangle', gain: 0.05, delay: i * 0.07 });
        });
        noise({ f: 1600, dur: 0.5, gain: 0.03 });
      },
      hurt: function () { tone({ f: 160, to: 70, dur: 0.18, type: 'square', gain: 0.05 }); },
      clear: function () {
        tone({ f: 523, dur: 0.16, type: 'triangle', gain: 0.045 });
        tone({ f: 784, dur: 0.22, type: 'triangle', gain: 0.045, delay: 0.1 });
      },
      boss: function () { tone({ f: 90, to: 48, dur: 0.9, type: 'sawtooth', gain: 0.07 }); noise({ f: 420, dur: 0.8, gain: 0.05 }); },
      ui: function () { tone({ f: 660, dur: 0.05, type: 'sine', gain: 0.03 }); },
      dead: function () { tone({ f: 220, to: 60, dur: 1.1, type: 'sawtooth', gain: 0.07 }); }
    };
  }

  /* ---------------- enemies ---------------- */
  var ENEMY = {
    imp:   { hp: 15, dmg: 4,  speed: 40, r: 9,   color: '#b0505f' },
    grunt: { hp: 27, dmg: 6,  speed: 28, r: 12,  color: '#8d5a63' },
    brute: { hp: 58, dmg: 9,  speed: 20, r: 16,  color: '#6f4a5c' },
    wisp:  { hp: 19, dmg: 4,  speed: 24, r: 10,  color: '#7d6bb0', ranged: true },
    boss:  { hp: 300, dmg: 13, speed: 15, r: 30, color: '#c2557f', boss: true }
  };

  function makeState() {
    return {
      phase: 'idle',           // idle | wave | clear | dead
      t: 0, wave: 1, kills: 0, skillsAbsorbed: 0, summoned: 0,
      hp: 100, maxHp: 100,
      souls: 6,
      power: 1,
      player: { x: W / 2, y: H - 64, atkTimer: 0, castFlash: 0, shield: 0, shieldT: 0, hurt: 0 },
      pets: [],
      enemies: [], shots: [], eshots: [], zones: [], beams: [], parts: [], nums: [], rings: [],
      skills: { active: [null, null, null], passive: [null, null, null, null] },
      stats: null, synergies: [],
      autoCast: true, muted: false,
      shake: 0, flash: 0, awakenT: 0, awakenColor: '#c9a86a', lowHp: 0,
      spawnQueue: [], spawnTimer: 0, spawnInterval: 0.7, clearTimer: 0,
      bossRef: null,
      soulPulse: 0,
      intro: { pets: [] }
    };
  }

  /* ---------------- stats / synergies ---------------- */
  function recompute(quiet) {
    var st = {
      atk: 0, aspd: 0, crit: 5, critDmg: 150, lifesteal: 0, dr: 0, maxHpPct: 0, maxHpFlat: 0,
      thorns: 0, dodge: 0, cdr: 0, soulGain: 0, regen: 0,
      fireDmg: 0, thunderDmg: 0, frostDmg: 0, darkDmg: 0, earthDmg: 0,
      petAtk: 0, burnChance: 0, slowChance: 0, allDmg: 0, slowAura: 0
    };
    var counts = {}, distinct = 0;
    var elemKeys = ['fire', 'thunder', 'frost', 'dark', 'earth'];

    S.skills.passive.forEach(function (inst) {
      if (!inst) return;
      var m = D.gmul(inst.grade);
      var stats = inst.def.stats || {};
      Object.keys(stats).forEach(function (k) {
        if (st[k] === undefined) return;
        st[k] += stats[k] * m;
      });
    });

    var owned = S.skills.active.concat(S.skills.passive).filter(Boolean);
    owned.forEach(function (inst) {
      counts[inst.element] = (counts[inst.element] || 0) + 1;
    });
    elemKeys.forEach(function (k) { if (counts[k]) distinct++; });

    var syn = D.evalSynergies(counts, distinct);
    syn.forEach(function (s) {
      Object.keys(s.mods).forEach(function (k) { if (st[k] !== undefined) st[k] += s.mods[k]; });
    });

    // normalize
    ['atk', 'aspd', 'crit', 'critDmg', 'lifesteal', 'dr', 'dodge', 'cdr', 'petAtk',
     'fireDmg', 'thunderDmg', 'frostDmg', 'darkDmg', 'earthDmg', 'burnChance', 'slowChance',
     'allDmg', 'slowAura', 'maxHpPct', 'regen'].forEach(function (k) {
      st[k] = Math.round(st[k] * 10) / 10;
    });
    st.soulGain = Math.round(st.soulGain);

    var newMax = Math.round((100 + st.maxHpFlat) * (1 + st.maxHpPct / 100));
    if (newMax !== S.maxHp) {
      var ratio = S.hp / S.maxHp;
      S.maxHp = newMax;
      S.hp = Math.min(newMax, Math.round(newMax * (S.hp > 0 ? ratio : 1)));
    }
    S.stats = st;

    var before = S.synergies.map(function (s) { return s.id; });
    S.synergies = syn;
    if (!quiet) {
      var added = syn.filter(function (s) { return before.indexOf(s.id) < 0; });
      if (added.length) awaken(added[0]);
    }
    emit('hud');
  }

  function awaken(syn) {
    var col = syn.color === 'gold' ? '#c9a86a' : (D.ELEMENTS[syn.color] ? D.ELEMENTS[syn.color].color : '#c9a86a');
    S.awakenT = 1.3;
    S.awakenColor = col;
    S.flash = 0.5;
    audio && audio.awaken();
    emit('banner', { text: '시너지 각성', sub: syn.name.toUpperCase() + ' · ' + syn.desc, color: col });
    emit('toast', { text: '시너지 「' + syn.name + '」 각성 — ' + syn.desc, kind: 'gold' });
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * Math.PI * 2;
      S.parts.push({
        x: S.player.x, y: S.player.y - 24, vx: Math.cos(a) * rand(40, 150), vy: Math.sin(a) * rand(40, 150),
        life: rand(0.5, 1.1), t: 0, size: rand(1.2, 2.6), color: col
      });
    }
  }

  /* ---------------- skills ---------------- */
  function makeInstance(def, kind, grade) {
    return {
      id: def.id, name: def.name, element: def.element, glyph: def.glyph,
      kind: kind, grade: grade, def: def,
      cdLeft: 0, cd: def.cd || 0
    };
  }

  /* ---------------- pet helpers ---------------- */
  function bondLevel(pet) {
    return pet.bondWaves >= 4 ? 3 : pet.bondWaves >= 2 ? 2 : 1;
  }
  function bondNeed(pet) {
    var lv = bondLevel(pet);
    if (lv === 3) return null;
    return (lv === 1 ? 2 : 4) - pet.bondWaves;
  }

  /* ---------------- combat helpers ---------------- */
  function nearestEnemy(x, y, maxD) {
    var best = null, bd = (maxD || 9999) * (maxD || 9999);
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      var d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function enemiesInRadius(x, y, r) {
    var rr = r * r, out = [];
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i];
      if (dist2(x, y, e.x, e.y) <= rr + e.r * e.r) out.push(e);
    }
    return out;
  }

  function addNumber(x, y, val, crit, elem) {
    var col = elem && D.ELEMENTS[elem] ? D.ELEMENTS[elem].color : '#e8eefb';
    S.nums.push({
      x: x + rand(-6, 6), y: y - 6, vy: crit ? -46 : -34, life: crit ? 0.85 : 0.65, t: 0,
      text: String(val), crit: !!crit, color: crit ? '#ffd98a' : col
    });
  }

  function burst(x, y, color, n, spd, size) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rand(spd * 0.3, spd);
      S.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), t: 0, size: rand(0.8, size || 2.2), color: color });
    }
  }

  function healPlayer(v) {
    if (S.hp <= 0) return;
    S.hp = Math.min(S.maxHp, S.hp + v);
    emit('hud');
  }

  function damageEnemy(e, amount, opt) {
    if (e.dead) return 0;
    opt = opt || {};
    var st = S.stats;
    var elem = opt.elem;
    if (elem && st[elem + 'Dmg'] !== undefined) amount *= 1 + (st[elem + 'Dmg'] + st.allDmg) / 100;
    var crit = opt.crit;
    if (crit === undefined) crit = Math.random() * 100 < st.crit;
    if (crit) amount *= st.critDmg / 100;
    amount = Math.max(1, Math.round(amount));

    e.hp -= amount;
    e.flash = 0.1;
    addNumber(e.x, e.y - e.r, amount, crit, elem);
    burst(e.x, e.y, elem && D.ELEMENTS[elem] ? D.ELEMENTS[elem].color : '#cfd8ea', crit ? 8 : 4, 90, 2);
    if (crit) { S.shake = Math.max(S.shake, 3.5); audio && audio.crit(); }
    else if (Math.random() < 0.55) audio && audio.hit();

    if (st.lifesteal > 0) healPlayer(amount * st.lifesteal / 100);
    if (st.burnChance > 0 && Math.random() * 100 < st.burnChance) {
      e.burn = { t: 3, dmg: Math.max(2, Math.round(3 + S.wave * 0.4)) };
    }
    if (elem === 'frost') e.slowT = Math.max(e.slowT, 1.8);
    else if (st.slowChance > 0 && Math.random() * 100 < st.slowChance) e.slowT = Math.max(e.slowT, 1.6);
    if (elem === 'earth' && Math.random() < 0.25) e.stunT = Math.max(e.stunT, 0.35);

    if (e.hp <= 0) killEnemy(e);
    return amount;
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    S.kills++;
    burst(e.x, e.y, e.boss ? '#f0c987' : '#7f8ea8', e.boss ? 40 : 12, e.boss ? 190 : 110, 2.4);
    if (e.boss) {
      S.shake = 9;
      S.rings.push({ x: e.x, y: e.y, r: 6, max: 180, t: 0, life: 0.9, color: '#e0b46a', w: 3 });
      emit('toast', { text: '보스 격파 — 영혼석 +4', kind: 'gold' });
      gainSouls(4);
    }
    audio && audio.hit();
  }

  function gainSouls(n) {
    S.souls += n;
    S.soulPulse = 0.5;
    emit('hud');
  }

  function damagePlayer(raw) {
    if (S.phase === 'dead') return;
    var st = S.stats;
    if (Math.random() * 100 < st.dodge) {
      addNumber(S.player.x, S.player.y - 40, 0, false, null);
      S.nums[S.nums.length - 1].text = 'MISS';
      return;
    }
    var dmg = raw * (1 - Math.min(0.7, st.dr / 100));
    if (S.player.shield > 0) {
      var absorbed = Math.min(S.player.shield, dmg);
      S.player.shield -= absorbed;
      dmg -= absorbed;
      burst(S.player.x, S.player.y - 16, '#bfa068', 4, 60, 1.8);
      if (S.player.shield <= 0 && st.thorns > 0) {
        enemiesInRadius(S.player.x, S.player.y, 70).forEach(function (e) { damageEnemy(e, st.thorns, { elem: 'earth', crit: false }); });
      }
    }
    dmg = Math.round(dmg);
    if (dmg <= 0) return;
    S.hp -= dmg;
    S.player.hurt = 0.25;
    S.shake = Math.max(S.shake, 4);
    audio && audio.hurt();
    addNumber(S.player.x, S.player.y - 44, dmg, false, 'dark');
    if (S.hp <= 0) {
      S.hp = 0;
      die();
    }
    emit('hud');
  }

  function die() {
    S.phase = 'dead';
    audio && audio.dead();
    S.shake = 10;
    for (var i = 0; i < 40; i++) burst(S.player.x, S.player.y - 20, '#8d3f4e', 1, 140, 2.4);
    emit('gameover');
  }

  /* ---------------- skill casting ---------------- */
  function elementColor(el) { return el && D.ELEMENTS[el] ? D.ELEMENTS[el].color : '#c9a86a'; }

  function castSkill(inst, origin, isPet) {
    var d = inst.def, m = D.gmul(inst.grade), col = elementColor(d.element);
    var ox = origin.x, oy = origin.y;
    audio && audio.cast(d.element);

    switch (d.type) {
      case 'volley': {
        var targets = S.enemies.slice().sort(function (a, b) { return dist2(ox, oy, a.x, a.y) - dist2(ox, oy, b.x, b.y); });
        if (!targets.length) break;
        var n = Math.min(d.count, targets.length);
        for (var i = 0; i < n; i++) {
          var t = targets[i % targets.length];
          fireShot(ox, oy, t, d.power * m, d.element, col);
        }
        break;
      }
      case 'nova': {
        S.rings.push({ x: ox, y: oy, r: 8, max: d.radius, t: 0, life: 0.45, color: col, w: 3 });
        enemiesInRadius(ox, oy, d.radius).forEach(function (e) {
          damageEnemy(e, d.power * m, { elem: d.element });
          if (d.slow) e.slowT = Math.max(e.slowT, d.slowDur || 2);
        });
        break;
      }
      case 'chain': {
        var ts = S.enemies.slice().sort(function (a, b) { return dist2(ox, oy, a.x, a.y) - dist2(ox, oy, b.x, b.y); }).slice(0, d.count);
        var prev = { x: ox, y: oy - 20 };
        ts.forEach(function (e, idx) {
          S.beams.push({ x1: prev.x, y1: prev.y, x2: e.x, y2: e.y, t: 0, life: 0.28, color: col, w: 2.4, jag: true });
          damageEnemy(e, d.power * m * Math.pow(0.86, idx), { elem: d.element });
          prev = e;
        });
        break;
      }
      case 'beam': {
        var tgt = nearestEnemy(ox, oy, 900);
        var ang = tgt ? Math.atan2(tgt.y - (oy - 20), tgt.x - ox) : -Math.PI / 2;
        var len = d.length || 420;
        var ex = ox + Math.cos(ang) * len, ey = (oy - 20) + Math.sin(ang) * len;
        S.beams.push({ x1: ox, y1: oy - 20, x2: ex, y2: ey, t: 0, life: 0.34, color: col, w: 7, core: true });
        S.enemies.slice().forEach(function (e) {
          var t2 = clamp(((e.x - ox) * Math.cos(ang) + (e.y - (oy - 20)) * Math.sin(ang)) / len, 0, 1);
          var px = ox + Math.cos(ang) * len * t2, py = (oy - 20) + Math.sin(ang) * len * t2;
          if (dist2(e.x, e.y, px, py) < (e.r + 10) * (e.r + 10)) {
            damageEnemy(e, d.power * m, { elem: d.element });
            if (d.freeze) { e.stunT = Math.max(e.stunT, d.freeze); e.frozen = 0.9; }
          }
        });
        break;
      }
      case 'zone': {
        var center = clusterCenter(d.radius) || { x: ox + rand(-40, 40), y: oy - 170 };
        S.zones.push({
          x: center.x, y: center.y, radius: d.radius, dot: d.dot * m, tick: 0,
          duration: d.duration, t: 0, color: col, element: d.element, seed: Math.random() * 6
        });
        break;
      }
      case 'drain': {
        S.rings.push({ x: ox, y: oy - 10, r: d.radius, max: 10, t: 0, life: 0.4, color: col, w: 2, inward: true });
        var total = 0;
        enemiesInRadius(ox, oy, d.radius).forEach(function (e) {
          total += damageEnemy(e, d.power * m, { elem: d.element });
          S.parts.push({ x: e.x, y: e.y, vx: (ox - e.x) * 2.2, vy: (oy - 20 - e.y) * 2.2, life: 0.4, t: 0, size: 1.8, color: col });
        });
        if (total > 0) {
          var h = total * d.healPct / 100;
          healPlayer(h);
          addNumber(ox, oy - 46, '+' + Math.round(h), false, 'earth');
        }
        break;
      }
      case 'quake': {
        S.rings.push({ x: ox, y: oy + 4, r: 10, max: d.radius, t: 0, life: 0.5, color: col, w: 4 });
        S.shake = Math.max(S.shake, 7);
        enemiesInRadius(ox, oy, d.radius).forEach(function (e) {
          damageEnemy(e, d.power * m, { elem: d.element });
          e.stunT = Math.max(e.stunT, d.stun);
        });
        break;
      }
      case 'shield': {
        S.player.shield = Math.max(S.player.shield, d.amount * m);
        S.player.shieldT = d.duration;
        S.rings.push({ x: ox, y: oy - 20, r: 10, max: 46, t: 0, life: 0.6, color: col, w: 2.5 });
        break;
      }
    }
    inst.cdLeft = (d.cd || 5) * (1 - Math.min(0.6, (S.stats.cdr || 0) / 100));
  }

  function clusterCenter(radius) {
    if (!S.enemies.length) return null;
    // densest cluster: enemy with most neighbours within radius
    var best = null, bestN = -1;
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i], n = 0;
      for (var j = 0; j < S.enemies.length; j++) {
        if (i === j) continue;
        if (dist2(e.x, e.y, S.enemies[j].x, S.enemies[j].y) < radius * radius) n++;
      }
      if (n > bestN) { bestN = n; best = e; }
    }
    return best;
  }

  function fireShot(x, y, target, dmg, elem, col) {
    var ang = Math.atan2(target.y - y, target.x - x);
    S.shots.push({
      x: x, y: y, vx: Math.cos(ang) * 560, vy: Math.sin(ang) * 560,
      target: target, dmg: dmg, elem: elem, color: col || elementColor(elem),
      life: 2.2, t: 0, trail: []
    });
  }

  /* ---------------- waves ---------------- */
  function composeWave(n) {
    var list = [], count = Math.min(14, 4 + Math.floor(n * 1.05));
    for (var i = 0; i < count; i++) {
      var roll = Math.random();
      if (n >= 4 && roll < 0.16) list.push('wisp');
      else if (n >= 3 && roll < 0.38) list.push('brute');
      else if (n >= 2 && roll < 0.72) list.push('grunt');
      else list.push('imp');
    }
    if (n % 5 === 0) list.push('boss');
    return list;
  }

  function spawnEnemy(type) {
    var t = ENEMY[type];
    var scaleHp = 1 + (S.wave - 1) * 0.27;
    var scaleDmg = 1 + (S.wave - 1) * 0.13;
    var e = {
      type: type, x: rand(34, W - 34), y: rand(-46, -18),
      hp: Math.round(t.hp * scaleHp), maxHp: Math.round(t.hp * scaleHp),
      dmg: t.dmg * scaleDmg, speed: t.speed * rand(0.92, 1.08),
      r: t.r, color: t.color, ranged: !!t.ranged, boss: !!t.boss,
      atk: rand(0.4, 1.2), slowT: 0, stunT: 0, frozen: 0, flash: 0, t: 0,
      burn: null, dead: false, wob: Math.random() * 6
    };
    if (t.boss) {
      e.x = W / 2; e.hp = e.maxHp = Math.round(t.hp * scaleHp * 0.9);
      S.bossRef = e;
      S.rings.push({ x: e.x, y: e.y + 20, r: 6, max: 140, t: 0, life: 0.8, color: '#c2557f', w: 3 });
      emit('banner', { text: 'BOSS', sub: 'WAVE ' + S.wave, color: '#c2557f' });
    }
    S.enemies.push(e);
  }

  function startWave(n) {
    S.wave = n;
    S.phase = 'wave';
    S.bossRef = null;
    S.spawnQueue = composeWave(n);
    S.spawnTimer = 0.25;
    S.spawnInterval = Math.max(0.24, 0.72 - n * 0.028);
    S.power = 1 + (n - 1) * 0.11;
    emit('banner', { text: 'WAVE ' + n, sub: n % 5 === 0 ? '보스 웨이브' : '' });
    emit('hud');
    if (n % 5 === 0) audio && audio.boss();
  }

  function endWave() {
    S.phase = 'clear';
    S.clearTimer = 2.3;
    var gain = 3 + Math.floor(S.wave / 4) + S.stats.soulGain;
    gainSouls(gain);
    S.hp = Math.min(S.maxHp, S.hp + Math.round(S.maxHp * 0.1));
    S.pets.forEach(function (p) { if (p.bondWaves < 4) p.bondWaves++; });
    audio && audio.clear();
    emit('toast', { text: '웨이브 클리어 — 영혼석 +' + gain, kind: 'gold' });
    emit('pets');
    emit('hud');
  }

  /* ---------------- summon / absorb ---------------- */
  function summon() {
    if (S.phase === 'idle' || S.phase === 'dead') return { ok: false, reason: 'idle' };
    if (S.hp <= 0) return { ok: false, reason: 'dead' };
    if (S.pets.length >= 2) return { ok: false, reason: 'slots', msg: '동행 슬롯이 가득 찼습니다 · 펫을 흡수해 자리를 비우세요' };
    if (S.souls < 3) return { ok: false, reason: 'souls', msg: '영혼석이 부족합니다 (3 필요)' };
    S.souls -= 3;
    S.summoned++;
    var def = D.pickPet();
    var p = {
      def: def, bondWaves: 0, atkTimer: rand(0.2, 0.8), cdLeft: 1.4,
      x: S.player.x + (S.pets.length === 0 ? -52 : 52), y: S.player.y - 6,
      bob: Math.random() * 6, spawnT: 0.5, flashT: 0
    };
    S.pets.push(p);
    layoutPets();
    audio && audio.summon();
    for (var i = 0; i < 22; i++) {
      var a = Math.random() * Math.PI * 2;
      S.parts.push({
        x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 8 + 6,
        vx: -Math.cos(a) * rand(30, 80), vy: -Math.abs(Math.sin(a)) * rand(30, 90),
        life: rand(0.4, 0.9), t: 0, size: rand(1, 2.4), color: elementColor(def.element)
      });
    }
    S.rings.push({ x: p.x, y: p.y + 8, r: 4, max: 52, t: 0, life: 0.6, color: elementColor(def.element), w: 2 });
    emit('pets'); emit('hud');
    return { ok: true, def: def };
  }

  function layoutPets() {
    var base = S.player.x;
    S.pets.forEach(function (p, i) {
      p.slot = i;
      p.homeX = base + (i === 0 ? -54 : 54);
      p.homeY = S.player.y - 4;
      if (p.x === undefined) p.x = p.homeX;
    });
  }

  function dissolve(petIdx) {
    var p = S.pets[petIdx];
    if (!p) return { ok: false };
    S.pets.splice(petIdx, 1);
    layoutPets();
    gainSouls(2);
    var col = elementColor(p.def.element);
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * Math.PI * 2;
      S.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * rand(30, 110), vy: Math.sin(a) * rand(30, 110) - 30, life: rand(0.4, 0.9), t: 0, size: rand(1, 2.2), color: col });
    }
    audio && audio.absorb();
    emit('pets'); emit('hud');
    return { ok: true, gained: 2 };
  }

  function absorb(petIdx, kind, slotIndex) {
    var p = S.pets[petIdx];
    if (!p) return { ok: false, reason: 'no-pet' };
    var list = kind === 'active' ? S.skills.active : S.skills.passive;
    var idx = slotIndex;
    if (idx === undefined || idx === null || idx < 0) {
      idx = list.indexOf(null);
      if (idx < 0) return { ok: false, reason: 'full' };
    }
    var grade = bondLevel(p);
    var def = kind === 'active' ? p.def.active : p.def.passive;
    var inst = makeInstance(def, kind, grade);
    var replaced = list[idx];
    list[idx] = inst;
    var px = p.x, py = p.y;
    S.pets.splice(petIdx, 1);
    layoutPets();
    S.skillsAbsorbed++;

    // vfx: spirit rushes into the summoner
    var col = elementColor(def.element);
    for (var i = 0; i < 34; i++) {
      var a = Math.random() * Math.PI * 2, sp = rand(60, 200);
      S.parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), t: 0, size: rand(1.2, 2.8), color: col });
    }
    S.rings.push({ x: S.player.x, y: S.player.y - 20, r: 6, max: 80, t: 0, life: 0.6, color: col, w: 2.5 });
    S.player.castFlash = 0.5;
    S.flash = 0.35;
    audio && audio.absorb();

    recompute(true);
    emit('skills'); emit('pets'); emit('hud');
    emit('toast', { text: (replaced ? '「' + replaced.name + '」 → ' : '') + '「' + inst.name + '」 흡수 완료 (등급 ' + D.GRADE_ROMAN[grade] + ' · ' + D.GRADE_WORD[grade] + ')', kind: 'gold' });
    return { ok: true, inst: inst, grade: grade, replaced: replaced };
  }

  /* ---------------- loop ---------------- */
  function startRun() {
    var muted = S ? S.muted : false;
    S = makeState();
    S.muted = muted;
    S.stats = {};
    recompute(true);
    S.phase = 'wave';
    emit('hud'); emit('skills'); emit('pets');
    startWave(1);
  }

  function updateIdle(dt) {
    S.t += dt;
    updateParticles(dt);
  }

  function update(dt) {
    S.t += dt;
    var st = S.stats;
    var p = S.player;

    if (st.regen > 0 && S.hp > 0) {
      S.hp = Math.min(S.maxHp, S.hp + st.regen * dt);
    }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 22);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 2.4);
    if (S.awakenT > 0) S.awakenT = Math.max(0, S.awakenT - dt);
    if (S.soulPulse > 0) S.soulPulse = Math.max(0, S.soulPulse - dt);
    if (p.hurt > 0) p.hurt = Math.max(0, p.hurt - dt);
    if (p.castFlash > 0) p.castFlash = Math.max(0, p.castFlash - dt);
    if (p.shieldT > 0) {
      p.shieldT -= dt;
      if (p.shieldT <= 0) p.shield = 0;
    }

    // player basic attack
    p.atkTimer -= dt;
    if (p.atkTimer <= 0 && S.enemies.length) {
      p.atkTimer = 0.54 / (1 + st.aspd / 100);
      var tgt = nearestEnemy(p.x, p.y - 30, 900);
      if (tgt) {
        S.shots.push({
          x: p.x + 12, y: p.y - 34, vx: 0, vy: 0, target: tgt,
          dmg: 8 * S.power * (1 + st.atk / 100), elem: null, color: '#cfe0ff', life: 2, t: 0, trail: [], basic: true
        });
        var ang = Math.atan2(tgt.y - (p.y - 34), tgt.x - (p.x + 12));
        var s = S.shots[S.shots.length - 1];
        s.vx = Math.cos(ang) * 620; s.vy = Math.sin(ang) * 620;
      }
    }

    // active skills cooldown + auto cast
    S.skills.active.forEach(function (inst, i) {
      if (!inst) return;
      if (inst.cdLeft > 0) inst.cdLeft = Math.max(0, inst.cdLeft - dt);
      if (S.autoCast && inst.cdLeft <= 0 && S.enemies.length) {
        castSkill(inst, { x: S.player.x + 14, y: S.player.y - 26 }, false);
        emit('castflash', i);
      }
    });

    // pets
    S.pets.forEach(function (pet, pi) {
      pet.t = (pet.t || 0) + dt;
      if (pet.spawnT > 0) pet.spawnT = Math.max(0, pet.spawnT - dt);
      var homeX = S.player.x + (pi === 0 ? -54 : 54);
      var bobY = Math.sin(S.t * 1.9 + pi * 2.1) * 3;
      pet.x += (homeX - pet.x) * Math.min(1, dt * 4);
      pet.y = S.player.y - 8 + bobY;

      pet.atkTimer -= dt;
      if (pet.atkTimer <= 0 && S.enemies.length) {
        pet.atkTimer = 1.05 / (1 + st.petAtk / 100);
        var e2 = nearestEnemy(pet.x, pet.y, 900);
        if (e2) {
          var dm = (4.5 + S.wave * 0.35) * (1 + st.petAtk / 100);
          fireShot(pet.x, pet.y - 2, e2, dm, pet.def.element, elementColor(pet.def.element));
        }
      }
      pet.cdLeft -= dt;
      if (pet.cdLeft <= 0 && S.enemies.length) {
        var activeDef = pet.def.active;
        var inst2 = makeInstance(activeDef, 'active', Math.max(1, bondLevel(pet)));
        castSkill(inst2, { x: pet.x, y: pet.y }, true);
        pet.cdLeft = (activeDef.cd || 5) * 1.15;
      }
    });

    // enemies
    var pl = S.player;
    for (var i = S.enemies.length - 1; i >= 0; i--) {
      var e = S.enemies[i];
      if (e.dead) { S.enemies.splice(i, 1); continue; }
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.frozen > 0) e.frozen -= dt;
      if (e.stunT > 0) { e.stunT -= dt; }
      if (e.slowT > 0) e.slowT -= dt;
      if (e.burn) {
        e.burn.t -= dt;
        e.burn.tick = (e.burn.tick || 0) + dt;
        if (e.burn.tick >= 0.5) {
          e.burn.tick = 0;
          damageEnemy(e, e.burn.dmg, { elem: 'fire', crit: false });
          if (e.dead) { S.enemies.splice(i, 1); continue; }
        }
        if (e.burn.t <= 0) e.burn = null;
      }

      var stopped = e.stunT > 0 || e.frozen > 0;
      var slowFactor = e.slowT > 0 ? 0.55 : 1;
      if (st.slowAura > 0) slowFactor *= 1 - st.slowAura / 100;

      var d = Math.sqrt(dist2(e.x, e.y, pl.x, pl.y - 18));
      var stopDist = e.ranged ? 150 : e.r + 26;

      if (!stopped && d > stopDist) {
        var ang2 = Math.atan2((pl.y - 18) - e.y, pl.x - e.x);
        var wobble = Math.sin(e.t * 3 + e.wob) * (e.ranged ? 0.5 : 0.25);
        e.x += Math.cos(ang2 + wobble) * e.speed * slowFactor * dt;
        e.y += Math.sin(ang2 + wobble) * e.speed * slowFactor * dt;
      } else if (!stopped) {
        e.atk -= dt;
        if (e.atk <= 0) {
          e.atk = e.ranged ? 2.2 : 1.25;
          if (e.ranged) {
            var a2 = Math.atan2((pl.y - 18) - e.y, pl.x - e.x);
            S.eshots.push({ x: e.x, y: e.y, vx: Math.cos(a2) * 200, vy: Math.sin(a2) * 200, dmg: e.dmg, life: 3, color: '#b28cff', t: 0 });
          } else {
            damagePlayer(e.dmg);
          }
        }
      }

      // separation
      for (var j = i - 1; j >= 0; j--) {
        var o = S.enemies[j];
        var dx = e.x - o.x, dy = e.y - o.y;
        var dd = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var min = e.r + o.r;
        if (dd < min) {
          var push = (min - dd) * 0.5;
          e.x += (dx / dd) * push; e.y += (dy / dd) * push;
          o.x -= (dx / dd) * push; o.y -= (dy / dd) * push;
        }
      }
      e.x = clamp(e.x, 12, W - 12);
    }

    // player shots
    for (var k = S.shots.length - 1; k >= 0; k--) {
      var s = S.shots[k];
      s.t += dt;
      if (s.target && !s.target.dead) {
        var ang3 = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        var sp = s.basic ? 640 : 540;
        s.vx = Math.cos(ang3) * sp; s.vy = Math.sin(ang3) * sp;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 6) s.trail.shift();
      var hit = null;
      for (var m = 0; m < S.enemies.length; m++) {
        var en = S.enemies[m];
        if (dist2(s.x, s.y, en.x, en.y) < (en.r + 6) * (en.r + 6)) { hit = en; break; }
      }
      if (hit) {
        damageEnemy(hit, s.dmg, { elem: s.elem || undefined });
        S.shots.splice(k, 1); continue;
      }
      if (s.t > s.life || s.x < -20 || s.x > W + 20 || s.y < -40 || s.y > H + 20) S.shots.splice(k, 1);
    }

    // enemy shots
    for (var q = S.eshots.length - 1; q >= 0; q--) {
      var es = S.eshots[q];
      es.t += dt; es.x += es.vx * dt; es.y += es.vy * dt;
      if (dist2(es.x, es.y, pl.x, pl.y - 22) < 18 * 18) {
        damagePlayer(es.dmg);
        S.eshots.splice(q, 1); continue;
      }
      if (es.t > es.life) S.eshots.splice(q, 1);
    }

    // zones
    for (var z = S.zones.length - 1; z >= 0; z--) {
      var zn = S.zones[z];
      zn.t += dt;
      zn.tick += dt;
      if (zn.tick >= 0.45) {
        zn.tick = 0;
        enemiesInRadius(zn.x, zn.y, zn.radius).forEach(function (e3) {
          damageEnemy(e3, zn.dot, { elem: zn.element, crit: false });
        });
      }
      if (zn.t > zn.duration) S.zones.splice(z, 1);
    }

    // beams
    for (var b = S.beams.length - 1; b >= 0; b--) {
      S.beams[b].t += dt;
      if (S.beams[b].t > S.beams[b].life) S.beams.splice(b, 1);
    }

    // wave state
    if (S.phase === 'wave') {
      if (S.spawnQueue.length) {
        S.spawnTimer -= dt;
        if (S.spawnTimer <= 0) {
          spawnEnemy(S.spawnQueue.shift());
          S.spawnTimer = S.spawnInterval;
        }
      } else if (S.enemies.length === 0) {
        endWave();
      }
    } else if (S.phase === 'clear') {
      S.clearTimer -= dt;
      if (S.clearTimer <= 0) startWave(S.wave + 1);
    }

    updateParticles(dt);
  }

  function updateParticles(dt) {
    var i;
    for (i = S.parts.length - 1; i >= 0; i--) {
      var p = S.parts[i];
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 60 * dt; p.vx *= 0.97;
      if (p.t > p.life) S.parts.splice(i, 1);
    }
    for (i = S.nums.length - 1; i >= 0; i--) {
      var n = S.nums[i];
      n.t += dt; n.y += n.vy * dt; n.vy += 60 * dt;
      if (n.t > n.life) S.nums.splice(i, 1);
    }
    for (i = S.rings.length - 1; i >= 0; i--) {
      var r2 = S.rings[i];
      r2.t += dt;
      r2.r = r2.inward ? (r2.max + (r2.r - r2.max) * Math.max(0, 1 - r2.t / r2.life)) : (r2.r + (r2.max - r2.r) * Math.min(1, dt / Math.max(0.05, r2.life - r2.t)));
      if (r2.t > r2.life) S.rings.splice(i, 1);
    }
  }

  /* ---------------- rendering ---------------- */
  var motes = [];
  function initMotes() {
    motes = [];
    for (var i = 0; i < 34; i++) {
      motes.push({ x: Math.random() * W, y: Math.random() * 600, r: rand(0.5, 1.6), sp: rand(4, 16), a: rand(0.1, 0.5) });
    }
  }

  function resize() {
    if (!canvas || !stageEl) return;
    var rect = stageEl.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = 390;
    H = Math.max(220, Math.round(rect.height * (390 / Math.max(1, rect.width))));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    var sc = canvas.width / 390;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    if (S) {
      S.player.x = W / 2;
      S.player.y = H - 64;
      layoutPets();
    }
  }

  function drawBackground() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0e18');
    g.addColorStop(0.55, '#070a11');
    g.addColorStop(1, '#05060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // distant arch/fog
    var fg = ctx.createRadialGradient(W / 2, H * 0.18, 10, W / 2, H * 0.18, H * 0.5);
    fg.addColorStop(0, 'rgba(90,110,160,0.10)');
    fg.addColorStop(1, 'rgba(90,110,160,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);

    // floor
    var py = S ? S.player.y : H - 64;
    var fg2 = ctx.createLinearGradient(0, py - 70, 0, H);
    fg2.addColorStop(0, 'rgba(20,26,40,0)');
    fg2.addColorStop(0.4, 'rgba(18,24,36,0.75)');
    fg2.addColorStop(1, 'rgba(8,10,16,1)');
    ctx.fillStyle = fg2;
    ctx.fillRect(0, py - 70, W, H - py + 70);

    // horizon line
    ctx.strokeStyle = 'rgba(120,140,190,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, py - 46); ctx.lineTo(W, py - 46); ctx.stroke();

    // motes
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.y -= m.sp * 0.016;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
      ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(S.t * 2 + i));
      ctx.fillStyle = '#9fb4d8';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // rune circle under player
    drawRuneCircle();
  }

  function drawRuneCircle() {
    var x = S.player.x, y = S.player.y + 16;
    var t = S.t;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.34);
    var col = S.synergies.length ? (S.synergies[0].color === 'gold' ? '#c9a86a' : elementColor(S.synergies[0].color)) : '#5d6f92';
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.20 + 0.06 * Math.sin(t * 1.6);
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 0, 46, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(0, 0, 60, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = 0.3;
    for (var i = 0; i < 8; i++) {
      var a = t * 0.35 + i * 0.785;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 53, Math.sin(a) * 53, 1.8, 0, 6.2832);
      ctx.fillStyle = col; ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    var p = S.player, x = p.x, y = p.y, t = S.t;
    var st = S.stats || {};
    var elCount = {};
    S.skills.active.concat(S.skills.passive).forEach(function (s) { if (s) elCount[s.element] = (elCount[s.element] || 0) + 1; });
    var domEl = null, best = 0;
    Object.keys(elCount).forEach(function (k) { if (elCount[k] > best) { best = elCount[k]; domEl = k; } });
    var orb = domEl ? elementColor(domEl) : '#9fb4d8';

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y + 18, 20, 6, 0, 0, 6.2832); ctx.fill();
    ctx.restore();

    // shield
    if (p.shield > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(191,160,104,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(x, y - 6, 30, 34, 0, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#bfa068'; ctx.fill();
      ctx.restore();
    }

    var bob = Math.sin(t * 1.7) * 1.2;
    ctx.save();
    ctx.translate(x, y + bob);

    // cloak
    ctx.beginPath();
    ctx.moveTo(-15, 18);
    ctx.quadraticCurveTo(-14, -8, -8, -24);
    ctx.quadraticCurveTo(0, -30, 8, -24);
    ctx.quadraticCurveTo(14, -8, 15, 18);
    ctx.quadraticCurveTo(0, 22, -15, 18);
    ctx.closePath();
    var cg = ctx.createLinearGradient(0, -30, 0, 20);
    cg.addColorStop(0, p.hurt > 0 ? '#3a2230' : '#1b2434');
    cg.addColorStop(1, '#0e1420');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = p.hurt > 0 ? 'rgba(216,80,93,0.8)' : 'rgba(120,145,195,0.35)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // hem trim
    ctx.beginPath();
    ctx.moveTo(-15, 18); ctx.quadraticCurveTo(0, 22, 15, 18);
    ctx.strokeStyle = 'rgba(201,168,106,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // hood
    ctx.beginPath();
    ctx.moveTo(-9, -22);
    ctx.quadraticCurveTo(-10, -36, 0, -38);
    ctx.quadraticCurveTo(10, -36, 9, -22);
    ctx.quadraticCurveTo(0, -18, -9, -22);
    ctx.closePath();
    ctx.fillStyle = '#141b28';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,165,215,0.4)';
    ctx.stroke();

    // face void + eyes
    ctx.beginPath();
    ctx.ellipse(0, -27, 6, 7, 0, 0, 6.2832);
    ctx.fillStyle = '#05070c';
    ctx.fill();
    var eyeCol = domEl ? elementColor(domEl) : '#cfe0ff';
    ctx.save();
    ctx.shadowBlur = 8; ctx.shadowColor = eyeCol;
    ctx.fillStyle = eyeCol;
    ctx.beginPath(); ctx.arc(-2.6, -27, 1.15, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(2.6, -27, 1.15, 0, 6.2832); ctx.fill();
    ctx.restore();

    // staff
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.quadraticCurveTo(19, -12, 22, -32);
    ctx.strokeStyle = '#3d4a63';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.quadraticCurveTo(19, -12, 22, -32);
    ctx.strokeStyle = 'rgba(160,180,220,0.25)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // orb
    var pulse = 1 + Math.sin(t * 3) * 0.12 + p.castFlash * 1.6;
    ctx.save();
    ctx.shadowBlur = 16 * pulse; ctx.shadowColor = orb;
    var og = ctx.createRadialGradient(22, -33, 0, 22, -33, 7 * pulse);
    og.addColorStop(0, '#ffffff');
    og.addColorStop(0.35, orb);
    og.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(22, -33, 7 * pulse, 0, 6.2832); ctx.fill();
    ctx.restore();

    // orbiting runes when synergies active
    if (S.synergies.length) {
      var sc = S.synergies[0].color === 'gold' ? '#c9a86a' : elementColor(S.synergies[0].color);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = sc;
      for (var i = 0; i < S.synergies.length; i++) {
        var a2 = t * 1.4 + i * (6.2832 / Math.max(3, S.synergies.length));
        ctx.beginPath(); ctx.arc(Math.cos(a2) * 24, -14 + Math.sin(a2) * 8, 1.6, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /* pet drawing */
  function drawPet(pet, i) {
    var col = elementColor(pet.def.element);
    var x = pet.x, y = pet.y, r = 13;
    var t = S.t + pet.def.id.length;

    // ground shadow
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y + 15, 12, 3.4, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.12;
    var ag = ctx.createRadialGradient(x, y, 2, x, y, 30);
    ag.addColorStop(0, col); ag.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, 6.2832); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    if (pet.spawnT > 0) {
      var s2 = 1 + Math.sin((0.5 - pet.spawnT) * 14) * 0.14;
      ctx.scale(s2, s2);
      ctx.globalAlpha = Math.min(1, (0.5 - pet.spawnT) * 5 + 0.3);
    }

    var ear = pet.bob;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = col;
    ctx.fillStyle = 'rgba(12,16,26,0.92)';
    ctx.save();
    ctx.shadowBlur = 9; ctx.shadowColor = col;

    var shape = pet.def.shape;
    if (shape === 'bat') {
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.quadraticCurveTo(-13, -9, -17, -1);
      ctx.quadraticCurveTo(-11, 0, -6, 6);
      ctx.quadraticCurveTo(-3, 3, 0, 9);
      ctx.quadraticCurveTo(3, 3, 6, 6);
      ctx.quadraticCurveTo(11, 0, 17, -1);
      ctx.quadraticCurveTo(13, -9, 0, 2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 4, 4.4, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2.6, -1); ctx.lineTo(-4, -7); ctx.moveTo(2.6, -1); ctx.lineTo(4, -7); ctx.stroke();
    } else if (shape === 'serpent') {
      ctx.beginPath();
      ctx.moveTo(-10, 10);
      ctx.bezierCurveTo(-2, 12, 2, 2, 6, 0);
      ctx.bezierCurveTo(10, -2, 12, -6, 10, -9);
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(9, -10, 5, 4, -0.5, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, 6); ctx.quadraticCurveTo(-2, 2, -6, 4);
      ctx.stroke();
    } else if (shape === 'skull') {
      ctx.beginPath();
      ctx.moveTo(-8, 4);
      ctx.quadraticCurveTo(-9, -6, 0, -8);
      ctx.quadraticCurveTo(9, -6, 8, 4);
      ctx.quadraticCurveTo(6, 10, 0, 10);
      ctx.quadraticCurveTo(-6, 10, -8, 4);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-3, 1, 2, 0, 6.2832); ctx.arc(3, 1, 2, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, 7); ctx.lineTo(-2, 10); ctx.moveTo(2, 7); ctx.lineTo(2, 10); ctx.stroke();
    } else if (shape === 'gargoyle') {
      ctx.beginPath();
      ctx.moveTo(-6, 10); ctx.quadraticCurveTo(-9, -2, -3, -8);
      ctx.quadraticCurveTo(0, -11, 3, -8);
      ctx.quadraticCurveTo(9, -2, 6, 10);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 2); ctx.quadraticCurveTo(-14, -6, -16, 2);
      ctx.moveTo(6, 2); ctx.quadraticCurveTo(14, -6, 16, 2);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-5, -14); ctx.moveTo(3, -8); ctx.lineTo(5, -14); ctx.stroke();
    } else if (shape === 'bear') {
      ctx.beginPath(); ctx.ellipse(0, 3, 9, 7.5, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-6.5, -6, 2.6, 0, 6.2832); ctx.arc(6.5, -6, 2.6, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 3.6, 0, 0, 6.2832); ctx.stroke();
    } else if (shape === 'lizard') {
      ctx.beginPath();
      ctx.ellipse(0, 4, 9, 5.4, -0.15, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, 4); ctx.quadraticCurveTo(-14, 2, -15, -2);
      ctx.moveTo(6, 1); ctx.quadraticCurveTo(11, -4, 12, -8);
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(11, -8, 3, 3.6, 0.3, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, 9); ctx.lineTo(-3, 13); ctx.moveTo(3, 9); ctx.lineTo(3, 13); ctx.stroke();
    } else {
      // quadruped: wolf / cat / fox / hound
      var tallEars = shape === 'cat';
      var ears = shape === 'fox' ? 7 : tallEars ? 8 : 6;
      ctx.beginPath();
      ctx.ellipse(-1, 4, 9.5, 6, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(6, -2, 5.4, 0, 6.2832); ctx.fill(); ctx.stroke();
      // ears
      ctx.beginPath();
      ctx.moveTo(2.4, -5.4); ctx.lineTo(0.6, -5.4 - ears); ctx.lineTo(4.6, -6.4);
      ctx.moveTo(9.6, -5.4); ctx.lineTo(11.4, -5.4 - ears); ctx.lineTo(7.4, -6.4);
      ctx.stroke();
      // muzzle + eye
      ctx.beginPath(); ctx.moveTo(10.4, -1.4); ctx.lineTo(12.6, -0.6); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(7.4, -3, 1.05, 0, 6.2832); ctx.fill();
      // tail
      ctx.strokeStyle = col; ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(-9, 2); ctx.quadraticCurveTo(-16, -2, -15, -8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (shape === 'hound') {
        ctx.beginPath(); ctx.moveTo(5, -8); ctx.lineTo(2.6, -12.6); ctx.lineTo(6, -12); ctx.lineTo(4.6, -16); ctx.stroke();
      }
      if (shape === 'fox') {
        ctx.beginPath(); ctx.moveTo(-9, 4); ctx.quadraticCurveTo(-17, 6, -17, 0); ctx.stroke();
      }
    }
    ctx.restore();

    // bond pips above
    var lv = bondLevel(pet);
    ctx.save();
    for (var d = 0; d < 3; d++) {
      ctx.beginPath();
      ctx.arc(-6 + d * 6, -22, 1.7, 0, 6.2832);
      ctx.fillStyle = d < lv ? '#c9a86a' : 'rgba(120,135,160,0.35)';
      ctx.fill();
    }
    ctx.restore();

    // absorb affordance hint
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(S.t * 2.4);
    ctx.fillStyle = '#c9a86a';
    ctx.font = '600 7px Pretendard, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAP', x, y - 30);
    ctx.restore();
    ctx.restore();
  }

  function drawEnemy(e) {
    var x = e.x, y = e.y, r = e.r, col = e.color;
    ctx.save();
    // shadow
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.3, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;

    var bob = Math.sin(e.t * 3 + e.wob) * 1.2;
    ctx.translate(x, y + bob);

    if (e.burn) {
      ctx.save(); ctx.globalAlpha = 0.5;
      var bg = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.7);
      bg.addColorStop(0, 'rgba(242,104,60,0.5)'); bg.addColorStop(1, 'rgba(242,104,60,0)');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
    if (e.slowT > 0 || e.frozen > 0) {
      ctx.save(); ctx.globalAlpha = 0.4;
      var sg = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 1.6);
      sg.addColorStop(0, 'rgba(92,201,223,0.55)'); sg.addColorStop(1, 'rgba(92,201,223,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    var body = e.flash > 0 ? '#ffffff' : col;
    var shape = e.type;

    ctx.fillStyle = 'rgba(10,10,16,0.9)';
    ctx.strokeStyle = body;
    ctx.lineWidth = e.boss ? 2 : 1.4;
    ctx.save();
    ctx.shadowBlur = e.boss ? 20 : 8;
    ctx.shadowColor = col;

    if (shape === 'wisp') {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.4, e.t * 0.7, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.4, e.t * 0.7 + 1.57, 0, 6.2832); ctx.stroke();
    } else if (shape === 'boss') {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.55, -r * 0.62);
      ctx.lineTo(r * 0.92, -r * 0.92);
      ctx.lineTo(r * 0.78, -r * 0.3);
      ctx.lineTo(r * 1.05, 0);
      ctx.lineTo(r * 0.7, r * 0.5);
      ctx.lineTo(r * 0.42, r);
      ctx.lineTo(-r * 0.42, r);
      ctx.lineTo(-r * 0.7, r * 0.5);
      ctx.lineTo(-r * 1.05, 0);
      ctx.lineTo(-r * 0.78, -r * 0.3);
      ctx.lineTo(-r * 0.92, -r * 0.92);
      ctx.lineTo(-r * 0.55, -r * 0.62);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, 6.2832); ctx.stroke();
    } else if (shape === 'brute') {
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.9);
      ctx.lineTo(-r * 0.9, -r * 0.2);
      ctx.lineTo(-r * 0.5, -r * 0.9);
      ctx.lineTo(r * 0.5, -r * 0.9);
      ctx.lineTo(r * 0.9, -r * 0.2);
      ctx.lineTo(r, r * 0.9);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.55); ctx.lineTo(-r * 1.15, -r * 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.75, -r * 0.55); ctx.lineTo(r * 1.15, -r * 1.1); ctx.stroke();
    } else if (shape === 'imp') {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r, -r * 0.4, r * 0.7, r * 0.8);
      ctx.quadraticCurveTo(0, r * 1.1, -r * 0.7, r * 0.8);
      ctx.quadraticCurveTo(-r, -r * 0.4, 0, -r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.7); ctx.lineTo(-r * 0.9, -r * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.7); ctx.lineTo(r * 0.9, -r * 1.4); ctx.stroke();
    } else {
      // grunt
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r);
      ctx.quadraticCurveTo(-r * 1.05, -r * 0.2, -r * 0.45, -r * 0.85);
      ctx.quadraticCurveTo(0, -r * 1.15, r * 0.45, -r * 0.85);
      ctx.quadraticCurveTo(r * 1.05, -r * 0.2, r * 0.8, r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(-r * 1.1, -r * 0.2); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(r * 1.1, -r * 0.2); ctx.stroke();
    }

    // eyes
    ctx.fillStyle = e.stunT > 0 ? '#8fa6c8' : '#ff7a7a';
    ctx.shadowBlur = 8; ctx.shadowColor = '#ff5a5a';
    var er = e.boss ? 2.6 : 1.5;
    ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.15, er, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.15, er, 0, 6.2832); ctx.fill();
    ctx.restore();
    ctx.restore();

    // hp bar
    if (e.hp < e.maxHp && !e.boss) {
      var w = Math.max(16, e.r * 2);
      ctx.save();
      ctx.fillStyle = 'rgba(8,10,16,0.8)';
      ctx.fillRect(x - w / 2, y - e.r - 10, w, 3);
      ctx.fillStyle = '#d8505d';
      ctx.fillRect(x - w / 2, y - e.r - 10, w * Math.max(0, e.hp / e.maxHp), 3);
      ctx.restore();
    }
  }

  function drawZones() {
    S.zones.forEach(function (z) {
      var k = 1 - z.t / z.duration;
      ctx.save();
      var g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.radius);
      g.addColorStop(0, hexA(z.color, 0.30 * k));
      g.addColorStop(0.6, hexA(z.color, 0.12 * k));
      g.addColorStop(1, hexA(z.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.radius, z.radius * 0.55, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = hexA(z.color, 0.35 * k);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.radius, z.radius * 0.55, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    });
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function drawBeams() {
    S.beams.forEach(function (b) {
      var k = 1 - b.t / b.life;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.w * k;
      ctx.shadowBlur = 18; ctx.shadowColor = b.color;
      ctx.beginPath();
      if (b.jag) {
        var seg = 5, dx = (b.x2 - b.x1) / seg, dy = (b.y2 - b.y1) / seg;
        ctx.moveTo(b.x1, b.y1);
        for (var i = 1; i <= seg; i++) {
          var jx = i < seg ? rand(-6, 6) : 0, jy = i < seg ? rand(-6, 6) : 0;
          ctx.lineTo(b.x1 + dx * i + jx, b.y1 + dy * i + jy);
        }
      } else {
        ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2);
      }
      ctx.stroke();
      if (b.core) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(0.6, b.w * 0.3 * k);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawShots() {
    S.shots.forEach(function (s) {
      ctx.save();
      s.trail.forEach(function (p, i) {
        ctx.globalAlpha = (i / s.trail.length) * 0.5;
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + i * 0.25, 0, 6.2832); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 12; ctx.shadowColor = s.color;
      var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.basic ? 6 : 8);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, s.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.basic ? 6 : 8, 0, 6.2832); ctx.fill();
      ctx.restore();
    });
    S.eshots.forEach(function (s) {
      ctx.save();
      ctx.shadowBlur = 10; ctx.shadowColor = s.color;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 6.2832); ctx.fill();
      ctx.restore();
    });
  }

  function drawParticles() {
    S.parts.forEach(function (p) {
      var k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, 6.2832); ctx.fill();
    });
    ctx.globalAlpha = 1;

    S.rings.forEach(function (r) {
      var k = 1 - r.t / r.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, k) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = (r.w || 2) * k;
      ctx.shadowBlur = 14; ctx.shadowColor = r.color;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.55, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    });

    S.nums.forEach(function (n) {
      var k = 1 - n.t / n.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.6));
      ctx.fillStyle = n.color;
      ctx.font = (n.crit ? '800 15px' : '700 12px') + ' Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowBlur = n.crit ? 10 : 4; ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.fillText(n.text, n.x, n.y);
      ctx.restore();
    });
  }

  function drawBossBar() {
    var b = S.bossRef;
    if (!b || b.dead || S.phase === 'dead') return;
    var w = 220, x = (W - w) / 2, y = 14;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.75)';
    ctx.fillRect(x - 2, y - 2, w + 4, 12);
    ctx.fillStyle = 'rgba(194,85,127,0.25)';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = '#c2557f';
    ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 8);
    ctx.strokeStyle = 'rgba(194,85,127,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, 13);
    ctx.fillStyle = 'rgba(230,210,225,0.75)';
    ctx.font = '600 8px Pretendard, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('BOSS', x, y - 6);
    ctx.restore();
  }

  function render() {
    if (!ctx) return;
    ctx.setTransform(canvas.width / 390, 0, 0, canvas.width / 390, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (S.shake > 0.2) {
      ctx.translate(rand(-S.shake, S.shake) * 0.5, rand(-S.shake, S.shake) * 0.5);
    }
    drawBackground();
    drawZones();
    S.enemies.slice().sort(function (a, b) { return a.y - b.y; }).forEach(drawEnemy);
    S.pets.forEach(drawPet);
    drawPlayer();
    drawBeams();
    drawShots();
    drawParticles();
    drawBossBar();

    // low hp vignette
    if (S.hp > 0 && S.hp / S.maxHp < 0.3) {
      var k = 1 - S.hp / S.maxHp / 0.3;
      var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.72);
      vg.addColorStop(0, 'rgba(150,20,35,0)');
      vg.addColorStop(1, 'rgba(150,20,35,' + (0.35 * k * (0.7 + 0.3 * Math.sin(S.t * 4))) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    if (S.flash > 0) {
      ctx.save();
      ctx.globalAlpha = S.flash * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (S.awakenT > 0) {
      var k2 = S.awakenT / 1.3;
      ctx.save();
      ctx.globalAlpha = k2 * 0.55;
      var ag = ctx.createRadialGradient(W / 2, S.player.y, 10, W / 2, S.player.y, 260);
      ag.addColorStop(0, hexA(S.awakenColor, 0.5));
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = (ts - last) / 1000;
    last = ts;
    if (!isFinite(dt) || dt <= 0) dt = 0.016;
    dt = Math.min(0.05, dt);
    if (!S) return;
    if (S.phase === 'idle' || S.phase === 'dead') updateIdle(dt);
    else if (!S.paused) update(dt);
    else updateParticles(dt);
    render();
    if (PA.UI && PA.UI.sync) PA.UI.sync();
  }

  /* ---------------- events ---------------- */
  function emit(name, data) {
    if (PA.EV && PA.EV[name]) PA.EV[name](data);
  }

  /* ---------------- public ---------------- */
  PA.Game = {
    init: function () {
      stageEl = document.getElementById('stage');
      canvas = document.getElementById('game');
      ctx = canvas.getContext('2d');
      audio = AudioEngine();
      S = makeState();
      S.muted = audio.isMuted();
      recompute(true);
      initMotes();
      resize();
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { resize(); });
        ro.observe(stageEl);
      } else {
        window.addEventListener('resize', resize);
      }
      window.addEventListener('resize', resize);
      requestAnimationFrame(frame);
      emit('hud'); emit('skills'); emit('pets');
    },
    state: function () { return S; },
    start: function () { audio.ensure(); startRun(); },
    restart: function () { audio.ensure(); startRun(); },
    summon: function () { audio.ensure(); var r = summon(); emit('hud'); return r; },
    absorb: absorb,
    dissolve: dissolve,
    bondLevel: bondLevel,
    bondNeed: bondNeed,
    castSlot: function (i) {
      var inst = S.skills.active[i];
      if (!inst || inst.cdLeft > 0) return false;
      audio.ensure();
      castSkill(inst, { x: S.player.x + 14, y: S.player.y - 26 }, false);
      emit('castflash', i);
      emit('skills');
      return true;
    },
    toggleAuto: function () { S.autoCast = !S.autoCast; emit('hud'); return S.autoCast; },
    toggleMute: function () { var m = !audio.isMuted(); audio.setMuted(m); S.muted = m; emit('hud'); return m; },
    isMuted: function () { return audio.isMuted(); },
    audio: function () { return audio; },
    enemiesInRadius: enemiesInRadius
  };
})(window.PA);
