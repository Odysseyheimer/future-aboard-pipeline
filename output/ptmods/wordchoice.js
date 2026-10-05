/* PT.wordchoice — "เลือกใช้คำ" tab: near-synonym clusters (how each differs) + 4 games.
   ES5. Uses globals: esc, speak. Lazy-loads data/wordchoice.json.
   Cluster: {id, core_en, core_th, cat, scale_label_en, scale_label_th,
     words:[{w,pos,when_en,when_th,reg,scale,collocations,ex_en,ex_th}],
     quiz:[{s,a,why_th}], tip_en, tip_th} */
(function () {
  "use strict";
  window.PT = window.PT || {};

  var DATA = null, loading = false;
  var sel = -1;          // cluster index; -1 = list
  var cat = null;        // selected theme (null = theme grid)
  var q = "";            // search text
  var game = null;       // { type, ci, ... } current game state

  var REG_TH = { formal: "ทางการ", neutral: "กลางๆ", informal: "ไม่ทางการ" };

  function shuffle(a) { var i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function ri(n) { return Math.floor(Math.random() * n); }

  function load(cb) {
    if (DATA) { cb(); return; }
    if (loading) return;
    loading = true;
    fetch("data/wordchoice.json").then(function (r) { return r.json(); }).then(function (d) {
      DATA = d; loading = false; cb();
    }).catch(function () {
      loading = false;
      var v = document.getElementById("view");
      if (v) v.innerHTML = '<div class="empty">โหลดข้อมูลไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>';
    });
  }

  function render(v) {
    if (!DATA) { v.innerHTML = '<div class="empty">กำลังโหลด…</div>'; load(function () { render(v); }); return; }
    if (game) { renderGame(v); return; }
    if (sel < 0 || sel >= DATA.length) { renderList(v); } else { renderDetail(v, DATA[sel]); }
  }

  /* ---------------- list ---------------- */
  function matches(c, ql) {
    if (!ql) return true;
    if ((c.core_en || "").toLowerCase().indexOf(ql) !== -1) return true;
    if ((c.core_th || "").indexOf(ql) !== -1) return true;
    for (var i = 0; i < c.words.length; i++) if ((c.words[i].w || "").toLowerCase().indexOf(ql) !== -1) return true;
    return false;
  }

  function clusterCard(idx) {
    var cc = DATA[idx];
    var words = cc.words.map(function (x) { return esc(x.w); }).join(" · ");
    return '<button class="wc-card" data-i="' + idx + '"><div class="wc-card-w">' + words + '</div>' +
      '<div class="wc-card-m">' + esc(cc.core_th || cc.core_en || "") + '</div></button>';
  }

  function renderList(v) {
    var byC = {}, cats = [], i;
    for (i = 0; i < DATA.length; i++) { var g = DATA[i].cat || "อื่นๆ"; if (!byC[g]) { byC[g] = []; cats.push(g); } byC[g].push(i); }
    var ql = q.toLowerCase();
    var h = ['<div class="wc-wrap">'];
    h.push('<div class="wc-search"><input id="wc-q" type="search" placeholder="ค้นหาคำ / ความหมาย…" value="' + esc(q) + '"></div>');
    h.push('<button class="wc-rand" id="wc-rand">🎮 เล่นเกมสุ่ม</button>');
    if (ql) {
      var hits = [];
      for (i = 0; i < DATA.length; i++) if (matches(DATA[i], ql)) hits.push(i);
      h.push('<div class="wc-intro">' + hits.length + ' ผลลัพธ์</div>');
      for (i = 0; i < hits.length; i++) h.push(clusterCard(hits[i]));
    } else if (cat === null) {
      h.push('<div class="wc-intro">เลือกหมวด · ' + DATA.length + ' กลุ่มคำ</div><div class="wc-catgrid">');
      for (i = 0; i < cats.length; i++) {
        h.push('<button class="wc-catcard" data-cat="' + esc(cats[i]) + '"><div class="wc-catcard-t">' +
          esc(cats[i]) + '</div><div class="wc-catcard-n">' + byC[cats[i]].length + ' กลุ่ม</div></button>');
      }
      h.push('</div>');
    } else {
      h.push('<button class="wc-back" id="wc-catback">‹ ทุกหมวด</button>');
      h.push('<div class="wc-cat">' + esc(cat) + '</div>');
      var arr = byC[cat] || [];
      for (i = 0; i < arr.length; i++) h.push(clusterCard(arr[i]));
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    var qi = document.getElementById("wc-q");
    if (qi) qi.oninput = function () { q = qi.value; renderList(document.getElementById("view")); var n = document.getElementById("wc-q"); if (n) { n.focus(); try { n.setSelectionRange(q.length, q.length); } catch (e) {} } };
    var rb = document.getElementById("wc-rand");
    if (rb) rb.onclick = function () { var gi = ["match", "choose", "tag", "rank"][ri(4)]; startGame(gi, ri(DATA.length)); render(document.getElementById("view")); };
    var cb = document.getElementById("wc-catback");
    if (cb) cb.onclick = function () { cat = null; renderList(document.getElementById("view")); };
    [].forEach.call(v.querySelectorAll(".wc-catcard"), function (b) { b.onclick = function () { cat = b.getAttribute("data-cat"); renderList(document.getElementById("view")); }; });
    [].forEach.call(v.querySelectorAll(".wc-card"), function (b) { b.onclick = function () { sel = parseInt(b.getAttribute("data-i"), 10); render(document.getElementById("view")); }; });
  }

  /* ---------------- cluster detail ---------------- */
  function regBadge(reg) { var r = reg || "neutral"; return '<span class="wc-reg wc-reg-' + r + '">' + (REG_TH[r] || r) + '</span>'; }

  function renderDetail(v, c) {
    var words = c.words.slice().sort(function (a, b) { return (a.scale || 0) - (b.scale || 0); });
    var h = ['<div class="wc-wrap wc-detail">'];
    h.push('<div class="wc-bar"><button class="wc-back" id="wc-back">‹ กลับ</button><div class="wc-title">' +
      esc(c.words.map(function (x) { return x.w; }).join(" · ")) + '</div></div>');
    h.push('<div class="wc-core"><b>ความหมายร่วม:</b> ' + esc(c.core_th || "") + (c.core_en ? '<div class="wc-core-en">' + esc(c.core_en) + '</div>' : '') + '</div>');
    if (c.scale_label_th) h.push('<div class="wc-scalelab">เรียงจาก ' + esc(c.scale_label_th) + ' (บน→ล่าง)</div>');
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      h.push('<div class="wc-word">');
      h.push('<div class="wc-word-h"><span class="wc-w">' + esc(w.w) + '</span>' +
        (w.pos ? '<span class="wc-pos">' + esc(w.pos) + '</span>' : '') + regBadge(w.reg) +
        '<button class="wc-spk" data-say="' + esc(w.ex_en || w.w) + '" aria-label="ฟัง">🔊</button></div>');
      if (w.when_th) h.push('<div class="wc-when">' + esc(w.when_th) + '</div>');
      if (w.collocations && w.collocations.length) h.push('<div class="wc-collo">🔗 ' + esc(w.collocations.join(" · ")) + '</div>');
      if (w.ex_en) h.push('<div class="wc-ex">' + esc(w.ex_en) + (w.ex_th ? ' <span class="wc-ex-th">— ' + esc(w.ex_th) + '</span>' : '') + '</div>');
      h.push('</div>');
    }
    if (c.tip_th) h.push('<div class="wc-tip"><div class="wc-tip-h">📌 วิธีเลือก</div>' + esc(c.tip_th) + '</div>');
    h.push('<div class="wc-games"><div class="wc-games-h">🎮 ฝึกด้วยเกม</div><div class="wc-games-row">' +
      '<button class="wc-gbtn" data-g="match">จับคู่ความต่าง</button>' +
      '<button class="wc-gbtn" data-g="choose">เลือกให้ถูกบริบท</button>' +
      '<button class="wc-gbtn" data-g="tag">จับคู่ระดับ</button>' +
      '<button class="wc-gbtn" data-g="rank">เรียงระดับ</button></div></div>');
    h.push('</div>');
    v.innerHTML = h.join("");
    document.getElementById("wc-back").onclick = function () { sel = -1; render(document.getElementById("view")); };
    [].forEach.call(v.querySelectorAll(".wc-spk"), function (b) { b.onclick = function () { if (window.speak) speak(b.getAttribute("data-say")); }; });
    [].forEach.call(v.querySelectorAll(".wc-gbtn"), function (b) { b.onclick = function () { startGame(b.getAttribute("data-g"), sel); render(document.getElementById("view")); }; });
  }

  /* ---------------- games ---------------- */
  function startGame(type, ci) {
    var c = DATA[ci];
    game = { type: type, ci: ci, done: false, score: 0, total: 0 };
    if (type === "match") { game.left = -1; game.matched = {}; game.right = shuffle(c.words.map(function (w, i) { return i; })); game.total = c.words.length; }
    else if (type === "choose") { game.qi = 0; game.answered = false; game.picked = ""; game.total = (c.quiz || []).length; }
    else if (type === "tag") { game.assign = {}; game.sel = -1; game.total = c.words.length; }
    else if (type === "rank") { game.order = []; game.checked = false; game.total = c.words.length; }
  }

  function gameHeader(c, title) {
    return '<div class="wc-bar"><button class="wc-back" id="wc-gback">‹ ออก</button><div class="wc-title">' + esc(title) +
      '</div></div><div class="wc-gcluster">' + esc(c.words.map(function (x) { return x.w; }).join(" · ")) + '</div>';
  }

  function renderGame(v) {
    var c = DATA[game.ci];
    var h = ['<div class="wc-wrap wc-game">'];
    if (game.type === "match") h.push(gmeMatch(c));
    else if (game.type === "choose") h.push(gmeChoose(c));
    else if (game.type === "tag") h.push(gmeTag(c));
    else if (game.type === "rank") h.push(gmeRank(c));
    h.push('</div>');
    v.innerHTML = h.join("");
    document.getElementById("wc-gback").onclick = function () { game = null; render(document.getElementById("view")); };
    wireGame(c);
  }

  // Game 1: match word <-> "when to use"
  function gmeMatch(c) {
    var h = gameHeader(c, "จับคู่คำกับวิธีใช้") + '<div class="wc-ghint">แตะคำ แล้วแตะวิธีใช้ที่ตรงกัน</div><div class="wc-match">';
    h += '<div class="wc-mcol">';
    for (var i = 0; i < c.words.length; i++) {
      var m = game.matched[i];
      h += '<button class="wc-mw' + (m ? ' wc-ok' : (game.left === i ? ' wc-sel' : '')) + '" data-w="' + i + '"' + (m ? ' disabled' : '') + '>' + esc(c.words[i].w) + '</button>';
    }
    h += '</div><div class="wc-mcol">';
    for (var j = 0; j < game.right.length; j++) {
      var wi = game.right[j], done = game.matched[wi];
      h += '<button class="wc-mn' + (done ? ' wc-ok' : '') + '" data-n="' + wi + '"' + (done ? ' disabled' : '') + '>' + esc((c.words[wi].when_th || "").slice(0, 60)) + '</button>';
    }
    h += '</div></div>';
    var n = 0; for (var k in game.matched) if (game.matched[k]) n++;
    if (n >= c.words.length) h += '<div class="wc-gwin">🎉 จับคู่ครบแล้ว! เก่งมาก</div>';
    return h;
  }

  // Map a (possibly inflected) quiz answer to its cluster word (prefix/stem match).
  function answerWord(c, Q) {
    var a = (Q.a || "").toLowerCase(), best = Q.a;
    for (var i = 0; i < c.words.length; i++) {
      var w = c.words[i].w.toLowerCase();
      if (a === w) return c.words[i].w;
      if (a.indexOf(w) === 0 || w.indexOf(a) === 0) best = c.words[i].w;
    }
    return best;
  }

  // Game 2: choose the right word for the context
  function gmeChoose(c) {
    var quiz = c.quiz || [];
    if (!quiz.length) return gameHeader(c, "เลือกให้ถูกบริบท") + '<div class="wc-ghint">กลุ่มนี้ยังไม่มีโจทย์บริบท</div>';
    if (game.qi >= quiz.length) return gameHeader(c, "เลือกให้ถูกบริบท") + '<div class="wc-gwin">🎉 จบแล้ว! ถูก ' + game.score + '/' + quiz.length + '</div>';
    var Q = quiz[game.qi], aw = answerWord(c, Q);
    var h = gameHeader(c, "เลือกให้ถูกบริบท") + '<div class="wc-gprog">ข้อ ' + (game.qi + 1) + '/' + quiz.length + ' · ถูก ' + game.score + '</div>';
    h += '<div class="wc-qsent">' + esc((Q.s || "").replace(/_+/, "_____")) + '</div><div class="wc-opts">';
    for (var i = 0; i < c.words.length; i++) {
      var w = c.words[i].w, cls = "wc-opt";
      if (game.answered) { if (w === aw) cls += " wc-correct"; else if (w === game.picked) cls += " wc-wrong"; else cls += " wc-dim"; }
      h += '<button class="' + cls + '" data-opt="' + esc(w) + '"' + (game.answered ? ' disabled' : '') + '>' + esc(w) + '</button>';
    }
    h += '</div>';
    if (game.answered) {
      var ok = game.picked === aw;
      h += '<div class="wc-fb ' + (ok ? 'wc-fb-ok' : 'wc-fb-no') + '">' + (ok ? 'ถูกต้อง!' : 'คำตอบ: ' + esc(aw)) + '</div>';
      if (Q.why_th) h += '<div class="wc-why">💡 ' + esc(Q.why_th) + '</div>';
      h += '<button class="wc-next" id="wc-next">ถัดไป</button>';
    }
    return h;
  }

  // Game 3: match word -> register tag
  function gmeTag(c) {
    var tags = ["formal", "neutral", "informal"];
    var h = gameHeader(c, "จับคู่ระดับความเป็นทางการ") + '<div class="wc-ghint">แตะคำ แล้วแตะช่องระดับที่ใช่</div>';
    h += '<div class="wc-tagwords">';
    for (var i = 0; i < c.words.length; i++) {
      var a = game.assign[i];
      h += '<button class="wc-tw' + (a ? ' wc-done' : (game.sel === i ? ' wc-sel' : '')) + '" data-w="' + i + '"' + (a ? ' disabled' : '') + '>' + esc(c.words[i].w) + '</button>';
    }
    h += '</div><div class="wc-tagbuckets">';
    for (var t = 0; t < tags.length; t++) {
      h += '<div class="wc-bucket" data-tag="' + tags[t] + '"><div class="wc-bucket-h">' + REG_TH[tags[t]] + '</div>';
      for (var j = 0; j < c.words.length; j++) if (game.assign[j] === tags[t]) {
        var ok = (c.words[j].reg || "neutral") === tags[t];
        h += '<span class="wc-chip ' + (ok ? 'wc-ok' : 'wc-bad') + '">' + esc(c.words[j].w) + (ok ? '' : ' ✕') + '</span>';
      }
      h += '</div>';
    }
    h += '</div>';
    var n = 0; for (var k in game.assign) if (game.assign[k]) n++;
    if (n >= c.words.length) { var right = 0; for (var m = 0; m < c.words.length; m++) if (game.assign[m] === (c.words[m].reg || "neutral")) right++; h += '<div class="wc-gwin">เสร็จ! ถูก ' + right + '/' + c.words.length + '</div>'; }
    return h;
  }

  // Game 4: rank words along the scale
  function gmeRank(c) {
    var h = gameHeader(c, "เรียงระดับ") + '<div class="wc-ghint">แตะคำเรียงจาก ' + esc(c.scale_label_th || "น้อย→มาก") + '</div>';
    h += '<div class="wc-rankslot">';
    for (var i = 0; i < game.order.length; i++) h += '<span class="wc-rchip">' + (i + 1) + '. ' + esc(c.words[game.order[i]].w) + '</span>';
    h += '</div><div class="wc-rankpool">';
    for (var j = 0; j < c.words.length; j++) if (game.order.indexOf(j) === -1) h += '<button class="wc-rw" data-w="' + j + '">' + esc(c.words[j].w) + '</button>';
    h += '</div>';
    if (game.order.length >= c.words.length && !game.checked) h += '<button class="wc-next" id="wc-check">ตรวจคำตอบ</button>';
    if (game.checked) {
      var sorted = c.words.map(function (w, k) { return k; }).sort(function (a, b) { return (c.words[a].scale || 0) - (c.words[b].scale || 0); });
      var right = 0; for (var p = 0; p < sorted.length; p++) if (game.order[p] === sorted[p]) right++;
      h += '<div class="wc-fb ' + (right === sorted.length ? 'wc-fb-ok' : 'wc-fb-no') + '">' + (right === sorted.length ? 'ถูกทั้งหมด! 🎉' : 'ถูก ' + right + '/' + sorted.length) + '</div>';
      h += '<div class="wc-answer">ลำดับที่ถูก: ' + sorted.map(function (k) { return esc(c.words[k].w); }).join(" → ") + '</div>';
      h += '<button class="wc-next" id="wc-again">ลองใหม่</button>';
    }
    return h;
  }

  function wireGame(c) {
    var v = document.getElementById("view");
    if (game.type === "match") {
      [].forEach.call(v.querySelectorAll(".wc-mw"), function (b) { b.onclick = function () { game.left = parseInt(b.getAttribute("data-w"), 10); render(v); }; });
      [].forEach.call(v.querySelectorAll(".wc-mn"), function (b) {
        b.onclick = function () {
          if (game.left < 0) return; var ni = parseInt(b.getAttribute("data-n"), 10);
          if (ni === game.left) { game.matched[ni] = true; game.left = -1; } else { game.left = -1; b.classList.add("wc-shake"); }
          render(v);
        };
      });
    } else if (game.type === "choose") {
      [].forEach.call(v.querySelectorAll(".wc-opt"), function (b) { b.onclick = function () { var Q = c.quiz[game.qi]; game.answered = true; game.picked = b.getAttribute("data-opt"); if (game.picked === answerWord(c, Q)) game.score++; render(v); }; });
      var nx = document.getElementById("wc-next"); if (nx) nx.onclick = function () { game.qi++; game.answered = false; game.picked = ""; render(v); };
    } else if (game.type === "tag") {
      [].forEach.call(v.querySelectorAll(".wc-tw"), function (b) { b.onclick = function () { game.sel = parseInt(b.getAttribute("data-w"), 10); render(v); }; });
      [].forEach.call(v.querySelectorAll(".wc-bucket"), function (b) { b.onclick = function () { if (game.sel < 0) return; game.assign[game.sel] = b.getAttribute("data-tag"); game.sel = -1; render(v); }; });
    } else if (game.type === "rank") {
      [].forEach.call(v.querySelectorAll(".wc-rw"), function (b) { b.onclick = function () { game.order.push(parseInt(b.getAttribute("data-w"), 10)); render(v); }; });
      [].forEach.call(v.querySelectorAll(".wc-rchip"), function (b) {}); // chips not removable for simplicity
      var ck = document.getElementById("wc-check"); if (ck) ck.onclick = function () { game.checked = true; render(v); };
      var ag = document.getElementById("wc-again"); if (ag) ag.onclick = function () { game.order = []; game.checked = false; render(v); };
    }
  }

  PT.wordchoice = {
    render: render,
    leave: function () { /* keep state */ },
    reset: function () { sel = -1; cat = null; game = null; q = ""; }
  };
})();
