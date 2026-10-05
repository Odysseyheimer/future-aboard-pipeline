// Loads the REAL output/ptmods/ja.js in a sandbox and checks it against golden.json
// and (if present) every key of every shipped sidecar. Exit 1 on any mismatch.
var fs = require("fs"), path = require("path"), vm = require("vm");
var ROOT = path.resolve(__dirname, "../../..");
var src = fs.readFileSync(path.join(ROOT, "output/ptmods/ja.js"), "utf8");
var ctx = { PT: {}, window: {}, esc: function (s) { return String(s); }, store: { get: function () { return null; }, set: function () {} },
            JA_INDEX: { v: 1, files: {} }, console: console };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
var J = ctx.PT.ja, bad = 0, n = 0;
var g = JSON.parse(fs.readFileSync(path.join(__dirname, "golden.json"), "utf8"));
g.norm.forEach(function (c) { n++; if (J._norm(c[0]) !== c[1]) { bad++; console.log("NORM", JSON.stringify(c)); } });
g.key.forEach(function (c) { n++; if (J._key(c[0], c[1], c[2]) !== c[3]) { bad++; console.log("KEY", JSON.stringify(c), J._key(c[0], c[1], c[2])); } });
g.gloss.forEach(function (c) { n++; var it = c[0]; if (J._glossSrc(it) !== c[1] || (it.w + "|" + it.g) !== c[2]) { bad++; console.log("GLOSS", JSON.stringify(c)); } });
// every shipped sidecar: recompute each key from the build's own manifest of (scope, en)
var man = path.join(__dirname, "reports", "keys_manifest.json");
if (fs.existsSync(man)) {
  var M = JSON.parse(fs.readFileSync(man, "utf8"));
  Object.keys(M).forEach(function (file) {
    var m = M[file];
    m.rows.forEach(function (r) { n++; if (J._key(r[0], r[1], m.salt) !== r[2]) { bad++; if (bad < 20) console.log("SIDECAR", file, JSON.stringify(r)); } });
  });
}
console.log((bad ? "PARITY FAIL" : "PARITY OK") + " — " + n + " checks, " + bad + " mismatches");
process.exit(bad ? 1 : 0);
