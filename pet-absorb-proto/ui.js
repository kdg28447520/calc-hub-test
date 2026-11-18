/* SOULBIND — ui: hud, slots, pet cards, absorb flow, overlays */
(function (PA) {
  'use strict';
  var D = PA.DATA;
  var G = null;
  var el = {};
  var modal = { open: false, petIdx: -1, kind: null, mode: 'pick' };
  var lastVals = {};
  var toastTimer = null;

  function $(id) { return document.getElementById(id); }

  var ICON_SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.2v5.6h3.2L12.4 19V5L7.2 9.2z" fill="currentColor" stroke="none"/><path d="M15.6 8.6a5 5 0 0 1 0 6.8M18.2 6a8.6 8.6 0 0 1 0 12"/></svg>';
  var ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.2v5.6h3.2L12.4 19V5L7.2 9.2z" fill="currentColor" stroke="none"/><path d="M16 9.6l4.8 4.8M20.8 9.6L16 14.4"/></svg>';
  var ICON_EMPTY_PET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
  var ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';

  function elemColor(k) { return (D.ELEMENTS[k] || {}).color || '#9aa5bb'; }
  function elemName(k) { return (D.ELEMENTS[k] || {}).name || ''; }

  /* ---------------- HUD ---------------- */
  function buildHud() {
    el.waveNum = $('waveNum');
    el.hpFill = $('hpFill');
    el.hpCur = $('hpCur');
    el.hpMax = $('hpMax');
    el.soulNum = $('soulNum');
    el.soulChip = $('soulChip');
    el.chips = $('synergyChips');
    el.activeSlots = $('activeSlots');
    el.passiveSlots = $('passiveSlots');
    el.passiveCount = $('passiveCount');
    el.petRow = $('petRow');
    el.petCount = $('petCount');
    el.summonBtn = $('summonBtn');
    el.autoBtn = $('autoBtn');
    el.muteBtn = $('muteBtn');
    el.banner = $('banner');
    el.toast = $('toast');
    el.modalLayer = $('modalLayer');
    el.intro = $('introLayer');
    el.end = $('endLayer');
    el.stage = $('stage');
  }

  function renderSynergies(S) {
    if (!S.synergies.length) {
      el.chips.innerHTML = '<span class="empty">속성을 모으면 시너지가 각성합니다</span>';
      return;
    }
    el.chips.innerHTML = S.synergies.map(function (s) {
      var c = s.color === 'gold' ? '#c9a86a' : elemColor(s.color);
      return '<span class="chip" style="--c:' + c + '" title="' + s.desc + '"><i></i>' + s.name + '</span>';
    }).join('');
  }

  function renderSkills(S) {
    // actives
    el.activeSlots.innerHTML = S.skills.active.map(function (inst, i) {
      if (!inst) {
        return '<div class="skill-card empty">' +
          '<span class="sk-icon">' + (i === 0 ? ICON_PLUS : '') + '</span>' +
          '<span class="sk-name">비어 있음</span></div>';
      }
      var c = elemColor(inst.element);
      return '<button type="button" class="skill-card" data-slot="' + i + '" style="--c:' + c + '">' +
        '<span class="key">' + (i + 1) + '</span>' +
        '<span class="grade">' + D.GRADE_ROMAN[inst.grade] + '</span>' +
        '<span class="sk-icon">' + D.svgSkill(inst.glyph) + '</span>' +
        '<span class="sk-name">' + inst.name + '</span>' +
        '<span class="cd-mask"></span>' +
        '<span class="cd-num"></span>' +
        '</button>';
    }).join('');

    // passives
    el.passiveSlots.innerHTML = S.skills.passive.map(function (inst) {
      if (!inst) {
        return '<div class="passive-cell empty"><span class="pname">슬롯</span></div>';
      }
      var c = elemColor(inst.element);
      return '<div class="passive-cell" style="--c:' + c + '" title="' + inst.name + '">' +
        '<span class="sk-icon">' + D.svgSkill(inst.glyph) + '</span>' +
        '<span class="pname">' + inst.name + '</span>' +
        '<span class="grade">' + D.GRADE_ROMAN[inst.grade] + '</span>' +
        '</div>';
    }).join('');

    var used = S.skills.passive.filter(Boolean).length;
    el.passiveCount.textContent = used + ' / 4';
  }

  function renderPets(S) {
    var cards = [];
    S.pets.forEach(function (pet, i) {
      var c = elemColor(pet.def.element);
      var lv = G.bondLevel(pet);
      var need = G.bondNeed(pet);
      var pips = '';
      for (var k = 0; k < 3; k++) pips += '<i class="' + (k < lv ? 'on' : '') + '"></i>';
      var bondText = need === null
        ? 'Lv.3 · <b>각성 완료</b>'
        : 'Lv.' + lv + ' · <b>' + (lv === 1 ? '강화' : '각성') + '까지 ' + need + '웨이브</b>';
      cards.push('<button type="button" class="pet-card" data-pet="' + i + '" style="--c:' + c + '">' +
        '<span class="pc-icon">' + D.svgPet(pet.def.id) + '</span>' +
        '<span class="pc-body">' +
          '<span class="pc-top"><span class="pc-name">' + pet.def.name + '</span><span class="pc-el">' + elemName(pet.def.element) + '</span></span>' +
          '<span class="pc-bond"><span class="pips">' + pips + '</span><span class="bond-lbl">' + bondText + '</span></span>' +
        '</span>' +
        '</button>');
    });
    for (var i = S.pets.length; i < 2; i++) {
      cards.push('<div class="pet-card empty-slot">' + ICON_EMPTY_PET + '<span>빈 동행 슬롯</span></div>');
    }
    el.petRow.innerHTML = cards.join('');
    var guard = Math.round(7 * S.pets.length);
    el.petCount.innerHTML = S.pets.length + ' / 2' + (S.pets.length ? ' · <b style="color:#8fbf9a">피해 -' + guard + '%</b>' : '');
  }

  function renderSummonState(S) {
    var full = S.pets.length >= 2;
    var poor = S.souls < 3;
    var btn = el.summonBtn;
    btn.disabled = poor || S.phase === 'dead' || S.phase === 'idle';
    var label = btn.querySelector('.btn-label');
    if (label) label.textContent = full ? '슬롯 가득' : poor ? '영혼석 부족' : '펫 소환';
  }

  function renderAuto(S) {
    el.autoBtn.innerHTML = '자동 <b>' + (S.autoCast ? 'ON' : 'OFF') + '</b>';
    el.autoBtn.classList.toggle('off', !S.autoCast);
  }

  function renderMute() {
    var muted = G.isMuted();
    el.muteBtn.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
  }

  function renderAll() {
    var S = G.state();
    renderSynergies(S);
    renderSkills(S);
    renderPets(S);
    renderSummonState(S);
    renderAuto(S);
    renderMute();
  }

  /* ---------------- per-frame sync ---------------- */
  function sync() {
    var S = G.state();
    if (!S) return;
    // hp
    var hp = Math.max(0, Math.round(S.hp));
    if (lastVals.hp !== hp || lastVals.maxHp !== S.maxHp) {
      el.hpFill.style.width = Math.max(0, Math.min(100, (S.hp / S.maxHp) * 100)) + '%';
      el.hpCur.textContent = hp;
      el.hpMax.textContent = S.maxHp;
      lastVals.hp = hp; lastVals.maxHp = S.maxHp;
    }
    if (lastVals.souls !== S.souls) {
      el.soulNum.textContent = S.souls;
      el.soulChip.classList.remove('gain');
      void el.soulChip.offsetWidth;
      el.soulChip.classList.add('gain');
      lastVals.souls = S.souls;
      renderSummonState(S);
    }
    if (lastVals.wave !== S.wave) {
      el.waveNum.textContent = S.wave;
      el.waveNum.classList.remove('pop');
      void el.waveNum.offsetWidth;
      el.waveNum.classList.add('pop');
      lastVals.wave = S.wave;
    }
    if (lastVals.phase !== S.phase) {
      renderSummonState(S);
      lastVals.phase = S.phase;
    }
    // cooldowns
    var cards = el.activeSlots.children;
    for (var i = 0; i < cards.length; i++) {
      var inst = S.skills.active[i];
      var card = cards[i];
      if (!inst || !card || !card.classList.contains('skill-card')) continue;
      var mask = card.querySelector('.cd-mask');
      var num = card.querySelector('.cd-num');
      if (!mask) continue;
      var frac = inst.cd > 0 ? Math.max(0, Math.min(1, inst.cdLeft / inst.cd)) : 0;
      mask.style.setProperty('--cd', frac.toFixed(3));
      num.style.setProperty('--cdn', frac > 0.02 ? '1' : '0');
      if (frac > 0.02) num.textContent = inst.cdLeft >= 1 ? Math.ceil(inst.cdLeft) : '';
      else num.textContent = '';
    }
  }

  /* ---------------- toasts / banner ---------------- */
  function showToast(msg, kind) {
    el.toast.textContent = msg;
    el.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.className = 'toast' + (kind ? ' ' + kind : ''); }, 2300);
  }

  function showBanner(d) {
    var sub = d.sub ? '<small>' + d.sub + '</small>' : '';
    el.banner.innerHTML = d.text + sub;
    if (d.color) el.banner.style.textShadow = '0 2px 20px rgba(0,0,0,.95), 0 0 30px ' + d.color;
    else el.banner.style.textShadow = '';
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
  }

  /* ---------------- modal ---------------- */
  function closeModal() {
    modal.open = false;
    modal.petIdx = -1;
    modal.kind = null;
    modal.mode = 'pick';
    el.modalLayer.hidden = true;
    el.modalLayer.innerHTML = '';
    setPaused(false);
  }

  var pausedByModal = false;
  function setPaused(v) {
    var S = G.state();
    if (!S) return;
    if (v) { pausedByModal = true; S.paused = true; }
    else { pausedByModal = false; S.paused = false; }
  }

  function petOf(idx) {
    var S = G.state();
    return S.pets[idx];
  }

  function openAbsorb(idx) {
    var pet = petOf(idx);
    if (!pet) return;
    modal.open = true;
    modal.petIdx = idx;
    modal.kind = null;
    modal.mode = 'pick';
    setPaused(true);
    renderModal();
    el.modalLayer.hidden = false;
  }

  function renderModal() {
    var S = G.state();
    var pet = petOf(modal.petIdx);
    if (!pet) { closeModal(); return; }
    var lv = G.bondLevel(pet);
    var col = elemColor(pet.def.element);
    var grade = lv;

    var head = '<div class="sheet-grip"></div>' +
      '<div class="sheet-head" style="--c:' + col + '">' +
        '<div class="sh-icon">' + D.svgPet(pet.def.id) + '</div>' +
        '<div class="sh-meta">' +
          '<h3>' + pet.def.name + '<em>' + elemName(pet.def.element) + '</em></h3>' +
          '<p>' + pet.def.title + ' · ' + pet.def.rarity + '</p>' +
        '</div>' +
        '<div class="sh-bond"><b>Lv.' + lv + '</b><span>유대 등급</span></div>' +
        '<button type="button" class="sheet-close" id="closeSheet" aria-label="닫기">✕</button>' +
      '</div>';

    if (modal.mode === 'pick') {
      var a = pet.def.active, p = pet.def.passive;
      var aLine = D.effectLine(a, grade);
      var pLine = D.passiveLines(p, grade).join(' · ');
      var need = G.bondNeed(pet);
      var nextG = grade < 3 ? grade + 1 : 3;
      var bondHint = need === null
        ? '지금 흡수하면 <b>최고 등급 III (각성)</b> 스킬이 됩니다.'
        : '지금 흡수하면 <b>등급 ' + D.GRADE_ROMAN[grade] + ' (' + D.GRADE_WORD[grade] + ')</b> 스킬이 됩니다. ' +
          '<b>' + need + '웨이브</b>만 더 버티면 등급 ' + D.GRADE_ROMAN[nextG] + ' (' + D.GRADE_WORD[nextG] + ')까지 오릅니다.';
      var body = head +
        '<p class="sheet-sub">흡수하면 <b>둘 중 하나만</b> 남기고 이 펫은 <b>소멸</b>합니다. ' + bondHint + '</p>' +
        optionHTML('active', a, grade, aLine) +
        optionHTML('passive', p, grade, pLine) +
        '<div class="sheet-actions">' +
          '<button type="button" class="btn btn-primary" id="doAbsorb" disabled>흡수</button>' +
          '<button type="button" class="btn btn-sub" id="doDissolve">해산 (+2 영혼석)</button>' +
        '</div>' +
        '<p class="sheet-note">해산하면 스킬 없이 펫을 보내고 영혼석 2개를 돌려받습니다.</p>';
      el.modalLayer.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + body + '</div>';
    } else {
      // replace screen
      var list = modal.kind === 'active' ? S.skills.active : S.skills.passive;
      var def = modal.kind === 'active' ? pet.def.active : pet.def.passive;
      var newC = elemColor(def.element);
      var cells = list.map(function (inst, i) {
        if (!inst) return '';
        var c = elemColor(inst.element);
        return '<button type="button" class="rep" data-rep="' + i + '" style="--c:' + c + '">' +
          '<span class="sk-icon">' + D.svgSkill(inst.glyph) + '</span>' +
          '<span>' + inst.name + '</span>' +
          '<span class="rep-new">' + D.GRADE_ROMAN[inst.grade] + ' → 교체</span>' +
          '</button>';
      }).join('');
      var body2 = head +
        '<p class="sheet-sub"><b>' + (modal.kind === 'active' ? '액티브' : '패시브') + ' 슬롯이 가득 찼습니다.</b> ' +
        '덮어쓸 슬롯을 고르면 <b>' + def.name + '</b>(등급 ' + D.GRADE_ROMAN[grade] + ')이 들어갑니다. ' +
        '고른 스킬은 사라집니다.</p>' +
        '<div class="replace-grid' + (modal.kind === 'passive' ? ' passive-grid' : '') + '">' + cells + '</div>' +
        '<div class="sheet-actions"><button type="button" class="btn btn-sub wide" id="backPick">← 돌아가기</button></div>';
      el.modalLayer.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + body2 + '</div>';
    }

    bindModal();
  }

  function optionHTML(kind, def, grade, line) {
    var c = elemColor(def.element);
    var gLabel = '등급 ' + D.GRADE_ROMAN[grade] + ' · ' + D.GRADE_WORD[grade];
    return '<button type="button" class="opt" data-kind="' + kind + '" style="--c:' + c + '">' +
      '<span class="opt-icon">' + D.svgSkill(def.glyph) + '</span>' +
      '<span class="opt-body">' +
        '<span class="opt-kind">' + (kind === 'active' ? '액티브 · 직접 시전' : '패시브 · 상시 적용') + '</span>' +
        '<span class="opt-name">' + def.name + '<em>' + elemName(def.element) + '</em></span>' +
        '<span class="opt-desc">' + def.text + '</span>' +
        '<span class="opt-stat">' + line + '</span>' +
        '<span class="opt-grade">' + gLabel + '</span>' +
      '</span>' +
      '</button>';
  }

  function bindModal() {
    var close = $('closeSheet');
    if (close) close.addEventListener('click', closeModal);
    var opts = el.modalLayer.querySelectorAll('.opt');
    Array.prototype.forEach.call(opts, function (o) {
      o.addEventListener('click', function () {
        modal.kind = o.getAttribute('data-kind');
        Array.prototype.forEach.call(el.modalLayer.querySelectorAll('.opt'), function (x) { x.classList.remove('sel'); });
        o.classList.add('sel');
        var btn = $('doAbsorb');
        if (btn) {
          btn.disabled = false;
          var S = G.state();
          var list = modal.kind === 'active' ? S.skills.active : S.skills.passive;
          var free = list.indexOf(null) >= 0;
          btn.textContent = free ? '흡수하기' : '흡수 · 슬롯 교체';
        }
        G.audio() && G.audio().ui();
      });
    });
    var doAbsorb = $('doAbsorb');
    if (doAbsorb) doAbsorb.addEventListener('click', function () {
      if (!modal.kind) return;
      var S = G.state();
      var list = modal.kind === 'active' ? S.skills.active : S.skills.passive;
      if (list.indexOf(null) >= 0) {
        var res = G.absorb(modal.petIdx, modal.kind, -1);
        if (res.ok) closeModal(); else showToast('흡수에 실패했습니다', 'warn');
      } else {
        modal.mode = 'replace';
        renderModal();
      }
    });
    var dis = $('doDissolve');
    if (dis) dis.addEventListener('click', function () {
      var r = G.dissolve(modal.petIdx);
      if (r.ok) { closeModal(); showToast('펫을 해산했습니다 — 영혼석 +2', 'gold'); }
    });
    var back = $('backPick');
    if (back) back.addEventListener('click', function () { modal.mode = 'pick'; renderModal(); });
    var reps = el.modalLayer.querySelectorAll('[data-rep]');
    Array.prototype.forEach.call(reps, function (r) {
      r.addEventListener('click', function () {
        var slot = parseInt(r.getAttribute('data-rep'), 10);
        var res = G.absorb(modal.petIdx, modal.kind, slot);
        if (res.ok) closeModal(); else showToast('교체에 실패했습니다', 'warn');
      });
    });
    el.modalLayer.onclick = function (ev) {
      if (ev.target === el.modalLayer) closeModal();
    };
  }

  /* ---------------- overlays ---------------- */
  function startGame() {
    el.intro.hidden = true;
    el.end.hidden = true;
    G.start();
    renderAll();
    var S = G.state();
    if (S.paused) S.paused = false;
  }

  function showEnd() {
    var S = G.state();
    $('endWave').textContent = S.wave;
    $('endKills').textContent = S.kills;
    $('endSkills').textContent = S.skillsAbsorbed;
    var build = S.skills.active.concat(S.skills.passive).filter(Boolean).map(function (inst) {
      var c = elemColor(inst.element);
      return '<span class="chip" style="--c:' + c + '"><i></i>' + inst.name + ' ' + D.GRADE_ROMAN[inst.grade] + '</span>';
    });
    $('endBuild').innerHTML = build.length ? build.join('') : '<span class="empty" style="font-size:10px;color:#5d6880">흡수한 스킬 없음</span>';
    el.end.hidden = false;
  }

  /* ---------------- wiring ---------------- */
  function wire() {
    $('startBtn').addEventListener('click', function () {
      var S = G.state();
      if (S.phase === 'idle') startGame();
      else { el.intro.hidden = true; S.paused = false; }
    });
    $('restartBtn').addEventListener('click', function () {
      el.end.hidden = true;
      G.restart();
      renderAll();
      lastVals = {};
      var S = G.state();
      S.paused = false;
    });
    $('helpBtn').addEventListener('click', function () {
      var S = G.state();
      if (S.phase === 'idle') { el.intro.hidden = false; return; }
      S.paused = true;
      var btn = $('startBtn');
      btn.textContent = '계속하기';
      el.intro.hidden = false;
    });
    el.muteBtn.addEventListener('click', function () { G.toggleMute(); renderMute(); });
    el.autoBtn.addEventListener('click', function () { G.toggleAuto(); renderAuto(G.state()); });
    el.summonBtn.addEventListener('click', function () {
      var r = G.summon();
      if (!r.ok) {
        showToast(r.msg || '소환할 수 없습니다', 'warn');
      }
    });
    el.activeSlots.addEventListener('click', function (ev) {
      var card = ev.target.closest ? ev.target.closest('.skill-card') : null;
      if (!card || card.classList.contains('empty')) return;
      var i = parseInt(card.getAttribute('data-slot'), 10);
      var ok = G.castSlot(i);
      if (!ok) showToast('아직 쿨타임입니다', 'warn');
    });
    el.petRow.addEventListener('click', function (ev) {
      var card = ev.target.closest ? ev.target.closest('.pet-card') : null;
      if (!card || card.classList.contains('empty-slot')) return;
      var i = parseInt(card.getAttribute('data-pet'), 10);
      openAbsorb(i);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { if (modal.open) closeModal(); return; }
      if (modal.open) return;
      if (ev.key === '1' || ev.key === '2' || ev.key === '3') {
        var ok = G.castSlot(parseInt(ev.key, 10) - 1);
        if (!ok) showToast('아직 쿨타임입니다', 'warn');
      }
      if (ev.key === ' ') { ev.preventDefault(); G.toggleAuto(); renderAuto(G.state()); }
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    G = PA.Game;
    buildHud();
    wire();

    PA.EV = {
      hud: function () { var S = G.state(); renderSynergies(S); renderSummonState(S); renderAuto(S); },
      skills: function () { renderSkills(G.state()); },
      pets: function () { renderPets(G.state()); },
      banner: showBanner,
      toast: function (d) { showToast(d.text, d.kind); },
      gameover: function () {
        if (modal.open) closeModal();
        setTimeout(showEnd, 700);
      },
      castflash: function (i) {
        var card = el.activeSlots.children[i];
        if (!card) return;
        card.classList.remove('cast');
        void card.offsetWidth;
        card.classList.add('cast');
      }
    };

    G.init();
    renderAll();

    // intro shows on first load
    el.intro.hidden = false;
    var S = G.state();
    if (S.phase === 'idle') S.paused = true;

    // unlock audio on first touch
    var unlock = function () {
      G.audio() && G.audio().ensure();
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('click', unlock);
    };
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('click', unlock);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  PA.UI = { sync: sync, renderAll: renderAll, showToast: showToast };
})(window.PA);
