/* ja.js — the Japanese layer (PT.ja). ES5.
   Japanese lives in separate sidecar files output/data/ja/<file>.<sha8>.json, listed in
   JA_INDEX (inlined by assemble_app.py). Nothing here touches keyOf/SRS/favourites.
   Lookups are by CONTENT: key = fnv1a32([salt\n] + scope + "\n" + norm(en)) base36 —
   must stay identical to scripts/pedagogy/ja/ja_common.py (ja_parity.js checks it).
   A sidecar value is J = [furi, romaji]; furi uses {漢字|かんじ} ruby markup. */
PT.ja = (function () {
  "use strict";
  var IDX = (typeof JA_INDEX !== "undefined" && JA_INDEX) ? JA_INDEX : { v: 1, files: {} };
  var F = {};           // file -> {st:"ok"|"pend"|"fail", t:ms, cbs:[], d:data}

  /* ---------- contract: norm + fnv (parity with Python) ---------- */
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[ \t\r\n ]+/g, " ").replace(/^ +| +$/g, "");
  }
  function fnv(s) {
    var h = 0x811c9dc5, i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return (h >>> 0).toString(36);
  }
  function mkKey(scope, en, salt) { return fnv((salt ? salt + "\n" : "") + scope + "\n" + norm(en)); }
  function kOf(it) { return it.w + "|" + it.g; }                 // == keyOf(it)
  function glossSrc(it) { return "#" + (it.w || "") + "|" + (it.p || "") + "|" + (it.me || it.mt || ""); }

  /* ---------- settings ---------- */
  function st() { return (window.S && S.settings) || {}; }
  function on() { return !!st().showJa; }
  function save() { try { store.set("pt_settings", JSON.stringify(S.settings)); } catch (e) {} }

  /* ---------- loading ---------- */
  function has(file) { return !!(IDX.files && IDX.files[file]); }
  function ensure(file, cb) {
    if (!has(file)) { if (cb) cb(false); return false; }
    var f = F[file];
    if (f && f.st === "ok") { if (cb) cb(true); return true; }
    if (f && f.st === "pend") { if (cb) f.cbs.push(cb); return false; }
    if (f && f.st === "fail" && Date.now() - f.t < 30000 && !cb) return false;
    f = F[file] = { st: "pend", t: Date.now(), cbs: cb ? [cb] : [], d: null };
    fetch("data/ja/" + IDX.files[file]).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (d) {
      if (!d || !d.t || (d.v || 1) > 1) throw new Error("bad sidecar");
      f.d = d; f.st = "ok";
      keep();
      var c = f.cbs; f.cbs = [];
      for (var i = 0; i < c.length; i++) { try { c[i](true); } catch (e) {} }
    }).catch(function () {
      f.st = "fail"; f.t = Date.now();
      var c = f.cbs; f.cbs = [];
      for (var i = 0; i < c.length; i++) { try { c[i](false); } catch (e) {} }
    });
    return false;
  }
  function keep() {   // let the SW drop sidecars no longer in the index
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        var names = []; for (var k in IDX.files) if (IDX.files.hasOwnProperty(k)) names.push(IDX.files[k]);
        navigator.serviceWorker.controller.postMessage({ type: "JA_KEEP", files: names });
      }
    } catch (e) {}
  }
  function get(file, scope, en) {
    var f = F[file];
    if (!f || f.st !== "ok" || en == null || en === "") return null;
    return f.d.t[mkKey(scope, en, f.d.salt || 0)] || null;
  }
  function xName(deck, it) {
    if (deck === "oxford" && it && it.g && has("oxford.x." + it.g)) return "oxford.x." + it.g;
    return deck + ".x";
  }

  /* ---------- lookups ---------- */
  function gloss(deck, it) { return get(deck, kOf(it), glossSrc(it)); }
  function ex(deck, it, en) { return get(deck, kOf(it), en); }
  function xs(deck, it, en) { return get(xName(deck, it), kOf(it), en); }
  function conv(id, en) { return get("conversations", id, en); }
  function story(id, en) { return get("stories", id, en); }
  /* the item's own Japanese: a sentence's translation, or a headword's gloss */
  function head(deck, it) { var D = window.DECKS || {}; return (D[deck] && D[deck].type === "sentence") ? ex(deck, it, it.w) : gloss(deck, it); }

  /* ---------- rendering ---------- */
  var FR = /\{([^{}|]+)\|([^{}|]+)\}/g;
  function h(s) { return esc(s); }
  function ruby(f) {
    var out = "", last = 0, m;
    f = String(f || ""); FR.lastIndex = 0;
    while ((m = FR.exec(f))) {
      out += h(f.slice(last, m.index)) +
        "<ruby>" + h(m[1]) + "<rp>(</rp><rt>" + h(m[2]) + "</rt><rp>)</rp></ruby>";
      last = FR.lastIndex;
    }
    return out + h(f.slice(last));
  }
  function plain(f) { return String(f || "").replace(FR, "$1"); }
  function kana(f) { return String(f || "").replace(FR, "$2"); }
  function sayText(J, isGloss) {
    var t = isGloss ? kana(J[0]) : plain(J[0]);
    if (isGloss) t = t.replace(/（[^）]*）|\([^)]*\)/g, "").replace(/〜|～/g, "");
    return t;
  }
  function line(J, o) {
    if (!J) return "";
    var furi = st().showFuri !== false && !(o && o.nofuri);
    return '<span class="jx' + (furi ? "" : " nf") + '" lang="ja">' + (furi ? ruby(J[0]) : h(plain(J[0]))) + "</span>";
  }
  function block(J, o) {
    if (!J) return "";
    o = o || {};
    var s = '<span class="jx-line">' + line(J, o);
    if (o.say !== false) s += ' <button type="button" class="jx-say" data-say-ja="' + h(sayText(J, o.kind === "w")) + '" aria-label="ฟังภาษาญี่ปุ่น">🔊JP</button>';
    s += "</span>";
    if (o.rom !== false && st().showRomaji !== false && J[1]) s += '<div class="jx-ro" lang="ja-Latn">' + h(J[1]) + "</div>";
    return s;
  }
  /* The one layout rule the user asked for: ไทย -> English -> 日本語, always in that order.
     th = raw Thai text (escaped here); enHtml = ready HTML; J may be null (row omitted). */
  function stack(th, enHtml, J, o) {
    o = o || {};
    var s = '<div class="jx-stack' + (o.cls ? " " + o.cls : "") + '">';
    if (th) s += '<div class="jx-r jx-r-th" lang="th"><span class="jx-lab">TH</span><span class="jx-tx">' + h(th) + "</span></div>";
    if (enHtml) s += '<div class="jx-r jx-r-en" lang="en"><span class="jx-lab">EN</span><span class="jx-tx">' + enHtml + "</span></div>";
    if (J) s += '<div class="jx-r jx-r-ja"><span class="jx-lab">JP</span><span class="jx-tx">' + block(J, o) + "</span></div>";
    return s + "</div>";
  }

  /* ---------- search: transient fields on in-memory rows only ---------- */
  function attach(deck) {
    if (!window.S || !S.data || !F[deck] || F[deck].st !== "ok") return;
    for (var i = 0; i < S.data.length; i++) {
      var it = S.data[i], J = head(deck, it);
      if (!J) continue;
      it._ja = plain(J[0]); it._jk = kana(J[0]); it._jr = String(J[1] || "").toLowerCase().replace(/[^a-z]/g, "");
    }
  }

  /* ---------- toggle ---------- */
  function syncDot() {
    var b = document.getElementById("jatog"); if (!b) return;
    b.setAttribute("aria-pressed", on() ? "true" : "false");
    b.className = "dot" + (on() ? "" : " ja-off");
  }
  function toggle(v) {
    S.settings.showJa = !!v; save(); syncDot();
    if (v) {
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      if (!store.get("pt_ja_hint")) { store.set("pt_ja_hint", "1"); try { toast("กดปุ่ม あ เพื่อเปิด/ปิดภาษาญี่ปุ่น"); } catch (e) {} }
      if (S.deck) ensure(S.deck, function (ok) { if (ok) { attach(S.deck); if (typeof render === "function") render(); } });
    }
    if (typeof render === "function") render();
  }
  function toast(msg) {
    var t = document.createElement("div"); t.className = "jx-toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
  }

  /* ---------- flag a wrong line (exported via backup, imported by ja_human.py) ---------- */
  function flag(file, k) {
    var a; try { a = JSON.parse(store.get("pt_jaflag") || "[]"); } catch (e) { a = []; }
    a.push({ f: file, k: k, ts: Date.now() }); store.set("pt_jaflag", JSON.stringify(a));
  }

  /* ---------- download everything for offline ---------- */
  function downloadAll(progress) {
    var names = []; for (var k in IDX.files) if (IDX.files.hasOwnProperty(k)) names.push(k);
    var i = 0;
    (function next() {
      if (i >= names.length) { if (progress) progress(i, names.length, true); return; }
      if (progress) progress(i, names.length, false);
      ensure(names[i++], function () { next(); });
    })();
  }
  function coverage(deck) { return (IDX.cov && IDX.cov[deck]) || null; }
  function voiceStatus() {
    try {
      var vs = speechSynthesis.getVoices() || [];
      for (var i = 0; i < vs.length; i++) if (/^ja/i.test(vs[i].lang)) return vs[i].name;
    } catch (e) {}
    return "";
  }

  return {
    on: on, has: has, ensure: ensure, get: get, xName: xName,
    gloss: gloss, ex: ex, xs: xs, conv: conv, story: story, head: head,
    ruby: ruby, plain: plain, kana: kana, line: line, block: block, stack: stack,
    attach: attach, toggle: toggle, syncDot: syncDot, flag: flag,
    downloadAll: downloadAll, coverage: coverage, voiceStatus: voiceStatus,
    files: function () { return IDX.files || {}; },
    _norm: norm, _fnv: fnv, _key: mkKey, _glossSrc: glossSrc
  };
})();
