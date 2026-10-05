/* PT.srs — Anki-like SM-2 scheduler (pure logic + store only, no DOM). ES5. */
(function () {
  "use strict";
  window.PT = window.PT || {};

  var MIN = 60000;            // ms per minute
  var DAY = 86400000;         // ms per day
  var EF_FLOOR = 1.3;         // minimum ease factor
  var EF_DEFAULT = 2.5;       // starting ease factor
  var ROLL = 4 * 3600000;     // 4am day-rollover offset

  // Defaults; overridden by window.S.settings when present.
  var D_LEARN = [1, 10];      // learning steps (minutes)
  var D_RELEARN = [10];       // relearn steps (minutes)
  var D_GRAD = 1;             // graduating interval (days)
  var D_EASY = 4;             // easy interval (days)

  // Pull live config from shared state when available (contract: S.settings).
  function cfg() {
    var st = (window.S && S.settings) ? S.settings : null;
    return {
      learn: (st && st.learnSteps && st.learnSteps.length) ? st.learnSteps : D_LEARN,
      relearn: D_RELEARN,
      grad: (st && st.graduate) ? st.graduate : D_GRAD,
      easy: (st && st.easyIv) ? st.easyIv : D_EASY
    };
  }

  function clone(r) {
    return { s: r.s, ef: r.ef, iv: r.iv, due: r.due,
             reps: r.reps, lap: r.lap, step: r.step, last: r.last };
  }

  // A fresh, never-seen card.
  function newRecord() {
    return { s: 0, ef: EF_DEFAULT, iv: 0, due: 0,
             reps: 0, lap: 0, step: 0, last: 0 };
  }

  // Grade a review. rating: 0=Again 1=Hard 2=Good 3=Easy.
  // Returns { rec:newRec, requeue:bool }. requeue=true => card comes back in
  // minutes this session (learning/relearn); false => scheduled in days.
  function grade(rec, rating, now) {
    now = now || Date.now();
    if (!rec) { rec = newRecord(); }   // defensive: grading a not-yet-stored (new) card
    var r = clone(rec);
    r.last = now;
    var c = cfg();
    var requeue = false;

    if (r.s === 2) {
      // ---- Review card ----
      if (rating === 0) {                 // Again -> lapse into relearn
        r.lap++;
        r.ef = Math.max(EF_FLOOR, r.ef - 0.20);
        r.s = 3; r.step = 0;
        r.due = now + c.relearn[0] * MIN;
        requeue = true;
      } else if (rating === 1) {          // Hard
        r.iv = Math.max(1, Math.round(r.iv * 1.2));
        r.ef = Math.max(EF_FLOOR, r.ef - 0.15);
        r.due = now + r.iv * DAY; r.reps++;
      } else if (rating === 2) {          // Good
        r.iv = Math.max(1, Math.round(r.iv * r.ef));
        r.due = now + r.iv * DAY; r.reps++;
      } else {                            // Easy
        r.iv = Math.max(1, Math.round(r.iv * r.ef * 1.3));
        r.ef = r.ef + 0.15;
        r.due = now + r.iv * DAY; r.reps++;
      }
    } else {
      // ---- New / Learning / Relearn card ----
      var steps = (r.s === 3) ? c.relearn : c.learn;
      if (r.s === 0) { r.s = 1; }         // new -> learning

      if (rating === 0) {                 // Again -> restart steps
        r.step = 0;
        r.due = now + steps[0] * MIN;
        requeue = true;
      } else if (rating === 1) {          // Hard -> repeat current step
        var st = (r.step < steps.length) ? r.step : (steps.length - 1);
        r.due = now + steps[st] * MIN;
        requeue = true;
      } else if (rating === 2) {          // Good -> advance / graduate
        if (r.step + 1 < steps.length) {
          r.step++;
          r.due = now + steps[r.step] * MIN;
          requeue = true;
        } else {
          r.s = 2; r.step = 0; r.reps++;  // graduate to review
          r.iv = c.grad;
          r.due = now + r.iv * DAY;
          requeue = false;
        }
      } else {                            // Easy -> graduate immediately
        r.s = 2; r.step = 0; r.reps++;
        r.iv = c.easy;
        r.due = now + r.iv * DAY;
        requeue = false;
      }
    }
    return { rec: r, requeue: requeue };
  }

  // Coarse status for filtering/badges.
  function statusOf(rec, now) {
    now = now || Date.now();
    if (!rec || rec.s === 0) { return "new"; }
    if (rec.s === 1 || rec.s === 3) { return "learning"; }
    // review (s===2)
    return (rec.due <= now) ? "due" : "known";
  }

  // Short human label of the interval a rating would produce ('10m'/'1d'/'4d').
  function intervalPreview(rec, rating, now) {
    now = now || Date.now();
    var g = grade(rec, rating, now);
    var d = g.rec.due - now;
    if (g.requeue || d < DAY) {
      var m = Math.round(d / MIN);
      if (m < 1) { m = 1; }
      if (m >= 60 && (m % 60) === 0) { return (m / 60) + "h"; }
      return m + "m";
    }
    var days = Math.round(d / DAY);
    if (days < 1) { days = 1; }
    if (days >= 30) { return Math.round(days / 30) + "mo"; }
    return days + "d";
  }

  // Migrate old PT2 map (keyOf -> {b,d}) to new SM-2 records.
  // b>=3 => review card with iv from table & due=d; else learning at step 0.
  function migrate(oldPt2Map) {
    var IVT = [0, 1, 2, 4, 8, 16];
    var out = {};
    if (!oldPt2Map) { return out; }
    for (var k in oldPt2Map) {
      if (!Object.prototype.hasOwnProperty.call(oldPt2Map, k)) { continue; }
      var o = oldPt2Map[k] || {};
      var b = (typeof o.b === "number") ? o.b : 0;
      var d = (typeof o.d === "number") ? o.d : 0;
      var r = newRecord();
      if (b >= 3) {
        var idx = (b > 5) ? 5 : b;
        r.s = 2; r.iv = IVT[idx]; r.ef = EF_DEFAULT;
        r.due = d; r.reps = b;
      } else {
        r.s = 1; r.step = 0; r.ef = EF_DEFAULT;
        r.due = d || 0;
      }
      out[k] = r;
    }
    return out;
  }

  /* ---- Persistence (uses frozen store wrapper; JSON-encode values) ---- */

  function readJSON(k) {
    var v = store.get(k);
    if (v === null || v === undefined || v === "") { return null; }
    if (typeof v === "object") { return v; }      // wrapper may pre-parse
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  function writeJSON(k, obj) {
    store.set(k, JSON.stringify(obj));
  }

  // Load record map for a deck; migrate legacy pt2_ store once if needed.
  function load(deck) {
    var cur = readJSON("srs3_" + deck);
    if (cur) { return cur; }
    var old = readJSON("pt2_" + deck);
    if (old) {
      var migrated = migrate(old);
      writeJSON("srs3_" + deck, migrated);   // persist migration once
      return migrated;
    }
    return {};
  }
  function save(deck, recMap) {
    writeJSON("srs3_" + deck, recMap || {});
  }

  /* ---- Daily counters with 4am rollover ---- */

  function dayNum(now) {
    now = now || Date.now();
    return Math.floor((now - ROLL) / DAY);
  }

  // Get today's log { day, n, r } for a deck, resetting on rollover.
  function dayLog(deck) {
    var today = dayNum();
    var log = readJSON("day_" + deck);
    if (!log || log.day !== today) {
      log = { day: today, n: 0, r: 0 };
      writeJSON("day_" + deck, log);
    }
    return log;
  }
  function bumpNew(deck) {
    var log = dayLog(deck);
    log.n++;
    writeJSON("day_" + deck, log);
    bumpAct();
    return log;
  }
  function bumpRev(deck) {
    var log = dayLog(deck);
    log.r++;
    writeJSON("day_" + deck, log);
    bumpAct();
    return log;
  }

  /* ---- Global study streak (any grade counts, across all decks) ----
     Streak insurance: earn 1 "freeze" per 7 study-days (max held = 2). When the
     learner comes back after missing exactly ONE day, a freeze auto-fills that
     day so a long streak survives a single sick/busy day. Freezes are stored
     separately (pt_frozen days + pt_freeze token count) so real study data stays
     pure. */
  function actLog() { return readJSON("pt_act") || {}; }
  function frozenLog() { return readJSON("pt_frozen") || {}; }
  function readFreeze() { return readJSON("pt_freeze") || { tok: 0, granted: 0 }; }
  function on(a, fr, d) { return a["" + d] || fr["" + d]; }

  function grantFreeze(a) {
    var active = 0, k;
    for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) active++; }
    var f = readFreeze(), should = Math.floor(active / 7);
    if (should > (f.granted || 0)) {
      f.tok = Math.min(2, (f.tok || 0) + (should - f.granted));
      f.granted = should;
      writeJSON("pt_freeze", f);
    }
  }
  function repairGap() {
    var today = dayNum(), a = actLog(), fr = frozenLog();
    var d1 = "" + (today - 1), d2 = "" + (today - 2);
    // a single missed day just before today, with an active/frozen day before it
    if (!a[d1] && !fr[d1] && (a[d2] || fr[d2])) {
      var f = readFreeze();
      if ((f.tok || 0) > 0) { fr[d1] = 1; writeJSON("pt_frozen", fr); f.tok -= 1; writeJSON("pt_freeze", f); }
    }
  }
  function bumpAct() {
    var a = actLog(), d = "" + dayNum();
    a[d] = (a[d] || 0) + 1;
    writeJSON("pt_act", a);
    try { grantFreeze(a); repairGap(); } catch (e) {}
    return a;
  }
  // { current, longest, today, freezes } — current = consecutive days ending today (grace: yesterday still counts; frozen days bridge gaps).
  function streak() {
    var a = actLog(), fr = frozenLog(), today = dayNum();
    var cur = 0, d = today;
    if (!on(a, fr, d)) { d = today - 1; }     // nothing yet today -> streak still alive from yesterday
    while (on(a, fr, d)) { cur++; d--; }
    var days = [], seen = {}, k;
    for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k) && !seen[k]) { seen[k] = 1; days.push(parseInt(k, 10)); } }
    for (k in fr) { if (Object.prototype.hasOwnProperty.call(fr, k) && !seen[k]) { seen[k] = 1; days.push(parseInt(k, 10)); } }
    days.sort(function (x, y) { return x - y; });
    var lg = 0, run = 0, prev = null, i;
    for (i = 0; i < days.length; i++) {
      run = (prev !== null && days[i] === prev + 1) ? run + 1 : 1;
      if (run > lg) { lg = run; }
      prev = days[i];
    }
    return { current: cur, longest: lg, today: a["" + today] || 0, freezes: (readFreeze().tok || 0) };
  }

  PT.srs = {
    newRecord: newRecord,
    grade: grade,
    statusOf: statusOf,
    intervalPreview: intervalPreview,
    migrate: migrate,
    load: load,
    save: save,
    dayLog: dayLog,
    bumpNew: bumpNew,
    bumpRev: bumpRev,
    streak: streak,
    // exposed for the stats dashboard (heatmap uses the same day-bucketing as the streak)
    dayNum: dayNum,
    activityLog: actLog,
    DAY: DAY,
    ROLL: ROLL
  };
})();
