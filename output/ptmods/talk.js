/* PT.talk — Conversations tab: role-play dialogues with per-line TTS,
   show/hide Thai, shadowing practice, and play-all. ES5.
   Uses globals: S, esc, speak, pickEnVoice. Loads data/conversations.json lazily. */
(function () {
  "use strict";
  window.PT = window.PT || {};

  var DATA = null, loading = false;
  var mode = "conv";     // conv | story (story delegates to PT.reader)
  var sel = -1;          // index into DATA; -1 = list view
  var cat = null;        // selected situation (null = category grid)
  var q = "";            // search text
  var showTh = true;     // show Thai translations
  var showJaT = true;    // show Japanese lines (only when the global Japanese layer is on)
  var shadow = false;    // shadowing: hide English until tapped
  var revealed = {};     // per-turn reveal flags in shadow mode
  var playing = false, playStop = null;

  var TH_G = {
    "Eating Out": "ทานข้าวนอกบ้าน", "Shopping": "ช้อปปิ้ง", "Directions": "ถามทาง",
    "Taxi & Ride-hailing": "แท็กซี่ / เรียกรถ", "At the Hotel": "ที่โรงแรม", "At the Airport": "ที่สนามบิน",
    "Health & Doctor": "สุขภาพ / หาหมอ", "Job Interview": "สัมภาษณ์งาน", "At Work": "ที่ทำงาน",
    "On the Phone": "คุยโทรศัพท์", "Making Plans": "นัดหมาย", "Greetings & Introductions": "ทักทาย / แนะนำตัว",
    "Complaints & Returns": "ร้องเรียน / คืนของ", "Asking for Help": "ขอความช่วยเหลือ",
    "Meetings & Video Calls": "ประชุม / วิดีโอคอล", "Weather & Small Talk": "อากาศ / คุยเล่น",
    "Family": "ครอบครัว", "Invitations & Parties": "ชวนงาน / ปาร์ตี้", "Dating & Relationships": "เดต / ความสัมพันธ์",
    "Apologizing & Excuses": "ขอโทษ / แก้ตัว", "Bargaining & Prices": "ต่อราคา", "Money & Bank": "เงิน / ธนาคาร",
    "Public Transport": "รถสาธารณะ", "Delivery & Parcels": "พัสดุ / ส่งของ", "Salon & Barber": "ร้านทำผม",
    "Emergencies": "เหตุฉุกเฉิน", "Friends": "เพื่อน", "Small Talk": "คุยเล่น",
    "Opinions & Feelings": "ความเห็น / ความรู้สึก", "At Home": "ที่บ้าน",
    "Technology & Internet": "เทคโนโลยี / เน็ต", "Education & Study": "การเรียน",
    "Sports & Fitness": "กีฬา / ออกกำลังกาย", "Renting & Housing": "เช่าบ้าน / ที่พัก"
  };

  function enVoice() { try { return window.pickEnVoice ? window.pickEnVoice() : null; } catch (e) { return null; } }
  function stopPlay() { if (playStop) { try { playStop(); } catch (e) {} } playStop = null; playing = false; }

  function load(cb) {
    if (DATA) { cb(); return; }
    if (loading) { return; }
    loading = true;
    fetch("data/conversations.json").then(function (r) { return r.json(); }).then(function (d) {
      DATA = d; loading = false; cb();
    }).catch(function () {
      loading = false;
      var v = document.getElementById("view");
      if (v) v.innerHTML = '<div class="empty">โหลดบทสนทนาไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>';
    });
  }

  function render(v) {
    if (mode === "story" && PT.reader) { stopPlay(); PT.reader.render(v); return; }
    if (!DATA) {
      v.innerHTML = '<div class="empty">กำลังโหลดบทสนทนา…</div>';
      load(function () { render(v); });
      return;
    }
    stopPlay();
    if (sel < 0 || sel >= DATA.length) { renderList(v); } else { renderDialogue(v, DATA[sel]); }
  }

  // shared mode toggle (บทสนทนา | เรื่องสั้น)
  function modeSeg(active) {
    return '<div class="tk-modeseg">' +
      '<button type="button" class="tk-modebtn' + (active === "conv" ? " on" : "") + '" data-tkmode="conv">💬 บทสนทนา</button>' +
      '<button type="button" class="tk-modebtn' + (active === "story" ? " on" : "") + '" data-tkmode="story">📖 เรื่องสั้น</button></div>';
  }
  function wireModeSeg(v) {
    [].forEach.call(v.querySelectorAll("[data-tkmode]"), function (b) {
      b.onclick = function () { setMode(b.getAttribute("data-tkmode")); };
    });
  }
  function setMode(m) {
    if (mode === m) return;
    mode = m;
    var v = document.getElementById("view");
    if (v && S.mode === "talk") render(v);
  }

  function cardHtml(idx) {
    var d = DATA[idx];
    return '<button class="tk-card" data-i="' + idx + '"><div class="tk-card-t">' + esc(d.title || "") +
      '</div><div class="tk-card-m"><span class="tk-lv">' + esc(d.level || "") + '</span> ' +
      esc(d.roleA) + ' · ' + esc(d.roleB) + ' · ' + d.turns.length + ' บรรทัด</div></button>';
  }

  function renderList(v) {
    var byG = {}, groups = [], i;
    for (i = 0; i < DATA.length; i++) { var g = DATA[i].g; if (!byG[g]) { byG[g] = []; groups.push(g); } byG[g].push(i); }
    var ql = q.trim().toLowerCase();
    var h = ['<div class="tk-wrap">'];
    h.push(modeSeg("conv"));
    h.push('<div class="tk-search"><input id="tk-q" type="search" placeholder="ค้นหาบทสนทนา / หมวด…" value="' + esc(q) + '"></div>');
    if (ql) {
      var hits = [];
      for (i = 0; i < DATA.length; i++) {
        var d = DATA[i];
        if ((d.title || "").toLowerCase().indexOf(ql) !== -1 || (d.g || "").toLowerCase().indexOf(ql) !== -1 ||
          (TH_G[d.g] || "").indexOf(q.trim()) !== -1) hits.push(i);
      }
      h.push('<div class="tk-intro">' + hits.length + ' ผลลัพธ์</div>');
      for (i = 0; i < hits.length; i++) h.push(cardHtml(hits[i]));
    } else if (cat === null) {
      h.push('<div class="tk-intro">เลือกหมวด · ' + DATA.length + ' บทสนทนา</div><div class="tk-catgrid">');
      for (i = 0; i < groups.length; i++) {
        var gg = groups[i];
        h.push('<button class="tk-catcard" data-cat="' + esc(gg) + '"><div class="tk-catcard-t">' +
          esc(TH_G[gg] || gg) + '</div><div class="tk-catcard-n">' + byG[gg].length + ' บท</div></button>');
      }
      h.push('</div>');
    } else {
      h.push('<button class="tk-back" id="tk-catback">‹ ทุกหมวด</button>');
      h.push('<div class="tk-gh">' + esc(cat) + ' <span>' + esc(TH_G[cat] || "") + '</span></div>');
      var arr = byG[cat] || [];
      for (i = 0; i < arr.length; i++) h.push(cardHtml(arr[i]));
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    wireModeSeg(v);
    var qi = document.getElementById("tk-q");
    if (qi) qi.oninput = function () { q = qi.value; renderList(v); var n = document.getElementById("tk-q"); if (n) { n.focus(); try { n.setSelectionRange(q.length, q.length); } catch (e) {} } };
    var cb = document.getElementById("tk-catback");
    if (cb) cb.onclick = function () { cat = null; renderList(v); };
    [].forEach.call(v.querySelectorAll(".tk-catcard"), function (b) { b.onclick = function () { cat = b.getAttribute("data-cat"); renderList(v); }; });
    [].forEach.call(v.querySelectorAll(".tk-card"), function (b) { b.onclick = function () { sel = parseInt(b.getAttribute("data-i"), 10); revealed = {}; render(v); }; });
  }

  function renderDialogue(v, d) {
    var JM = !!(window.PT && PT.ja && PT.ja.on());
    if (JM && !PT.ja.ensure("conversations")) {
      PT.ja.ensure("conversations", function (ok) {
        if (ok && S.mode === "talk" && mode === "conv" && sel >= 0 && DATA[sel] === d && !playing) render(v);
      });
    }
    var JT = JM && showJaT;
    var h = ['<div class="tk-wrap tk-dlg">'];
    h.push('<div class="tk-bar">');
    h.push('<button class="tk-back" id="tk-back">‹ กลับ</button>');
    h.push('<div class="tk-title">' + esc(d.title || "") + ' <span>' + esc(d.level || "") + '</span>' +
      (JT && PT.ja.conv(d.id, d.title) ? '<div class="tk-tja">' + PT.ja.line(PT.ja.conv(d.id, d.title)) + '</div>' : '') + '</div>');
    h.push('</div>');
    h.push('<div class="tk-roles"><b>A</b> ' + esc(d.roleA) + '  ·  <b>B</b> ' + esc(d.roleB) + '</div>');
    h.push('<div class="tk-ctrls">');
    h.push('<button class="tk-ctrl' + (showTh ? ' on' : '') + '" id="tk-th">ไทย</button>');
    if (JM) h.push('<button class="tk-ctrl' + (showJaT ? ' on' : '') + '" id="tk-ja" lang="ja">日本語</button>');
    h.push('<button class="tk-ctrl' + (shadow ? ' on' : '') + '" id="tk-shadow">ฝึกพูด</button>');
    h.push('<button class="tk-play" id="tk-play">▶ เล่นทั้งหมด</button>');
    h.push('</div>');
    h.push('<div class="tk-thread">');
    var i;
    for (i = 0; i < d.turns.length; i++) {
      var t = d.turns[i], side = (t.speaker === "A") ? "a" : "b";
      var hideEn = shadow && !revealed[i];
      h.push('<div class="tk-turn ' + side + '" data-i="' + i + '">');
      h.push('<div class="tk-bub">');
      if (JM) {
        // ไทย -> English -> 日本語
        if (showTh) { h.push('<div class="tk-thl">' + esc(t.th) + '</div>'); }
        if (hideEn) h.push('<div class="tk-en tk-hidden" data-rev="' + i + '">แตะเพื่อดูประโยค</div>');
        else h.push('<div class="tk-en">' + esc(t.en) + '</div>');
        var Jt = JT ? PT.ja.conv(d.id, t.en) : null;
        if (Jt) h.push('<div class="tk-ja">' + PT.ja.block(Jt) + '</div>');
      } else {
      if (hideEn) {
        h.push('<div class="tk-en tk-hidden" data-rev="' + i + '">แตะเพื่อดูประโยค</div>');
      } else {
        h.push('<div class="tk-en">' + esc(t.en) + '</div>');
      }
      if (showTh) { h.push('<div class="tk-thl">' + esc(t.th) + '</div>'); }
      }
      h.push('<button class="tk-spk" data-ti="' + i + '" aria-label="ฟัง">🔊</button>');
      h.push('<button class="tk-spk tk-slow2" data-slow="' + esc(t.en) + '" aria-label="อ่านช้า">🐢</button>');
      h.push('</div></div>');
    }
    h.push('</div>');
    if (d.keyphrases && d.keyphrases.length) {
      h.push('<div class="tk-keys"><div class="tk-keys-h">วลีสำคัญ</div>');
      for (i = 0; i < d.keyphrases.length; i++) {
        var k = d.keyphrases[i];
        if (JM) {
          h.push('<div class="tk-key"><div class="tk-key-tx">' + PT.ja.stack(k.th, '<span class="tk-key-en">' + esc(k.en) + '</span>',
            JT ? PT.ja.conv(d.id, k.en) : null) + '</div>' +
            '<button class="tk-spk sm" data-ki="' + i + '" aria-label="ฟัง">🔊</button>' +
            '<button class="tk-spk sm" data-slow="' + esc(k.en) + '" aria-label="อ่านช้า">🐢</button></div>');
          continue;
        }
        h.push('<div class="tk-key"><div class="tk-key-tx"><span class="tk-key-en">' + esc(k.en) +
          '</span><span class="tk-key-th">' + esc(k.th) + '</span></div>' +
          '<button class="tk-spk sm" data-ki="' + i + '" aria-label="ฟัง">🔊</button>' +
          '<button class="tk-spk sm" data-slow="' + esc(k.en) + '" aria-label="อ่านช้า">🐢</button></div>');
      }
      h.push('</div>');
    }
    h.push('</div>');
    v.innerHTML = h.join("");

    document.getElementById("tk-back").onclick = function () { stopPlay(); sel = -1; render(v); };
    document.getElementById("tk-th").onclick = function () { showTh = !showTh; render(v); };
    var jb = document.getElementById("tk-ja");
    if (jb) jb.onclick = function () { showJaT = !showJaT; render(v); };
    document.getElementById("tk-shadow").onclick = function () { shadow = !shadow; revealed = {}; render(v); };
    document.getElementById("tk-play").onclick = function () {
      if (playing) { stopPlay(); render(v); } else { playAll(d, v); }
    };
    [].forEach.call(v.querySelectorAll(".tk-spk"), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var ti = b.getAttribute("data-ti"), ki = b.getAttribute("data-ki");
        var txt = (ti !== null) ? d.turns[+ti].en : d.keyphrases[+ki].en;
        if (window.speak) speak(txt);
      };
    });
    [].forEach.call(v.querySelectorAll(".tk-hidden"), function (b) {
      b.onclick = function () { revealed[parseInt(b.getAttribute("data-rev"), 10)] = true; render(v); };
    });
  }

  function playAll(d, v) {
    stopPlay(); playing = true;
    var pb = document.getElementById("tk-play");
    if (pb) { pb.textContent = "■ หยุด"; pb.classList.add("on"); }
    var thread = v.querySelector(".tk-thread");
    var i = 0, cancelled = false;
    function turns() { return thread ? thread.querySelectorAll(".tk-turn") : []; }
    function hi(idx) {
      var ts = turns(), k;
      for (k = 0; k < ts.length; k++) { ts[k].classList.toggle("hl", k === idx); }
      if (ts[idx] && ts[idx].scrollIntoView) { try { ts[idx].scrollIntoView({ block: "center" }); } catch (e) {} }
    }
    function clr() { var ts = turns(), k; for (k = 0; k < ts.length; k++) { ts[k].classList.remove("hl"); } }
    function done() {
      playing = false; clr();
      var b = document.getElementById("tk-play");
      if (b) { b.textContent = "▶ เล่นทั้งหมด"; b.classList.remove("on"); }
    }
    function step() {
      if (cancelled || i >= d.turns.length) { done(); return; }
      hi(i);
      var u = new SpeechSynthesisUtterance(d.turns[i].en);
      u.lang = "en-US"; u.rate = 0.9;
      var vo = enVoice(); if (vo) u.voice = vo;
      u.onend = function () { i++; step(); };
      u.onerror = function () { i++; step(); };
      try { speechSynthesis.speak(u); } catch (e) { i++; step(); }
    }
    try { speechSynthesis.cancel(); } catch (e) {}
    step();
    playStop = function () { cancelled = true; try { speechSynthesis.cancel(); } catch (e) {} clr(); };
  }

  PT.talk = {
    render: render,
    setMode: setMode,
    modeSeg: modeSeg,
    wireModeSeg: wireModeSeg,
    leave: function () { stopPlay(); },        // called when navigating away
    reset: function () { sel = -1; cat = null; q = ""; mode = "conv"; stopPlay(); }
  };
})();
