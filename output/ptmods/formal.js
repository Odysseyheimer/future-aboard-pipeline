/* formal.js — "เขียนอังกฤษให้มืออาชีพ" (PT.formal): normal -> formal English map.
   3 tabs: MAP (verb -> formal family), LIST (all formal words + explanation),
   FLASHCARDS (flip & drill). Plus a translate-to-formal helper. Hidden mode "formal"
   (like PT.structure). ES5. Data: data/formal.json (lazy). Uses S, esc, store, speak, goMode. */
PT.formal = (function () {
  "use strict";
  var DATA = null;        // loaded formal.json
  var flat = null;        // flattened, deduped formal words (for list + cards)
  var tab = "map";        // map | list | cards | quiz
  var view = "";          // "" = tab shell ; detail ; translate
  var quizPool = null;    // [{eg, egth, egf, egfth, ctx, ans, base, base_th, family}]
  var QZ = { ctx: "", cur: null, answered: false, chosen: "", score: 0, total: 0 };
  var articles = null;    // loaded formal_articles.json
  var artCur = null;      // current article (detail)
  var actx = "";          // article context filter
  var mapPage = 0, listPage = 0, artPage = 0, phrPage = 0;   // pagination
  var PER_MAP = 20, PER_LIST = 12, PER_ART = 12, PER_PHR = 12;
  var PHR = null;         // loaded formal_phrases.json
  var phq = "";           // phrases search
  var pfn = "";           // phrases function filter
  var pctx = "";          // phrases context filter ("", business, technical)
  var pkind = "";         // phrases kind filter ("", phrase, linker)
  var SH = { list: null, idx: 0, scope: "phrase" };  // "ฟังแล้วพูดตาม" shadowing player

  function pgTop() { try { window.scrollTo(0, 0); } catch (e) {} var vv = document.getElementById("view"); if (vv) vv.scrollTop = 0; var ap = document.getElementById("app"); if (ap) ap.scrollTop = 0; }
  function pagerHtml(page, pages) {
    if (pages <= 1) return "";
    return '<div class="fm-pager">' +
      '<button class="fm-pg" data-pg="' + (page - 1) + '"' + (page <= 0 ? ' disabled' : '') + '>‹ ก่อนหน้า</button>' +
      '<span class="fm-pg-info">' + (page + 1) + ' / ' + pages + '</span>' +
      '<button class="fm-pg" data-pg="' + (page + 1) + '"' + (page >= pages - 1 ? ' disabled' : '') + '>ถัดไป ›</button></div>';
  }
  var q = "";             // map search
  var lq = "";            // list search
  var theme = "";         // map theme filter
  var lctx = "";          // list context filter ("", business, technical)
  var cur = null;         // current entry (detail)
  var CD = { on: false, queue: [], flip: false, learned: 0, total: 0, ctx: "", theme: "" };

  function V() { return document.getElementById("view"); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z]/g, ""); }
  function low(s) { return String(s || "").toLowerCase(); }

  var THEMES = [
    { id: "", ic: "📚", th: "ทั้งหมด" },
    { id: "requests", ic: "🙋", th: "ขอ / ร้องขอ" },
    { id: "giving-info", ic: "💬", th: "ให้ข้อมูล / อธิบาย" },
    { id: "confirming", ic: "✅", th: "ยืนยัน / ตอบรับ" },
    { id: "errors-fixing", ic: "🛠️", th: "แก้ปัญหา / บั๊ก" },
    { id: "time-delays", ic: "⏰", th: "เวลา / เลื่อนนัด" },
    { id: "money-refunds", ic: "💳", th: "เงิน / คืนเงิน" },
    { id: "access-security", ic: "🔐", th: "สิทธิ์ / ความปลอดภัย" },
    { id: "system-actions", ic: "⚙️", th: "สั่งงานระบบ" },
    { id: "data-actions", ic: "🗄️", th: "จัดการข้อมูล" }
  ];
  var THEME_TH = {}; (function () { for (var i = 0; i < THEMES.length; i++) THEME_TH[THEMES[i].id] = THEMES[i].th; })();
  var USE = {
    business: { th: "ธุรกิจ / อีเมล", cls: "fm-u-biz", ic: "💼" },
    technical: { th: "เทคนิค / โค้ด", cls: "fm-u-tech", ic: "⚙️" },
    both: { th: "ใช้ได้ทั้งคู่", cls: "fm-u-both", ic: "🔵" }
  };
  var LEVEL = {
    neutral: { th: "กลางๆ", cls: "fm-l-n" },
    formal: { th: "ทางการ", cls: "fm-l-f" },
    "very formal": { th: "ทางการมาก", cls: "fm-l-vf" }
  };
  var FREQ = { 4: { th: "เจอบ่อยมาก", cls: "fm-f4" }, 3: { th: "เจอบ่อย", cls: "fm-f3" }, 2: { th: "เจอบ้าง", cls: "fm-f2" }, 1: { th: "นานๆ ที", cls: "fm-f1" } };
  var lsort = "az";       // list sort: az | freq
  function freqBadge(r) {
    r = r || 1; var f = FREQ[r] || FREQ[1], dots = "";
    for (var i = 1; i <= 4; i++) dots += '<span class="fm-fdot' + (i <= r ? " on" : "") + '"></span>';
    return '<span class="fm-freq ' + f.cls + '"><span class="fm-fdots">' + dots + '</span>' + f.th + '</span>';
  }

  function fetchData(cb) {
    if (DATA) { cb(); return; }
    fetch("data/formal.json").then(function (r) { return r.json(); }).then(function (j) { DATA = j || []; buildFlat(); cb(); }).catch(function () { DATA = null; cb(); });
  }
  // flatten every formal word (deduped by word) with its context + an example
  function buildFlat() {
    flat = []; var seen = {}, i, k;
    for (i = 0; i < DATA.length; i++) {
      var e = DATA[i], fam = e.family || [];
      for (k = 0; k < fam.length; k++) {
        var f = fam[k], key = norm(f.w);
        if (!key || seen[key]) continue; seen[key] = 1;
        var eg = "", egth = "";
        var blocks = [e.biz, e.tech];
        for (var b = 0; b < blocks.length; b++) {
          var bl = blocks[b];
          if (bl && bl.eg_formal && low(bl.eg_formal).indexOf(low(f.w)) >= 0) { eg = bl.eg_formal; egth = bl.eg_formal_th; break; }
        }
        if (!eg) { var any = e.biz || e.tech; if (any) { eg = any.eg_formal; egth = any.eg_formal_th; } }
        flat.push({ key: key, w: f.w, th: f.th, use: f.use, level: f.level, note: f.note_en, rank: f.rank || 1, base: e.base, base_th: e.base_th, theme: e.theme, eg: eg, egth: egth });
      }
    }
  }

  /* ---------- learned store ---------- */
  function known() { try { return JSON.parse(store.get("pt_fvocab") || "{}"); } catch (e) { return {}; } }
  function setKnown(k) { var o = known(); o[k] = 1; try { store.set("pt_fvocab", JSON.stringify(o)); } catch (e) {} }
  function knownCount() { var o = known(), n = 0, x; for (x in o) if (o.hasOwnProperty(x)) n++; return n; }

  /* ---------- dispatch ---------- */
  function render(v) {
    if (!DATA) { v.innerHTML = '<div class="fm-load">กำลังโหลด…</div>'; fetchData(function () { if (!DATA) { v.innerHTML = '<div class="fm-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; } paint(v); }); return; }
    paint(v);
  }
  function paint(v) {
    if (view === "detail") return renderDetail(v);
    if (view === "shadow") return renderShadow(v);
    if (view === "article") return renderArticle(v);
    return renderShell(v);
  }
  function renderShell(v) {
    var h = ['<div class="fm-wrap">'];
    h.push('<div class="fm-hero">✒️ เขียนอังกฤษให้มืออาชีพ</div>');
    h.push('<div class="fm-tabs">' +
      '<button class="fm-tab' + (tab === "map" ? " on" : "") + '" data-tab="map">🗺️ แผนที่</button>' +
      '<button class="fm-tab' + (tab === "list" ? " on" : "") + '" data-tab="list">📋 รายการ</button>' +
      '<button class="fm-tab' + (tab === "phrases" ? " on" : "") + '" data-tab="phrases">📇 วลี</button>' +
      '<button class="fm-tab' + (tab === "cards" ? " on" : "") + '" data-tab="cards">🎴 การ์ด</button>' +
      '<button class="fm-tab' + (tab === "quiz" ? " on" : "") + '" data-tab="quiz">🎯 ควิซ</button>' +
      '<button class="fm-tab' + (tab === "articles" ? " on" : "") + '" data-tab="articles">📄 บทความ</button></div>');
    h.push('<div id="fm-body"></div></div>');
    v.innerHTML = h.join("");
    [].forEach.call(v.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { tab = b.getAttribute("data-tab"); CD.on = false; renderShell(v); }; });
    paintBody(v);
  }
  function paintBody(v) {
    var body = v.querySelector("#fm-body"); if (!body) return;
    if (tab === "list") return renderList(body, v);
    if (tab === "phrases") return renderPhrases(body, v);
    if (tab === "cards") return renderCards(body, v);
    if (tab === "quiz") return renderQuiz(body, v);
    if (tab === "articles") return renderArticles(body, v);
    return renderMap(body, v);
  }

  /* ============ TAB 1: MAP (verb -> family) ============ */
  function matchMap(e) {
    if (theme && e.theme !== theme) return false;
    if (!q) return true;
    var hay = low(e.base) + " " + low(e.base_th);
    for (var i = 0; i < (e.family || []).length; i++) hay += " " + low(e.family[i].w) + " " + low(e.family[i].th);
    return hay.indexOf(low(q)) >= 0;
  }
  function renderMap(body, v) {
    var list = DATA.filter(matchMap);
    var h = [];
    h.push('<div class="fm-sub">คำง่ายๆ กลายเป็นคำทางการยังไง ทั้งสาย <b>ธุรกิจ</b> และ <b>เทคนิค</b> — แตะดูตระกูลคำ</div>');
    if (mapPage === 0 && !q && !theme) h.push(wodHtml());
    h.push('<button class="fm-transbtn" data-fm-shadow="1">🗣️ ฟังแล้วพูดตาม — ฝึกออกเสียงวลีทางการ</button>');
    h.push('<input class="fm-search" id="fm-q" type="text" autocomplete="off" placeholder="ค้นหา เช่น give, ask, fix, ขอ, แก้…" value="' + esc(q) + '">');
    h.push('<div class="fm-chips">');
    for (var i = 0; i < THEMES.length; i++) h.push('<button class="fm-chip' + (theme === THEMES[i].id ? " on" : "") + '" data-fm-theme="' + THEMES[i].id + '">' + THEMES[i].ic + ' ' + esc(THEMES[i].th) + '</button>');
    var pages = Math.max(1, Math.ceil(list.length / PER_MAP)); if (mapPage >= pages) mapPage = pages - 1; if (mapPage < 0) mapPage = 0;
    var slice = list.slice(mapPage * PER_MAP, mapPage * PER_MAP + PER_MAP);
    h.push('</div><div class="fm-count">' + list.length + ' คำหลัก</div>' + pagerHtml(mapPage, pages) + '<div class="fm-list">');
    for (i = 0; i < slice.length; i++) {
      var e = slice[i], fam = (e.family || []).slice(0, 3).map(function (f) { return esc(f.w); }).join(" · ");
      h.push('<button class="fm-item" data-fm-base="' + esc(e.base) + '"><div class="fm-item-top"><span class="fm-item-base">' + esc(e.base) + '</span><span class="fm-item-th">' + esc(e.base_th) + '</span></div><div class="fm-item-fam">→ ' + fam + ((e.family || []).length > 3 ? ' …' : '') + '</div></button>');
    }
    if (!list.length) h.push('<div class="fm-load">ไม่พบคำที่ค้นหา</div>');
    h.push('</div>' + pagerHtml(mapPage, pages));
    body.innerHTML = h.join("");
    var qi = body.querySelector("#fm-q");
    if (qi) qi.oninput = function () { q = qi.value; mapPage = 0; var p = qi.selectionStart; renderMap(body, v); var q2 = body.querySelector("#fm-q"); if (q2) { q2.focus(); try { q2.setSelectionRange(p, p); } catch (e) {} } };
    [].forEach.call(body.querySelectorAll("[data-fm-theme]"), function (b) { b.onclick = function () { theme = b.getAttribute("data-fm-theme"); mapPage = 0; renderMap(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-pg]"), function (b) { b.onclick = function () { mapPage = parseInt(b.getAttribute("data-pg"), 10); renderMap(body, v); pgTop(); }; });
    [].forEach.call(body.querySelectorAll("[data-fm-base]"), function (b) { b.onclick = function () { cur = find(b.getAttribute("data-fm-base")); view = "detail"; paint(v); }; });
    var tb = body.querySelector("[data-fm-shadow]"); if (tb) tb.onclick = function () { view = "shadow"; SH.list = null; SH.idx = 0; paint(v); };
    var wb = body.querySelector("[data-fm-wod]"); if (wb) wb.onclick = function () { setKnown(wb.getAttribute("data-fm-wod")); renderMap(body, v); };
    wireSay(body);
  }
  function find(base) { for (var i = 0; i < DATA.length; i++) if (DATA[i].base === base) return DATA[i]; return null; }
  function findCI(base) { var b = low(base); for (var i = 0; i < DATA.length; i++) if (low(DATA[i].base) === b) return DATA[i]; return null; }

  /* word of the day — a deterministic formal word per calendar day */
  function wordOfDay() {
    if (!flat || !flat.length) return null;
    var dn = 0; try { dn = PT.srs.dayNum(); } catch (e) {}
    return flat[((dn % flat.length) + flat.length) % flat.length];
  }
  function wodHtml() {
    var f = wordOfDay(); if (!f) return "";
    var learned = !!known()[f.key];
    return '<div class="fm-wod">' +
      '<div class="fm-wod-lab">🌟 คำทางการประจำวัน</div>' +
      '<div class="fm-wod-top"><span class="fm-wod-w">' + esc(f.w) + '</span>' + sayBtn(f.w) + '<span class="fm-wod-th">' + esc(f.th) + '</span></div>' +
      '<div class="fm-wod-base">ทางการของ <b>' + esc(f.base) + '</b> (' + esc(f.base_th) + ')</div>' +
      '<div class="fm-wod-badges">' + freqBadge(f.rank) + useBadge(f.use) + lvBadge(f.level) + '</div>' +
      (f.eg ? '<div class="fm-wod-eg">“' + esc(f.eg) + '” ' + sayBtn(f.eg) + '<span class="fm-wod-egth">' + esc(f.egth) + '</span></div>' : '') +
      (learned ? '<div class="fm-wod-done">✓ จำคำนี้แล้ว</div>'
        : '<button class="fm-wod-btn" data-fm-wod="' + esc(f.key) + '">จำคำนี้แล้ว ✓</button>') +
      '</div>';
  }

  /* ============ TAB 2: LIST (all formal words) ============ */
  function useBadge(u) { var x = USE[u] || USE.both; return '<span class="fm-badge ' + x.cls + '">' + x.ic + ' ' + x.th + '</span>'; }
  function lvBadge(l) { var x = LEVEL[l] || LEVEL.formal; return '<span class="fm-badge ' + x.cls + '">' + x.th + '</span>'; }
  function matchList(f) {
    if (lctx && f.use !== lctx && f.use !== "both") return false;
    if (!lq) return true;
    return (low(f.w) + " " + low(f.th) + " " + low(f.base) + " " + low(f.base_th)).indexOf(low(lq)) >= 0;
  }
  function renderList(body, v) {
    var list = flat.filter(matchList);
    if (lsort === "freq") list = list.slice().sort(function (a, b) { return (b.rank - a.rank) || (a.w < b.w ? -1 : 1); });
    else list = list.slice().sort(function (a, b) { return a.w < b.w ? -1 : (a.w > b.w ? 1 : 0); });
    var h = [];
    h.push('<div class="fm-sub">คำทางการทั้งหมด ' + flat.length + ' คำ — จำได้แล้ว ' + knownCount() + ' คำ</div>');
    h.push('<input class="fm-search" id="fm-lq" type="text" autocomplete="off" placeholder="ค้นหาคำทางการ เช่น provide, resolve…" value="' + esc(lq) + '">');
    h.push('<div class="fm-chips">' +
      '<button class="fm-chip' + (lctx === "" ? " on" : "") + '" data-fm-ctx="">📚 ทั้งหมด</button>' +
      '<button class="fm-chip' + (lctx === "business" ? " on" : "") + '" data-fm-ctx="business">💼 ธุรกิจ</button>' +
      '<button class="fm-chip' + (lctx === "technical" ? " on" : "") + '" data-fm-ctx="technical">⚙️ เทคนิค</button></div>');
    h.push('<div class="fm-sortrow">เรียง: ' +
      '<button class="fm-sortbtn' + (lsort === "az" ? " on" : "") + '" data-fm-sort="az">ก-Z</button>' +
      '<button class="fm-sortbtn' + (lsort === "freq" ? " on" : "") + '" data-fm-sort="freq">🔥 เจอบ่อยสุดก่อน</button></div>');
    var pages = Math.max(1, Math.ceil(list.length / PER_LIST)); if (listPage >= pages) listPage = pages - 1; if (listPage < 0) listPage = 0;
    var slice = list.slice(listPage * PER_LIST, listPage * PER_LIST + PER_LIST);
    h.push('<div class="fm-count">' + list.length + ' คำ</div>' + pagerHtml(listPage, pages) + '<div class="fm-wlist">');
    for (var i = 0; i < slice.length; i++) {
      var f = slice[i];
      h.push('<div class="fm-wrow">' +
        '<div class="fm-wrow-top"><span class="fm-wrow-w">' + esc(f.w) + '</span>' + sayBtn(f.w) + '<span class="fm-wrow-th">' + esc(f.th) + '</span>' + (known()[f.key] ? '<span class="fm-learned">✓ จำแล้ว</span>' : '') + '</div>' +
        '<div class="fm-wrow-base">ทางการของ <b>' + esc(f.base) + '</b> (' + esc(f.base_th) + ')</div>' +
        '<div class="fm-wrow-badges">' + freqBadge(f.rank) + useBadge(f.use) + lvBadge(f.level) + '</div>' +
        '<div class="fm-wrow-note">' + esc(f.note) + '</div>' +
        (f.eg ? '<div class="fm-wrow-eg">“' + esc(f.eg) + '” ' + sayBtn(f.eg) + '<span class="fm-wrow-egth">' + esc(f.egth) + '</span></div>' : '') +
        '</div>');
    }
    if (!list.length) h.push('<div class="fm-load">ไม่พบคำที่ค้นหา</div>');
    h.push('</div>' + pagerHtml(listPage, pages));
    body.innerHTML = h.join("");
    var qi = body.querySelector("#fm-lq");
    if (qi) qi.oninput = function () { lq = qi.value; listPage = 0; var p = qi.selectionStart; renderList(body, v); var q2 = body.querySelector("#fm-lq"); if (q2) { q2.focus(); try { q2.setSelectionRange(p, p); } catch (e) {} } };
    [].forEach.call(body.querySelectorAll("[data-fm-ctx]"), function (b) { b.onclick = function () { lctx = b.getAttribute("data-fm-ctx"); listPage = 0; renderList(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-fm-sort]"), function (b) { b.onclick = function () { lsort = b.getAttribute("data-fm-sort"); listPage = 0; renderList(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-pg]"), function (b) { b.onclick = function () { listPage = parseInt(b.getAttribute("data-pg"), 10); renderList(body, v); pgTop(); }; });
    wireSay(body);
  }

  /* ============ TAB: PHRASES (วลี) — set-phrases + connectors ============ */
  var FN_TH = {
    opening: "👋 เปิดอีเมล", greeting: "👋 ทักทาย", closing: "🔚 ปิดอีเมล", "sign-off": "✍️ ลงท้าย",
    "follow-up": "🔁 ตามเรื่อง", request: "🙏 ขอ / ร้องขอ", offer: "🤝 เสนอช่วย", instruction: "📋 สั่ง / บอกวิธี",
    permission: "🔓 ขออนุญาต", apology: "🙇 ขอโทษ", "bad-news": "📉 แจ้งข่าวร้าย", problem: "⚠️ แจ้งปัญหา",
    complaint: "😤 ร้องเรียน", escalation: "⏫ ยกระดับเรื่อง", agreement: "👍 เห็นด้วย", confirmation: "✅ ยืนยัน",
    acknowledgement: "📨 รับทราบ", thanks: "🙏 ขอบคุณ", contrast: "🔀 แต่ / ขัดแย้ง", cause: "➡️ เหตุ-ผล",
    addition: "➕ เพิ่มเติม", condition: "❓ เงื่อนไข", sequence: "🔢 ลำดับ", example: "💡 ยกตัวอย่าง",
    conclusion: "🏁 สรุป", emphasis: "❗ เน้นย้ำ", hedging: "🤔 พูดกันชน",
    meeting: "👥 ประชุม", presenting: "📊 นำเสนอ", phone: "📞 โทร / วิดีโอคอล", feedback: "📝 ให้/รับ ฟีดแบ็ก",
    praise: "🌟 ชม", negotiation: "🤝 ต่อรอง", disagreement: "🙅 แย้งอย่างสุภาพ", smalltalk: "💬 คุยเล่น",
    networking: "🔗 เข้าสังคม / รู้จักคน", "code-review": "👨‍💻 รีวิวโค้ด / PR", status: "📶 อัปเดตงาน",
    incident: "🚨 เหตุขัดข้อง", standup: "🗒️ standup ประจำวัน",
    interview: "💼 สัมภาษณ์งาน", support: "🎧 บริการลูกค้า", customer: "🛒 ในฐานะลูกค้า", clarify: "❓ ขอความชัดเจน",
    "help-request": "🆘 ขอความช่วยเหลือ", opinion: "💭 แสดงความเห็น", discussion: "💬 ถกประเด็น", dining: "🍽️ ร้านอาหาร",
    shopping: "🛍️ ช้อปปิ้ง", directions: "🧭 ถามทาง", travel: "✈️ เดินทาง / โรงแรม", invitation: "🎉 ชวน / เชิญ",
    plans: "📅 นัดหมาย / วางแผน", compliment: "😊 ชมเชย", deadline: "⏳ เดดไลน์", priority: "🔺 จัดลำดับความสำคัญ",
    logistics: "📧 จัดการอีเมล (cc / loop in)",
    idiom: "🎭 สำนวนออฟฟิศ", phrasal: "🔗 phrasal verb งาน", softening: "🕊️ พูดนุ่มนวล", money: "💰 เงิน / งบ",
    delegating: "🧑‍💼 มอบหมาย / รับงาน", async: "🌐 async / รีโมต"
  };
  var FN_ORDER = ["opening", "greeting", "smalltalk", "networking", "invitation", "plans", "compliment", "request",
    "offer", "instruction", "permission", "help-request", "clarify", "confirmation", "agreement", "acknowledgement",
    "thanks", "praise", "feedback", "opinion", "discussion", "follow-up", "closing", "sign-off", "meeting", "presenting",
    "phone", "interview", "support", "customer", "negotiation", "disagreement", "apology", "bad-news", "problem",
    "complaint", "escalation", "deadline", "priority", "logistics", "delegating", "status", "incident", "standup",
    "code-review", "async", "dining", "shopping", "directions", "travel", "idiom", "phrasal", "softening", "money",
    "contrast", "cause", "condition", "addition", "emphasis", "sequence", "example", "conclusion", "hedging"];
  var PFREQ = { common: { th: "ใช้บ่อยมาก", cls: "fm-f4" }, occasional: { th: "ใช้บ้าง", cls: "fm-f2" }, specialized: { th: "เฉพาะทาง", cls: "fm-f1" } };
  var KIND_TH = { phrase: "🧩 วลี", linker: "🔗 คำเชื่อม" };
  function fnTh(f) { return FN_TH[f] || ("• " + (f || "")); }
  function fnBadge(f) { return '<span class="fm-badge fm-b-fn">' + esc(fnTh(f)) + '</span>'; }
  function kindBadge(k) { return '<span class="fm-badge fm-b-kind">' + esc(KIND_TH[k] || k || "") + '</span>'; }
  function pfreqBadge(fr) { var x = PFREQ[fr] || PFREQ.occasional; return '<span class="fm-freq ' + x.cls + '">' + esc(x.th) + '</span>'; }

  function fetchPhr(cb) {
    if (PHR) { cb(); return; }
    fetch("data/formal_phrases.json").then(function (r) { return r.json(); }).then(function (j) { PHR = j || []; cb(); }).catch(function () { PHR = null; cb(); });
  }
  function phrFns() {
    var seen = {}, i; for (i = 0; i < PHR.length; i++) seen[PHR[i].fn] = 1;
    var out = []; for (i = 0; i < FN_ORDER.length; i++) if (seen[FN_ORDER[i]]) out.push(FN_ORDER[i]);
    for (var k in seen) if (seen.hasOwnProperty(k) && FN_ORDER.indexOf(k) < 0) out.push(k);
    return out;
  }
  function matchPhr(p) {
    if (pkind && p.kind !== pkind) return false;
    if (pctx && p.use !== pctx && p.use !== "both") return false;
    if (pfn && p.fn !== pfn) return false;
    if (!phq) return true;
    return (low(p.en) + " " + low(p.th) + " " + low(p.casual)).indexOf(low(phq)) >= 0;
  }
  function renderPhrases(body, v) {
    if (!PHR) { body.innerHTML = '<div class="fm-load">กำลังโหลด…</div>'; fetchPhr(function () { if (!PHR) { body.innerHTML = '<div class="fm-load">โหลดข้อมูลไม่สำเร็จ ลองใหม่</div>'; return; } renderPhrases(body, v); }); return; }
    var list = PHR.filter(matchPhr);
    var h = [];
    h.push('<div class="fm-sub">วลีและคำเชื่อมทางการ — พูดแบบไหนให้ดูมืออาชีพ ทั้ง <b>อีเมล/ธุรกิจ</b> และ <b>เทคนิค</b> รวม ' + PHR.length + ' สำนวน</div>');
    h.push('<input class="fm-search" id="fm-pq" type="text" autocomplete="off" placeholder="ค้นหา เช่น attached, however, ขอโทษ…" value="' + esc(phq) + '">');
    h.push('<div class="fm-chips">' +
      '<button class="fm-chip' + (pkind === "" ? " on" : "") + '" data-fm-pkind="">📚 ทั้งหมด</button>' +
      '<button class="fm-chip' + (pkind === "phrase" ? " on" : "") + '" data-fm-pkind="phrase">🧩 วลี</button>' +
      '<button class="fm-chip' + (pkind === "linker" ? " on" : "") + '" data-fm-pkind="linker">🔗 คำเชื่อม</button>' +
      '<span class="fm-chip-sep"></span>' +
      '<button class="fm-chip' + (pctx === "" ? " on" : "") + '" data-fm-pctx="">ทุกสาย</button>' +
      '<button class="fm-chip' + (pctx === "business" ? " on" : "") + '" data-fm-pctx="business">💼 ธุรกิจ</button>' +
      '<button class="fm-chip' + (pctx === "technical" ? " on" : "") + '" data-fm-pctx="technical">⚙️ เทคนิค</button></div>');
    var fns = phrFns();
    h.push('<div class="fm-chips fm-chips-fn"><button class="fm-chip' + (pfn === "" ? " on" : "") + '" data-fm-pfn="">🗂️ ทุกหน้าที่</button>');
    for (var j = 0; j < fns.length; j++) h.push('<button class="fm-chip' + (pfn === fns[j] ? " on" : "") + '" data-fm-pfn="' + esc(fns[j]) + '">' + esc(fnTh(fns[j])) + '</button>');
    h.push('</div>');
    var pages = Math.max(1, Math.ceil(list.length / PER_PHR)); if (phrPage >= pages) phrPage = pages - 1; if (phrPage < 0) phrPage = 0;
    var slice = list.slice(phrPage * PER_PHR, phrPage * PER_PHR + PER_PHR);
    h.push('<div class="fm-count">' + list.length + ' สำนวน</div>' + pagerHtml(phrPage, pages) + '<div class="fm-plist">');
    for (var i = 0; i < slice.length; i++) {
      var p = slice[i];
      h.push('<div class="fm-prow">' +
        '<div class="fm-prow-top"><span class="fm-prow-en">' + esc(p.en) + '</span>' + sayBtn(p.en) + '</div>' +
        '<div class="fm-prow-th">' + esc(p.th) + '</div>' +
        (p.casual ? '<div class="fm-prow-casual">แทนที่จะพูด <s>' + esc(p.casual) + '</s></div>' : '') +
        '<div class="fm-prow-badges">' + kindBadge(p.kind) + fnBadge(p.fn) + useBadge(p.use) + lvBadge(p.level) + pfreqBadge(p.freq) + '</div>' +
        (p.eg ? '<div class="fm-prow-eg">“' + esc(p.eg) + '” ' + sayBtn(p.eg) + (p.eg_th ? '<span class="fm-prow-egth">' + esc(p.eg_th) + '</span>' : '') + '</div>' : '') +
        '</div>');
    }
    if (!list.length) h.push('<div class="fm-load">ไม่พบสำนวนที่ค้นหา</div>');
    h.push('</div>' + pagerHtml(phrPage, pages));
    body.innerHTML = h.join("");
    var qi = body.querySelector("#fm-pq");
    if (qi) qi.oninput = function () { phq = qi.value; phrPage = 0; var pp = qi.selectionStart; renderPhrases(body, v); var q2 = body.querySelector("#fm-pq"); if (q2) { q2.focus(); try { q2.setSelectionRange(pp, pp); } catch (e) {} } };
    [].forEach.call(body.querySelectorAll("[data-fm-pkind]"), function (b) { b.onclick = function () { pkind = b.getAttribute("data-fm-pkind"); phrPage = 0; renderPhrases(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-fm-pctx]"), function (b) { b.onclick = function () { pctx = b.getAttribute("data-fm-pctx"); phrPage = 0; renderPhrases(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-fm-pfn]"), function (b) { b.onclick = function () { pfn = b.getAttribute("data-fm-pfn"); phrPage = 0; renderPhrases(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-pg]"), function (b) { b.onclick = function () { phrPage = parseInt(b.getAttribute("data-pg"), 10); renderPhrases(body, v); pgTop(); }; });
    wireSay(body);
  }

  /* ============ TAB 3: FLASHCARDS ============ */
  function cardScope() {
    return flat.filter(function (f) {
      if (CD.ctx && f.use !== CD.ctx && f.use !== "both") return false;
      if (CD.theme && f.theme !== CD.theme) return false;
      return true;
    });
  }
  function renderCards(body, v) {
    if (CD.on) return renderPlayer(body, v);
    var pool = cardScope();
    var h = [];
    h.push('<div class="fm-sub">พลิกการ์ดท่องคำทางการ เลือกขอบเขตแล้วเริ่มเล่นได้เลย</div>');
    h.push('<div class="fm-cd-lab">บริบท</div><div class="fm-chips">' +
      '<button class="fm-chip' + (CD.ctx === "" ? " on" : "") + '" data-cd-ctx="">📚 ทั้งหมด</button>' +
      '<button class="fm-chip' + (CD.ctx === "business" ? " on" : "") + '" data-cd-ctx="business">💼 ธุรกิจ</button>' +
      '<button class="fm-chip' + (CD.ctx === "technical" ? " on" : "") + '" data-cd-ctx="technical">⚙️ เทคนิค</button></div>');
    h.push('<div class="fm-cd-lab">หมวด</div><div class="fm-chips">');
    for (var i = 0; i < THEMES.length; i++) h.push('<button class="fm-chip' + (CD.theme === THEMES[i].id ? " on" : "") + '" data-cd-theme="' + THEMES[i].id + '">' + THEMES[i].ic + ' ' + esc(THEMES[i].th) + '</button>');
    h.push('</div>');
    h.push('<div class="fm-cd-count">การ์ดในชุดนี้: <b>' + pool.length + '</b> คำ · จำได้แล้วรวม ' + knownCount() + ' คำ</div>');
    h.push('<button class="fm-cd-start" data-cd-start="1">🎴 เริ่มเล่นแฟลชการ์ด</button>');
    body.innerHTML = h.join("");
    [].forEach.call(body.querySelectorAll("[data-cd-ctx]"), function (b) { b.onclick = function () { CD.ctx = b.getAttribute("data-cd-ctx"); renderCards(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-cd-theme]"), function (b) { b.onclick = function () { CD.theme = b.getAttribute("data-cd-theme"); renderCards(body, v); }; });
    var sb = body.querySelector("[data-cd-start]"); if (sb) sb.onclick = function () { startCards(pool, v); };
  }
  function startCards(pool, v) {
    if (!pool.length) return;
    CD.queue = shuffle(pool.slice()); CD.flip = false; CD.learned = 0; CD.total = CD.queue.length; CD.on = true;
    renderShell(v);
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function renderPlayer(body, v) {
    if (!CD.queue.length) {
      body.innerHTML = '<div class="fm-cd-done"><div class="fm-cd-done-i">🎉</div><div class="fm-cd-done-h">จบชุด!</div>' +
        '<div class="fm-cd-done-s">จำได้ ' + CD.learned + ' / ' + CD.total + ' คำ</div>' +
        '<button class="fm-cd-start" data-cd-again="1">เล่นอีกชุด</button><button class="fm-cd-exit" data-cd-exit="1">‹ กลับ</button></div>';
      body.querySelector("[data-cd-again]").onclick = function () { CD.on = false; renderShell(v); };
      body.querySelector("[data-cd-exit]").onclick = function () { CD.on = false; renderShell(v); };
      return;
    }
    var f = CD.queue[0], done = CD.total - CD.queue.length;
    var h = [];
    h.push('<div class="fm-cd-bar"><div class="fm-cd-fill" style="width:' + Math.round(done / CD.total * 100) + '%"></div></div>');
    h.push('<div class="fm-cd-prog">' + done + ' / ' + CD.total + ' · จำได้ ' + CD.learned + '</div>');
    if (!CD.flip) {
      h.push('<div class="fm-card fm-card-front" data-cd-flip="1">' +
        '<div class="fm-card-hint">คำทางการ · แตะเพื่อดูความหมาย</div>' +
        '<div class="fm-card-w">' + esc(f.w) + '</div>' + sayBtn(f.w) +
        '<div class="fm-card-badges">' + useBadge(f.use) + lvBadge(f.level) + '</div></div>');
    } else {
      h.push('<div class="fm-card fm-card-back">' +
        '<div class="fm-card-w2">' + esc(f.w) + '</div>' +
        '<div class="fm-card-th">' + esc(f.th) + '</div>' +
        '<div class="fm-card-base">ทางการของ <b>' + esc(f.base) + '</b> (' + esc(f.base_th) + ')</div>' +
        '<div class="fm-card-badges">' + freqBadge(f.rank) + useBadge(f.use) + lvBadge(f.level) + '</div>' +
        '<div class="fm-card-note">' + esc(f.note) + '</div>' +
        (f.eg ? '<div class="fm-card-eg">“' + esc(f.eg) + '” ' + sayBtn(f.eg) + '<div class="fm-card-egth">' + esc(f.egth) + '</div></div>' : '') +
        '</div>');
    }
    if (!CD.flip) h.push('<button class="fm-cd-flipbtn" data-cd-flip="1">พลิกการ์ด</button>');
    else h.push('<div class="fm-cd-rate"><button class="fm-cd-again2" data-cd-rate="0">🔁 ทวนอีก</button><button class="fm-cd-got" data-cd-rate="1">✓ จำได้แล้ว</button></div>');
    h.push('<button class="fm-cd-exit" data-cd-exit="1">‹ ออกจากการเล่น</button>');
    body.innerHTML = h.join("");
    [].forEach.call(body.querySelectorAll("[data-cd-flip]"), function (b) { b.onclick = function () { CD.flip = true; renderPlayer(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-cd-rate]"), function (b) { b.onclick = function () { rate(b.getAttribute("data-cd-rate") === "1", body, v); }; });
    body.querySelector("[data-cd-exit]").onclick = function () { CD.on = false; renderShell(v); };
    wireSay(body);
  }
  function rate(good, body, v) {
    var f = CD.queue.shift();
    if (good) { setKnown(f.key); CD.learned++; }
    else { CD.queue.splice(Math.min(4, CD.queue.length), 0, f); }  // repeat soon
    CD.flip = false;
    renderPlayer(body, v);
  }

  /* ============ TAB 4: QUIZ (normal sentence -> pick the formal word) ============ */
  function firstTok(s) { return low(s).split(" ")[0]; }
  function buildQuiz() {
    quizPool = [];
    for (var i = 0; i < DATA.length; i++) {
      var e = DATA[i], blocks = [[e.biz, "business"], [e.tech, "technical"]];
      for (var b = 0; b < blocks.length; b++) {
        var bl = blocks[b][0], ctx = blocks[b][1];
        if (!bl || !bl.eg_normal || !bl.eg_formal) continue;
        // which family word appears in the formal sentence = the answer
        var ans = null, bestLen = 0, egf = low(bl.eg_formal);
        for (var k = 0; k < (e.family || []).length; k++) {
          var f = e.family[k], w = low(f.w);
          var hit = egf.indexOf(w) >= 0 ? w.length : (egf.indexOf(firstTok(f.w)) >= 0 ? 1 : 0);
          if (hit > bestLen) { bestLen = hit; ans = f; }
        }
        if (!ans) continue;
        quizPool.push({ eg: bl.eg_normal, egth: bl.eg_normal_th, egf: bl.eg_formal, egfth: bl.eg_formal_th, ctx: ctx, ans: ans, base: e.base, base_th: e.base_th });
      }
    }
  }
  function quizOpts(qi) {
    var opts = [qi.ans.w], seen = {}, g = 0; seen[norm(qi.ans.w)] = 1;
    while (opts.length < 4 && g++ < 100) {
      var r = flat[Math.floor(Math.random() * flat.length)];
      if (norm(r.base) === norm(qi.base) || seen[norm(r.w)]) continue;
      seen[norm(r.w)] = 1; opts.push(r.w);
    }
    return shuffle(opts);
  }
  function quizPick() {
    var pool = quizPool.filter(function (x) { return !QZ.ctx || x.ctx === QZ.ctx; });
    if (!pool.length) { QZ.cur = null; return; }
    QZ.cur = pool[Math.floor(Math.random() * pool.length)];
    QZ.cur._opts = quizOpts(QZ.cur);
    QZ.answered = false; QZ.chosen = "";
  }
  function renderQuiz(body, v) {
    if (!quizPool) buildQuiz();
    if (!QZ.cur) quizPick();
    var q = QZ.cur, h = [];
    h.push('<div class="fm-qz-score">คะแนน <b>' + QZ.score + '</b> / ' + QZ.total + '</div>');
    h.push('<div class="fm-chips"><button class="fm-chip' + (QZ.ctx === "" ? " on" : "") + '" data-qz-ctx="">📚 ทั้งหมด</button>' +
      '<button class="fm-chip' + (QZ.ctx === "business" ? " on" : "") + '" data-qz-ctx="business">💼 อีเมล/ธุรกิจ</button>' +
      '<button class="fm-chip' + (QZ.ctx === "technical" ? " on" : "") + '" data-qz-ctx="technical">⚙️ เทคนิค</button></div>');
    if (!q) { h.push('<div class="fm-load">ไม่มีคำถามในบริบทนี้</div>'); body.innerHTML = h.join(""); wireCtx(body, v); return; }
    var cb = q.ctx === "business" ? '<span class="fm-badge fm-u-biz">💼 อีเมล / ธุรกิจ</span>' : '<span class="fm-badge fm-u-tech">⚙️ เทคนิค / โค้ด</span>';
    h.push('<div class="fm-qz-card"><div class="fm-qz-ctx">' + cb + '</div>');
    h.push('<div class="fm-qz-lab">ประโยคธรรมดา</div><div class="fm-qz-q">' + esc(q.eg) + ' ' + sayBtn(q.eg) + '</div><div class="fm-qz-qth">' + esc(q.egth) + '</div>');
    h.push('<div class="fm-qz-ask">ควรใช้คำทางการคำไหน?</div><div class="fm-qz-opts">');
    for (var i = 0; i < q._opts.length; i++) {
      var o = q._opts[i], cls = "";
      if (QZ.answered) { if (norm(o) === norm(q.ans.w)) cls = " ok"; else if (norm(o) === norm(QZ.chosen)) cls = " no"; }
      h.push('<button class="fm-qz-opt' + cls + '" data-qz-opt="' + esc(o) + '"' + (QZ.answered ? " disabled" : "") + '>' + esc(o) + '</button>');
    }
    h.push('</div>');
    if (QZ.answered) {
      h.push('<div class="fm-qz-reveal">' +
        '<div class="fm-qz-r-f">✓ ' + esc(q.egf) + ' ' + sayBtn(q.egf) + '<div class="fm-qz-r-th">' + esc(q.egfth) + '</div></div>' +
        '<div class="fm-qz-r-note"><b>' + esc(q.ans.w) + '</b> (' + esc(q.ans.th) + ') — ' + esc(q.ans.note_en) + '</div>' +
        '<div class="fm-qz-r-ctx">' + (q.ctx === "business" ? "💼 คำนี้ใช้ตอนเขียนอีเมล / งานธุรกิจ" : "⚙️ คำนี้ใช้ในงานเทคนิค / เอกสารโค้ด") + '</div></div>');
      h.push('<button class="fm-qz-next" data-qz-next="1">ถัดไป ▶</button>');
    }
    h.push('</div>');
    body.innerHTML = h.join("");
    wireCtx(body, v);
    [].forEach.call(body.querySelectorAll("[data-qz-opt]"), function (bt) { bt.onclick = function () { quizAnswer(bt.getAttribute("data-qz-opt"), body, v); }; });
    var nx = body.querySelector("[data-qz-next]"); if (nx) nx.onclick = function () { quizPick(); renderQuiz(body, v); };
    wireSay(body);
  }
  function wireCtx(body, v) { [].forEach.call(body.querySelectorAll("[data-qz-ctx]"), function (b) { b.onclick = function () { QZ.ctx = b.getAttribute("data-qz-ctx"); QZ.cur = null; renderQuiz(body, v); }; }); }
  function quizAnswer(o, body, v) {
    if (QZ.answered) return;
    QZ.answered = true; QZ.chosen = o; QZ.total++;
    if (norm(o) === norm(QZ.cur.ans.w)) QZ.score++;
    renderQuiz(body, v);
  }

  /* ============ TAB 5: ARTICLES (casual vs formal side by side) ============ */
  function fetchArticles(cb) {
    if (articles) { cb(); return; }
    fetch("data/formal_articles.json").then(function (r) { return r.json(); }).then(function (j) { articles = j || []; cb(); }).catch(function () { articles = []; cb(); });
  }
  var TYPE_TH = {
    "support-email": "อีเมลซัพพอร์ต", "refund-billing-email": "อีเมลเงิน/คืนเงิน", "internal-update": "อัปเดตงานในทีม",
    "job-application": "สมัครงาน/แนะนำตัว", "meeting-notes": "สรุปประชุม", "api-docs": "เอกสาร API",
    "sdk-readme": "คู่มือไลบรารี", "incident-report": "รายงานเหตุขัดข้อง", "pr-description": "อธิบาย Pull Request", "config-guide": "คู่มือตั้งค่า",
    "announcement-email": "ประกาศ / แจ้งข่าว", "apology-escalation": "ขอโทษ / ยกระดับปัญหา", "vendor-partner-email": "อีเมลคู่ค้า / ผู้ขาย",
    "onboarding-welcome": "ต้อนรับ / เริ่มใช้งาน", "slack-chat": "แชทงาน (Slack)", "standup-review": "สรุปงาน / รีวิว",
    "release-notes": "บันทึกอัปเดตเวอร์ชัน", "deprecation-notice": "ประกาศเลิกใช้", "error-message": "ข้อความแจ้งข้อผิดพลาด",
    "commit-pr": "คอมมิต / Pull Request", "troubleshooting-guide": "คู่มือแก้ปัญหา", "security-advisory": "ประกาศความปลอดภัย",
    "interview-email": "สัมภาษณ์งาน / ตอบ recruiter", "customer-reply": "ตอบลูกค้า / บริการลูกค้า", "meeting-recap": "สรุปประชุม / อัปเดตงาน",
    "networking-message": "ข้อความสร้างคอนเนคชัน", "negotiation-email": "อีเมลต่อรอง / แย้งสุภาพ", "scheduling-email": "นัดหมาย / เดดไลน์",
    "code-review-comment": "คอมเมนต์รีวิวโค้ด / PR"
  };
  function renderArticles(body, v) {
    if (!articles) { body.innerHTML = '<div class="fm-load">กำลังโหลดบทความ…</div>'; fetchArticles(function () { renderArticles(body, v); }); return; }
    var list = articles.filter(function (a) { return !actx || a.context === actx; });
    var h = [];
    h.push('<div class="fm-sub">อ่านบทความจริง เทียบ <b>ธรรมดา ↔ ทางการ</b> — เห็นเลยว่าประโยคแบบนี้ควรใช้คำทางการคำไหน</div>');
    h.push('<div class="fm-chips">' +
      '<button class="fm-chip' + (actx === "" ? " on" : "") + '" data-fm-actx="">📚 ทั้งหมด</button>' +
      '<button class="fm-chip' + (actx === "business" ? " on" : "") + '" data-fm-actx="business">💼 ธุรกิจ</button>' +
      '<button class="fm-chip' + (actx === "technical" ? " on" : "") + '" data-fm-actx="technical">⚙️ เทคนิค</button></div>');
    var pages = Math.max(1, Math.ceil(list.length / PER_ART)); if (artPage >= pages) artPage = pages - 1; if (artPage < 0) artPage = 0;
    var base = artPage * PER_ART, slice = list.slice(base, base + PER_ART);
    h.push('<div class="fm-count">' + list.length + ' บทความ</div>' + pagerHtml(artPage, pages) + '<div class="fm-list">');
    for (var i = 0; i < slice.length; i++) {
      var a = slice[i], cb = a.context === "business" ? "💼" : "⚙️";
      h.push('<button class="fm-art-item" data-fm-art="' + (base + i) + '">' +
        '<div class="fm-art-item-t">' + cb + ' ' + esc(a.title) + '</div>' +
        '<div class="fm-art-item-s">' + esc(TYPE_TH[a.type] || a.type) + ' · ' + esc(a.scenario_th) + '</div></button>');
    }
    if (!list.length) h.push('<div class="fm-load">ยังไม่มีบทความในบริบทนี้</div>');
    h.push('</div>' + pagerHtml(artPage, pages));
    body.innerHTML = h.join("");
    [].forEach.call(body.querySelectorAll("[data-fm-actx]"), function (b) { b.onclick = function () { actx = b.getAttribute("data-fm-actx"); artPage = 0; renderArticles(body, v); }; });
    [].forEach.call(body.querySelectorAll("[data-pg]"), function (b) { b.onclick = function () { artPage = parseInt(b.getAttribute("data-pg"), 10); renderArticles(body, v); pgTop(); }; });
    [].forEach.call(body.querySelectorAll("[data-fm-art]"), function (b) { b.onclick = function () { artCur = list[parseInt(b.getAttribute("data-fm-art"), 10)]; view = "article"; paint(v); }; });
  }
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function hiText(text, swaps) {
    var t = esc(text);
    for (var i = 0; i < (swaps || []).length; i++) {
      var to = swaps[i].to; if (!to) continue;
      var re = new RegExp("(" + reEsc(esc(to)) + ")", "i");
      t = t.replace(re, '<mark class="fm-art-hi">$1</mark>');
    }
    return t.replace(/\n/g, "<br>");
  }
  function plainText(text) { return esc(text).replace(/\n/g, "<br>"); }
  function renderArticle(v) {
    var a = artCur; if (!a) { view = ""; return renderShell(v); }
    var cb = a.context === "business" ? '<span class="fm-badge fm-u-biz">💼 ธุรกิจ / อีเมล</span>' : '<span class="fm-badge fm-u-tech">⚙️ เทคนิค / โค้ด</span>';
    var h = ['<div class="fm-wrap">'];
    h.push('<button class="fm-back" data-fm-back="1">‹ กลับ</button>');
    h.push('<div class="fm-art-title">' + esc(a.title) + '</div>');
    h.push('<div class="fm-art-th">' + esc(a.title_th) + '</div>');
    h.push('<div class="fm-art-scn">' + cb + ' ' + esc(a.scenario_th) + '</div>');
    h.push('<div class="fm-art-block fm-art-normal"><div class="fm-art-h">🙂 แบบธรรมดา</div>' +
      '<div class="fm-art-en">' + plainText(a.normal) + '</div><div class="fm-art-tha">' + plainText(a.normal_th) + '</div></div>');
    h.push('<div class="fm-art-arrow">↓ เขียนใหม่ให้ทางการ ↓</div>');
    h.push('<div class="fm-art-block fm-art-formal"><div class="fm-art-h">👔 แบบทางการ ' + sayBtn(a.formal) + '</div>' +
      '<div class="fm-art-en">' + hiText(a.formal, a.swaps) + '</div><div class="fm-art-tha">' + plainText(a.formal_th) + '</div></div>');
    if (a.swaps && a.swaps.length) {
      h.push('<div class="fm-art-swaps"><div class="fm-art-h">🔑 คำที่เปลี่ยน</div>');
      for (var i = 0; i < a.swaps.length; i++) {
        var s = a.swaps[i];
        h.push('<div class="fm-art-swap"><span class="fm-art-from">' + esc(s.from) + '</span> → <span class="fm-art-to">' + esc(s.to) + '</span> ' + sayBtn(s.to) + '<div class="fm-art-note">' + esc(s.note_th) + '</div></div>');
      }
      h.push('</div>');
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    v.querySelector("[data-fm-back]").onclick = function () { view = ""; paint(v); };
    wireSay(v);
  }

  /* ---------- detail (from map) ---------- */
  function sayBtn(txt) { return '<button class="fm-say" data-say="' + esc(txt) + '">🔊</button>'; }
  function famRow(f) {
    return '<div class="fm-fam"><div class="fm-fam-top"><span class="fm-fam-w">' + esc(f.w) + '</span> ' + sayBtn(f.w) +
      '<span class="fm-fam-th">' + esc(f.th) + '</span></div><div class="fm-badges">' + freqBadge(f.rank) + useBadge(f.use) + lvBadge(f.level) + '</div>' +
      '<div class="fm-fam-note">' + esc(f.note_en) + '</div></div>';
  }
  function egBlock(title, ic, b) {
    if (!b || !b.eg_formal) return "";
    return '<div class="fm-eg"><div class="fm-eg-h">' + ic + ' ' + title + '</div>' +
      '<div class="fm-eg-row fm-eg-n"><span class="fm-eg-lab">ธรรมดา</span>' + esc(b.eg_normal) + ' ' + sayBtn(b.eg_normal) + '<div class="fm-eg-th">' + esc(b.eg_normal_th) + '</div></div>' +
      '<div class="fm-eg-row fm-eg-f"><span class="fm-eg-lab">ทางการ</span>' + esc(b.eg_formal) + ' ' + sayBtn(b.eg_formal) + '<div class="fm-eg-th">' + esc(b.eg_formal_th) + '</div></div></div>';
  }
  function renderDetail(v) {
    var e = cur; if (!e) { view = ""; return renderShell(v); }
    var h = ['<div class="fm-wrap">'];
    h.push('<button class="fm-back" data-fm-back="1">‹ กลับ</button>');
    h.push('<div class="fm-d-base">' + esc(e.base) + ' ' + sayBtn(e.base) + '<span class="fm-d-th">' + esc(e.base_th) + '</span></div>');
    h.push('<div class="fm-d-theme">' + esc(THEME_TH[e.theme] || e.theme || "") + (e.freq ? ' · ' + esc(e.freq) : '') + '</div>');
    h.push('<div class="fm-d-lead">ทำไมถึงมีหลายคำ? แต่ละคำใช้ต่างกัน 👇</div>');
    for (var i = 0; i < (e.family || []).length; i++) h.push(famRow(e.family[i]));
    h.push(egBlock("ธุรกิจ / อีเมล", "💼", e.biz));
    h.push(egBlock("เทคนิค / เอกสาร", "⚙️", e.tech));
    h.push('</div>');
    v.innerHTML = h.join("");
    v.querySelector("[data-fm-back]").onclick = function () { view = ""; paint(v); };
    wireSay(v);
  }

  /* ---------- "ฟังแล้วพูดตาม" (shadowing) — listen then repeat aloud, no Claude ---------- */
  function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function shScope() {
    // shadow the phrases; "phrase" = full set-phrases (best to say), "all" = phrases + connectors
    if (!PHR) return [];
    return SH.scope === "all" ? PHR.slice() : PHR.filter(function (p) { return p.kind === "phrase"; });
  }
  function renderShadow(v) {
    if (!PHR) { v.innerHTML = '<div class="fm-wrap"><button class="fm-back" data-fm-back="1">‹ กลับ</button><div class="fm-load">กำลังโหลด…</div></div>';
      var bb = v.querySelector("[data-fm-back]"); if (bb) bb.onclick = function () { view = ""; paint(v); };
      fetchPhr(function () { if (!PHR) { v.querySelector(".fm-load").textContent = "โหลดข้อมูลไม่สำเร็จ ลองใหม่"; return; } renderShadow(v); }); return; }
    if (!SH.list || !SH.list.length) { SH.list = shuffleArr(shScope()); SH.idx = 0; }
    if (SH.idx >= SH.list.length) SH.idx = 0;
    var it = SH.list[SH.idx];
    var h = ['<div class="fm-wrap fm-sh-wrap">'];
    h.push('<button class="fm-back" data-fm-back="1">‹ กลับ</button>');
    h.push('<div class="fm-hero">🗣️ ฟังแล้วพูดตาม</div>');
    h.push('<div class="fm-sub">กด <b>ฟัง</b> แล้วพูดออกเสียงตามให้เหมือน ฝึกออกเสียงวลีทางการ พูดซ้ำได้เรื่อยๆ จนคล่อง</div>');
    h.push('<div class="fm-sh-scope"><button class="fm-sortbtn' + (SH.scope === "phrase" ? " on" : "") + '" data-sh-scope="phrase">🧩 เฉพาะวลี</button>' +
      '<button class="fm-sortbtn' + (SH.scope === "all" ? " on" : "") + '" data-sh-scope="all">➕ รวมคำเชื่อม</button></div>');
    h.push('<div class="fm-sh-prog">' + (SH.idx + 1) + ' / ' + SH.list.length + '</div>');
    h.push('<div class="fm-sh-card">');
    h.push('<div class="fm-sh-en">' + esc(it.en) + '</div>');
    h.push('<div class="fm-sh-th">' + esc(it.th) + '</div>');
    h.push('<div class="fm-sh-plays"><button class="fm-sh-play" data-say="' + esc(it.en) + '">🔊 ฟัง</button>' +
      '<button class="fm-sh-slow" data-slow="' + esc(it.en) + '">🐢 ช้าๆ</button></div>');
    if (it.eg) h.push('<div class="fm-sh-eg">ประโยคตัวอย่าง:<br>“' + esc(it.eg) + '” <button class="fm-say" data-say="' + esc(it.eg) + '">🔊</button>' +
      '<button class="fm-say" data-slow="' + esc(it.eg) + '">🐢</button><div class="fm-sh-egth">' + esc(it.eg_th) + '</div></div>');
    h.push('</div>');
    h.push('<div class="fm-sh-nav"><button class="fm-sh-prev" data-sh-nav="-1">‹ ก่อนหน้า</button>' +
      '<button class="fm-sh-next" data-sh-nav="1">พูดตามแล้ว ถัดไป ›</button></div>');
    h.push('<button class="fm-sh-shuffle" data-sh-shuffle="1">🔀 สลับลำดับใหม่</button>');
    h.push('</div>');
    v.innerHTML = h.join("");
    v.querySelector("[data-fm-back]").onclick = function () { view = ""; paint(v); };
    try { speak(it.en); } catch (e) {}   // auto-play on show (within the tap gesture, so iOS allows it)
    [].forEach.call(v.querySelectorAll("[data-sh-scope]"), function (b) { b.onclick = function () { SH.scope = b.getAttribute("data-sh-scope"); SH.list = null; SH.idx = 0; renderShadow(v); }; });
    [].forEach.call(v.querySelectorAll("[data-sh-nav]"), function (b) { b.onclick = function () { var d = parseInt(b.getAttribute("data-sh-nav"), 10); SH.idx = (SH.idx + d + SH.list.length) % SH.list.length; renderShadow(v); }; });
    var shb = v.querySelector("[data-sh-shuffle]"); if (shb) shb.onclick = function () { SH.list = shuffleArr(shScope()); SH.idx = 0; renderShadow(v); };
    wireSay(v);
  }

  function wireSay(root) { [].forEach.call(root.querySelectorAll("[data-say]"), function (b) { b.onclick = function (ev) { ev.stopPropagation(); try { speak(b.getAttribute("data-say")); } catch (e) {} }; }); }

  // build a base -> entry index (lazy); used by the discovery chip in the word deck
  function hasBase(base, cb) {
    fetchData(function () { cb(!!(DATA && findCI(base))); });
  }
  function baseFamilyStr(base) {
    if (!DATA) return "";
    var e = findCI(base); if (!e || !e.family) return "";
    return e.family.slice(0, 3).map(function (f) { return f.w; }).join(" · ");
  }
  return {
    render: render,
    open: function () { view = ""; goMode("formal"); },
    leave: function () {},
    hasBase: hasBase,          // hasBase(word, cb) -> cb(bool)
    familyOf: baseFamilyStr,   // familyOf(word) -> "provide · supply · offer" (after data loaded)
    openBase: function (base) {
      fetchData(function () {
        var e = DATA && findCI(base);
        if (e) { cur = e; view = "detail"; tab = "map"; } else { view = ""; }
        goMode("formal");
      });
    }
  };
})();
