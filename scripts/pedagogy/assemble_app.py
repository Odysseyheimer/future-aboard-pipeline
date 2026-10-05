"""Assemble Pocket Tutor v2 app.html from the host skeleton + the 10 agent-built modules.

Reads output/ptmods/{pos,srs,filters,filtersUI,browse,cards,quiz,theme,a11y,pwa}.{js,css}
and injects them into a hand-written HOST (shell HTML, CSS tokens, frozen helpers, shared
state S, PT.bus, render dispatch, Stats, init). Writes output/app.html.
JS load order matters: helpers/S/host defs -> modules(pos,srs,filters,filtersUI,browse,cards,
quiz,a11y,pwa) -> init(). CSS order: tokens+shell -> module css -> theme.css last (wins).
"""
from __future__ import annotations
import sys
from pathlib import Path

MODS = Path(__file__).resolve().parents[2] / "output" / "ptmods"
OUT = Path(__file__).resolve().parents[2] / "output" / "app.html"
JS_ORDER = ["pos", "srs", "ja", "filters", "filtersUI", "browse", "cards", "quiz", "bank", "fix", "daily", "wmap", "talk", "reader", "wordchoice", "examprep", "prachub", "structure", "shapes", "game", "toon", "campaign", "formal", "plan", "miss", "stats2", "todayhub", "a11y", "pwa"]
CSS_ORDER = ["filtersUI", "browse", "cards", "quiz", "bank", "fix", "daily", "wmap", "talk", "reader", "wordchoice", "examprep", "prachub", "structure", "shapes", "game", "toon", "campaign", "formal", "plan", "miss", "stats2", "todayhub", "a11y", "ja", "theme"]  # theme last


def rd(name: str, ext: str) -> str:
    p = MODS / (name + "." + ext)
    return p.read_text(encoding="utf-8") if p.exists() else ""


TOKENS = """
:root{--bg:#f7f5f1;--surface:#fff;--surface2:#f1ede6;--text:#1f1b16;--muted:#8a8177;--border:#e6e0d6;
 --accent:#e0942f;--accent-ink:#fff;--accent-soft:#fbebd3;--know:#4e9a6b;--review:#cf6f2c;--shadow:0 1px 2px rgba(31,27,22,.05),0 4px 16px rgba(31,27,22,.05);
 --g0:#4e9a6b;--g1:#5f9a37;--g2:#bd9126;--g3:#cd6f2f;--g4:#bd4a49;
 --font:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Roboto,"Noto Sans Thai","Sarabun",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#14120f;--surface:#1e1b16;--surface2:#282420;--text:#f4efe8;--muted:#a69c8e;--border:#332e27;--accent:#f0a94a;--accent-ink:#20160a;--accent-soft:#3a2c17;--know:#69b98a;--review:#e08a45;--shadow:0 2px 12px rgba(0,0,0,.35);--g0:#69b98a;--g1:#7cb84f;--g2:#dcae44;--g3:#e08a45;--g4:#dd6663}}
:root[data-theme=light]{--bg:#f7f5f1;--surface:#fff;--surface2:#f1ede6;--text:#1f1b16;--muted:#8a8177;--border:#e6e0d6;--accent:#e0942f;--accent-ink:#fff;--accent-soft:#fbebd3;--know:#4e9a6b;--review:#cf6f2c;--shadow:0 1px 2px rgba(31,27,22,.05),0 4px 16px rgba(31,27,22,.05);--g0:#4e9a6b;--g1:#5f9a37;--g2:#bd9126;--g3:#cd6f2f;--g4:#bd4a49}
:root[data-theme=dark]{--bg:#14120f;--surface:#1e1b16;--surface2:#282420;--text:#f4efe8;--muted:#a69c8e;--border:#332e27;--accent:#f0a94a;--accent-ink:#20160a;--accent-soft:#3a2c17;--know:#69b98a;--review:#e08a45;--shadow:0 2px 12px rgba(0,0,0,.35);--g0:#69b98a;--g1:#7cb84f;--g2:#dcae44;--g3:#e08a45;--g4:#dd6663}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);-webkit-text-size-adjust:100%;overscroll-behavior-y:none}
#app{max-width:600px;margin:0 auto;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
button,select,input{font-family:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}
.top{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--border);padding:calc(env(safe-area-inset-top) + 10px) 14px 9px}
.hrow{display:flex;align-items:center;gap:10px}
.mark{display:flex;align-items:center;gap:8px;font-weight:800;font-size:16px;flex:1;min-width:0}
.dot{width:22px;height:22px;border-radius:7px;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-size:12px;font-weight:900;flex:0 0 auto}
.icon{width:36px;height:36px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);display:grid;place-items:center;font-size:15px;flex:0 0 auto}
select.deck{flex:1;min-width:0;height:38px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);padding:0 10px;font-size:14px;font-weight:700}
.row2{display:flex;gap:8px;margin-top:9px}
#q{flex:1;height:40px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);padding:0 13px;font-size:16px;color:var(--text)}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;flex:0 0 auto}
.seg button{padding:0 11px;font-size:12.5px;font-weight:700;color:var(--muted);background:var(--surface2);border:none;height:40px}
.seg button.on{background:var(--accent);color:var(--accent-ink)}
main{flex:1;padding:12px 14px calc(env(safe-area-inset-bottom) + 82px);font-size:16px}
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;max-width:600px;margin:0 auto;background:var(--bg);border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom)}
.tabbar button{flex:1;padding:8px 0 7px;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10.5px;font-weight:700;color:var(--muted);background:none;border:none}
.tabbar button .i{font-size:20px}
.tabbar button.on{color:var(--accent)}
.empty{text-align:center;color:var(--muted);padding:48px 20px}
.s-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px}
.s-stat{background:var(--surface);border:1px solid var(--border);border-radius:15px;padding:15px 10px;text-align:center;box-shadow:var(--shadow)}
.s-stat b{display:block;font-size:26px;font-weight:800}.s-stat span{font-size:11.5px;color:var(--muted);font-weight:600}
.s-pl{margin-bottom:12px}.s-pl .h{display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:5px}
.s-pl .h span{color:var(--muted)}.s-bar{height:9px;border-radius:6px;background:var(--surface2);overflow:hidden}.s-bar i{display:block;height:100%}
.s-reset{width:100%;margin-top:14px;padding:12px;border-radius:11px;background:var(--surface2);color:var(--muted);font-weight:700;border:none}
.apptitle{display:none;font-weight:800;font-size:16px;color:var(--text)}
.mode-nodeck #deckwrap{display:none}
.mode-nodeck .apptitle{display:inline}
.tabbar button .i{font-size:22px}
.tabbar button.on .i{transform:translateY(-1px)}
.dot{background:var(--accent)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
"""

