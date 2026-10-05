/* shapes.js — "โครงเสียง" listening drill from book 44. Hear the fast form, decide,
   then reveal the careful form. Own data/shapes.json. ES5.
   Uses globals: esc, speak, speakU, goMode, PT.srs, PT.miss. */
PT.shapes = (function () {
  "use strict";
  var POOL = null, loading = false, host = null, recs = null;
  var part = null, idx = 0, shown = false, auto = false, timer = null;

  function keyS(it) { return (it && it.id ? it.id : "") + "|shape"; }
  function recsLoad() { if (!recs) recs = (PT.srs && PT.srs.load) ? PT.srs.load("shapes") : {}; return recs; }

  function load(cb) {
    if (POOL) { cb(); return; }
    if (loading) return;
    loading = true;
    fetch("data/shapes.json").then(function (r) { return r.json(); })
      .then(function (d) { POOL = d; loading = false; cb(); })
      .catch(function () {
        loading = false;
        if (host) host.innerHTML = '<div class="sh-empty">โหลดไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>';
      });
  }

  function parts() {
    var seen = {}, out = [], i;
    for (i = 0; i < POOL.length; i++) if (!seen[POOL[i].p]) { seen[POOL[i].p] = 1; out.push(POOL[i].p); }
    return out;
  }
  function items() {
    var out = [], i;
    for (i = 0; i < POOL.length; i++) if (POOL[i].p === part) out.push(POOL[i]);
    return out;
  }

  function stopAuto() { auto = false; if (timer) { clearTimeout(timer); timer = null; } }

  function say(t, rate, done) {
    if (typeof speakU === "function") speakU(t, rate, done);
    else { speak(t); if (done) setTimeout(done, 1400); }
  }

  /* fast twice, then the careful form — the same shape the printed book uses */
  function playPair(it, done) {
    say(it.f, 0.95, function () {
      timer = setTimeout(function () {
        say(it.f, 0.95, function () {
          timer = setTimeout(function () {
            shown = true; render(host);
            say(it.s, 0.72, function () { if (done) timer = setTimeout(done, 700); });
          }, 380);
        });
      }, 380);
    });
  }

  function renderHome(v) {
    var ps = parts(), h = ['<div class="sh-wrap">'];
    h.push('<div class="sh-hero">🎧 โครงเสียง — ฟังให้ออกว่าเขาถามอะไร</div>');
    h.push('<div class="sh-note">แต่ละข้อจะพูดเร็ว 2 ครั้ง แล้วค่อยพูดช้า 1 ครั้ง ลองทายก่อนเฉลย</div>');
    for (var i = 0; i < ps.length; i++) {
      var n = 0, j;
      for (j = 0; j < POOL.length; j++) if (POOL[j].p === ps[i]) n++;
      h.push('<button class="sh-card" data-p="' + esc(ps[i]) + '"><div class="sh-c-t">' + esc(ps[i]) +
        '</div><div class="sh-c-d">' + n + ' ประโยค</div></button>');
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    [].forEach.call(v.querySelectorAll("[data-p]"), function (b) {
      b.onclick = function () { part = b.getAttribute("data-p"); idx = 0; shown = false; render(v); };
    });
  }

  function renderDrill(v) {
    var list = items(), it = list[idx];
    if (!it) { part = null; render(v); return; }
    var h = ['<div class="sh-wrap">'];
    h.push('<button class="sh-back" id="sh-back">‹ กลับ</button>');
    h.push('<div class="sh-part">' + esc(part) + '</div>');
    h.push('<div class="sh-prog">' + (idx + 1) + ' / ' + list.length + '</div>');
    h.push('<div class="sh-label">' + esc(it.l) + '</div>');
    h.push('<div class="sh-fast">' + esc(it.f) + '</div>');
    h.push(shown
      ? '<div class="sh-slow">' + esc(it.s) + '</div>'
      : '<button class="sh-reveal" id="sh-reveal">เฉลย</button>');
    h.push('<div class="sh-btns">');
    h.push('<button class="sh-b" id="sh-play">🔊 เร็ว</button>');
    h.push('<button class="sh-b" id="sh-slow">🐢 ช้า</button>');
    h.push('<button class="sh-b" id="sh-auto">' + (auto ? "⏸ หยุด" : "▶ เล่นต่อเนื่อง") + '</button>');
    h.push('</div>');
    h.push('<div class="sh-nav"><button class="sh-b" id="sh-prev">‹ ก่อนหน้า</button>' +
      '<button class="sh-b sh-next" id="sh-next">ถัดไป ›</button></div>');
    h.push('</div>');
    v.innerHTML = h.join("");

    document.getElementById("sh-back").onclick = function () { stopAuto(); part = null; render(v); };
    document.getElementById("sh-play").onclick = function () { say(it.f, 0.95); };
    document.getElementById("sh-slow").onclick = function () { shown = true; render(v); say(it.s, 0.7); };
    var rv = document.getElementById("sh-reveal");
    if (rv) rv.onclick = function () { shown = true; render(v); say(it.s, 0.72); };
    document.getElementById("sh-prev").onclick = function () {
      stopAuto(); idx = Math.max(0, idx - 1); shown = false; render(v);
    };
    document.getElementById("sh-next").onclick = function () {
      stopAuto();
      if (PT.srs && PT.srs.grade) { try { PT.srs.grade(recsLoad(), keyS(it), 3, "shapes"); } catch (e) {} }
      idx = (idx + 1) % list.length; shown = false; render(v);
    };
    document.getElementById("sh-auto").onclick = function () {
      if (auto) { stopAuto(); render(v); return; }
      auto = true; render(v); step();
    };
    if (auto && !shown) { /* autoplay drives itself from step() */ }
  }

  function step() {
    if (!auto) return;
    var list = items(), it = list[idx];
    if (!it) { stopAuto(); return; }
    playPair(it, function () {
      if (!auto) return;
      idx = idx + 1;
      if (idx >= list.length) { idx = 0; stopAuto(); render(host); return; }
      shown = false; render(host); step();
    });
  }

  function render(v) {
    host = v;
    if (!POOL) { v.innerHTML = '<div class="sh-empty">กำลังโหลด…</div>'; load(function () { render(v); }); return; }
    if (!part) renderHome(v); else renderDrill(v);
  }

  function leave() { stopAuto(); try { window.speechSynthesis.cancel(); } catch (e) {} }

  return { render: render, leave: leave };
})();
