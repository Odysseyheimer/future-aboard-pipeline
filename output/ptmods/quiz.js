/* PT.quiz — Quiz tab. Two sub-modes: Multiple choice (mc) and Typing (type).
   Integrated with SRS: correct=Good(2), wrong=Again(0). Emits 'recchange'.
   ES5 only. Classes prefixed '.qz-'. */
(function () {
  "use strict";
  window.PT = window.PT || {};

  // ---- module-local session state (kept on PT.quiz so it survives re-renders) ----
  var Q = {
    sub: "mc",        // "mc" | "type" | "listen"
    cur: null,        // current question object
    answered: false,  // whether current question was answered
    picked: -1,       // index user picked (mc) for highlight
    right: 0,         // session correct count
    total: 0,         // session total answered
    lastCorrect: false,
    played: false,    // listen mode: whether current clip has auto-played
    bDraft: ""        // build mode: the user's typed sentence
  };

  // pick a random integer 0..n-1
  function ri(n) { return Math.floor(Math.random() * n); }

  // shuffle array in place (Fisher-Yates), returns same array
  function shuffle(a) {
    var i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = ri(i + 1);
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Is direction English-prompt? (dir "en" => show English word, answer = meaning)
  function isEn(S) { return S && S.dir === "en"; }

  // The "prompt" text the learner sees for an item.
  function promptText(item, S) {
    // en: show English word -> choose Thai meaning
    // th: show Thai meaning  -> choose English word
    return isEn(S) ? (item.w || "") : (item.mt || item.me || "");
  }

  // The "answer" text (correct option / typed target) for an item.
  function answerText(item, S) {
    return isEn(S) ? (item.mt || item.me || "") : (item.w || "");
  }

  // A Thai->English SENTENCE pair for build mode, or null if the item has none.
  function sentPair(it, S) {
    if (!it) return null;
    var dt = (window.DECKS && DECKS[S.deck]) ? DECKS[S.deck].type : "";
    if (dt === "sentence") {                 // Sentences deck: w = EN sentence, mt = TH
      return (it.w && it.mt) ? { en: it.w, th: it.mt } : null;
    }
    return (it.ee && it.et) ? { en: it.ee, th: it.et } : null;  // vocab decks: example sentence
  }

  // Build a multiple-choice or typing question from the filtered list.
  // Frozen signature: PT.quiz.build(list, S) -> question object
  function build(list, S) {
    if (!list || !list.length) return null;

    var target = list[ri(list.length)];

    if (Q.sub === "type") {
      return {
        sub: "type",
        item: target,
        answer: answerText(target, S) // expected typed text (English when en, Thai when th)
      };
    }

    if (Q.sub === "listen") {
      // dictation: hear the English, type it back (answer is always the English)
      return {
        sub: "listen",
        item: target,
        answer: target.w || ""
      };
    }

    if (Q.sub === "build") {
      // sentence production: show Thai, user writes the English, then self-assess.
      var bt = null, bp = null, btries = 0;
      while (btries < 20) {
        var bcand = list[ri(list.length)];
        bp = sentPair(bcand, S);
        if (bp) { bt = bcand; break; }
        btries++;
      }
      if (!bt) return { sub: "build", item: null };
      return { sub: "build", item: bt, th: bp.th, en: bp.en };
    }

    if (Q.sub === "cloze") {
      // fill-in-the-blank: blank the headword out of its example sentence.
      var ct = null, blanked = null, tries = 0;
      while (tries < 15) {
        var cand = list[ri(list.length)];
        var b = makeCloze(cand);
        if (b) { ct = cand; blanked = b; break; }
        tries++;
      }
      if (!ct) return { sub: "cloze", item: null };
      return { sub: "cloze", item: ct, cloze: blanked, answer: ct.w || "" };
    }

    // ---- multiple choice ----
    // Prefer distractors from the SAME deck (S.data) sharing a POS bucket.
    var correct = answerText(target, S);
    var targetKey = keyOf(target);
    var pool = (S && S.data && S.data.length) ? S.data : list;

    // POS buckets of the target (may be empty)
    var tBuckets = (PT.pos && PT.pos.buckets) ? PT.pos.buckets(target.p || "") : [];

    function sharesBucket(it) {
      if (!tBuckets.length) return false;
      var b = (PT.pos && PT.pos.buckets) ? PT.pos.buckets(it.p || "") : [];
      var i, j;
      for (i = 0; i < b.length; i++) {
        for (j = 0; j < tBuckets.length; j++) {
          if (b[i] === tBuckets[j]) return true;
        }
      }
      return false;
    }

    var opts = [correct];         // option texts collected (for dedupe)
    var seen = {};
    seen[correct] = true;

    // 1st pass: same POS bucket
    var i, cand, txt;
    var order = [];
    for (i = 0; i < pool.length; i++) order.push(i);
    shuffle(order);

    for (i = 0; i < order.length && opts.length < 4; i++) {
      cand = pool[order[i]];
      if (keyOf(cand) === targetKey) continue;
      if (!sharesBucket(cand)) continue;
      txt = answerText(cand, S);
      if (!txt || hasSeen(seen, txt)) continue;
      seen[txt] = true;
      opts.push(txt);
    }
    // 2nd pass: fill remaining from anywhere in the deck
    for (i = 0; i < order.length && opts.length < 4; i++) {
      cand = pool[order[i]];
      if (keyOf(cand) === targetKey) continue;
      txt = answerText(cand, S);
      if (!txt || hasSeen(seen, txt)) continue;
      seen[txt] = true;
      opts.push(txt);
    }

    // Build option objects, mark the correct one, then shuffle.
    var optObjs = [];
    for (i = 0; i < opts.length; i++) {
      optObjs.push({ text: opts[i], correct: opts[i] === correct });
    }
    shuffle(optObjs);

    return {
      sub: "mc",
      item: target,
      prompt: promptText(target, S),
      options: optObjs,
      correctText: correct
    };
  }

  function hasSeen(seen, k) {
    return Object.prototype.hasOwnProperty.call(seen, k);
  }

  // Blank the headword (word or phrase, e.g. a phrasal verb) out of its example
  // sentence -> "... _____ ...". null if the exact form isn't found.
  function makeCloze(item) {
    var ee = item && item.ee ? item.ee : "";
    var w = item && item.w ? item.w : "";
    if (!ee || !w) return null;
    var e = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"); // flexible spacing for phrases
    var re = new RegExp("\\b" + e + "\\b", "i");
    if (!re.test(ee)) return null;
    return ee.replace(re, "_____");
  }

  // Grade the current item through SRS and persist.
  function gradeItem(item, correct, S) {
    var k = keyOf(item);
    var now = Date.now();
    // mistake notebook: collect wrong answers, retire on repeated correct
    try { if (PT.miss) { if (correct) PT.miss.right(S.deck, k); else PT.miss.add(S.deck, k); } } catch (e) {}
    // Today Hub: a cloze answer counts toward today's game slot
    try { if (PT.hub && PT.hub.bumpStep && Q.sub === "cloze") PT.hub.bumpStep("game", 3); } catch (e) {}
    var rec = (S.rec && S.rec[k]) ? S.rec[k] : PT.srs.newRecord();
    var rating = correct ? 2 : 0; // Good : Again
    var res = PT.srs.grade(rec, rating, now);
    S.rec = S.rec || {};
    S.rec[k] = res.rec;
    // persist through the SRS module (srs3_<deck>) — same store as Cards
    try { if (PT.srs && PT.srs.save) PT.srs.save(S.deck, S.rec); } catch (e) {}
    if (PT.bus && PT.bus.emit) PT.bus.emit("recchange");
  }

  // Move to the next question.
  function next(S) {
    var list = PT.filters.apply(S);
    Q.cur = build(list, S);
    Q.answered = false;
    Q.picked = -1;
    Q.played = false;   // allow the new clip to auto-play (listen mode)
    Q.bDraft = "";      // clear build-mode draft
    rerender(S);
  }

  // build mode: reveal the model answer (capture the user's draft first)
  function bReveal(S) {
    if (Q.answered || !Q.cur) return;
    var el = document.getElementById("qz-binput");
    Q.bDraft = el ? el.value : "";
    Q.answered = true;
    rerender(S);
  }
  // build mode: self-assessment -> feed SRS + mistake notebook, then advance
  function bRate(rating, S) {
    if (!Q.cur || !Q.cur.item) return;
    var correct = (rating !== "again");
    Q.total++;
    if (correct) Q.right++;
    gradeItem(Q.cur.item, correct, S);
    try { if (PT.hub && PT.hub.bumpStep) PT.hub.bumpStep("sent", 3); } catch (e) {}  // Today Hub: แต่งประโยค 3 ข้อ
    next(S);
  }
  function bClaude(S) {
    var q = Q.cur, msg = document.getElementById("qz-bmsg");
    if (!q) return;
    var draft = String(Q.bDraft || "").replace(/^\s+|\s+$/g, "");
    if (!draft) { if (msg) msg.textContent = "ยังไม่ได้พิมพ์ประโยค — ลองเขียนก่อนแล้วค่อยส่งให้ตรวจ"; return; }
    var out = "Check my English translation of a Thai sentence. Tell me if my version is natural and correct, " +
      "point out any grammar/word-choice mistakes, and give the most natural way to say it.\n\n" +
      "THAI: " + q.th + "\nMY ENGLISH: " + draft + "\n(One natural model answer: " + q.en + ")";
    var ok = copyText(out);
    if (msg) msg.innerHTML = (ok ? "✅ คัดลอกแล้ว! " : "") + "ไปวางในแชต Claude แล้วส่ง → ผมจะตรวจประโยคของคุณให้";
  }
  function copyText(s) {
    var ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(s); ok = true; } } catch (e) {}
    if (!ok) { try { var ta = document.createElement("textarea"); ta.value = s; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); ok = !!(document.execCommand && document.execCommand("copy")); document.body.removeChild(ta); } catch (e) {} }
    return ok;
  }

  // Handle a multiple-choice pick.
  function pick(idx, S) {
    if (Q.answered || !Q.cur) return;
    var opt = Q.cur.options[idx];
    if (!opt) return;
    Q.answered = true;
    Q.picked = idx;
    Q.lastCorrect = !!opt.correct;
    Q.total++;
    if (opt.correct) Q.right++;
    gradeItem(Q.cur.item, opt.correct, S);
    rerender(S);
  }

  // Handle a typed answer submit.
  function submitTyped(S) {
    if (Q.answered || !Q.cur) return;
    var el = document.getElementById("qz-input");
    var val = el ? el.value : "";
    var expected = Q.cur.answer || "";
    var ok = norm(val) === norm(expected);
    // also accept match against alternate (English meaning) when Thai missing
    if (!ok && isEn(S)) {
      var alt = Q.cur.item.me || "";
      if (alt && norm(val) === norm(alt)) ok = true;
    }
    Q.answered = true;
    Q.lastCorrect = ok;
    Q.total++;
    if (ok) Q.right++;
    gradeItem(Q.cur.item, ok, S);
    rerender(S);
  }

  // normalize for case-insensitive / trimmed compare
  function norm(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "").toLowerCase();
  }

  function setSub(sub, S) {
    if (Q.sub === sub) return;
    Q.sub = sub;
    next(S); // rebuild question for new mode
  }

  // Re-render into #view (host owns dispatch, but Quiz self-refreshes on interaction).
  function rerender(S) {
    var v = document.getElementById("view");
    if (v) render(v, S);
  }

  // Frozen signature: PT.quiz.render(viewEl)
  // Host may call render(el) with global S; accept optional S for internal calls.
  function render(viewEl, Sarg) {
    var S = Sarg || window.S;
    if (!viewEl || !S) return;

    var list = PT.filters.apply(S);

    // Build a question if we don't have one yet.
    if (!Q.cur) {
      Q.cur = build(list, S);
      Q.answered = false;
      Q.picked = -1;
    }

    var html = "";
    html += '<div class="qz-wrap">';

    // header: segmented control + score
    html += '<div class="qz-top">';
    html += '<div class="qz-seg" role="tablist">';
    html += '<button type="button" class="qz-segbtn' + (Q.sub === "mc" ? " qz-on" : "") +
      '" data-qz-sub="mc" role="tab" aria-selected="' + (Q.sub === "mc") + '">ปรนัย</button>';
    html += '<button type="button" class="qz-segbtn' + (Q.sub === "type" ? " qz-on" : "") +
      '" data-qz-sub="type" role="tab" aria-selected="' + (Q.sub === "type") + '">พิมพ์ตอบ</button>';
    html += '<button type="button" class="qz-segbtn' + (Q.sub === "listen" ? " qz-on" : "") +
      '" data-qz-sub="listen" role="tab" aria-selected="' + (Q.sub === "listen") + '">ฟัง</button>';
    // Cloze (fill-in-the-blank) only for word decks that carry example sentences.
    var deckDef = (window.DECKS && DECKS[S.deck]) ? DECKS[S.deck] : {};
    if (deckDef.type !== "sentence") {
      html += '<button type="button" class="qz-segbtn' + (Q.sub === "cloze" ? " qz-on" : "") +
        '" data-qz-sub="cloze" role="tab" aria-selected="' + (Q.sub === "cloze") + '">เติมคำ</button>';
    }
    html += '<button type="button" class="qz-segbtn' + (Q.sub === "build" ? " qz-on" : "") +
      '" data-qz-sub="build" role="tab" aria-selected="' + (Q.sub === "build") + '">แต่งประโยค</button>';
    html += '<button type="button" class="qz-segbtn' + (Q.sub === "bank" ? " qz-on" : "") +
      '" data-qz-sub="bank" role="tab" aria-selected="' + (Q.sub === "bank") + '">เติมประโยค</button>';
    html += '<button type="button" class="qz-segbtn' + (Q.sub === "fix" ? " qz-on" : "") +
      '" data-qz-sub="fix" role="tab" aria-selected="' + (Q.sub === "fix") + '">หาที่ผิด</button>';
    html += '</div>';
    var isGame = (Q.sub === "bank" || Q.sub === "fix");
    if (!isGame) html += '<div class="qz-score">ถูก ' + Q.right + ' / ทั้งหมด ' + Q.total + '</div>';
    html += '</div>';

    // "เติมประโยค" / "หาที่ผิด" are self-contained mini-games rendered in their own host.
    if (isGame) {
      var mod = (Q.sub === "bank") ? PT.bank : PT.fix;
      html += '<div id="game-host"></div></div>';
      viewEl.innerHTML = html;
      bind(S);
      var gh = document.getElementById("game-host");
      if (mod && mod.mount) mod.mount(gh);
      else if (gh) gh.innerHTML = '<div class="qz-empty">โหลดเกมไม่สำเร็จ</div>';
      if (PT.a11y && PT.a11y.enhance) PT.a11y.enhance(viewEl);
      return;
    }

    if (!Q.cur) {
      html += '<div class="qz-empty">ไม่มีคำศัพท์ตามตัวกรอง — ปรับตัวกรองแล้วลองใหม่</div>';
      html += '</div>';
      viewEl.innerHTML = html;
      bind(S);
      return;
    }

    if (Q.sub === "mc") html += renderMC(S);
    else if (Q.sub === "listen") html += renderListen(S);
    else if (Q.sub === "cloze") html += renderCloze(S);
    else if (Q.sub === "build") html += renderBuild(S);
    else html += renderType(S);

    html += '</div>';
    viewEl.innerHTML = html;
    bind(S);

    // Listen mode: auto-play the clip once per question (within the tap gesture chain).
    if (Q.sub === "listen" && Q.cur && Q.cur.item && !Q.answered && !Q.played) {
      Q.played = true;
      try { speak(Q.cur.item.w); } catch (e) {}
    }

    if (PT.a11y && PT.a11y.enhance) PT.a11y.enhance(viewEl);
  }

  function renderListen(S) {
    var q = Q.cur;
    var h = "";
    h += '<div class="qz-card qz-listen">';
    h += '<div class="qz-plabel">ฟังเสียงแล้วพิมพ์เป็นภาษาอังกฤษ</div>';
    h += '<button type="button" class="qz-bigsay" data-qz-say="1" aria-label="เล่นเสียงอีกครั้ง">🔊</button>';
    h += '<div class="qz-hint">แตะเพื่อฟังอีกครั้ง</div>';
    h += '</div>';

    h += '<div class="qz-typerow">';
    h += '<input id="qz-input" class="qz-input" type="text" autocomplete="off" autocapitalize="none" ' +
      'spellcheck="false" placeholder="พิมพ์สิ่งที่ได้ยิน..."' + (Q.answered ? ' disabled' : '') + '>';
    if (!Q.answered) {
      h += '<button type="button" class="qz-submit" data-qz-submit="1">ตรวจ</button>';
    }
    h += '</div>';

    if (Q.answered) {
      h += feedback(S);
      var dt = (window.DECKS && DECKS[S.deck]) ? DECKS[S.deck].type : "";
      h += '<div class="qz-reveal">' + esc(q.item.w || "");
      h += (dt === "sentence"
        ? ' <button type="button" class="qz-say" data-slow="' + esc(q.item.w || "") + '">🐢</button>'
        : ' <button type="button" class="qz-say" data-spell="' + esc(q.item.w || "") + '">🔤</button>');
      if (q.item.mt) h += ' <span class="qz-reveal-th">' + esc(q.item.mt) + '</span>';
      h += vfBadge(q.item);
      h += '</div>';
      h += nextBtn();
    }
    return h;
  }

  function renderMC(S) {
    var q = Q.cur;
    var h = "";
    h += '<div class="qz-card">';
    h += '<div class="qz-plabel">' + (isEn(S) ? "ความหมายของคำนี้คือ" : "คำศัพท์ภาษาอังกฤษของ") + '</div>';
    h += '<div class="qz-prompt">' + esc(q.prompt) + '</div>';
    if (isEn(S) && q.item.w) {
      h += '<button type="button" class="qz-say" data-qz-say="1" aria-label="ฟังเสียง">🔊</button>';
    }
    h += '</div>';

    h += '<div class="qz-opts">';
    var i, o, cls;
    for (i = 0; i < q.options.length; i++) {
      o = q.options[i];
      cls = "qz-opt";
      if (Q.answered) {
        if (o.correct) cls += " qz-correct";
        else if (i === Q.picked) cls += " qz-wrong";
        else cls += " qz-dim";
      }
      h += '<button type="button" class="' + cls + '" data-qz-pick="' + i + '"' +
        (Q.answered ? ' disabled' : '') + '>' + esc(o.text) + '</button>';
    }
    h += '</div>';

    if (Q.answered) {
      h += feedback(S);
      h += nextBtn();
    }
    return h;
  }

  function renderCloze(S) {
    var q = Q.cur;
    var h = "";
    if (!q.item) {
      return '<div class="qz-empty">คลังนี้ยังไม่มีตัวอย่างประโยคให้เติมคำ — ลองคลังคำศัพท์ (Oxford/AWL) ดูครับ</div>';
    }
    h += '<div class="qz-card qz-cloze">';
    h += '<div class="qz-plabel">เติมคำในช่องว่างให้ประโยคสมบูรณ์</div>';
    h += '<div class="qz-clsent">' + esc(q.cloze) + '</div>';
    if (q.item.et) h += '<div class="qz-clth">' + esc(q.item.et) + '</div>';
    if (q.item.mt) h += '<div class="qz-clhint">ความหมายของคำ: ' + esc(q.item.mt) + '</div>';
    h += '</div>';

    h += '<div class="qz-typerow">';
    h += '<input id="qz-input" class="qz-input" type="text" autocomplete="off" autocapitalize="none" ' +
      'spellcheck="false" placeholder="พิมพ์คำที่หายไป..."' + (Q.answered ? ' disabled' : '') + '>';
    if (!Q.answered) {
      h += '<button type="button" class="qz-submit" data-qz-submit="1">ตรวจ</button>';
    }
    h += '</div>';

    if (Q.answered) {
      h += feedback(S);
      h += '<div class="qz-reveal"><b>' + esc(q.item.w || "") + '</b>';
      if (q.item.p) h += ' <span class="qz-reveal-th">(' + esc(q.item.p) + ')</span>';
      h += vfBadge(q.item);
      h += '<div class="qz-clfull">' + esc(q.item.ee || "") + ' <button type="button" class="qz-say" data-qz-say="full" aria-label="ฟังประโยค">🔊</button>' +
        '<button type="button" class="qz-say" data-slow="' + esc(q.item.ee || "") + '" aria-label="อ่านช้า">🐢</button></div></div>';
      h += nextBtn();
    }
    return h;
  }

  function renderBuild(S) {
    var q = Q.cur;
    if (!q.item) {
      return '<div class="qz-empty">คลังนี้ยังไม่มีประโยคให้แต่ง — ลองคลัง "ประโยค" (Sentences) หรือคลังคำที่มีตัวอย่าง (Oxford) ครับ</div>';
    }
    var h = "";
    h += '<div class="qz-card qz-build">';
    h += '<div class="qz-plabel">แปลเป็นภาษาอังกฤษ แล้วพิมพ์ประโยคของคุณ</div>';
    h += '<div class="qz-prompt qz-build-th">' + esc(q.th) + '</div>';
    h += '</div>';
    h += '<textarea id="qz-binput" class="qz-btext" spellcheck="false" placeholder="พิมพ์ประโยคภาษาอังกฤษของคุณ..."' +
      (Q.answered ? ' disabled' : '') + '>' + esc(Q.bDraft || "") + '</textarea>';
    if (!Q.answered) {
      h += '<button type="button" class="qz-submit" data-qz-breveal="1">ดูเฉลย</button>';
      return h;
    }
    // revealed: model answer + user's attempt + self-rate + Claude check
    h += '<div class="qz-bmodel"><div class="qz-bmodel-h">เฉลย (ตัวอย่างที่เป็นธรรมชาติ)</div>' +
      '<div class="qz-bmodel-en">' + esc(q.en) + ' <button type="button" class="qz-say" data-qz-say="model" aria-label="ฟัง">🔊</button>' +
      '<button type="button" class="qz-say" data-slow="' + esc(q.en) + '" aria-label="อ่านช้า">🐢</button></div></div>';
    if (String(Q.bDraft || "").replace(/^\s+|\s+$/g, "")) {
      h += '<div class="qz-byours"><div class="qz-byours-h">ที่คุณเขียน</div><div class="qz-byours-t">' + esc(Q.bDraft) + '</div></div>';
    }
    h += '<div class="qz-brate"><div class="qz-brate-h">ของคุณตรงกับเฉลยแค่ไหน?</div>' +
      '<button type="button" class="qz-bbtn qz-bok" data-qz-brate="good">✓ ตรงเลย</button>' +
      '<button type="button" class="qz-bbtn qz-bclose" data-qz-brate="close">≈ ใกล้เคียง</button>' +
      '<button type="button" class="qz-bbtn qz-bno" data-qz-brate="again">✗ ยังไม่ได้</button></div>';
    h += '<button type="button" class="qz-bclaude" data-qz-bclaude="1">📋 ให้ Claude ตรวจประโยคของฉัน</button>';
    h += '<div class="qz-bmsg" id="qz-bmsg"></div>';
    return h;
  }

  function renderType(S) {
    var q = Q.cur;
    var h = "";
    h += '<div class="qz-card">';
    h += '<div class="qz-plabel">' + (isEn(S) ? "พิมพ์ความหมาย (ไทย) ของคำนี้" : "พิมพ์คำศัพท์ภาษาอังกฤษ") + '</div>';
    h += '<div class="qz-prompt">' + esc(promptText(q.item, S)) + '</div>';
    if (isEn(S) && q.item.w) {
      h += '<button type="button" class="qz-say" data-qz-say="1" aria-label="ฟังเสียง">🔊</button>';
    }
    h += '</div>';

    h += '<div class="qz-typerow">';
    h += '<input id="qz-input" class="qz-input" type="text" autocomplete="off" autocapitalize="none" ' +
      'spellcheck="false" placeholder="พิมพ์คำตอบ..."' + (Q.answered ? ' disabled' : '') + '>';
    if (!Q.answered) {
      h += '<button type="button" class="qz-submit" data-qz-submit="1">ตรวจ</button>';
    }
    h += '</div>';

    if (Q.answered) {
      h += feedback(S);
      h += '<div class="qz-reveal">คำตอบ: <b>' + esc(q.answer || answerText(q.item, S)) + '</b>' + vfBadge(q.item) + '</div>';
      h += nextBtn();
    }
    return h;
  }

  // compact "went · gone" badge shown next to a reveal when the word is a verb
  function vfBadge(item) {
    if (!item || !item.vf || !item.vf.v2 || !item.vf.v3) return "";
    return ' <span class="qz-vf">V2 ' + esc(item.vf.v2) + ' · V3 ' + esc(item.vf.v3) + '</span>';
  }

  function feedback(S) {
    if (Q.lastCorrect) {
      return '<div class="qz-fb qz-fb-ok">ถูกต้อง! 🎉</div>';
    }
    return '<div class="qz-fb qz-fb-no">ยังไม่ถูก</div>';
  }

  function nextBtn() {
    return '<button type="button" class="qz-next" data-qz-next="1">ถัดไป</button>';
  }

  // Wire up event handlers for the freshly rendered DOM.
  function bind(S) {
    var v = document.getElementById("view");
    if (!v) return;
    var btns = v.querySelectorAll("[data-qz-sub]");
    var i;
    for (i = 0; i < btns.length; i++) {
      (function (b) {
        b.onclick = function () { setSub(b.getAttribute("data-qz-sub"), S); };
      })(btns[i]);
    }
    var picks = v.querySelectorAll("[data-qz-pick]");
    for (i = 0; i < picks.length; i++) {
      (function (b) {
        b.onclick = function () { pick(parseInt(b.getAttribute("data-qz-pick"), 10), S); };
      })(picks[i]);
    }
    var nx = v.querySelector("[data-qz-next]");
    if (nx) nx.onclick = function () { next(S); };
    var sub = v.querySelector("[data-qz-submit]:not([data-qz-breveal])");
    if (sub) sub.onclick = function () { submitTyped(S); };
    // build mode: reveal / self-rate / Claude check
    var brev = v.querySelector("[data-qz-breveal]");
    if (brev) brev.onclick = function () { bReveal(S); };
    var rates = v.querySelectorAll("[data-qz-brate]");
    for (i = 0; i < rates.length; i++) {
      (function (b) { b.onclick = function () { bRate(b.getAttribute("data-qz-brate"), S); }; })(rates[i]);
    }
    var bcl = v.querySelector("[data-qz-bclaude]");
    if (bcl) bcl.onclick = function () { bClaude(S); };
    var say = v.querySelector("[data-qz-say]");
    if (say) say.onclick = function () {
      if (!Q.cur || !Q.cur.item) return;
      var mode = say.getAttribute("data-qz-say");
      if (mode === "model") speak(Q.cur.en || "");
      else if (mode === "full") speak(Q.cur.item.ee || Q.cur.item.w);
      else speak(Q.cur.item.w);
    };
    var inp = v.querySelector("#qz-input");
    if (inp) {
      inp.onkeydown = function (e) {
        if ((e.keyCode || e.which) === 13) { e.preventDefault(); submitTyped(S); }
      };
      if (!Q.answered) { try { inp.focus(); } catch (e) {} }
    }
  }

  PT.quiz = {
    render: function (viewEl) { render(viewEl, window.S); },
    build: build,
    // exposed for potential host/testing use
    _state: Q
  };
})();
