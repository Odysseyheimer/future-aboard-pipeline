// PT.browse — Browse tab: paginated list + word detail bottom sheet.
// ES5 only. Uses frozen host helpers: esc, speak, keyOf, gcolor, PT.filters,
// PT.srs, DECKS, S. Renders into #view; opens #sheet/#sheetbg for detail.
(function () {
  "use strict";
  window.PT = window.PT || {};

  var PAGE_SIZE = 50;

  // --- helpers -------------------------------------------------------------

  // Truncate a string to n chars with an ellipsis (ES5-safe).
  function trunc(s, n) {
    s = s == null ? "" : String(s);
    if (s.length <= n) return s;
    return s.substring(0, n - 1) + "…";
  }

  // Group tag color + label. For decks with groups, color by group index in
  // DECKS[deck].groups; for syn (no group) show deck initials in a neutral tag.
  function groupTag(deckKey, item) {
    var def = DECKS[deckKey];
    var groups = (def && def.groups) || [];
    var g = item.g;
    if (!groups.length || !g) {
      // No group dimension (e.g. syn): show deck initials.
      var initials = deckInitials(def ? def.name : deckKey);
      return '<span class="pg-tag pg-tag-plain">' + esc(initials) + "</span>";
    }
    var idx = 0;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i] === g) { idx = i; break; }
    }
    return '<span class="pg-tag" style="background:' + gcolor(idx) +
      '">' + esc(g) + "</span>";
  }

  // Build 1-2 letter initials from a deck name (skip parens content).
  function deckInitials(name) {
    name = String(name || "");
    var clean = name.replace(/\(.*?\)/g, "");
    var parts = clean.split(/[^A-Za-z0-9]+/);
    var out = "";
    for (var i = 0; i < parts.length && out.length < 2; i++) {
      if (parts[i]) out += parts[i].charAt(0).toUpperCase();
    }
    return out || "?";
  }

  // Status dot color by SRS status.
  function statusColor(st) {
    if (st === "known") return "var(--know)";
    if (st === "due") return "var(--review)";
    if (st === "learning") return "var(--review)";
    return "var(--muted)"; // new
  }

  // Compute the pager page numbers with ellipsis. current +-2, first & last.
  // Returns array of numbers and the string "..." for gaps.
  function pagerItems(cur, total) {
    var out = [];
    var i;
    if (total <= 1) return [1];
    var lo = cur - 2, hi = cur + 2;
    if (lo < 1) lo = 1;
    if (hi > total) hi = total;
    // Always show first.
    out.push(1);
    if (lo > 2) out.push("…");
    for (i = lo; i <= hi; i++) {
      if (i !== 1 && i !== total) out.push(i);
    }
    if (hi < total - 1) out.push("…");
    if (total > 1) out.push(total);
    return out;
  }

  // --- detail bottom sheet -------------------------------------------------

  var sheetBound = false;

  function bindSheet() {
    if (sheetBound) return;
    var bg = document.getElementById("sheetbg");
    if (bg) {
      bg.onclick = function () { closeSheet(); };
    }
    sheetBound = true;
  }

  var openKey = null;   // which item's sheet is open (JA late-load re-render guard)
  function closeSheet() {
    openKey = null;
    var sheet = document.getElementById("sheet");
    var bg = document.getElementById("sheetbg");
    if (sheet) { sheet.classList.remove("open"); sheet.style.transform = ""; sheet.style.display = "none"; sheet.innerHTML = ""; }
    if (bg) { bg.classList.remove("open"); bg.style.display = "none"; }
  }

  function openSheet(item, deckKey) {
    var sheet = document.getElementById("sheet");
    var bg = document.getElementById("sheetbg");
    if (!sheet) return;
    bindSheet();

    var def = DECKS[deckKey] || {};
    var JM = !!(window.PT && PT.ja && PT.ja.on());
    var JH = JM ? PT.ja.head(deckKey, item) : null;
    var h = [];
    h.push('<div class="pg-sheet">');
    h.push('<button class="pg-close" type="button" aria-label="Close">✕</button>');

    if (JM && def.type === "sentence" && item.mt) h.push('<div class="jx-pre" lang="th">' + esc(item.mt) + "</div>");
    // Header: word + speak button + pos.
    h.push('<div class="pg-sh-head">');
    h.push('<div class="pg-sh-word">' + (item.em ? esc(item.em) + " " : "") + esc(item.w || "") +
      ' <button class="pg-spk pg-sh-say" type="button" data-say="' + esc(item.w || "") +
      '" aria-label="ฟังคำ">🔊</button>' +
      (def.type === "sentence"
        ? '<button class="pg-spk" type="button" data-slow="' + esc(item.w || "") + '" aria-label="อ่านช้า">🐢</button>'
        : '<button class="pg-spk" type="button" data-spell="' + esc(item.w || "") + '" aria-label="สะกดคำ">🔤</button>') +
      '</div>');
    if (item.p) h.push('<div class="pg-sh-pos">' + esc(item.p) + (item._no ? ' · <span class="pg-sh-no">คำที่ ' + item._no + (item.g && deckKey === "oxford" ? " ของ " + esc(item.g) : "") + '</span>' : '') + "</div>");
    else if (item._no) h.push('<div class="pg-sh-pos"><span class="pg-sh-no">ลำดับที่ ' + item._no + (item.g && deckKey === "oxford" ? " ของ " + esc(item.g) : "") + '</span></div>');
    h.push("</div>");

    // IPA pronunciation (enrichment).
    if (item.ip) h.push('<div class="pg-sh-ipa">' + esc(item.ip) + "</div>");

    // Verb forms V1 → V2 (past simple) → V3 (past participle), when this item is a verb.
    if (item.vf && item.vf.v2 && item.vf.v3) {
      h.push('<div class="pg-sh-vf">' +
        '<div class="pg-vf-cell"><span class="pg-vf-l">V1</span><span class="pg-vf-w">' + esc(item.w || "") + '</span></div>' +
        '<span class="pg-vf-ar">→</span>' +
        '<div class="pg-vf-cell"><span class="pg-vf-l">V2 · อดีต</span><span class="pg-vf-w">' + esc(item.vf.v2) +
        ' <button class="pg-spk" type="button" data-say="' + esc(item.vf.v2) + '" aria-label="ฟัง V2">🔊</button></span></div>' +
        '<span class="pg-vf-ar">→</span>' +
        '<div class="pg-vf-cell"><span class="pg-vf-l">V3 · Past Participle</span><span class="pg-vf-w">' + esc(item.vf.v3) +
        ' <button class="pg-spk" type="button" data-say="' + esc(item.vf.v3) + '" aria-label="ฟัง V3">🔊</button></span></div>' +
        (item.vf.ir ? '<div class="pg-vf-ir">⚠️ กริยาไม่ปกติ (irregular verb) — ต้องท่องจำรูปนี้ ไม่ได้เติม -ed</div>' : "") +
        "</div>");
    }

    // Meanings.
    if (JM && def.type === "sentence") {
      if (JH) h.push('<div class="pg-sh-mt">' + PT.ja.stack("", "", JH) + "</div>");
    } else if (JM) {
      h.push('<div class="pg-sh-mt">' + PT.ja.stack(item.mt, item.me ? esc(item.me) : "", JH, { kind: "w" }) + "</div>");
    } else {
    if (item.me) h.push('<div class="pg-sh-me">' + esc(item.me) + "</div>");
    if (item.mt) h.push('<div class="pg-sh-mt">' + esc(item.mt) + "</div>");
    }

    // Knowledge explainer ("what it is") — Knowledge deck enrichment.
    if (item.kn && (item.kn.th || item.kn.en)) {
      h.push('<div class="pg-sh-know"><div class="pg-sh-know-h">📖 มันคืออะไร</div>');
      if (JM) {
        h.push(PT.ja.stack(item.kn.th, item.kn.en ? '<span class="pg-sh-know-en">' + esc(item.kn.en) + "</span>" : "",
          PT.ja.ex(deckKey, item, item.kn.en)));
      } else {
      if (item.kn.en) h.push('<div class="pg-sh-know-en">' + esc(item.kn.en) + "</div>");
      if (item.kn.th) h.push('<div class="pg-sh-know-th">' + esc(item.kn.th) + "</div>");
      }
      h.push("</div>");
    }

    // Extra x with xlab label if present.
    if (item.x && def.xlab) {
      h.push('<div class="pg-sh-row"><span class="pg-sh-lab">' +
        esc(def.xlab) + '</span><span class="pg-sh-val">' +
        esc(item.x) + "</span></div>");
    } else if (item.x) {
      h.push('<div class="pg-sh-row"><span class="pg-sh-val">' +
        esc(item.x) + "</span></div>");
    }

    // Example EN + speak + TH (plus any enrichment examples in item.xs).
    var exList = [];
    if (item.ee) exList.push({ en: item.ee, th: item.et, x: 0 });
    if (item.xs && item.xs.length) {
      for (var xi = 0; xi < item.xs.length; xi++) {
        exList.push({ en: item.xs[xi].en || "", th: item.xs[xi].th || "", x: 1 });
      }
    }
    for (var ei = 0; ei < exList.length; ei++) {
      var ex = exList[ei];
      if (!ex.en) continue;
      if (JM) {
        h.push('<div class="pg-sh-ex">' + PT.ja.stack(ex.th, '<span class="pg-sh-ee">' + esc(ex.en) + "</span> " +
          '<button class="pg-spk" type="button" data-say="' + esc(ex.en) + '" aria-label="Speak">🔊</button>' +
          '<button class="pg-spk" type="button" data-slow="' + esc(ex.en) + '" aria-label="อ่านช้า">🐢</button>',
          ex.x ? PT.ja.xs(deckKey, item, ex.en) : PT.ja.ex(deckKey, item, ex.en)) + "</div>");
        continue;
      }
      h.push('<div class="pg-sh-ex"><span class="pg-sh-ee">' + esc(ex.en) + "</span> " +
        '<button class="pg-spk" type="button" data-say="' + esc(ex.en) + '" aria-label="Speak">🔊</button>' +
        '<button class="pg-spk" type="button" data-slow="' + esc(ex.en) + '" aria-label="อ่านช้า">🐢</button>');
      if (ex.th) h.push('<div class="pg-sh-et">' + esc(ex.th) + "</div>");
      h.push("</div>");
    }

    // Academic / study usage examples (Knowledge deck enrichment).
    if (item.au && item.au.length) {
      h.push('<div class="pg-sh-aca"><div class="pg-sh-aca-h">🎓 ใช้ในการเรียน / วิชาการ</div>');
      for (var ai = 0; ai < item.au.length; ai++) {
        var a = item.au[ai];
        if (!a.en) continue;
        if (JM) {
          h.push('<div class="pg-sh-ex">' + PT.ja.stack(a.th, '<span class="pg-sh-ee">' + esc(a.en) + "</span> " +
            '<button class="pg-spk" type="button" data-say="' + esc(a.en) + '" aria-label="Speak">🔊</button>',
            PT.ja.xs(deckKey, item, a.en)) + "</div>");
          continue;
        }
        h.push('<div class="pg-sh-ex"><span class="pg-sh-ee">' + esc(a.en) + "</span> " +
          '<button class="pg-spk" type="button" data-say="' + esc(a.en) + '" aria-label="Speak">🔊</button>');
        if (a.th) h.push('<div class="pg-sh-et">' + esc(a.th) + "</div>");
        h.push("</div>");
      }
      h.push("</div>");
    }

    // Synonyms / antonyms (enrichment).
    if (item.sy && item.sy.length) {
      h.push('<div class="pg-sh-row"><span class="pg-sh-lab">คำเหมือน</span><span class="pg-sh-val">' +
        esc(item.sy.join(", ")) + "</span></div>");
    }
    if (item.an && item.an.length) {
      h.push('<div class="pg-sh-row"><span class="pg-sh-lab">คำตรงข้าม</span><span class="pg-sh-val">' +
        esc(item.an.join(", ")) + "</span></div>");
    }

    // Teacher note.
    if (item.tn) {
      h.push('<div class="pg-sh-note"><span class="pg-sh-lab">Note</span> ' +
        esc(item.tn) + "</div>");
    }
    // Word-connections map entry (word decks only).
    if (item.w && def.type !== "sentence" && window.PT && PT.wmap) {
      h.push('<button class="pg-sh-map" type="button">🗺️ แผนที่คำ — คำเหมือน · ตรงข้าม · ใช้คู่กัน</button>');
    }
    // Formal-English discovery chip (filled async if this word has a formal family).
    if (item.w && def.type !== "sentence" && window.PT && PT.formal && PT.formal.hasBase) {
      h.push('<div id="fm-chip-slot"></div>');
    }
    // Retrieval question.
    if (item.rq) {
      h.push('<div class="pg-sh-rq"><span class="pg-sh-lab">Retrieval</span> ' +
        esc(item.rq) + "</div>");
    }

    h.push("</div>"); // .pg-sheet
    sheet.innerHTML = h.join("");
    sheet.style.display = "block";
    if (bg) bg.style.display = "block";
    // Reflow, then slide it up into view. Set the transform inline (reliably wins
    // over the base #sheet rule) plus the .open class for the backdrop.
    void sheet.offsetHeight;
    sheet.classList.add("open");
    if (bg) bg.classList.add("open");
    sheet.style.transform = "translateY(0)";

    // Wire buttons.
    var closeBtn = sheet.querySelector(".pg-close");
    if (closeBtn) closeBtn.onclick = function () { closeSheet(); };
    var spks = sheet.querySelectorAll(".pg-spk");
    for (var si = 0; si < spks.length; si++) {
      (function (btn) {
        btn.onclick = function () { speak(btn.getAttribute("data-say") || item.w || ""); };
      })(spks[si]);
    }
    openKey = deckKey + "|" + keyOf(item);
    if (JM) {
      (function (k, xf) {
        var again = function (ok) {
          if (!ok || openKey !== k || !sheet.querySelector(".pg-sheet")) return;
          var y = sheet.scrollTop; openSheet(item, deckKey); sheet.scrollTop = y;
        };
        if (!PT.ja.ensure(deckKey)) PT.ja.ensure(deckKey, again);
        if (xf && PT.ja.has(xf) && !PT.ja.ensure(xf)) PT.ja.ensure(xf, again);
      })(openKey, (item.xs && item.xs.length) || (item.au && item.au.length) ? PT.ja.xName(deckKey, item) : "");
    }
    var mapBtn = sheet.querySelector(".pg-sh-map");
    if (mapBtn) mapBtn.onclick = function () { if (PT.wmap && PT.wmap.openFor) PT.wmap.openFor(item, deckKey); };
    // Reveal the formal chip only if this headword maps to a formal family.
    if (item.w && def.type !== "sentence" && window.PT && PT.formal && PT.formal.hasBase) {
      (function (w) {
        PT.formal.hasBase(w, function (yes) {
          var slot = document.getElementById("fm-chip-slot");
          if (!slot || !yes) return;
          var fam = (PT.formal.familyOf && PT.formal.familyOf(w)) || "";
          slot.innerHTML = '<button class="pg-sh-formal" type="button">👔 พูดให้ทางการ: ' + esc(fam) + ' →</button>';
          var fb = slot.querySelector(".pg-sh-formal");
          if (fb) fb.onclick = function () { closeSheet(); PT.formal.openBase(w); };
        });
      })(item.w);
    }
  }

  // --- list + pager rendering ---------------------------------------------

  // Render only the list rows + pager into the host (keeps header intact).
  function renderListInto(host, list, deckKey, now) {
    var JM = !!(window.PT && PT.ja && PT.ja.on());
    var total = Math.ceil(list.length / PAGE_SIZE);
    if (total < 1) total = 1;
    // Clamp page.
    if (S.page < 1) S.page = 1;
    if (S.page > total) S.page = total;

    var start = (S.page - 1) * PAGE_SIZE;
    var end = start + PAGE_SIZE;
    if (end > list.length) end = list.length;

    var h = [];
    h.push('<div class="pg-list">');
    if (!list.length) {
      h.push('<div class="pg-empty">No items match.</div>');
    }
    for (var i = start; i < end; i++) {
      var item = list[i];
      var st = PT.srs.statusOf(S.rec[keyOf(item)] || PT.srs.newRecord(), now);
      h.push('<div class="pg-row" data-i="' + i + '">');
      h.push(groupTag(deckKey, item));
      h.push('<div class="pg-main">');
      h.push('<div class="pg-w">' + (item._no ? '<span class="pg-no">#' + item._no + '</span> ' : '') + esc(item.w || ""));
      if (item.p) h.push(' <span class="pg-pos">' + esc(item.p) + "</span>");
      h.push("</div>");
      h.push('<div class="pg-mt">' + esc(trunc(item.mt, 60)) + "</div>");
      if (JM) { var jl = PT.ja.head(deckKey, item); if (jl) h.push('<div class="pg-jl">' + PT.ja.line(jl) + "</div>"); }
      h.push("</div>"); // .pg-main
      h.push('<span class="pg-dot" style="background:' + statusColor(st) +
        '"></span>');
      h.push("</div>"); // .pg-row
    }
    h.push("</div>"); // .pg-list

    // Pager control.
    if (total > 1) {
      h.push('<div class="pg-pager">');
      h.push(pagerBtn("«", 1, S.page === 1));            // first
      h.push(pagerBtn("‹", S.page - 1, S.page === 1));   // prev
      var items = pagerItems(S.page, total);
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (it === "…") {
          h.push('<span class="pg-gap">…</span>');
        } else {
          h.push('<button class="pg-pg' + (it === S.page ? " pg-cur" : "") +
            '" type="button" data-pg="' + it + '">' + it + "</button>");
        }
      }
      h.push(pagerBtn("›", S.page + 1, S.page === total)); // next
      h.push(pagerBtn("»", total, S.page === total));       // last
      h.push("</div>");
    }

    host.innerHTML = h.join("");

    // Wire row taps.
    var rows = host.querySelectorAll(".pg-row");
    for (var r = 0; r < rows.length; r++) {
      (function (rowEl) {
        rowEl.onclick = function () {
          var idx = parseInt(rowEl.getAttribute("data-i"), 10);
          openSheet(list[idx], deckKey);
        };
      })(rows[r]);
    }

    // Wire pager taps (re-render only this host).
    var pbtns = host.querySelectorAll(".pg-pg, .pg-nav");
    for (var b = 0; b < pbtns.length; b++) {
      (function (btn) {
        if (btn.disabled) return;
        btn.onclick = function () {
          var pg = parseInt(btn.getAttribute("data-pg"), 10);
          if (isNaN(pg)) return;
          S.page = pg;
          renderListInto(host, list, deckKey, now);
          if (PT.a11y && PT.a11y.enhance) PT.a11y.enhance(host);
        };
      })(pbtns[b]);
    }
  }

  function pagerBtn(label, pg, disabled) {
    return '<button class="pg-nav" type="button" data-pg="' + pg + '"' +
      (disabled ? " disabled" : "") + ">" + label + "</button>";
  }

  // --- public render -------------------------------------------------------

  PT.browse = {
    openSheet: openSheet,
    closeSheet: closeSheet,
    render: function (viewEl) {
      if (!viewEl) return;
      var now = Date.now();
      var list = PT.filters.apply(S);
      var deckKey = S.deck;

      var h = [];
      // Featured learning resource: sentence structure.
      if (window.PT && PT.structure) h.push('<button class="lib-feat" id="lib-struct"><span class="lf-i">📐</span>' +
        '<span><b>โครงสร้างประโยค</b><em>เรียนรู้โครงประโยคอังกฤษ · WH · คำเชื่อม · การแปลงประโยค</em></span></button>');
      // Library deck header + "review this deck (Cards)" entry.
      var dnm = (window.DECKS && DECKS[deckKey]) ? DECKS[deckKey].name : deckKey;
      h.push('<div class="lib-head"><div class="lib-title">' + esc(dnm) + '</div>' +
        '<button class="lib-review" id="lib-review">🃏 ทบทวน</button></div>');
      // Count line.
      h.push('<div class="pg-count">' + list.length + " item" +
        (list.length === 1 ? "" : "s") + "</div>");
      // List/pager host (re-rendered on page change without touching count).
      h.push('<div class="pg-host" id="pg-host"></div>');
      viewEl.innerHTML = h.join("");

      var rv = viewEl.querySelector("#lib-review");
      if (rv) rv.onclick = function () { if (window.goMode) goMode("cards"); };
      var ls = viewEl.querySelector("#lib-struct");
      if (ls) ls.onclick = function () { if (PT.structure && PT.structure.open) PT.structure.open(); };
      var host = viewEl.querySelector("#pg-host");
      renderListInto(host, list, deckKey, now);

      if (PT.a11y && PT.a11y.enhance) PT.a11y.enhance(viewEl);
    }
  };
})();