HOST_JS = r"""
"use strict";
window.PT=window.PT||{};
var JA_INDEX=__JA_INDEX__;
/* --- event bus --- */
PT.bus=(function(){var m={};return{on:function(e,f){(m[e]=m[e]||[]).push(f);},emit:function(e){var a=m[e]||[],i;for(i=0;i<a.length;i++){try{a[i]();}catch(x){}}}};})();
/* --- frozen helpers --- */
function esc(s){return (s==null?"":""+s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function hasK(o,k){return o&&Object.prototype.hasOwnProperty.call(o,k);}
/* store: localStorage with an in-memory shadow. If a write FAILS (quota full /
   iOS locked), we must NOT stay silent — that means progress isn't persisting.
   Flag it once and show a sticky warning so the user can back up before losing data. */
var store={m:{},writeErr:false,
 get:function(k){try{return localStorage.getItem(k);}catch(e){return hasK(this.m,k)?this.m[k]:null;}},
 set:function(k,v){this.m[k]=v;try{localStorage.setItem(k,v);}catch(e){if(!this.writeErr){this.writeErr=true;try{saveWarn();}catch(_){}}}}};
function saveWarn(){if(document.getElementById("pt-save-warn"))return;var b=document.createElement("div");b.id="pt-save-warn";
 b.setAttribute("style","position:fixed;left:12px;right:12px;top:10px;z-index:9999;background:#d9534f;color:#fff;border-radius:12px;padding:11px 14px;font:700 13px/1.4 -apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3)");
 b.innerHTML='⚠️ เซฟข้อมูลไม่ได้ (พื้นที่เต็ม) — รีบสำรองข้อมูลด่วน แล้วเคลียร์พื้นที่เครื่อง <button id="pt-save-x" style="float:right;background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer">×</button>';
 document.body.appendChild(b);var x=document.getElementById("pt-save-x");if(x)x.onclick=function(){var e=document.getElementById("pt-save-warn");if(e&&e.parentNode)e.parentNode.removeChild(e);};}
/* ask the browser to keep our data (reduces iOS eviction of an installed PWA) */
try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}
/* one-time first-run guide: the key message is "just follow the วันนี้ tab" */
function onboard(){
 if(store.get("pt_onboarded"))return;
 var STEPS=[
  {i:"👋",t:"ยินดีต้อนรับสู่ Pocket Tutor",d:"แอปติว IELTS ส่วนตัวของคุณ — คำศัพท์ · ไวยากรณ์ · อ่าน · เขียน · พูด ครบในที่เดียว"},
  {i:"🎯",t:"ทุกวันเริ่มที่แท็บ “วันนี้”",d:"มันจะบอกทุกอย่างที่ต้องทำของวันนั้น ทำตามขั้นตอนไปเรื่อยๆ แค่นั้นพอ ไม่ต้องกดครบทุกอย่างในแอป"},
  {i:"📚",t:"แท็บอื่นไว้เสริม",d:"คลัง · ฝึก · สอบ — เปิดตอนมีเวลาว่างอยากฝึกเพิ่ม ไม่ใช่สิ่งที่ต้องทำทุกวัน"},
  {i:"💾",t:"อย่าลืมสำรองข้อมูล",d:"ความคืบหน้าเก็บในเครื่องนี้เท่านั้น สำรองข้อมูลเป็นระยะ (แอปจะเตือนให้) กันหายเวลาเปลี่ยนเครื่อง"}
 ];
 var idx=0,ov=document.createElement("div");ov.id="pt-onboard";
 ov.setAttribute("style","position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px");
 ov.innerHTML='<div id="pt-ob-card" style="background:var(--surface,#fff);color:var(--text,#111);max-width:340px;width:100%;border-radius:20px;padding:26px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:var(--font,-apple-system,sans-serif)"></div>';
 document.body.appendChild(ov);
 function dots(){var h="",i;for(i=0;i<STEPS.length;i++)h+='<span style="width:8px;height:8px;border-radius:50%;background:'+(i===idx?"var(--accent,#e0942f)":"var(--border,#ccc)")+'"></span>';return h;}
 function fin(){store.set("pt_onboarded","1");if(ov.parentNode)ov.parentNode.removeChild(ov);}
 function draw(){var s=STEPS[idx],last=idx===STEPS.length-1;
  document.getElementById("pt-ob-card").innerHTML=
   '<div style="font-size:46px">'+s.i+'</div>'+
   '<div style="font-size:19px;font-weight:900;margin:10px 0 8px;line-height:1.35">'+esc(s.t)+'</div>'+
   '<div style="font-size:13.5px;color:var(--muted,#888);line-height:1.65">'+esc(s.d)+'</div>'+
   '<div style="display:flex;gap:5px;justify-content:center;margin:16px 0 14px">'+dots()+'</div>'+
   '<button id="pt-ob-next" style="width:100%;font-family:inherit;font-size:15px;font-weight:800;color:var(--accent-ink,#fff);background:var(--accent,#e0942f);border:none;border-radius:14px;padding:13px;cursor:pointer">'+(last?"เริ่มเลย ✓":"ถัดไป ›")+'</button>'+
   (last?"":'<button id="pt-ob-skip" style="background:none;border:none;color:var(--muted,#999);font-family:inherit;font-size:13px;margin-top:8px;cursor:pointer">ข้าม</button>');
  document.getElementById("pt-ob-next").onclick=function(){if(last)fin();else{idx++;draw();}};
  var sk=document.getElementById("pt-ob-skip");if(sk)sk.onclick=fin;}
 draw();
}
/* passcode gate — shown on EVERY app open before anything loads. Client-side only
   (obscurity, not strong security). The code is stored as a hash so it never
   appears verbatim in the page source. */
var PASS_HASH=240938922;
function hashPass(s){var h=5381,i;for(i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))>>>0;}return h;}
function showLock(onOk){
 var ov=document.createElement("div");ov.id="pt-lock";
 ov.setAttribute("style","position:fixed;inset:0;z-index:100000;background:var(--bg,#14120f);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;font-family:var(--font,-apple-system,sans-serif)");
 ov.innerHTML='<div style="font-size:44px">🔒</div>'+
  '<div style="font-size:20px;font-weight:900;color:var(--text,#f4efe8);margin:10px 0 4px">Pocket Tutor</div>'+
  '<div style="font-size:13px;color:var(--muted,#a69c8e);margin-bottom:18px">ใส่รหัสเพื่อเข้าใช้งาน</div>'+
  '<input id="pt-lock-in" type="password" inputmode="numeric" autocomplete="off" placeholder="รหัส" style="width:210px;text-align:center;font-size:20px;letter-spacing:4px;padding:12px;border-radius:12px;border:1.5px solid var(--border,#332e27);background:var(--surface,#1e1b16);color:var(--text,#f4efe8);box-sizing:border-box">'+
  '<button id="pt-lock-go" style="width:210px;margin-top:12px;font-family:inherit;font-size:15px;font-weight:800;color:var(--accent-ink,#20160a);background:var(--accent,#f0a94a);border:none;border-radius:12px;padding:12px;cursor:pointer">เข้าสู่ระบบ</button>'+
  '<div id="pt-lock-msg" style="font-size:12.5px;color:#d9534f;margin-top:10px;min-height:16px"></div>';
 document.body.appendChild(ov);
 var inp=document.getElementById("pt-lock-in"),msg=document.getElementById("pt-lock-msg");
 function attempt(){var v=(inp.value||"").replace(/\s/g,"");if(hashPass(v)===PASS_HASH){if(ov.parentNode)ov.parentNode.removeChild(ov);if(onOk)onOk();}else{msg.textContent="รหัสไม่ถูกต้อง ลองใหม่";inp.value="";try{inp.focus();}catch(e){}}}
 document.getElementById("pt-lock-go").onclick=attempt;
 inp.addEventListener("keydown",function(e){if(e.key==="Enter"||e.keyCode===13)attempt();});
 setTimeout(function(){try{inp.focus();}catch(e){}},50);
}
/* TTS: iOS ignores utterance.lang and uses the phone's DEFAULT voice (often Thai),
   which reads English with a Thai accent. Fix: explicitly pick an English voice. */
var _enVoice=null;
/* Known MALE / FEMALE English TTS voice names across iOS, Windows, Chrome. */
var MALE_V=["daniel","aaron","arthur","oliver","fred","george","david","mark","ryan","guy","james","thomas","william","gordon","rishi","reed","albert","junior","eddy","rocko","male","google uk english male"];
var FEMALE_V=["samantha","karen","moira","tessa","victoria","fiona","zira","hazel","susan","catherine","serena","allison","ava","kate","stephanie","martha","nicky","zoe","google us english","google uk english female"];
function pickEnVoice(){
  var vs; try{vs=speechSynthesis.getVoices()||[];}catch(e){return null;}
  var best=null,bestScore=-999,i,j;
  for(i=0;i<vs.length;i++){
    var lc=(vs[i].lang||"").replace(/_/g,"-").toLowerCase();
    if(lc.indexOf("en")!==0) continue;                 // English voices only
    var nm=(vs[i].name||"").toLowerCase(),score=2;
    if(lc.indexOf("en-us")===0) score=6;
    else if(lc.indexOf("en-gb")===0) score=5;
    else if(lc.indexOf("en-au")===0) score=4;
    // Gender: strongly prefer MALE ("female" contains "male", so test female first).
    var isFemale=nm.indexOf("female")!==-1,isMale=(!isFemale)&&nm.indexOf("male")!==-1;
    if(!isMale&&!isFemale){for(j=0;j<MALE_V.length;j++)if(nm.indexOf(MALE_V[j])!==-1){isMale=true;break;}}
    if(!isMale&&!isFemale){for(j=0;j<FEMALE_V.length;j++)if(nm.indexOf(FEMALE_V[j])!==-1){isFemale=true;break;}}
    if(isMale) score+=12; else if(isFemale) score-=12;
    if(nm.indexOf("enhanced")!==-1||nm.indexOf("premium")!==-1||nm.indexOf("siri")!==-1) score+=2;
    if(nm.indexOf("novelty")!==-1||nm.indexOf("eloquence")!==-1||nm.indexOf("compact")!==-1) score-=3;
    if(score>bestScore){bestScore=score;best=vs[i];}
  }
  return best;
}
/* Japanese voice: iOS Kyoko/Otoya, macOS/Windows/Chrome ja-JP voices */
var _jaVoice=null;
function pickJaVoice(){
  var vs; try{vs=speechSynthesis.getVoices()||[];}catch(e){return null;}
  var best=null,bs=-999,i;
  for(i=0;i<vs.length;i++){var lc=(vs[i].lang||"").replace(/_/g,"-").toLowerCase();if(lc.indexOf("ja")!==0)continue;
    var nm=(vs[i].name||"").toLowerCase(),sc=2;
    if(/kyoko|otoya|hattori|o-ren|nanami|keita|ayumi|haruka|google/.test(nm))sc+=4;
    if(nm.indexOf("enhanced")!==-1||nm.indexOf("premium")!==-1||nm.indexOf("siri")!==-1)sc+=2;
    if(nm.indexOf("compact")!==-1||nm.indexOf("eloquence")!==-1)sc-=3;
    if(sc>bs){bs=sc;best=vs[i];}}
  return best;
}
/* the only onvoiceschanged assignment: re-pick both voices */
function _repick(){_enVoice=pickEnVoice();_jaVoice=pickJaVoice();}
try{if(typeof speechSynthesis!=="undefined"){speechSynthesis.getVoices();_repick();speechSynthesis.onvoiceschanged=_repick;}}catch(e){}
function jaHint(){if(document.getElementById("jx-vhint"))return;var d=document.createElement("div");d.id="jx-vhint";d.className="jx-toast jx-sticky";
 d.innerHTML='ยังไม่มีเสียงภาษาญี่ปุ่นในเครื่อง — iPhone: ตั้งค่า › การช่วยการเข้าถึง › เนื้อหาที่พูด › เสียง › ภาษาญี่ปุ่น › Kyoko หรือ Otoya <button type="button" class="jx-x" aria-label="ปิด">✕</button>';
 d.querySelector("button").onclick=function(){d.parentNode.removeChild(d);};document.body.appendChild(d);}
function speakJa(t){t=String(t||"");if(!/[\u3040-\u30ff\u3400-\u9fff]/.test(t))return;   // never speak romaji
 try{if(!_jaVoice)_jaVoice=pickJaVoice();var n=(speechSynthesis.getVoices()||[]).length;
  if(!_jaVoice&&n>0){jaHint();return;}
  speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.lang="ja-JP";u.rate=.85;if(_jaVoice)u.voice=_jaVoice;speechSynthesis.speak(u);}catch(e){}}
window.speakJa=speakJa;
function speak(t){try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.lang="en-US";u.rate=.9;if(!_enVoice)_enVoice=pickEnVoice();if(_enVoice)u.voice=_enVoice;speechSynthesis.speak(u);}catch(e){}}
function speakU(t,rate,onend){try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.lang="en-US";u.rate=rate;if(!_enVoice)_enVoice=pickEnVoice();if(_enVoice)u.voice=_enVoice;if(onend)u.onend=onend;speechSynthesis.speak(u);}catch(e){}}
/* spell a word letter-by-letter (A, P, P, L, E) then say it; long text falls back to slow reading */
function spellOut(w){w=String(w||"").replace(/^\s+|\s+$/g,"");if(!w)return;
 if(w.replace(/[^A-Za-z]/g,"").length>30){speakSlow(w);return;}
 var parts=w.split(/\s+/),out=[],i,j;
 for(i=0;i<parts.length;i++){var ls=[],word=parts[i];
  for(j=0;j<word.length;j++){var ch=word.charAt(j);
   if(/[A-Za-z]/.test(ch))ls.push(ch.toUpperCase());
   else if(ch==="'")ls.push("apostrophe");else if(ch==="-")ls.push("hyphen");}
  if(ls.length)out.push(ls.join(", "));}
 speakU(out.join(" .  . "),0.75,function(){speakU(w,0.9);});}
/* slow, clear reading for sentences */
function speakSlow(t){t=String(t||"").replace(/^\s+|\s+$/g,"");if(!t)return;speakU(t,0.55);}
window.spellOut=spellOut;window.speakSlow=speakSlow;
/* global handler: any element with data-spell / data-slow works everywhere (capture beats row/flip handlers) */
document.addEventListener("click",function(e){var el=e.target;
 while(el&&el!==document.body&&el.getAttribute){
  var sj=el.getAttribute("data-say-ja");if(sj!==null){e.stopPropagation();e.preventDefault();speakJa(sj);return;}
  var sp=el.getAttribute("data-spell"),sl=el.getAttribute("data-slow");
  if(sp!==null){e.stopPropagation();e.preventDefault();spellOut(sp);return;}
  if(sl!==null&&el.getAttribute("data-say")===null){e.stopPropagation();e.preventDefault();speakSlow(sl);return;}
  el=el.parentNode;}
},true);
function keyOf(it){return it.w+"|"+it.g;}
/* --- Favorites (⭐ ติดดาว) — per-deck, localStorage "pt_fav" --- */
PT.fav=(function(){
 function map(){var v=store.get("pt_fav");if(!v)return {};try{return JSON.parse(v);}catch(e){return {};}}
 function save(m){store.set("pt_fav",JSON.stringify(m));}
 function fk(it){return S.deck+"|"+keyOf(it);}
 return {isFav:function(it){return !!map()[fk(it)];},
  toggle:function(it){var m=map(),k=fk(it);if(m[k])delete m[k];else m[k]=1;save(m);return !!m[k];},
  count:function(){var m=map(),n=0,k;for(k in m)if(hasK(m,k))n++;return n;}};
})();
/* --- Backup: export/import all app localStorage (SRS, favorites, streak, prefs) --- */
PT.backup=(function(){
 function dump(){var o={},i,k;for(i=0;i<localStorage.length;i++){k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;}
 return {
  exportStr:function(){var d;try{d=dump();}catch(e){d={};}return JSON.stringify({app:"pocket-tutor",v:1,ts:new Date().toISOString(),data:d});},
  restore:function(str){var obj;try{obj=JSON.parse(str);}catch(e){return null;}var d=obj&&obj.data;if(!d||typeof d!=="object")return null;var k,n=0;for(k in d){if(Object.prototype.hasOwnProperty.call(d,k)){try{localStorage.setItem(k,""+d[k]);n++;}catch(e){}}}return n;},
  markSaved:function(){try{store.set("pt_last_backup",""+Date.now());}catch(e){}},
  lastTs:function(){var t=store.get("pt_last_backup");return t?parseInt(t,10):0;},
  daysSince:function(){var t=this.lastTs();return t?Math.floor((Date.now()-t)/86400000):-1;}
 };
})();
var DECKS={oxford:{name:"Oxford 3000 / 5000",groups:["A1","A2","B1","B2","C1"],xlab:""},
 awl:{name:"Academic Word List (AWL)",groups:["S1","S2","S3","S4","S5","S6","S7","S8","S9","S10"],xlab:"Word family"},
 colloc:{name:"Academic Collocations",groups:["Verb+Noun","Adj+Noun","Other"],xlab:""},
 syn:{name:"Synonyms & Paraphrasing",groups:[],xlab:"Synonyms"},
 pv:{name:"Phrasal Verbs",type:"pv",xlab:"",groups:["get","go","take","come","look","put","make","turn","bring","call","run","set","give","break"]},
 idiom:{name:"สำนวน (Idioms)",type:"idiom",xlab:"",groups:["Time","Money","Emotions","Work & Business","Food","Success & Failure","Relationships","Communication","Effort & Difficulty","Everyday Common","Decisions & Risk","Health & Body"]},
 topic:{name:"คำศัพท์ตามหัวข้อ (Topics)",type:"topic",xlab:"",groups:["Business & Work","Travel & Tourism","Health & Medical","Technology & Internet","Food & Cooking","Money & Shopping","Home & Living","Education & Study","Environment & Nature","Transport & City","Clothes & Appearance","Feelings & Personality","Sports & Fitness","Relationships & Family","Everyday Actions"]},
 knowledge:{name:"รอบรู้วิชาการ (Knowledge)",type:"knowledge",xlab:"",groups:["Arts & Humanities","Biology & Natural Science","Culture & Anthropology","Economics & Business","Environment & Ecology","History & Archaeology","History & Culture","Medicine & Health","Natural Sciences","Science & Technical","Social & Behavioral","Social Sciences","Technology & Innovation"]},
 sentences:{name:"ประโยคสนทนา (Sentences)",type:"sentence",xlab:"",groups:["At Work","Responses & Reactions","Travel & Commute","Shopping","At Home","Making Plans","Family","Health & Doctor","Directions","Greetings & Introductions","Opinions & Feelings","Asking for Help","Eating Out","Friends","Small Talk","On the Phone","At the Airport","At the Hotel","Compliments & Encouragement","Apologizing & Excuses","Complaints & Returns","Dating & Relationships","Invitations & Parties","Job Interview","Meetings & Video Calls","Money & Bank","Public Transport","Salon & Barber","Weather & Small Talk","Work Email & Chat","Delivery & Parcels","Bargaining & Prices","Emergencies","Taxi & Ride-hailing","Everyday"]}};
var DORDER=["oxford","awl","colloc","syn","pv","idiom","topic","knowledge","sentences"];
function gcolor(i){return "var(--g"+Math.min(4,i)+")";}
var S={deck:"oxford",data:[],rec:{},filter:{groups:{},status:{},pos:{},q:"",sort:"az",fav:false,miss:false},
 working:null,workingDirty:true,page:1,mode:"todayhub",dir:"en",size:"n",
 settings:{newPerDay:20,revPerDay:120,learnSteps:[1,10],graduate:1,easyIv:4,dailyGoal:30,dirSplit:false,showJa:false,showFuri:true,showRomaji:true},session:null};
/* a few settings (currently just dirSplit) are user-toggleable and persisted; merge any saved overrides onto the defaults above */
try{var _sv=JSON.parse(store.get("pt_settings")||"{}");for(var _sk in _sv)if(hasK(_sv,_sk))S.settings[_sk]=_sv[_sk];}catch(e){}
window.S=S;window.esc=esc;window.store=store;window.speak=speak;window.keyOf=keyOf;window.gcolor=gcolor;window.hasK=hasK;window.DECKS=DECKS;window.DORDER=DORDER;
/* --- theme + size --- */
var root=document.documentElement,tset=store.get("pt_theme");if(tset)root.setAttribute("data-theme",tset);
function applySize(){var v=document.getElementById("view");if(v)v.style.fontSize=(S.size==="l"?"18.5px":"16px");}
/* --- Stats module (host-owned) --- */
PT.stats={render:function(v){var now=Date.now(),know=0,learn=0,k;
 for(k in S.rec){if(!hasK(S.rec,k))continue;var st=PT.srs.statusOf(S.rec[k],now);if(st==="known")know++;else if(st==="learning"||st==="due")learn++;}
 var total=S.data.length,neu=total-Object.keys(S.rec).length;if(neu<0)neu=0;
 var stk=(PT.srs&&PT.srs.streak)?PT.srs.streak():{current:0,longest:0,today:0};
 var goal=(S.settings&&S.settings.dailyGoal)||30;var gpct=goal?Math.min(100,Math.round(stk.today/goal*100)):0;
 var h='<div class="s-streak"><div class="s-fire">🔥 '+stk.current+'<span>วันติด</span></div>'+
  '<div class="s-goal"><div class="s-goal-h"><span>วันนี้ '+stk.today+' / '+goal+' ครั้ง</span><span>สูงสุด '+stk.longest+' วัน</span></div>'+
  '<div class="s-gbar"><i style="width:'+gpct+'%"></i></div></div></div>'+
  ((window.PT&&PT.miss&&PT.miss.section)?PT.miss.section():'')+
  ((window.PT&&PT.stats2&&PT.stats2.section)?PT.stats2.section():'')+
  ((window.PT&&PT.plan&&PT.plan.section)?PT.plan.section():'')+
  '<div class="s-grid"><div class="s-stat"><b style="color:var(--know)">'+know+'</b><span>รู้แล้ว</span></div>'+
  '<div class="s-stat"><b style="color:var(--review)">'+learn+'</b><span>กำลังเรียน</span></div>'+
  '<div class="s-stat"><b>'+neu.toLocaleString()+'</b><span>ใหม่</span></div></div>';
 var gs=DECKS[S.deck].groups,i;
 if(gs.length){h+='<div style="font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:2px 2px 10px">ตามหมวด</div>';
  for(i=0;i<gs.length;i++){(function(g,idx){var items=[],j;for(j=0;j<S.data.length;j++)if(S.data[j].g===g)items.push(S.data[j]);
   var kk=0;for(j=0;j<items.length;j++){var r=S.rec[keyOf(items[j])];if(r&&PT.srs.statusOf(r,now)==="known")kk++;}
   var pct=items.length?Math.round(kk/items.length*100):0;
   h+='<div class="s-pl"><div class="h"><span>'+esc(g)+'</span><span>'+kk+' / '+items.length+'</span></div><div class="s-bar"><i style="width:'+pct+'%;background:'+gcolor(idx)+'"></i></div></div>';})(gs[i],i);} }
 h+='<button class="s-reset" id="s-rst">ล้างความคืบหน้า ('+esc(DECKS[S.deck].name)+')</button>';
 h+='<div class="s-backup"><div class="s-bk-h">สำรอง / กู้คืนข้อมูล</div>'+
  '<div class="s-bk-sub">เก็บความคืบหน้าทั้งหมด (การ์ด · ติดดาว · สถิติ) กันหาย เผื่อ Safari ล้างข้อมูลหรือเปลี่ยนเครื่อง</div>'+
  '<div class="s-bk-row"><button class="s-bk-btn" id="s-bk-exp">⬇ สำรองข้อมูล</button>'+
  '<button class="s-bk-btn" id="s-bk-imp">⬆ กู้คืน</button></div>'+
  '<textarea class="s-bk-ta" id="s-bk-ta" spellcheck="false" style="display:none" placeholder="วางข้อความสำรองที่นี่..."></textarea>'+
  '<div class="s-bk-row2" id="s-bk-improw" style="display:none"><input type="file" id="s-bk-file" accept="application/json,.json,.txt">'+
  '<button class="s-bk-btn s-bk-go" id="s-bk-do">กู้คืนเลย</button></div>'+
  '<div class="s-bk-msg" id="s-bk-msg"></div>'+
  '<div class="s-bk-stat" id="s-bk-stat"></div></div>';
 v.innerHTML=h;if(window.PT&&PT.miss&&PT.miss.wire)try{PT.miss.wire(v);}catch(e){}
 if(window.PT&&PT.stats2&&PT.stats2.wire)try{PT.stats2.wire(v);}catch(e){}
 (function(){var el=document.getElementById("s-bk-stat");if(!el)return;var ds=-1;try{ds=PT.backup.daysSince();}catch(e){}
  var bk=(ds<0)?"⚠️ ยังไม่เคยสำรองข้อมูล":(ds===0?"✓ สำรองล่าสุดวันนี้":(ds+" วันก่อนสำรองล่าสุด"+(ds>=14?" — ควรสำรองใหม่":"")));
  el.textContent=bk;el.style.color=(ds<0||ds>=14)?"#d9534f":"var(--muted)";
  try{if(PT.pwa&&PT.pwa.version)PT.pwa.version(function(vv){if(vv)el.textContent=bk+" · เวอร์ชัน "+vv.replace("pocket-tutor-","");});}catch(e){}})();
 if(window.PT&&PT.plan&&PT.plan.wire)try{PT.plan.wire(v);}catch(e){}
 document.getElementById("s-rst").onclick=function(){if(confirm("ล้างความคืบหน้าของคลังนี้?")){S.rec={};PT.srs.save(S.deck,S.rec);S.workingDirty=true;render();}};
 (function(){var exp=document.getElementById("s-bk-exp"),imp=document.getElementById("s-bk-imp"),ta=document.getElementById("s-bk-ta"),msg=document.getElementById("s-bk-msg"),improw=document.getElementById("s-bk-improw"),file=document.getElementById("s-bk-file"),doimp=document.getElementById("s-bk-do");
  if(exp)exp.onclick=function(){var s=PT.backup.exportStr();try{PT.backup.markSaved();}catch(e){}
   var fn="pocket-tutor-backup-"+new Date().toISOString().slice(0,10)+".json";
   ta.style.display="block";ta.value=s;improw.style.display="none";try{ta.focus();ta.select();}catch(e){}
   var cp=false;try{if(document.execCommand)cp=document.execCommand("copy");}catch(e){}
   /* iOS: prefer the Share Sheet so the file leaves the device (iCloud/email/chat) */
   var shared=false;try{if(navigator.share&&window.File){var f=new File([s],fn,{type:"application/json"});if(!navigator.canShare||navigator.canShare({files:[f]})){navigator.share({files:[f],title:"Pocket Tutor backup"}).catch(function(){});shared=true;}}}catch(e){}
   if(!shared){try{var bl=new Blob([s],{type:"application/json"}),u=URL.createObjectURL(bl),a=document.createElement("a");a.href=u;a.download=fn;document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(u);},200);}catch(e){}}
   msg.textContent=(shared?"เลือกที่เก็บ (เช่น iCloud/อีเมลตัวเอง) — ":(cp?"คัดลอกแล้ว + ":""))+"เก็บไฟล์ "+fn+" ไว้ที่ปลอดภัยนอกเครื่อง";};
  if(imp)imp.onclick=function(){ta.style.display="block";ta.value="";improw.style.display="flex";msg.textContent="วางข้อความสำรอง หรือเลือกไฟล์ แล้วกด กู้คืนเลย";try{ta.focus();}catch(e){}};
  if(file)file.onchange=function(e){var f=e.target.files&&e.target.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(){ta.value=rd.result;};rd.readAsText(f);};
  if(doimp)doimp.onclick=function(){var s=ta.value;if(!s){msg.textContent="ยังไม่มีข้อมูลให้กู้คืน";return;}if(!confirm("กู้คืนข้อมูลจากไฟล์สำรอง? ข้อมูลปัจจุบันจะถูกทับ"))return;var n=PT.backup.restore(s);if(n===null){msg.textContent="ไฟล์สำรองไม่ถูกต้อง ลองตรวจข้อความอีกครั้ง";return;}msg.textContent="กู้คืน "+n+" รายการแล้ว กำลังโหลดใหม่...";setTimeout(function(){location.reload();},700);};
 })();}};
/* --- render dispatch --- */
function render(){applySize();
 var app=document.getElementById("app");if(app){app.classList.toggle("mode-talk",S.mode==="talk");app.classList.toggle("mode-wordchoice",S.mode==="wordchoice");app.classList.toggle("mode-examprep",S.mode==="examprep");app.classList.toggle("mode-daily",S.mode==="daily");app.classList.toggle("mode-todayhub",S.mode==="todayhub");app.classList.toggle("mode-prachub",S.mode==="prachub");app.classList.toggle("mode-nodeck",!(S.mode==="browse"||S.mode==="cards"||S.mode==="quiz"));}
 if(S.mode!=="talk"&&PT.talk&&PT.talk.leave)PT.talk.leave();
 if(S.mode!=="shapes"&&PT.shapes&&PT.shapes.leave)PT.shapes.leave();
 if(S.mode!=="wordchoice"&&PT.wordchoice&&PT.wordchoice.leave)PT.wordchoice.leave();
 if(S.mode!=="examprep"&&PT.examprep&&PT.examprep.leave)PT.examprep.leave();
 if(S.mode!=="game"&&PT.game&&PT.game.leave)PT.game.leave();
 if(S.mode!=="campaign"&&PT.campaign&&PT.campaign.leave)PT.campaign.leave();
 if(S.mode!=="formal"&&PT.formal&&PT.formal.leave)PT.formal.leave();
 var noFilter=(S.mode==="talk"||S.mode==="wordchoice"||S.mode==="examprep"||S.mode==="daily"||S.mode==="todayhub"||S.mode==="prachub"||S.mode==="stats"||S.mode==="structure"||S.mode==="shapes"||S.mode==="game"||S.mode==="campaign"||S.mode==="formal");
 var fh=document.getElementById("filters");if(fh&&PT.filtersUI&&!noFilter)PT.filtersUI.render(fh);
 if(window.PT&&PT.hub&&PT.hub.syncPill)try{PT.hub.syncPill();}catch(e){}
 var v=document.getElementById("view");if(!v)return;
 if(S.mode==="browse"&&PT.browse)PT.browse.render(v);
 else if(S.mode==="cards"&&PT.cards)PT.cards.render(v);
 else if(S.mode==="quiz"&&PT.quiz)PT.quiz.render(v);
 else if(S.mode==="daily"&&PT.daily)PT.daily.render(v);
 else if(S.mode==="todayhub"&&PT.hub)PT.hub.render(v);
 else if(S.mode==="talk"&&PT.talk)PT.talk.render(v);
 else if(S.mode==="wordchoice"&&PT.wordchoice)PT.wordchoice.render(v);
 else if(S.mode==="examprep"&&PT.examprep)PT.examprep.render(v);
 else if(S.mode==="prachub"&&PT.prachub)PT.prachub.render(v);
 else if(S.mode==="game"&&PT.game)PT.game.render(v);
 else if(S.mode==="campaign"&&PT.campaign)PT.campaign.render(v);
 else if(S.mode==="formal"&&PT.formal)PT.formal.render(v);
 else if(S.mode==="structure"&&PT.structure)PT.structure.render(v);
 else if(S.mode==="shapes"&&PT.shapes)PT.shapes.render(v);
 else if(S.mode==="stats")PT.stats.render(v);
 if(PT.a11y&&PT.a11y.enhance)try{PT.a11y.enhance(document.getElementById("app"));}catch(e){}}
window.render=render;
/* --- switch tab programmatically (keeps tabbar highlight in sync) --- */
function goMode(m){S.mode=m;var par={browse:"browse",cards:"browse",structure:"browse",quiz:"prachub",wordchoice:"prachub",prachub:"prachub",game:"prachub",campaign:"prachub",formal:"prachub",talk:"examprep",shapes:"examprep",examprep:"examprep",todayhub:"todayhub",daily:"todayhub"}[m]||"";var tb=document.querySelectorAll(".tabbar button");[].forEach.call(tb,function(x){x.className=(x.getAttribute("data-mode")===par?"on":"");});if(m==="cards")S.session=null;render();}
window.goMode=goMode;
/* --- "วันนี้" (Today) summary panel, shown atop Browse --- */
PT.today={
 html:function(){var now=Date.now(),due=0,learn=0,newc=0,i,st,data=S.data||[];
  for(i=0;i<data.length;i++){st=PT.srs.statusOf(S.rec[keyOf(data[i])],now);if(st==="due")due++;else if(st==="learning")learn++;else if(st==="new")newc++;}
  var cap=(S.settings&&S.settings.newPerDay)||20,dl=PT.srs.dayLog?PT.srs.dayLog(S.deck):{n:0};
  var newLeft=Math.max(0,Math.min(newc,cap-(dl.n||0)));
  var stk=PT.srs.streak?PT.srs.streak():{current:0,today:0},goal=(S.settings&&S.settings.dailyGoal)||30,toRev=due+learn;
  var h='<div class="td-panel">';
  h+='<div class="td-hi"><span>🔥 '+stk.current+' วันติด</span><span>วันนี้ '+stk.today+' / '+goal+'</span></div>';
  h+='<div class="td-row">';
  h+='<button class="td-chip" data-td="due"><b>'+due+'</b><span>ถึงกำหนด</span></button>';
  h+='<button class="td-chip" data-td="learning"><b>'+learn+'</b><span>กำลังเรียน</span></button>';
  h+='<button class="td-chip" data-td="new"><b>'+newLeft+'</b><span>ใหม่วันนี้</span></button>';
  h+='</div>';
  var missN=(PT.miss&&PT.miss.count)?PT.miss.count(S.deck):0;
  h+='<button class="td-daily-btn" data-td="hub">📋 วันนี้ต้องทำอะไร — เปิดแผนวันนี้</button>';
  if(missN>0)h+='<button class="td-miss-btn" data-td="miss">📓 ทบทวนคำที่มักผิด '+missN+' คำ</button>';
  h+='<button class="td-start" data-td="start">▶ '+(toRev>0?("เริ่มทบทวน "+toRev+" ใบ"):"เริ่มเรียนคำใหม่")+'</button>';
  return h+'</div>';},
 wire:function(el){var btns=el.querySelectorAll("[data-td]");[].forEach.call(btns,function(b){b.onclick=function(){var k=b.getAttribute("data-td");
  if(k==="hub"){if(PT.hub&&PT.hub.start)PT.hub.start();else if(PT.daily)PT.daily.start();return;}
  if(k==="miss"){S.filter.status={};S.filter.groups={};S.filter.pos={};S.filter.fav=false;S.filter.miss=true;S.workingDirty=true;goMode("quiz");return;}
  if(k!=="start"){S.filter.status={};S.filter.status[k]=true;S.filter.fav=false;S.filter.miss=false;S.filter.groups={};S.workingDirty=true;}
  goMode("cards");};});}
};
/* --- deck load --- */
function loadDeck(id){S.deck=id;S.filter.groups={};S.filter.status={};S.filter.pos={};S.filter.fav=false;S.filter.miss=false;S.page=1;S.session=null;S.workingDirty=true;
 var sel=document.getElementById("deck");if(sel)sel.value=id;
 document.getElementById("view").innerHTML='<div class="empty">Loading…</div>';
 fetch("data/"+id+".json").then(function(r){return r.json();}).then(function(rows){
  var i,cnt={};for(i=0;i<rows.length;i++){var it=rows[i];if(PT.pos&&PT.pos.precompute)PT.pos.precompute(it);
   var gk=(id==="oxford")?(it.g||""):"*";cnt[gk]=(cnt[gk]||0)+1;it._no=cnt[gk];} // running number (oxford: per level, matches the daily plan)
  S.data=rows;S.rec=(PT.srs&&PT.srs.load)?PT.srs.load(id):{};S.workingDirty=true;render();
  if(PT.ja&&PT.ja.on())PT.ja.ensure(id,function(ok){if(!ok||S.deck!==id)return;PT.ja.attach(id);S.workingDirty=true;if(/^(browse|cards|daily)$/.test(S.mode))render();});
 }).catch(function(){document.getElementById("view").innerHTML='<div class="empty">โหลดข้อมูลไม่สำเร็จ — เช็คเน็ตแล้วลองใหม่</div>';});}
window.loadDeck=loadDeck;
/* --- bus wiring --- */
PT.bus.on("filterchange",function(){S.workingDirty=true;S.page=1;render();});
PT.bus.on("recchange",function(){S.workingDirty=true;render();});
"""

