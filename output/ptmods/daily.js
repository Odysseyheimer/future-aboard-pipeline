/* daily.js — "แบบทดสอบวันนี้" one-tap mixed session: due reviews + today's new (intro cards)
   + weak words (mistake notebook), finite with a score screen. ES5.
   Uses globals: S, esc, speak, keyOf, goMode, PT.srs, PT.miss, PT.bus. Reuses qz-* styles. */
PT.daily = (function () {
  "use strict";
  var q = [], idx = 0, right = 0, tested = 0, introduced = 0, done = false;
  var answered = false, picked = -1, opts = null, counts = { due: 0, neu: 0, weak: 0 };

  function shuffle(a) { var i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function build() {
    var now = Date.now(), data = S.data || [], due = [], neu = [], i, it, st;
    for (i = 0; i < data.length; i++) {
      it = data[i]; st = PT.srs.statusOf(S.rec[keyOf(it)], now);
      if (st === "due" || st === "learning") due.push(it);
      else if (st === "new") neu.push(it);
    }
    due.sort(function (a, b) { var ra = S.rec[keyOf(a)], rb = S.rec[keyOf(b)]; return ((ra && ra.due) || 0) - ((rb && rb.due) || 0); });
    due = due.slice(0, 12);
    var cap = (S.settings && S.settings.newPerDay) || 20, dl = PT.srs.dayLog(S.deck), newLeft = Math.max(0, cap - (dl.n || 0));
    neu = neu.slice(0, Math.min(5, newLeft));
    var weak = [], seen = {};
    for (i = 0; i < due.length; i++) seen[keyOf(due[i])] = 1;
    for (i = 0; i < neu.length; i++) seen[keyOf(neu[i])] = 1;
    if (PT.miss && PT.miss.keys) {
      var ks = PT.miss.keys(S.deck), map = {};
      for (i = 0; i < data.length; i++) map[keyOf(data[i])] = data[i];
      for (i = 0; i < ks.length && weak.length < 5; i++) { var m = map[ks[i]]; if (m && !seen[ks[i]]) { weak.push(m); seen[ks[i]] = 1; } }
    }
    counts = { due: due.length, neu: neu.length, weak: weak.length };
    q = [];
    for (i = 0; i < due.length; i++) { due[i]._dnew = false; q.push(due[i]); }
    for (i = 0; i < weak.length; i++) { weak[i]._dnew = false; q.push(weak[i]); }
    shuffle(q);
    // new words go at the START as intro cards (learn first, then get tested by SRS later)
    for (i = neu.length - 1; i >= 0; i--) { neu[i]._dnew = true; q.unshift(neu[i]); }
    idx = 0; right = 0; tested = 0; introduced = 0; done = (q.length === 0);
    answered = false; picked = -1; opts = null;
  }

  function mkOpts(target) {
    var correct = target.mt || target.me || "";
    var pool = S.data || [], res = [correct], seen = {}; seen[correct] = 1;
    var guard = 0;
    while (res.length < 4 && guard < 500) {
      var c = pool[Math.floor(Math.random() * pool.length)], t = c.mt || c.me || ""; guard++;
      if (!t || seen[t] || keyOf(c) === keyOf(target)) continue;
      seen[t] = 1; res.push(t);
    }
    var os = [], i; for (i = 0; i < res.length; i++) os.push({ t: res[i], ok: res[i] === correct });
    shuffle(os); os._for = keyOf(target);
    return os;
  }

  function gradeCur(correct, isIntro) {
    var it = q[idx], k = keyOf(it);
    try {
      var rec = S.rec[k] || PT.srs.newRecord();
      var res = PT.srs.grade(rec, correct ? 2 : 0, Date.now());
      S.rec[k] = res.rec; PT.srs.save(S.deck, S.rec);
      if (it._dnew) PT.srs.bumpNew(S.deck); else PT.srs.bumpRev(S.deck);
      if (!isIntro && PT.miss) { if (correct) PT.miss.right(S.deck, k); else PT.miss.add(S.deck, k); }
    } catch (e) {}
  }

  function next() {
    idx++; answered = false; picked = -1; opts = null;
    if (idx >= q.length) {
      done = true;
      try { if (PT.hub && PT.hub.notify) PT.hub.notify("test"); } catch (e) {}
    }
    rerender();
  }

  function rerender() { var v = document.getElementById("view"); if (v && S.mode === "daily") render(v); }

  function render(v) {
    if (done || !q.length) { v.innerHTML = endHtml(); wireEnd(v); return; }
    var it = q[idx], h = '<div class="dl-wrap">';
    h += '<div class="dl-top"><button class="dl-back" data-dl-back="1">‹ ออก</button>' +
      '<div class="dl-prog">ข้อ ' + (idx + 1) + ' / ' + q.length + '</div>' +
      '<div class="dl-score">ถูก ' + right + '</div></div>';
    h += '<div class="dl-bar"><i style="width:' + Math.round(idx / q.length * 100) + '%"></i></div>';

    if (it._dnew) {
      // intro card for a new word
      h += '<div class="qz-card dl-intro"><div class="qz-plabel">🆕 คำใหม่วันนี้ — อ่านแล้วจำ</div>' +
        '<div class="qz-prompt">' + esc(it.w) + ' <button type="button" class="qz-say" data-dl-say="1">🔊</button></div>';
      if (it.p) h += '<div class="dl-pos">' + esc(it.p) + '</div>';
      if (window.PT && PT.ja && PT.ja.on()) {
        var JH = PT.ja.head(S.deck, it);
        if (it.mt || it.me || JH) h += '<div class="dl-mean">' + PT.ja.stack(it.mt, it.me ? esc(it.me) : "", JH, { kind: "w" }) + '</div>';
        if (it.ee) h += '<div class="dl-ex">' + PT.ja.stack(it.et, esc(it.ee), PT.ja.ex(S.deck, it, it.ee)) + '</div>';
      } else {
      if (it.mt || it.me) h += '<div class="dl-mean">' + esc(it.mt || it.me) + '</div>';
      if (it.ee) h += '<div class="dl-ex">' + esc(it.ee) + (it.et ? '<span>' + esc(it.et) + '</span>' : '') + '</div>';
      }
      h += '</div>';
      h += '<button type="button" class="qz-next" data-dl-intro="1">จำได้แล้ว → ต่อ</button>';
    } else {
      if (!opts || opts._for !== keyOf(it)) opts = mkOpts(it);
      h += '<div class="qz-card"><div class="qz-plabel">ความหมายของคำนี้คือ</div>' +
        '<div class="qz-prompt">' + esc(it.w) + '</div>' +
        '<button type="button" class="qz-say" data-dl-say="1" aria-label="ฟังเสียง">🔊</button></div>';
      h += '<div class="qz-opts">';
      var i, o, cls;
      for (i = 0; i < opts.length; i++) {
        o = opts[i]; cls = "qz-opt";
        if (answered) { if (o.ok) cls += " qz-correct"; else if (i === picked) cls += " qz-wrong"; else cls += " qz-dim"; }
        h += '<button type="button" class="' + cls + '" data-dl-pick="' + i + '"' + (answered ? ' disabled' : '') + '>' + esc(o.t) + '</button>';
      }
      h += '</div>';
      if (answered) {
        h += (opts[picked] && opts[picked].ok) ? '<div class="qz-fb qz-fb-ok">ถูกต้อง! 🎉</div>' : '<div class="qz-fb qz-fb-no">ยังไม่ถูก</div>';
        h += '<button type="button" class="qz-next" data-dl-next="1">ถัดไป</button>';
      }
    }
    h += '</div>';
    v.innerHTML = h;
    wire(v);
  }

  function endHtml() {
    var h = '<div class="dl-wrap"><div class="dl-end">';
    if (!q.length) {
      h += '<div class="dl-end-i">🎉</div><div class="dl-end-t">วันนี้ครบแล้ว!</div>' +
        '<div class="dl-end-d">ไม่มีการ์ดค้าง คำใหม่ หรือคำที่มักผิด ในคลังนี้ตอนนี้ — พักได้ หรือสลับไปคลังอื่น</div>';
    } else {
      var pct = tested ? Math.round(right / tested * 100) : 0;
      h += '<div class="dl-end-i">' + (pct >= 80 ? '🏆' : pct >= 50 ? '💪' : '📚') + '</div>' +
        '<div class="dl-end-t">เสร็จแล้ว!</div>' +
        (tested ? '<div class="dl-end-s">ตอบถูก <b>' + right + ' / ' + tested + '</b> (' + pct + '%)</div>' : '') +
        (introduced ? '<div class="dl-end-d">เรียนคำใหม่ ' + introduced + ' คำ</div>' : '') +
        '<div class="dl-end-mix">ชุดนี้: ทบทวน ' + counts.due + ' · คำใหม่ ' + counts.neu + ' · คำที่มักผิด ' + counts.weak + '</div>';
    }
    h += '<button type="button" class="qz-next" data-dl-again="1">🎯 ทำอีกชุด</button>' +
      '<button type="button" class="dl-exit" data-dl-back="1">‹ กลับหน้าหลัก</button>';
    return h + '</div></div>';
  }

  function wire(v) {
    var back = v.querySelector("[data-dl-back]");
    if (back) back.onclick = exit;
    var say = v.querySelector("[data-dl-say]");
    if (say) say.onclick = function () { try { speak(q[idx].w); } catch (e) {} };
    var intro = v.querySelector("[data-dl-intro]");
    if (intro) intro.onclick = function () { introduced++; gradeCur(true, true); next(); };
    var nx = v.querySelector("[data-dl-next]");
    if (nx) nx.onclick = function () { next(); };
    var picks = v.querySelectorAll("[data-dl-pick]");
    var i;
    for (i = 0; i < picks.length; i++) (function (b) {
      b.onclick = function () {
        if (answered) return;
        picked = parseInt(b.getAttribute("data-dl-pick"), 10);
        answered = true; tested++;
        var ok = !!(opts[picked] && opts[picked].ok);
        if (ok) right++;
        gradeCur(ok, false);
        rerender();
      };
    })(picks[i]);
  }
  function wireEnd(v) {
    var ag = v.querySelector("[data-dl-again]");
    if (ag) ag.onclick = function () { build(); rerender(); };
    var back = v.querySelector("[data-dl-back]");
    if (back) back.onclick = exit;
  }
  function exit() {
    S.workingDirty = true;
    try { if (PT.bus && PT.bus.emit) PT.bus.emit("recchange"); } catch (e) {}
    if (window.goMode) goMode("browse");
  }

  function start() { build(); if (window.goMode) goMode("daily"); }

  return { start: start, render: render, leave: function () {} };
})();
