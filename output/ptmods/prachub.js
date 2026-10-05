/* prachub.js — "ฝึก" hub: a simple menu that gathers all drills/games (Quiz's 7 modes),
   Word Choice, and weak-word review. Routes into existing modes. ES5. Uses S, esc, goMode, PT.quiz, PT.miss. */
PT.prachub = (function () {
  "use strict";
  function go(mode, sub) {
    if (mode === "quiz" && sub) { try { PT.quiz._state.sub = sub; PT.quiz._state.cur = null; } catch (e) {} }
    goMode(mode);
  }
  function weak() {
    S.filter.status = {}; S.filter.groups = {}; S.filter.pos = {}; S.filter.fav = false; S.filter.miss = true; S.filter.q = "";
    S.workingDirty = true; goMode("quiz");
  }
  var MODES = [
    { ic: "🔤", sub: "mc", t: "เลือกตอบ", d: "ปรนัย 4 ตัวเลือก" },
    { ic: "⌨️", sub: "type", t: "พิมพ์ตอบ", d: "พิมพ์คำ / ความหมาย" },
    { ic: "🎧", sub: "listen", t: "ฟังเขียนตาม", d: "dictation" },
    { ic: "◻️", sub: "cloze", t: "เติมคำ", d: "เติมช่องว่างในประโยค" },
    { ic: "✍️", sub: "build", t: "แต่งประโยค", d: "ไทย → อังกฤษ + ให้ Claude ตรวจ" },
    { ic: "🧩", sub: "bank", t: "เติมประโยค", d: "เกมเติมหลายช่องจากคลังคำ" },
    { ic: "🔧", sub: "fix", t: "หาที่ผิด", d: "เกมแก้ประโยคผิด" }
  ];
  function render(v) {
    var miss = (PT.miss && PT.miss.count) ? PT.miss.count(S.deck) : 0;
    var h = ['<div class="ph-wrap">'];
    h.push('<div class="ph-hero">✏️ ฝึก</div>');
    h.push('<div class="ph-sub">แบบฝึกและเกมทั้งหมดรวมที่เดียว — ใช้คลังที่เลือกอยู่ (' + esc((window.DECKS && DECKS[S.deck]) ? DECKS[S.deck].name : S.deck) + ')</div>');
    if (miss > 0) h.push('<button class="ph-weak" data-ph-weak="1">📓 ทบทวนคำที่มักผิด ' + miss + ' คำ</button>');
    h.push('<div class="ph-grid">');
    var i;
    for (i = 0; i < MODES.length; i++) {
      var m = MODES[i];
      h.push('<button class="ph-card" data-ph-sub="' + m.sub + '"><div class="ph-ic">' + m.ic + '</div>' +
        '<div class="ph-t">' + esc(m.t) + '</div><div class="ph-d">' + esc(m.d) + '</div></button>');
    }
    h.push('</div>');
    h.push('<div class="ph-sec">เข้าใจให้ลึก</div>');
    h.push('<button class="ph-wide" data-ph-wc="1"><span class="ph-wic">⚖️</span><span><b>เลือกคำ (near-synonyms)</b>' +
      '<em>668 กลุ่มคำใกล้เคียง + 4 เกม — รู้ว่าคำไหนใช้ตอนไหน</em></span></button>');
    h.push('<button class="ph-wide" data-ph-struct="1"><span class="ph-wic">📐</span><span><b>โครงสร้างประโยค</b>' +
      '<em>โครงประโยคอังกฤษ · WH · คำเชื่อม · การแปลงประโยค</em></span></button>');
    h.push('<div class="ph-sec">เล่นสนุก</div>');
    h.push('<button class="ph-wide ph-game" data-ph-game="1"><span class="ph-wic">🎮</span><span><b>เกมคำศัพท์</b>' +
      '<em>16 เกมเร็วๆ — สายฟ้าความหมาย · จับกลุ่มลับ · เดิมพันคำ · บทสนทนา ฯลฯ</em></span></button>');
    h.push('<button class="ph-wide ph-camp" data-ph-camp="1"><span class="ph-wic">🗺️</span><span><b>โหมดผจญภัย</b>' +
      '<em>เกมมีเนื้อเรื่อง เล่นข้ามวัน — เดินทางเป็นด่านๆ เก็บดาว เก็บคำศัพท์</em></span></button>');
    h.push('<div class="ph-sec">เขียนอังกฤษให้มืออาชีพ</div>');
    h.push('<button class="ph-wide ph-formal" data-ph-formal="1"><span class="ph-wic">✒️</span><span><b>คำง่าย → คำทางการ</b>' +
      '<em>give→provide, fix→resolve — สายธุรกิจ/อีเมล และ เทคนิค/โค้ด พร้อมแปลไทย + แปลงประโยคของคุณให้ทางการ</em></span></button>');
    h.push('</div>');
    v.innerHTML = h.join("");
    [].forEach.call(v.querySelectorAll("[data-ph-sub]"), function (b) { b.onclick = function () { go("quiz", b.getAttribute("data-ph-sub")); }; });
    var wc = v.querySelector("[data-ph-wc]"); if (wc) wc.onclick = function () { goMode("wordchoice"); };
    var stb = v.querySelector("[data-ph-struct]"); if (stb) stb.onclick = function () { if (PT.structure) PT.structure.open(); };
    var gm = v.querySelector("[data-ph-game]"); if (gm) gm.onclick = function () { if (PT.game) PT.game.open(); };
    var cm = v.querySelector("[data-ph-camp]"); if (cm) cm.onclick = function () { if (PT.campaign) PT.campaign.open(); };
    var fm = v.querySelector("[data-ph-formal]"); if (fm) fm.onclick = function () { if (PT.formal) PT.formal.open(); };
    var wk = v.querySelector("[data-ph-weak]"); if (wk) wk.onclick = weak;
  }
  return { render: render };
})();