INIT_JS = r"""
/* --- shell wiring + init --- */
(function(){
 var w=document.getElementById("deckwrap"),s='<select class="deck" id="deck">',i;
 for(i=0;i<DORDER.length;i++)s+='<option value="'+DORDER[i]+'">'+esc(DECKS[DORDER[i]].name)+'</option>';
 w.innerHTML=s+'</select>';document.getElementById("deck").onchange=function(e){loadDeck(e.target.value);};
})();
document.getElementById("theme").onclick=function(){var dk=root.getAttribute("data-theme")==="dark"||(!root.getAttribute("data-theme")&&matchMedia("(prefers-color-scheme:dark)").matches);var nt=dk?"light":"dark";root.setAttribute("data-theme",nt);store.set("pt_theme",nt);};
document.getElementById("profile").onclick=function(){goMode("stats");};
document.getElementById("q").addEventListener("input",function(e){S.filter.q=e.target.value;PT.bus.emit("filterchange");});
var tb=document.querySelectorAll(".tabbar button");[].forEach.call(tb,function(b){b.onclick=function(){goMode(b.getAttribute("data-mode"));};});
var dseg=document.querySelectorAll("#dirseg button");[].forEach.call(dseg,function(b){b.onclick=function(){S.dir=b.getAttribute("data-dir");[].forEach.call(dseg,function(x){x.classList.toggle("on",x===b);});render();};});
var sz=store.get("pt_sz");if(sz==="l")S.size="l";
var zseg=document.querySelectorAll("#szseg button");[].forEach.call(zseg,function(b){b.classList.toggle("on",b.getAttribute("data-sz")===S.size);b.onclick=function(){S.size=b.getAttribute("data-sz");store.set("pt_sz",S.size);[].forEach.call(zseg,function(x){x.classList.toggle("on",x===b);});applySize();};});
if(PT.pwa&&PT.pwa.register)try{PT.pwa.register();}catch(e){}
document.getElementById("jatog").onclick=function(){if(PT.ja)PT.ja.toggle(!S.settings.showJa);};
if(PT.ja)PT.ja.syncDot();
/* gate the app behind the passcode on every load */
function startApp(){try{onboard();}catch(e){}loadDeck("oxford");}
try{showLock(startApp);}catch(e){startApp();}
"""

