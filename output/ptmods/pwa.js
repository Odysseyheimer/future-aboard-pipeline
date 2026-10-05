/* Pocket Tutor v2 - module "pwa" (pwa-offline)
   Registers the offline service worker AND surfaces updates to the user with a
   one-tap "new version available" banner, so they never have to close/reopen the
   app twice to get new content. ES5-safe, no external libs.
   Exposes: PT.pwa.register(), PT.pwa.version(cb)
*/
(function () {
  "use strict";
  window.PT = window.PT || {};
  var _reg = null, _reloading = false;

  function showUpdateBanner(waitingWorker) {
    if (document.getElementById("pt-update-bar")) return;
    var bar = document.createElement("div");
    bar.id = "pt-update-bar";
    bar.setAttribute("style",
      "position:fixed;left:12px;right:12px;bottom:74px;z-index:9999;" +
      "display:flex;align-items:center;gap:10px;" +
      "background:#e0942f;color:#fff;border-radius:14px;padding:12px 14px;" +
      "font:600 14px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.28);");
    bar.innerHTML =
      '<span style="flex:1">✨ มีเนื้อหาใหม่พร้อมแล้ว</span>' +
      '<button id="pt-update-go" style="flex:0 0 auto;background:#fff;color:#b06a12;border:none;' +
      'border-radius:999px;padding:8px 14px;font:800 13px sans-serif;cursor:pointer">อัปเดต</button>' +
      '<button id="pt-update-x" aria-label="ปิด" style="flex:0 0 auto;background:transparent;color:#fff;' +
      'border:none;font-size:18px;line-height:1;cursor:pointer;padding:4px">×</button>';
    document.body.appendChild(bar);
    document.getElementById("pt-update-go").onclick = function () {
      try { if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" }); } catch (e) {}
      // fallback: navigation is network-first now, so a plain reload gets fresh HTML too
      setTimeout(function () { if (!_reloading) { _reloading = true; window.location.reload(); } }, 400);
    };
    document.getElementById("pt-update-x").onclick = function () {
      var el = document.getElementById("pt-update-bar"); if (el && el.parentNode) el.parentNode.removeChild(el);
    };
  }

  function watch(reg) {
    _reg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
    reg.addEventListener("updatefound", function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", function () {
        if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(nw);
      });
    });
  }

  PT.pwa = {
    register: function () {
      if (!("serviceWorker" in navigator)) return;
      if (window.location && window.location.protocol === "file:") return;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (_reloading) return; _reloading = true; window.location.reload();
      });
      window.addEventListener("load", function () {
        try {
          navigator.serviceWorker.register("./sw.js").then(function (reg) {
            watch(reg);
            try { reg.update(); } catch (e) {}
            document.addEventListener("visibilitychange", function () {
              if (!document.hidden && _reg) { try { _reg.update(); } catch (e) {} }
            });
          }, function () { /* registration rejected - offline just unavailable */ });
        } catch (e) { /* never let PWA setup break the app */ }
      });
    },
    version: function (cb) {
      try {
        if (!navigator.serviceWorker || !navigator.serviceWorker.controller) { cb(""); return; }
        var ch = new MessageChannel();
        ch.port1.onmessage = function (e) { cb((e.data && e.data.version) || ""); };
        navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [ch.port2]);
      } catch (e) { cb(""); }
    }
  };
})();
