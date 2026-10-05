/* miss.js — "สมุดคำผิด" (Mistake Notebook). Auto-collects items answered wrong in
   Quiz/Cards; supports a "review only weak words" filter. ES5. Uses store, esc, keyOf, S, goMode.
   Storage: miss_<deck> = { "<keyOf>": {n:wrongCount, r:rightSinceWrong, t:lastWrongMs} }.
   An item leaves the notebook after 2 consecutive correct answers. */
PT.miss = (function () {
  "use strict";
  var cache = {};
  function skey(d) { return "miss_" + d; }
  function load(d) {
    if (cache[d]) return cache[d];
    var o = {};
    try { o = JSON.parse(store.get(skey(d)) || "{}") || {}; } catch (e) { o = {}; }
    cache[d] = o; return o;
  }
  function save(d) { try { store.set(skey(d), JSON.stringify(cache[d] || {})); } catch (e) {} }

  function add(d, k) {
    if (!d || !k) return;
    var o = load(d), e = o[k] || { n: 0, r: 0, t: 0 };
    e.n++; e.r = 0; e.t = Date.now(); o[k] = e; save(d);
  }
  function right(d, k) {
    if (!d || !k) return;
    var o = load(d); if (!o[k]) return;
    o[k].r = (o[k].r || 0) + 1;
    if (o[k].r >= 2) delete o[k];
    save(d);
  }
  function has(d, k) { return !!load(d)[k]; }
  function keys(d) { var o = load(d), a = [], k; for (k in o) if (o.hasOwnProperty(k)) a.push(k); return a; }
  function count(d) { return keys(d).length; }
  function clear(d) { cache[d] = {}; save(d); }

  function up(el, a, root) { while (el && el !== root) { if (el.getAttribute && el.getAttribute(a) !== null) return el; el = el.parentNode; } return null; }

  function startReview() {
    if (count(S.deck) < 1) return;
    S.filter.groups = {}; S.filter.status = {}; S.filter.pos = {}; S.filter.fav = false;
    S.filter.miss = true; S.workingDirty = true;
    if (window.goMode) goMode("quiz");
  }
  // same filter, but into Cards (real SM-2 flashcard review) instead of Quiz —
  // PT.filters already honors F.miss and PT.cards.buildQueue already consumes
  // PT.filters.apply(), so this is just routing, no new plumbing.
  function startReviewCards() {
    if (count(S.deck) < 1) return;
    S.filter.groups = {}; S.filter.status = {}; S.filter.pos = {}; S.filter.fav = false;
    S.filter.miss = true; S.workingDirty = true; S.session = null;
    if (window.goMode) goMode("cards");
  }

  function draw() {
    var r = document.getElementById("miss-root"); if (!r) return;
    var d = S.deck, ks = keys(d);
    if (!ks.length) {
      r.innerHTML = '<div class="ms-empty">ยังไม่มีคำที่ตอบผิด — เวลาตอบผิดใน Quiz หรือกด "อีกครั้ง" ใน Cards คำนั้นจะถูกเก็บมาที่นี่ เพื่อให้ทบทวนเฉพาะจุดอ่อนได้</div>';
      return;
    }
    var o = load(d), map = {}, i, data = S.data || [];
    for (i = 0; i < data.length; i++) map[keyOf(data[i])] = data[i];
    ks.sort(function (a, b) { return (o[b].n || 0) - (o[a].n || 0); });
    var h = '<div class="ms-top"><span>' + ks.length + ' คำที่ต้องเก็บ</span><div class="ms-btnrow">' +
      '<button class="ms-btn ms-rev" data-msrev="1">▶ ทบทวนจุดอ่อน</button>' +
      '<button class="ms-btn ms-revc" data-msrevc="1">🗂 การ์ด</button></div></div><div class="ms-list">';
    for (i = 0; i < ks.length; i++) {
      var it = map[ks[i]]; if (!it) continue;
      h += '<div class="ms-item"><div class="ms-w"><b>' + esc(it.w || "") + '</b>' +
        (it.mt ? '<span>' + esc(it.mt) + '</span>' : '') + '</div>' +
        '<span class="ms-n">ผิด ' + (o[ks[i]].n || 1) + '×</span></div>';
    }
    h += '</div><button class="ms-btn ms-clear" data-msclear="1">ล้างสมุดคำผิด (คลังนี้)</button>';
    r.innerHTML = h;
  }

  function section() {
    return '<div class="ms-sec"><div class="ms-h">📓 สมุดคำผิด <span id="miss-count"></span></div><div id="miss-root"></div></div>';
  }
  function wire(scope) {
    var r = document.getElementById("miss-root"); if (!r) return;
    var cn = document.getElementById("miss-count"); if (cn) cn.textContent = count(S.deck) ? "(" + count(S.deck) + ")" : "";
    draw();
    r.addEventListener("click", function (e) {
      var t = e.target, el;
      if ((el = up(t, "data-msrev", r))) { startReview(); return; }
      if ((el = up(t, "data-msrevc", r))) { startReviewCards(); return; }
      if ((el = up(t, "data-msclear", r))) {
        if (confirm("ล้างสมุดคำผิดของคลังนี้?")) { clear(S.deck); var c = document.getElementById("miss-count"); if (c) c.textContent = ""; draw(); }
        return;
      }
    });
  }

  return { add: add, right: right, has: has, keys: keys, count: count, clear: clear, section: section, wire: wire, startReview: startReview, startReviewCards: startReviewCards };
})();