HTML_HEAD = """<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pocket Tutor">
<meta name="theme-color" content="#151420" media="(prefers-color-scheme:dark)">
<meta name="theme-color" content="#f4f2ec" media="(prefers-color-scheme:light)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-192.png">
<title>Pocket Tutor — English EN·TH</title>
"""

HTML_BODY = """</head>
<body>
<div id="app">
  <div class="top">
    <div class="hrow"><div class="mark"><button type="button" class="dot ja-off" id="jatog" aria-pressed="false" aria-label="แสดงภาษาญี่ปุ่น">あ</button><span class="apptitle" id="apptitle">Pocket Tutor</span><span id="deckwrap" style="flex:1;min-width:0"></span></div>
      <button class="icon" id="profile" aria-label="ของฉัน">☰</button>
      <button class="icon" id="theme" aria-label="Toggle theme">◐</button></div>
    <div class="row2">
      <input id="q" type="search" inputmode="search" placeholder="ค้นหา / เลขคำ #17 หรือ #17-32" aria-label="Search">
      <div class="seg" id="dirseg"><button data-dir="en" class="on">EN</button><button data-dir="th">TH</button></div>
      <div class="seg" id="szseg"><button data-sz="n" class="on">A</button><button data-sz="l">A+</button></div>
    </div>
    <div id="filters"></div>
  </div>
  <main id="view"></main>
  <nav class="tabbar">
    <button data-mode="todayhub" class="on"><span class="i">🎯</span>วันนี้</button>
    <button data-mode="browse"><span class="i">📚</span>คลัง</button>
    <button data-mode="prachub"><span class="i">✏️</span>ฝึก</button>
    <button data-mode="examprep"><span class="i">🎓</span>สอบ</button>
  </nav>
</div>
<div class="sheet-bg" id="sheetbg"></div>
<div class="sheet" id="sheet"></div>
"""


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    css = TOKENS + "\n" + "\n".join(f"/* {n}.css */\n" + rd(n, "css") for n in CSS_ORDER)
    mods = "\n".join(f"/* ===== module: {n} ===== */\n" + rd(n, "js") for n in JS_ORDER)
    ji = OUT.parent / "data" / "ja" / "index.json"
    ja_index = ji.read_text(encoding="utf-8").strip() if ji.exists() else '{"v":1,"files":{}}'
    html = (HTML_HEAD + "<style>\n" + css + "\n</style>\n" + HTML_BODY +
            "<script>\n" + HOST_JS.replace("__JA_INDEX__", ja_index) + "\n" + mods + "\n" + INIT_JS + "\n</script>\n</body></html>")
    OUT.write_text(html, encoding="utf-8")
    kb = round(len(html.encode()) / 1024)
    missing = [n for n in JS_ORDER if not (MODS / (n + ".js")).exists()]
    print(f"Wrote {OUT.name}: {kb} KB. Missing module js: {missing or 'none'}")


if __name__ == "__main__":
    main()
