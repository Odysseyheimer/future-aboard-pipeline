/* bank.js — "เติมประโยค" multi-blank word-bank game. Self-contained mini-game rendered
   inside the Quiz tab (own data/bank.json + own progress srs3_bank + PT.miss "bank"). ES5.
   Uses globals: esc, speak, store, PT.srs, PT.miss. */
PT.bank = (function () {
  "use strict";
  var POOL = null, loading = false, host = null, recs = null;
  var cur = null, tiles = [], filled = [], active = 0, checked = false;
  var right = 0, total = 0;

  function norm(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "").toLowerCase(); }
  function keyB(it) { return (it && it.w ? it.w : "") + "|bank"; }
  function recsLoad() { if (!recs) recs = (PT.srs && PT.srs.load) ? PT.srs.load("bank") : {}; return recs; }

  function shuffle(a) { var i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function load(cb) {
    if (POOL) { cb(); return; }
    if (loading) return;
    loading = true;
    fetch("data/bank.json").then(function (r) { return r.json(); }).then(function (d) { POOL = d; loading = false; cb(); })
      .catch(function () { loading = false; if (host) host.innerHTML = '<div class="qz-empty">โหลดเกมไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>'; });
  }

  function pick() {
    if (!POOL || !POOL.length) { cur = null; return; }
    var now = Date.now(), r = recsLoad(), cands = [], i;
    for (i = 0; i < POOL.length; i++) {
      var st = (PT.srs && PT.srs.statusOf) ? PT.srs.statusOf(r[keyB(POOL[i])], now) : "new";
      if (st !== "known") cands.push(POOL[i]);
    }
    if (!cands.length) cands = POOL.slice();
    var chosen = cands[Math.floor(Math.random() * cands.length)];
    if (cur && chosen === cur && cands.length > 1) chosen = cands[(cands.indexOf(chosen) + 1) % cands.length];
    cur = chosen;
    var n = (cur.a || []).length;
    filled = []; for (i = 0; i < n; i++) filled.push(-1);
    active = 0; checked = false;
    tiles = []; for (i = 0; i < (cur.bank || []).length; i++) tiles.push({ w: cur.bank[i], used: false });
    shuffle(tiles);
  }

  function cap(w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }

  function sentHtml() {
    var parts = String(cur.w).split("___");
    var h = '<div class="qz-card bk-card"><div class="bk-sent">';
    var bi = 0, i;
    for (i = 0; i < parts.length; i++) {
      h += esc(parts[i]);
      if (i < parts.length - 1) {
        var atStart = (bi === 0 && /^\s*$/.test(parts[0]));
        var fi = filled[bi], word = (fi >= 0) ? tiles[fi].w : "";
        var disp = word ? (atStart ? cap(word) : word) : ("ช่อง " + (bi + 1));
        var cls = "bk-blank" + (word ? " bk-filled" : "") + ((active === bi && !checked) ? " bk-active" : "");
        if (checked) cls += (norm(word) === norm(cur.a[bi]) ? " bk-ok" : " bk-bad");
        h += '<button type="button" class="' + cls + '" data-bk-blank="' + bi + '" aria-label="ช่องที่ ' + (bi + 1) + '">' + esc(disp) + '</button>';
        if (checked && norm(word) !== norm(cur.a[bi])) h += '<span class="bk-corr">' + esc(cur.a[bi]) + '</span>';
        bi++;
      }
    }
    h += '</div>';
    if (cur.mt) h += '<div class="bk-th">' + esc(cur.mt) + '</div>';
    if (cur.hint && !checked) h += '<div class="bk-hint">💡 ' + esc(cur.hint) + '</div>';
    h += '</div>';
    return h;
  }

  function bankHtml() {
    var h = '<div class="bk-bank">', i;
    for (i = 0; i < tiles.length; i++) {
      var t = tiles[i], cls = "bk-tile" + (t.used ? " is-used" : "");
      h += '<button type="button" class="' + cls + '" data-bk-tile="' + i + '"' + ((t.used || checked) ? ' disabled' : '') +
        ' aria-pressed="' + (t.used ? "true" : "false") + '">' + esc(t.w) + '</button>';
    }
    return h + '</div>';
  }

  function draw() {
    if (!host) return;
    if (!cur) { host.innerHTML = '<div class="qz-empty">ยังไม่มีข้อมูลเกม</div>'; return; }
    var h = "", i, allFilled = true;
    for (i = 0; i < filled.length; i++) if (filled[i] < 0) allFilled = false;
    h += '<div class="bk-score">ถูก ' + right + ' / ' + total + (cur.lvl ? ' · ' + esc(cur.lvl) : '') + '</div>';
    h += '<div class="bk-instr">แตะช่องว่าง แล้วแตะคำจากคลังด้านล่างเพื่อเติม</div>';
    h += sentHtml();
    h += bankHtml();
    if (!checked) {
      h += '<div class="bk-actions"><button type="button" class="bk-clear" data-bk-clear="1">ล้าง</button>' +
        '<button type="button" class="bk-check" data-bk-check="1"' + (allFilled ? '' : ' disabled') + '>ตรวจคำตอบ</button></div>';
    } else {
      var sc = 0; for (i = 0; i < cur.a.length; i++) if (norm(filled[i] >= 0 ? tiles[filled[i]].w : "") === norm(cur.a[i])) sc++;
      var full = String(cur.w); for (i = 0; i < cur.a.length; i++) full = full.replace("___", cur.a[i]);
      h += '<div class="bk-result">' + sc + ' / ' + cur.a.length + ' ถูก <button type="button" class="qz-say" data-slow="' + esc(full) + '" aria-label="อ่านช้า">🐢</button></div>';
      h += '<button type="button" class="bk-next" data-bk-next="1">ถัดไป ▶</button>';
    }
    host.innerHTML = h;
    wire();
  }

  function fillActive(ti) {
    if (checked || tiles[ti].used) return;
    if (filled[active] >= 0) tiles[filled[active]].used = false;
    filled[active] = ti; tiles[ti].used = true;
    var i, nx = -1;
    for (i = 0; i < filled.length; i++) { var idx = (active + 1 + i) % filled.length; if (filled[idx] < 0) { nx = idx; break; } }
    if (nx >= 0) active = nx;
    draw();
  }
  function clearBlank(bi) { if (checked) return; if (filled[bi] >= 0) { tiles[filled[bi]].used = false; filled[bi] = -1; } active = bi; draw(); }
  function clearAll() { if (checked) return; var i; for (i = 0; i < filled.length; i++) if (filled[i] >= 0) { tiles[filled[i]].used = false; filled[i] = -1; } active = 0; draw(); }

  function check() {
    if (checked) return;
    var i, allFilled = true; for (i = 0; i < filled.length; i++) if (filled[i] < 0) allFilled = false;
    if (!allFilled) return;
    checked = true;
    var allRight = true; for (i = 0; i < cur.a.length; i++) if (norm(tiles[filled[i]].w) !== norm(cur.a[i])) allRight = false;
    total++; if (allRight) right++;
    try {
      var r = recsLoad(), k = keyB(cur), rec = r[k] || (PT.srs ? PT.srs.newRecord() : null);
      if (PT.srs) { var res = PT.srs.grade(rec, allRight ? 2 : 0, Date.now()); r[k] = res.rec; PT.srs.save("bank", r); }
      if (PT.miss) { if (allRight) PT.miss.right("bank", k); else PT.miss.add("bank", k); }
    } catch (e) {}
    try { if (PT.hub && PT.hub.notify) PT.hub.notify("game"); } catch (e) {}
    try { var full = String(cur.w); for (i = 0; i < cur.a.length; i++) full = full.replace("___", cur.a[i]); speak(full); } catch (e) {}
    draw();
  }

  function wire() {
    if (!host) return;
    var i, blanks = host.querySelectorAll("[data-bk-blank]");
    for (i = 0; i < blanks.length; i++) (function (b) {
      b.onclick = function () { var bi = parseInt(b.getAttribute("data-bk-blank"), 10); if (checked) return; if (filled[bi] >= 0) clearBlank(bi); else { active = bi; draw(); } };
    })(blanks[i]);
    var tl = host.querySelectorAll("[data-bk-tile]");
    for (i = 0; i < tl.length; i++) (function (b) { b.onclick = function () { fillActive(parseInt(b.getAttribute("data-bk-tile"), 10)); }; })(tl[i]);
    var ck = host.querySelector("[data-bk-check]"); if (ck) ck.onclick = check;
    var cl = host.querySelector("[data-bk-clear]"); if (cl) cl.onclick = clearAll;
    var nx = host.querySelector("[data-bk-next]"); if (nx) nx.onclick = function () { pick(); draw(); };
  }

  function mount(hostEl) {
    host = hostEl; if (!host) return;
    if (!POOL) { host.innerHTML = '<div class="qz-empty">กำลังโหลด…</div>'; load(function () { pick(); draw(); }); return; }
    if (!cur) pick();
    draw();
  }

  return { mount: mount };
})();
