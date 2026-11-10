/*
 * Appraisal: the page shell. State, routes, the header, the login, the brief form, the draft
 * request, the quotation and Settings. Login, sessions and the connection services are the
 * family's (auth.js, net.js, session.js, copied from Suppliers).
 *
 * Routes: #/ the brief (the task) · #/quote the drafted quotation · #/settings.
 *
 * The drafted quotation and the typed brief are kept in this tab only (sessionStorage), so a
 * reload or a re-login doesn't lose them; they go when the tab closes or a login ends. The files
 * themselves are never stored.
 */
import { APP, ENV_LABEL, RULES } from "./config.js";
import { $, $$, h, ic, fillIcons, toast, fmt, store, recall, busy, closeMenu } from "./ui.js";
import * as settings from "./settings.js";
import { cfg } from "./settings.js";
import { larkService, ceService, onAnyService, blockedHosts } from "./net.js";
import * as auth from "./auth.js";
import * as D from "./doc.js";
import { send, estimate, remember, resetEstimate, limits, acceptable } from "./estimate.js";
import { createQuote } from "./quote.js";
import { createSettingsView } from "./settings-view.js";

const KEY = { draft: "appraisal.draft", compose: "appraisal.compose", costs: "appraisal.costs" };
const LOW_SESSION_MS = 10 * 60 * 1000;
const localKeys = () => ["appraisal.settings", "appraisal.etaSeconds", KEY.costs];

/* ======================= state ======================= */
const S = {
  view: "login",          // login | busy | compose | working | quote | settings
  files: [],              // File objects for the next draft (never stored)
  doc: null,              // the drafted quotation (doc.js)
  costs: !!recall("local", KEY.costs),   // show internal costs on screen
  run: null,              // the draft in flight: { abort, started, eta }
  user: null, loginNote: "", returnTo: "",
};

const todayISO = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

/* ======================= views ======================= */
const quote = createQuote({
  doc: () => S.doc,
  costs: () => S.costs,
  changed: ({ quiet = false } = {}) => { saveDraft(); quote.paintTotals(); paintNotes(); if (!quiet) { /* numbers redrawn */ } },
  toast,
});
const settingsView = createSettingsView({
  login: (r) => login(r),
  logout: () => { dropDraft(); auth.logout(); location.hash = "#/"; },
  clearLocal: () => clearLocal(),
});

