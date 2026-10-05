/* PT.filters — filter engine (no DOM).
   Owns predicate/apply/counts. ES5-safe. */
(function () {
  "use strict";
  window.PT = window.PT || {};

  // Helper: is object non-empty (used as a "set" with value->true)
  function nonEmpty(o) {
    if (!o) return false;
    for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) return true; }
    return false;
  }

  // Membership test tolerant of missing hasK host helper.
  function has(obj, k) {
    if (typeof hasK === "function") return hasK(obj, k);
    return !!(obj && Object.prototype.hasOwnProperty.call(obj, k));
  }

  // Ensure item has a cached POS bucket mask on _pb.
  function posMask(item) {
    if (item._pb == null) {
      item._pb = (PT.pos && PT.pos.mask) ? PT.pos.mask(item.p || "") : 0;
    }
    return item._pb;
  }

  // Build a bitmask of selected POS buckets from the F.pos set,
  // using PT.pos.LABELS order (bit index = label index).
  function posSelMask(fpos) {
    var labels = (PT.pos && PT.pos.LABELS) || ["noun", "verb", "adjective", "adverb", "other"];
    var m = 0, i;
    for (i = 0; i < labels.length; i++) {
      if (has(fpos, labels[i])) m |= (1 << i);
    }
    return m;
  }

  var PTfilters = {};

  // predicate(item, F, now) -> bool. AND across dims.
  PTfilters.predicate = function (item, F, now) {
    // group dim
    if (nonEmpty(F.groups) && !has(F.groups, item.g)) return false;
    // pos dim: item mask must share at least one selected bucket bit
    if (nonEmpty(F.pos)) {
      var sel = posSelMask(F.pos);
      if (sel !== 0 && (posMask(item) & sel) === 0) return false;
    }
    // status dim: compute status from SRS record
    if (nonEmpty(F.status)) {
      var rec = S.rec[keyOf(item)];
      var st = (PT.srs && PT.srs.statusOf) ? PT.srs.statusOf(rec, now) : "new";
      if (!has(F.status, st)) return false;
    }
    // favorites dim (boolean)
    if (F.fav && !(PT.fav && PT.fav.isFav(item))) return false;
    // mistake-notebook dim (boolean): only items currently in สมุดคำผิด
    if (F.miss && !(PT.miss && PT.miss.has(S.deck, keyOf(item)))) return false;
    // search dim
    if (F.q) {
      var qs = String(F.q).replace(/^\s+|\s+$/g, "");
      // number search: "#17" or "#17-32" filters by the item's running number (matches the daily plan)
      if (qs.charAt(0) === "#") {
        var nm = qs.slice(1).match(/^(\d+)\s*[-–]?\s*(\d+)?$/);
        if (nm) {
          var lo = parseInt(nm[1], 10), hi = nm[2] ? parseInt(nm[2], 10) : parseInt(nm[1], 10);
          return item._no >= lo && item._no <= hi;
        }
      }
      var qL = qs.toLowerCase();
      if (!(PT.search && PT.search.match) || !PT.search.match(item, qL)) return false;
    }
    return true;
  };

  // apply(S) -> filtered+sorted array. Cached via S.working/S.workingDirty.
  PTfilters.apply = function (S) {
    if (!S.workingDirty && S.working) return S.working;
    var now = Date.now();
    var F = S.filter;
    var out = [];
    var data = S.data || [];
    var i;
    for (i = 0; i < data.length; i++) {
      if (PTfilters.predicate(data[i], F, now)) out.push(data[i]);
    }
    // sort
    var cmp = PT.sort && PT.sort.cmp && PT.sort.cmp[F.sort];
    if (cmp) out.sort(cmp);
    S.working = out;
    S.workingDirty = false;
    return out;
  };

  // counts(S) -> chip counts computed over ALL of S.data (unfiltered).
  PTfilters.counts = function (S) {
    var now = Date.now();
    var data = S.data || [];
    var res = {
      status: { "new": 0, learning: 0, due: 0, known: 0 },
      groups: {},
      pos: {}
    };
    var labels = (PT.pos && PT.pos.LABELS) || ["noun", "verb", "adjective", "adverb", "other"];
    var j;
    for (j = 0; j < labels.length; j++) res.pos[labels[j]] = 0;

    var i, item, st, g, m, b;
    for (i = 0; i < data.length; i++) {
      item = data[i];
      // status
      st = (PT.srs && PT.srs.statusOf)
        ? PT.srs.statusOf(S.rec[keyOf(item)], now) : "new";
      if (res.status[st] == null) res.status[st] = 0;
      res.status[st]++;
      // group
      g = item.g;
      res.groups[g] = (res.groups[g] || 0) + 1;
      // pos buckets (an item may count in multiple buckets)
      m = posMask(item);
      for (b = 0; b < labels.length; b++) {
        if (m & (1 << b)) res.pos[labels[b]]++;
      }
    }
    return res;
  };

  PT.filters = PTfilters;
})();
