/* campaign.js — "โหมดผจญภัย" (PT.campaign): story-driven, multi-session, MULTI-BOOK campaign.
   Book-select → journey map → story beat → encounters (reuse the 16 PT.game games via
   PT.game.play) → rewards → save. Stamina (⚡) refills per real day so it can't be
   finished in one sitting. Hidden mode "campaign" (like PT.structure). ES5.
   Progress is stored PER BOOK (pt_camp.books[id]); XP/stamina/cards are shared across books.
   Uses S, esc, store, goMode, PT.game.play, PT.srs.dayNum, PT.hub.notify, say. */
PT.campaign = (function () {
  "use strict";
  var DATA = null;          // index file (campaign_landing.json): { books:[…], landing:{…} }
  var bookContent = {};      // id -> { title_th, intro_th, chapters:[…] }
  var curBook = null;        // currently selected book id
  var flatBook = null;       // which book `stages` was flattened for
  var stages = [];           // flattened stages of curBook
  var view = "books";        // books | map | stage | result | fail | epilogue | album
  var camp = null;           // persisted state (pt_camp, v2)
  var curStage = -1;
  var lastStars = 0;
  var HP_MAX = 5;

  function V() { return document.getElementById("view"); }
  function lvlOf(xp) { return Math.floor(Math.sqrt((xp || 0) / 40)) + 1; }
  function loadingHtml(msg) { return '<div class="cm-load">' + (msg || "กำลังโหลด…") + '</div>'; }

  /* ---------- state (v2: per-book progress) ---------- */
  function defState() { return { v: 2, cur: "landing", hp: HP_MAX, hpDay: 0, xp: 0, cards: [], books: {} }; }
  function load() {
    try {
      var raw = store.get("pt_camp");
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.v >= 2) return o;
        if (o && o.v === 1) {   // migrate the old single-book state into books.landing
          return { v: 2, cur: o.book || "landing", hp: (o.hp == null ? HP_MAX : o.hp), hpDay: o.hpDay || 0,
            xp: o.xp || 0, cards: o.cards || [], books: { landing: { cleared: o.cleared || 0, stars: o.stars || {}, finished: !!o.finished } } };
        }
      }
    } catch (e) {}
    return defState();
  }
  function save() { try { store.set("pt_camp", JSON.stringify(camp)); } catch (e) {} }
  function bk() { if (!camp.books[curBook]) camp.books[curBook] = { cleared: 0, stars: {}, finished: false }; return camp.books[curBook]; }
  function refillIfNewDay() { var dn = 0; try { dn = PT.srs.dayNum(); } catch (e) {} if (camp.hpDay !== dn) { camp.hp = HP_MAX; camp.hpDay = dn; save(); } }
  function addCard(card) { if (!card || !card.w) return; for (var i = 0; i < camp.cards.length; i++) if (camp.cards[i].w === card.w) return; camp.cards.push({ w: card.w, mt: card.mt || "" }); }

  /* ---------- data loading ---------- */
  function fetchIndex(cb) {
    if (DATA) { cb(); return; }
    fetch("data/campaign_landing.json").then(function (r) { return r.json(); }).then(function (j) { DATA = j; bookContent.landing = j.landing; cb(); }).catch(function () { DATA = null; cb(); });
  }
  function loadBook(id, cb) {
    if (bookContent[id]) { cb(); return; }
    if (id === "landing" && DATA) { bookContent.landing = DATA.landing; cb(); return; }
    fetch("data/campaign_" + id + ".json").then(function (r) { return r.json(); }).then(function (j) { bookContent[id] = j[id] || j; cb(); }).catch(function () { cb(); });
  }
  function flatten() {
    stages = []; flatBook = curBook;
    var bc = bookContent[curBook]; if (!bc) return;
    var chs = bc.chapters || [], ci, si;
    for (ci = 0; ci < chs.length; ci++) {
      var ch = chs[ci];
      for (si = 0; si < ch.stages.length; si++) stages.push({ st: ch.stages[si], chIcon: ch.icon, chTitle: ch.title_th, chNpc: ch.npcFace || "🧑", first: si === 0 });
    }
  }

  /* ---------- render dispatch ---------- */
  function render(v) {
    if (!camp) camp = load();
    if (!DATA) { v.innerHTML = loadingHtml("กำลังโหลดการเดินทาง…"); fetchIndex(function () { if (!DATA) { v.innerHTML = loadingHtml("โหลดข้อมูลไม่สำเร็จ ลองใหม่"); return; } refillIfNewDay(); afterReady(v); }); return; }
    refillIfNewDay(); afterReady(v);
  }
  function afterReady(v) {
    if (view === "books") { renderBooks(v); return; }
    if (!curBook) curBook = camp.cur || "landing";
    if (!bookContent[curBook]) { v.innerHTML = loadingHtml("กำลังโหลดเนื้อเรื่อง…"); loadBook(curBook, function () { if (!bookContent[curBook]) { v.innerHTML = loadingHtml("โหลดเนื้อเรื่องไม่สำเร็จ"); return; } flatten(); paint(v); }); return; }
    if (flatBook !== curBook) flatten();
    paint(v);
  }
  function paint(v) {
    if (view === "map") return renderMap(v);
    if (view === "stage") return renderStage(v);
    if (view === "result") return renderResult(v);
    if (view === "fail") return renderFail(v);
    if (view === "epilogue") return renderEpilogue(v);
    if (view === "album") return renderAlbum(v);
    return renderBooks(v);
  }

  /* ---------- book select ---------- */
  function renderBooks(v) {
    var books = (DATA && DATA.books) || [], h = ['<div class="cm-wrap">'];
    h.push('<div class="cm-hero">🗺️ โหมดผจญภัย</div>');
    h.push('<div class="cm-hero-sub">เลือกเรื่องราวที่จะออกเดินทาง — เล่นข้ามวันได้ เก็บดาว เก็บคำศัพท์ ไปให้ถึงตอนจบ</div>');
    for (var i = 0; i < books.length; i++) {
      var b = books[i], lock = b.locked, prog = camp.books[b.id];
      var badge = lock ? '<span class="cm-soon">เร็วๆ นี้</span>' : (prog && prog.finished ? '<span class="cm-go">✓ จบแล้ว · เล่นซ้ำได้ ›</span>' : (prog && prog.cleared > 0 ? '<span class="cm-go">เล่นต่อ ›</span>' : '<span class="cm-go">ออกเดินทาง ›</span>'));
      h.push('<button class="cm-book' + (lock ? ' cm-book-lock' : '') + '" data-book="' + esc(b.id) + '" data-lock="' + (lock ? 1 : 0) + '">' +
        '<span class="cm-book-ic">' + b.icon + '</span>' +
        '<span class="cm-book-txt"><b>' + esc(b.title_th) + (lock ? ' 🔒' : '') + '</b><em>' + esc(b.sub_th) + '</em>' + badge + '</span></button>');
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    [].forEach.call(v.querySelectorAll("[data-book]"), function (b) {
      b.onclick = function () { if (b.getAttribute("data-lock") === "1") return; selectBook(b.getAttribute("data-book")); };
    });
  }
  function selectBook(id) {
    curBook = id; camp.cur = id; if (!camp.books[id]) camp.books[id] = { cleared: 0, stars: {}, finished: false }; save();
    var v = V(); v.innerHTML = loadingHtml("กำลังโหลดเนื้อเรื่อง…");
    loadBook(id, function () { if (!bookContent[id]) { v.innerHTML = loadingHtml("โหลดเนื้อเรื่องไม่สำเร็จ ลองใหม่"); return; } flatten(); view = "map"; paint(v); });
  }

  /* ---------- journey map ---------- */
  function renderMap(v) {
    var bc = bookContent[curBook], b = bk(), lvl = lvlOf(camp.xp);
    var h = ['<div class="cm-wrap">'];
    h.push('<div class="cm-top"><button class="cm-back" data-cm-books="1">‹ เปลี่ยนเล่ม</button>' +
      '<div class="cm-stats"><span class="cm-hp">' + hpStr() + '</span><span class="cm-xp">⭐ Lv.' + lvl + '</span></div></div>');
    h.push('<div class="cm-title">' + esc(bookIcon()) + ' ' + esc(bc.title_th) + '</div>');
    h.push('<div class="cm-xpbar"><div class="cm-xpfill" style="width:' + xpPct(camp.xp) + '%"></div></div>');
    h.push('<div class="cm-xpnote">XP ' + camp.xp + ' · 📇 การ์ดคำ ' + camp.cards.length + (camp.cards.length ? ' <button class="cm-albtn" data-cm-alb="1">ดู</button>' : '') + '</div>');
    h.push('<div class="cm-hero-row">' + toonChar(heroFace()) + '<div class="cm-hero-txt"><b>นักผจญภัย · Lv.' + lvl + '</b><em>ผ่านแล้ว ' + b.cleared + '/' + stages.length + ' ด่าน</em></div></div>');
    var chs = bc.chapters, gi = 0;
    for (var ci = 0; ci < chs.length; ci++) {
      var ch = chs[ci];
      h.push('<div class="cm-chap"><span class="cm-chap-ic">' + ch.icon + '</span> บทที่ ' + (ci + 1) + ' · ' + esc(ch.title_th) + '</div>');
      h.push('<div class="cm-path">');
      for (var si = 0; si < ch.stages.length; si++) {
        var st = ch.stages[si], state = gi < b.cleared ? "done" : (gi === b.cleared ? "cur" : "lock");
        var stars = b.stars[st.id] || 0, boss = st.boss;
        var badge = state === "done" ? starStr(stars) : (state === "cur" ? '<span class="cm-walker">' + heroFace() + '</span>' : "🔒");
        h.push('<button class="cm-node cm-' + state + (boss ? ' cm-boss' : '') + '" data-node="' + gi + '" data-state="' + state + '">' +
          '<span class="cm-node-b">' + badge + '</span><span class="cm-node-t">' + (boss ? '👑 ' : '') + esc(st.title_th) + '</span></button>');
        gi++;
      }
      h.push('</div>');
    }
    if (b.finished) h.push('<div class="cm-fin">🎉 จบเล่มนี้แล้ว! ลองเล่มอื่นได้เลย</div>');
    h.push('</div>');
    v.innerHTML = h.join("");
    v.querySelector("[data-cm-books]").onclick = function () { view = "books"; paint(V()); };
    var alb = v.querySelector("[data-cm-alb]"); if (alb) alb.onclick = function () { view = "album"; paint(V()); };
    [].forEach.call(v.querySelectorAll("[data-node]"), function (bt) {
      bt.onclick = function () { if (bt.getAttribute("data-state") === "lock") return; curStage = parseInt(bt.getAttribute("data-node"), 10); camp._tries = 0; view = "stage"; paint(V()); };
    });
  }
  function bookIcon() { var bs = (DATA && DATA.books) || []; for (var i = 0; i < bs.length; i++) if (bs[i].id === curBook) return bs[i].icon; return "🗺️"; }
  function heroFace() { var bs = (DATA && DATA.books) || []; for (var i = 0; i < bs.length; i++) if (bs[i].id === curBook) return bs[i].hero || "🧑"; return "🧑"; }
  function toonChar(face, cls) { return (window.PT && PT.toon) ? PT.toon.char(face, cls) : ('<div class="toon"><div class="toon-face">' + face + '</div></div>'); }
  function hpStr() { var s = ""; for (var i = 0; i < HP_MAX; i++) s += (i < camp.hp ? "⚡" : "·"); return s; }
  function starStr(n) { var s = ""; for (var i = 0; i < 3; i++) s += (i < n ? "⭐" : "☆"); return s; }
  function xpPct(xp) { var l = lvlOf(xp), base = (l - 1) * (l - 1) * 40, next = l * l * 40; return Math.round((xp - base) / (next - base) * 100); }

  /* ---------- stage intro ---------- */
  function renderStage(v) {
    var S0 = stages[curStage], st = S0.st, beat = st.beat || {};
    var h = ['<div class="cm-wrap">'];
    h.push('<div class="cm-top"><button class="cm-back" data-cm-map="1">‹ แผนที่</button><div class="cm-stats"><span class="cm-hp">' + hpStr() + '</span></div></div>');
    h.push('<div class="cm-stage-hd">' + (st.boss ? '👑 ' : '') + esc(S0.chIcon) + ' ' + esc(st.title_th) + '</div>');
    if (beat.narrator_th) h.push('<div class="cm-narr">' + esc(beat.narrator_th) + '</div>');
    if (beat.npc) {
      var face = beat.npc.face || S0.chNpc || "🧑";
      h.push('<div class="cm-scene">' + toonChar(face, "toon-in cm-npc-toon") +
        '<div class="toon-bubble"><div class="toon-bubble-en">' + esc(beat.npc.en) + '</div><div class="toon-bubble-th">' + esc(beat.npc.th) + '</div></div></div>');
    }
    h.push('<div class="cm-enc-list">');
    for (var i = 0; i < st.encounters.length; i++) h.push('<div class="cm-enc"><span class="cm-enc-n">' + (i + 1) + '</span>' + esc(st.encounters[i].label_th || st.encounters[i].game) + '</div>');
    h.push('</div>');
    if (camp.hp < 1) h.push('<div class="cm-nohp">⚡ พลังงานหมดแล้ว — กลับมาเล่นต่อพรุ่งนี้ พลังงานจะเต็มใหม่</div>');
    else h.push('<button class="cm-start" data-cm-start="1">▶ เริ่มด่าน (ใช้ 1 ⚡ · ผ่านได้คืน)</button>');
    h.push('<button class="cm-back2" data-cm-map="1">‹ กลับแผนที่</button></div>');
    v.innerHTML = h.join("");
    [].forEach.call(v.querySelectorAll("[data-cm-map]"), function (b) { b.onclick = function () { view = "map"; paint(V()); }; });
    var sb = v.querySelector("[data-cm-start]"); if (sb) sb.onclick = beginPlay;
    if (beat.npc) {
      try { say(beat.npc.en); } catch (e) {}
      var nt = v.querySelector(".cm-npc-toon");
      if (nt) { nt.className += " toon-talk"; setTimeout(function () { if (nt) nt.className = nt.className.replace(/ toon-talk/, ""); }, 2100); }
    }
  }

  /* ---------- play encounters ---------- */
  function beginPlay() {
    refillIfNewDay();
    if (camp.hp < 1) { view = "stage"; paint(V()); return; }
    camp.hp -= 1; camp._tries = (camp._tries || 0) + 1; save();
    runEnc(0);
  }
  function runEnc(i) {
    var st = stages[curStage].st;
    if (i >= st.encounters.length) { stageWin(); return; }
    var e = st.encounters[i], p = e.pass || {};
    PT.game.play(e.game, { minScore: p.minScore || 1, oneScene: !!p.oneScene, filter: e.filter || null }, function (res) {
      if (!res || res.aborted) { view = "stage"; paint(V()); return; }
      if (res.missing) { runEnc(i + 1); return; }
      if (res.passed) runEnc(i + 1); else stageFail();
    });
  }
  function stageWin() {
    var st = stages[curStage].st, b = bk();
    camp.hp = Math.min(HP_MAX, camp.hp + 1);
    var stars = Math.max(1, Math.min(3, 4 - (camp._tries || 1)));
    lastStars = stars;
    if (!b.stars[st.id] || b.stars[st.id] < stars) b.stars[st.id] = stars;
    var firstClear = (curStage === b.cleared);
    if (firstClear) {
      b.cleared++;
      camp.xp += (st.reward && st.reward.xp) || 30;
      if (st.reward) addCard(st.reward.card);
      if (b.cleared >= stages.length) b.finished = true;
    }
    save();
    try { if (PT.hub && PT.hub.notify) PT.hub.notify("game"); } catch (e) {}
    view = (firstClear && b.finished) ? "epilogue" : "result";
    paint(V());
  }
  function stageFail() { save(); view = "fail"; paint(V()); }

  /* ---------- result / fail / epilogue / album ---------- */
  function renderResult(v) {
    var st = stages[curStage].st, r = st.reward || {};
    var h = ['<div class="cm-wrap cm-center">'];
    h.push('<div class="cm-res-hero">' + toonChar(heroFace(), "toon-win") + '</div>');
    h.push('<div class="cm-res-star">' + starStr(lastStars) + '</div><div class="cm-res-hd">ผ่านด่าน!</div>');
    h.push('<div class="cm-res-xp">+' + ((r.xp) || 0) + ' XP</div>');
    if (r.card) h.push('<div class="cm-res-card">📇 ได้การ์ดคำใหม่: <b>' + esc(r.card.w) + '</b> — ' + esc(r.card.mt || '') + ' <button class="cm-say" data-say="' + esc(r.card.w) + '">🔊</button></div>');
    if (r.story_after_th) h.push('<div class="cm-res-story">' + esc(r.story_after_th) + '</div>');
    h.push('<button class="cm-start" data-cm-next="1">▶ เดินทางต่อ</button></div>');
    v.innerHTML = h.join("");
    v.querySelector("[data-cm-next]").onclick = function () { view = "map"; paint(V()); };
    wireSay(v);
    try { if (PT.toon) PT.toon.confetti(lastStars >= 3 ? 42 : 26); } catch (e) {}
  }
  function renderFail(v) {
    var h = ['<div class="cm-wrap cm-center">'];
    h.push('<div class="cm-res-hero">' + toonChar(heroFace(), "toon-sad") + '</div><div class="cm-res-hd">ยังไม่ผ่าน</div>');
    h.push('<div class="cm-fail-sub">เสียไป 1 ⚡ · เหลือ ' + hpStr() + '</div>');
    if (camp.hp >= 1) h.push('<button class="cm-start" data-cm-retry="1">🔁 ลองอีกครั้ง (1 ⚡)</button>');
    else h.push('<div class="cm-nohp">⚡ หมดแล้ว — พักก่อน พรุ่งนี้พลังงานเต็มใหม่</div>');
    h.push('<button class="cm-back2" data-cm-map="1">‹ กลับแผนที่</button></div>');
    v.innerHTML = h.join("");
    var rt = v.querySelector("[data-cm-retry]"); if (rt) rt.onclick = beginPlay;
    v.querySelector("[data-cm-map]").onclick = function () { view = "map"; paint(V()); };
  }
  function renderEpilogue(v) {
    var st = stages[curStage].st, r = st.reward || {};
    var h = ['<div class="cm-wrap cm-center">'];
    h.push('<div class="cm-res-hero">' + toonChar(heroFace(), "toon-win") + '</div><div class="cm-epi-ic">🎉</div><div class="cm-res-hd">จบเล่มแล้ว!</div>');
    if (r.story_after_th) h.push('<div class="cm-res-story">' + esc(r.story_after_th) + '</div>');
    h.push('<div class="cm-epi-note">คุณเก็บได้ 📇 ' + camp.cards.length + ' การ์ดคำ · ⭐ Lv.' + lvlOf(camp.xp) + ' · ลองเล่มอื่นต่อได้เลย</div>');
    h.push('<button class="cm-start" data-cm-books="1">▶ เลือกเล่มถัดไป</button>');
    h.push('<button class="cm-back2" data-cm-map="1">‹ กลับแผนที่</button></div>');
    v.innerHTML = h.join("");
    var bb = v.querySelector("[data-cm-books]"); if (bb) bb.onclick = function () { view = "books"; paint(V()); };
    v.querySelector("[data-cm-map]").onclick = function () { view = "map"; paint(V()); };
    try { if (PT.toon) { PT.toon.confetti(50); setTimeout(function () { try { PT.toon.confetti(40); } catch (e) {} }, 700); } } catch (e) {}
  }
  function renderAlbum(v) {
    var h = ['<div class="cm-wrap">'];
    h.push('<div class="cm-top"><button class="cm-back" data-cm-map="1">‹ แผนที่</button></div>');
    h.push('<div class="cm-title">📇 การ์ดคำที่สะสม (' + camp.cards.length + ')</div><div class="cm-alb">');
    for (var i = 0; i < camp.cards.length; i++) h.push('<button class="cm-alb-card" data-say="' + esc(camp.cards[i].w) + '"><b>' + esc(camp.cards[i].w) + '</b><em>' + esc(camp.cards[i].mt) + '</em></button>');
    if (!camp.cards.length) h.push('<div class="cm-narr">ยังไม่มีการ์ด — ผ่านด่านเพื่อเก็บสะสม</div>');
    h.push('</div></div>');
    v.innerHTML = h.join("");
    v.querySelector("[data-cm-map]").onclick = function () { view = "map"; paint(V()); };
    wireSay(v);
  }
  function wireSay(v) { [].forEach.call(v.querySelectorAll("[data-say]"), function (b) { b.onclick = function () { try { say(b.getAttribute("data-say")); } catch (e) {} }; }); }

  return {
    render: render,
    open: function () { if (!camp) camp = load(); curBook = camp.cur || "landing"; var b = camp.books && camp.books[curBook]; view = (b && b.cleared > 0) ? "map" : "books"; goMode("campaign"); },
    leave: function () { try { PT.game.leave(); } catch (e) {} }
  };
})();
