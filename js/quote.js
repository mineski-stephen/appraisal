/*
 * The quotation: the draft drawn as Mineski's "Quotation (Automated)" document, edited in place,
 * and printed (Save as PDF) without anything internal.
 *
 * What prints: the header, client information, the lines with client prices, the totals, the
 * terms and the signature blocks. What never prints (class "internal" / "no-print"): internal
 * costs, markups, price sources, the checks and notes panel, and the editing controls.
 *
 * createQuote(ctx) -> { render(), paintTotals() }. ctx: { doc(), changed(), toast }.
 */
import { RULES } from "./config.js";
import { TERMS } from "./terms.js";
import * as D from "./doc.js";
import { $, h, ic } from "./ui.js";

const UNITS = ["per project", "per day", "per hour", "per week", "per month", "per year", "per night", "per person/team",
  "per unit", "per package/lot", "per execution/event", "per leg/location"];

const SOURCE_TEXT = {
  catalogue: (s) => `Catalogue: usual ${D.peso(s.usual)} (${D.peso(s.low)} to ${D.peso(s.high)}), from ${s.projects} past CEs${s.last ? `, last ${s.last}` : ""}`,
  brief_amount: () => "Amount from the brief",
  estimate: () => "Estimate: no price history. Get a quote.",
  manual: () => "Added by hand",
};

