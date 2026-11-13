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
import { $, $$, h, ic, fillIcons, toast, fmt, store, recall, busy, closeMenu, confirmSheet } from "./ui.js";
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
  notesOpen: "blank",     // which list in the notes card is open (null: none)
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

/* File chips as on Fetch's drop zone: a kind badge (or the picture itself), the name and size, and remove. */
const KIND = { pdf: ["pdf", "PDF"], png: ["image", "IMG"], jpg: ["image", "IMG"], jpeg: ["image", "IMG"], webp: ["image", "IMG"], gif: ["image", "IMG"],
  txt: ["text", "TXT"], md: ["text", "MD"], csv: ["sheet", "CSV"] };
const kindOf = (f) => KIND[(f.name.split(".").pop() || "").toLowerCase()] || ["text", "FILE"];
const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const thumbs = new WeakMap();
function renderFiles() {
  const lim = limits();
  const total = S.files.reduce((n, f) => n + f.size, 0);
  $("#fileList").replaceChildren(...S.files.map((f, i) => {
    const [kind, label] = kindOf(f);
    if (kind === "image" && !thumbs.has(f)) thumbs.set(f, URL.createObjectURL(f));
    return h("li", { class: `file kind-${kind}` },
      kind === "image" ? h("img", { class: "file-thumb", src: thumbs.get(f), alt: "" }) : h("span", { class: "file-badge" }, label),
      h("span", { class: "file-info" }, h("span", { class: "file-name", title: f.name }, f.name), h("span", { class: "file-size" }, sizeText(f.size))),
      h("button", { type: "button", class: "file-x", "aria-label": `Remove ${f.name}`, title: "Remove", onclick: (e) => {
        e.stopPropagation();
        const [gone] = S.files.splice(i, 1);
        if (thumbs.has(gone)) { URL.revokeObjectURL(thumbs.get(gone)); thumbs.delete(gone); }
        renderFiles();
      } }, ic("x")));
  }));
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
  $("#dropzone").classList.toggle("has-content", !!has);
  $("#composeHint").textContent = has ? `Usually about ${fmt.duration(estimate(S.files) * 1000).replace("0m", "1m")}. You can edit everything after.`
    : "Add the client's brief to get started.";
}

function addFiles(list, { pasted = false } = {}) {
  const bad = [];
  for (let f of list) {
    if (!f || !f.size) continue;
    if (!acceptable(f)) { bad.push(f.name); continue; }
    if (pasted && /^image\.(png|jpe?g|gif|webp)$/i.test(f.name)) {   // a pasted screenshot gets a name worth reading
      const t = new Date();
      f = new File([f], `Pasted screenshot ${t.getHours()}-${String(t.getMinutes()).padStart(2, "0")}-${String(t.getSeconds()).padStart(2, "0")}.${f.name.split(".").pop()}`, { type: f.type, lastModified: f.lastModified });
    }
    if (!S.files.some((x) => x.name === f.name && x.size === f.size)) S.files.push(f);
  }
  if (bad.length) toast(`${bad.join(", ")} can't be read here. Save ${bad.length === 1 ? "it" : "them"} as a PDF, then add ${bad.length === 1 ? "it" : "them"} again.`, { type: "warn" });
  renderFiles();
}

