/* fix.js — "หาที่ผิด" error-correction game. Self-contained mini-game inside the Quiz tab
   (own data/fix.json + progress srs3_fix + PT.miss "fix"). Tap the wrong word -> reveal fix +
   Thai explanation. ES5. Uses globals: esc, speak, PT.srs, PT.miss. */
PT.fix = (function () {
  "use strict";
  var POOL = null, loading = false, host = null, recs = null;
  var cur = null, toks = [], errIdx = -1, picked = -1, checked = false;
  var right = 0, total = 0;

  function keyF(it) { return (it && it.s ? it.s : "") + "|fix"; }
  function recsLoad() { if (!recs) recs = (PT.srs && PT.srs.load) ? PT.srs.load("fix") : {}; return recs; }
  function clean(t) { return String(t).replace(/^[^A-Za-z']+/, "").replace(/[^A-Za-z']+$/, ""); }

  function load(cb) {
    if (POOL) { cb(); return; }
    if (loading) return;
    loading = true;
    fetch("data/fix.json").then(function (r) { return r.json(); }).then(function (d) { POOL = d; loading = false; cb(); })
      .catch(function () { loading = false; if (host) host.innerHTML = '<div class="qz-empty">โหลดเกมไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>'; });
  }

  function findErr(item) {
    var tk = String(item.s).split(/\s+/), i;
    for (i = 0; i < tk.length; i++) if (clean(tk[i]) === item.wrong) return { toks: tk, idx: i };
    // fallback: case-insensitive
    for (i = 0; i < tk.length; i++) if (clean(tk[i]).toLowerCase() === String(item.wrong).toLowerCase()) return { toks: tk, idx: i };
    return { toks: tk, idx: -1 };
  }

  function pick() {
    if (!POOL || !POOL.length) { cur = null; return; }
    var now = Date.now(), r = recsLoad(), cands = [], i;
    for (i = 0; i < POOL.length; i++) {
      var st = (PT.srs && PT.srs.statusOf) ? PT.srs.statusOf(r[keyF(POOL[i])], now) : "new";
      if (st !== "known") cands.push(POOL[i]);
    }
    if (!cands.length) cands = POOL.slice();
    // pick one whose error word is locatable
    var tries = 0, chosen = null, fe = null;
    while (tries < 25) {
      var c = cands[Math.floor(Math.random() * cands.length)];
      if (cur && c === cur && cands.length > 1) { tries++; continue; }
      fe = findErr(c);
      if (fe.idx >= 0) { chosen = c; break; }
      tries++;
    }
    if (!chosen) { chosen = cands[0]; fe = findErr(chosen); }
    cur = chosen; toks = fe.toks; errIdx = fe.idx; picked = -1; checked = false;
  }

  function correctedSentence() {
    // replace the wrong token (keep its surrounding punctuation) with the fix
    var out = toks.slice(), t = toks[errIdx];
    var pre = t.match(/^[^A-Za-z']+/); pre = pre ? pre[0] : "";
    var suf = t.match(/[^A-Za-z']+$/); suf = suf ? suf[0] : "";
    out[errIdx] = pre + cur.fix + suf;
    return out.join(" ");
  }

  function draw() {
    if (!host) return;
    if (!cur) { host.innerHTML = '<div class="qz-empty">ยังไม่มีข้อมูลเกม</div>'; return; }
    var h = "", i;
    h += '<div class="fx-score">ถูก ' + right + ' / ' + total + (cur.lvl ? ' · ' + esc(cur.lvl) : '') + '</div>';
    h += '<div class="fx-instr">' + (checked ? 'เฉลย' : 'แตะคำที่ผิดในประโยค') + '</div>';
    h += '<div class="qz-card fx-card"><div class="fx-sent">';
    for (i = 0; i < toks.length; i++) {
      var cls = "fx-tok";
      if (checked) {
        if (i === errIdx) cls += " fx-err";
        else if (i === picked) cls += " fx-wrongpick";
      }
      h += '<button type="button" class="' + cls + '" data-fx-tok="' + i + '"' + (checked ? ' disabled' : '') + '>' + esc(toks[i]) + '</button> ';
    }
    h += '</div></div>';
    if (checked) {
      var ok = (picked === errIdx);
      h += '<div class="fx-verdict ' + (ok ? 'fx-v-ok' : 'fx-v-no') + '">' + (ok ? '✓ ถูกต้อง! เจอที่ผิดแล้ว' : '✗ ยังไม่ใช่ — คำที่ผิดคือคำที่ไฮไลต์') + '</div>';
      h += '<div class="fx-fixbox"><span class="fx-x">' + esc(cur.wrong) + '</span> <span class="fx-arrow">→</span> <span class="fx-fix">' + esc(cur.fix) + '</span></div>';
      h += '<div class="fx-type-wrap"><span class="fx-type">' + esc(cur.type_th || "") + '</span></div>';
      if (cur.why_th) h += '<div class="fx-why">' + esc(cur.why_th) + '</div>';
      h += '<div class="fx-corrected">✓ ' + esc(correctedSentence()) + ' <button type="button" class="qz-say" data-fx-say="1" aria-label="ฟัง">🔊</button>' + '<button type="button" class="qz-say" data-slow="' + esc(correctedSentence()) + '" aria-label="อ่านช้า">🐢</button></div>';
      h += '<button type="button" class="fx-next" data-fx-next="1">ถัดไป ▶</button>';
    }
    host.innerHTML = h;
    wire();
  }

  function tap(i) {
    if (checked) return;
    picked = i; checked = true;
    var ok = (picked === errIdx);
    total++; if (ok) right++;
    try {
      var r = recsLoad(), k = keyF(cur), rec = r[k] || (PT.srs ? PT.srs.newRecord() : null);
      if (PT.srs) { var res = PT.srs.grade(rec, ok ? 2 : 0, Date.now()); r[k] = res.rec; PT.srs.save("fix", r); }
      if (PT.miss) { if (ok) PT.miss.right("fix", k); else PT.miss.add("fix", k); }
      try { if (PT.hub && PT.hub.bumpStep) PT.hub.bumpStep("game", 3); } catch (e) {}  // Today Hub game slot
    } catch (e) {}
    draw();
  }

  function wire() {
    if (!host) return;
    var i, tk = host.querySelectorAll("[data-fx-tok]");
    for (i = 0; i < tk.length; i++) (function (b) { b.onclick = function () { tap(parseInt(b.getAttribute("data-fx-tok"), 10)); }; })(tk[i]);
    var nx = host.querySelector("[data-fx-next]"); if (nx) nx.onclick = function () { pick(); draw(); };
    var say = host.querySelector("[data-fx-say]"); if (say) say.onclick = function () { try { speak(correctedSentence()); } catch (e) {} };
  }

  function mount(hostEl) {
    host = hostEl; if (!host) return;
    if (!POOL) { host.innerHTML = '<div class="qz-empty">กำลังโหลด…</div>'; load(function () { pick(); draw(); }); return; }
    if (!cur) pick();
    draw();
  }

  return { mount: mount };
})();
