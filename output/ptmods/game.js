/* game.js — "เกมคำศัพท์" (PT.game): a hub + 4 fast, juicy learning games sharing
   one time-attack engine (RUN). Hidden mode "game", launched from the ฝึก hub.
   Games: sprint (speed meaning-recall), chef (collocations), echo (listen+spell),
   ladder (verb-forms V1->V2->V3). ES5, no canvas, no images — CSS/emoji/TTS only.
   Uses S, esc, store, speak/speakSlow/spellOut, keyOf, goMode. */
PT.game = (function () {
  "use strict";
  var active = null;      // null=hub, else game id
  var started = false;    // whether the active game's shell is built/running
  var timer = null;       // the single shared tick timer
  var collocPool = null;  // lazy: chef entries
  var ladderPool = null;  // lazy: verb-form items
  var CAMP = null;        // campaign sink: when set, a game reports pass/fail instead of drawing its own end
                          // { threshold, oneScene, filter, onDone(res) } ; set by PT.game.play()

  function V() { return document.getElementById("view"); }
  function randn(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randn(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function best(id) { var n = parseInt(store.get("pt_gbest_" + id) || "0", 10); return isNaN(n) ? 0 : n; }
  function setBest(id, v) { if (v > best(id)) store.set("pt_gbest_" + id, "" + v); }
  function say(t, mode) { try { if (mode === "slow" && window.speakSlow) speakSlow(t); else if (mode === "spell" && window.spellOut) spellOut(t); else speak(t); } catch (e) {} }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z]/g, ""); }
  function popFx(txt, good) {
    var v = V(); if (!v) return;
    var el = document.createElement("div");
    el.className = "g-pop " + (good ? "g-pop-g" : "g-pop-b");
    el.textContent = txt; v.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 650);
  }

  /* ---------- shared time-attack engine ---------- */
  var RUN = {};
  RUN.begin = function (gid, tmax, onEnd) {
    this.gid = gid; this.tmax = tmax; this.t = tmax; this.score = 0; this.combo = 0; this.maxcombo = 0;
    this.running = true; this.onEnd = onEnd;
    if (timer) clearInterval(timer);
    timer = setInterval(function () { RUN.tick(); }, 100);
  };
  RUN.tick = function () { if (!this.running) return; this.t -= 100; this.bar(); if (this.t <= 0) { this.t = 0; this.finish(); } };
  RUN.bar = function () { var b = document.getElementById("g-bar"); if (b) { b.style.width = Math.max(0, Math.round(this.t / this.tmax * 100)) + "%"; b.style.background = this.t < this.tmax * 0.25 ? "#d9534f" : "var(--accent)"; } };
  RUN.hud = function () { var s = document.getElementById("g-score"); if (s) s.textContent = this.score; var c = document.getElementById("g-combo"); if (c) c.textContent = this.combo > 1 ? ("🔥x" + this.combo) : ""; };
  RUN.good = function (add) {
    this.score++; this.combo++; if (this.combo > this.maxcombo) this.maxcombo = this.combo;
    this.t = Math.min(this.tmax, this.t + (add || 2000)); this.hud(); mascotReact(true);
    if (this.combo === 5 || this.combo === 10 || (this.combo > 10 && this.combo % 10 === 0)) { popFx("🔥 คอมโบ x" + this.combo + "!", true); try { if (window.PT && PT.toon) PT.toon.confetti(12); } catch (e) {} }
  };
  RUN.bad = function (pen) { this.combo = 0; this.t = Math.max(0, this.t - (pen || 3000)); this.hud(); mascotReact(false); };
  RUN.stop = function () { this.running = false; if (timer) { clearInterval(timer); timer = null; } };
  RUN.finish = function () { this.stop(); this.newBest = this.score > best(this.gid) && this.score > 0; setBest(this.gid, this.score); if (this.onEnd) this.onEnd(); };
  // little study-buddy mascot in the top bar reacts to every right/wrong answer
  function mascotReact(good) {
    var m = document.getElementById("g-mascot"); if (!m) return;
    m.className = "g-mascot " + (good ? "g-mascot-happy" : "g-mascot-sad");
    clearTimeout(m._t); m._t = setTimeout(function () { if (m) m.className = "g-mascot"; }, good ? 620 : 520);
  }
  function toon(face, cls) { return (window.PT && PT.toon) ? PT.toon.char(face, cls) : ('<span class="toon"><span class="toon-face">' + face + '</span></span>'); }
  var MASCOT = "🦊";

  function shell(stageId) {
    return '<div class="g-wrap"><div class="g-top">' +
      '<button class="g-back" data-g-back="1">‹ เมนู</button>' +
      '<span class="g-mascot" id="g-mascot">' + MASCOT + '</span>' +
      '<div class="g-hud"><span class="g-combo" id="g-combo"></span><span class="g-score" id="g-score">0</span></div></div>' +
      '<div class="g-barwrap"><div class="g-bar" id="g-bar" style="width:100%"></div></div>' +
      '<div class="g-stage" id="' + stageId + '"></div></div>';
  }
  // campaign hook: a game finished — report score/pass back to the campaign instead of the arcade end screen
  function campReport(gid, score, label) {
    var c = CAMP; CAMP = null;
    var passed = score >= (c.threshold || 1);
    setTimeout(function () { active = null; started = false; if (c.onDone) c.onDone({ gid: gid, score: score, passed: passed }); }, 0);
    return '<div class="g-load">…</div>';  // instantly replaced when the campaign re-renders #view
  }
  function endHtml(gid, label) {
    if (CAMP) return campReport(gid, RUN.score, label);
    var nb = RUN.newBest;
    return '<div class="g-end">' +
      '<div class="g-end-hero">' + toon(nb ? "🎉" : MASCOT, nb ? "toon-win" : "") + '</div>' +
      (nb ? '<div class="g-newbest" data-conf="1">🏆 สถิติใหม่!</div>' : '') +
      '<div class="g-end-s">' + RUN.score + '</div>' +
      '<div class="g-end-l">' + esc(label || "คะแนน") + ' · สถิติสูงสุด ' + best(gid) + (RUN.maxcombo > 2 ? (" · คอมโบสูงสุด x" + RUN.maxcombo) : "") + '</div>' +
      '<button class="g-btn g-again" data-g-again="1">🔁 เล่นอีกรอบ</button>' +
      '<button class="g-back2" data-g-back="1">‹ กลับเมนูเกม</button></div>';
  }
  // chrome for lives/turn-based games (no countdown bar); the game owns #g-hud
  function shellLives(stageId, hud) {
    return '<div class="g-wrap"><div class="g-top">' +
      '<button class="g-back" data-g-back="1">‹ เมนู</button>' +
      '<span class="g-mascot" id="g-mascot">' + MASCOT + '</span>' +
      '<div class="g-hud" id="g-hud">' + (hud || '') + '</div></div>' +
      '<div class="g-stage" id="' + stageId + '"></div></div>';
  }
  // end card for games that don't run the RUN timer (score passed in explicitly)
  function endCard(gid, scoreVal, label) {
    var nb = scoreVal > best(gid) && scoreVal > 0;
    setBest(gid, scoreVal);
    if (CAMP) return campReport(gid, scoreVal, label);
    return '<div class="g-end">' +
      '<div class="g-end-hero">' + toon(nb ? "🎉" : MASCOT, nb ? "toon-win" : "") + '</div>' +
      (nb ? '<div class="g-newbest" data-conf="1">🏆 สถิติใหม่!</div>' : '') +
      '<div class="g-end-s">' + scoreVal + '</div>' +
      '<div class="g-end-l">' + esc(label || "คะแนน") + ' · สถิติสูงสุด ' + best(gid) + '</div>' +
      '<button class="g-btn g-again" data-g-again="1">🔁 เล่นอีกรอบ</button>' +
      '<button class="g-back2" data-g-back="1">‹ กลับเมนูเกม</button></div>';
  }
  // wire the persistent back/again buttons within a rendered game
  function wireChrome(v) {
    if (CAMP) {  // campaign owns the post-encounter UI; ‹ back aborts the encounter
      var bb = v.querySelector("[data-g-back]");
      if (bb) bb.onclick = function () { RUN.stop(); var c = CAMP; CAMP = null; active = null; started = false; if (c && c.onDone) c.onDone({ aborted: true }); };
      return;
    }
    var b = v.querySelector("[data-g-back]"); if (b) b.onclick = function () { RUN.stop(); active = null; started = false; render(v); };
    var a = v.querySelector("[data-g-again]"); if (a) a.onclick = function () { started = false; startActive(v); };
    if (v.querySelector("[data-conf]")) { try { if (window.PT && PT.toon) PT.toon.confetti(40); } catch (e) {} }
  }

  /* ---------- word pool from the current deck ---------- */
  function wordPool() {
    var d = (window.S && S.data) || [], out = [], i;
    for (i = 0; i < d.length; i++) {
      var w = d[i].w;
      if (w && d[i].mt && String(w).indexOf(" ") < 0 && String(w).length >= 3 && String(w).length <= 12) out.push(d[i]);
    }
    return out;
  }

  /* ==================== 1) MEANING SPRINT ==================== */
  var sprint = {};
  sprint.render = function (v) {
    var pool = wordPool();
    if (pool.length < 6) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    sprint.pool = pool;
    v.innerHTML = shell("g-stage");
    RUN.begin("sprint", 20000, function () { document.getElementById("g-stage").innerHTML = endHtml("sprint", "ตอบถูก (คำ)"); wireChrome(v); });
    wireChrome(v);
    sprint.next();
  };
  sprint.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var p = sprint.pool, it = p[randn(p.length)];
    var wrong = p[randn(p.length)]; var guard = 0;
    while ((wrong === it || norm(wrong.mt) === norm(it.mt)) && guard++ < 8) wrong = p[randn(p.length)];
    var opts = shuffle([{ th: it.mt, ok: true }, { th: wrong.mt, ok: false }]);
    st.innerHTML = '<div class="g-sp-word">' + esc(it.w) + '</div>' +
      '<div class="g-sp-hint">แตะความหมายที่ถูก</div>' +
      '<div class="g-sp-opts">' +
      '<button class="g-sp-opt" data-ok="' + (opts[0].ok ? 1 : 0) + '">' + esc(opts[0].th) + '</button>' +
      '<button class="g-sp-opt" data-ok="' + (opts[1].ok ? 1 : 0) + '">' + esc(opts[1].th) + '</button></div>';
    [].forEach.call(st.querySelectorAll(".g-sp-opt"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        if (b.getAttribute("data-ok") === "1") { RUN.good(2000); popFx("+1", true); }
        else { RUN.bad(3000); popFx("✗", false); try { say(it.w); } catch (e) {} }
        sprint.next();
      };
    });
  };

  /* ==================== 2) COMBO CHEF (collocations) ==================== */
  var chef = {};
  // the first element's part-of-speech, so distractors are same-POS heads.
  // (colloc tags are inconsistent: clean "verb + noun" AND per-item "economic
  // (adj) + integration (n)" both appear — bucket by the FIRST part only.)
  function firstPos(tag) {
    var first = String(tag || "").toLowerCase().split("+")[0];
    if (/verb|\(v\)/.test(first)) return "v";
    if (/adverb|\(adv\)/.test(first)) return "adv";
    if (/adj|\(adj\)/.test(first)) return "adj";
    if (/noun|\(n\)/.test(first)) return "n";
    return "x";
  }
  function loadColloc(cb) {
    if (collocPool) { cb(); return; }
    fetch("data/colloc.json").then(function (r) { return r.json(); }).then(function (rows) {
      var byPos = {}, i, entries = [];
      for (i = 0; i < rows.length; i++) {
        var w = String(rows[i].w || "").trim();
        var sp = w.split(" ");
        if (sp.length < 2) continue;
        var head = sp[0], rest = sp.slice(1).join(" ");
        if (!head || !rest) continue;
        var pos = firstPos(rows[i].p || "");
        var e = { head: head, rest: rest, full: w, pos: pos, mt: rows[i].mt || "" };
        entries.push(e);
        (byPos[pos] = byPos[pos] || []).push(head);
      }
      collocPool = { entries: entries, byPos: byPos };
      cb();
    }).catch(function () { cb(); });
  }
  chef.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดคำที่ใช้คู่กัน…</div>';
    loadColloc(function () {
      if (!collocPool || collocPool.entries.length < 8) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      v.innerHTML = shell("g-stage");
      RUN.begin("chef", 22000, function () { document.getElementById("g-stage").innerHTML = endHtml("chef", "เสิร์ฟสำเร็จ (จาน)"); wireChrome(v); });
      wireChrome(v);
      chef.next();
    });
  };
  chef.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var E = collocPool.entries, e = E[randn(E.length)];
    var samePos = collocPool.byPos[e.pos] || [];
    var opts = [{ w: e.head, ok: true }], seen = {}; seen[norm(e.head)] = 1;
    var guard = 0;
    while (opts.length < 3 && guard++ < 60) {
      var cand = (samePos.length > 3) ? samePos[randn(samePos.length)] : E[randn(E.length)].head;
      if (cand && !seen[norm(cand)]) { seen[norm(cand)] = 1; opts.push({ w: cand, ok: false }); }
    }
    shuffle(opts);
    var tiles = "";
    for (var i = 0; i < opts.length; i++) tiles += '<button class="g-chef-tile" data-ok="' + (opts[i].ok ? 1 : 0) + '">' + esc(opts[i].w) + '</button>';
    st.innerHTML = '<div class="g-chef-order">🍽️ <b>___ ' + esc(e.rest) + '</b>' + (e.mt ? '<span>' + esc(e.mt) + '</span>' : '') + '</div>' +
      '<div class="g-sp-hint">เลือกคำที่ใช้คู่กับ “' + esc(e.rest) + '” ให้ถูก</div>' +
      '<div class="g-chef-tiles">' + tiles + '</div>';
    [].forEach.call(st.querySelectorAll(".g-chef-tile"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        if (b.getAttribute("data-ok") === "1") { RUN.good(2200); popFx("เสิร์ฟ! +1", true); try { say(e.full); } catch (er) {} chef.next(); }
        else { RUN.bad(3000); b.className += " g-tile-bad"; popFx("ไหม้! ✗", false); }
      };
    });
  };

  /* ==================== 3) ECHO (listen + spell) ==================== */
  var echo = {};
  echo.render = function (v) {
    var pool = wordPool().filter(function (x) { return String(x.w).length >= 3 && String(x.w).length <= 9 && /^[a-zA-Z]+$/.test(x.w); });
    if (pool.length < 6) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    echo.pool = pool;
    v.innerHTML = shell("g-stage");
    RUN.begin("echo", 30000, function () { document.getElementById("g-stage").innerHTML = endHtml("echo", "สะกดถูก (คำ)"); wireChrome(v); });
    wireChrome(v);
    echo.next();
  };
  echo.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var it = echo.pool[randn(echo.pool.length)];
    echo.word = String(it.w).toLowerCase(); echo.item = it; echo.built = [];
    var letters = shuffle(echo.word.split(""));
    var tiles = "";
    for (var i = 0; i < letters.length; i++) tiles += '<button class="g-echo-tile" data-i="' + i + '" data-ch="' + letters[i] + '">' + esc(letters[i]) + '</button>';
    st.innerHTML = '<button class="g-echo-play" data-echo-play="1">🔊</button>' +
      '<div class="g-sp-hint">ฟังเสียง แล้วแตะตัวอักษรเรียงให้ถูก</div>' +
      '<div class="g-echo-slots" id="g-echo-slots"></div>' +
      '<div class="g-echo-tiles">' + tiles + '</div>' +
      '<div class="g-echo-ctl"><button class="g-echo-mini" data-echo-slow="1">🐢 ช้า</button>' +
      '<button class="g-echo-mini" data-echo-del="1">⌫ ลบ</button></div>';
    echo.drawSlots();
    try { say(echo.word); } catch (e) {}
    st.querySelector("[data-echo-play]").onclick = function () { say(echo.word); };
    st.querySelector("[data-echo-slow]").onclick = function () { say(echo.word, "slow"); };
    st.querySelector("[data-echo-del]").onclick = function () { echo.del(); };
    [].forEach.call(st.querySelectorAll(".g-echo-tile"), function (b) {
      b.onclick = function () {
        if (!RUN.running || b.disabled) return;
        b.disabled = true; b.className += " g-tile-used";
        echo.built.push({ ch: b.getAttribute("data-ch"), el: b });
        echo.drawSlots();
        if (echo.built.length === echo.word.length) echo.check();
      };
    });
  };
  echo.drawSlots = function () {
    var box = document.getElementById("g-echo-slots"); if (!box) return;
    var h = "";
    for (var i = 0; i < echo.word.length; i++) h += '<span class="g-echo-slot">' + (echo.built[i] ? esc(echo.built[i].ch) : "") + '</span>';
    box.innerHTML = h;
  };
  echo.del = function () {
    var last = echo.built.pop();
    if (last && last.el) { last.el.disabled = false; last.el.className = "g-echo-tile"; }
    echo.drawSlots();
  };
  echo.check = function () {
    var guess = ""; for (var i = 0; i < echo.built.length; i++) guess += echo.built[i].ch;
    if (guess === echo.word) { RUN.good(2500); popFx("✓ +1", true); echo.next(); }
    else {
      RUN.bad(2500);
      var box = document.getElementById("g-echo-slots"); if (box) { box.className = "g-echo-slots g-shake"; setTimeout(function () { if (box) box.className = "g-echo-slots"; }, 400); }
      popFx("✗ " + echo.word, false);
      // reset tiles for another try at the SAME word
      var st = document.getElementById("g-stage");
      [].forEach.call(st.querySelectorAll(".g-echo-tile"), function (b) { b.disabled = false; b.className = "g-echo-tile"; });
      echo.built = []; echo.drawSlots();
    }
  };

  /* ==================== 4) VERB LADDER (V1->V2->V3) ==================== */
  var ladder = {};
  // a good ladder item: single-word verb whose V2 or V3 actually changes from V1
  // (skips invariants like put/cut and mis-tagged modals like could/would — a boring rung).
  function ladderOk(x) {
    if (!x || !x.vf || !x.vf.v2 || !x.vf.v3) return false;
    var w = String(x.w || "");
    if (w.indexOf(" ") >= 0 || w.indexOf("-") >= 0) return false;
    var lw = norm(w);
    return norm(x.vf.v2) !== lw || norm(x.vf.v3) !== lw;
  }
  function loadLadder(cb) {
    if (ladderPool) { cb(); return; }
    var d = (window.S && S.data) || [], out = [], i;
    for (i = 0; i < d.length; i++) if (ladderOk(d[i])) out.push(d[i]);
    if (out.length >= 20) { ladderPool = out; cb(); return; }
    // fallback: a small deck that always has verb forms
    fetch("data/awl.json").then(function (r) { return r.json(); }).then(function (rows) {
      var o = [], j; for (j = 0; j < rows.length; j++) if (ladderOk(rows[j])) o.push(rows[j]);
      ladderPool = o.length ? o : out; cb();
    }).catch(function () { ladderPool = out; cb(); });
  }
  ladder.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังเตรียมกริยา…</div>';
    loadLadder(function () {
      if (!ladderPool || ladderPool.length < 6) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
      v.innerHTML = shell("g-stage");
      RUN.begin("ladder", 30000, function () { document.getElementById("g-stage").innerHTML = endHtml("ladder", "ปีนถูก (ขั้น)"); wireChrome(v); });
      wireChrome(v);
      ladder.next();
    });
  };
  ladder.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var it = ladderPool[randn(ladderPool.length)];
    ladder.item = it; ladder.stage = 2; // asking for V2 first, then V3
    ladder.paint();
  };
  ladder.paint = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var it = ladder.item, want = ladder.stage === 2 ? "V2 (อดีต)" : "V3 (Past Participle)";
    var ir = it.vf.ir ? '<span class="g-lad-ir">กริยาไม่ปกติ ×2</span>' : "";
    st.innerHTML = '<div class="g-lad-rung">V1 &nbsp;<b>' + esc(it.w) + '</b> ' + ir + '</div>' +
      (ladder.stage === 3 ? '<div class="g-lad-rung done">V2 &nbsp;<b>' + esc(it.vf.v2) + '</b> ✓</div>' : '') +
      '<div class="g-lad-ask">พิมพ์ ' + want + '</div>' +
      '<div class="g-lad-row"><input id="g-lad-in" class="g-lad-in" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(want) + '">' +
      '<button class="g-lad-go" id="g-lad-go" data-lad-go="1">ปีน ▲</button></div>';
    var inp = document.getElementById("g-lad-in"); try { inp.focus(); } catch (e) {}
    function submit() {
      if (!RUN.running) return;
      var val = norm(inp.value), target = ladder.stage === 2 ? it.vf.v2 : it.vf.v3;
      var ok = false, parts = String(target).toLowerCase().split(/[\/,]/);
      for (var i = 0; i < parts.length; i++) if (norm(parts[i]) === val && val) ok = true;
      if (ok) {
        var bonus = it.vf.ir ? 2 : 1;
        RUN.good(1800 + bonus * 400); if (bonus === 2) { RUN.score++; RUN.hud(); }
        popFx("▲ +" + bonus, true); try { say(target); } catch (e) {}
        if (ladder.stage === 2) { ladder.stage = 3; ladder.paint(); } else ladder.next();
      } else {
        RUN.bad(2500); popFx("✗ " + target, false); try { say(target); } catch (e) {}
        if (ladder.stage === 2) { ladder.stage = 3; ladder.paint(); } else ladder.next();
      }
    }
    document.getElementById("g-lad-go").onclick = submit;
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.keyCode === 13) submit(); });
  };

  /* ==================== 5) SAME OR OPPOSITE (เหมือน–ตรงข้าม) ==================== */
  var sameopp = {};
  sameopp.render = function (v) {
    var d = (window.S && S.data) || [], pool = [], i;
    for (i = 0; i < d.length; i++) { var x = d[i]; if (x.sy && x.sy.length && x.an && x.an.length && x.w && x.mt) pool.push(x); }
    if (pool.length < 6) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    sameopp.pool = pool;
    v.innerHTML = shell("g-stage");
    RUN.begin("sameopp", 22000, function () { document.getElementById("g-stage").innerHTML = endHtml("sameopp", "จับคู่ถูก (คำ)"); wireChrome(v); });
    wireChrome(v);
    sameopp.next();
  };
  sameopp.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var p = sameopp.pool, it = p[randn(p.length)];
    var roll = randn(3), cand, ans;
    if (roll === 0) { cand = it.sy[randn(it.sy.length)]; ans = "same"; }
    else if (roll === 1) { cand = it.an[randn(it.an.length)]; ans = "opp"; }
    else {
      var block = {}, k; for (k = 0; k < it.sy.length; k++) block[norm(it.sy[k])] = 1; for (k = 0; k < it.an.length; k++) block[norm(it.an[k])] = 1; block[norm(it.w)] = 1;
      var g = 0, c = it.w; do { c = p[randn(p.length)].w; } while (block[norm(c)] && g++ < 15); cand = c; ans = "none";
    }
    st.innerHTML = '<div class="g-so-top"><span class="g-so-tl">คำหลัก</span>' + esc(it.w) + '</div>' +
      '<div class="g-so-q">' + esc(cand) + '</div>' +
      '<div class="g-so-hint">“' + esc(cand) + '” เทียบกับ “' + esc(it.w) + '”</div>' +
      '<div class="g-so-btns">' +
      '<button class="g-so-b g-so-same" data-a="same">✓ เหมือน</button>' +
      '<button class="g-so-b g-so-opp" data-a="opp">✗ ตรงข้าม</button>' +
      '<button class="g-so-b g-so-none" data-a="none">– ไม่เกี่ยว</button></div>';
    [].forEach.call(st.querySelectorAll(".g-so-b"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        if (b.getAttribute("data-a") === ans) { RUN.good(2000); popFx("+1", true); }
        else { RUN.bad(2800); popFx(ans === "same" ? "✗ เหมือน" : ans === "opp" ? "✗ ตรงข้าม" : "✗ ไม่เกี่ยว", false); }
        sameopp.next();
      };
    });
  };

  /* ==================== 6) SURVIVAL TOWER (หอคอยเอาชีวิตรอด) — sudden death, interleaved ==================== */
  var tower = {};
  tower.render = function (v) {
    var pool = wordPool();
    if (pool.length < 8) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    var missSet = {}, mk = (window.PT && PT.miss && PT.miss.keys) ? PT.miss.keys(S.deck) : [], i;
    for (i = 0; i < mk.length; i++) missSet[mk[i]] = 1;
    tower.pool = pool; tower.weak = [];
    for (i = 0; i < pool.length; i++) { try { if (missSet[keyOf(pool[i])]) tower.weak.push(pool[i]); } catch (e) {} }
    v.innerHTML = shell("g-stage");
    RUN.begin("tower", 45000, function () { document.getElementById("g-stage").innerHTML = endHtml("tower", "ปีนได้ (ชั้น)"); wireChrome(v); });
    wireChrome(v);
    tower.ask();
  };
  tower.rand = function () { return tower.pool[randn(tower.pool.length)]; };
  tower.pick = function () { return (tower.weak.length && randn(100) < 55) ? tower.weak[randn(tower.weak.length)] : tower.rand(); };
  tower.opts = function (opts, kind) {
    var h = '<div class="g-tw-opts">', i;
    for (i = 0; i < opts.length; i++) h += '<button class="g-tw-opt' + (kind === "en" ? " g-tw-en" : "") + '" data-ok="' + opts[i].ok + '">' + esc(opts[i].t) + '</button>';
    return h + '</div>';
  };
  tower.wire = function (st, it, corr) {
    [].forEach.call(st.querySelectorAll(".g-tw-opt"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        if (b.getAttribute("data-ok") === "1") { RUN.good(1500); popFx("▲ ชั้น " + RUN.score + "!", true); tower.ask(); }
        else { RUN.combo = 0; b.className += " g-tile-bad"; popFx("✗ ตกหอคอย!", false); try { say(corr || it.w); } catch (e) {} RUN.finish(); }
      };
    });
  };
  tower.ask = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var it = tower.pick();
    var types = ["meaning", "listen"]; if (it.sy && it.sy.length) types.push("syn");
    var type = types[RUN.score % types.length];
    var floor = '<div class="g-tw-floor">🗼 ชั้น ' + RUN.score + ' · ตอบผิดจบเลย</div>';
    var opts, seen, g, w, corr;
    if (type === "syn") {
      corr = it.sy[randn(it.sy.length)];
      var block = {}, k; for (k = 0; k < it.sy.length; k++) block[norm(it.sy[k])] = 1; block[norm(it.w)] = 1;
      opts = [{ t: corr, ok: 1 }]; seen = {}; seen[norm(corr)] = 1; g = 0;
      while (opts.length < 3 && g++ < 25) { w = tower.rand().w; if (!seen[norm(w)] && !block[norm(w)] && String(w).indexOf(" ") < 0) { seen[norm(w)] = 1; opts.push({ t: w, ok: 0 }); } }
      shuffle(opts);
      st.innerHTML = floor + '<div class="g-tw-q">คำที่ใกล้เคียงกับ <b>' + esc(it.w) + '</b>?</div>' + tower.opts(opts, "en");
      tower.wire(st, it, corr);
    } else if (type === "listen") {
      opts = [{ t: it.w, ok: 1 }]; seen = {}; seen[norm(it.w)] = 1; g = 0;
      while (opts.length < 3 && g++ < 25) { w = tower.rand().w; if (!seen[norm(w)] && String(w).indexOf(" ") < 0) { seen[norm(w)] = 1; opts.push({ t: w, ok: 0 }); } }
      shuffle(opts);
      st.innerHTML = floor + '<button class="g-echo-play" data-echo-play="1">🔊</button><div class="g-sp-hint">ฟังเสียง แล้วเลือกคำที่ได้ยิน</div>' + tower.opts(opts, "en");
      try { say(it.w); } catch (e) {}
      var pl = st.querySelector("[data-echo-play]"); if (pl) pl.onclick = function () { say(it.w); };
      tower.wire(st, it);
    } else {
      opts = [{ t: it.mt, ok: 1 }]; seen = {}; seen[it.mt] = 1; g = 0;
      while (opts.length < 3 && g++ < 25) { var r = tower.rand(); if (r.mt && !seen[r.mt]) { seen[r.mt] = 1; opts.push({ t: r.mt, ok: 0 }); } }
      shuffle(opts);
      st.innerHTML = floor + '<div class="g-tw-q">ความหมายของ <b>' + esc(it.w) + '</b>?</div>' + tower.opts(opts, "th");
      tower.wire(st, it);
    }
  };

  /* ==================== 7) FILL BY EAR (เติมจากเสียง) ==================== */
  var fillear = {};
  function reWord(w) { return new RegExp("\\b" + String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"); }
  fillear.render = function (v) {
    var d = (window.S && S.data) || [], pool = [], i;
    for (i = 0; i < d.length; i++) { var x = d[i]; if (!x.w || !x.ee || !x.p) continue; if (String(x.w).indexOf(" ") >= 0) continue; if (reWord(x.w).test(String(x.ee))) pool.push(x); }
    if (pool.length < 6) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    fillear.pool = pool;
    v.innerHTML = shell("g-stage");
    RUN.begin("fillear", 28000, function () { document.getElementById("g-stage").innerHTML = endHtml("fillear", "ฟังถูก (ประโยค)"); wireChrome(v); });
    wireChrome(v);
    fillear.next();
  };
  fillear.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var p = fillear.pool, it = p[randn(p.length)];
    fillear.sentence = String(it.ee); fillear.word = String(it.w);
    var blanked = fillear.sentence.replace(reWord(it.w), "_____");
    var opts = [{ t: it.w, ok: 1 }], seen = {}, g = 0; seen[norm(it.w)] = 1;
    while (opts.length < 3 && g++ < 30) { var c = p[randn(p.length)]; if (c.p === it.p && !seen[norm(c.w)] && String(c.w).indexOf(" ") < 0) { seen[norm(c.w)] = 1; opts.push({ t: c.w, ok: 0 }); } }
    g = 0; while (opts.length < 3 && g++ < 30) { var c2 = p[randn(p.length)]; if (!seen[norm(c2.w)] && String(c2.w).indexOf(" ") < 0) { seen[norm(c2.w)] = 1; opts.push({ t: c2.w, ok: 0 }); } }
    shuffle(opts);
    var tiles = ""; for (var i = 0; i < opts.length; i++) tiles += '<button class="g-fe-opt" data-ok="' + opts[i].ok + '">' + esc(opts[i].t) + '</button>';
    st.innerHTML = '<button class="g-echo-play" data-echo-play="1">🔊</button>' +
      '<div class="g-sp-hint">ฟังประโยค แล้วเลือกคำที่หายไป</div>' +
      '<div class="g-fe-sent">' + esc(blanked) + '</div>' +
      '<div class="g-fe-opts">' + tiles + '</div>' +
      '<div class="g-echo-ctl"><button class="g-echo-mini" data-fe-slow="1">🐢 ฟังช้า</button></div>';
    try { say(fillear.sentence); } catch (e) {}
    st.querySelector("[data-echo-play]").onclick = function () { RUN.t = Math.max(0, RUN.t - 600); say(fillear.sentence); };
    st.querySelector("[data-fe-slow]").onclick = function () { RUN.t = Math.max(0, RUN.t - 600); say(fillear.sentence, "slow"); };
    [].forEach.call(st.querySelectorAll(".g-fe-opt"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        if (b.getAttribute("data-ok") === "1") { RUN.good(2200); popFx("+1", true); fillear.next(); }
        else { RUN.bad(2800); b.className += " g-tile-bad"; popFx("✗ " + fillear.word, false); try { say(fillear.sentence, "slow"); } catch (e) {} }
      };
    });
  };

  /* ==================== 8) FINISH THE IDIOM (เติมสำนวน) ==================== */
  var idiomfill = {};
  var idiomPool = null;
  var STOP = { the: 1, a: 1, an: 1, of: 1, to: 1, in: 1, on: 1, at: 1, and: 1, or: 1, for: 1, with: 1, your: 1, my: 1, his: 1, her: 1, its: 1, our: 1, you: 1, it: 1, be: 1, is: 1, are: 1, as: 1, by: 1, one: 1, ones: 1, no: 1, not: 1, that: 1, this: 1, into: 1, from: 1 };
  function loadIdiom(cb) {
    if (idiomPool) { cb(); return; }
    fetch("data/idiom.json").then(function (r) { return r.json(); }).then(function (rows) {
      var items = [], bank = [], i, j;
      for (i = 0; i < rows.length; i++) {
        var w = String(rows[i].w || "").trim(); if (!w) continue;
        var words = w.split(/\s+/), cand = [];
        for (j = 0; j < words.length; j++) { var lw = words[j].toLowerCase().replace(/[^a-z]/g, ""); if (lw.length >= 3 && !STOP[lw]) cand.push(j); }
        if (!cand.length) continue;
        items.push({ full: w, words: words, blanks: cand, mt: rows[i].mt || "" });
        for (j = 0; j < cand.length; j++) { var cw = words[cand[j]].replace(/[^A-Za-z]/g, ""); if (cw) bank.push(cw); }
      }
      idiomPool = { items: items, bank: bank }; cb();
    }).catch(function () { cb(); });
  }
  idiomfill.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดสำนวน…</div>';
    loadIdiom(function () {
      if (!idiomPool || idiomPool.items.length < 8) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      v.innerHTML = shell("g-stage");
      RUN.begin("idiomfill", 25000, function () { document.getElementById("g-stage").innerHTML = endHtml("idiomfill", "เติมถูก (สำนวน)"); wireChrome(v); });
      wireChrome(v);
      idiomfill.next();
    });
  };
  idiomfill.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var I = idiomPool.items, it = I[randn(I.length)];
    var bi = it.blanks[randn(it.blanks.length)];
    var answer = it.words[bi].replace(/[^A-Za-z]/g, "");
    var parts = it.words.slice(); parts[bi] = "_____";
    idiomfill.full = it.full;
    var opts = [{ t: answer, ok: 1 }], seen = {}; seen[norm(answer)] = 1; var g = 0, bank = idiomPool.bank;
    while (opts.length < 3 && g++ < 60) { var cand = bank[randn(bank.length)]; if (cand && !seen[norm(cand)]) { seen[norm(cand)] = 1; opts.push({ t: cand, ok: 0 }); } }
    shuffle(opts);
    var tiles = ""; for (var i = 0; i < opts.length; i++) tiles += '<button class="g-chef-tile" data-ok="' + opts[i].ok + '">' + esc(opts[i].t) + '</button>';
    st.innerHTML = '<div class="g-if-idiom">' + esc(parts.join(" ")) + '</div>' +
      (it.mt ? '<div class="g-if-mt">' + esc(it.mt) + '</div>' : '') +
      '<div class="g-sp-hint">เลือกคำที่เติมในสำนวนให้ถูก</div>' +
      '<div class="g-chef-tiles">' + tiles + '</div>';
    [].forEach.call(st.querySelectorAll(".g-chef-tile"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        if (b.getAttribute("data-ok") === "1") { RUN.good(2200); popFx("+1", true); try { say(idiomfill.full); } catch (e) {} idiomfill.next(); }
        else { RUN.bad(3000); b.className += " g-tile-bad"; popFx("✗", false); }
      };
    });
  };

  /* ==================== 9) SHARPER WORD (คำที่คมกว่า) ==================== */
  var sharper = {};
  var sharperPool = null;
  function loadSharper(cb) {
    if (sharperPool) { cb(); return; }
    fetch("data/wordchoice.json").then(function (r) { return r.json(); }).then(function (rows) {
      var qs = [], i, j;
      for (i = 0; i < rows.length; i++) {
        var c = rows[i]; if (!c.quiz || !c.words || c.words.length < 3) continue;
        var ws = []; for (j = 0; j < c.words.length; j++) ws.push(c.words[j].w);
        for (j = 0; j < c.quiz.length; j++) { var q = c.quiz[j]; if (q && q.s && q.a && String(q.s).indexOf("___") >= 0) qs.push({ s: q.s, a: q.a, why: q.why_th || "", ws: ws }); }
      }
      sharperPool = qs; cb();
    }).catch(function () { cb(); });
  }
  sharper.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดชุดคำ…</div>';
    loadSharper(function () {
      if (!sharperPool || sharperPool.length < 8) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      v.innerHTML = shell("g-stage");
      RUN.begin("sharper", 26000, function () { document.getElementById("g-stage").innerHTML = endHtml("sharper", "เลือกคมถูก (ข้อ)"); wireChrome(v); });
      wireChrome(v);
      sharper.next();
    });
  };
  sharper.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var P = sharperPool, q = P[randn(P.length)];
    var opts = [], seen = {}, i;
    for (i = 0; i < q.ws.length; i++) { var w = q.ws[i]; if (!seen[norm(w)]) { seen[norm(w)] = 1; opts.push({ t: w, ok: norm(w) === norm(q.a) ? 1 : 0 }); } }
    // ensure the answer is present
    if (!seen[norm(q.a)]) opts.push({ t: q.a, ok: 1 });
    // cap to 4 options but always keep the correct one
    if (opts.length > 4) { var keep = []; for (i = 0; i < opts.length && keep.length < 3; i++) if (!opts[i].ok) keep.push(opts[i]); keep.push({ t: q.a, ok: 1 }); opts = keep; }
    shuffle(opts);
    var sent = String(q.s).replace(/___+/, "<b>_____</b>");
    var tiles = ""; for (i = 0; i < opts.length; i++) tiles += '<button class="g-sh-tile" data-ok="' + opts[i].ok + '">' + esc(opts[i].t) + '</button>';
    st.innerHTML = '<div class="g-sh-sent">' + sent + '</div>' +
      '<div class="g-sp-hint">เลือกคำที่ “คม/ตรงความหมาย” ที่สุด</div>' +
      '<div class="g-sh-tiles">' + tiles + '</div>' +
      '<div class="g-note" id="g-note"></div>';
    [].forEach.call(st.querySelectorAll(".g-sh-tile"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        var note = document.getElementById("g-note");
        if (b.getAttribute("data-ok") === "1") { RUN.good(2000); popFx("+1", true); if (note && q.why) note.textContent = "✓ " + q.a + " — " + q.why; sharper.next2(note); }
        else { RUN.bad(2800); b.className += " g-tile-bad"; popFx("✗ " + q.a, false); try { say(q.a); } catch (e) {} if (note) note.textContent = "✗ ที่ถูก: " + q.a + (q.why ? " — " + q.why : ""); }
      };
    });
  };
  // advance shortly after a correct answer so the "why" note is briefly visible
  sharper.next2 = function () { setTimeout(function () { if (RUN.running) sharper.next(); }, 500); };

  /* ==================== 10) LINE-UP (เรียงประโยค) ==================== */
  var lineup = {};
  var lineupPool = null;
  function loadLineup(cb) {
    if (lineupPool) { cb(); return; }
    var use = function (rows) {
      var o = [], i; for (i = 0; i < rows.length; i++) { var w = String(rows[i].w || "").replace(/\s+/g, " ").trim(); var parts = w.split(" "); if (parts.length >= 4 && parts.length <= 8 && /[A-Za-z]/.test(w)) o.push({ w: w, parts: parts }); }
      lineupPool = o; cb();
    };
    var d = (window.S && S.data) || [];
    if (S.deck === "sentences" && d.length) { use(d); return; }
    fetch("data/sentences.json").then(function (r) { return r.json(); }).then(use).catch(function () { use(d); });
  }
  lineup.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดประโยค…</div>';
    loadLineup(function () {
      if (!lineupPool || lineupPool.length < 6) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      lineup.level = 4;
      v.innerHTML = shell("g-stage");
      RUN.begin("lineup", 35000, function () { document.getElementById("g-stage").innerHTML = endHtml("lineup", "เรียงถูก (ประโยค)"); wireChrome(v); });
      wireChrome(v);
      lineup.next();
    });
  };
  lineup.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var cands = [], i, P = lineupPool;
    for (i = 0; i < P.length; i++) if (P[i].parts.length <= lineup.level) cands.push(P[i]);
    if (!cands.length) cands = P;
    var it = cands[randn(cands.length)];
    lineup.answer = it.parts; lineup.sentence = it.w; lineup.built = [];
    var order = []; for (i = 0; i < it.parts.length; i++) order.push({ w: it.parts[i], i: i });
    shuffle(order);
    var tiles = ""; for (i = 0; i < order.length; i++) tiles += '<button class="g-lu-tile" data-w="' + esc(order[i].w) + '">' + esc(order[i].w) + '</button>';
    st.innerHTML = '<div class="g-sp-hint">แตะคำเรียงให้เป็นประโยคที่ถูก (' + it.parts.length + ' คำ)</div>' +
      '<div class="g-lu-slots" id="g-lu-slots"></div>' +
      '<div class="g-lu-tiles" id="g-lu-tiles">' + tiles + '</div>';
    lineup.drawSlots();
    [].forEach.call(st.querySelectorAll(".g-lu-tile"), function (b) {
      b.onclick = function () {
        if (!RUN.running || b.disabled) return;
        var want = lineup.answer[lineup.built.length];
        if (norm(b.getAttribute("data-w")) === norm(want)) {
          b.disabled = true; b.className += " g-tile-used";
          lineup.built.push(b.getAttribute("data-w")); lineup.drawSlots();
          if (lineup.built.length === lineup.answer.length) {
            RUN.good(2600); popFx("✓ +1", true); try { say(lineup.sentence); } catch (e) {}
            if (RUN.score % 2 === 0 && lineup.level < 8) lineup.level++;
            setTimeout(function () { if (RUN.running) lineup.next(); }, 450);
          }
        } else {
          RUN.bad(2600); popFx("✗", false);
          var box = document.getElementById("g-lu-slots"); if (box) { box.className = "g-lu-slots g-shake"; setTimeout(function () { if (box) box.className = "g-lu-slots"; }, 400); }
        }
      };
    });
  };
  lineup.drawSlots = function () {
    var box = document.getElementById("g-lu-slots"); if (!box) return;
    var h = "", i;
    for (i = 0; i < lineup.built.length; i++) h += '<span class="g-lu-word">' + esc(lineup.built[i]) + '</span>';
    for (i = lineup.built.length; i < lineup.answer.length; i++) h += '<span class="g-lu-blank"></span>';
    box.innerHTML = h;
  };

  /* ==================== 11) WORD DIAL (สเกลคำ — order by scale) ==================== */
  var worddial = {};
  var wcRaw = null;
  function loadWC(cb) {
    if (wcRaw) { cb(); return; }
    fetch("data/wordchoice.json").then(function (r) { return r.json(); }).then(function (rows) { wcRaw = rows || []; cb(); }).catch(function () { wcRaw = []; cb(); });
  }
  function dialPool() {
    var out = [], i, j;
    for (i = 0; i < wcRaw.length; i++) {
      var c = wcRaw[i], ws = c.words || [];
      var byScale = {}, list = [];
      for (j = 0; j < ws.length; j++) { var s = ws[j].scale; if (typeof s === "number" && !byScale[s]) { byScale[s] = 1; list.push({ w: ws[j].w, scale: s, why: ws[j].when_th || "", reg: ws[j].reg || "" }); } }
      if (list.length >= 3) { list.sort(function (a, b) { return a.scale - b.scale; }); out.push({ label: c.scale_label_th || c.core_th || "", items: list.slice(0, 4) }); }
    }
    return out;
  }
  worddial.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดชุดคำ…</div>';
    loadWC(function () {
      worddial.pool = dialPool();
      if (!worddial.pool || worddial.pool.length < 6) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      v.innerHTML = shell("g-stage");
      RUN.begin("worddial", 30000, function () { document.getElementById("g-stage").innerHTML = endHtml("worddial", "เรียงสเกลถูก (ชุด)"); wireChrome(v); });
      wireChrome(v);
      worddial.next();
    });
  };
  worddial.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var c = worddial.pool[randn(worddial.pool.length)];
    worddial.set = c.items; worddial.built = [];  // correct order = ascending scale (already sorted)
    var order = c.items.slice(); shuffle(order);
    var chips = ""; for (var i = 0; i < order.length; i++) chips += '<button class="g-wd-chip" data-w="' + esc(order[i].w) + '">' + esc(order[i].w) + '</button>';
    st.innerHTML = '<div class="g-wd-cap">' + esc(c.label) + '</div>' +
      '<div class="g-wd-axis"><span>เบา / ไม่ทางการ</span><span class="g-wd-arrow">→</span><span>แรง / ทางการ</span></div>' +
      '<div class="g-wd-slots" id="g-wd-slots"></div>' +
      '<div class="g-sp-hint">แตะคำเรียงจากซ้าย(น้อย)ไปขวา(มาก)</div>' +
      '<div class="g-wd-chips">' + chips + '</div>' +
      '<div class="g-note" id="g-note"></div>';
    worddial.draw();
    [].forEach.call(st.querySelectorAll(".g-wd-chip"), function (b) {
      b.onclick = function () {
        if (!RUN.running || b.disabled) return;
        var want = worddial.set[worddial.built.length];
        if (norm(b.getAttribute("data-w")) === norm(want.w)) {
          b.disabled = true; b.className += " g-tile-used";
          worddial.built.push(want); worddial.draw();
          if (worddial.built.length === worddial.set.length) {
            RUN.good(2600); popFx("✓ +1", true);
            var note = document.getElementById("g-note"); if (note && want.why) note.textContent = "✓ " + want.w + " — " + want.why;
            setTimeout(function () { if (RUN.running) worddial.next(); }, 550);
          }
        } else { RUN.bad(2600); popFx("✗", false); var box = document.getElementById("g-wd-slots"); if (box) { box.className = "g-wd-slots g-shake"; setTimeout(function () { if (box) box.className = "g-wd-slots"; }, 400); } }
      };
    });
  };
  worddial.draw = function () {
    var box = document.getElementById("g-wd-slots"); if (!box) return;
    var h = "", i;
    for (i = 0; i < worddial.built.length; i++) h += '<span class="g-wd-word">' + (i + 1) + '. ' + esc(worddial.built[i].w) + '</span>';
    for (i = worddial.built.length; i < worddial.set.length; i++) h += '<span class="g-wd-blank">' + (i + 1) + '</span>';
    box.innerHTML = h;
  };

  /* ==================== 12) MEMORY MATCH (ความจำคู่คำ) — no timer ==================== */
  var memory = {};
  memory.render = function (v) {
    var pool = wordPool();
    if (pool.length < 8) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    var pick = shuffle(pool.slice()).slice(0, 8), cards = [], i;
    for (i = 0; i < pick.length; i++) { cards.push({ p: i, t: pick[i].w, en: pick[i].w, kind: "en" }); cards.push({ p: i, t: pick[i].mt, en: pick[i].w, kind: "th" }); }
    memory.cards = shuffle(cards); memory.flipped = []; memory.matched = 0; memory.moves = 0; memory.lock = false;
    v.innerHTML = shellLives("g-stage", memory.hud());
    wireChrome(v);
    memory.paint();
  };
  memory.hud = function () { return '<span class="g-mm-stat">พลิก ' + memory.moves + '</span><span class="g-mm-stat">คู่ ' + memory.matched + '/8</span>'; };
  memory.paint = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var h = '<div class="g-mm-grid">', i;
    for (i = 0; i < memory.cards.length; i++) {
      var c = memory.cards[i], up = c.done || c.face;
      h += '<button class="g-mm-card' + (c.done ? " g-mm-done" : (c.face ? " g-mm-up" : "")) + '" data-i="' + i + '">' + (up ? esc(c.t) : "?") + '</button>';
    }
    h += '</div>';
    st.innerHTML = h;
    var hud = document.getElementById("g-hud"); if (hud) hud.innerHTML = memory.hud();
    [].forEach.call(st.querySelectorAll(".g-mm-card"), function (b) {
      b.onclick = function () {
        if (memory.lock) return;
        var i = parseInt(b.getAttribute("data-i"), 10), c = memory.cards[i];
        if (c.done || c.face) return;
        c.face = true; memory.flipped.push(i); memory.paint();
        if (memory.flipped.length === 2) {
          memory.moves++;
          var a = memory.cards[memory.flipped[0]], d = memory.cards[memory.flipped[1]];
          if (a.p === d.p) {
            a.done = d.done = true; memory.matched++; memory.flipped = [];
            try { say(a.en); } catch (e) {}
            memory.paint();
            if (memory.matched === 8) {
              var score = Math.max(20, 200 - (memory.moves - 8) * 12);
              document.getElementById("g-stage").innerHTML = endCard("memory", score, "จับคู่ครบใน " + memory.moves + " ครั้ง");
              var vv = V(); if (vv) wireChrome(vv);
            }
          } else {
            memory.lock = true;
            setTimeout(function () { a.face = false; d.face = false; memory.flipped = []; memory.lock = false; memory.paint(); }, 750);
          }
        }
      };
    });
  };

  /* ==================== 13) DIALOGUE DIRECTOR (บทสนทนาพลิกเกม) — lives ==================== */
  var dialogue = {};
  var convPool = null;
  function loadConv(cb) {
    if (convPool) { cb(); return; }
    fetch("data/conversations.json").then(function (r) { return r.json(); }).then(function (rows) {
      var ok = [], byLvl = {}, i;
      for (i = 0; i < rows.length; i++) { var c = rows[i]; if (c.turns && c.turns.length >= 3) { ok.push(c); var L = c.level || "?"; (byLvl[L] = byLvl[L] || []).push(c); } }
      convPool = { all: ok, byLvl: byLvl }; cb();
    }).catch(function () { convPool = null; cb(); });
  }
  dialogue.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดบทสนทนา…</div>';
    loadConv(function () {
      if (!convPool || convPool.all.length < 6) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      dialogue.hearts = 3; dialogue.score = 0;
      v.innerHTML = shellLives("g-stage", dialogue.hud());
      wireChrome(v);
      dialogue.load();
    });
  };
  dialogue.hud = function () { var hh = ""; for (var i = 0; i < 3; i++) hh += (i < dialogue.hearts ? "❤️" : "🤍"); return '<span class="g-dd-hearts">' + hh + '</span><span class="g-score">' + dialogue.score + '</span>'; };
  dialogue.load = function () {
    var pool = convPool.all;
    if (CAMP && CAMP.filter) {  // campaign restricts to on-theme dialogues (best-effort)
      var f = CAMP.filter, sub = [], i;
      for (i = 0; i < pool.length; i++) {
        var c = pool[i];
        var okG = !f.g || (c.g && String(c.g).toLowerCase().indexOf(String(f.g).toLowerCase()) >= 0);
        var okL = !f.level || c.level === f.level;
        if (okG && okL) sub.push(c);
      }
      if (sub.length) pool = sub;
    }
    var pick = pool[randn(pool.length)];
    dialogue.conv = pick; dialogue.idx = 0; dialogue.player = "A"; dialogue.log = [];
    dialogue.step();
  };
  dialogue.step = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var t = dialogue.conv.turns;
    // append all partner turns until the next player turn (or end)
    while (dialogue.idx < t.length && t[dialogue.idx].speaker !== dialogue.player) {
      dialogue.log.push({ me: false, en: t[dialogue.idx].en, th: t[dialogue.idx].th });
      try { say(t[dialogue.idx].en); } catch (e) {}
      dialogue.idx++;
    }
    if (dialogue.idx >= t.length) { // scene cleared
      dialogue.score++; popFx("✓ จบฉาก! +1", true);
      var hud = document.getElementById("g-hud"); if (hud) hud.innerHTML = dialogue.hud();
      if (CAMP) { st.innerHTML = endCard("dialogue", dialogue.score, "จบฉาก"); if (V()) wireChrome(V()); return; }  // campaign: one scene = done
      setTimeout(function () { if (V()) dialogue.load(); }, 500); return;
    }
    var correct = t[dialogue.idx];
    var opts = [{ t: correct.en, ok: 1 }], seen = {}; seen[correct.en] = 1;
    var samelvl = convPool.byLvl[dialogue.conv.level] || convPool.all, g = 0;
    while (opts.length < 3 && g++ < 40) {
      var cc = samelvl[randn(samelvl.length)], line = cc.turns[randn(cc.turns.length)].en;
      if (line && !seen[line]) { seen[line] = 1; opts.push({ t: line, ok: 0 }); }
    }
    shuffle(opts);
    var bub = ""; for (var i = 0; i < dialogue.log.length; i++) bub += '<div class="g-dd-bub ' + (dialogue.log[i].me ? "g-dd-me" : "g-dd-them") + '"><div class="g-dd-en">' + esc(dialogue.log[i].en) + '</div><div class="g-dd-th">' + esc(dialogue.log[i].th) + '</div></div>';
    var tiles = ""; for (i = 0; i < opts.length; i++) tiles += '<button class="g-dd-opt" data-ok="' + opts[i].ok + '">' + esc(opts[i].t) + '</button>';
    st.innerHTML = '<div class="g-dd-title">🎭 ' + esc(dialogue.conv.title || "") + ' <span>(' + esc(dialogue.conv.roleB + " / คุณ=" + dialogue.conv.roleA) + ')</span></div>' +
      '<div class="g-dd-log">' + bub + '</div>' +
      '<div class="g-sp-hint">คุณ (' + esc(dialogue.conv.roleA) + ') จะพูดว่าอะไรต่อ?</div>' +
      '<div class="g-dd-opts">' + tiles + '</div>';
    [].forEach.call(st.querySelectorAll(".g-dd-opt"), function (b) {
      b.onclick = function () {
        var ok = b.getAttribute("data-ok") === "1";
        if (ok) {
          dialogue.log.push({ me: true, en: correct.en, th: correct.th }); dialogue.idx++;
          try { say(correct.en); } catch (e) {} popFx("✓", true); dialogue.step();
        } else {
          dialogue.hearts--; b.className += " g-tile-bad"; popFx("✗", false);
          var hud = document.getElementById("g-hud"); if (hud) hud.innerHTML = dialogue.hud();
          if (dialogue.hearts <= 0) { document.getElementById("g-stage").innerHTML = endCard("dialogue", dialogue.score, "ผ่านฉากได้ (ฉาก)"); if (V()) wireChrome(V()); }
        }
      };
    });
  };

  /* ==================== 14) PRESS YOUR LUCK (เดิมพันคำ) — bank/push ==================== */
  var gamble = {};
  var GLV = ["A1", "A2", "B1", "B2", "C1"];
  gamble.render = function (v) {
    var pool = wordPool();
    if (pool.length < 8) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    gamble.by = {}; for (var i = 0; i < pool.length; i++) { var L = pool[i].g || "B1"; (gamble.by[L] = gamble.by[L] || []).push(pool[i]); }
    gamble.all = pool; gamble.banked = 0; gamble.pot = 0; gamble.diff = 0;
    v.innerHTML = shellLives("g-stage", gamble.hud());
    wireChrome(v);
    gamble.ask();
  };
  gamble.hud = function () { return '<span class="g-pl-pot">พอต ' + gamble.pot + '</span><span class="g-score">💰 ' + gamble.banked + '</span>'; };
  gamble.bucket = function (d) { var L = GLV[Math.min(d, GLV.length - 1)]; var b = gamble.by[L]; return (b && b.length >= 4) ? b : gamble.all; };
  gamble.ask = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var hud = document.getElementById("g-hud"); if (hud) hud.innerHTML = gamble.hud();
    var b = gamble.bucket(gamble.diff), it = b[randn(b.length)];
    var opts = [{ t: it.mt, ok: 1 }], seen = {}, k = 0; seen[it.mt] = 1;
    while (opts.length < 3 && k++ < 25) { var r = gamble.all[randn(gamble.all.length)]; if (r.mt && !seen[r.mt]) { seen[r.mt] = 1; opts.push({ t: r.mt, ok: 0 }); } }
    shuffle(opts);
    var worth = gamble.diff + 1;
    var tiles = ""; for (var i = 0; i < opts.length; i++) tiles += '<button class="g-pl-opt" data-ok="' + opts[i].ok + '">' + esc(opts[i].t) + '</button>';
    st.innerHTML = '<div class="g-pl-lvl">ระดับ ' + esc(GLV[Math.min(gamble.diff, 4)]) + ' · ตอบถูกได้ +' + worth + '</div>' +
      '<div class="g-sp-word">' + esc(it.w) + '</div>' +
      '<div class="g-sp-hint">ความหมายคือ?</div>' +
      '<div class="g-pl-opts">' + tiles + '</div>';
    [].forEach.call(st.querySelectorAll(".g-pl-opt"), function (btn) {
      btn.onclick = function () {
        if (btn.getAttribute("data-ok") === "1") { gamble.pot += worth; popFx("+" + worth, true); gamble.choice(); }
        else { popFx("✗ พอตหาย!", false); gamble.pot = 0; document.getElementById("g-stage").innerHTML = endCard("gamble", gamble.banked, "เก็บเงินได้ (แต้ม)"); if (V()) wireChrome(V()); }
      };
    });
  };
  gamble.choice = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var hud = document.getElementById("g-hud"); if (hud) hud.innerHTML = gamble.hud();
    st.innerHTML = '<div class="g-pl-pot-big">🪙 ' + gamble.pot + '</div>' +
      '<div class="g-sp-hint">เก็บไว้เลย หรือเสี่ยงลุยคำที่ยากขึ้น?</div>' +
      '<div class="g-pl-choice"><button class="g-btn g-pl-bank">💰 เก็บ (+' + gamble.pot + ')</button>' +
      '<button class="g-pl-push">🔥 ลุยต่อ (คำยากขึ้น)</button></div>';
    st.querySelector(".g-pl-bank").onclick = function () { gamble.banked += gamble.pot; gamble.pot = 0; gamble.diff = 0; popFx("💰 เก็บแล้ว", true); gamble.ask(); };
    st.querySelector(".g-pl-push").onclick = function () { if (gamble.diff < 4) gamble.diff++; gamble.ask(); };
  };

  /* ==================== 15) HIDDEN GROUPS (จับกลุ่มลับ) — Connections, lives ==================== */
  var groups = {};
  groups.render = function (v) {
    var d = (window.S && S.data) || [], seeds = [], i;
    for (i = 0; i < d.length; i++) { var x = d[i]; if (x.w && x.mt && String(x.w).indexOf(" ") < 0 && x.sy && x.sy.length >= 3) seeds.push(x); }
    if (seeds.length < 8) { v.innerHTML = poolWarn(); wirePoolWarn(v); return; }
    var built = groups.build(seeds);
    if (!built) { v.innerHTML = '<div class="g-load">เตรียมด่านไม่สำเร็จ ลองใหม่</div>'; return; }
    groups.g = built; groups.lives = 4; groups.solved = 0; groups.sel = [];
    var tiles = [], gi;
    for (gi = 0; gi < built.length; gi++) for (var j = 0; j < built[gi].words.length; j++) tiles.push({ w: built[gi].words[j], gi: gi });
    groups.tiles = shuffle(tiles);
    v.innerHTML = shellLives("g-stage", groups.hud());
    wireChrome(v);
    groups.paint();
  };
  groups.build = function (seeds) {
    for (var attempt = 0; attempt < 25; attempt++) {
      var used = {}, gs = [], pool = shuffle(seeds.slice()), i;
      for (i = 0; i < pool.length && gs.length < 4; i++) {
        var seed = pool[i], sk = norm(seed.w); if (used[sk]) continue;
        var syn = [], j;
        for (j = 0; j < seed.sy.length && syn.length < 3; j++) { var s = String(seed.sy[j]); if (s.indexOf(" ") >= 0) continue; var nk = norm(s); if (!nk || nk === sk || used[nk]) continue; var dup = false, q; for (q = 0; q < syn.length; q++) if (norm(syn[q]) === nk) dup = true; if (!dup) syn.push(s); }
        if (syn.length < 3) continue;
        used[sk] = 1; for (j = 0; j < 3; j++) used[norm(syn[j])] = 1;
        gs.push({ label: seed.mt, seed: seed.w, words: [seed.w, syn[0], syn[1], syn[2]] });
      }
      if (gs.length === 4) return gs;
    }
    return null;
  };
  groups.hud = function () { var hh = ""; for (var i = 0; i < 4; i++) hh += (i < groups.lives ? "❤️" : "🤍"); return '<span class="g-dd-hearts">' + hh + '</span><span class="g-score">' + groups.solved + '/4</span>'; };
  groups.paint = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var COL = ["#7c3aed", "#0891b2", "#ca8a04", "#db2777"];
    var solvedRows = "", gi;
    for (gi = 0; gi < groups.g.length; gi++) if (groups.g[gi].done) solvedRows += '<div class="g-hg-solved" style="background:' + COL[gi] + '"><b>' + esc(groups.g[gi].label) + '</b> ' + esc(groups.g[gi].words.join(" · ")) + '</div>';
    var grid = "", i;
    for (i = 0; i < groups.tiles.length; i++) { var tl = groups.tiles[i]; if (tl.done) continue; var selIdx = groups.sel.indexOf(i); grid += '<button class="g-hg-tile' + (selIdx >= 0 ? " g-hg-sel" : "") + '" data-i="' + i + '">' + esc(tl.w) + '</button>'; }
    st.innerHTML = solvedRows + '<div class="g-sp-hint">เลือกคำที่เป็นพวกเดียวกัน 4 คำ</div><div class="g-hg-grid">' + grid + '</div>';
    var hud = document.getElementById("g-hud"); if (hud) hud.innerHTML = groups.hud();
    [].forEach.call(st.querySelectorAll(".g-hg-tile"), function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute("data-i"), 10), at = groups.sel.indexOf(i);
        if (at >= 0) groups.sel.splice(at, 1); else if (groups.sel.length < 4) groups.sel.push(i);
        if (groups.sel.length === 4) groups.check(); else groups.paint();
      };
    });
  };
  groups.check = function () {
    var gi = groups.tiles[groups.sel[0]].gi, all = true, i;
    for (i = 1; i < 4; i++) if (groups.tiles[groups.sel[i]].gi !== gi) all = false;
    if (all) {
      for (i = 0; i < 4; i++) groups.tiles[groups.sel[i]].done = true;
      groups.g[gi].done = true; groups.solved++; groups.sel = []; popFx("✓ กลุ่ม!", true);
      if (groups.solved === 4) { var score = 40 + groups.lives * 5; document.getElementById("g-stage").innerHTML = endCard("groups", score, "หากลุ่มครบ · เหลือ ❤️" + groups.lives); if (V()) wireChrome(V()); return; }
      groups.paint();
    } else {
      groups.lives--; groups.sel = []; popFx("✗ ไม่ใช่พวก", false);
      if (groups.lives <= 0) { document.getElementById("g-stage").innerHTML = endCard("groups", groups.solved * 10, "หากลุ่มได้ (กลุ่ม)"); if (V()) wireChrome(V()); return; }
      groups.paint();
    }
  };

  /* ==================== 16) FRAME ARCHITECT (สถาปนิกประโยค) ==================== */
  var frame = {};
  var framePool = null;
  function loadFrame(cb) {
    if (framePool) { cb(); return; }
    fetch("data/structure.json").then(function (r) { return r.json(); }).then(function (rows) {
      var out = [], i, j, k;
      for (i = 0; i < rows.length; i++) {
        var pats = rows[i].patterns || [];
        for (j = 0; j < pats.length; j++) {
          var p = pats[j]; if (!p.frame || !p.examples) continue;
          for (k = 0; k < p.examples.length; k++) {
            var ex = p.examples[k]; if (!ex || !ex.en) continue;
            var parts = String(ex.en).replace(/\s+/g, " ").trim().split(" ");
            if (parts.length >= 4 && parts.length <= 8) { out.push({ frame: p.frame, name: p.name_th || "", meaning: p.meaning_th || "", en: ex.en, parts: parts, th: ex.th || "" }); break; }
          }
        }
      }
      framePool = out; cb();
    }).catch(function () { framePool = null; cb(); });
  }
  frame.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดโครงประโยค…</div>';
    loadFrame(function () {
      if (!framePool || framePool.length < 6) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      v.innerHTML = shell("g-stage");
      RUN.begin("frame", 35000, function () { document.getElementById("g-stage").innerHTML = endHtml("frame", "ต่อประโยคถูก (ประโยค)"); wireChrome(v); });
      wireChrome(v);
      frame.next();
    });
  };
  function frameHtml(fr) { return String(fr).replace(/\[[^\]]*\]/g, function (m) { return '<span class="g-fa-slot">' + esc(m.replace(/[\[\]]/g, "")) + '</span>'; }).replace(/\+/g, '<span class="g-fa-plus">+</span>'); }
  frame.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var it = framePool[randn(framePool.length)];
    frame.answer = it.parts; frame.sentence = it.en; frame.built = [];
    var order = it.parts.slice(); shuffle(order);
    var chips = ""; for (var i = 0; i < order.length; i++) chips += '<button class="g-lu-tile" data-w="' + esc(order[i]) + '">' + esc(order[i]) + '</button>';
    st.innerHTML = '<div class="g-fa-blueprint">' + frameHtml(it.frame) + '</div>' +
      (it.th ? '<div class="g-fa-th">' + esc(it.th) + '</div>' : '') +
      '<div class="g-lu-slots" id="g-lu-slots"></div>' +
      '<div class="g-sp-hint">ต่อคำให้เป็นประโยคตามโครง</div>' +
      '<div class="g-lu-tiles">' + chips + '</div>';
    frame.draw();
    [].forEach.call(st.querySelectorAll(".g-lu-tile"), function (b) {
      b.onclick = function () {
        if (!RUN.running || b.disabled) return;
        var want = frame.answer[frame.built.length];
        if (norm(b.getAttribute("data-w")) === norm(want)) {
          b.disabled = true; b.className += " g-tile-used"; frame.built.push(b.getAttribute("data-w")); frame.draw();
          if (frame.built.length === frame.answer.length) { RUN.good(2600); popFx("✓ +1", true); try { say(frame.sentence); } catch (e) {} setTimeout(function () { if (RUN.running) frame.next(); }, 450); }
        } else { RUN.bad(2600); popFx("✗", false); var box = document.getElementById("g-lu-slots"); if (box) { box.className = "g-lu-slots g-shake"; setTimeout(function () { if (box) box.className = "g-lu-slots"; }, 400); } }
      };
    });
  };
  frame.draw = function () {
    var box = document.getElementById("g-lu-slots"); if (!box) return;
    var h = "", i;
    for (i = 0; i < frame.built.length; i++) h += '<span class="g-lu-word">' + esc(frame.built[i]) + '</span>';
    for (i = frame.built.length; i < frame.answer.length; i++) h += '<span class="g-lu-blank"></span>';
    box.innerHTML = h;
  };

  /* ---------- pool-not-available helper (for deck-dependent games) ---------- */
  /* ==================== FORMAL UPGRADE (คำทางการ) ==================== */
  // deck-independent: fetches data/formal.json. show a casual base word -> pick the formal upgrade.
  var upform = {};
  var upformPool = null;   // { items:[{base, base_th, formals:[w..]}], all:[w..] }
  function loadUpform(cb) {
    if (upformPool) { cb(); return; }
    fetch("data/formal.json").then(function (r) { return r.json(); }).then(function (rows) {
      var items = [], all = [], seen = {}, i, k;
      for (i = 0; i < rows.length; i++) {
        var e = rows[i], fam = e.family || [];
        if (!e.base || !fam.length) continue;
        var fs = [];
        for (k = 0; k < fam.length; k++) {
          var w = fam[k] && fam[k].w; if (!w || String(w).indexOf(" ") >= 0) continue;   // single-word formals only (clean tiles)
          fs.push(w); if (!seen[norm(w)]) { seen[norm(w)] = 1; all.push(w); }
        }
        if (fs.length) items.push({ base: e.base, base_th: e.base_th || "", formals: fs });
      }
      upformPool = { items: items, all: all };
      cb();
    }).catch(function () { cb(); });
  }
  upform.render = function (v) {
    v.innerHTML = '<div class="g-load">กำลังโหลดคำทางการ…</div>';
    loadUpform(function () {
      if (!upformPool || upformPool.items.length < 6 || upformPool.all.length < 8) { v.innerHTML = '<div class="g-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; }
      v.innerHTML = shell("g-stage");
      RUN.begin("upform", 22000, function () { document.getElementById("g-stage").innerHTML = endHtml("upform", "อัปคำถูก (คำ)"); wireChrome(v); });
      wireChrome(v);
      upform.next();
    });
  };
  upform.next = function () {
    var st = document.getElementById("g-stage"); if (!st) return;
    var P = upformPool, it = P.items[randn(P.items.length)];
    var correct = it.formals[randn(it.formals.length)];
    var itset = {}; for (var z = 0; z < it.formals.length; z++) itset[norm(it.formals[z])] = 1;
    var opts = [{ w: correct, ok: true }], guard = 0;
    while (opts.length < 3 && guard++ < 50) {
      var d = P.all[randn(P.all.length)];
      if (itset[norm(d)]) continue;
      var dup = false; for (var y = 0; y < opts.length; y++) if (norm(opts[y].w) === norm(d)) { dup = true; break; }
      if (!dup) opts.push({ w: d, ok: false });
    }
    opts = shuffle(opts);
    var html = '<div class="g-uf-cue">👔 พูดแบบทางการว่า?</div>' +
      '<div class="g-uf-base">' + esc(it.base) + (it.base_th ? ' <span class="g-uf-th">' + esc(it.base_th) + '</span>' : '') + '</div>' +
      '<div class="g-uf-hint">แตะคำทางการที่ใช้แทนได้</div><div class="g-uf-opts">';
    for (var i = 0; i < opts.length; i++) html += '<button class="g-uf-opt" data-ok="' + (opts[i].ok ? 1 : 0) + '" data-w="' + esc(opts[i].w) + '">' + esc(opts[i].w) + '</button>';
    html += '</div>';
    st.innerHTML = html;
    [].forEach.call(st.querySelectorAll(".g-uf-opt"), function (b) {
      b.onclick = function () {
        if (!RUN.running) return;
        if (b.getAttribute("data-ok") === "1") { RUN.good(2000); popFx("+1", true); try { say(b.getAttribute("data-w")); } catch (e) {} }
        else { RUN.bad(3000); popFx("✗", false); }
        upform.next();
      };
    });
  };

  function poolWarn() {
    return '<div class="g-load">เกมนี้ต้องใช้คลัง<b>คำศัพท์</b> — เปิดจากคลังคำ (เช่น Oxford)<br>' +
      '<button class="g-btn g-goword" data-g-goword="1">ไปคลัง Oxford</button>' +
      '<button class="g-back2" data-g-back="1">‹ กลับเมนูเกม</button></div>';
  }
  function wirePoolWarn(v) {
    var g = v.querySelector("[data-g-goword]"); if (g) g.onclick = function () { if (window.loadDeck) loadDeck("oxford"); active = null; started = false; goMode("game"); };
    var b = v.querySelector("[data-g-back]"); if (b) b.onclick = function () { active = null; started = false; render(v); };
  }

  /* ---------- hub ---------- */
  var GAMES = {
    sprint: { icon: "⚡", th: "สายฟ้าความหมาย", d: "ปัดเลือกความหมายให้ไว 20 วิ", r: sprint.render, color: "var(--accent)" },
    sameopp: { icon: "⚖️", th: "เหมือน–ตรงข้าม", d: "เลือก เหมือน/ตรงข้าม/ไม่เกี่ยว", r: sameopp.render, color: "#7c3aed" },
    tower: { icon: "🗼", th: "หอคอยเอาชีวิตรอด", d: "ตอบผิดจบเลย! ปีนให้สูงสุด", r: tower.render, color: "#b91c1c" },
    fillear: { icon: "👂", th: "เติมจากเสียง", d: "ฟังประโยค เลือกคำที่หายไป", r: fillear.render, color: "#0891b2" },
    chef: { icon: "👨‍🍳", th: "คู่หูคำ", d: "จับคำที่ใช้คู่กัน (collocation)", r: chef.render, color: "#e8730a" },
    idiomfill: { icon: "🧩", th: "เติมสำนวน", d: "เติมคำในสำนวนให้ถูก", r: idiomfill.render, color: "#ca8a04" },
    sharper: { icon: "🎯", th: "คำที่คมกว่า", d: "เลือกคำที่ตรง/คมกว่า", r: sharper.render, color: "#db2777" },
    echo: { icon: "🔊", th: "เสียงลึกลับ", d: "ฟังเสียงแล้วสะกดคำ", r: echo.render, color: "#0e7490" },
    lineup: { icon: "🚃", th: "เรียงประโยค", d: "เรียงคำให้เป็นประโยค", r: lineup.render, color: "#2563eb" },
    ladder: { icon: "🏗️", th: "บันไดกริยา", d: "ปีนโดยพิมพ์ V2 → V3", r: ladder.render, color: "#15803d" },
    memory: { icon: "🃏", th: "ความจำคู่คำ", d: "พลิกการ์ดจับคู่ อังกฤษ↔ไทย", r: memory.render, color: "#0d9488" },
    worddial: { icon: "🎚️", th: "สเกลคำ", d: "เรียงคำตามระดับความแรง/ทางการ", r: worddial.render, color: "#9333ea" },
    dialogue: { icon: "🎭", th: "บทสนทนาพลิกเกม", d: "เดินบทสนทนา เลือกประโยคตอบ", r: dialogue.render, color: "#c026d3" },
    gamble: { icon: "🎲", th: "เดิมพันคำ", d: "สะสมพอต เก็บหรือลุยต่อ", r: gamble.render, color: "#ea580c" },
    groups: { icon: "🧩", th: "จับกลุ่มลับ", d: "หา 4 กลุ่มซ่อนใน 16 คำ", r: groups.render, color: "#4f46e5" },
    frame: { icon: "🏛️", th: "สถาปนิกประโยค", d: "ต่อคำตามโครงประโยค", r: frame.render, color: "#0369a1" },
    upform: { icon: "👔", th: "อัปคำให้ทางการ", d: "เลือกคำทางการแทนคำง่ายๆ", r: upform.render, color: "#6366f1" }
  };
  var GORDER = ["sprint", "upform", "sameopp", "tower", "fillear", "chef", "idiomfill", "sharper", "echo", "lineup", "ladder",
    "memory", "worddial", "gamble", "dialogue", "groups", "frame"];

  function renderHub(v) {
    var h = ['<div class="g-hub">'];
    h.push('<div class="g-hub-hero">🎮 เกมคำศัพท์</div>');
    h.push('<div class="g-hub-sub">เล่นสั้นๆ สนุกๆ ทำสถิติของตัวเองให้ดีขึ้นเรื่อยๆ</div>');
    h.push('<div class="g-hub-grid">');
    for (var i = 0; i < GORDER.length; i++) {
      var id = GORDER[i], g = GAMES[id], b = best(id);
      h.push('<button class="g-card" data-g="' + id + '" style="--gc:' + g.color + '">' +
        '<div class="g-card-i">' + g.icon + '</div><div class="g-card-t">' + esc(g.th) + '</div>' +
        '<div class="g-card-d">' + esc(g.d) + '</div>' +
        (b ? '<div class="g-card-b">🏆 สถิติ ' + b + '</div>' : '') + '</button>');
    }
    h.push('</div></div>');
    v.innerHTML = h.join("");
    [].forEach.call(v.querySelectorAll("[data-g]"), function (b) {
      b.onclick = function () { active = b.getAttribute("data-g"); started = false; startActive(v); };
    });
  }

  function startActive(v) {
    if (!active || !GAMES[active]) { renderHub(v); return; }
    started = true;
    GAMES[active].r(v);
  }

  function render(v) {
    if (active && GAMES[active]) { if (!started) startActive(v); /* else: game owns its DOM */ }
    else renderHub(v);
  }

  return {
    render: render,
    open: function () { active = null; started = false; goMode("game"); },
    leave: function () { RUN.stop(); },
    // campaign entry: run one existing game as an encounter, report {gid,score,passed} (or {aborted:true}) to cb.
    // opts = { minScore, oneScene, filter:{g,level} }. Renders into #view (the campaign owns S.mode).
    play: function (gid, opts, cb) {
      opts = opts || {};
      if (!GAMES[gid]) { if (cb) cb({ gid: gid, score: 0, passed: false, missing: true }); return; }
      CAMP = { threshold: opts.minScore || 1, oneScene: !!opts.oneScene, filter: opts.filter || null, onDone: cb };
      active = gid; started = false;
      var v = V(); if (v) startActive(v);
    }
  };
})();