function renderCompose() {
  $("#resumeBanner").hidden = !S.doc;
  if (S.doc) $("#resumeTitle").textContent = S.doc.project.title || "Untitled quotation";
  renderFiles();
  requestAnimationFrame(autosize);
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
      preparer: settings.preparer(), inputs, meta: out.meta, tranches: RULES.tranches });
    saveDraft();
    S.run = null;
    location.hash = "#/quote";
    onRoute();
    const fit = out.appraisal.budget;
    if (fit && fit.status === "over") {
      toast("Even the essential lines are over the budget.", { type: "error", detail: "Nothing essential was dropped. See the notes beside the quotation." });
    } else {
      toast(`Drafted ${fmt.plural(D.allLines(S.doc).length, "line")}${fit ? ", within the budget" : ""}.`, { type: "success",
        detail: fit && fit.steps && fit.steps.length ? fit.steps.join(" ") : "Every catalogue price comes from past CEs." });
    }
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
  const b = D.budgetCheck(S.doc);
  const steps = n.fit && n.fit.steps && n.fit.steps.length ? h("p", { class: "hint" }, `To fit the budget: ${n.fit.steps.join(" ")}`) : null;
  const removed = (n.removed || []).map((r, i) => h("li", null, `${r.line.particular} (${fmt.peso(D.lineTotal(r.line))}) `,
    h("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => {
      D.addBack(S.doc, i); saveDraft(); renderQuote();
      const now = D.budgetCheck(S.doc);
      toast(`Added "${r.line.particular}" back.`, { type: now && now.over ? "warn" : "info", detail: now && now.over ? "The quotation is now over the budget." : "" });
    } }, "Add back")));
  const d = n.draft;
  const draftLine = d && d.cost_usd != null ? h("p", { class: "hint" },
    `This draft: ${d.seconds}s, about US$${d.cost_usd.toFixed(2)} (${(d.usage.output_tokens || 0).toLocaleString()} tokens written).`) : null;
  const estimates = D.allLines(S.doc).filter((l) => (l.source || {}).kind === "estimate").length;
  const blank = D.missing(S.doc);
  $("#quoteStatus").replaceChildren(h("b", null, fmt.peso(t.grand)), " grand total ",
    b ? h("span", { class: b.over ? "warn-text" : "ok-text" }, b.over ? `${fmt.peso(-b.left)} over budget` : `${fmt.peso(b.left)} under budget`) : "");
  // The notes sit in one card above the sheet (the page keeps the family's 1200px width, so there is
  // no room beside it). Each list is a chip; one opens at a time, and the choice survives redraws.
  const lists = [
    ["blank", "Still to fill in", blank.length, () => list(blank), true],
    ["removed", "Left out to fit the budget", removed.length, () => h("ul", { class: "removed-list" }, ...removed), true],
    ["questions", "Questions for the client", n.clarifications.length, () => list(n.clarifications)],
    ["assumptions", "Assumptions", n.assumptions.length, () => list(n.assumptions)],
    ["excluded", "Left out", n.excluded.length, () => list(n.excluded)],
    ["checks", "Checks", (n.checks || []).length, () => list((n.checks || []).map((c) => c.text))],
  ].filter(([, , count, , onlyIfAny]) => count || !onlyIfAny);
  if (!lists.some(([key]) => key === S.notesOpen)) S.notesOpen = null;
  const panel = h("div", { class: "qn-panel", id: "notesPanel", role: "region", hidden: !S.notesOpen });
  const open = lists.find(([key]) => key === S.notesOpen);
  if (open) { panel.setAttribute("aria-label", open[1]); panel.append(open[3]()); }
  const chips = lists.map(([key, label, count]) => h("button", { type: "button", class: `chip-opt${key === "blank" ? " is-warn" : ""}`,
    "aria-expanded": String(key === S.notesOpen), "aria-controls": "notesPanel", disabled: !count,
    onclick: () => { S.notesOpen = S.notesOpen === key ? null : key; paintNotes(); } }, label, h("span", { class: "count" }, String(count))));
  $("#notes").replaceChildren(...[   // (replaceChildren would print a null as the word "null")
    h("div", { class: "qn-top" },
      h("h2", { class: "subhead" }, "Internal only"),
      h("dl", { class: "qn-figs" },
        h("div", null, h("dt", null, "Our cost"), h("dd", null, fmt.peso(t.base))),
        h("div", null, h("dt", null, "Gross profit"), h("dd", null, `${fmt.peso(t.gp)} (${D.pct(t.gp_margin)})`)),
        b ? h("div", null, h("dt", null, "Budget"), h("dd", { class: b.over ? "warn-text" : "ok-text" }, b.over ? `${fmt.peso(-b.left)} over` : `${fmt.peso(b.left)} to spare`)) : null)),
    b && b.over ? h("p", { class: "warn-text" }, `${fmt.peso(-b.left)} over the ${fmt.peso(b.amount)} budget. Lower markups first, then unit costs, then scope.`) : null,
    steps,
    estimates ? h("p", { class: "warn-text" }, `${estimates} ${estimates === 1 ? "line is an estimate" : "lines are estimates"} with no price history. Get quotes before sending.`) : null,
    h("div", { class: "chips qn-chips" }, ...chips),
    panel,
    h("p", { class: "hint" }, "Costs, markups and these notes never appear in the PDF.", draftLine ? ` ${draftLine.textContent}` : ""),
  ].filter(Boolean));
}