/* ======================= routes ======================= */
function parseRoute() {
  const hash = location.hash || "#/";
  if (/^#\/settings\b/.test(hash)) return "settings";
  if (/^#\/quote\b/.test(hash)) return "quote";
  return "compose";
}

function onRoute() {
  const r = parseRoute();
  if (r === "settings") S.view = "settings";
  else if (!auth.currentToken()) { S.view = "login"; S.returnTo = location.hash || "#/"; }
  else if (S.run) S.view = "working";
  else if (r === "quote" && S.doc) S.view = "quote";
  else {
    if (r === "quote") history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    S.view = "compose";
  }
  render();
  window.scrollTo(0, 0);
}

/* ======================= rendering ======================= */
function pageTitle() {
  if (S.view === "quote" && S.doc) return `${S.doc.project.title || "Quotation"} · ${APP.name}`;
  return `${{ login: "Log in", busy: "Logging in", compose: "New estimate", working: "Drafting", settings: "Settings" }[S.view]} · ${APP.name}`;
}

function render() {
  for (const v of $$(".view")) v.classList.toggle("active", v.dataset.view === S.view);
  document.body.dataset.view = S.view;
  document.title = pageTitle();
  renderHeader();
  paintBlock();
  if (S.view === "login") renderLogin();
  if (S.view === "settings") settingsView.show();
  if (S.view === "compose") renderCompose();
  if (S.view === "quote") renderQuote();
}

const initials = (name) => (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

function renderHeader() {
  $("#appVersion").textContent = $("#loginVersion").textContent = `v${APP.version}`;
  $("#appVersion").title = `${APP.name} version ${APP.version}`;
  const signedIn = !!auth.currentToken();
  $("#envBadge").hidden = !ENV_LABEL;
  $("#envBadge").textContent = ENV_LABEL;
  const over = cfg().overrides;
  $("#overrideBadge").hidden = !over.length;
  $("#overrideBadge").title = over.length ? `Overridden in this browser. ${over.join(". ")}` : "";
  $("#sessionPill").hidden = !signedIn;
  $("#meLink").hidden = !signedIn;
  $("#newLink").hidden = !signedIn;
  $("#quoteLink").hidden = !signedIn || !S.doc;
  for (const a of $$(".nav a")) {
    const on = a.dataset.nav === S.view || (a.dataset.nav === "compose" && S.view === "working");
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  if (signedIn) {
    const left = auth.msLeft();
    $("#sessionLeft").textContent = fmt.duration(left);
    $("#sessionPill").classList.toggle("is-low", left < LOW_SESSION_MS);
    $("#sessionPill").title = `Your login lasts until ${fmt.time(auth.endsAt())}`;
    $("#sessionPill").setAttribute("aria-label", `Logged in for ${fmt.duration(left)} more, until ${fmt.time(auth.endsAt())}`);
    const u = S.user || auth.user() || {};
    $("#avatar").hidden = !u.avatar;
    if (u.avatar && $("#avatar").getAttribute("src") !== u.avatar) $("#avatar").src = u.avatar;
    $("#initials").hidden = !!u.avatar;
    $("#initials").textContent = initials(u.name);
    $("#meLink").title = u.name ? `${u.name} · Settings` : "Settings";
  }
}

function paintBlock() {
  const hosts = blockedHosts();
  $("#blockNote").hidden = !hosts.length;
  $("#blockHost").textContent = hosts.join(", ") || larkService.host();
}

/* ======================= login ======================= */
let probed = null;
function renderLogin() {
  const note = $("#loginMsg");
  note.hidden = !S.loginNote;
  note.textContent = S.loginNote;
  if (probed !== S.loginNote) {
    probed = S.loginNote;
    larkService.wake();
    auth.redirectProblem().then((problem) => {
      $("#redirectMsg").hidden = !problem;
      $("#redirectMsg").textContent = problem || "";
    });
  }
}

async function login(returnTo) {
  try {
    await auth.startLogin(returnTo || S.returnTo || "#/");
  } catch (e) {
    S.loginNote = e.message;
    if (S.view === "login") renderLogin(); else toast(e.message, { type: "error" });
  }
}
// What's typed survives the trip to Lark's page.
auth.onBeforeLogin(() => saveCompose());

function sessionEnded(message) {
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
  closeMenu();
  if (S.run) { S.run.abort(); S.run = null; }
  dropDraft();
  S.loginNote = message || "Your login ended after about 2 hours. Log in again to keep going.";
  S.returnTo = location.hash || "#/";
  if (S.view !== "settings") S.view = "login";
  render();
}
auth.onEnded(sessionEnded);

function sharedLogin({ renewed }) {
  S.loginNote = "";
  const was = (S.user || {}).email || (S.user || {}).name || "";
  auth.loadUser().then((u) => {
    const now = (u || {}).email || (u || {}).name || "";
    if (was && now && was !== now) { dropDraft(); S.user = u; onRoute(); return; }
    S.user = u;
    renderHeader();
    if (S.view === "settings") settingsView.paint();
  }).catch(() => {});
  if (renewed) { renderHeader(); if (S.view === "settings") settingsView.tick(); return; }
  if (S.view !== "busy") onRoute();
}
auth.onShared(sharedLogin);

/* ======================= the brief ======================= */
const INPUT_IDS = ["budget", "budgetBasis", "vat", "eventDays", "audience", "cities", "talents", "entity", "notes"];
function readInputs() {
  const v = (id) => $(`#in-${id}`).value.trim();
  return {
    budget: v("budget").replace(/[₱,\s]/g, ""), budget_basis: v("budgetBasis"), vat: v("vat"), event_days: v("eventDays"),
    audience: v("audience"), cities: v("cities"), talents: v("talents"), entity: v("entity"), notes: v("notes"), today: todayISO(),
  };
}
function saveCompose() {
  const vals = Object.fromEntries(INPUT_IDS.map((id) => [id, $(`#in-${id}`).value]));
  store("session", KEY.compose, { text: $("#briefText").value, vals });
}
function restoreCompose() {
  const c = recall("session", KEY.compose);
  if (!c) return;
  $("#briefText").value = c.text || "";
  for (const [id, v] of Object.entries(c.vals || {})) if ($(`#in-${id}`)) $(`#in-${id}`).value = v;
}

function renderFiles() {
  const lim = limits();
  const total = S.files.reduce((n, f) => n + f.size, 0);
  $("#fileList").replaceChildren(...S.files.map((f, i) => h("li", { class: "chip" }, ic("file"), h("span", null, f.name),
    h("span", { class: "muted" }, `${(f.size / 1048576).toFixed(1)} MB`),
    h("button", { type: "button", class: "icon-btn plain icon-sm", "aria-label": `Remove ${f.name}`, title: "Remove", onclick: () => { S.files.splice(i, 1); renderFiles(); } }, ic("x")))));
  $("#fileList").hidden = !S.files.length;
  const over = total > lim.maxUploadMb * 1048576 || S.files.length > lim.maxFiles;
  $("#fileNote").textContent = over ? `That's more than ${lim.maxFiles} files or ${lim.maxUploadMb} MB. Remove a file first.` : "";
  $("#fileNote").hidden = !over;
  paintGo();
}

function paintGo() {
  const has = S.files.length || $("#briefText").value.trim();
  const lim = limits();
  const over = S.files.reduce((n, f) => n + f.size, 0) > lim.maxUploadMb * 1048576 || S.files.length > lim.maxFiles;
  $("#goBtn").disabled = !has || over;
  $("#composeHint").textContent = has ? `Usually about ${fmt.duration(estimate(S.files) * 1000).replace("0m", "1m")}. You can edit everything after.`
    : "Add the client's brief to get started.";
}

function addFiles(list) {
  const bad = [];
  for (const f of list) {
    if (!acceptable(f)) { bad.push(f.name); continue; }
    if (!S.files.some((x) => x.name === f.name && x.size === f.size)) S.files.push(f);
  }
  if (bad.length) toast(`${bad.join(", ")} can't be read here. Save ${bad.length === 1 ? "it" : "them"} as a PDF, then add ${bad.length === 1 ? "it" : "them"} again.`, { type: "warn" });
  renderFiles();
}

function renderCompose() {
  $("#resumeBanner").hidden = !S.doc;
  if (S.doc) $("#resumeTitle").textContent = S.doc.project.title || "Untitled quotation";
  renderFiles();
  if (!ceService.isFresh()) ceService.wake();
}

/* ======================= drafting ======================= */
const STAGES = [["send", "Sending the brief"], ["draft", "Reading the brief and drafting the lines"], ["price", "Pricing the lines from past CEs"]];
function paintStages(current, sub) {
  const at = STAGES.findIndex(([id]) => id === current);
  $("#stages").replaceChildren(...STAGES.map(([id, label], i) => h("li", { class: i < at ? "done" : i === at ? "current" : "" },
    i < at ? ic("check") : i === at ? h("span", { class: "spinner", "aria-hidden": "true" }) : h("span", { class: "slot" }), label)));
  $("#stageLabel").textContent = `${STAGES[at][1]}…`;
  if (sub) $("#stageSub").textContent = sub;
}

async function draft() {
  if (S.run) return;
  const left = auth.msLeft();
  if (left < 6 * 60000) {
    toast("Your login is about to end, so this wasn't sent.", { type: "warn", detail: "Log in again, then try it.", action: "Log in again", onAction: () => login("#/") });
    return;
  }
  saveCompose();
  const files = [...S.files];
  const text = $("#briefText").value.trim();
  const inputs = readInputs();
  const eta = estimate(files);
  const started = Date.now();
  if (!await ceService.wake()) {
    toast("Appraisal can't reach its estimate service right now.", { type: "error",
      detail: ceService.status.state === "unset" ? "Its address isn't set up yet. See Settings > Connections." : "It may still be waking up. Try again in a moment." });
    return;
  }
  const req = send(files, text, inputs, {
    onUploadProgress: (f) => paintStages("send", files.length ? `${Math.round(f * 100)}% sent` : ""),
    onUploaded: () => paintStages("draft", `Usually about ${Math.round(eta / 10) * 10 || 60} seconds.`),
    onBackup: () => paintStages("send", "Switching to the backup service…"),
  });
  S.run = { abort: req.abort, started, eta };
  S.view = "working";
  render();
  paintStages(files.length ? "send" : "draft", files.length ? "" : `Usually about ${Math.round(eta / 10) * 10 || 60} seconds.`);
  const slow = setInterval(() => {
    if (!S.run) return;
    const waited = (Date.now() - started) / 1000;
    if (waited > eta * 1.3) $("#stageSub").textContent = "Still working… Long briefs take longer.";
  }, 5000);
  try {
    const out = await auth.track(req.promise);
    paintStages("price", "");
    remember((Date.now() - started) / 1000);
    S.doc = D.fromAppraisal(out.appraisal, { today: todayISO(), validDays: RULES.validDays, entity: inputs.entity || "PDEI",
      preparer: settings.preparer(), inputs });
    saveDraft();
    S.run = null;
    location.hash = "#/quote";
    onRoute();
    const st = out.appraisal.stats || {};
    toast(`Drafted ${fmt.plural(st.lines || D.allLines(S.doc).length, "line")}.`, { type: "success",
      detail: st.estimate ? `${st.estimate} ${st.estimate === 1 ? "is an estimate" : "are estimates"} with no price history: check the flagged lines.` : "Every price comes from past CEs or the brief." });
  } catch (err) {
    S.run = null;
    if (err.code === "aborted") { onRoute(); return; }
    S.view = "compose";
    render();
    toast(err.message, { type: "error", detail: "Your brief and inputs are still here." });
  } finally {
    clearInterval(slow);
  }
}

/* ======================= the quotation ======================= */
function saveDraft() { if (S.doc) store("session", KEY.draft, { doc: S.doc, at: Date.now() }); }
function dropDraft() { S.doc = null; store("session", KEY.draft, undefined); }
function loadDraft() {
  const d = recall("session", KEY.draft);
  S.doc = d && d.doc ? D.normalize(d.doc) : null;
}

function renderQuote() {
  $("#costsBtn").setAttribute("aria-pressed", String(S.costs));
  $("#costsBtn").querySelector(".label").textContent = S.costs ? "Hide costs" : "Show costs";
  quote.render();
  paintNotes();
}

function list(items) { return items.length ? h("ul", null, ...items.map((t) => h("li", null, t))) : h("p", { class: "muted" }, "None."); }

function paintNotes() {
  if (!S.doc) return;
  const n = S.doc.notes;
  const t = D.totals(S.doc);
  const budget = n.budget || 0;
  let budgetLine = null;
  if (budget) {
    const target = n.budget_basis === "VAT_EX" ? t.subtotal : t.grand;
    const gap = target - budget;
    budgetLine = h("p", { class: Math.abs(gap) <= budget * 0.05 ? "ok-text" : gap > 0 ? "warn-text" : "" },
      Math.abs(gap) <= budget * 0.05 ? `Within 5% of the ${fmt.peso(budget)} budget.`
        : gap > 0 ? `${fmt.peso(gap)} over the ${fmt.peso(budget)} budget. Lower markups first, then unit costs, then scope.`
          : `${fmt.peso(-gap)} under the ${fmt.peso(budget)} budget.`);
  }
  const estimates = D.allLines(S.doc).filter((l) => (l.source || {}).kind === "estimate").length;
  $("#notes").replaceChildren(
    h("section", { class: "card card-pad stack" },
      h("h2", { class: "subhead" }, "Internal only"),
      h("dl", { class: "facts" },
        h("dt", null, "Our cost"), h("dd", { class: "num" }, fmt.peso(t.base)),
        h("dt", null, "Gross profit"), h("dd", { class: "num" }, `${fmt.peso(t.gp)} (${D.pct(t.gp_margin)})`),
        h("dt", null, "Grand total"), h("dd", { class: "num" }, fmt.peso(t.grand))),
      budgetLine,
      estimates ? h("p", { class: "warn-text" }, `${estimates} ${estimates === 1 ? "line is an estimate" : "lines are estimates"} with no price history. Get quotes before sending.`) : null,
      h("p", { class: "hint" }, "Costs, markups and these notes never appear in the PDF.")),
    h("details", { class: "card card-pad", open: true }, h("summary", { class: "subhead" }, `Questions for the client (${n.clarifications.length})`), list(n.clarifications)),
    h("details", { class: "card card-pad" }, h("summary", { class: "subhead" }, `Assumptions (${n.assumptions.length})`), list(n.assumptions)),
    h("details", { class: "card card-pad" }, h("summary", { class: "subhead" }, `Left out (${n.excluded.length})`), list(n.excluded)),
    h("details", { class: "card card-pad" }, h("summary", { class: "subhead" }, `Checks (${(n.checks || []).length})`), list((n.checks || []).map((c) => c.text))));
}

function printPdf() {
  const title = document.title;
  const p = S.doc.project;
  document.title = `Quotation - ${[p.code, p.title].filter(Boolean).join(" ") || "Mineski"}`;   // the PDF's file name
  for (const el of $$(".ed:empty")) el.classList.add("is-blank");
  const done = () => { document.title = title; removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  window.print();
}

function startOver() {
  if (!S.doc) { location.hash = "#/"; return; }
  const saved = S.doc;
  dropDraft();
  S.files = [];
  location.hash = "#/";
  toast("Started a new estimate.", { type: "info", action: "Undo", onAction: () => { S.doc = saved; saveDraft(); location.hash = "#/quote"; } });
}

/* ======================= this browser ======================= */
function clearLocal() {
  const saved = localKeys().map((k) => [k, recall("local", k)]);
  localKeys().forEach((k) => store("local", k));
  resetEstimate();
  settings.rebuild();
  settingsView.paint();
  toast("Cleared your quotation details, the saved wait times and the cost view setting in this browser.", {
    type: "success", detail: "Your login and theme are kept.", action: "Undo", onAction: () => {
      saved.forEach(([k, v]) => { if (v !== null) store("local", k, v); });
      settings.rebuild();
      settingsView.paint();
    },
  });
}

/* ======================= wiring ======================= */
fillIcons();
settingsView.mount();
$("#loginBtn").addEventListener("click", () => login());
$("#reloadBtn").addEventListener("click", () => location.reload());
$("#goBtn").addEventListener("click", () => draft());
$("#cancelBtn").addEventListener("click", () => { if (S.run) S.run.abort(); });
$("#briefText").addEventListener("input", () => { paintGo(); saveCompose(); });
for (const id of INPUT_IDS) $(`#in-${id}`).addEventListener("change", saveCompose);
$("#fileInput").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
const drop = $("#dropZone");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); addFiles([...e.dataTransfer.files]); });
$("#resumeOpen").addEventListener("click", () => { location.hash = "#/quote"; });
$("#resumeDiscard").addEventListener("click", () => startOver());
$("#pdfBtn").addEventListener("click", () => printPdf());
$("#newBtn").addEventListener("click", () => startOver());
$("#costsBtn").addEventListener("click", () => { S.costs = !S.costs; store("local", KEY.costs, S.costs || undefined); renderQuote(); });
onAnyService(() => {
  paintBlock();
  if (S.view === "busy") {
    $("#busyMsg").textContent = larkService.status.state === "waking"
      ? "Logging you in… Waking up the connection service, which can take up to a minute." : "Logging you in…";
  }
  if (S.view === "compose") paintGo();
});
addEventListener("hashchange", onRoute);
addEventListener("beforeunload", (e) => { if (S.run) { e.preventDefault(); e.returnValue = ""; } });
auth.startClock(() => { renderHeader(); settingsView.tick(); });

(async function init() {
  const params = new URLSearchParams(location.search);
  if (params.has("code") || params.has("error")) {
    S.view = "busy";
    render();
    const res = await auth.handleRedirect();
    if (!res.ok) S.loginNote = res.message;
  } else if (!location.hash) {
    history.replaceState(null, "", `${location.pathname}${location.search}#/`);
  }
  restoreCompose();
  loadDraft();
  if (auth.currentToken()) {
    auth.loadUser().then((u) => { S.user = u; renderHeader(); if (S.view === "settings") settingsView.paint(); }).catch(() => {});
  } else if (auth.hadSession() && !S.loginNote) {
    S.loginNote = "Your login ended after about 2 hours. Log in again to keep going.";
    auth.clearSession();
  }
  larkService.wake();
  ceService.wake();
  onRoute();
})();
document.documentElement.dataset.booted = "";
