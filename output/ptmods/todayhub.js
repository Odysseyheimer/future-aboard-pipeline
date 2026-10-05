/* todayhub.js — "วันนี้" Today Hub: one screen gathering everything to do today.
   Full-feature daily design: every day touches Cards+Quiz+สนทนา+เลือกคำ+ประโยค, and a rotating
   "major" slot covers เรื่องสั้น/Reading/พูดอัดเสียง/ฟัง/รอบรู้วิชาการ/Writing Lab across the week,
   plus a rotating game (เติมประโยค/หาที่ผิด/เติมคำ). Hidden mode "todayhub". ES5.
   Uses globals: S, esc, store, keyOf, goMode, loadDeck, PT.plan, PT.daily, PT.srs, PT.talk,
   PT.examprep, PT.quiz. */
PT.hub = (function () {
  "use strict";
  var HKEY = "pt_hub";
  var _hubBack = false;

  function todayISO() { var d = new Date(); var m = d.getMonth() + 1, dd = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd; }
  function planDay() { try { return (PT.plan && PT.plan.todayDay) ? PT.plan.todayDay() : null; } catch (e) { return null; } }

  function loadState() {
    var day = planDay(), date = todayISO(), st = null;
    try { st = JSON.parse(store.get(HKEY) || "null"); } catch (e) { st = null; }
    if (!st || st.date !== date || st.day !== day) { st = { day: day, date: date, steps: {}, cnt: {}, celebrated: 0 }; saveState(st); }
    if (!st.cnt) st.cnt = {};
    return st;
  }
  function saveState(st) { try { store.set(HKEY, JSON.stringify(st)); } catch (e) {} }
  function mark(step, val) { var st = loadState(); st.steps[step] = val ? 1 : 0; saveState(st); }

  function dueCount() {
    var now = Date.now(), c = 0, i, data = S.data || [];
    for (i = 0; i < data.length; i++) { var stt = PT.srs.statusOf(S.rec[keyOf(data[i])], now); if (stt === "due" || stt === "learning") c++; }
    return c;
  }
  function newDoneCount(segs) {
    var seen = {}, n = 0, i;
    for (i = 0; i < segs.length; i++) { var d = segs[i].deck; if (!seen[d]) { seen[d] = 1; try { n += (PT.srs.dayLog(d).n || 0); } catch (e) {} } }
    return n;
  }

  /* day-of-week: plan day if set, else real calendar (Mon=0..Sun=6) */
  function dowOf(day) { if (day) return (day - 1) % 7; return (new Date().getDay() + 6) % 7; }

  /* rotating "major" slot — covers the rest of the app across the week */
  function majorFor(dow, phase) {
    if (dow === 0) return { icon: "📖", t: "เรื่องสั้น 1 เรื่อง + ตอบคำถามท้ายเรื่อง", sub: "อ่าน · แตะดูคำแปล · ฟังเสียง", go: "story", dur: "15 น." };
    if (dow === 1) return { icon: "📚", t: "Reading 1 บท (จับเวลา ~15 นาที)", sub: "บทความ + คำถาม T/F/NG ตรวจอัตโนมัติ", go: "exrd", dur: "18 น." };
    if (dow === 2) return { icon: "🎤", t: "ตอบ cue card + อัดเสียงตัวเอง", sub: "Speaking Part 2 — อัดแล้วฟังหาจุดแก้", go: "exsp", dur: "15 น." };
    if (dow === 3) return { icon: "🎧", t: "ฟังยาว: เล่นบทสนทนาต่อเนื่อง (▶ ทั้งบท)", sub: "หรือ podcast/YouTube นอกแอป + จดคำใหม่", go: "talk", dur: "15 น." };
    if (dow === 4) return { icon: "🎓", t: "รอบรู้วิชาการ 10 คำ + เปิดแผนที่คำ", sub: "เลื่อนอ่าน + แตะคำ → 🗺️ ดูคำเชื่อมโยง", go: "knowledge", dur: "15 น." };
    if (phase <= 1) return { icon: "🎤", t: "พูดเล่าสัปดาห์ของคุณ 1 นาที + อัดเสียง", sub: "ใช้คำที่เรียนสัปดาห์นี้ให้มากที่สุด", go: "exsp", dur: "15 น." };
    return { icon: "✍️", t: "Writing Lab — เขียน + ให้ Claude ตรวจ", sub: "เขียนตามแผน → กดคัดลอกไปให้ตรวจ", go: "exwl", dur: "25 น." };
  }
  /* rotating game slot */
  function gameFor(day) {
    var g = (day || 1) % 3;
    if (g === 1) return { t: "เกมหาที่ผิด 3 ข้อ", go: "game-fix", auto: true };
    if (g === 2) return { t: "เติมคำ (cloze) 3 ข้อ", go: "game-cloze", auto: true };
    return { t: "เกมเติมประโยค 1 รอบ", go: "game-bank", auto: true };
  }

  function buildSteps() {
    var st = loadState(), day = st.day, steps = [], plan = null;
    if (day && PT.plan && PT.plan.build) { try { plan = PT.plan.build(day); } catch (e) { plan = null; } }
    var dow = dowOf(day), phase = plan ? plan.phase : 1;

    if (plan && plan.rest) {
      steps.push({ id: "test", icon: "🎯", t: "แบบทดสอบเบาๆ (ทบทวน + คำที่มักผิด)", sub: "วันพัก — แค่นี้ก็ถือว่าไม่ขาด", must: true, dur: "~7 น.", go: "test" });
      steps.push({ id: "act", icon: "🎤", t: "อัดเสียงพูดทวนทั้งสัปดาห์", sub: "ฟังตัวเอง หาจุดที่จะแก้", must: true, dur: "10 น.", go: null });
      steps.push({ id: "talk", icon: "📖", t: "อ่านเรื่องสั้นเล่นๆ 1 เรื่อง", sub: "พักสมองแบบยังได้ภาษา", must: false, dur: "15 น.", go: "story" });
    } else if (plan && plan.mock) {
      steps.push({ id: "test", icon: "🎯", t: "แบบทดสอบวันนี้", sub: "อุ่นเครื่อง + คำที่มักผิด", must: true, dur: "~7 น.", go: "test" });
      steps.push({ id: "rev", icon: "🔁", t: "เคลียร์การ์ดถึงกำหนด", sub: "", must: true, dur: "≤20 น.", go: "rev" });
      steps.push({ id: "act", icon: "📝", t: "Mock จับเวลา (ตามแผนวันนี้)", sub: "Reading/Writing/Speaking ในแท็บติวสอบ", must: true, dur: "30–60 น.", go: "exhome" });
      steps.push({ id: "note", icon: "🔎", t: "ตรวจข้อผิด + จดลงสมุด", sub: "คำ/จุดที่พลาด เอาไว้ทบทวน", must: false, dur: "15 น.", go: null });
    } else {
      // 1-3: vocabulary core
      steps.push({ id: "test", icon: "🎯", t: "แบบทดสอบวันนี้", sub: "อุ่นเครื่อง + คำที่มักผิด", must: true, dur: "~7 น.", go: "test" });
      steps.push({ id: "rev", icon: "🔁", t: "เคลียร์การ์ดถึงกำหนด", sub: "", must: true, dur: "≤20 น.", go: "rev" });
      if (plan && plan.vocab && plan.vocab.count) {
        var segs = plan.vocab.segs, lbl = [], i;
        for (i = 0; i < segs.length; i++) lbl.push(segs[i].name + " คำที่ " + segs[i].from + "–" + segs[i].to);
        steps.push({ id: "new", icon: "🆕", t: "คำใหม่ " + plan.vocab.count + " คำ", sub: lbl.join(" + "), must: true, dur: "15 น.", go: "new", segs: segs, target: plan.vocab.count });
      } else if (!plan) {
        steps.push({ id: "new", icon: "🆕", t: "เรียนคำใหม่วันนี้", sub: "คลังปัจจุบัน (ตามโควตา/วัน)", must: true, dur: "15 น.", go: "new", segs: [], target: 0 });
      }
      // 4-6: daily skills — every feature, every day
      steps.push({ id: "talk", icon: "💬", t: "สนทนา 1 บท — ฟังแล้วพูดตาม", sub: "แท็บสนทนา · เลือกบทไหนก็ได้", must: true, dur: "8 น.", go: "talk" });
      steps.push({ id: "sent", icon: "✍️", t: "แต่งประโยค 3 ข้อ (ไทย→อังกฤษ)", sub: "คลังประโยค · Quiz โหมดแต่งประโยค", must: true, dur: "7 น.", go: "sent", need: 3 });
      steps.push({ id: "wc", icon: "⚖️", t: "เลือกคำ 1 กลุ่ม (near-synonyms)", sub: "อ่านความต่าง + เล่นเกมของกลุ่มนั้น", must: true, dur: "6 น.", go: "wordchoice" });
      // 7: rotating major (covers เรื่องสั้น/Reading/พูด/ฟัง/รอบรู้วิชาการ/Writing across the week)
      var mj = majorFor(dow, phase);
      steps.push({ id: "act", icon: mj.icon, t: mj.t, sub: mj.sub, must: true, dur: mj.dur, go: mj.go });
      // 8: rotating game (dessert)
      var gm = gameFor(day);
      steps.push({ id: "game", icon: "🎮", t: gm.t, sub: "ปิดท้ายแบบเบาสมอง", must: false, dur: "8 น.", go: gm.go });
    }

    // AUTO checks (persist once true)
    var changed = false, i2;
    for (i2 = 0; i2 < steps.length; i2++) {
      var s = steps[i2];
      if (st.steps[s.id]) { s.done = true; continue; }
      if (s.id === "rev" && dueCount() === 0) { st.steps.rev = 1; s.done = true; changed = true; }
      else if (s.id === "new" && s.target > 0 && s.segs && s.segs.length && newDoneCount(s.segs) >= s.target) { st.steps["new"] = 1; s.done = true; changed = true; }
      else s.done = false;
    }
    if (changed) saveState(st);
    return { steps: steps, plan: plan, st: st };
  }

  /* ---- launching ---- */
  function launch(go, step) {
    _hubBack = true;
    if (go === "test") { if (PT.daily && PT.daily.start) PT.daily.start(); }
    else if (go === "rev") {
      S.filter.status = { due: true, learning: true }; S.filter.groups = {}; S.filter.pos = {}; S.filter.fav = false; S.filter.miss = false; S.filter.q = "";
      S.workingDirty = true; goMode("cards");
    }
    else if (go === "new") {
      var segs = (step && step.segs) || [];
      if (segs.length && segs[0].deck !== S.deck) loadDeck(segs[0].deck);
      S.filter.status = { "new": true }; S.filter.pos = {}; S.filter.fav = false; S.filter.miss = false; S.filter.q = "";
      S.filter.groups = {};
      if (segs.length && segs[0].grp) S.filter.groups[segs[0].grp] = true;
      S.workingDirty = true; goMode("cards");
    }
    else if (go === "talk") { if (PT.talk && PT.talk.setMode) PT.talk.setMode("conv"); goMode("talk"); }
    else if (go === "story") { goMode("talk"); if (PT.talk && PT.talk.setMode) PT.talk.setMode("story"); }
    else if (go === "sent") {
      if (S.deck !== "sentences") loadDeck("sentences");
      S.filter.status = {}; S.filter.groups = {}; S.filter.pos = {}; S.filter.fav = false; S.filter.miss = false; S.filter.q = ""; S.workingDirty = true;
      try { PT.quiz._state.sub = "build"; PT.quiz._state.cur = null; } catch (e) {}
      goMode("quiz");
    }
    else if (go === "wordchoice") { goMode("wordchoice"); }
    else if (go === "knowledge") {
      if (S.deck !== "knowledge") loadDeck("knowledge");
      S.filter.status = {}; S.filter.groups = {}; S.filter.pos = {}; S.filter.fav = false; S.filter.miss = false; S.filter.q = ""; S.workingDirty = true;
      goMode("browse");
    }
    else if (go === "exsp") { if (PT.examprep && PT.examprep.open) PT.examprep.open("sp"); goMode("examprep"); }
    else if (go === "exwl") { if (PT.examprep && PT.examprep.open) PT.examprep.open("wl"); goMode("examprep"); }
    else if (go === "exrd") { if (PT.examprep && PT.examprep.open) PT.examprep.open("rd"); goMode("examprep"); }
    else if (go === "exhome") { if (PT.examprep && PT.examprep.open) PT.examprep.open("home"); goMode("examprep"); }
    else if (go === "game-bank") { try { PT.quiz._state.sub = "bank"; PT.quiz._state.cur = null; } catch (e) {} goMode("quiz"); }
    else if (go === "game-fix") { try { PT.quiz._state.sub = "fix"; PT.quiz._state.cur = null; } catch (e) {} goMode("quiz"); }
    else if (go === "game-cloze") { try { PT.quiz._state.sub = "cloze"; PT.quiz._state.cur = null; } catch (e) {} goMode("quiz"); }
    syncPill();
  }

  /* ---- rendering ---- */
  function render(v) {
    var b = buildSteps(), st = b.st, steps = b.steps, plan = b.plan;
    var h = ['<div class="hb-wrap">'];

    if (!st.day) {
      // distinguish: never started / plan finished / start date in the future
      var sIso = ""; try { sIso = (PT.plan && PT.plan.startIso) ? PT.plan.startIso() : ""; } catch (e) {}
      var rawDiff = null;
      if (sIso) {
        var sp = sIso.split("-");
        if (sp.length === 3) {
          var sd = new Date(+sp[0], +sp[1] - 1, +sp[2]), nw = new Date();
          rawDiff = Math.round((new Date(nw.getFullYear(), nw.getMonth(), nw.getDate()) - sd) / 86400000) + 1;
        }
      }
      if (rawDiff !== null && rawDiff > 540) {
        var dn = 0; try { dn = (PT.plan && PT.plan.doneCount) ? PT.plan.doneCount() : 0; } catch (e) {}
        var stk2 = { longest: 0 }; try { stk2 = PT.srs.streak(); } catch (e) {}
        h.push('<div class="hb-cele"><div class="hb-cele-i">🎓</div><div class="hb-cele-t">จบแผน 540 วันแล้ว!</div>' +
          '<div class="hb-cele-d">ทำไปทั้งหมด ' + dn + ' วัน · streak สูงสุด ' + (stk2.longest || 0) + ' วัน<br>ถึงเวลาสอบจริงแล้ว — หรือกดตั้งวันเริ่มใหม่เพื่อรอบสอง</div></div>');
        h.push('<div class="hb-setup-row" style="margin:0 2px 12px"><input type="date" id="hb-start" value="' + todayISO() + '">' +
          '<button type="button" class="hb-setup-go" data-hb-setstart="1">เริ่มรอบใหม่ ▶</button></div>');
        h.push('<div class="hb-sec">ทบทวนต่อได้ทุกวัน:</div>');
      } else if (rawDiff !== null && rawDiff < 1) {
        h.push('<div class="hb-setup"><div class="hb-setup-t">🗓️ แผนจะเริ่มวันที่ ' + esc(sIso) + '</div>' +
          '<div class="hb-setup-d">หรือเปลี่ยนวันเริ่มเป็นวันนี้เลยก็ได้</div>' +
          '<div class="hb-setup-row"><input type="date" id="hb-start" value="' + todayISO() + '">' +
          '<button type="button" class="hb-setup-go" data-hb-setstart="1">เริ่มแผนวันนี้ ▶</button></div></div>');
        h.push('<div class="hb-sec">ระหว่างนี้ทำได้เลย:</div>');
      } else {
        h.push('<div class="hb-setup"><div class="hb-setup-t">🗓️ ยังไม่ได้ตั้งวันเริ่มแผน 540 วัน</div>' +
          '<div class="hb-setup-d">ตั้งวันเริ่ม แล้วหน้านี้จะบอกทุกอย่างที่ต้องทำของแต่ละวันให้อัตโนมัติ</div>' +
          '<div class="hb-setup-row"><input type="date" id="hb-start" value="' + todayISO() + '">' +
          '<button type="button" class="hb-setup-go" data-hb-setstart="1">เริ่มแผนวันนี้ ▶</button></div>' +
          '<div class="hb-setup-d" style="margin-top:12px">เคยเรียนมาก่อนแล้ว? พิมพ์เลขวันที่คุณอยู่ แล้วข้ามมาต่อได้เลย</div>' +
          '<div class="hb-setup-row"><input type="number" id="hb-startday" min="1" max="540" placeholder="เช่น 240" inputmode="numeric">' +
          '<button type="button" class="hb-setup-go" data-hb-setday="1">ต่อที่วันนี้ ▶</button></div></div>');
        h.push('<div class="hb-sec">ระหว่างนี้ทำได้เลย:</div>');
      }
    } else {
      var dt = new Date(), dstr = "";
      try { dstr = dt.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" }); } catch (e) {}
      var hr = dt.getHours(), gg = hr < 12 ? "สวัสดีตอนเช้า" : (hr < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น");
      var stk = { current: 0 }; try { stk = PT.srs.streak(); } catch (e) {}
      var mustTotal = 0, mustDone = 0, doneAll = 0, total = steps.length, i0;
      for (i0 = 0; i0 < steps.length; i0++) { if (steps[i0].done) doneAll++; if (steps[i0].must) { mustTotal++; if (steps[i0].done) mustDone++; } }
      var allMust = mustTotal > 0 && mustDone >= mustTotal;
      h.push('<div class="hb2-head"><div><div class="hb2-greet">' + gg + ' 👋</div>' +
        '<div class="hb2-date">' + esc(dstr) + ' · Day ' + st.day + (plan ? ' · เฟส ' + plan.phase : '') + '</div></div>' +
        '<div class="hb2-streak">🔥 ' + (stk.current || 0) + (stk.freezes ? ' <span class="hb2-frz" title="ฟรีซกันสตรีคหลุด 1 วัน">❄️' + stk.freezes + '</span>' : '') + '</div></div>');
      var wf = Math.min(stk.current || 0, 7), wd = '', wi;
      for (wi = 0; wi < 7; wi++) wd += '<span class="hb2-dot' + (wi < wf ? ' on' : '') + '"></span>';
      h.push('<div class="hb2-wk"><span>สัปดาห์นี้</span><div class="hb2-dots">' + wd + '</div><span class="hb2-wkn">' + (stk.current || 0) + ' วันติด</span></div>');
      var _bkd = -1; try { if (window.PT && PT.backup && PT.backup.daysSince) _bkd = PT.backup.daysSince(); } catch (e) {}
      if (_bkd < 0 || _bkd >= 14) h.push('<button class="hb-bknudge" data-hb-backup="1">💾 ' +
        (_bkd < 0 ? 'ยังไม่เคยสำรองข้อมูล — แตะเพื่อสำรอง (กันข้อมูลหาย)' : ('สำรองข้อมูลล่าสุด ' + _bkd + ' วันก่อน — แตะเพื่อสำรองใหม่')) + '</button>');
      if (plan && plan.banner) h.push('<div class="hb-banner hb-' + plan.banner.c + '">' + esc(plan.banner.t) + '</div>');
      if (allMust) {
        if (!st.celebrated) { st.celebrated = 1; saveState(st); try { if (PT.plan && PT.plan.setDone) PT.plan.setDone(st.day); } catch (e) {} }
        var tm = ""; try { var nx = PT.plan.build(st.day + 1); tm = nx && nx.focus ? nx.focus : ""; } catch (e) {}
        h.push('<div class="hb-cele hb-pop"><div class="hb-cele-i">🎉</div><div class="hb-cele-t">เรียนครบวันนี้แล้ว!</div>' +
          '<div class="hb-cele-d">🔥 ต่อเนื่อง ' + (stk.current || 0) + ' วัน' + (tm ? '<br>พรุ่งนี้: ' + esc(tm) : '') + '<br>พักได้เลย วันนี้ทำดีมาก</div></div>');
        h.push('<div class="hb-sec">อยากทำต่อไหม? · โบนัส (ไม่บังคับ)</div><div class="hb2-quick">' +
          '<button class="hb2-qc" data-hb-bonus="story"><div class="hb2-qi" style="color:var(--accent)">📖</div><div class="hb2-qt">อ่านเรื่องสั้นอีก 1 เรื่อง</div></button>' +
          '<button class="hb2-qc" data-hb-bonus="game"><div class="hb2-qi" style="color:var(--know)">🎮</div><div class="hb2-qt">เล่นเกมอีก 1 รอบ</div></button></div>');
      } else {
        var pct = total ? Math.round(doneAll / total * 100) : 0, rr = 26, circ = 2 * Math.PI * rr, off = circ * (1 - pct / 100);
        var nextIdx = -1; for (i0 = 0; i0 < steps.length; i0++) { if (!steps[i0].done && steps[i0].go) { nextIdx = i0; break; } }
        h.push('<div class="hb2-hero"><div class="hb2-ring"><svg width="60" height="60" viewBox="0 0 60 60">' +
          '<circle class="hb2-track" cx="30" cy="30" r="' + rr + '"></circle>' +
          '<circle class="hb2-fill" cx="30" cy="30" r="' + rr + '" stroke-dasharray="' + circ + '" stroke-dashoffset="' + off + '"></circle></svg>' +
          '<span class="hb2-pct">' + doneAll + '/' + total + '</span></div>' +
          '<div class="hb2-hx"><b>ทำแล้ว ' + doneAll + ' จาก ' + total + ' อย่าง</b>' +
          (mustDone >= mustTotal ? '<div class="hb2-mvd">✓ ครบขั้นต่ำวันนี้แล้ว</div>' : '<div class="hb2-hs">เหลือขั้นจำเป็นอีก ' + (mustTotal - mustDone) + ' อย่าง</div>') + '</div></div>');
        if (nextIdx >= 0) { var ns = steps[nextIdx]; h.push('<button class="hb2-cta" data-hb-go="' + nextIdx + '">▶ ทำต่อ: ' + esc(ns.t) + '<span>' + esc(ns.dur) + (ns.sub ? ' · ' + esc(ns.sub) : '') + '</span></button>'); }
        h.push('<div class="hb-min">มีเวลาน้อย? ทำ “ขั้นจำเป็น” ก็ถือว่าไม่ขาด 🔥 · ครบชุด ~80 นาที</div>');
      }
    }

    var i, firstUndone = -1;
    for (i = 0; i < steps.length; i++) { if (!steps[i].done) { firstUndone = i; break; } }
    for (i = 0; i < steps.length; i++) {
      var s = steps[i];
      var sub = s.sub;
      if (s.id === "rev") { var dc = dueCount(); sub = dc > 0 ? ("เหลือ " + dc + " ใบ") : "ไม่มีการ์ดค้างแล้ว 🎉"; }
      if (s.need && !s.done) { var c = (st.cnt && st.cnt[s.id]) || 0; if (c > 0) sub = sub + " · ทำแล้ว " + c + "/" + s.need; }
      var curr = (i === firstUndone);
      var right = s.done ? '<div class="hb-ck on">✓</div>'
        : (curr ? '<button type="button" class="hb-go" data-hb-go="' + i + '">เริ่ม ▶</button>'
          : (s.go ? '<button type="button" class="hb-chev" data-hb-go="' + i + '" aria-label="เริ่ม">›</button>' : '') +
            '<button type="button" class="hb-ck" data-hb-ck="' + s.id + '" aria-label="ทำแล้ว"></button>');
      h.push('<div class="hb-step' + (s.done ? " done" : "") + (curr ? " cur" : "") + '">' +
        '<div class="hb-ic">' + s.icon + '</div>' +
        '<div class="hb-b"><div class="hb-t">' + esc(s.t) + '</div>' +
        '<div class="hb-sub">' + esc(s.dur) + ' · ' + (s.must ? '<b>จำเป็น</b>' : 'เสริม') + (sub ? ' · ' + esc(sub) : '') + '</div></div>' +
        '<div class="hb-r">' + right + '</div></div>');
    }
    h.push('<div class="hb-sec">เรียนเพิ่ม (ไม่บังคับ)</div>');
    h.push('<button class="hb-struct" data-hb-struct="1"><span class="hb-struct-i">📐</span>' +
      '<span class="hb-struct-b"><b>โครงสร้างประโยควันนี้</b><em>เรียน 1 โครงสร้าง แล้วลองฝึก · มีทั้งหมด 273 อัน</em></span>' +
      '<span class="hb-struct-go">เปิด ›</span></button>');
    h.push('<div class="hb-sec">ไปที่อื่น</div><div class="hb2-quick">' +
      '<button class="hb2-qc" data-hb-nav="browse"><div class="hb2-qi" style="color:var(--accent)">📚</div><div class="hb2-qt">คลังคำ</div></button>' +
      '<button class="hb2-qc" data-hb-nav="prachub"><div class="hb2-qi" style="color:var(--know)">✏️</div><div class="hb2-qt">ฝึก</div></button>' +
      '<button class="hb2-qc" data-hb-nav="examprep"><div class="hb2-qi" style="color:var(--muted)">🎓</div><div class="hb2-qt">อ่าน·พูด·สอบ</div></button>' +
      '<button class="hb2-qc" data-hb-nav="stats"><div class="hb2-qi" style="color:var(--muted)">👤</div><div class="hb2-qt">ของฉัน</div></button>' +
      '</div>');
    h.push('</div>');
    v.innerHTML = h.join("");

    var go = v.querySelectorAll("[data-hb-go]");
    for (i = 0; i < go.length; i++) (function (btn) {
      btn.onclick = function () { var s = steps[parseInt(btn.getAttribute("data-hb-go"), 10)]; launch(s.go, s); };
    })(go[i]);
    var cks = v.querySelectorAll("[data-hb-ck]");
    for (i = 0; i < cks.length; i++) (function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-hb-ck"), cur = loadState();
        mark(id, !cur.steps[id]); draw();
      };
    })(cks[i]);
    [].forEach.call(v.querySelectorAll("[data-hb-nav]"), function (b) {
      b.onclick = function () { _hubBack = false; goMode(b.getAttribute("data-hb-nav")); };
    });
    [].forEach.call(v.querySelectorAll("[data-hb-struct]"), function (b) {
      b.onclick = function () {
        _hubBack = true;
        if (window.PT && PT.structure && PT.structure.openDay) PT.structure.openDay(st.day || 1);
        try { syncPill(); } catch (e) {}
      };
    });
    [].forEach.call(v.querySelectorAll("[data-hb-backup]"), function (b) {
      b.onclick = function () { _hubBack = false; goMode("stats"); };
    });
    [].forEach.call(v.querySelectorAll("[data-hb-bonus]"), function (b) {
      b.onclick = function () {
        _hubBack = true;
        if (b.getAttribute("data-hb-bonus") === "story") { goMode("talk"); if (PT.talk && PT.talk.setMode) PT.talk.setMode("story"); }
        else { try { PT.quiz._state.sub = "bank"; PT.quiz._state.cur = null; } catch (e) {} goMode("quiz"); }
        syncPill();
      };
    });
    var ss = document.getElementById("hb-start");
    var sg = v.querySelector("[data-hb-setstart]");
    if (sg) sg.onclick = function () {
      var val = ss ? ss.value : todayISO();
      try { if (PT.plan && PT.plan.setStart) PT.plan.setStart(val); } catch (e) {}
      try { store.set(HKEY, "null"); } catch (e) {}
      draw();
    };
    var sdInput = document.getElementById("hb-startday");
    var sdBtn = v.querySelector("[data-hb-setday]");
    if (sdBtn) sdBtn.onclick = function () {
      var n = sdInput ? parseInt(sdInput.value, 10) : 0;
      if (!(n >= 1 && n <= 540)) { if (sdInput) { sdInput.focus(); } return; }
      try { if (PT.plan && PT.plan.setStartByDay) PT.plan.setStartByDay(n); } catch (e) {}
      try { store.set(HKEY, "null"); } catch (e) {}
      draw();
    };
  }

  function draw() { var v = document.getElementById("view"); if (v && S.mode === "todayhub") render(v); }

  /* ---- return-to-hub pill ---- */
  function ensurePill() {
    var p = document.getElementById("hub-pill");
    if (!p) {
      p = document.createElement("button");
      p.id = "hub-pill"; p.type = "button"; p.className = "hb-pill"; p.textContent = "‹ กลับสู่วันนี้";
      p.onclick = function () { goMode("todayhub"); };
      document.body.appendChild(p);
    }
    return p;
  }
  function syncPill() {
    var p = ensurePill();
    p.style.display = (_hubBack && S.mode !== "todayhub") ? "block" : "none";
  }
  (function () {
    var tb = document.querySelector(".tabbar");
    if (tb) tb.addEventListener("click", function () { _hubBack = false; setTimeout(syncPill, 0); });
  })();

  function notify(step) { mark(step, 1); if (S.mode === "todayhub") draw(); }
  // increment a counted step (e.g. แต่งประโยค 3 ข้อ) — marks done when the target is reached
  function bumpStep(step, need) {
    var st = loadState();
    st.cnt[step] = (st.cnt[step] || 0) + 1;
    if (st.cnt[step] >= (need || 1)) st.steps[step] = 1;
    saveState(st);
    if (S.mode === "todayhub") draw();
  }
  function start() { _hubBack = false; goMode("todayhub"); }

  return { start: start, render: render, notify: notify, bumpStep: bumpStep, syncPill: syncPill, leave: function () {} };
})();
