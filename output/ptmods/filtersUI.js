/* PT.filtersUI — multi-select filter controls for #filters host.
   ES5 only. Renders 3 chip rows (status / group / pos) + sort segmented
   control + clear-all, wired to S.filter plain-object "sets". */
(function () {
  "use strict";
  window.PT = window.PT || {};

  // Thai labels for status keys (order matches chip order below).
  var STATUS = [
    { k: "new",      t: "ใหม่" },                                   // ใหม่
    { k: "learning", t: "กำลังเรียน" }, // กำลังเรียน
    { k: "due",      t: "ถึงกำหนด" },             // ถึงกำหนด
    { k: "known",    t: "รู้แล้ว" }                    // รู้แล้ว
  ];

  // Thai labels for POS buckets, indexed parallel to PT.pos.LABELS.
  var POS_TH = {
    noun:      "คำนาม",                       // คำนาม
    verb:      "คำกริยา",           // คำกริยา
    adjective: "คำคุณศัพท์", // คำคุณศัพท์
    adverb:    "คำวิเศษ",           // คำวิเศษณ์
    other:     "อื่นๆ"                        // อื่นๆ
  };

  // Sort options for the segmented control.
  var SORTS = [
    { k: "az",     t: "A–Z" },
    { k: "random", t: "สุ่ม" },                                 // สุ่ม
    { k: "due",    t: "ถึงกำหนด" }          // ถึงกำหนด
  ];

  // hasK fallback (host provides it, but stay safe).
  function has(obj, k) {
    if (typeof hasK === "function") return hasK(obj, k);
    return obj && Object.prototype.hasOwnProperty.call(obj, k);
  }

  // Toggle a value in a plain-object set: absent -> true, present -> deleted.
  function toggleSet(set, v) {
    if (has(set, v)) { delete set[v]; }
    else { set[v] = true; }
  }

  // Best-effort status counts from PT.filters.counts (shape: {new,learning,due,known}).
  function statusCounts() {
    try {
      if (PT.filters && typeof PT.filters.counts === "function") {
        var c = PT.filters.counts(S, Date.now());
        if (c) return c;
      }
    } catch (e) {}
    return null;
  }

  // Build one chip: <button class="f-chip" data-f=.. data-v=..>.
  function chip(dim, value, label, active, styleAttr, countLabel) {
    var cls = "f-chip" + (active ? " f-on" : "");
    var st = styleAttr ? (' style="' + styleAttr + '"') : "";
    var cnt = (countLabel !== null && countLabel !== undefined)
      ? '<span class="f-count">' + esc(String(countLabel)) + "</span>" : "";
    return '<button type="button" class="' + cls + '" data-f="' + esc(dim) +
      '" data-v="' + esc(value) + '" aria-pressed="' + (active ? "true" : "false") + '"' +
      st + '>' + '<span class="f-lab">' + esc(label) + "</span>" + cnt + "</button>";
  }

  PT.filtersUI = {
    render: function (hostEl) {
      if (!hostEl) return;
      var F = S.filter;
      var html = [];

      // --- Row 1: status chips (with live counts) ---
      var counts = statusCounts();
      var r1 = ['<div class="f-row" role="group" aria-label="สถานะ">'];
      var i;
      for (i = 0; i < STATUS.length; i++) {
        var s = STATUS[i];
        var cn = counts ? (counts[s.k] || 0) : null;
        r1.push(chip("status", s.k, s.t, has(F.status, s.k), "", cn));
      }
      r1.push("</div>");
      html.push(r1.join(""));

      // --- Row 2: group chips (deck-specific, colored; hidden if none) ---
      var deck = DECKS[S.deck];
      var groups = (deck && deck.groups) ? deck.groups : [];
      if (groups.length) {
        var r2 = ['<div class="f-row" role="group" aria-label="กลุ่ม">'];
        for (i = 0; i < groups.length; i++) {
          var g = groups[i];
          var col = gcolor(i);
          var active = has(F.groups, g);
          // Active chip uses the group color as background; inactive shows a color dot via border.
          var style = active
            ? ("background:" + col + ";border-color:" + col + ";color:#fff")
            : ("border-color:" + col);
          r2.push(chip("groups", g, g, active, style, null));
        }
        r2.push("</div>");
        html.push(r2.join(""));
      }

      // --- Row 3: POS chips (skip for decks without part-of-speech, e.g. sentences) ---
      var deckDef = (window.DECKS && DECKS[S.deck]) ? DECKS[S.deck] : {};
      if (deckDef.type !== "sentence") {
        var labels = (PT.pos && PT.pos.LABELS) ? PT.pos.LABELS
          : ["noun", "verb", "adjective", "adverb", "other"];
        var r3 = ['<div class="f-row" role="group" aria-label="ชนิดคำ">'];
        for (i = 0; i < labels.length; i++) {
          var lb = labels[i];
          r3.push(chip("pos", lb, (POS_TH[lb] || lb), has(F.pos, lb), "", null));
        }
        r3.push("</div>");
        html.push(r3.join(""));
      }

      // --- Row 4: sort segmented control + clear-all ---
      var r4 = ['<div class="f-row f-toolrow">'];
      r4.push('<div class="f-seg" role="group" aria-label="เรียงลำดับ">');
      for (i = 0; i < SORTS.length; i++) {
        var so = SORTS[i];
        var on = (F.sort === so.k);
        r4.push('<button type="button" class="f-segbtn' + (on ? " f-on" : "") +
          '" data-sort="' + esc(so.k) + '" aria-pressed="' + (on ? "true" : "false") +
          '">' + esc(so.t) + "</button>");
      }
      r4.push("</div>");
      // Favorites toggle (⭐ ติดดาว)
      r4.push('<button type="button" class="f-chip f-fav' + (F.fav ? " f-on" : "") +
        '" data-act="fav" aria-pressed="' + (F.fav ? "true" : "false") +
        '"><span class="f-lab">⭐ ติดดาว</span></button>');
      // Mistake-notebook toggle (📓 มักผิด)
      var mc = (PT.miss && PT.miss.count) ? PT.miss.count(S.deck) : 0;
      r4.push('<button type="button" class="f-chip f-miss' + (F.miss ? " f-on" : "") +
        '" data-act="miss" aria-pressed="' + (F.miss ? "true" : "false") +
        '"><span class="f-lab">📓 มักผิด' + (mc ? " " + mc : "") + '</span></button>');
      // Clear-all (ล้างตัวกรอง)
      r4.push('<button type="button" class="f-clear" data-act="clear">' +
        "ล้างตัวกรอง" + "</button>");
      r4.push("</div>");
      html.push(r4.join(""));

      hostEl.innerHTML = html.join("");

      // --- Wire events via delegation (rebind each render) ---
      if (hostEl._ptFiltersHandler) {
        hostEl.removeEventListener("click", hostEl._ptFiltersHandler);
      }
      var handler = function (ev) {
        var el = ev.target;
        // Walk up to the actionable button.
        while (el && el !== hostEl &&
               !el.getAttribute && el.parentNode) { el = el.parentNode; }
        while (el && el !== hostEl) {
          if (el.getAttribute &&
              (el.getAttribute("data-f") || el.getAttribute("data-sort") ||
               el.getAttribute("data-act"))) break;
          el = el.parentNode;
        }
        if (!el || el === hostEl) return;

        var changed = false;
        var act = el.getAttribute("data-act");
        var sort = el.getAttribute("data-sort");
        var dim = el.getAttribute("data-f");

        if (act === "fav") {
          S.filter.fav = !S.filter.fav;
          changed = true;
        } else if (act === "miss") {
          S.filter.miss = !S.filter.miss;
          changed = true;
        } else if (act === "clear") {
          S.filter.groups = {};
          S.filter.status = {};
          S.filter.pos = {};
          S.filter.fav = false;
          S.filter.miss = false;
          // Leave sort and q as-is (clear filters, not search/sort). Reset sort too? Keep sort.
          changed = true;
        } else if (sort) {
          if (S.filter.sort !== sort) { S.filter.sort = sort; changed = true; }
        } else if (dim) {
          var v = el.getAttribute("data-v");
          var set = (dim === "groups") ? S.filter.groups
                  : (dim === "status") ? S.filter.status
                  : (dim === "pos")    ? S.filter.pos : null;
          if (set) { toggleSet(set, v); changed = true; }
        }

        if (changed) {
          PT.filtersUI.render(hostEl); // reflect active state immediately
          PT.bus.emit("filterchange");
        }
      };
      hostEl.addEventListener("click", handler);
      hostEl._ptFiltersHandler = handler;
    }
  };
})();
