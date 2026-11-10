/*
 * The Settings screen, in the family's order: Account · Appearance · Quotation details (this
 * tool's) · Connections (with Advanced on a local page) · This browser. It works logged out.
 * Adapted from Suppliers' settings-view.js. ctx: { login(), logout(), clearLocal() }.
 */
import * as settings from "./settings.js";
import { cfg, isServiceUrl, localPage } from "./settings.js";
import * as auth from "./auth.js";
import { larkService, ceService, onAnyService } from "./net.js";
import { ENV_LABEL, SERVICES } from "./config.js";
import { $, h, ic, initTheme, toast, fmt } from "./ui.js";

const sessionLine = () => `Logged in until ${fmt.time(auth.endsAt())} · ${fmt.duration(auth.msLeft())} left`;
const initials = (name) => (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function serviceLine(svc, overrideLabel) {
  const s = svc.status;
  const [tone, text] = {
    unset: ["", "Not set. Add its address under Advanced."],
    unknown: ["", "Not checked yet"],
    waking: ["is-warn", "Waking up… It sleeps when nobody's using it. This can take up to a minute."],
    awake: ["is-ok", `Awake${s.version ? ` · v${s.version}` : ""}`],
    down: ["is-err", `Unreachable (${s.detail || "no answer"}). Appraisal keeps trying when you use it.`],
    blocked: ["is-err", "Blocked by an ad blocker or privacy extension in this browser. Allow the address below, then reload."],
    outdated: ["is-warn", `Out of date (${s.detail}). Ask the admin to redeploy it.`],
  }[svc.url() ? s.state : "unset"] || ["", ""];
  const mine = cfg().overrides.filter((o) => o.startsWith(overrideLabel));
  const note = mine.length ? (mine.some((o) => o.includes("page link")) ? " (test address from the page link; open the page with ?reset to go back)" : " (test address from Advanced)") : "";
  const backup = s.backup ? " (the backup: the usual one can't be reached)" : "";
  return [tone, `${text}${svc.host() ? ` · ${svc.host()}` : ""}${backup}${note}`];
}

export function createSettingsView(ctx) {
  function paintAccount() {
    const box = $("#account");
    if (auth.currentToken()) {
      const u = auth.user() || {};
      const pic = u.avatar ? h("img", { class: "avatar", src: u.avatar, alt: "", referrerpolicy: "no-referrer" })
        : h("span", { class: "avatar avatar-initials", "aria-hidden": "true" }, initials(u.name));
      box.replaceChildren(pic,
        h("div", { class: "account-text" }, h("b", null, u.name || "Logged in with Lark"), h("span", { id: "accSession" }, sessionLine())),
        h("div", { class: "account-actions" },
          h("button", { type: "button", class: "btn btn-sm", onclick: () => ctx.login(location.hash) }, "Log in again"),
          h("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => ctx.logout() }, ic("logout"), "Log out")));
    } else {
      box.replaceChildren(
        h("div", { class: "account-text" }, h("b", null, "You're not logged in."),
          h("span", null, "Log in with Lark to draft estimates. A login lasts about 2 hours.")),
        h("div", { class: "account-actions" },
          h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => ctx.login("#/") }, "Log in with Lark")));
    }
  }

  function paintPreparer() {
    const p = settings.preparer();
    for (const [id, v] of [["#prepName", p.name], ["#prepTitle", p.title], ["#prepEmail", p.email]]) {
      if (document.activeElement !== $(id)) $(id).value = v;
    }
  }

  function paintConnections() {
    const lark = serviceLine(larkService, "Connection service");
    const ce = serviceLine(ceService, "Estimate service");
    const kb = (ceService.status.info || {}).knowledge_base;
    const fix = (svc) => h("button", { type: "button", class: "btn btn-sm", onclick: () => { svc.wake({ force: true }); paintConnections(); } },
      ["down", "outdated", "blocked"].includes(svc.status.state) ? "Try again" : "Wake up");
    $("#connList").replaceChildren(
      h("li", null, h("span", { class: `dot ${lark[0]}`.trim() }),
        h("span", { class: "status-text" }, h("b", null, "Connection service"), h("span", null, lark[1])), fix(larkService)),
      h("li", null, h("span", { class: `dot ${ce[0]}`.trim() }),
        h("span", { class: "status-text" }, h("b", null, "Estimate service"), h("span", null, ce[1])), fix(ceService)),
      kb ? h("li", null, h("span", { class: `dot ${kb.loaded ? "is-ok" : "is-warn"}` }),
        h("span", { class: "status-text" }, h("b", null, "Price knowledge base"),
          h("span", null, kb.loaded ? `${fmt.plural(kb.items, "catalogue item")} · ${fmt.plural(kb.projects, "past CE")} · built ${kb.version}`
            : "Not uploaded yet. Ask the admin to add kb.json to the estimate service."))) : null);
    $("#envNote").hidden = !ENV_LABEL;
    $("#envNote").textContent = ENV_LABEL ? `Appraisal is in its ${ENV_LABEL.toLowerCase()} setup. To go live, set APP.env in js/config.js.` : "";
  }

  function paint() { paintAccount(); paintPreparer(); paintConnections(); }

  function show() {
    $("#advanced").hidden = !localPage;
    const s = settings.get();
    if (document.activeElement !== $("#proxyInput")) $("#proxyInput").value = s.larkUrl || "";
    if (document.activeElement !== $("#ceInput")) $("#ceInput").value = s.ceUrl || "";
    $("#proxyInput").placeholder = SERVICES.lark.urls[0];
    $("#ceInput").placeholder = SERVICES.ce.urls[0] || "http://127.0.0.1:8002";
    if (!larkService.isFresh()) larkService.wake();
    if (!ceService.isFresh()) ceService.wake();
    paint();
  }

  function mount() {
    initTheme($("#themeSeg"), "appraisal.theme");
    const savePrep = () => {
      const email = $("#prepEmail").value.trim();
      settings.set({ preparedName: $("#prepName").value.trim(), preparedTitle: $("#prepTitle").value.trim(), preparedEmail: email });
    };
    for (const id of ["#prepName", "#prepTitle", "#prepEmail"]) $(id).addEventListener("change", () => { savePrep(); toast("Saved. New quotations will use these details.", { type: "success" }); });

    const saveAddr = (key, input, svc, label) => {
      const v = input.value.trim();
      if (v && !isServiceUrl(v)) { toast("Use an https:// address, or http:// for one on this computer.", { type: "error" }); return; }
      settings.set({ [key]: v });
      toast(v ? `Using that ${label} on this computer.` : `Using the hosted ${label}.`, { type: "success" });
      svc.wake({ force: true });
      paintConnections();
    };
    $("#proxySave").addEventListener("click", () => saveAddr("larkUrl", $("#proxyInput"), larkService, "connection service"));
    $("#proxyReset").addEventListener("click", () => { $("#proxyInput").value = ""; saveAddr("larkUrl", $("#proxyInput"), larkService, "connection service"); });
    $("#ceSave").addEventListener("click", () => saveAddr("ceUrl", $("#ceInput"), ceService, "estimate service"));
    $("#ceReset").addEventListener("click", () => { $("#ceInput").value = ""; saveAddr("ceUrl", $("#ceInput"), ceService, "estimate service"); });
    $("#clearLocal").addEventListener("click", () => ctx.clearLocal());
    onAnyService(() => { if (document.body.dataset.view === "settings") paintConnections(); });
  }

  function tick() {
    const line = document.getElementById("accSession");
    if (line && auth.currentToken()) line.textContent = sessionLine();
  }

  return { mount, show, paint, tick };
}
