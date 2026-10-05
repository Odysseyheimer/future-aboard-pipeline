/* plan.js — "แผนเรียน 540 วัน" inside Stats. Generates a full day-by-day 18-month plan (v2),
   ties into the real streak (PT.srs.streak) + due cards (S.rec). ES5-only. */
PT.plan=(function(){
  var TOTAL=540,PD=30;
  var DECK={1:"Oxford A1",2:"Oxford A1→A2",3:"Oxford A2",4:"Oxford B1",5:"Phrasal Verbs + Idioms",6:"Topics + B1 ต่อ",
    7:"Oxford B2",8:"Synonyms",9:"AWL + B2 ต่อ",10:"Oxford C1",11:"รอบรู้วิชาการ",12:"Word Choice วิชาการ + C1",
    13:"รอบรู้วิชาการ (จบ)",14:"Collocations (เลือกตัวเด็ด)",15:"Word Choice (จบ)",
    16:"ทบทวน — ไม่มีคำใหม่",17:"ทบทวน + คำที่มักผิด",18:"ทบทวน + สอบซ้อมเข้ม"};
  var PHNAME={1:"รากฐาน & พูดตั้งแต่วันแรก",2:"ต่อยอด & เริ่มเขียน",3:"ขยาย & mock แรก",4:"วิชาการ & Writing",5:"เข้มข้น 4 ทักษะ",6:"ตกผลึก & สอบ"};
  var PHNOTE={1:{c:"good",t:"🌱 ช่วงเบา — เริ่มทีละน้อย (13 คำ/วัน) สร้างนิสัยให้ติดก่อน อย่าเพิ่งรีบ"},
    4:{c:"warn",t:"⚠️ คำใหม่เริ่มหนักขึ้น (25 คำ/วัน) — ยึดเพดานทบทวน 20 นาที ลดคำใหม่ถ้าค้างเยอะ"},
    5:{c:"warn",t:"⚠️ ช่วงหนักสุด (28 คำ/วัน + เตรียมสอบ) — ทบทวนให้ทันก่อนเพิ่มใหม่ ห้ามยืดเวลา"},
    6:{c:"good",t:"🎯 ไม่มีคำใหม่แล้ว — เน้น mock จับเวลา + พูด/เขียนจริงทุกวัน"}};
  var NEWC={1:13,2:17,3:21,4:25,5:28,6:0}; // ramp: light start -> heavier later (user pref). Per-phase words/day; still covers ALL Oxford A1–C1 + PV + Idiom + Topic + Syn + AWL (7,615) + tail of Knowledge (~7,848 total by day 540). Phase 6 = 0 (review only).
  var WLABEL={2:"ย่อหน้าสั้น 1 ย่อหน้า",3:"ย่อหน้า / เริ่ม Task 1",4:"Writing Task 1",5:"Writing Task 2",6:"Task 1 หรือ 2 (สลับ)"};
  var MILE={1:"🚀 วันเริ่มต้น! ตั้งเป้าเล็กๆ แต่ทำทุกวัน",90:"🏅 จบเฟส 1 — พูดแนะนำตัวเป็นอังกฤษ 1 นาทีได้",
    180:"🏅 ผ่านเดือน 6 — จุดที่คนเลิกเยอะที่สุด คุณมาไกลมาก!",270:"🏅 mock ชุดแรกเสร็จ — รู้ระดับจริงของตัวเอง",
    360:"🏅 essay ได้ band 6+ — Writing กำลังพ้นเพดาน",450:"🏅 mock รวม ~6.5 — เหลืออีกนิดเดียว!",540:"🎓 พร้อมสอบจริง! จองสอบ IELTS ได้เลย"};

  /* ---- curriculum: which exact items each new-word day covers ---- */
  // ordered playlist; n must match the deck/level counts in data/*.json
  var CURRIC=[
    {deck:"oxford",grp:"A1",name:"Oxford A1",n:900},
    {deck:"oxford",grp:"A2",name:"Oxford A2",n:799},
    {deck:"oxford",grp:"B1",name:"Oxford B1",n:700},
    {deck:"oxford",grp:"B2",name:"Oxford B2",n:1298},
    {deck:"oxford",grp:"C1",name:"Oxford C1",n:1282},
    {deck:"pv",grp:null,name:"Phrasal Verbs",n:902},
    {deck:"idiom",grp:null,name:"Idioms",n:128},
    {deck:"topic",grp:null,name:"Topic Vocab",n:374},
    {deck:"syn",grp:null,name:"Synonyms",n:662},
    {deck:"awl",grp:null,name:"AWL",n:570},
    {deck:"knowledge",grp:null,name:"รอบรู้วิชาการ",n:1040}
  ];
  var CUM=[],_s=0; for(var _i=0;_i<CURRIC.length;_i++){CUM.push(_s);_s+=CURRIC[_i].n;} var TOTV=_s;

  function dinfo(day){
    var month=Math.ceil(day/PD),dom=((day-1)%PD)+1,phase=Math.ceil(month/3),dow=(day-1)%7;
    var rest=(dow===6),mock=(phase===6&&dow===5)||(phase>=3&&dom===28&&!rest);
    var nc=(rest||mock||phase===6)?0:NEWC[phase];
    return{month:month,dom:dom,phase:phase,dow:dow,rest:rest,mock:mock,nc:nc};
  }
  var _cur=null;
  function cursorStart(day){ if(!_cur){_cur=[0];var c=0;for(var d=1;d<=TOTAL;d++){c+=dinfo(d).nc;_cur[d]=c;}} return _cur[day-1]||0; }
  function segsOf(start,count){var out=[],pos=start,left=count;
    for(var i=0;i<CURRIC.length&&left>0;i++){var a=CUM[i],b=CUM[i]+CURRIC[i].n;
      if(pos<b){var ls=Math.max(pos,a)-a,take=Math.min(b,pos+left)-Math.max(pos,a);
        if(take>0){out.push({ci:i,deck:CURRIC[i].deck,grp:CURRIC[i].grp,name:CURRIC[i].name,from:ls+1,to:ls+take});pos+=take;left-=take;}}}
    return out;}
  function segLabel(sg){var a=[];for(var i=0;i<sg.length;i++)a.push(sg[i].name+" คำที่ "+sg[i].from+"–"+sg[i].to);return a.join(" + ");}
  // distinct source names a month covers (for the month card subtitle)
  function monthVocab(m){var s=(m-1)*PD+1,e=m*PD,names=[],seen={},d;
    for(d=s;d<=e;d++){var di=dinfo(d);if(di.nc<=0)continue;var sg=segsOf(cursorStart(d),di.nc);
      for(var k=0;k<sg.length;k++)if(!seen[sg[k].name]){seen[sg[k].name]=1;names.push(sg[k].name);}}
    return names.length?names.join(" → "):"ทบทวน (ไม่มีคำใหม่)";}

  /* ---- lazy deck loading for the actual word lists ---- */
  var deckCache={};
  function fetchDeck(id,cb){
    if(deckCache[id]){cb(deckCache[id]);return;}
    fetch("data/"+id+".json").then(function(r){return r.json();}).then(function(rows){deckCache[id]=rows;cb(rows);}).catch(function(){cb(null);});
  }
  function loadSegs(sg,cb){ // ensure all decks in segments are cached
    var need={},list=[],i;for(i=0;i<sg.length;i++)if(!deckCache[sg[i].deck])need[sg[i].deck]=1;
    for(var k in need)if(need.hasOwnProperty(k))list.push(k);
    if(!list.length){cb();return;}
    var left=list.length;for(i=0;i<list.length;i++)fetchDeck(list[i],function(){if(--left<=0)cb();});
  }
  function segItems(seg){ // returns array of items for one segment, in file order
    var rows=deckCache[seg.deck]||[],out=[],i;
    for(i=0;i<rows.length;i++){if(seg.grp){if(String(rows[i].g)!==seg.grp)continue;}out.push(rows[i]);}
    return out.slice(seg.from-1,seg.to);
  }
  function wordsHtml(sg){var h="";for(var i=0;i<sg.length;i++){var seg=sg[i],items=segItems(seg);
    h+='<div class="pl-wsrc">'+esc(seg.name)+' · คำที่ '+seg.from+'–'+seg.to+' <em class="pl-wtip">(ค้นในแอป: #'+seg.from+'-'+seg.to+')</em></div><div class="pl-wgrid">';
    for(var j=0;j<items.length;j++){var it=items[j],w=esc(it.w||""),th=esc(it.mt||it.me||"");
      h+='<div class="pl-witem"><b><i>#'+(seg.from+j)+'</i> '+w+'</b>'+(th?'<span>'+th+'</span>':'')+'</div>';}
    h+='</div>';}
    return h||'<div class="pl-hint">ไม่พบรายการคำ</div>';}

  // rotating "major" slot — mirrors the Today Hub (todayhub.js majorFor)
  function major(dow,phase){
    if(dow===0)return{focus:"📖 เรื่องสั้น",i:"📖",t:"เรื่องสั้น 1 เรื่อง + ตอบคำถามท้ายเรื่อง (แท็บสนทนา)",d:"15 น."};
    if(dow===1)return{focus:"📚 Reading",i:"📚",t:"Reading 1 บท จับเวลา + คำถาม T/F/NG (แท็บติวสอบ)",d:"18 น."};
    if(dow===2)return{focus:"🎤 พูดอัดเสียง",i:"🎤",t:"ตอบ cue card + อัดเสียงตัวเอง"+(phase>=3?" → ส่งให้ Claude ตรวจ":""),d:"15 น."};
    if(dow===3)return{focus:"🎧 ฟังยาว",i:"🎧",t:"ฟังยาว: เล่นบทสนทนาต่อเนื่องทั้งบท หรือ podcast + จดคำใหม่",d:"15 น."};
    if(dow===4)return{focus:"🎓 รอบรู้วิชาการ",i:"🎓",t:"รอบรู้วิชาการ 10 คำ + เปิดแผนที่คำดูคำเชื่อมโยง",d:"15 น."};
    if(phase<=1)return{focus:"🎤 พูดเล่าสัปดาห์",i:"🎤",t:"พูดเล่าสัปดาห์ของคุณ 1 นาที + อัดเสียง",d:"15 น."};
    return{focus:"✍️ Writing Lab",i:"✍️",t:"Writing Lab — เขียน "+WLABEL[phase]+" → ส่งให้ Claude ตรวจ",d:"25 น."};
  }
  function gameOf(day){var g=day%3;
    if(g===1)return"เกมหาที่ผิด 3 ข้อ";
    if(g===2)return"เติมคำ (cloze) 3 ข้อ";
    return"เกมเติมประโยค 1 รอบ";}

  function build(day){
    var di=dinfo(day),month=di.month,dom=di.dom,phase=di.phase,dow=di.dow,rest=di.rest,mock=di.mock,newCount=di.nc;
    var week=Math.ceil(day/7),tasks=[],focus,banner=null,vocab=null;
    if(rest){
      tasks.push({i:"🎯",t:"แบบทดสอบเบาๆ (ทบทวน + คำที่มักผิด)",d:"~7 น."});
      tasks.push({i:"🎤",t:"อัดเสียงพูดทวนทั้งสัปดาห์ + ฟังตัวเอง หาจุดแก้",d:"10 น."});
      tasks.push({i:"📖",t:"(เสริม) อ่านเรื่องสั้นเล่นๆ 1 เรื่อง",d:"15 น."});
      focus="😌 วันพัก";banner={c:"restB",t:"😌 วันพัก — ทำแค่ขั้นต่ำก็ถือว่า \"ไม่ขาด\" ปกป้องนิสัยไว้"};
    }else if(mock){
      tasks.push({i:"🎯",t:"แบบทดสอบวันนี้ (อุ่นเครื่อง + คำที่มักผิด)",d:"~7 น."});
      tasks.push({i:"🔁",t:"เคลียร์การ์ดถึงกำหนด (SRS)",d:"≤20 น."});
      if(phase===6)tasks.push({i:"📝",t:"ทำ Mock เต็มชุด 4 ทักษะ จับเวลาจริง",d:"~3 ชม."});
      else tasks.push({i:"📝",t:"ทำ Mock 1 ทักษะ (สลับ Reading/Writing/Speaking) จับเวลา",d:"~30–60 น."});
      tasks.push({i:"🔎",t:"ตรวจข้อผิด + จดคำ/จุดที่พลาดลงสมุด",d:"15 น."});
      focus="📝 สอบซ้อม";banner={c:"mockB",t:"📝 วันสอบซ้อม (mock) — จับเวลาให้เหมือนจริง"};
    }else{
      // full-feature day — mirrors the Today Hub (8 steps, every tab/deck every day)
      tasks.push({i:"🎯",t:"แบบทดสอบวันนี้ (อุ่นเครื่อง + คำที่มักผิด)",d:"~7 น."});
      tasks.push({i:"🔁",t:"เคลียร์การ์ดถึงกำหนด (SRS)",d:"≤20 น."});
      if(newCount){
        var start=cursorStart(day),sg=segsOf(start,newCount);
        vocab={start:start,count:newCount,segs:sg};
        tasks.push({i:"🆕",t:"เรียนคำใหม่ "+newCount+" คำ · "+segLabel(sg),d:"15 น."});
      }
      tasks.push({i:"💬",t:"สนทนา 1 บท — ฟังแล้วพูดตาม",d:"8 น."});
      tasks.push({i:"✍️",t:"แต่งประโยค 3 ข้อ (ไทย→อังกฤษ จากคลังประโยค)",d:"7 น."});
      tasks.push({i:"⚖️",t:"เลือกคำ 1 กลุ่ม (near-synonyms)",d:"6 น."});
      var mj=major(dow,phase);tasks.push({i:mj.i,t:mj.t,d:mj.d});focus=mj.focus;
      tasks.push({i:"🎮",t:gameOf(day),d:"8 น."});
      tasks.push({i:"📐",t:"เรียนโครงสร้างประโยค 1 อัน + ฝึก (แท็บวันนี้ → โครงสร้างวันนี้)",d:"6 น."});
    }
    if(MILE[day])banner={c:"mileB",t:MILE[day]};
    return{day:day,month:month,dom:dom,phase:phase,week:week,rest:rest,mock:mock,focus:focus,tasks:tasks,banner:banner,vocab:vocab};
  }

  /* ---- storage ---- */
  var LSD="pt_plan_done",LSS="pt_plan_start";
  function loadDone(){try{return JSON.parse(store.get(LSD)||"[]");}catch(e){return[];}}
  var doneArr=loadDone(),doneMap={};(function(){for(var i=0;i<doneArr.length;i++)doneMap[doneArr[i]]=1;})();
  function isDone(d){return!!doneMap[d];}
  function doneCount(){var n=0,k;for(k in doneMap)if(doneMap[k])n++;return n;}
  function toggleDone(d){if(doneMap[d]){delete doneMap[d];}else{doneMap[d]=1;}var a=[],k;for(k in doneMap)if(doneMap[k])a.push(+k);try{store.set(LSD,JSON.stringify(a));}catch(e){}}
  var startISO=store.get(LSS)||"";
  function startDate(){if(!startISO)return null;var p=startISO.split("-");if(p.length!==3)return null;return new Date(+p[0],+p[1]-1,+p[2]);}
  function dateOf(day){var s=startDate();if(!s)return null;var d=new Date(s.getTime());d.setDate(d.getDate()+(day-1));return d;}
  function fmt(d){try{return d.toLocaleDateString("th-TH",{weekday:"short",day:"numeric",month:"short"});}catch(e){return"";}}
  function todayDay(){var s=startDate();if(!s)return null;var n=new Date();var a=new Date(s.getFullYear(),s.getMonth(),s.getDate());var b=new Date(n.getFullYear(),n.getMonth(),n.getDate());var diff=Math.round((b-a)/86400000)+1;return(diff>=1&&diff<=TOTAL)?diff:null;}
  function realDue(){var now=Date.now(),c=0,i,st,data=(S&&S.data)||[];for(i=0;i<data.length;i++){st=PT.srs.statusOf(S.rec[keyOf(data[i])],now);if(st==="due"||st==="learning")c++;}return c;}

  /* ---- render ---- */
  var vw="months",cm=1;
  function tasksHtml(o){var h='<ul class="pl-tl">',i,t;for(i=0;i<o.tasks.length;i++){t=o.tasks[i];
    h+='<li><span class="pl-ti">'+t.i+'</span><span class="pl-tt">'+esc(t.t)+'</span><span class="pl-td">'+esc(t.d)+'</span></li>';}return h+'</ul>';}

  function wordsBlock(o){ if(!o.vocab)return "";
    return '<button class="pl-b pl-wbtn" data-words="'+o.day+'">📋 ดูคำวันนี้ ('+o.vocab.count+' คำ)</button>'+
      '<div class="pl-words" id="pl-words'+o.day+'"></div>'; }

  function todayCard(td){var o=build(td),due=realDue(),dn=isDone(td);
    var h='<div class="pl-today"><div class="pl-tdh">📍 วันนี้ · Day '+td+' <span>'+esc(PHNAME[o.phase])+'</span></div>';
    if(o.banner)h+='<div class="pl-bn pl-'+o.banner.c+'">'+esc(o.banner.t)+'</div>';
    h+=tasksHtml(o);
    h+=wordsBlock(o);
    h+='<div class="pl-live">🔁 การ์ดรอทบทวนในคลังนี้: <b>'+due+'</b> ใบ</div>';
    h+='<div class="pl-tdbtn"><button class="pl-b pl-rev" data-rev="1">▶ ทบทวนเลย</button>'+
       '<button class="pl-b pl-dn'+(dn?" on":"")+'" data-done="'+td+'">'+(dn?"✓ เสร็จแล้ว":"ทำเสร็จ")+'</button></div></div>';
    return h;
  }

  function monthsHtml(){
    var pct=Math.round(doneCount()/TOTAL*100),td=todayDay();
    var h='<div class="pl-prog"><div class="pl-pr-t"><span>ความคืบหน้า</span><span><b>'+doneCount()+'</b> / '+TOTAL+' วัน · '+pct+'%</span></div>'+
      '<div class="pl-bar"><i style="width:'+pct+'%"></i></div>'+
      '<div class="pl-ctl"><label>วันเริ่มเรียน:</label><input type="date" id="pl-start" value="'+esc(startISO)+'">'+
      (td?'<button class="pl-b" data-goto="1">📍 ไปวันนี้ (Day '+td+')</button>':'')+'</div></div>';
    if(td)h+=todayCard(td);
    else h+='<div class="pl-hint">ใส่ “วันเริ่มเรียน” ด้านบน แล้วระบบจะบอกว่าวันนี้คือ Day อะไร ที่ต้องทำอะไร</div>';
    // ---- roadmap overview: 6 phases + the weekly full-feature rotation ----
    h+='<div class="pl-ov"><div class="pl-ov-h">🗺️ ภาพรวม roadmap</div>';
    for(var p=1;p<=6;p++){
      var mA=(p-1)*3+1,mB=p*3;
      h+='<div class="pl-ov-ph"><span class="pl-ov-n">เฟส '+p+'</span><span class="pl-ov-m">ด.'+mA+'–'+mB+'</span>'+
         '<span class="pl-ov-t">'+esc(PHNAME[p])+'</span></div>';
    }
    h+='<div class="pl-ov-vocab">📦 คำศัพท์จัดตาราง ~7,850 คำ (เบาช่วงต้น → เพิ่มช่วงท้าย): Oxford A1→C1 → Phrasal Verbs → Idioms → Topics → Synonyms → AWL → รอบรู้วิชาการ</div>';
    h+='<div class="pl-ov-wk"><b>ทุกวัน:</b> แบบทดสอบ · เคลียร์การ์ด · คำใหม่ · สนทนา · แต่งประโยค · เลือกคำ · เกม<br>'+
       '<b>หมวดใหญ่หมุนรายสัปดาห์:</b> จ 📖 เรื่องสั้น · อ 📚 Reading · พ 🎤 พูดอัดเสียง · พฤ 🎧 ฟังยาว · ศ 🎓 รอบรู้วิชาการ · ส ✍️ Writing Lab · อา 😌 พัก</div>';
    h+='</div>';
    h+='<div class="pl-mgrid">';
    for(var m=1;m<=18;m++){var phase=Math.ceil(m/3),s=(m-1)*PD+1,e=m*PD,dc=0,d;
      for(d=s;d<=e;d++)if(isDone(d))dc++;var mp=Math.round(dc/PD*100),isT=(td&&Math.ceil(td/PD)===m);
      h+='<button class="pl-mc'+(isT?" today":"")+'" data-m="'+m+'"><div class="pl-mm">เดือน '+m+'</div>'+
         '<div class="pl-mph">เฟส '+phase+' · '+esc(PHNAME[phase])+'</div><div class="pl-mdk">'+esc(monthVocab(m))+'</div>'+
         '<div class="pl-mdc">'+dc+'/'+PD+' วัน</div><div class="pl-mbar"><i style="width:'+mp+'%"></i></div></button>';}
    h+='</div><div class="pl-foot">18 เดือน × 30 วัน = 540 วัน · วันที่ 7 ของทุกสัปดาห์ = วันพัก</div>';
    return h;
  }

  function dayHtml(o,td){
    var cls="pl-day";if(o.rest)cls+=" rest";if(o.mock)cls+=" mock";if(o.banner&&o.banner.c==="mileB")cls+=" mile";
    if(isDone(o.day))cls+=" done";if(td===o.day)cls+=" tdy";
    var dt=dateOf(o.day),dstr=dt?fmt(dt):("สัปดาห์ "+o.week);
    var h='<details class="'+cls+'" id="pl-day'+o.day+'"><summary class="pl-sum">'+
      '<span class="pl-ck">✓</span><span class="pl-dn"><b>'+o.day+'</b><i>Day</i></span>'+
      '<span class="pl-mid"><span class="pl-fc">'+esc(o.focus)+'</span><span class="pl-dt">'+esc(dstr)+(td===o.day?" · วันนี้":"")+'</span></span>'+
      '<span class="pl-cv">▸</span></summary><div class="pl-bd">';
    if(o.banner)h+='<div class="pl-bn pl-'+o.banner.c+'">'+esc(o.banner.t)+'</div>';
    h+=tasksHtml(o);
    h+=wordsBlock(o);
    h+='<button class="pl-b pl-full'+(isDone(o.day)?" on":"")+'" data-done="'+o.day+'">'+(isDone(o.day)?"✓ ทำเสร็จแล้ว (แตะเพื่อยกเลิก)":"ทำวันนี้เสร็จแล้ว")+'</button></div></details>';
    return h;
  }

  function monthHtml(m){
    var phase=Math.ceil(m/3),s=(m-1)*PD+1,e=m*PD,td=todayDay();
    var h='<button class="pl-back" data-back="1">‹ เดือนทั้งหมด</button>'+
      '<div class="pl-mh">เดือน '+m+' — เฟส '+phase+'</div>'+
      '<div class="pl-msub">'+esc(PHNAME[phase])+' · คำศัพท์: '+esc(monthVocab(m))+'</div>';
    if(PHNOTE[phase])h+='<div class="pl-note pl-'+PHNOTE[phase].c+'">'+esc(PHNOTE[phase].t)+'</div>';
    for(var day=s;day<=e;day++)h+=dayHtml(build(day),td);
    return h;
  }

  function draw(){var r=document.getElementById("plan-root");if(!r)return;r.innerHTML=(vw==="months")?monthsHtml():monthHtml(cm);
    if(vw==="month"){var td=todayDay();if(td&&Math.ceil(td/PD)===cm){var el=document.getElementById("pl-day"+td);if(el){el.open=true;}}}}

  function up(el,a,root){while(el&&el!==root){if(el.getAttribute&&el.getAttribute(a)!==null)return el;el=el.parentNode;}return null;}

  function onClick(e){var r=document.getElementById("plan-root");if(!r)return;var t=e.target,el;
    if((el=up(t,"data-words",r))){e.preventDefault();var wd=+el.getAttribute("data-words");var wo=build(wd);
      var box=document.getElementById("pl-words"+wd);if(!box||!wo.vocab)return;
      if(box.getAttribute("data-open")==="1"){box.innerHTML="";box.removeAttribute("data-open");el.textContent="📋 ดูคำวันนี้ ("+wo.vocab.count+" คำ)";return;}
      box.innerHTML='<div class="pl-hint">กำลังโหลดคำ…</div>';box.setAttribute("data-open","1");el.textContent="▲ ซ่อนคำ";
      loadSegs(wo.vocab.segs,function(){var bx=document.getElementById("pl-words"+wd);if(bx&&bx.getAttribute("data-open")==="1")bx.innerHTML=wordsHtml(wo.vocab.segs);});
      return;}
    if((el=up(t,"data-done",r))){e.preventDefault();var d=+el.getAttribute("data-done");toggleDone(d);
      if(vw==="months"){draw();return;} // months view: rebuild today card + grid counters
      var dn=isDone(d); // month view: update in place to keep open/scroll state
      el.textContent=dn?"✓ ทำเสร็จแล้ว (แตะเพื่อยกเลิก)":"ทำวันนี้เสร็จแล้ว";
      if(dn){if(el.className.indexOf(" on")<0)el.className+=" on";}else{el.className=el.className.replace(/\s*\bon\b/,"");}
      var det=document.getElementById("pl-day"+d);
      if(det){if(dn){if(det.className.indexOf("done")<0)det.className+=" done";}else{det.className=det.className.replace(/\s*\bdone\b/,"");}}
      return;}
    if((el=up(t,"data-m",r))){cm=+el.getAttribute("data-m");vw="month";draw();try{r.scrollIntoView({block:"start"});}catch(x){}return;}
    if((el=up(t,"data-back",r))){vw="months";draw();return;}
    if((el=up(t,"data-goto",r))){var td=todayDay();if(td){cm=Math.ceil(td/PD);vw="month";draw();}return;}
    if((el=up(t,"data-rev",r))){if(window.goMode)goMode("cards");return;}
  }

  function onChange(e){var t=e.target;if(t&&t.id==="pl-start"){startISO=t.value;try{store.set(LSS,startISO);}catch(x){}draw();}}

  function section(){return '<div class="pl-sec"><div class="pl-sec-h">🗺️ แผนเรียน 540 วัน</div><div id="plan-root"></div></div>';}
  function wire(scope){var r=document.getElementById("plan-root");if(!r)return;vw="months";draw();
    r.addEventListener("click",onClick);r.addEventListener("change",onChange);}

  return {section:section,wire:wire,
    // exposed for the Today Hub (PT.hub)
    build:build,
    todayDay:todayDay,
    isDone:isDone,
    setDone:function(d){if(!isDone(d))toggleDone(d);},
    setStart:function(iso){startISO=iso||"";try{store.set(LSS,startISO);}catch(e){}},
    // jump to a given plan-day: back-date the start so today == day n
    setStartByDay:function(n){n=parseInt(n,10);if(!(n>=1&&n<=TOTAL))return false;
      var d=new Date();d.setDate(d.getDate()-(n-1));
      startISO=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);
      try{store.set(LSS,startISO);}catch(e){}return true;},
    startIso:function(){return startISO||"";},
    doneCount:doneCount,
    TOTAL:TOTAL
  };
})();
