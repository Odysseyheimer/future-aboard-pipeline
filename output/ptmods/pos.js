/* PT.pos / PT.search / PT.sort  — pure helpers, no DOM. ES5 only. */
(function () {
  "use strict";
  window.PT = window.PT || {};

  /* ---------------------------------------------------------------- POS */
  var pos = {};
  /* bit order MUST match LABELS order */
  pos.LABELS = ["noun", "verb", "adjective", "adverb", "other"];

  /* token -> bucket name. The p string is split on , / + . and spaces,
     so multi-word tags reduce to constituent tokens (e.g. "modal v" ->
     "modal","v"; "past participle" -> "past","participle"). We map the
     meaningful constituents. */
  var TOK = {
    n: "noun", noun: "noun",
    v: "verb", verb: "verb", modal: "verb", auxiliary: "verb", aux: "verb",
    adj: "adjective", adjective: "adjective", participle: "adjective",
    adv: "adverb", adverb: "adverb",
    prep: "other", preposition: "other",
    pron: "other", pronoun: "other",
    conj: "other", conjunction: "other",
    det: "other", determiner: "other",
    exclam: "other", exclamation: "other", interjection: "other",
    number: "other", numeral: "other",
    article: "other", indefinite: "other", definite: "other", phrase: "other"
  };

  /* bit value for a bucket name */
  function bitOf(bucket) {
    for (var i = 0; i < pos.LABELS.length; i++) {
      if (pos.LABELS[i] === bucket) return (1 << i);
    }
    return 0;
  }

  /* split messy p string into normalized tokens */
  function tokens(pStr) {
    if (!pStr) return [];
    var raw = String(pStr).toLowerCase().split(/[,\/+·\s]+/);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i];
      if (!t) continue;
      /* strip trailing dots */
      while (t.length && t.charAt(t.length - 1) === ".") {
        t = t.substring(0, t.length - 1);
      }
      if (t) out.push(t);
    }
    return out;
  }

  /* int bitmask over LABELS order */
  pos.mask = function (pStr) {
    var tks = tokens(pStr), m = 0;
    for (var i = 0; i < tks.length; i++) {
      var b = TOK[tks[i]];
      if (b) m |= bitOf(b);
    }
    return m;
  };

  /* array of bucket-name strings, in LABELS order, unique */
  pos.buckets = function (pStr) {
    var m = pos.mask(pStr), out = [];
    for (var i = 0; i < pos.LABELS.length; i++) {
      if (m & (1 << i)) out.push(pos.LABELS[i]);
    }
    return out;
  };

  /* set item._pb = mask once (cached) */
  pos.precompute = function (item) {
    if (item && typeof item._pb !== "number") {
      item._pb = pos.mask(item.p);
    }
    return item ? item._pb : 0;
  };

  PT.pos = pos;

  /* ------------------------------------------------------------- SEARCH */
  var search = {};
  var SFIELDS = ["w", "mt", "me", "ee", "et", "x", "p", "_ja", "_jk"];   /* _ja/_jk: transient Japanese (PT.ja.attach) */

  /* true if qLower is a substring of any searchable field (lowercased) */
  search.match = function (item, qLower) {
    if (!qLower) return true;      /* empty query matches everything */
    if (!item) return false;
    if (qLower.indexOf("jp:") === 0) {  /* romaji search: jp:hashiru */
      var rq = qLower.slice(3).replace(/[^a-z]/g, "");
      return !!(rq && item._jr && item._jr.indexOf(rq) !== -1);
    }
    for (var i = 0; i < SFIELDS.length; i++) {
      var v = item[SFIELDS[i]];
      if (v && String(v).toLowerCase().indexOf(qLower) !== -1) return true;
    }
    return false;
  };

  PT.search = search;

  /* --------------------------------------------------------------- SORT */
  var sort = {};

  /* per-session seed for the "random" (stable shuffle) order */
  sort._seed = (Math.random() * 0x7fffffff) >>> 0;
  sort.reseed = function () {
    sort._seed = (Math.random() * 0x7fffffff) >>> 0;
    return sort._seed;
  };

  /* deterministic hash of a string given the current seed */
  function seedHash(str) {
    var h = (sort._seed ^ 0x9e3779b9) >>> 0, s = str || "";
    for (var i = 0; i < s.length; i++) {
      h = (h ^ s.charCodeAt(i)) >>> 0;
      h = (h * 16777619) >>> 0;    /* FNV-ish mix */
    }
    return h >>> 0;
  }

  function safeKey(item) {
    return (typeof keyOf === "function") ? keyOf(item)
      : ((item && item.w) + "|" + (item && item.g));
  }

  /* record for an item from the shared global S (if present) */
  function recOf(item) {
    var S = window.S;
    if (!S || !S.rec) return null;
    return S.rec[safeKey(item)] || null;
  }

  sort.cmp = {
    /* alphabetical by word */
    az: function (a, b) {
      var wa = (a && a.w) || "", wb = (b && b.w) || "";
      return wa.localeCompare(wb);
    },

    /* stable per-session shuffle: compare seeded hashes, tie-break by key */
    random: function (a, b) {
      var ha = seedHash(safeKey(a)), hb = seedHash(safeKey(b));
      if (ha < hb) return -1;
      if (ha > hb) return 1;
      return safeKey(a).localeCompare(safeKey(b));
    },

    /* due date ascending; new / no-due items last */
    due: function (a, b) {
      var ra = recOf(a), rb = recOf(b);
      var da = (ra && typeof ra.due === "number") ? ra.due : Infinity;
      var db = (rb && typeof rb.due === "number") ? rb.due : Infinity;
      if (da < db) return -1;
      if (da > db) return 1;
      /* stable tie-break */
      var wa = (a && a.w) || "", wb = (b && b.w) || "";
      return wa.localeCompare(wb);
    }
  };

  PT.sort = sort;
})();
