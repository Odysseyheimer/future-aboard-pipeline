/* PT.cards — Flashcards tab (SM-2 study).
   Owns the Cards mode: builds a study queue, renders a 3D flip card,
   four rating buttons, undo, and keyboard control. ES5 only. */
(function () {
  "use strict";
  window.PT = window.PT || {};
  var PT = window.PT;
  PT.cards = PT.cards || {};

  /* ---------- small local helpers ---------- */

  function now() { return Date.now(); }

  // The SRS record key for an item. Normally the same as keyOf(item) — but
  // when S.settings.dirSplit is on, EN->TH and TH->EN recall are scheduled as
  // two independent skills (real Anki-style reverse cards), so the TH-facing
  // direction gets its own suffixed key. Only the SM-2 record is split this
  // way; favorites/mistake-notebook/word-map stay keyed by the base word
  // identity (keyOf), since "I got this word wrong" or "I starred this word"
  // isn't direction-specific.
  function srsKey(S, item) {
    var k = keyOf(item);
    if (S.settings && S.settings.dirSplit && S.dir === "th") return k + "__th";
    return k;
  }

  // Ensure a record exists for an item; returns it (does NOT mutate maps
  // unless it has to create one — creation is harmless/idempotent).
  function recFor(S, item) {
    var k = srsKey(S, item);
    var r = S.rec[k];
    if (!r) { r = PT.srs.newRecord(); }  // transient — do NOT store; only grading persists
    return r;
  }

  // Persist rec map through srs, if srs exposes a save hook.
  function srsSave(S) {
    if (PT.srs && typeof PT.srs.save === "function") {
      try { PT.srs.save(S.deck, S.rec); } catch (e) {}
    }
  }

  // Day counters (new/rev caps). Prefer PT.srs.dayLog; fall back to a
  // local store-backed counter keyed by today's date so caps still work.
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function localDay() {
    var raw = store.get("pt.cards.day");
    var obj = null;
    try { obj = raw ? JSON.parse(raw) : null; } catch (e) { obj = null; }
    if (!obj || obj.d !== todayKey()) obj = { d: todayKey(), n: 0, r: 0 };
    return obj;
  }
  function dayCounts(deck) {
    if (PT.srs && typeof PT.srs.dayLog === "function") {
      try {
        var d = PT.srs.dayLog(deck);
        if (d) return { n: d.n || d.newDone || 0, r: d.r || d.revDone || 0 };
      } catch (e) {}
    }
    var o = localDay();
    return { n: o.n, r: o.r };
  }
  function bumpDay(kind, deck) {
    if (PT.srs) {
      if (kind === "new" && typeof PT.srs.bumpNew === "function") { try { PT.srs.bumpNew(deck); return; } catch (e) {} }
      if (kind !== "new" && typeof PT.srs.bumpRev === "function") { try { PT.srs.bumpRev(deck); return; } catch (e) {} }
    }
    var o = localDay();
    if (kind === "new") o.n += 1; else o.r += 1;
    store.set("pt.cards.day", JSON.stringify(o));
  }

  /* ---------- unlimited ("เล่นได้เรื่อยๆ ไม่มีจำกัด") mode ----------
     Off by default (respects the daily new/review caps, like real Anki).
     On: ignores newPerDay/revPerDay entirely, AND once due+learning+new run
     dry it recycles not-yet-due "known" cards for extra practice — so the
     session never has to end. Grading a recycled card still updates its real
     SM-2 schedule (reviewing early just pushes the interval further out),
     exactly like Anki's "Custom Study -> review ahead". Persisted so the
     learner's chosen mode sticks across visits. */
  var UNL_KEY = "pt_cards_unl";
  function isUnlimited() { return store.get(UNL_KEY) === "1"; }
  function setUnlimited(on) { store.set(UNL_KEY, on ? "1" : "0"); }

  /* ---------- listening-only mode ----------
     Hides the front text; shows a big 🔊 button (auto-plays once per new
     card) so the learner recalls the word from audio alone before flipping —
     direct IELTS-listening practice reusing the TTS plumbing already used
     elsewhere on the card. */
  var LISTEN_KEY = "pt_cards_listen";
  function isListening() { return store.get(LISTEN_KEY) === "1"; }
  function setListening(on) { store.set(LISTEN_KEY, on ? "1" : "0"); }

  /* ---------- retention log (review-stage grades only) ----------
     A capped rolling log of ratings, one array per deck, appended only when
     the card being graded was ALREADY a review-stage card (prevRec.s===2) —
     i.e. "did I actually remember this on its scheduled day", the same
     definition Anki's retention % uses. Feeds the stats dashboard. */
  function glogKey(deck) { return "pt_glog_" + deck; }
  function logGrade(deck, wasReview, rating) {
    if (!wasReview) return;
    var key = glogKey(deck), arr = [];
    try { arr = JSON.parse(store.get(key) || "[]"); } catch (e) { arr = []; }
    if (!(arr instanceof Array)) arr = [];
    arr.push(rating);
    if (arr.length > 300) arr = arr.slice(arr.length - 300);
    store.set(key, JSON.stringify(arr));
  }

  /* ---------- queue construction ---------- */

  // buildQueue(list,S,now): due reviews (capped by revPerDay) sorted by due,
  // then learning-due cards, then new cards (capped by newPerDay). In
  // unlimited mode, caps are skipped and not-yet-due cards fill in once the
  // normal queue is empty. Returns a live array of {item,dueAt} and stores
  // the session on S.session.
  PT.cards.buildQueue = function (list, S, n) {
    n = n || now();
    var unlimited = isUnlimited();
    var reviews = [], learning = [], news = [], extra = [];
    var i, item, rec, st;
    for (i = 0; i < list.length; i++) {
      item = list[i];
      rec = recFor(S, item);
      st = PT.srs.statusOf(rec, n);
      if (st === "due") {
        reviews.push({ item: item, dueAt: rec.due || 0 });
      } else if (st === "learning") {
        // learning-due: only if its due time has arrived
        if ((rec.due || 0) <= n) learning.push({ item: item, dueAt: rec.due || 0 });
      } else if (st === "new") {
        news.push({ item: item, dueAt: n });
      } else if (unlimited) {
        // "known", not due yet — held back for recycling below
        extra.push({ item: item, dueAt: rec.due || 0 });
      }
    }

    // sort reviews by due ascending
    reviews.sort(function (a, b) { return a.dueAt - b.dueAt; });
    learning.sort(function (a, b) { return a.dueAt - b.dueAt; });

    if (!unlimited) {
      // apply daily caps (subtract what has already been done today)
      var counts = dayCounts(S.deck);
      var st2 = S.settings || {};
      var revCap = typeof st2.revPerDay === "number" ? st2.revPerDay : 120;
      var newCap = typeof st2.newPerDay === "number" ? st2.newPerDay : 20;
      var revRoom = Math.max(0, revCap - counts.r);
      var newRoom = Math.max(0, newCap - counts.n);
      if (reviews.length > revRoom) reviews = reviews.slice(0, revRoom);
      if (news.length > newRoom) news = news.slice(0, newRoom);
    }

    // order new cards: random or alphabetical
    if (S.filter && S.filter.sort === "random") {
      shuffle(news);
    } else {
      news.sort(function (a, b) {
        var wa = (a.item.w || "").toLowerCase(), wb = (b.item.w || "").toLowerCase();
        return wa < wb ? -1 : (wa > wb ? 1 : 0);
      });
    }

    var q = reviews.concat(learning, news);
    if (unlimited && q.length === 0 && extra.length) {
      shuffle(extra);
      q = extra.slice(0, 60); // one recycling batch; render() refills again once this drains
    }

    // mark which entries are "new" so we can bump the new counter on intro
    for (i = 0; i < q.length; i++) {
      q[i]._new = PT.srs.statusOf(recFor(S, q[i].item), n) === "new";
    }

    S.session = {
      q: q,
      total: q.length,
      done: 0,
      flipped: false,
      undo: null,
      unlimited: unlimited,
      introduced: {} // keyOf -> true once a new card has been counted
    };
    return q;
  };

  function shuffle(a) {
    var i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  /* ---------- rendering ---------- */

  var RATES = [
    { r: 0, th: "อีกครั้ง", cls: "c-again" },
    { r: 1, th: "ยาก", cls: "c-hard" },
    { r: 2, th: "ดี", cls: "c-good" },
    { r: 3, th: "ง่าย", cls: "c-easy" }
  ];

  // Recall-angle rotation for review-stage (rec.s===2) cards that have an
  // example sentence: rotate meaning -> example -> produce by rep count, so
  // the SAME item asks a different question instead of an identical reveal
  // every time. New/learning cards always get the plain 'meaning' angle
  // (keeps first-exposure simple, per the standard SRS-onboarding practice).
  var ANGLES = ["meaning", "example", "produce"];
  function angleFor(item, rec) {
    if (!item || !item.ee || !rec || rec.s !== 2) return "meaning";
    return ANGLES[(rec.reps || 0) % ANGLES.length];
  }

  PT.cards.render = function (viewEl) {
    var S = window.S;
    var n = now();
    var unlimited = isUnlimited();
    var listening = isListening();
    var list = null;

    // (re)build the session if there is none or it drained. In unlimited mode,
    // a drained queue means "recycle" — buildQueue already refills from
    // not-yet-due cards, so this loop naturally keeps the session alive.
    if (!S.session || !S.session.q || S.session.q.length === 0) {
      list = PT.filters.apply(S);
      PT.cards.buildQueue(list, S, n);
    }

    var sess = S.session;
    if (!sess || sess.q.length === 0) {
      var empty = list || PT.filters.apply(S);
      var unlBtn = '<button class="c-unl-cta" data-c-unl="1">🔁 เล่นต่อแบบไม่จำกัด</button>';
      viewEl.innerHTML = empty.length === 0
        ? '<div class="c-empty"><div class="c-empty-emoji">🗂️</div>' +
          '<div class="c-empty-msg">ไม่มีคำในตัวกรองนี้</div></div>'
        : '<div class="c-empty"><div class="c-empty-emoji">🎉</div>' +
          '<div class="c-empty-msg">เก่งมาก! หมดการ์ดที่ต้องทบทวนของวันนี้แล้ว</div>' +
          '<div class="c-empty-sub">อยากฝึกต่อ ไม่ติดโควตารายวัน?</div>' + unlBtn + '</div>';
      var unlCta = viewEl.querySelector("[data-c-unl]");
      if (unlCta) unlCta.onclick = function () { setUnlimited(true); S.session = null; PT.cards.render(viewEl); };
      bindKeyboard(viewEl);
      return;
    }

    var entry = sess.q[0];
    var item = entry.item;
    var rec = recFor(S, item);
    var pos = sess.done + 1;
    var grp = item.g || (window.DECKS && DECKS[S.deck] ? DECKS[S.deck].name : "");
    var angle = angleFor(item, rec);
    var isNewCardShown = entry._new;

    var front, back;
    if (listening) {
      front = frontHtmlListen();
    } else if (S.dir === "th") {
      front = frontHtml(item.mt || item.w, item.p, "th", angle, isNewCardShown);
    } else {
      front = frontHtml(item.w, item.p, "en", angle, isNewCardShown);
    }
    back = backHtml(item, S.dir === "th" ? "th" : "en", rec);

    // interval preview labels for the four ratings
    var rateBtns = "";
    for (var i = 0; i < RATES.length; i++) {
      var prev = "";
      try { prev = PT.srs.intervalPreview(rec, RATES[i].r, n) || ""; } catch (e) { prev = ""; }
      rateBtns +=
        '<button class="c-rate ' + RATES[i].cls + '" data-r="' + RATES[i].r + '">' +
        '<span class="c-rate-th">' + esc(RATES[i].th) + '</span>' +
        '<span class="c-rate-iv">' + esc(prev) + '</span>' +
        '</button>';
    }

    var undoBtn = sess.undo
      ? '<button class="c-undo" title="เลิกทำ">↩ เลิกทำ</button>' : '';
    var unlToggle = '<button class="c-unl' + (unlimited ? ' on' : '') + '" data-c-unl-t="1" ' +
      'title="' + (unlimited ? "โหมดไม่จำกัด: เปิดอยู่ — ไม่ติดโควตารายวัน" : "เปิดโหมดไม่จำกัด — เล่นได้เรื่อยๆ ไม่ติดโควตารายวัน") + '">' +
      (unlimited ? "🔁 ไม่จำกัด" : "🔁") + '</button>';
    var listenToggle = '<button class="c-unl' + (listening ? ' on' : '') + '" data-c-listen-t="1" ' +
      'title="' + (listening ? "โหมดฟังอย่างเดียว: เปิดอยู่" : "เปิดโหมดฟังอย่างเดียว — ฟังก่อนพลิกดู") + '">' +
      (listening ? "🎧 ฟัง" : "🎧") + '</button>';

    viewEl.innerHTML =
      '<div class="c-wrap' + (sess.flipped ? ' c-flipped' : '') + '">' +
        '<div class="c-top">' +
          '<span class="c-prog">' + pos + ' / ' + sess.total + '</span>' +
          '<span class="c-dot">·</span>' +
          '<span class="c-grp">' + esc(grp) + '</span>' +
          listenToggle +
          unlToggle +
          undoBtn +
        '</div>' +
        '<div class="c-card" id="c-card" tabindex="0">' +
          '<div class="c-inner">' +
            '<div class="c-face c-front">' + front + '</div>' +
            '<div class="c-face c-back">' + back + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="c-foot">' +
          '<button class="c-reveal">ดูเฉลย</button>' +
          '<div class="c-rates">' + rateBtns + '</div>' +
        '</div>' +
      '</div>';

    wire(viewEl, item);
    bindKeyboard(viewEl);
    if (window.PT && PT.ja && PT.ja.on()) fitCard(viewEl);
    if (PT.a11y && typeof PT.a11y.enhance === "function") PT.a11y.enhance(viewEl);

    // listening mode: auto-play the word once when a NEW card appears (not on
    // every re-render of the same card — flipping doesn't re-render, so this
    // naturally fires once per card).
    if (listening && !sess.flipped) {
      try { speak(item.w || ""); } catch (e) {}
    }
  };

  function frontHtml(main, p, dir, angle, isNewCardShown) {
    var lc = (main || "").length > 22 ? " c-word-long" : "";  // shrink long text (sentences)
    var hint, badge = "";
    if (angle === "example") {
      hint = "🧩 นึกตัวอย่างประโยคที่ใช้คำนี้ในใจ แล้วแตะเพื่อดูเฉลย";
      badge = '<div class="c-angle">🧩 ตัวอย่างประโยค</div>';
    } else if (angle === "produce") {
      hint = "✍️ ลองแต่งประโยคของตัวเองที่ใช้คำนี้ในใจ แล้วแตะเพื่อเทียบ";
      badge = '<div class="c-angle">✍️ แต่งประโยค</div>';
    } else {
      hint = dir === "th" ? "แตะเพื่อดูคำศัพท์" : "แตะเพื่อดูความหมาย";
    }
    return badge + '<div class="c-word' + lc + '">' + esc(main || "") + '</div>' +
           (p ? '<div class="c-pos">' + esc(p) + '</div>' : '') +
           '<div class="c-hint">' + hint + '</div>';
  }

  /* Japanese makes the back taller: grow the card instead of scrolling inside the flip */
  function fitCard(viewEl) {
    var c = viewEl.querySelector(".c-card"), inn = viewEl.querySelector(".c-inner");
    var f = viewEl.querySelector(".c-front"), b = viewEl.querySelector(".c-back");
    if (!c || !inn || !f || !b) return;
    var hgt = Math.max(260, f.scrollHeight, b.scrollHeight) + 2;   // + the face border
    c.style.minHeight = hgt + "px"; inn.style.minHeight = hgt + "px";
  }

  function frontHtmlListen() {
    return '<button type="button" class="c-listen-btn" data-c-listen-play="1" aria-label="ฟังเสียง">🔊</button>' +
      '<div class="c-hint">แตะฟัง แล้วนึกคำ/ความหมายในใจ ก่อนพลิกดู</div>';
  }

  function backHtml(item, dir, rec) {
    var h = '';
    var lcw = (item.w || "").length > 22 ? " c-b-word-long" : "";
    var isFav = !!(window.PT && PT.fav && PT.fav.isFav(item));
    var isLeech = !!(rec && (rec.lap || 0) >= 4);
    h += '<div class="c-b-head">' +
           '<span class="c-b-word' + lcw + '">' + esc(item.w || "") + '</span>' +
           '<button class="c-fav' + (isFav ? ' on' : '') + '" title="ติดดาว" aria-label="ติดดาว">' + (isFav ? '★' : '☆') + '</button>' +
           '<button class="c-speak" title="ฟังเสียง">🔊</button>' +
           ((window.DECKS && DECKS[S.deck] && DECKS[S.deck].type === "sentence")
             ? '<button class="c-speak" title="อ่านช้า" data-slow="' + esc(item.w || "") + '">🐢</button>'
             : '<button class="c-speak" title="สะกดคำ" data-spell="' + esc(item.w || "") + '">🔤</button>') +
         '</div>';
    if (isLeech) h += '<div class="c-b-leech">🐛 ตอบผิดซ้ำหลายครั้ง — ถูกเก็บเข้าสมุดคำผิดให้แล้ว</div>';
    var meta = [];
    if (item.p) meta.push(esc(item.p));
    if (item.ip) meta.push('<span class="c-b-ipa">' + esc(item.ip) + '</span>');
    if (meta.length) h += '<div class="c-b-pos">' + meta.join(" · ") + '</div>';
    if (item.vf && item.vf.v2 && item.vf.v3) {
      h += '<div class="c-b-vf">' +
        '<div class="c-vf-cell"><span class="c-vf-l">V1</span><span class="c-vf-w">' + esc(item.w || "") + '</span></div>' +
        '<span class="c-vf-ar">→</span>' +
        '<div class="c-vf-cell"><span class="c-vf-l">V2</span><span class="c-vf-w">' + esc(item.vf.v2) + '</span></div>' +
        '<span class="c-vf-ar">→</span>' +
        '<div class="c-vf-cell"><span class="c-vf-l">V3</span><span class="c-vf-w">' + esc(item.vf.v3) + '</span></div>' +
        (item.vf.ir ? '<span class="c-vf-ir">ไม่ปกติ</span>' : '') +
        '</div>';
    }
    if (window.PT && PT.ja && PT.ja.on()) {
      // ไทย -> English -> 日本語 (the front stays a single-language prompt)
      var isSent = !!(window.DECKS && DECKS[S.deck] && DECKS[S.deck].type === "sentence");
      var JH = PT.ja.head(S.deck, item);
      if (isSent) { if (item.mt || JH) h += '<div class="c-b-row c-b-jx">' + PT.ja.stack(item.mt, "", JH) + '</div>'; }
      else if (item.me || item.mt || JH) h += '<div class="c-b-row c-b-jx">' + PT.ja.stack(item.mt, item.me ? esc(item.me) : "", JH, { kind: "w" }) + '</div>';
      if (item.ee) h += '<div class="c-b-ex">' + PT.ja.stack(item.et, esc(item.ee), PT.ja.ex(S.deck, item, item.ee)) + '</div>';
    } else {
    if (item.me) h += '<div class="c-b-row"><span class="c-b-lab">EN</span>' + esc(item.me) + '</div>';
    if (item.mt) h += '<div class="c-b-row"><span class="c-b-lab">TH</span>' + esc(item.mt) + '</div>';
    if (item.ee) h += '<div class="c-b-ex">' + esc(item.ee) + '</div>';
    if (item.et) h += '<div class="c-b-ex c-b-ex-th">' + esc(item.et) + '</div>';
    }
    if (item.x) h += '<div class="c-b-x">' + esc(item.x) + '</div>';
    if (item.sy && item.sy.length) h += '<div class="c-b-syn">≈ ' + esc(item.sy.join(", ")) + '</div>';
    if (item.an && item.an.length) h += '<div class="c-b-syn c-b-ant">↔ ' + esc(item.an.join(", ")) + '</div>';
    if (item.tn) h += '<div class="c-b-note">📝 ' + esc(item.tn) + '</div>';
    return h;
  }

  /* ---------- interaction ---------- */

  function wire(viewEl, item) {
    var S = window.S;
    var card = viewEl.querySelector(".c-card");
    var reveal = viewEl.querySelector(".c-reveal");
    var rates = viewEl.querySelectorAll(".c-rate");
    var speakBtn = viewEl.querySelector(".c-speak");
    var undo = viewEl.querySelector(".c-undo");

    function doFlip() {
      if (S.session.flipped) return;
      S.session.flipped = true;
      var wrap = viewEl.querySelector(".c-wrap");
      if (wrap) wrap.className = "c-wrap c-flipped";
    }

    if (reveal) reveal.onclick = doFlip;
    if (card) card.onclick = doFlip;

    if (speakBtn) speakBtn.onclick = function (e) {
      e.stopPropagation();
      speak((item.w || "") + ". " + (item.ee || ""));
    };

    var favBtn = viewEl.querySelector(".c-fav");
    if (favBtn) favBtn.onclick = function (e) {
      e.stopPropagation();
      if (window.PT && PT.fav) {
        var on = PT.fav.toggle(item);
        favBtn.className = "c-fav" + (on ? " on" : "");
        favBtn.textContent = on ? "★" : "☆";
      }
    };

    var unlBtn = viewEl.querySelector("[data-c-unl-t]");
    if (unlBtn) unlBtn.onclick = function (e) {
      e.stopPropagation();
      setUnlimited(!isUnlimited());
      S.session = null; // force a fresh queue under the new mode
      PT.cards.render(viewEl);
    };

    var listenBtn = viewEl.querySelector("[data-c-listen-t]");
    if (listenBtn) listenBtn.onclick = function (e) {
      e.stopPropagation();
      setListening(!isListening());
      PT.cards.render(viewEl); // same card/position — just changes how the front looks
    };

    var listenPlay = viewEl.querySelector("[data-c-listen-play]");
    if (listenPlay) listenPlay.onclick = function (e) {
      e.stopPropagation();
      speak(item.w || "");
    };

    var i;
    for (i = 0; i < rates.length; i++) {
      rates[i].onclick = (function (btn) {
        return function (e) {
          e.stopPropagation();
          if (!S.session.flipped) return; // must reveal first
          grade(parseInt(btn.getAttribute("data-r"), 10));
        };
      })(rates[i]);
    }

    if (undo) undo.onclick = function () { doUndo(); };
  }

  // Grade the current (front) card.
  function grade(rating) {
    var S = window.S;
    var n = now();
    var sess = S.session;
    if (!sess || !sess.q.length) return;

    var entry = sess.q[0];
    var item = entry.item;
    var key = keyOf(item);          // base identity — favorites/mistake-notebook/introduced tracking
    var sKey = srsKey(S, item);     // SRS record key — direction-suffixed only when dirSplit is on
    var prevRec = S.rec[sKey]; // preserved by reference (grade returns a new object)

    // mistake notebook: "อีกครั้ง" (Again=0) = a lapse -> collect; Good/Easy (>=2) -> credit toward retiring
    try { if (PT.miss) { if (rating === 0) PT.miss.add(S.deck, key); else if (rating >= 2) PT.miss.right(S.deck, key); } } catch (e) {}

    // retention log: only counts when this was already a review-stage card
    try { logGrade(S.deck, !!(prevRec && prevRec.s === 2), rating); } catch (e) {}

    // undo snapshot BEFORE mutating
    sess.undo = {
      key: key,
      sKey: sKey,
      prevRec: prevRec,
      queue: sess.q.slice(),
      done: sess.done,
      introduced: cloneFlat(sess.introduced)
    };

    // bump the new-card counter the first time a new card is introduced
    if (entry._new && !sess.introduced[key]) {
      sess.introduced[key] = true;
      bumpDay("new", S.deck);
    } else {
      bumpDay("rev", S.deck);
    }

    var res = PT.srs.grade(prevRec, rating, n);
    S.rec[sKey] = res.rec;
    srsSave(S);

    // leech: repeated lapses on the same card -> auto-collect into the
    // Mistake Notebook (reuses the existing bridge instead of a separate list)
    try {
      if (PT.miss && (res.rec.lap || 0) >= 4 && !PT.miss.has(S.deck, key)) PT.miss.add(S.deck, key);
    } catch (e) {}

    if (res.requeue) {
      entry.dueAt = res.rec.due;
      // re-sort the live queue by dueAt ascending
      sess.q.sort(function (a, b) { return a.dueAt - b.dueAt; });
    } else {
      sess.q.shift();
      sess.done += 1;
    }

    sess.flipped = false;

    // progress dots elsewhere should update
    if (PT.bus && PT.bus.emit) PT.bus.emit("recchange");

    PT.cards.render(document.getElementById("view"));
  }

  function doUndo() {
    var S = window.S;
    var sess = S.session;
    if (!sess || !sess.undo) return;
    var u = sess.undo;
    var sKey = u.sKey || u.key;
    if (u.prevRec) { S.rec[sKey] = u.prevRec; } else { delete S.rec[sKey]; }  // don't leave a phantom key for undone new cards
    sess.q = u.queue;
    sess.done = u.done;
    sess.introduced = u.introduced;
    sess.flipped = false;
    sess.undo = null;
    srsSave(S);
    if (PT.bus && PT.bus.emit) PT.bus.emit("recchange");
    PT.cards.render(document.getElementById("view"));
  }

  function cloneFlat(o) {
    var r = {}, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
    return r;
  }

  /* ---------- keyboard: 1-4 rate, space flip ---------- */

  function bindKeyboard(viewEl) {
    if (PT.cards._kbBound) return;
    PT.cards._kbBound = true;
    document.addEventListener("keydown", function (e) {
      var S = window.S;
      if (S.mode !== "cards") return;
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!S.session || !S.session.q || !S.session.q.length) return;

      if (e.key === " " || e.key === "Spacebar" || e.keyCode === 32) {
        e.preventDefault();
        if (!S.session.flipped) {
          S.session.flipped = true;
          var wrap = document.querySelector(".c-wrap");
          if (wrap) wrap.className = "c-wrap c-flipped";
        }
        return;
      }
      if (S.session.flipped && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        grade(parseInt(e.key, 10) - 1);
      }
    });
  }

})();
