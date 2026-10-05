/* PT.a11y — accessibility enhancement pass (module "a11y")
 * ES5-safe. Called by host as PT.a11y.enhance(rootEl) after every render.
 * Defensive: every lookup feature-detects before touching a node.
 * Does not alter app behavior/state — only adds/refreshes ARIA, lang,
 * tabindex, and focus-related attributes.
 */
(function () {
  "use strict";

  window.PT = window.PT || {};

  // ---- small regex helpers for lang detection --------------------------
  // Thai block: U+0E00-U+0E7F. If a string contains any Thai codepoint we
  // treat it as Thai; otherwise, if it contains at least one Latin letter,
  // we treat it as English. Strings with neither (numbers/punct only) are
  // left untouched.
  var THAI_RE = /[฀-๿]/;
  var LATIN_RE = /[A-Za-z]/;
  var JA_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

  function setLangFor(el) {
    if (!el) return;
    try {
      // an author-set lang (e.g. the Japanese layer's lang="ja") always wins; only re-tag our own
      if (el.hasAttribute("lang") && el.getAttribute("data-al") !== "1") return;
      var t = el.textContent || "";
      if (!t || !t.replace(/\s+/g, "")) return;
      if (THAI_RE.test(t)) {
        el.setAttribute("lang", "th"); el.setAttribute("data-al", "1");
      } else if (JA_RE.test(t)) {
        el.setAttribute("lang", "ja"); el.setAttribute("data-al", "1");
      } else if (LATIN_RE.test(t)) {
        el.setAttribute("lang", "en"); el.setAttribute("data-al", "1");
      }
    } catch (e) { /* no-op: defensive */ }
  }

  // Apply lang to elements matched by a selector list, scoped to root.
  function tagLang(root, selector) {
    if (!root || !root.querySelectorAll) return;
    var nodes;
    try {
      nodes = root.querySelectorAll(selector);
    } catch (e) {
      return;
    }
    for (var i = 0; i < nodes.length; i++) {
      setLangFor(nodes[i]);
    }
  }

  // ---- tabbar: role=tablist/tab -----------------------------------------
  function enhanceTabbar(root) {
    var tabbar = root.querySelector ? root.querySelector("#tabbar") : null;
    if (!tabbar) return;
    tabbar.setAttribute("role", "tablist");

    // Any direct-ish button/[role=button]/a children act as tabs.
    var items = tabbar.querySelectorAll("button, [role='button'], a");
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      el.setAttribute("role", "tab");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

      var selected = false;
      // Heuristics: active/selected/current CSS class, or aria-current.
      if (el.className && /(^|\s)(active|selected|current)(\s|$)/.test(el.className)) {
        selected = true;
      }
      if (el.getAttribute("aria-current") === "page" || el.getAttribute("aria-current") === "true") {
        selected = true;
      }
      // data-mode matching current S.mode, if the global state is reachable.
      try {
        if (window.S && el.getAttribute && el.getAttribute("data-mode") === window.S.mode) {
          selected = true;
        }
      } catch (e) { /* no-op */ }

      el.setAttribute("aria-selected", selected ? "true" : "false");
      if (!el.hasAttribute("aria-label")) {
        var lbl = (el.textContent || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        if (lbl) el.setAttribute("aria-label", lbl);
      }
    }

    // #view acts as the tabpanel for whichever tab is active.
    var view = root.querySelector ? root.querySelector("#view") : (document.getElementById ? document.getElementById("view") : null);
    if (view) {
      view.setAttribute("role", "tabpanel");
      if (!view.hasAttribute("tabindex")) view.setAttribute("tabindex", "-1");
    }
  }

  // ---- filter chips: role=button + aria-pressed --------------------------
  function enhanceFilterChips(root) {
    var filters = root.querySelector ? root.querySelector("#filters") : null;
    if (!filters) return;
    // Chips are commonly rendered with class starting "f-chip" per the
    // module CSS-prefix convention (filters -> "f-"). Match broadly but
    // stay scoped to #filters to avoid touching unrelated buttons.
    var chips = filters.querySelectorAll("[class*='f-chip'], .f-chip, button, [role='button']");
    for (var i = 0; i < chips.length; i++) {
      var el = chips[i];
      if (el.tagName && el.tagName.toLowerCase() === "input") continue; // leave real inputs alone
      el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

      var pressed = false;
      if (el.className && /(^|\s)(active|selected|on|checked)(\s|$)/.test(el.className)) {
        pressed = true;
      }
      if (el.getAttribute("aria-pressed") !== null) {
        // already explicitly set by chip code — respect it, just normalize.
        pressed = el.getAttribute("aria-pressed") === "true";
      }
      el.setAttribute("aria-pressed", pressed ? "true" : "false");

      if (!el.hasAttribute("aria-label")) {
        var t = (el.textContent || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
        if (t) el.setAttribute("aria-label", t);
      }
    }
  }

  // ---- icon-only buttons: aria-label -------------------------------------
  function enhanceIconButtons(root) {
    var map = [
      { sel: "#theme", label: "Toggle theme / สลับธีมสี" },
      { sel: "#q", label: "Search / ค้นหา" }
    ];
    var i, el;
    for (i = 0; i < map.length; i++) {
      el = root.querySelector ? root.querySelector(map[i].sel) : null;
      if (el && !el.hasAttribute("aria-label")) {
        el.setAttribute("aria-label", map[i].label);
      }
    }

    // Speaker / TTS buttons: identify by common conventions — class hint,
    // data-speak attribute, or literal 🔊 glyph in text.
    var speakCandidates = root.querySelectorAll(
      "[data-speak], .c-speak, .speak, button[class*='speak']"
    );
    for (i = 0; i < speakCandidates.length; i++) {
      el = speakCandidates[i];
      if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", "Listen / ฟังเสียง");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    }
    // Fallback: any button whose only content is the speaker glyph.
    var allBtns = root.querySelectorAll("button");
    for (i = 0; i < allBtns.length; i++) {
      el = allBtns[i];
      var txt = (el.textContent || "").replace(/\s+/g, "");
      if (txt === "🔊" && !el.hasAttribute("aria-label")) {
        el.setAttribute("aria-label", "Listen / ฟังเสียง");
      }
      if (txt === "✕" || txt === "×" || txt === "close" || el.className && /close/.test(el.className)) {
        if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", "Close / ปิด");
      }
    }
  }

  // ---- sheet (bottom sheet detail view) ----------------------------------
  function enhanceSheet(root) {
    var sheet = root.querySelector ? root.querySelector("#sheet") : null;
    var sheetbg = root.querySelector ? root.querySelector("#sheetbg") : null;
    if (sheet) {
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      if (!sheet.hasAttribute("tabindex")) sheet.setAttribute("tabindex", "-1");
      var closeBtn = sheet.querySelector("[data-close], .close, button[class*='close']");
      if (closeBtn && !closeBtn.hasAttribute("aria-label")) {
        closeBtn.setAttribute("aria-label", "Close / ปิด");
      }
    }
    if (sheetbg && !sheetbg.hasAttribute("aria-hidden")) {
      sheetbg.setAttribute("aria-hidden", "true");
    }
  }

  // ---- flip card (Cards mode) --------------------------------------------
  function enhanceFlipCard(root) {
    // Cards module prefixes classes with "c-"; the flip card itself is
    // expected to be something like .c-card / .c-flip. Match broadly.
    var cards = root.querySelectorAll(".c-card, .c-flip, [class*='c-card']");
    var i, el;
    for (i = 0; i < cards.length; i++) {
      el = cards[i];
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", "Flip card / พลิกการ์ด");
    }
    // Any buttons inside cards module (grading buttons Again/Hard/Good/Easy)
    var cbtns = root.querySelectorAll("[class*='c-'] button, .c-actions button");
    for (i = 0; i < cbtns.length; i++) {
      el = cbtns[i];
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    }
  }

  // ---- reduced motion ------------------------------------------------------
  function respectReducedMotion(root) {
    try {
      var mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
      var reduce = !!(mq && mq.matches);
      var host = (root && root.classList) ? root : (document.documentElement || null);
      if (host && host.classList) {
        if (reduce) {
          host.classList.add("a-reduced-motion");
        } else {
          host.classList.remove("a-reduced-motion");
        }
      }
    } catch (e) { /* matchMedia unsupported: no-op */ }
  }

  // ---- lang tagging pass ---------------------------------------------------
  function enhanceLang(root) {
    // Thai-labeled fields by data-field convention, if present.
    tagLang(root, "[data-lang='th'], .mt, .et, [class*='-mt'], [class*='-et']");
    tagLang(root, "[data-lang='en'], .w, .ee, [class*='-w'], [class*='-ee']");
    // Generic fallback: sweep leaf text nodes' immediate span/div parents
    // inside #view and #sheet that don't yet have a lang attribute.
    var scopes = [];
    var v = root.querySelector ? root.querySelector("#view") : null;
    var sh = root.querySelector ? root.querySelector("#sheet") : null;
    if (v) scopes.push(v);
    if (sh) scopes.push(sh);
    for (var s = 0; s < scopes.length; s++) {
      var leaves = scopes[s].querySelectorAll("span, div, p, li, dd, dt");
      for (var i = 0; i < leaves.length; i++) {
        var el = leaves[i];
        if (el.hasAttribute("lang")) continue;
        // Only tag "leaf-ish" nodes (no element children) to avoid setting
        // lang on containers that mix both languages.
        if (el.children && el.children.length > 0) continue;
        setLangFor(el);
      }
    }
  }

  // ---- main entry ------------------------------------------------------
  function enhance(rootEl) {
    var root = rootEl || document;
    if (!root || !root.querySelectorAll) return;
    try { enhanceTabbar(root); } catch (e) { /* no-op */ }
    try { enhanceFilterChips(root); } catch (e) { /* no-op */ }
    try { enhanceIconButtons(root); } catch (e) { /* no-op */ }
    try { enhanceSheet(root); } catch (e) { /* no-op */ }
    try { enhanceFlipCard(root); } catch (e) { /* no-op */ }
    try { respectReducedMotion(root); } catch (e) { /* no-op */ }
    try { enhanceLang(root); } catch (e) { /* no-op */ }
  }

  window.PT.a11y = { enhance: enhance };
})();
