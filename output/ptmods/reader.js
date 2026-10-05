/* reader.js — "เรื่องสั้น" graded reader inside the สนทนา tab (PT.talk delegates when its
   mode is "story"). Stories from data/stories.json: per-paragraph tap-to-reveal Thai, per-para
   TTS, in-context glossary, 3 comprehension MCQs. ES5.
   Uses globals: S, esc, speak, store; PT.talk.modeSeg/wireModeSeg for the shared toggle. */
PT.reader = (function () {
  "use strict";
  var DATA = null, loading = false;
  var lvl = null;        // level filter (null = all)
  var sel = -1;          // story index; -1 = list
  var thOn = {};         // para index -> Thai revealed
  var ans = {};          // question index -> picked option text
  var GEN_TH = {
    "everyday life": "ชีวิตประจำวัน", "light mystery": "สืบสวนเบาๆ",
    "friendship and family": "มิตรภาพ/ครอบครัว", "travel and adventure": "เดินทาง/ผจญภัย",
    "work and office life": "ชีวิตทำงาน"
  };

  function readSet() { try { return JSON.parse(store.get("pt_read") || "{}") || {}; } catch (e) { return {}; } }
  function markRead(id) { try { var r = readSet(); r[id] = 1; store.set("pt_read", JSON.stringify(r)); } catch (e) {} }

  function load(cb) {
    if (DATA) { cb(); return; }
    if (loading) return;
    loading = true;
    fetch("data/stories.json").then(function (r) { return r.json(); }).then(function (d) { DATA = d; loading = false; cb(); })
      .catch(function () { loading = false; var v = document.getElementById("view"); if (v) v.innerHTML = '<div class="empty">โหลดเรื่องสั้นไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>'; });
  }

  function render(v) {
    if (!DATA) { v.innerHTML = '<div class="empty">กำลังโหลดเรื่องสั้น…</div>'; load(function () { render(v); }); return; }
    if (sel >= 0 && sel < DATA.length) renderStory(v, DATA[sel]);
    else renderList(v);
  }

  function renderList(v) {
    var h = ['<div class="tk-wrap">'];
    if (PT.talk && PT.talk.modeSeg) h.push(PT.talk.modeSeg("story"));
    var lvls = ["A2", "B1", "B2", "C1"], i;
    h.push('<div class="rd2-lvls"><button type="button" class="rd2-lvl' + (lvl === null ? " on" : "") + '" data-rd2-lvl="">ทั้งหมด</button>');
    for (i = 0; i < lvls.length; i++) h.push('<button type="button" class="rd2-lvl' + (lvl === lvls[i] ? " on" : "") + '" data-rd2-lvl="' + lvls[i] + '">' + lvls[i] + '</button>');
    h.push('</div>');
    var rs = readSet(), shown = 0;
    for (i = 0; i < DATA.length; i++) {
      var st = DATA[i];
      if (lvl && st.lvl !== lvl) continue;
      shown++;
      h.push('<button type="button" class="rd2-card" data-rd2-i="' + i + '">' +
        '<div class="rd2-card-top"><span class="rd2-badge">' + esc(st.lvl) + '</span>' +
        '<span class="rd2-genre">' + esc(GEN_TH[st.genre] || st.genre) + '</span>' +
        (rs[st.id] ? '<span class="rd2-read">✓ อ่านแล้ว</span>' : '') + '</div>' +
        '<div class="rd2-card-t">' + esc(st.title) + '</div>' +
        '<div class="rd2-card-tt">' + esc(st.title_th || "") + '</div>' +
        '<div class="rd2-card-m">~' + (st.words || "") + ' คำ · คำถาม ' + (st.qs ? st.qs.length : 0) + ' ข้อ</div></button>');
    }
    if (!shown) h.push('<div class="empty">ไม่มีเรื่องในระดับนี้</div>');
    h.push('</div>');
    v.innerHTML = h.join("");
    if (PT.talk && PT.talk.wireModeSeg) PT.talk.wireModeSeg(v);
    [].forEach.call(v.querySelectorAll("[data-rd2-lvl]"), function (b) {
      b.onclick = function () { lvl = b.getAttribute("data-rd2-lvl") || null; render(v); };
    });
    [].forEach.call(v.querySelectorAll("[data-rd2-i]"), function (b) {
      b.onclick = function () { sel = parseInt(b.getAttribute("data-rd2-i"), 10); thOn = {}; ans = {}; render(v); };
    });
  }

  function renderStory(v, st) {
    var JM = !!(window.PT && PT.ja && PT.ja.on());
    if (JM && !PT.ja.ensure("stories")) {
      var cur = sel;
      PT.ja.ensure("stories", function (ok) { if (ok && sel === cur && document.querySelector(".rd2-story")) render(v); });
    }
    var h = ['<div class="tk-wrap rd2-story">'], i;
    h.push('<div class="tk-bar"><button class="tk-back" id="rd2-back">‹ เรื่องอื่น</button>' +
      '<div class="tk-title">' + esc(st.lvl) + ' · ' + esc(GEN_TH[st.genre] || st.genre) + '</div></div>');
    if (JM) {
      // ไทย -> English -> 日本語
      if (st.title_th) h.push('<div class="rd2-tt">' + esc(st.title_th) + '</div>');
      h.push('<div class="rd2-t">' + esc(st.title) + '</div>');
      var Jtt = PT.ja.story(st.id, st.title);
      if (Jtt) h.push('<div class="rd2-tja">' + PT.ja.line(Jtt) + '</div>');
      h.push('<div class="rd2-hintline">แตะย่อหน้าเพื่อดูคำแปลไทย + ญี่ปุ่น · แตะ 🔊 เพื่อฟัง</div>');
    } else {
    h.push('<div class="rd2-t">' + esc(st.title) + '</div>');
    if (st.title_th) h.push('<div class="rd2-tt">' + esc(st.title_th) + '</div>');
    h.push('<div class="rd2-hintline">แตะย่อหน้าเพื่อดูคำแปลไทย · แตะ 🔊 เพื่อฟัง</div>');
    }

    for (i = 0; i < st.paras.length; i++) {
      var p = st.paras[i];
      if (JM) {
        var Jp = thOn[i] ? PT.ja.story(st.id, p.en) : null;
        h.push('<div class="rd2-para" data-rd2-p="' + i + '">' +
          (thOn[i] && p.th ? '<div class="rd2-th rd2-th-top">' + esc(p.th) + '</div>' : '') +
          '<div class="rd2-en">' + esc(p.en) + '</div>' +
          (Jp ? '<div class="rd2-ja">' + PT.ja.block(Jp) + '</div>' : '') +
          '<button type="button" class="rd2-say" data-rd2-say="' + i + '">🔊</button>' +
          '<button type="button" class="rd2-say rd2-slow" data-slow="' + esc(p.en) + '">🐢</button></div>');
        continue;
      }
      h.push('<div class="rd2-para" data-rd2-p="' + i + '">' +
        '<div class="rd2-en">' + esc(p.en) + '</div>' +
        (thOn[i] && p.th ? '<div class="rd2-th">' + esc(p.th) + '</div>' : '') +
        '<button type="button" class="rd2-say" data-rd2-say="' + i + '">🔊</button>' +
        '<button type="button" class="rd2-say rd2-slow" data-slow="' + esc(p.en) + '">🐢</button></div>');
    }

    if (st.gloss && st.gloss.length) {
      h.push('<div class="rd2-sec">📚 ศัพท์ในเรื่อง</div><div class="rd2-gloss">');
      for (i = 0; i < st.gloss.length; i++) {
        h.push('<button type="button" class="rd2-gw" data-rd2-gsay="' + esc(st.gloss[i].w) + '"><b>' + esc(st.gloss[i].w) + '</b><span>' + esc(st.gloss[i].th) + '</span></button>');
      }
      h.push('</div>');
    }

    if (st.qs && st.qs.length) {
      h.push('<div class="rd2-sec">❓ คำถามท้ายเรื่อง</div>');
      var answeredAll = true, right = 0;
      for (i = 0; i < st.qs.length; i++) {
        var qq = st.qs[i], picked = ans[i];
        if (picked == null) answeredAll = false;
        else if (picked === qq.a) right++;
        h.push('<div class="rd2-q"><div class="rd2-q-t">' + (i + 1) + '. ' + esc(qq.q) + '</div>');
        for (var o = 0; o < qq.options.length; o++) {
          var ot = qq.options[o], cls = "rd2-opt";
          if (picked != null) {
            if (ot === qq.a) cls += " ok";
            else if (ot === picked) cls += " bad";
            else cls += " dim";
          }
          h.push('<button type="button" class="' + cls + '" data-rd2-q="' + i + '" data-rd2-o="' + esc(ot) + '"' + (picked != null ? " disabled" : "") + '>' + esc(ot) + '</button>');
        }
        h.push('</div>');
      }
      if (answeredAll) {
        markRead(st.id);
        h.push('<div class="rd2-score">ตอบถูก ' + right + ' / ' + st.qs.length + (right === st.qs.length ? ' 🏆' : '') + '</div>');
        h.push('<button type="button" class="rd2-next" id="rd2-next">📖 เรื่องถัดไป</button>');
      }
    }
    h.push('</div>');
    v.innerHTML = h.join("");

    document.getElementById("rd2-back").onclick = function () { sel = -1; render(v); };
    [].forEach.call(v.querySelectorAll(".rd2-para"), function (el) {
      el.onclick = function (e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute("data-rd2-say") !== null) return;
        var pi = parseInt(el.getAttribute("data-rd2-p"), 10);
        thOn[pi] = !thOn[pi]; render(v);
      };
    });
    [].forEach.call(v.querySelectorAll("[data-rd2-say]"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); var pi = parseInt(b.getAttribute("data-rd2-say"), 10); try { speak(st.paras[pi].en); } catch (x) {} };
    });
    [].forEach.call(v.querySelectorAll("[data-rd2-gsay]"), function (b) {
      b.onclick = function () { try { speak(b.getAttribute("data-rd2-gsay")); } catch (x) {} };
    });
    [].forEach.call(v.querySelectorAll("[data-rd2-q]"), function (b) {
      b.onclick = function () {
        var qi = parseInt(b.getAttribute("data-rd2-q"), 10);
        if (ans[qi] != null) return;
        ans[qi] = b.getAttribute("data-rd2-o");
        render(v);
      };
    });
    var nx = document.getElementById("rd2-next");
    if (nx) nx.onclick = function () {
      // next unread story at the same level filter, else next index
      var i2, rs = readSet(), pick = -1;
      for (i2 = 0; i2 < DATA.length; i2++) {
        var c = (sel + 1 + i2) % DATA.length;
        if (lvl && DATA[c].lvl !== lvl) continue;
        if (!rs[DATA[c].id]) { pick = c; break; }
        if (pick < 0) pick = c;
      }
      sel = (pick >= 0) ? pick : ((sel + 1) % DATA.length);
      thOn = {}; ans = {};
      render(v);
      try { v.scrollIntoView({ block: "start" }); } catch (e) {}
    };
  }

  return {
    render: render,
    reset: function () { sel = -1; lvl = null; thOn = {}; ans = {}; }
  };
})();
