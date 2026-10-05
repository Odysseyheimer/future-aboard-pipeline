/* structure.js — "โครงสร้างประโยค" a sentence-structure learning resource + practice.
   Browse: category list -> pattern list -> pattern detail (frame with highlighted slots,
   slot roles, meaning, examples w/ speak, transformations, Thai-error, tip).
   Practice: a quiz built FROM the same data — "เลือกประโยคที่ถูก" (from thai_err) and
   "ใช้โครงไหน" (identify the structure of an example). Hidden mode "structure". ES5.
   Uses S, esc, speak, speakSlow, goMode. Lazy-loads data/structure.json. */
PT.structure = (function () {
  "use strict";
  var DATA = null, loading = false, waiters = [];
  var cat = -1;   // selected category index; -1 = category list
  var pat = -1;   // selected pattern index; -1 = pattern list
  // practice state
  var pmode = null;      // null=browse, 'q'=question in progress, 'result'
  var sess = null, si = 0, sscore = 0, smiss = [], answered = false;

  function liveView() { return document.getElementById("view"); }
  function rerender() { var v = liveView(); if (v && S.mode === "structure") render(v); }

  function load(cb) {
    if (DATA) { if (cb) cb(); return; }
    if (cb) waiters.push(cb);
    if (loading) return;
    loading = true;
    fetch("data/structure.json").then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (d) {
      DATA = d; loading = false;
      var w = waiters; waiters = [];
      for (var i = 0; i < w.length; i++) { try { w[i](); } catch (e) {} }
    }).catch(function () {
      loading = false; waiters = [];
      var v = liveView();
      if (v && S.mode === "structure") {
        v.innerHTML = '<button class="st2-retry" id="st-retry">โหลดไม่สำเร็จ — แตะเพื่อลองใหม่</button>';
        var r = document.getElementById("st-retry");
        if (r) r.onclick = function () { rerender(); };
      }
    });
  }

  // ---------- helpers ----------
  function randn(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randn(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function count() { var n = 0; for (var i = 0; i < (DATA ? DATA.length : 0); i++) n += DATA[i].patterns.length; return n; }
  function locate(n) { var k = 0; for (var ci = 0; ci < DATA.length; ci++) { var len = DATA[ci].patterns.length; if (n < k + len) return { ci: ci, pi: n - k }; k += len; } return { ci: 0, pi: 0 }; }

  function render(v) {
    if (!DATA) { v.innerHTML = '<div class="empty">กำลังโหลด…</div>'; load(rerender); return; }
    if (pmode === 'q') { renderQuestion(v); return; }
    if (pmode === 'result') { renderResult(v); return; }
    if (cat >= 0 && DATA[cat]) {
      if (pat >= 0 && DATA[cat].patterns[pat]) renderPattern(v, DATA[cat], DATA[cat].patterns[pat]);
      else renderPatternList(v, DATA[cat]);
    } else renderCats(v);
  }

  function renderCats(v) {
    var h = ['<div class="st2-wrap">'];
    h.push('<div class="st2-hero">📐 โครงสร้างประโยค</div>');
    h.push('<div class="st2-intro">ภาษาอังกฤษทุกประโยคมี “โครง” — แค่เติมคำนาม/กริยา/คำคุณศัพท์ลงในช่อง แล้วเรียนรู้ว่าถ้าเปลี่ยนส่วนไหน ประโยคจะเปลี่ยนยังไง</div>');
    h.push('<button class="st2-practice-btn" id="st-practice">🎯 ฝึกโครงสร้าง — ทดสอบตัวเอง</button>');
    h.push('<div class="st2-cgrid">');
    for (var i = 0; i < DATA.length; i++) {
      var c = DATA[i];
      h.push('<button class="st2-ccard" data-st-cat="' + i + '"><div class="st2-cn">' + esc(c.cat_th) + '</div>' +
        '<div class="st2-cc">' + (c.patterns ? c.patterns.length : 0) + ' โครงสร้าง</div></button>');
    }
    h.push('</div></div>');
    v.innerHTML = h.join("");
    document.getElementById("st-practice").onclick = startPractice;
    [].forEach.call(v.querySelectorAll("[data-st-cat]"), function (b) {
      b.onclick = function () { cat = parseInt(b.getAttribute("data-st-cat"), 10); pat = -1; render(v); };
    });
  }

  function renderPatternList(v, c) {
    var h = ['<div class="st2-wrap">'];
    h.push('<div class="st2-bar"><button class="st2-back" id="st-back">‹ ทุกหมวด</button><div class="st2-title">' + esc(c.cat_th) + '</div></div>');
    for (var i = 0; i < c.patterns.length; i++) {
      var p = c.patterns[i];
      h.push('<button class="st2-pcard" data-st-pat="' + i + '"><div class="st2-pf">' + frameHtml(p.frame) + '</div>' +
        '<div class="st2-pn">' + esc(p.name_th || p.name_en || "") + '</div></button>');
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    document.getElementById("st-back").onclick = function () { cat = -1; render(v); };
    [].forEach.call(v.querySelectorAll("[data-st-pat]"), function (b) {
      b.onclick = function () { pat = parseInt(b.getAttribute("data-st-pat"), 10); render(v); };
    });
  }

  // render *cat:token* markers as colour-coded highlights (cat: v/b/a/f); rest plain
  function hlHtml(s) {
    var parts = String(s).split(/(\*[a-z]:[^*]+\*)/), h = "", i;
    for (i = 0; i < parts.length; i++) {
      var g = parts[i];
      if (!g) continue;
      var m = /^\*([a-z]):([^*]+)\*$/.exec(g);
      if (m) h += '<mark class="st2-hl st2-hl-' + m[1] + '">' + esc(m[2]) + '</mark>';
      else h += esc(g);
    }
    return h;
  }
  // one row of the conjugation table: label -> sentence (with highlights) + 🔊
  function formRow(label, ex) {
    var clean = String(ex).replace(/\*[a-z]:([^*]+)\*/g, "$1");
    return '<div class="st2-frow"><span class="st2-fl">' + esc(label) + '</span>' +
      '<span class="st2-fx">' + hlHtml(ex) + ' <button type="button" class="st2-spk" data-say="' + esc(clean) + '">🔊</button></span></div>';
  }

  function frameHtml(fr) {
    var parts = String(fr).split(/(\[[^\]]*\])/), h = "", i;
    for (i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!seg) continue;
      if (/^\[[^\]]*\]$/.test(seg)) h += '<span class="st2-slot">' + esc(seg.replace(/^\[|\]$/g, "")) + '</span>';
      else h += esc(seg);
    }
    return h;
  }

  function renderPattern(v, c, p) {
    var h = ['<div class="st2-wrap st2-detail">'];
    h.push('<div class="st2-bar"><button class="st2-back" id="st-pback">‹ ' + esc(c.cat_th) + '</button></div>');
    h.push('<div class="st2-dname">' + esc(p.name_th || "") + (p.name_en ? ' <span>' + esc(p.name_en) + '</span>' : '') + '</div>');
    h.push('<div class="st2-frame">' + frameHtml(p.frame) + '</div>');
    if (p.slots && p.slots.length) {
      h.push('<div class="st2-slots">');
      for (var s = 0; s < p.slots.length; s++) h.push('<div class="st2-srow"><span class="st2-st">' + esc(p.slots[s].t) + '</span><span class="st2-sr">' + esc(p.slots[s].r) + '</span></div>');
      h.push('</div>');
    }
    if (p.meaning_th) h.push('<div class="st2-mean">' + esc(p.meaning_th) + '</div>');
    if (p.use_th) h.push('<div class="st2-use"><div class="st2-use-h">💬 ใช้ตอนไหน · เอาไปใช้ยังไง</div><div class="st2-use-b">' + esc(p.use_th) + '</div></div>');
    if (p.forms) {
      var f = p.forms;
      h.push('<button type="button" class="st2-forms-tog" data-forms-tog="1">🔄 ดูรูปแบบประโยค (ผัน I/you/he… · อดีต/ปัจจุบัน/อนาคต) <span class="st2-ft-ar">▾</span></button>');
      h.push('<div class="st2-forms" style="display:none">');
      h.push('<div class="st2-flegend">สีบอกว่า<b>ทำไมคำถึงเปลี่ยน</b> (เทียบรูปตั้งต้น I/You/We/They · ปัจจุบัน):<div class="st2-lgrow">' +
        '<span class="st2-lg st2-hl-v">กริยาหลัก</span>' +
        '<span class="st2-lg st2-hl-b">to be</span>' +
        '<span class="st2-lg st2-hl-a">กริยาช่วย/modal</span>' +
        '<span class="st2-lg st2-hl-f">อนาคต (will)</span></div></div>');
      if (f.note_th) h.push('<div class="st2-fnote">' + esc(f.note_th) + '</div>');
      if (f.pron && f.pron.length) {
        h.push('<div class="st2-fsec">ผันตามประธาน</div>');
        for (var pi = 0; pi < f.pron.length; pi++) h.push(formRow(f.pron[pi].p, f.pron[pi].ex));
      }
      if (f.noun_th) h.push('<div class="st2-fnoun">📝 ' + esc(f.noun_th) + '</div>');
      if (f.tense && f.tense.length) {
        h.push('<div class="st2-fsec">ผันตามกาล (เวลา)</div>');
        for (var ti = 0; ti < f.tense.length; ti++) h.push(formRow(f.tense[ti].t, f.tense[ti].ex));
      }
      h.push('</div>');
    }
    if (p.examples && p.examples.length) {
      h.push('<div class="st2-sec">ตัวอย่าง</div>');
      for (var e = 0; e < p.examples.length; e++) {
        var ex = p.examples[e];
        h.push('<div class="st2-ex"><div class="st2-ex-en">' + esc(ex.en) +
          ' <button type="button" class="st2-spk" data-say="' + esc(ex.en) + '">🔊</button>' +
          '<button type="button" class="st2-spk" data-slow="' + esc(ex.en) + '">🐢</button></div>' +
          (ex.th ? '<div class="st2-ex-th">' + esc(ex.th) + '</div>' : '') + '</div>');
      }
    }
    if (p.transform && p.transform.length) {
      h.push('<div class="st2-sec">ถ้าเปลี่ยนส่วน → ประโยคเปลี่ยน</div>');
      for (var t = 0; t < p.transform.length; t++) {
        var tr = p.transform[t];
        h.push('<div class="st2-tr"><div class="st2-tr-l">🔀 ' + esc(tr.label_th) + '</div>' +
          '<div class="st2-tr-en">' + esc(tr.en) + '</div>' + (tr.th ? '<div class="st2-tr-th">' + esc(tr.th) + '</div>' : '') + '</div>');
      }
    }
    if (p.thai_err && (p.thai_err.wrong || p.thai_err.right)) {
      var te = p.thai_err;
      h.push('<div class="st2-sec">คนไทยมักพูดผิด</div>');
      h.push('<div class="st2-err">' +
        (te.wrong ? '<div class="st2-err-x"><span class="st2-x">✗</span> ' + esc(te.wrong) + '</div>' : '') +
        (te.right ? '<div class="st2-err-o"><span class="st2-o">✓</span> ' + esc(te.right) + ' <button type="button" class="st2-spk" data-say="' + esc(te.right) + '">🔊</button></div>' : '') +
        (te.why_th ? '<div class="st2-err-w">' + esc(te.why_th) + '</div>' : '') + '</div>');
    }
    if (p.tip_th) h.push('<div class="st2-tip">💡 ' + esc(p.tip_th) + '</div>');
    h.push('</div>');
    v.innerHTML = h.join("");
    document.getElementById("st-pback").onclick = function () { pat = -1; render(v); };
    var ftog = v.querySelector("[data-forms-tog]");
    if (ftog) ftog.onclick = function () {
      var panel = v.querySelector(".st2-forms");
      if (!panel) return;
      var open = panel.style.display !== "none";
      panel.style.display = open ? "none" : "block";
      var ar = ftog.querySelector(".st2-ft-ar");
      if (ar) ar.textContent = open ? "▾" : "▴";
    };
    wireSpeak(v);
  }

  function wireSpeak(v) {
    [].forEach.call(v.querySelectorAll(".st2-spk"), function (b) {
      b.onclick = function () {
        if (b.getAttribute("data-slow") !== null) { try { speakSlow(b.getAttribute("data-slow")); } catch (e) {} }
        else { try { speak(b.getAttribute("data-say")); } catch (e) {} }
      };
    });
  }

  // ---------- practice ----------
  function buildSession(n) {
    var corr = [], which = [], ci, pi, p;
    for (ci = 0; ci < DATA.length; ci++) {
      for (pi = 0; pi < DATA[ci].patterns.length; pi++) {
        p = DATA[ci].patterns[pi];
        if (p.thai_err && p.thai_err.wrong && p.thai_err.right && p.thai_err.wrong !== p.thai_err.right)
          corr.push({ type: 'correct', ci: ci, pi: pi });
        if (p.examples && p.examples.length) which.push({ type: 'which', ci: ci, pi: pi });
      }
    }
    shuffle(corr); shuffle(which);
    var out = [], i = 0;
    while (out.length < n && (corr.length || which.length)) {
      if ((i % 2 === 0 && corr.length) || !which.length) { if (corr.length) out.push(corr.pop()); }
      else { if (which.length) out.push(which.pop()); }
      i++;
    }
    return out;
  }

  function startPractice() {
    load(function () {
      sess = buildSession(10); si = 0; sscore = 0; smiss = []; answered = false; pmode = 'q';
      rerender();
    });
  }

  function renderQuestion(v) {
    var q = sess[si], p = DATA[q.ci].patterns[q.pi];
    var h = ['<div class="st2-wrap st2-pr">'];
    h.push('<div class="st2-pr-top"><button class="st2-back" id="st-quit">‹ ออก</button>' +
      '<div class="st2-pr-meta">ข้อ ' + (si + 1) + '/' + sess.length + ' · คะแนน ' + sscore + '</div></div>');
    h.push('<div class="st2-pr-bar"><span style="width:' + Math.round((si / sess.length) * 100) + '%"></span></div>');

    if (q.type === 'correct') {
      var te = p.thai_err;
      var opts = shuffle([{ t: te.right, ok: true }, { t: te.wrong, ok: false }]);
      h.push('<div class="st2-pr-q">เลือกประโยคที่ <b>ถูกต้อง</b></div>');
      for (var o = 0; o < opts.length; o++)
        h.push('<button class="st2-opt" data-ok="' + (opts[o].ok ? '1' : '0') + '">' + esc(opts[o].t) + '</button>');
    } else {
      var ex = p.examples[randn(p.examples.length)];
      // distractor categories
      var others = [];
      for (var ci2 = 0; ci2 < DATA.length; ci2++) if (ci2 !== q.ci) others.push(DATA[ci2].cat_th);
      shuffle(others);
      var choices = [{ t: DATA[q.ci].cat_th, ok: true }];
      for (var d = 0; d < 3 && d < others.length; d++) choices.push({ t: others[d], ok: false });
      shuffle(choices);
      h.push('<div class="st2-pr-q">ประโยคนี้ใช้ <b>โครงสร้างแบบไหน</b>?</div>');
      h.push('<div class="st2-pr-ex">' + esc(ex.en) + (ex.th ? '<span>' + esc(ex.th) + '</span>' : '') + '</div>');
      for (var o2 = 0; o2 < choices.length; o2++)
        h.push('<button class="st2-opt st2-opt-cat" data-ok="' + (choices[o2].ok ? '1' : '0') + '">' + esc(choices[o2].t) + '</button>');
    }
    h.push('<div class="st2-pr-fb" id="st-fb"></div>');
    h.push('</div>');
    v.innerHTML = h.join("");
    document.getElementById("st-quit").onclick = function () { pmode = null; cat = -1; pat = -1; rerender(); };
    answered = false;
    [].forEach.call(v.querySelectorAll(".st2-opt"), function (b) {
      b.onclick = function () { if (!answered) answer(b, q, p); };
    });
  }

  function answer(btn, q, p) {
    answered = true;
    var ok = btn.getAttribute("data-ok") === "1";
    if (ok) sscore++; else smiss.push({ ci: q.ci, pi: q.pi });
    // mark all options
    var opts = liveView().querySelectorAll(".st2-opt");
    [].forEach.call(opts, function (b) {
      b.disabled = true;
      if (b.getAttribute("data-ok") === "1") b.className += " st2-opt-ok";
      else if (b === btn) b.className += " st2-opt-bad";
      else b.className += " st2-opt-dim";
    });
    var fb = document.getElementById("st-fb");
    var name = p.name_th || p.name_en || "";
    var expl = "";
    if (q.type === 'correct' && p.thai_err && p.thai_err.why_th) expl = esc(p.thai_err.why_th);
    else expl = 'โครง: ' + frameHtml(p.frame);
    fb.innerHTML = '<div class="st2-fb-in ' + (ok ? 'good' : 'bad') + '">' +
      '<div class="st2-fb-r">' + (ok ? '✓ ถูกต้อง' : '✗ ยังไม่ถูก') + ' — <b>' + esc(name) + '</b></div>' +
      '<div class="st2-fb-x">' + expl + '</div>' +
      '<button class="st2-fb-view" data-view="1">ดูโครงสร้างนี้ →</button>' +
      '<button class="st2-fb-next" data-next="1">' + (si + 1 >= sess.length ? 'ดูผล' : 'ข้อถัดไป') + ' ›</button>' +
      '</div>';
    fb.querySelector("[data-next]").onclick = function () {
      si++; if (si >= sess.length) pmode = 'result'; rerender();
    };
    fb.querySelector("[data-view]").onclick = function () {
      pmode = null; cat = q.ci; pat = q.pi; rerender();
    };
    var v = liveView(); if (v) { var f = v.querySelector(".st2-pr-fb"); if (f) f.scrollIntoView({ block: "nearest" }); }
  }

  function renderResult(v) {
    var pct = Math.round((sscore / sess.length) * 100);
    var h = ['<div class="st2-wrap st2-pr">'];
    h.push('<div class="st2-res"><div class="st2-res-i">' + (pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪') + '</div>' +
      '<div class="st2-res-s">' + sscore + '/' + sess.length + '</div>' +
      '<div class="st2-res-d">' + (pct >= 80 ? 'เก่งมาก!' : pct >= 50 ? 'ดีขึ้นเรื่อยๆ' : 'ฝึกต่อไปนะ') + '</div></div>');
    if (smiss.length) {
      h.push('<div class="st2-sec">ทบทวนโครงที่ยังพลาด</div>');
      for (var i = 0; i < smiss.length; i++) {
        var p = DATA[smiss[i].ci].patterns[smiss[i].pi];
        h.push('<button class="st2-miss" data-mci="' + smiss[i].ci + '" data-mpi="' + smiss[i].pi + '">' +
          esc(p.name_th || p.name_en || "") + ' <span>' + esc(DATA[smiss[i].ci].cat_th) + '</span></button>');
      }
    }
    h.push('<button class="st2-practice-btn" id="st-again">🎯 ฝึกอีกชุด</button>');
    h.push('<button class="st2-res-back" id="st-rback">‹ กลับไปหน้าโครงสร้าง</button>');
    h.push('</div>');
    v.innerHTML = h.join("");
    document.getElementById("st-again").onclick = startPractice;
    document.getElementById("st-rback").onclick = function () { pmode = null; cat = -1; pat = -1; rerender(); };
    [].forEach.call(v.querySelectorAll(".st2-miss"), function (b) {
      b.onclick = function () { pmode = null; cat = parseInt(b.getAttribute("data-mci"), 10); pat = parseInt(b.getAttribute("data-mpi"), 10); rerender(); };
    });
  }

  // open a specific structure for a given plan-day (cycles through all patterns)
  function openDay(day) {
    pmode = null;
    load(function () { var total = count() || 1; var n = ((Math.max(1, day | 0) - 1) % total); var loc = locate(n); cat = loc.ci; pat = loc.pi; });
    goMode("structure");
  }

  return {
    render: render,
    open: function () { pmode = null; cat = -1; pat = -1; goMode("structure"); },
    practice: function () { goMode("structure"); startPractice(); },
    openDay: openDay,
    dayNo: function (day) { return count() ? (((Math.max(1, day | 0) - 1) % count()) + 1) : 0; },
    reset: function () { pmode = null; cat = -1; pat = -1; }
  };
})();
