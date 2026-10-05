/* toon.js — PT.toon: tiny cartoon-character + celebration helpers (emoji-as-character
   + CSS animation, offline/ES5, no images). Used by the campaign for animated NPCs,
   heroes, and win confetti. Apple emoji render as cute cartoon characters on iOS. */
PT.toon = (function () {
  "use strict";
  // an animated character: a big emoji face over a soft shadow. cls adds behaviour
  // (toon-in / toon-talk / toon-win / toon-sad / toon-walk).
  function char(face, cls) {
    return '<div class="toon ' + (cls || "") + '"><div class="toon-face">' + face + '</div><div class="toon-shadow"></div></div>';
  }
  // burst of falling confetti over the whole screen; auto-removes.
  function confetti(n) {
    var host = document.getElementById("view"); if (!host) return;
    n = n || 30;
    var old = host.querySelector(".toon-confetti"); if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement("div"); wrap.className = "toon-confetti";
    var cols = ["#e0942f", "#7c3aed", "#0891b2", "#16a34a", "#db2777", "#f59e0b", "#ef4444", "#3b82f6"];
    for (var i = 0; i < n; i++) {
      var p = document.createElement("i");
      var sz = (6 + Math.random() * 7);
      p.style.left = Math.round(Math.random() * 100) + "%";
      p.style.background = cols[i % cols.length];
      p.style.width = sz.toFixed(1) + "px";
      p.style.height = (sz * 0.62).toFixed(1) + "px";
      p.style.animationDelay = (Math.random() * 0.45).toFixed(2) + "s";
      p.style.animationDuration = (1.1 + Math.random() * 1.2).toFixed(2) + "s";
      p.style.setProperty("--r", Math.round(Math.random() * 720 - 360) + "deg");
      if (i % 3 === 0) p.style.borderRadius = "50%";
      wrap.appendChild(p);
    }
    host.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 2800);
  }
  return { char: char, confetti: confetti };
})();
