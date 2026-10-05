/* PT.examprep — "ติวสอบ (IELTS/TOEFL)" tab: Speaking (Part 1/2/3) + Writing (Task 1/2).
   ES5. Uses globals: esc, speak. Lazy-loads data/exam.json. */
(function () {
  "use strict";
  window.PT = window.PT || {};

  var DATA = null, loading = false;
  var view = "home";     // home | sp | wr | rd
  var spSub = "part2";   // part1 | part2 | part3
  var spSel = -1;        // selected Part-2 cue card
  var wrSub = "task1";   // task1 | task2
  var rev = {};          // reveal toggles (keyed strings)
  // Writing Lab (write + get graded by Claude)
  var wlTask = "task2";  // task1 | task2
  var wlPi = { task1: 0, task2: 0 };  // current prompt index per task
  var wlSec = 0, wlTimer = null;      // timer elapsed seconds + interval id
  // Reading practice
  var RDATA = null, rdLoading = false;
  var rdSel = -1;        // selected passage index
  var rdAns = {};        // qi -> chosen value
  var rdDone = false;    // submitted?

  function load(cb) {
    if (DATA) { cb(); return; }
    if (loading) return;
    loading = true;
    fetch("data/exam.json").then(function (r) { return r.json(); }).then(function (d) {
      DATA = d; loading = false; cb();
    }).catch(function () {
      loading = false;
      var v = document.getElementById("view");
      if (v) v.innerHTML = '<div class="empty">โหลดข้อมูลไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>';
    });
  }

  function loadReading(cb) {
    if (RDATA) { cb(); return; }
    if (rdLoading) return;
    rdLoading = true;
    fetch("data/reading.json").then(function (r) { return r.json(); }).then(function (d) {
      RDATA = d; rdLoading = false; cb();
    }).catch(function () {
      rdLoading = false;
      var v = document.getElementById("view");
      if (v) v.innerHTML = '<div class="empty">โหลดบทอ่านไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>';
    });
  }

  function render(v) {
    if (view === "rd") { renderReading(v); return; }
    if (view === "wl") { renderWL(v); return; }
    if (!DATA) { v.innerHTML = '<div class="empty">กำลังโหลด…</div>'; load(function () { render(v); }); return; }
    if (view === "sp") renderSpeaking(v);
    else if (view === "wr") renderWriting(v);
    else renderHome(v);
  }

  function bar(title) {
    return '<div class="ex-bar"><button class="ex-back" id="ex-back">‹ กลับ</button><div class="ex-title">' + esc(title) + '</div></div>';
  }
  function speakBtn(text) { return '<button class="ex-spk" data-say="' + esc(text) + '" aria-label="ฟัง">🔊</button>' +
    '<button class="ex-spk" data-slow="' + esc(text) + '" aria-label="อ่านช้า">🐢</button>'; }

  function renderHome(v) {
    var h = ['<div class="ex-wrap">'];
    h.push('<div class="ex-hero">🎓 อ่าน · พูด · สอบ</div>');
    h.push('<div class="ex-sec-h" style="margin-top:2px">📚 อ่าน & ฟัง</div>');
    h.push('<button class="ex-home-card" data-go2="talk-conv"><div class="ex-hc-i">💬</div><div><div class="ex-hc-t">สนทนา</div>' +
      '<div class="ex-hc-d">500 บทบาทสมมติ — ฟังแล้วพูดตาม · ฝึกจริงในชีวิต</div></div></button>');
    h.push('<button class="ex-home-card" data-go2="talk-story"><div class="ex-hc-i">📖</div><div><div class="ex-hc-t">เรื่องสั้น</div>' +
      '<div class="ex-hc-d">80 เรื่อง A2–C1 — อ่าน · แตะดูคำแปล · ตอบคำถาม</div></div></button>');
    h.push('<button class="ex-home-card" data-go2="shapes"><div class="ex-hc-i">🎧</div><div><div class="ex-hc-t">โครงเสียง</div>' +
      '<div class="ex-hc-d">623 ประโยค — ฟังเสียงพูดเร็วแล้วทายว่าเขาถามอะไร · ทุกโครงสร้าง ทุกสรรพนาม</div></div></button>');
    h.push('<div class="ex-sec-h">🎓 ติวสอบ IELTS / TOEFL</div>');
    h.push('<button class="ex-home-card" data-go="sp"><div class="ex-hc-i">🗣️</div><div><div class="ex-hc-t">Speaking</div>' +
      '<div class="ex-hc-d">Part 1 · Part 2 (พูด 2 นาที) · Part 3 + ตัวอย่างแบนด์สูง</div></div></button>');
    h.push('<button class="ex-home-card" data-go="wr"><div class="ex-hc-i">✍️</div><div><div class="ex-hc-t">Writing</div>' +
      '<div class="ex-hc-d">Task 1 & Task 2 — โครงสร้าง · คลังวลี · เรียงความตัวอย่าง</div></div></button>');
    h.push('<button class="ex-home-card" data-go="rd"><div class="ex-hc-i">📖</div><div><div class="ex-hc-t">Reading</div>' +
      '<div class="ex-hc-d">บทความวิชาการ + คำถาม (T/F/NG · ตัวเลือก · เติมคำ) จับเวลา + ตรวจอัตโนมัติ + เฉลย</div></div></button>');
    h.push('</div>');
    v.innerHTML = h.join("");
    [].forEach.call(v.querySelectorAll(".ex-home-card"), function (b) {
      b.onclick = function () {
        var g2 = b.getAttribute("data-go2");
        if (g2 === "shapes") { goMode("shapes"); return; }
        if (g2 === "talk-conv") { if (PT.talk && PT.talk.setMode) PT.talk.setMode("conv"); goMode("talk"); return; }
        if (g2 === "talk-story") { goMode("talk"); if (PT.talk && PT.talk.setMode) PT.talk.setMode("story"); return; }
        view = b.getAttribute("data-go"); spSel = -1; render(v);
      };
    });
  }

  function subChips(subs, active, attr) {
    var h = '<div class="ex-subs">';
    for (var i = 0; i < subs.length; i++) h += '<button class="ex-sub' + (subs[i].k === active ? " on" : "") + '" ' + attr + '="' + subs[i].k + '">' + esc(subs[i].t) + '</button>';
    return h + '</div>';
  }

  /* ---------------- Speaking ---------------- */
  function renderSpeaking(v) {
    var sp = DATA.speaking || {};
    // Part-2 cue card detail
    if (spSub === "part2" && spSel >= 0 && sp.part2 && sp.part2[spSel]) return renderCue(v, sp.part2[spSel]);
    var h = ['<div class="ex-wrap">'];
    h.push(bar("Speaking"));
    if (sp.intro_th) h.push('<div class="ex-intro">' + esc(sp.intro_th) + '</div>');
    h.push(subChips([{ k: "part1", t: "Part 1" }, { k: "part2", t: "Part 2" }, { k: "part3", t: "Part 3" }], spSub, "data-sp"));
    if (spSub === "part1") {
      var p1 = sp.part1 || [];
      for (var i = 0; i < p1.length; i++) {
        h.push('<div class="ex-topic">' + esc(p1[i].topic_en) + ' <span>' + esc(p1[i].topic_th || "") + '</span></div>');
        for (var j = 0; j < p1[i].qs.length; j++) {
          var q = p1[i].qs[j], k = "p1_" + i + "_" + j;
          h.push('<div class="ex-qa"><div class="ex-q">Q: ' + esc(q.q) + '</div>' +
            '<button class="ex-reveal" data-rev="' + k + '">' + (rev[k] ? esc(q.sample) + " " + speakBtn(q.sample) : "แตะดูตัวอย่างคำตอบ") + '</button></div>');
        }
      }
    } else if (spSub === "part2") {
      var p2 = sp.part2 || [];
      h.push('<div class="ex-intro">เลือกหัวข้อ → ฝึกพูดคนเดียว ~2 นาที ตามการ์ด แล้วดูตัวอย่าง</div>');
      for (var m = 0; m < p2.length; m++) h.push('<button class="ex-cue" data-cue="' + m + '">' + esc(p2[m].title) + '</button>');
    } else {
      var p3 = sp.part3 || [];
      for (var t = 0; t < p3.length; t++) {
        h.push('<div class="ex-topic">' + esc(p3[t].topic_en) + ' <span>' + esc(p3[t].topic_th || "") + '</span></div>');
        for (var u = 0; u < p3[t].qs.length; u++) {
          var qq = p3[t].qs[u], kk = "p3_" + t + "_" + u;
          h.push('<div class="ex-qa"><div class="ex-q">Q: ' + esc(qq.q) + '</div>' +
            '<button class="ex-reveal" data-rev="' + kk + '">' + (rev[kk] ? esc(qq.model) + " " + speakBtn(qq.model) : "แตะดูตัวอย่างคำตอบ") + '</button></div>');
        }
      }
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    wireCommon(v);
    [].forEach.call(v.querySelectorAll("[data-sp]"), function (b) { b.onclick = function () { spSub = b.getAttribute("data-sp"); render(v); }; });
    [].forEach.call(v.querySelectorAll("[data-cue]"), function (b) { b.onclick = function () { spSel = parseInt(b.getAttribute("data-cue"), 10); render(v); }; });
  }

  function renderCue(v, c) {
    var h = ['<div class="ex-wrap">'];
    h.push('<div class="ex-bar"><button class="ex-back" id="ex-cueback">‹ หัวข้ออื่น</button><div class="ex-title">Part 2</div></div>');
    h.push('<div class="ex-cuecard"><div class="ex-cue-t">' + esc(c.title) + '</div><div class="ex-cue-say">You should say:</div><ul>');
    for (var i = 0; i < c.card.length; i++) h.push('<li>' + esc(c.card[i]) + '</li>');
    h.push('</ul></div>');
    h.push('<button class="ex-reveal ex-reveal-big" data-rev="cue_model">' + (rev.cue_model ? esc(c.model) + " " + speakBtn(c.model) : "🎧 แตะดูตัวอย่างคำตอบแบนด์สูง") + '</button>');
    if (c.phrases && c.phrases.length) {
      h.push('<div class="ex-phrasebox"><div class="ex-ph-h">วลีที่ใช้ได้</div>');
      for (var j = 0; j < c.phrases.length; j++) h.push('<div class="ex-ph"><span class="ex-ph-en">' + esc(c.phrases[j].en) + '</span><span class="ex-ph-th">' + esc(c.phrases[j].th) + '</span></div>');
      h.push('</div>');
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    document.getElementById("ex-cueback").onclick = function () { spSel = -1; render(v); };
    wireCommon(v);
  }

  /* ---------------- Writing ---------------- */
  function renderWriting(v) {
    var w = (DATA.writing || {})[wrSub] || {};
    var h = ['<div class="ex-wrap">'];
    h.push(bar("Writing"));
    h.push('<button class="wl-enter" data-go-wl="1">✍️ ฝึกเขียนจริง + ให้ Claude ตรวจ <span>เขียน → จับเวลา → คัดลอกไปให้ Claude ให้คะแนน band</span></button>');
    h.push(subChips([{ k: "task1", t: "Task 1" }, { k: "task2", t: "Task 2" }], wrSub, "data-wr"));
    if (w.intro_th) h.push('<div class="ex-intro">' + esc(w.intro_th) + '</div>');
    // structure / types
    var st = w.structure || w.types;
    if (st) {
      h.push('<div class="ex-sec-h">📐 โครงสร้าง</div>');
      for (var i = 0; i < st.length; i++) {
        var s = st[i];
        h.push('<div class="ex-step"><div class="ex-step-h">' + esc(s.h || s.name_th || "") + '</div><div class="ex-step-d">' + esc(s.d || s.structure_th || "") + '</div></div>');
      }
    }
    // phrase banks
    if (w.phrases) {
      h.push('<div class="ex-sec-h">🧰 คลังวลี</div>');
      for (var g = 0; g < w.phrases.length; g++) {
        var grp = w.phrases[g];
        h.push('<div class="ex-pgroup"><div class="ex-pgroup-h">' + esc(grp.g) + '</div>');
        for (var p = 0; p < grp.items.length; p++) h.push('<div class="ex-ph"><span class="ex-ph-en">' + esc(grp.items[p].en) + '</span><span class="ex-ph-th">' + esc(grp.items[p].th) + '</span></div>');
        h.push('</div>');
      }
    }
    // samples
    if (w.samples) {
      h.push('<div class="ex-sec-h">📄 ตัวอย่างเรียงความ</div>');
      for (var m = 0; m < w.samples.length; m++) {
        var sm = w.samples[m], key = "wr_" + wrSub + "_" + m;
        h.push('<div class="ex-sample"><div class="ex-sample-t">' + esc(sm.title) + '</div>');
        if (sm.prompt) h.push('<div class="ex-sample-p">โจทย์: ' + esc(sm.prompt) + '</div>');
        h.push('<button class="ex-reveal" data-rev="' + key + '">' + (rev[key] ? "" : "แตะดูเรียงความตัวอย่าง") + '</button>');
        if (rev[key]) h.push('<div class="ex-essay">' + esc(sm.essay).replace(/\n/g, "<br>") + '</div>');
        h.push('</div>');
      }
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    wireCommon(v);
    [].forEach.call(v.querySelectorAll("[data-wr]"), function (b) { b.onclick = function () { wrSub = b.getAttribute("data-wr"); render(v); }; });
    var gowl = v.querySelector("[data-go-wl]");
    if (gowl) gowl.onclick = function () { wlTask = wrSub; view = "wl"; render(v); };
  }

  /* ---------------- Writing Lab (write + Claude grades) ---------------- */
  var WL_META = {
    task1: { words: 150, min: 20, label: "Task 1", tip_th: "บรรยาย/สรุปข้อมูลอย่างเป็นกลาง — ห้ามออกความเห็นหรือบอกสาเหตุ" },
    task2: { words: 250, min: 40, label: "Task 2", tip_th: "เรียงความเชิงโต้แย้ง — จุดยืนชัด + เหตุผล + ตัวอย่างสนับสนุน" }
  };
  var WL_PROMPTS = {
    task2: [
      "Some people believe that unpaid community service should be a compulsory part of high school programmes. To what extent do you agree or disagree?",
      "Some people think the government should pay for healthcare and education, while others believe it is the responsibility of individuals. Discuss both views and give your own opinion.",
      "In many countries people now travel and work abroad. Do the advantages of this development outweigh the disadvantages?",
      "In many cities, traffic congestion and air pollution are becoming serious problems. What are the causes, and what measures could solve these problems?",
      "Many people today spend a lot of time on social media. Why is this the case? Is it a positive or negative development?",
      "Some say the best way to reduce crime is to give longer prison sentences. Others think there are better alternatives. Discuss both views and give your opinion.",
      "Nowadays more people decide to have children later in life. What are the reasons? Do the advantages outweigh the disadvantages?",
      "Some believe children should begin formal education at a very early age; others think they should not start school until at least seven. Discuss both views and give your own opinion.",
      "Technology is making people less creative. To what extent do you agree or disagree?",
      "Some people think university education should be free for all students; others think students should pay for it. Discuss both views and give your opinion.",
      "Many employees now work from home using modern technology. Do the benefits of working from home outweigh the drawbacks?",
      "In some countries the amount of crime committed by teenagers is increasing. What are the causes, and what solutions can you suggest?",
      "Global tourism has grown enormously in recent decades. Why is this? What problems can it cause, and how might they be reduced?",
      "Some people think a country should produce and consume its own food rather than importing food from other countries. To what extent do you agree or disagree?",
      "Some think that museums should focus on the art and history of their own country rather than works from other parts of the world. To what extent do you agree or disagree?",
      "In many countries, plastic waste has become a serious environmental problem. What are the causes, and what can individuals and governments do about it?",
      "Some people believe children learn best through play, while others think formal lessons are more effective. Discuss both views and give your own opinion.",
      "More and more people are choosing to eat less meat. Why might this be? Is it a positive or negative development?",
      "Some employers value personal qualities over qualifications when hiring. To what extent do you agree or disagree?",
      "In many places, people are living longer than before. What problems can an ageing population cause, and what solutions can you suggest?",
      "Online shopping is replacing shopping in physical stores. Do the advantages of this trend outweigh the disadvantages?",
      "Some people think schools should teach practical life skills such as cooking and managing money. To what extent do you agree or disagree?",
      "Many young people today want to become famous. Why is this? Is fame a good goal to pursue?",
      "Some believe public transport should be free for everyone. Discuss the advantages and disadvantages of this idea and give your opinion.",
      "International sporting events such as the Olympics cost enormous amounts of money. Is this money well spent? Give your opinion.",
      "Some people prefer to live in one place all their lives, while others like to move frequently. Discuss both views and give your own opinion.",
      "Artificial intelligence is taking over many jobs that humans used to do. What problems might this cause, and how can societies prepare?",
      "Some parents give children money for doing household chores. Is this a good way to teach children about money? Give your opinion.",
      "Many cities are building more high-rise apartments instead of houses. Do the advantages of this development outweigh the disadvantages?",
      "Some people say that listening to music from other countries helps us understand other cultures. To what extent do you agree or disagree?"
    ],
    task1: [
      "The table shows the percentage of households with internet access in four countries in 2005 and 2020: Japan 60%→95%, Germany 55%→92%, Brazil 20%→70%, Nigeria 5%→40%. Summarise the main features and make comparisons.",
      "The bar chart shows the average hours per week men and women spent on housework in one country in 1990 and 2020: women 25→18 hours, men 8→14 hours. Summarise and compare.",
      "The line graph shows the population (millions) of three cities from 1970 to 2020: City A 2→8, City B 5→6, City C 1→9. Report the main trends and comparisons.",
      "The pie charts show how a family spent its monthly budget in 1980 vs 2020. 1980: food 40%, housing 20%, transport 10%, other 30%. 2020: food 20%, housing 35%, transport 15%, other 30%. Summarise and compare.",
      "The table shows daily water usage per person (litres) in four countries: A 350, B 200, C 150, D 40. Summarise the information and make comparisons.",
      "The process diagram shows how paper is recycled: used paper is collected → sorted → shredded → mixed with water into pulp → cleaned → pressed and dried into new paper → sent to shops. Summarise the process.",
      "The line graph shows unemployment rates (%) in two regions from 2000 to 2020: Region A fell from 10% to 4%; Region B rose from 3% to 8%. Report the main trends.",
      "The bar chart shows the percentage of people using four types of transport to get to work in 2000 and 2020: car 55%→40%, bus 20%→18%, bicycle 5%→22%, train 20%→20%. Summarise and compare.",
      "The maps show a town centre in 1990 and today. In 1990 there was a car park, a cinema and small shops. Today the car park is a shopping mall, the cinema remains, and the small shops have been replaced by a bus station and a park. Summarise the changes.",
      "The line graph shows average monthly rainfall (mm) in two cities over a year: City A peaks at 300mm in September and falls to 20mm in February; City B stays between 80mm and 120mm all year. Summarise the main features and compare.",
      "The bar chart shows the percentage of adults who exercised regularly in 2010 and 2022, by age group: 18-30 rose 40%→55%, 31-50 rose 30%→45%, over-50 rose 15%→35%. Summarise and compare.",
      "The table shows average commuting time (minutes) in four cities: Tokyo 48, Bangkok 62, Berlin 32, Sydney 38. Summarise the information and make comparisons.",
      "The pie charts show sources of electricity in one country in 2000 vs 2020. 2000: coal 60%, gas 25%, hydro 10%, renewables 5%. 2020: coal 25%, gas 30%, hydro 15%, renewables 30%. Summarise the changes.",
      "The process diagram shows how instant coffee is produced: beans are harvested → roasted → ground → brewed into concentrate → freeze-dried into granules → packaged and shipped. Describe the process.",
      "The line graph shows the number of international tourists (millions) visiting a country from 1990 to 2020: rising steadily from 5 to 35, with a sharp drop to 8 in 2020. Report the main trends.",
      "The bar chart shows hours per week spent on housework by full-time workers in 1985 and 2020: men 5→12, women 28→16. Summarise and compare.",
      "The table shows smartphone ownership (%) by age group in 2015 and 2023: 18-29 (85%→98%), 30-49 (75%→95%), 50-64 (50%→85%), 65+ (20%→60%). Summarise the main features.",
      "The maps show a small island before and after tourist development. Before: only beaches, trees and a fishing village. After: a hotel, restaurant, pier for boats, and a paved road linking them; the village and most trees remain. Describe the changes.",
      "The process diagram shows the life cycle of a butterfly: eggs are laid on a leaf → caterpillar hatches and feeds → forms a chrysalis → adult butterfly emerges → lays eggs again. Describe the cycle.",
      "The bar chart shows average house prices (in thousands) in three cities in 2005, 2015 and 2025: City A 150/300/450, City B 200/250/280, City C 100/180/350. Summarise and compare the trends."
    ]
  };
  var WL_BANDS = [
    { c: "Task Response — ตอบโจทย์", b6: "ตอบครบทุกส่วน แต่บางจุดกว้าง/พัฒนาไม่ลึก; จุดยืนพอเห็น", b7: "ตอบครบชัดเจน จุดยืนคงเส้นตลอด ไอเดียหลักพัฒนาดี (T1: เลือก highlight ข้อมูลเด่นครบ)" },
    { c: "Coherence & Cohesion — การเชื่อมโยง", b6: "จัดลำดับเป็นระบบ; ตัวเชื่อมกลไก/ซ้ำบ้าง; ย่อหน้าไม่สมบูรณ์บ้าง", b7: "ลื่นไหล; ตัวเชื่อมหลากหลายถูกที่; แต่ละย่อหน้ามีใจความหลักชัด" },
    { c: "Lexical Resource — คลังคำ", b6: "คำพอสื่อสารได้ มีคำผิด/ไม่เหมาะบ้างแต่ไม่สับสน", b7: "คำหลากหลาย มี collocation/คำยากขึ้น ผิดเล็กน้อย" },
    { c: "Grammar — ไวยากรณ์", b6: "ผสมประโยคง่าย+ซับซ้อน มีจุดผิดหลายที่แต่ยังสื่อความได้", b7: "โครงสร้างหลากหลาย ประโยคจำนวนมากไม่มีข้อผิด ผิดเป็นบางจุด" }
  ];
  var WL_CHECK = {
    task1: [
      "ย่อหน้าเปิด: paraphrase โจทย์ว่ากราฟ/ตารางแสดงอะไร (อย่าลอกคำเดิม)",
      "มี Overview: ภาพรวม/แนวโน้มเด่น 1–2 ประโยค (ห้ามใส่ตัวเลขในนี้)",
      "ย่อหน้าเนื้อหา: เลือกข้อมูลเด่น + ตัวเลขสนับสนุน + เปรียบเทียบ",
      "ไม่ออกความเห็นส่วนตัว / ไม่เดาสาเหตุ",
      "อย่างน้อย 150 คำ"
    ],
    task2: [
      "ย่อหน้าเปิด: paraphrase โจทย์ + ระบุจุดยืน/โครงเรื่อง",
      "แต่ละย่อหน้าเนื้อหามี 1 ใจความหลัก + อธิบาย + ตัวอย่าง",
      "ตอบครบทุกส่วน (ถ้ามี 2 คำถาม ตอบทั้งคู่)",
      "ย่อหน้าสรุปที่ย้ำจุดยืน",
      "อย่างน้อย 250 คำ + ตัวเชื่อมหลากหลาย (อย่าใช้ Moreover/Furthermore ซ้ำๆ)"
    ]
  };

  function wlCount(t) { var s = String(t || "").replace(/^\s+|\s+$/g, ""); return s ? s.split(/\s+/).length : 0; }
  function wlDraftKey() { return "pt_wl_draft_" + wlTask; }
  function fmtClock(s) { var m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? "0" : "") + m + ":" + (ss < 10 ? "0" : "") + ss; }
  function stopTimer() { if (wlTimer) { clearInterval(wlTimer); wlTimer = null; } }
  function toggleTimer() {
    if (wlTimer) stopTimer();
    else wlTimer = setInterval(function () { wlSec++; var c = document.getElementById("wl-clock"); if (c) c.textContent = fmtClock(wlSec); }, 1000);
    var b = document.getElementById("wl-timer"); if (b) b.textContent = wlTimer ? "⏸ หยุด" : "▶ จับเวลา";
  }
  function copyText(s) {
    var ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(s); ok = true; } } catch (e) {}
    if (!ok) { try { var ta = document.createElement("textarea"); ta.value = s; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); ok = !!(document.execCommand && document.execCommand("copy")); document.body.removeChild(ta); } catch (e) {} }
    return ok;
  }
  function copyForGrading(prompt, essay, meta) {
    var msg = document.getElementById("wl-msg"); essay = String(essay || "").replace(/^\s+|\s+$/g, "");
    if (!essay) { msg.textContent = "ยังไม่มีข้อความ — เขียนก่อนแล้วค่อยคัดลอก"; return; }
    var crit = meta.label === "Task 1" ? "Task Achievement" : "Task Response";
    var out = "You are an experienced IELTS examiner. Grade my IELTS Writing " + meta.label +
      " answer strictly against the four official band descriptors: " + crit +
      ", Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy. " +
      "Give a band score (0.5 increments) for EACH criterion and an OVERALL band. Then (1) list my most important errors with corrections, (2) explain what is limiting my band, and (3) show a Band 8 rewrite. Be honest and specific — do not inflate the score.\n\n" +
      "PROMPT (" + meta.label + ", target " + meta.words + "+ words):\n" + prompt + "\n\nMY ANSWER (" + wlCount(essay) + " words):\n" + essay;
    var ok = copyText(out);
    var box = document.getElementById("wl-out"); if (box) { box.value = out; box.style.display = "block"; try { box.focus(); box.select(); } catch (e) {} }
    msg.innerHTML = (ok ? "✅ คัดลอกแล้ว! " : "") + "ไปวางในแชต Claude แล้วส่ง → ผมจะให้คะแนน band ทั้ง 4 เกณฑ์ + จุดที่ต้องแก้ + ฉบับ Band 8" + (ok ? "" : " (คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความในกล่องด้านล่างแล้วคัดลอกเอง)");
  }

  function renderWL(v) {
    var meta = WL_META[wlTask], prompts = WL_PROMPTS[wlTask];
    var pi = wlPi[wlTask] % prompts.length, prompt = prompts[pi];
    var draft = store.get(wlDraftKey()) || "", wc = wlCount(draft);
    var h = ['<div class="ex-wrap">'];
    h.push('<div class="ex-bar"><button class="ex-back" id="wl-back">‹ Writing</button><div class="ex-title">ฝึกเขียน + ตรวจ</div></div>');
    h.push(subChips([{ k: "task1", t: "Task 1" }, { k: "task2", t: "Task 2" }], wlTask, "data-wlt"));
    h.push('<div class="wl-meta"><span>🎯 ' + meta.words + '+ คำ</span><span>⏱ ' + meta.min + ' นาที</span>' +
      '<span class="wl-clock" id="wl-clock">' + fmtClock(wlSec) + '</span>' +
      '<button class="wl-tbtn" id="wl-timer">' + (wlTimer ? "⏸ หยุด" : "▶ จับเวลา") + '</button>' +
      '<button class="wl-tbtn" id="wl-treset">↺</button></div>');
    h.push('<div class="wl-prompt"><div class="wl-plabel">โจทย์ (' + meta.label + ') · ' + esc(meta.tip_th) + '</div>' +
      '<div class="wl-ptext">' + esc(prompt) + '</div><button class="wl-shuffle" id="wl-shuffle">🔀 สุ่มโจทย์ใหม่</button></div>');
    h.push('<textarea class="wl-ta" id="wl-ta" placeholder="เริ่มเขียนที่นี่… (บันทึกอัตโนมัติ)" spellcheck="false">' + esc(draft) + '</textarea>');
    h.push('<div class="wl-count"><span id="wl-wc" class="' + (wc < meta.words ? "low" : "ok") + '">' + wc + ' คำ</span> / ' + meta.words + ' คำ</div>');
    h.push('<button class="wl-copy" id="wl-copy">📋 คัดลอกไปให้ Claude ตรวจให้คะแนน</button>');
    h.push('<div class="wl-msg" id="wl-msg"></div>');
    h.push('<textarea class="wl-out" id="wl-out" readonly style="display:none"></textarea>');
    h.push('<div class="ex-sec-h">📊 เกณฑ์ให้คะแนน (เช็คตัวเองก่อนส่ง)</div>');
    for (var i = 0; i < WL_BANDS.length; i++) {
      var bd = WL_BANDS[i], key = "wlb_" + i;
      h.push('<button class="ex-reveal" data-rev="' + key + '"><b>' + esc(bd.c) + '</b>' + (rev[key] ? '' : ' — แตะดู Band 6 / 7') + '</button>');
      if (rev[key]) h.push('<div class="wl-band"><div><b>Band 6:</b> ' + esc(bd.b6) + '</div><div><b>Band 7:</b> ' + esc(bd.b7) + '</div></div>');
    }
    h.push('<div class="ex-sec-h">✅ เช็คลิสต์ก่อนส่ง</div><ul class="wl-check">');
    var chk = WL_CHECK[wlTask];
    for (var c = 0; c < chk.length; c++) h.push('<li>' + esc(chk[c]) + '</li>');
    h.push('</ul></div>');
    v.innerHTML = h.join("");
    document.getElementById("wl-back").onclick = function () { view = "wr"; render(v); };
    [].forEach.call(v.querySelectorAll("[data-wlt]"), function (b) { b.onclick = function () { wlTask = b.getAttribute("data-wlt"); render(v); }; });
    document.getElementById("wl-shuffle").onclick = function () { wlPi[wlTask] = (wlPi[wlTask] + 1) % prompts.length; render(v); };
    var ta = document.getElementById("wl-ta");
    ta.oninput = function () { store.set(wlDraftKey(), ta.value); var wcs = document.getElementById("wl-wc"), n = wlCount(ta.value); wcs.textContent = n + " คำ"; wcs.className = (n < meta.words ? "low" : "ok"); };
    [].forEach.call(v.querySelectorAll("[data-rev]"), function (b) { b.onclick = function () { var k = b.getAttribute("data-rev"); rev[k] = !rev[k]; render(v); }; });
    document.getElementById("wl-timer").onclick = function () { toggleTimer(); };
    document.getElementById("wl-treset").onclick = function () { stopTimer(); wlSec = 0; render(v); };
    document.getElementById("wl-copy").onclick = function () { copyForGrading(prompt, ta.value, meta); };
  }

  /* ---------------- Reading ---------------- */
  function renderReading(v) {
    if (!RDATA) { v.innerHTML = '<div class="empty">กำลังโหลดบทอ่าน…</div>'; loadReading(function () { renderReading(v); }); return; }
    if (rdSel >= 0 && RDATA[rdSel]) renderPassage(v, RDATA[rdSel]);
    else renderReadingList(v);
  }

  function bandBadge(b) { return '<span class="rd-band">Band ' + esc(String(b)) + '</span>'; }

  function renderReadingList(v) {
    var list = RDATA.slice(0).sort(function (a, b) { return (a.band - b.band) || (a.id < b.id ? -1 : 1); });
    var h = ['<div class="ex-wrap">'];
    h.push(bar("Reading"));
    h.push('<div class="ex-intro">เลือกบทความ → อ่าน (ลองจับเวลา ~15–18 นาที/บท) → ตอบคำถาม → ตรวจอัตโนมัติ + ดูเฉลยและจุดอ้างอิง</div>');
    for (var i = 0; i < list.length; i++) {
      var p = list[i], realIdx = RDATA.indexOf(p);
      h.push('<button class="rd-card" data-p="' + realIdx + '">' +
        '<div class="rd-card-top">' + bandBadge(p.band) + '<span class="rd-card-topic">' + esc(p.topic || "") + '</span></div>' +
        '<div class="rd-card-t">' + esc(p.title) + '</div>' +
        '<div class="rd-card-m">' + (p.questions ? p.questions.length : 0) + ' คำถาม · ~' + (p.words || "") + ' คำ</div></button>');
    }
    h.push('</div>');
    v.innerHTML = h.join("");
    var back = document.getElementById("ex-back");
    if (back) back.onclick = function () { view = "home"; render(v); };
    [].forEach.call(v.querySelectorAll("[data-p]"), function (b) {
      b.onclick = function () { rdSel = parseInt(b.getAttribute("data-p"), 10); rdAns = {}; rdDone = false; render(v); };
    });
  }

  var TFNG = [{ v: "True", t: "True / จริง" }, { v: "False", t: "False / เท็จ" }, { v: "Not Given", t: "Not Given / ไม่ได้กล่าว" }];

  function passageHtml(txt) {
    // split on paragraph labels like [A]; esc text, render label as a styled span
    var parts = String(txt).split(/(?=\[[A-Z]\])/);
    var h = "";
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i].replace(/^\s+|\s+$/g, "");
      if (!s) continue;
      var m = s.match(/^\[([A-Z])\]\s*([\s\S]*)$/);
      if (m) h += '<p class="rd-para"><span class="rd-plab">' + m[1] + '</span> ' + esc(m[2]) + "</p>";
      else h += '<p class="rd-para">' + esc(s) + "</p>";
    }
    return h || ('<p class="rd-para">' + esc(txt) + "</p>");
  }

  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[.,;:!?"'()]/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
  function isCorrect(q, val) {
    if (val == null || val === "") return false;
    if (q.type === "gap") return norm(val) === norm(q.a);
    return String(val) === String(q.a);
  }

  function renderPassage(v, p) {
    var qs = p.questions || [];
    var h = ['<div class="ex-wrap">'];
    h.push('<div class="ex-bar"><button class="ex-back" id="rd-back">‹ บทอื่น</button><div class="ex-title">Reading</div></div>');
    h.push('<div class="rd-head">' + bandBadge(p.band) + '<span class="rd-htopic">' + esc(p.topic || "") + '</span></div>');
    h.push('<div class="rd-title">' + esc(p.title) + '</div>');
    h.push('<div class="rd-passage">' + passageHtml(p.passage) + '</div>');

    if (rdDone) {
      var score = 0;
      for (var s = 0; s < qs.length; s++) if (isCorrect(qs[s], rdAns[s])) score++;
      var pct = qs.length ? Math.round(score / qs.length * 100) : 0;
      h.push('<div class="rd-score"><b>' + score + ' / ' + qs.length + '</b><span>' + pct + '% ถูก</span></div>');
    }

    h.push('<div class="rd-qs">');
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i], cor = rdDone ? isCorrect(q, rdAns[i]) : null;
      var tag = q.type === "tfng" ? "True / False / Not Given" : (q.type === "gap" ? "เติมคำ" + (q.limit ? " (ไม่เกิน " + q.limit + " คำ)" : "") : "เลือกตอบ");
      h.push('<div class="rd-q' + (rdDone ? (cor ? " ok" : " bad") : "") + '"><div class="rd-qn">ข้อ ' + (i + 1) + ' <span>' + tag + '</span>' + (rdDone ? (cor ? ' <b class="rd-mk ok">✓</b>' : ' <b class="rd-mk bad">✗</b>') : "") + '</div>');
      h.push('<div class="rd-qtext">' + esc(q.q) + '</div>');
      if (q.type === "gap") {
        h.push('<input class="rd-gap" data-q="' + i + '" ' + (rdDone ? "disabled" : "") + ' value="' + esc(rdAns[i] || "") + '" placeholder="พิมพ์คำตอบ…" autocomplete="off" autocapitalize="off" spellcheck="false">');
      } else {
        var opts = q.type === "tfng" ? TFNG : (q.options || []).map(function (o) { return { v: o, t: o }; });
        h.push('<div class="rd-opts">');
        for (var o = 0; o < opts.length; o++) {
          var ov = opts[o].v, sel = rdAns[i] === ov;
          var oc = "rd-opt" + (sel ? " sel" : "");
          if (rdDone) { if (String(q.a) === String(ov)) oc += " ans"; else if (sel) oc += " wrong"; }
          h.push('<button class="' + oc + '" data-q="' + i + '" data-v="' + esc(ov) + '"' + (rdDone ? " disabled" : "") + '>' + esc(opts[o].t) + '</button>');
        }
        h.push('</div>');
      }
      if (rdDone) {
        h.push('<div class="rd-fb">');
        h.push('<div class="rd-ans">เฉลย: <b>' + esc(q.a) + '</b></div>');
        if (q.why_th) h.push('<div class="rd-why">' + esc(q.why_th) + '</div>');
        if (q.evidence) h.push('<div class="rd-ev">📌 “' + esc(q.evidence) + '”</div>');
        h.push('</div>');
      }
      h.push('</div>');
    }
    h.push('</div>');

    if (!rdDone) h.push('<button class="rd-submit" id="rd-submit">ตรวจคำตอบ</button>');
    else h.push('<button class="rd-submit rd-retry" id="rd-retry">🔄 ลองใหม่</button>');
    h.push('</div>');
    v.innerHTML = h.join("");

    document.getElementById("rd-back").onclick = function () { rdSel = -1; rdAns = {}; rdDone = false; render(v); };
    // option selection (no re-render, preserve inputs)
    [].forEach.call(v.querySelectorAll(".rd-opt"), function (b) {
      b.onclick = function () {
        if (rdDone) return;
        var qi = b.getAttribute("data-q");
        rdAns[qi] = b.getAttribute("data-v");
        [].forEach.call(v.querySelectorAll('.rd-opt[data-q="' + qi + '"]'), function (x) { x.className = "rd-opt" + (x === b ? " sel" : ""); });
      };
    });
    [].forEach.call(v.querySelectorAll(".rd-gap"), function (inp) {
      inp.oninput = function () { rdAns[inp.getAttribute("data-q")] = inp.value; };
    });
    var sub = document.getElementById("rd-submit");
    if (sub) sub.onclick = function () {
      [].forEach.call(v.querySelectorAll(".rd-gap"), function (inp) { rdAns[inp.getAttribute("data-q")] = inp.value; });
      rdDone = true; render(v);
      var top = v.querySelector(".rd-score"); if (top) try { top.scrollIntoView({ block: "center" }); } catch (e) {}
    };
    var rt = document.getElementById("rd-retry");
    if (rt) rt.onclick = function () { rdAns = {}; rdDone = false; render(v); try { v.scrollIntoView({ block: "start" }); } catch (e) {} };
  }

  function wireCommon(v) {
    var back = document.getElementById("ex-back");
    if (back) back.onclick = function () { view = "home"; render(v); };
    [].forEach.call(v.querySelectorAll("[data-rev]"), function (b) {
      b.onclick = function (e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute("data-say") !== null) return; // let speak button handle
        var k = b.getAttribute("data-rev"); rev[k] = !rev[k]; render(v);
      };
    });
    [].forEach.call(v.querySelectorAll(".ex-spk"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); if (window.speak) speak(b.getAttribute("data-say")); };
    });
  }

  PT.examprep = {
    render: render,
    open: function (v) { view = v || "home"; },   // deep-link: "home" | "sp" | "wr" | "wl" | "rd"
    leave: function () { stopTimer(); },
    reset: function () { view = "home"; spSel = -1; spSub = "part2"; wrSub = "task1"; rev = {}; rdSel = -1; rdAns = {}; rdDone = false; wlTask = "task2"; stopTimer(); wlSec = 0; }
  };
})();