export function createQuote(ctx) {
  const box = () => $("#quote");

  /* Editable text: a span that writes to the document on every change. */
  function text(value, onChange, { placeholder = "", cls = "", multiline = false, label } = {}) {
    const el = h("span", { class: `ed ${cls}`.trim(), contenteditable: "plaintext-only", spellcheck: "true", role: "textbox",
      "aria-label": label || placeholder || "Edit", "data-placeholder": placeholder, "aria-multiline": multiline ? "true" : "false" }, value || "");
    el.addEventListener("input", () => { onChange(el.textContent.trim()); ctx.changed({ quiet: true }); });
    if (!multiline) el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    return el;
  }

  /* An editable number: shown formatted, edited raw. */
  function numberCell(value, onChange, { format = D.qtyText, label, cls = "" } = {}) {
    const el = h("input", { type: "text", inputmode: "decimal", class: `cell-num ${cls}`.trim(), "aria-label": label, value: format(value) });
    el.addEventListener("focus", () => { el.value = String(Math.round(Number(value) * 100) / 100); el.select(); });
    el.addEventListener("change", () => {
      const v = Number(String(el.value).replace(/[₱,\s]/g, ""));
      if (!Number.isFinite(v) || v < 0) { el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid");
      value = v;
      onChange(v);
      ctx.changed();
    });
    el.addEventListener("blur", () => { el.value = format(value); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") el.blur(); });
    return el;
  }

  function perCell(line) {
    const sel = h("select", { class: "cell-per", "aria-label": "Per" },
      ...[...new Set([line.per, ...UNITS])].map((u) => h("option", { value: u, selected: u === line.per }, u)));
    sel.addEventListener("change", () => { D.setLine(ctx.doc(), line.id, "per", sel.value); ctx.changed(); });
    return sel;
  }

  function lineRows(line, group) {
    const doc = ctx.doc();
    const src = line.source || {};
    const flag = src.kind === "estimate" ? h("span", { class: "badge badge-warn internal", title: "No price history: get a quote" }, "Estimate")
      : src.kind === "brief_amount" ? h("span", { class: "badge badge-info internal", title: "Amount from the brief" }, "Brief") : null;
    const row = h("tr", { class: "q-line", "data-id": line.id },
      h("td", { class: "q-sku" }),
      h("td", { class: "q-part", colspan: "1" },
        h("div", { class: "q-part-main" }, text(line.particular, (v) => D.setLine(doc, line.id, "particular", v), { placeholder: "Particular", label: "Particular" }), flag),
        line.details || ctx.costs() ? h("div", { class: "q-details" }, text(line.details, (v) => D.setLine(doc, line.id, "details", v), { placeholder: "Details (optional)", cls: "small", multiline: true, label: "Details" })) : null),
      h("td", { class: "num" }, numberCell(line.qty, (v) => D.setLine(doc, line.id, "qty", v), { label: "Quantity" })),
      h("td", { class: "num" }, numberCell(line.frq, (v) => D.setLine(doc, line.id, "frq", v), { label: "Frequency" })),
      h("td", { class: "q-per" }, perCell(line)),
      h("td", { class: "num" }, numberCell(D.clientUnit(line), (v) => D.setLine(doc, line.id, "client_unit", v), { format: D.peso, label: "Cost per unit", cls: "money" })),
      h("td", { class: "num q-sub", "data-sub": line.id }, D.peso(D.lineTotal(line))),
      h("td", { class: "q-rem" }, text(line.remarksOnQuote, (v) => D.setLine(doc, line.id, "remarksOnQuote", v), { placeholder: "", cls: "small", label: "Remarks" })),
      h("td", { class: "q-tools no-print" },
        h("button", { type: "button", class: "icon-btn plain icon-sm", title: "Add a line below", "aria-label": "Add a line below", onclick: () => { const l = D.addLine(group, line.id); ctx.changed(); render(); focusLine(l.id); } }, ic("plus")),
        h("button", { type: "button", class: "icon-btn plain icon-sm", title: "Remove this line", "aria-label": "Remove this line", onclick: () => remove(line.id) }, ic("trash"))));
    if (!ctx.costs()) return [row];
    const internal = h("tr", { class: "q-internal internal no-print", "data-for": line.id },
      h("td"),
      h("td", { colspan: "7" },
        h("div", { class: "q-cost" },
          h("label", null, "Internal cost ", numberCell(line.unit_cost, (v) => D.setLine(doc, line.id, "unit_cost", v), { format: D.peso, label: "Internal cost per unit", cls: "money" })),
          h("label", null, "Markup ", numberCell(line.markup * 100, (v) => D.setLine(doc, line.id, "markup", v / 100), { format: (x) => `${D.qtyText(x)}%`, label: "Markup percent" })),
          h("span", { class: "muted" }, line.category || ""), h("span", { class: "muted" }, line.method || ""),
          h("span", { class: "q-src" }, (SOURCE_TEXT[src.kind] || SOURCE_TEXT.estimate)(src)),
          line.covers ? h("span", { class: "muted" }, `Covers: ${line.covers}`) : null,
          line.remarks ? h("span", { class: "muted" }, `Note: ${line.remarks}`) : null)),
      h("td"));
    return [row, internal];
  }

  function focusLine(id) {
    const el = box().querySelector(`tr[data-id="${id}"] .ed`);
    if (el) el.focus();
  }

  function remove(id) {
    const removed = D.removeLine(ctx.doc(), id);
    if (!removed) return;
    ctx.changed();
    render();
    ctx.toast(`Removed "${removed.line.particular || "the line"}".`, { type: "info", action: "Undo", onAction: () => { D.restoreLine(removed); ctx.changed(); render(); } });
  }

  function table(doc) {
    const body = [];
    doc.sections.forEach((s, si) => {
      body.push(h("tr", { class: "q-section" }, h("td", { class: "q-sku" }, D.sectionNo(si)),
        h("td", { colspan: "7" }, text(s.name, (v) => { s.name = v; }, { placeholder: "SECTION", label: "Section name" })), h("td", { class: "no-print" })));
      s.groups.forEach((g) => {
        body.push(h("tr", { class: "q-group" }, h("td"), h("td", { colspan: "7" }, text(g.name, (v) => { g.name = v; }, { placeholder: "Sub-section", label: "Sub-section name" })),
          h("td", { class: "q-tools no-print" }, h("button", { type: "button", class: "icon-btn plain icon-sm", title: "Add a line", "aria-label": `Add a line to ${g.name}`,
            onclick: () => { const l = D.addLine(g); ctx.changed(); render(); focusLine(l.id); } }, ic("plus")))));
        g.lines.forEach((l) => body.push(...lineRows(l, g)));
      });
    });
    return h("table", { class: "q-table" },
      h("colgroup", null, h("col", { class: "c-sku" }), h("col", { class: "c-part" }), h("col", { class: "c-n" }), h("col", { class: "c-n" }),
        h("col", { class: "c-per" }), h("col", { class: "c-money" }), h("col", { class: "c-money" }), h("col", { class: "c-rem" }), h("col", { class: "c-tools no-print" })),
      h("thead", null, h("tr", null, ...["SKU", "PARTICULARS", "QTY", "FRQ", "PER", "COST", "SUBTOTAL", "REMARKS"].map((t) => h("th", null, t)), h("th", { class: "no-print" }))),
      h("tbody", null, ...body));
  }

  function totalsBlock(doc) {
    const t = D.totals(doc);
    const asf = numberCell(doc.asf_rate * 100, (v) => { doc.asf_rate = v / 100; }, { format: (x) => `${D.qtyText(x)}%`, label: "ASF percent", cls: "rate" });
    const disc = numberCell(doc.discount, (v) => { doc.discount = v; }, { format: D.peso, label: "Discount", cls: "money" });
    const vat = h("select", { class: "cell-per rate", "aria-label": "VAT" },
      h("option", { value: "0.12", selected: doc.vat_rate > 0 }, "12%"), h("option", { value: "0", selected: !(doc.vat_rate > 0) }, "0%"));
    vat.addEventListener("change", () => { doc.vat_rate = Number(vat.value); ctx.changed(); });
    const row = (label, rate, value, key, cls = "") => h("tr", { class: cls }, h("th", null, label), h("td", { class: "rate-cell" }, rate || ""), h("td", { class: "num", "data-total": key }, value));
    return h("table", { class: "q-totals" }, h("tbody", null,
      row("TOTAL COST", "", D.peso(t.total), "total"),
      row("ASF", asf, D.peso(t.asf), "asf"),
      row("DISCOUNT", "", disc, "discount"),
      row("SUBTOTAL", "", D.peso(t.subtotal), "subtotal"),
      row("VAT", vat, D.peso(t.vat), "vat"),
      row("GRAND TOTAL", "", D.peso(t.grand), "grand", "q-grand")));
  }

  const fill = (s, doc) => {
    const e = RULES.entities[doc.entity] || RULES.entities.PDEI;
    return s.replace(/\{company\}/g, e.company || "[registered name]").replace(/\{brand\}/g, e.brand || "MINESKI");
  };

  function termsBlock(doc) {
    const items = TERMS.map((t) => {
      const parts = [h("p", null, fill(t.text, doc))];
      if (t.key === "payment") {
        parts.push(h("p", { class: "q-amount", "data-total": "grandWords" }, D.peso(D.totals(doc).grand)));
        parts.push(h("table", { class: "q-mini" }, h("thead", null, h("tr", null, h("th", null, "Tranches"), h("th", null, "%"), h("th", null, "Amount"), h("th", null, "Date"))),
          h("tbody", null, ...D.tranches(doc, RULES.tranches).map((x, i) => h("tr", null, h("td", null, x.label), h("td", null, `${Math.round(x.pct * 100)}%`),
            h("td", { "data-total": `tranche${i}` }, D.peso(x.amount)), h("td", null, x.when))))));
      }
      if (t.key === "bank") {
        const e = RULES.entities[doc.entity] || RULES.entities.PDEI;
        parts.push(h("dl", { class: "q-bank" },
          h("dt", null, "Bank:"), h("dd", null, text(doc.bank.name, (v) => { doc.bank.name = v; }, { placeholder: "Bank name", label: "Bank name" })),
          h("dt", null, "Account No.:"), h("dd", null, text(doc.bank.account, (v) => { doc.bank.account = v; }, { placeholder: "Account number from Finance", label: "Account number" })),
          h("dt", null, "Company Name:"), h("dd", null, e.company || "[registered name]")));
      }
      if (t.table) parts.push(h("table", { class: "q-mini" }, h("thead", null, h("tr", null, ...t.table[0].map((c) => h("th", null, c)))),
        h("tbody", null, ...t.table.slice(1).map((r) => h("tr", null, ...r.map((c) => h("td", null, c)))))));
      (t.after || []).forEach((p) => parts.push(h("p", null, fill(p, doc))));
      return h("li", null, h("span", { class: "q-n" }, t.n), h("div", null, ...parts));
    });
    return h("section", { class: "q-terms" }, h("h3", { class: "q-band" }, "Terms and Conditions"), h("ol", null, ...items));
  }

  function signatures(doc) {
    const p = doc.project;
    const sig = (name, title, onName, onTitle, label) => h("div", { class: "q-sig" }, h("div", { class: "q-sigline" }),
      text(name, onName, { placeholder: "Name", cls: "q-signame", label: `${label} name` }), text(title, onTitle, { placeholder: "Designation", cls: "small", label: `${label} designation` }));
    return h("section", { class: "q-signs" },
      h("div", { class: "q-conforme" },
        sig(p.contact, p.designation, (v) => { p.contact = v; }, (v) => { p.designation = v; }, "Client"),
        h("h3", { class: "q-band" }, "CONFORME")),
      doc.prepared_by.email ? h("p", { class: "small q-contact" }, `For concerns or inquiries, email ${doc.prepared_by.email}`) : null,
      h("div", { class: "q-two" },
        h("div", null, h("p", { class: "small" }, "Prepared by:"),
          sig(doc.prepared_by.name, doc.prepared_by.title, (v) => { doc.prepared_by.name = v; }, (v) => { doc.prepared_by.title = v; }, "Prepared by")),
        h("div", null, h("p", { class: "small" }, "Approved by:"),
          sig(doc.approved_by.name, doc.approved_by.title, (v) => { doc.approved_by.name = v; }, (v) => { doc.approved_by.title = v; }, "Approved by"))));
  }

  function info(doc) {
    const p = doc.project;
    const f = (label, key, placeholder) => [h("dt", null, label), h("dd", null, text(p[key], (v) => { p[key] = v; }, { placeholder, label }))];
    const dateField = (label, key) => {
      const el = h("input", { type: "date", class: "cell-date", value: p[key] || "", "aria-label": label });
      el.addEventListener("change", () => { p[key] = el.value; ctx.changed(); });
      return [h("dt", null, label), h("dd", null, el, h("span", { class: "print-only" }, D.longDate(p[key])))];
    };
    return h("section", { class: "q-info" },
      h("h3", { class: "q-band" }, "CLIENT INFORMATION"),
      h("div", { class: "q-info-grid" },
        h("dl", null, ...f("Project Name:", "title", "Project name"), ...f("Project Code:", "code", "2026TEG-P0000"),
          ...f("Project Duration:", "period", "Dates or period"), ...f("Client's Name:", "client", "Client company"),
          ...f("Contact Person:", "contact", "Name"), ...f("Designation:", "designation", "Designation")),
        h("dl", null, ...dateField("Prepared Date:", "prepared"), ...dateField("Expiration:", "expires"))));
  }

  function render() {
    const doc = ctx.doc();
    if (!doc) { box().replaceChildren(); return; }
    box().replaceChildren(
      h("header", { class: "q-head" }, h("h2", null, "PROJECT QUOTATION")),
      info(doc),
      table(doc),
      totalsBlock(doc),
      termsBlock(doc),
      signatures(doc));
    box().classList.toggle("show-costs", ctx.costs());
  }

  /* After an edit: redraw the numbers only, so the field being edited keeps its focus. */
  function paintTotals() {
    const doc = ctx.doc();
    if (!doc) return;
    const t = D.totals(doc);
    const set = (key, v) => { const el = box().querySelector(`[data-total="${key}"]`); if (el) el.textContent = D.peso(v); };
    set("total", t.total); set("asf", t.asf); set("subtotal", t.subtotal); set("vat", t.vat); set("grand", t.grand); set("grandWords", t.grand);
    D.tranches(doc, RULES.tranches).forEach((x, i) => set(`tranche${i}`, x.amount));
    for (const l of D.allLines(doc)) {
      const el = box().querySelector(`[data-sub="${l.id}"]`);
      if (el) el.textContent = D.peso(D.lineTotal(l));
    }
  }

  return { render, paintTotals };
}