async function printPdf() {
  const b = D.budgetCheck(S.doc);
  if (b && b.over) {
    const ok = await confirmSheet({ title: "This quotation is over the client's budget", icon: "alert", danger: true,
      sub: `It comes to ${fmt.peso(b.total)} against a budget of ${fmt.peso(b.amount)}: ${fmt.peso(-b.left)} over.`,
      body: h("p", null, "Lower the markups or the scope first, or save it anyway if the client agreed a bigger budget."),
      confirm: "Save anyway", busyText: "Opening…" });
    if (!ok) return;
  }
  window.print();
}
// Ctrl+P prints the same thing as the button: blank fields print empty, and the PDF is named after the project.
let titleBeforePrint = "";
addEventListener("beforeprint", () => {
  if (S.view !== "quote" || !S.doc) return;
  quote.prepPrint();
  titleBeforePrint = document.title;
  const p = S.doc.project;
  document.title = `Quotation - ${[p.code, p.title].filter(Boolean).join(" ") || "Mineski"}`;   // the PDF's file name
});
addEventListener("afterprint", () => { if (titleBeforePrint) document.title = titleBeforePrint; titleBeforePrint = ""; });

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
/* The brief box grows with what's pasted into it, up to about half the window. */
function autosize() {
  const ta = $("#briefText");
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight + 2, Math.max(160, innerHeight * 0.45))}px`;
}
$("#briefText").addEventListener("input", () => { autosize(); paintGo(); saveCompose(); });
$("#briefText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !$("#goBtn").disabled) draft(); });
for (const id of INPUT_IDS) $(`#in-${id}`).addEventListener("change", saveCompose);
$("#fileInput").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
// The drop zone works like Fetch's: click it (or its title) to choose files; drop files anywhere on
// the page; paste screenshots or text anywhere on the brief page.
$("#browseBtn").addEventListener("click", () => $("#fileInput").click());
$("#dropzone").addEventListener("click", (e) => {
  if (e.target === e.currentTarget || (e.target.closest(".dz-top") && !e.target.closest("button"))) $("#fileInput").click();
});
{
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const accepting = () => auth.currentToken() && !S.run && (S.view === "compose" || S.view === "quote");
  addEventListener("dragenter", (e) => { if (!hasFiles(e) || !accepting()) return; e.preventDefault(); if (depth++ === 0) document.body.classList.add("dragging"); });
  addEventListener("dragover", (e) => { if (hasFiles(e) && accepting()) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove("dragging"); } });
  addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove("dragging");
    if (!accepting()) return;
    addFiles([...e.dataTransfer.files]);
    if (S.view !== "compose") location.hash = "#/";
  });
}
document.addEventListener("paste", (e) => {
  if (S.view !== "compose") return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    addFiles(files, { pasted: true });
    toast(files.length > 1 ? `${files.length} pasted files added.` : "Pasted file added.", { type: "success", timeout: 2200 });
    return;
  }
  const text = e.clipboardData?.getData("text/plain");
  if (text && !e.target.closest?.("textarea, input, select, [contenteditable]")) {
    e.preventDefault();
    const ta = $("#briefText");
    ta.value = ta.value ? `${ta.value.trimEnd()}\n\n${text}` : text;
    ta.focus();
    autosize();
    paintGo();
    saveCompose();
  }
});
$("#resumeOpen").addEventListener("click", () => { location.hash = "#/quote"; });
$("#resumeDiscard").addEventListener("click", () => startOver());
$("#pdfBtn").addEventListener("click", () => printPdf());
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
  // Developers only: ?preview=quote opens straight on the sample quotation (see tests/preview-shim.js).
  if (window.MINESKI_PREVIEW && params.get("preview") === "quote" && !S.doc) {
    const out = await fetch("tests/fixture.json").then((r) => r.json()).catch(() => null);
    if (out) { S.doc = D.fromAppraisal(out.appraisal, { today: todayISO(), validDays: RULES.validDays, preparer: settings.preparer(), meta: out.meta, tranches: RULES.tranches }); saveDraft(); }
  }
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
