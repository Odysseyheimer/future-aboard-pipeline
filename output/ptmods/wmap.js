/* wmap.js — "แผนที่คำ" word-connections map, rendered inside the detail bottom sheet.
   Shows synonyms / antonyms / word family / frequent collocations for a word; tapping a
   related word recenters the map on it (looked up in the Oxford deck). ES5.
   Uses globals: esc, speak, S, DECKS, PT.browse.openSheet/closeSheet. */
PT.wmap = (function () {
  "use strict";
  var oxford = null, colloc = null, wIdx = null, loading = false;
  var hist = [];   // stack of {item, deck}

  function loadAll(cb) {
    if (oxford && colloc) { cb(); return; }
    if (loading) return;
    loading = true;
    var left = 2;
    function one() { left--; if (left <= 0) { loading = false; buildIdx(); cb(); } }
    if (oxford) one(); else fetch("data/oxford.json").then(function (r) { return r.json(); }).then(function (d) { oxford = d; one(); }).catch(function () { oxford = []; one(); });
    if (colloc) one(); else fetch("data/colloc.json").then(function (r) { return r.json(); }).then(function (d) { colloc = d; one(); }).catch(function () { colloc = []; one(); });
  }
  function buildIdx() {
    wIdx = {};
    var i; for (i = 0; i < (oxford || []).length; i++) {
      var k = String(oxford[i].w || "").toLowerCase();
      if (k && !wIdx[k]) wIdx[k] = oxford[i];
    }
  }
  function findWord(w) {
    if (!wIdx) return null;
    var k = String(w || "").toLowerCase().replace(/^\s+|\s+$/g, "");
    if (wIdx[k]) return wIdx[k];
    // light stemming fallbacks
    if (k.length > 4 && wIdx[k.replace(/ies$/, "y")]) return wIdx[k.replace(/ies$/, "y")];
    if (k.length > 3 && wIdx[k.replace(/e?s$/, "")]) return wIdx[k.replace(/e?s$/, "")];
    if (k.length > 4 && wIdx[k.replace(/ed$/, "")]) return wIdx[k.replace(/ed$/, "")];
    if (k.length > 5 && wIdx[k.replace(/ing$/, "")]) return wIdx[k.replace(/ing$/, "")];
    return null;
  }
  function collocsFor(w) {
    var out = [], i, needle = String(w || "").toLowerCase();
    if (!needle || needle.indexOf(" ") >= 0) return out;   // single words only
    var re = new RegExp("(^|[^a-z])" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)", "i");
    for (i = 0; i < (colloc || []).length && out.length < 6; i++) {
      var c = colloc[i];
      if (c.w && re.test(String(c.w))) out.push(c);
    }
    return out;
  }
  function splitList(s) {
    if (!s) return [];
    var parts = String(s).split(/[,;·|]/), out = [], i;
    for (i = 0; i < parts.length; i++) { var t = parts[i].replace(/^\s+|\s+$/g, ""); if (t) out.push(t); }
    return out;
  }

  function chipRow(title, cls, words, navigable) {
    if (!words || !words.length) return "";
    var h = '<div class="wm-sec"><div class="wm-sec-h ' + cls + '">' + title + '</div><div class="wm-chips">';
    var i; for (i = 0; i < words.length; i++) {
      h += '<button type="button" class="wm-chip ' + cls + '" data-wm-word="' + esc(words[i]) + '" data-wm-nav="' + (navigable ? "1" : "0") + '">' + esc(words[i]) + '</button>';
    }
    return h + '</div></div>';
  }

  function draw() {
    var sheet = document.getElementById("sheet");
    if (!sheet || !hist.length) return;
    var top = hist[hist.length - 1], item = top.item;
    var h = ['<div class="pg-sheet wm-wrap">'];
    h.push('<button class="pg-close" type="button" aria-label="Close">✕</button>');
    h.push('<div class="wm-bar"><button type="button" class="wm-back">‹ กลับ</button><div class="wm-title">🗺️ แผนที่คำ</div></div>');
    h.push('<div class="wm-center wm-pop"><div class="wm-word">' + esc(item.w || "") +
      ' <button type="button" class="pg-spk wm-say" data-say="' + esc(item.w || "") + '">🔊</button>' +
      '<button type="button" class="pg-spk" data-spell="' + esc(item.w || "") + '">🔤</button></div>');
    if (item.p) h.push('<div class="wm-pos">' + esc(item.p) + '</div>');
    if (item.mt || item.me) h.push('<div class="wm-mean">' + esc(item.mt || item.me) + '</div>');
    h.push('</div>');
    h.push('<div class="wm-msg" id="wm-msg"></div>');

    if (!oxford) {
      h.push('<div class="wm-loading">กำลังโหลดข้อมูลคำ…</div></div>');
      sheet.innerHTML = h.join("");
      wire(sheet);
      return;
    }

    var sy = (item.sy && item.sy.length) ? item.sy.slice(0, 10) : [];
    var an = (item.an && item.an.length) ? item.an.slice(0, 8) : [];
    var fam = splitList(item.x).slice(0, 8);
    var cols = collocsFor(item.w);

    h.push(chipRow("🟢 คำเหมือน (synonyms)", "wm-sy", sy, true));
    h.push(chipRow("🔴 คำตรงข้าม (antonyms)", "wm-an", an, true));
    h.push(chipRow("🧬 ครอบครัวคำ (word family)", "wm-fam", fam, true));
    if (cols.length) {
      h.push('<div class="wm-sec"><div class="wm-sec-h wm-col">🧩 ใช้คู่กันบ่อย (collocations)</div><div class="wm-chips">');
      var i; for (i = 0; i < cols.length; i++) {
        h.push('<button type="button" class="wm-chip wm-col" data-wm-say="' + esc(cols[i].w) + '">' + esc(cols[i].w) +
          (cols[i].mt ? '<span>' + esc(cols[i].mt) + '</span>' : '') + '</button>');
      }
      h.push('</div></div>');
    }
    if (!sy.length && !an.length && !fam.length && !cols.length) {
      h.push('<div class="wm-empty">คำนี้ยังไม่มีข้อมูลเชื่อมโยง (คำเหมือน/ตรงข้าม/collocation)</div>');
    }
    h.push('<div class="wm-hint">แตะคำเพื่อเปิดแผนที่ของคำนั้น · แตะวลีเพื่อฟัง</div>');
    h.push('</div>');
    sheet.innerHTML = h.join("");
    sheet.scrollTop = 0;   // recentered content appears at the top — always show it
    wire(sheet);
  }

  function wire(sheet) {
    var close = sheet.querySelector(".pg-close");
    if (close) close.onclick = function () { hist = []; if (PT.browse && PT.browse.closeSheet) PT.browse.closeSheet(); };
    var back = sheet.querySelector(".wm-back");
    if (back) back.onclick = function () {
      if (hist.length > 1) { hist.pop(); draw(); }
      else { var h0 = hist[0]; hist = []; if (PT.browse && PT.browse.openSheet) PT.browse.openSheet(h0.item, h0.deck); }
    };
    var say = sheet.querySelector(".wm-say");
    if (say) say.onclick = function () { speak(say.getAttribute("data-say") || ""); };
    var chips = sheet.querySelectorAll("[data-wm-word]");
    var i;
    for (i = 0; i < chips.length; i++) (function (b) {
      b.onclick = function () {
        var w = b.getAttribute("data-wm-word") || "";
        speak(w);
        var it = findWord(w);
        if (it) { hist.push({ item: it, deck: "oxford" }); draw(); }
        else {
          var m = document.getElementById("wm-msg");
          if (m) m.textContent = '🔊 "' + w + '" — คำนี้ไม่อยู่ในคลัง Oxford จึงเปิดแผนที่ต่อไม่ได้ (ฟังเสียงได้)';
          try { sheet.scrollTop = 0; } catch (e) {}
        }
      };
    })(chips[i]);
    var says = sheet.querySelectorAll("[data-wm-say]");
    for (i = 0; i < says.length; i++) (function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-wm-say") || "";
        speak(t);
        var m = document.getElementById("wm-msg");
        if (m) m.textContent = '🔊 กำลังอ่าน: "' + t + '"';
      };
    })(says[i]);
  }

  function openFor(item, deckKey) {
    hist = [{ item: item, deck: deckKey || S.deck }];
    draw();                    // instant frame (may show loading)
    loadAll(function () { draw(); });
  }

  return { openFor: openFor };
})();
