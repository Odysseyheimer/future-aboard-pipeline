/* stats2.js — "แดชบอร์ดสถิติ": activity heatmap, due-forecast, card-maturity
   breakdown, retention rate, and an advanced Cards setting (dirSplit).
   Pure read of existing srs/store data — no data model added except a small
   capped per-deck grade-log (written by cards.js) and a settings flag.
   ES5. Rendered inside PT.stats via a `.st2d-*`-prefixed section. */
PT.stats2 = (function () {
  "use strict";

  /* ---------- heatmap: reuses the same day-bucketing as the streak ---------- */
  function heatmapHtml() {
    if (!window.PT || !PT.srs || typeof PT.srs.dayNum !== "function") return "";
    var today = PT.srs.dayNum(), act = PT.srs.activityLog() || {};
    var WEEKS = 12, days = WEEKS * 7;
    var maxN = 1, i, d;
    for (i = 0; i < days; i++) { var v = act["" + (today - i)] || 0; if (v > maxN) maxN = v; }
    // build columns oldest->newest, 7 rows each (Sun..Sat by day-of-week of the approximate date)
    var cells = [];
    for (i = days - 1; i >= 0; i--) {
      d = today - i;
      var n = act["" + d] || 0;
      var lvl = n <= 0 ? 0 : Math.min(4, Math.ceil((n / maxN) * 4));
      var dt = new Date(d * (PT.srs.DAY || 86400000) + (PT.srs.ROLL || 0));
      var lbl = "";
      try { lbl = dt.toLocaleDateString("th-TH", { day: "numeric", month: "short" }); } catch (e) {}
      cells.push('<span class="st2d-hm-c st2d-hm-l' + lvl + '" title="' + esc(lbl) + ' · ' + n + ' ครั้ง"></span>');
    }
    return '<div class="st2d-hm">' + cells.join("") + '</div>' +
      '<div class="st2d-hm-leg"><span>น้อย</span><span class="st2d-hm-c st2d-hm-l0"></span>' +
      '<span class="st2d-hm-c st2d-hm-l1"></span><span class="st2d-hm-c st2d-hm-l2"></span>' +
      '<span class="st2d-hm-c st2d-hm-l3"></span><span class="st2d-hm-c st2d-hm-l4"></span><span>มาก</span></div>';
  }

  /* ---------- maturity + forecast, current deck, base (direction-agnostic) key ---------- */
  function deckStats() {
    var data = (window.S && S.data) || [], rec = (window.S && S.rec) || {};
    var now = Date.now(), DAY = (PT.srs && PT.srs.DAY) || 86400000;
    var mat = { neu: 0, learning: 0, young: 0, mature: 0 };
    var forecast = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // next 14 days, index0=today
    var overdue = 0, leechCount = 0, i, r;
    for (i = 0; i < data.length; i++) {
      r = rec[keyOf(data[i])];
      if (!r || r.s === 0) { mat.neu++; continue; }
      if (r.s === 1 || r.s === 3) { mat.learning++; }
      else if (r.s === 2) {
        if ((r.iv || 0) >= 21) mat.mature++; else mat.young++;
        var diffDays = Math.floor((r.due - now) / DAY);
        if (diffDays < 0) overdue++;
        else if (diffDays < forecast.length) forecast[diffDays]++;
      }
      if ((r.lap || 0) >= 4) leechCount++;
    }
    return { mat: mat, forecast: forecast, overdue: overdue, leechCount: leechCount, total: data.length };
  }

  function retentionStats(deck) {
    var arr = [];
    try { arr = JSON.parse(store.get("pt_glog_" + deck) || "[]"); } catch (e) { arr = []; }
    if (!(arr instanceof Array) || !arr.length) return null;
    var ok = 0, i;
    for (i = 0; i < arr.length; i++) if (arr[i] >= 1) ok++;
    return { pct: Math.round((ok / arr.length) * 100), n: arr.length };
  }

  function bar(label, val, max, color) {
    var pct = max ? Math.round((val / max) * 100) : 0;
    return '<div class="st2d-bar-row"><span class="st2d-bar-l">' + esc(label) + '</span>' +
      '<div class="st2d-bar-track"><i style="width:' + pct + '%;background:' + color + '"></i></div>' +
      '<span class="st2d-bar-v">' + val + '</span></div>';
  }

  function section() {
    var ds = deckStats();
    var ret = retentionStats((window.S && S.deck) || "");
    var mat = ds.mat, maxMat = Math.max(1, mat.neu, mat.learning, mat.young, mat.mature);
    var maxFc = Math.max(1, ds.overdue);
    var i;
    for (i = 0; i < ds.forecast.length; i++) if (ds.forecast[i] > maxFc) maxFc = ds.forecast[i];

    var h = '<div class="st2d-sec"><div class="st2d-h">📊 แดชบอร์ดสถิติ</div>';

    h += '<div class="st2d-sub">กิจกรรมการเรียน (12 สัปดาห์ล่าสุด)</div>' + heatmapHtml();

    if (ret) {
      h += '<div class="st2d-ret"><div class="st2d-ret-n">' + ret.pct + '%</div>' +
        '<div class="st2d-ret-l">อัตราจำได้ (จากทบทวน ' + ret.n + ' ครั้งล่าสุด)</div></div>';
    }

    h += '<div class="st2d-sub">ความอยู่ตัวของคำ (คลังนี้)</div>';
    h += bar("ใหม่", mat.neu, maxMat, "var(--muted)");
    h += bar("กำลังเรียน", mat.learning, maxMat, "var(--review)");
    h += bar("รู้แล้ว (ไม่ถึง 21 วัน)", mat.young, maxMat, "var(--accent)");
    h += bar("แม่นแล้ว (≥21 วัน)", mat.mature, maxMat, "var(--know)");

    h += '<div class="st2d-sub">คำที่จะครบกำหนดใน 14 วันข้างหน้า' + (ds.overdue ? ' <span class="st2d-overdue">(' + ds.overdue + ' คำเลยกำหนดแล้ว)</span>' : '') + '</div>';
    h += '<div class="st2d-fc">';
    for (i = 0; i < ds.forecast.length; i++) {
      var hpct = maxFc ? Math.max(4, Math.round((ds.forecast[i] / maxFc) * 100)) : 4;
      h += '<div class="st2d-fc-col" title="' + (i === 0 ? "วันนี้" : "อีก " + i + " วัน") + ' · ' + ds.forecast[i] + ' คำ">' +
        '<div class="st2d-fc-bar" style="height:' + hpct + '%"></div><span>' + (i === 0 ? "วันนี้" : i) + '</span></div>';
    }
    h += '</div>';

    if (ds.leechCount > 0) {
      h += '<div class="st2d-leech">🐛 คำที่ตกม้าตายซ้ำๆ ' + ds.leechCount + ' คำ — เก็บเข้าสมุดคำผิดให้อัตโนมัติแล้ว ดูได้ที่ 📓 สมุดคำผิดด้านบน</div>';
    }

    h += '<div class="st2d-adv"><div class="st2d-adv-h">การ์ดขั้นสูง</div>' +
      '<label class="st2d-adv-row"><input type="checkbox" id="st2d-dirsplit"> ' +
      '<span>แยกคะแนนความจำสองทิศทาง (EN→TH กับ TH→EN นับคนละสกอร์) — เปิดแล้วจะมีการ์ดใหม่เพิ่มขึ้นตอนสลับทิศทางครั้งแรก</span></label></div>';

    if (window.PT && PT.ja) {
      h += '<div class="st2d-adv st2-ja"><div class="st2d-adv-h">ภาษาญี่ปุ่น <span lang="ja">日本語</span></div>' +
        '<label class="st2-jrow"><input type="checkbox" id="st2d-ja"> <span>แสดงภาษาญี่ปุ่น (เรียง ไทย → English → 日本語)</span></label>' +
        '<label class="st2-jrow" id="st2d-furi-r"><input type="checkbox" id="st2d-furi"> <span>ฟุริงานะ (คำอ่านบนตัวคันจิ)</span></label>' +
        '<label class="st2-jrow" id="st2d-rom-r"><input type="checkbox" id="st2d-rom"> <span>โรมาจิ (คำอ่านเขียนด้วยตัวอักษรอังกฤษ)</span></label>' +
        '<div class="st2d-jv" id="st2d-ja-v"></div>' +
        '<button type="button" class="st2-jdl" id="st2d-ja-dl">ดาวน์โหลดญี่ปุ่นทั้งหมด (ใช้ออฟไลน์)</button></div>';
    }

    h += '</div>';
    return h;
  }

  function wireJa() {
    var m = document.getElementById("st2d-ja");
    if (!m || !window.S || !PT.ja) return;
    var f = document.getElementById("st2d-furi"), r = document.getElementById("st2d-rom");
    var vl = document.getElementById("st2d-ja-v"), dl = document.getElementById("st2d-ja-dl");
    function sync() {
      var on = !!S.settings.showJa;
      m.checked = on; f.checked = S.settings.showFuri !== false; r.checked = S.settings.showRomaji !== false;
      f.disabled = r.disabled = !on;
      document.getElementById("st2d-furi-r").className = "st2-jrow" + (on ? "" : " dis");
      document.getElementById("st2d-rom-r").className = "st2-jrow" + (on ? "" : " dis");
      var voice = PT.ja.voiceStatus(), c = PT.ja.coverage(S.deck), n = 0, k, fs = PT.ja.files();
      for (k in fs) if (Object.prototype.hasOwnProperty.call(fs, k)) n++;
      vl.innerHTML = (voice ? "เสียงญี่ปุ่น: " + esc(voice) : "ยังไม่พบเสียงญี่ปุ่นในเครื่อง (iPhone: ตั้งค่า › การช่วยการเข้าถึง › เนื้อหาที่พูด › เสียง › ภาษาญี่ปุ่น)") +
        "<br>ชุดนี้มีภาษาญี่ปุ่น " + (c ? c[0] + " / " + c[1] + " รายการ" : "— ยังไม่มี") + " · ไฟล์ทั้งหมด " + n + " ไฟล์";
      dl.style.display = on && n ? "" : "none";
    }
    m.onchange = function () { PT.ja.toggle(m.checked); };
    f.onchange = function () { S.settings.showFuri = f.checked; try { store.set("pt_settings", JSON.stringify(S.settings)); } catch (e) {} sync(); };
    r.onchange = function () { S.settings.showRomaji = r.checked; try { store.set("pt_settings", JSON.stringify(S.settings)); } catch (e) {} sync(); };
    dl.onclick = function () {
      dl.disabled = true;
      PT.ja.downloadAll(function (i, n, done) {
        dl.textContent = done ? "ดาวน์โหลดครบแล้ว ✓ (" + n + " ไฟล์)" : "กำลังดาวน์โหลด " + (i + 1) + " / " + n + "…";
        if (done) {
          dl.disabled = false;
          try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
            vl.innerHTML += "<br>พื้นที่ที่แอปใช้: " + Math.round((e.usage || 0) / 1048576) + " MB";
          }); } catch (e) {}
        }
      });
    };
    sync();
  }

  function wire(v) {
    wireJa();
    var cb = document.getElementById("st2d-dirsplit");
    if (!cb || !window.S) return;
    cb.checked = !!(S.settings && S.settings.dirSplit);
    cb.onchange = function () {
      S.settings = S.settings || {};
      S.settings.dirSplit = cb.checked;
      try { store.set("pt_settings", JSON.stringify(S.settings)); } catch (e) {}
    };
  }

  return { section: section, wire: wire };
})();
