/* Preview mode, for checking Appraisal's screens without a Lark login or the estimate service
   (adapted from Suppliers' tests/preview-shim.js). Loaded by index.html only on 127.0.0.1 /
   localhost with ?preview.

   Appraisal runs unchanged, but the connection service and the estimate service are answered
   here: POST /appraise returns tests/fixture.json, a MADE-UP appraisal (invented prices), after a
   short wait. Nothing is sent anywhere. The fake login lives under mineski.preview.auth.* (see
   js/session.js), so it never replaces a real one. */
(function () {
  "use strict";
  var realFetch = window.fetch.bind(window);
  window.MINESKI_PREVIEW = true;
  localStorage.setItem("mineski.preview.auth.user", JSON.stringify({ name: "Preview Mode", avatar: "", email: "" }));
  localStorage.setItem("mineski.preview.auth.token", JSON.stringify({ access_token: "preview-only", scope: "bitable:app", expires_at: Date.now() + 95 * 60000 }));

  var json = function (obj, ms, status) {
    return new Promise(function (res) {
      setTimeout(function () { res(new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json" } })); }, ms || 150);
    });
  };
  var CE_INFO = { service: "anthropic-ce", version: "1.2.0", api: 1, runtime: "preview", model: "claude-opus-5-5", configured: true,
    knowledge_base: { loaded: true, version: "preview", items: 3, projects: 0 }, cors: { allow_headers: ["Content-Type", "Authorization"] },
    limits: { max_upload_mb: 30, max_files: 8 } };

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input.url;
    if (/anthropic-ce[^/]*\/?$/.test(url) || /127\.0\.0\.1:8002\/?$/.test(url)) return json(CE_INFO, 120);
    if (/(onrender\.com|workers\.dev)\/?$/.test(url)) return json({ service: "lark-cors-proxy", version: "2.0.0", cors: { allow_headers: ["Authorization"] } }, 120);
    var m = url.match(/\/proxy\?url=([^&]+)/);
    if (!m) return realFetch(input, init);
    var target = decodeURIComponent(m[1]);
    if (/\/authen\/v1\/authorize/.test(target)) return Promise.resolve(new Response("<html>preview</html>", { status: 200 }));
    if (/\/authen\/v1\/user_info/.test(target)) return json({ code: 0, data: { name: "Preview Mode" } });
    return json({ code: 99999, msg: "preview mode: no answer for " + target });
  };

  // POST /appraise goes through XMLHttpRequest (for upload progress): answer it from the fixture.
  var RealXHR = window.XMLHttpRequest;
  function FakeXHR() { this.upload = {}; this.status = 0; this.response = null; this.responseType = ""; }
  FakeXHR.prototype.open = function (method, url) { this._url = url; };
  FakeXHR.prototype.setRequestHeader = function () {};
  FakeXHR.prototype.getResponseHeader = function () { return null; };
  FakeXHR.prototype.abort = function () { clearTimeout(this._t); if (this.onabort) this.onabort(); };
  FakeXHR.prototype.send = function () {
    var self = this;
    if (!/\/appraise$/.test(this._url)) { var x = new RealXHR(); return x; }
    setTimeout(function () { if (self.upload.onprogress) self.upload.onprogress({ lengthComputable: true, loaded: 1, total: 1 }); if (self.upload.onload) self.upload.onload(); }, 400);
    self._t = setTimeout(function () {
      realFetch("tests/fixture.json?v=" + Date.now()).then(function (r) { return r.json(); }).then(function (body) {
        self.status = 200; self.response = body; if (self.onload) self.onload();
      });
    }, 3500);
  };
  window.XMLHttpRequest = FakeXHR;

  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("div");
    b.className = "override-badge no-print";
    b.textContent = "Preview mode: sample data, nothing is sent anywhere";
    b.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:200;box-shadow:var(--shadow-md);pointer-events:none";
    document.body.appendChild(b);
  });
})();
