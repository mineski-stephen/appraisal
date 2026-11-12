/*
 * The quotation: the draft drawn the way Mineski's signed project quotations look (the
 * "Quotation (Automated)" tab, e.g. 2026TEG-P0293), edited in place, and printed (Save as PDF)
 * without anything internal.
 *
 * The layout follows the signed quotations: the centred title with the Mineski Philippines logo, the client
 * information block, navy section bands, pale blue sub-section bands, striped lines, the totals
 * with the gold grand total, the terms, and the signature blocks. Where the spreadsheet template
 * has slips, the page corrects them:
 *   - "FREQUENCE" reads "FREQUENCY";
 *   - every row is numbered in order (1, 1.1, 1.1.1): no skipped, repeated or empty numbered rows;
 *   - a discount of zero and the blank "Select:" bank row are left out;
 *   - VAT is no longer in red, and the amounts are not wrapped in brackets;
 *   - the signature blocks stay together on one page.
 *
 * What prints: the header, client information, the lines with client prices, the totals, the
 * terms and the signature blocks. What never prints (class "internal" / "no-print"): internal
 * costs, markups, price sources, the checks and notes panel, and the editing controls.
 *
 * createQuote(ctx) -> { render(), paintTotals(), prepPrint() }. ctx: { doc(), costs(), changed(), toast }.
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

const ordinal = (i) => ["1st", "2nd", "3rd"][i] || `${i + 1}th`;

export function createQuote(ctx) {
  const box = () => $("#quote");

  /* Editable text: a span that writes to the document on every change. */
  function text(value, onChange, { placeholder = "", cls = "", multiline = false, label } = {}) {
    const el = h("span", { class: `ed ${cls}`.trim(), contenteditable: "plaintext-only", spellcheck: "true", role: "textbox",
      "aria-label": label || placeholder || "Edit", "data-placeholder": placeholder, "aria-multiline": multiline ? "true" : "false" }, value || "");
    el.addEventListener("input", () => {
      if (!el.textContent.trim()) el.textContent = "";   // a lone line break would hide the placeholder
      onChange(el.textContent.trim());
      ctx.changed({ quiet: true });
    });
    if (!multiline) el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    return el;
  }

  /* An editable number: shown formatted, edited raw. */
  function numberCell(value, onChange, { format = D.qtyText, label, cls = "" } = {}) {
    const el = h("input", { type: "text", inputmode: "decimal", class: `cell-num ${cls}`.trim(), "aria-label": label, value: format(value) });
    el.addEventListener("focus", () => { el.value = String(Math.round(Number(value) * 100) / 100); el.select(); });
    el.addEventListener("change", () => {
      const v = Number(String(el.value).replace(/[₱,%\s]/g, ""));
      if (!Number.isFinite(v) || v < 0) { el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid");
      value = v;
      onChange(v);
      ctx.changed();
    });
    el.addEventListener("blur", () => { if (!el.hasAttribute("aria-invalid")) el.value = format(value); });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el.blur();
      if (e.key === "Escape") { el.removeAttribute("aria-invalid"); el.value = format(value); el.blur(); }
    });
    return el;
  }

  function perCell(line) {
    const sel = h("select", { class: "cell-per", "aria-label": "Per" },
      ...[...new Set([line.per, ...UNITS])].map((u) => h("option", { value: u, selected: u === line.per }, u)));
    sel.addEventListener("change", () => { D.setLine(ctx.doc(), line.id, "per", sel.value); ctx.changed(); });
    return sel;
  }

  const tool = (icon, label, onclick) => h("button", { type: "button", class: "icon-btn plain q-tool", title: label, "aria-label": label, onclick }, ic(icon));

  /* Change the document's shape (add, remove, undo), then redraw and put the cursor where it helps. */
  function reshape(change, focus) {
    change();
    ctx.changed();
    render();
    if (focus) { const el = box().querySelector(focus); if (el) el.focus(); }
  }
  function removed(what, undo) {
    ctx.changed();
    render();
    ctx.toast(`Removed ${what}.`, { type: "info", action: "Undo", onAction: () => reshape(undo) });
  }

  function lineRows(line, group, no, odd) {
    const doc = ctx.doc();
    const src = line.source || {};
    const flag = src.kind === "estimate" ? h("span", { class: "badge badge-warn internal", title: "No price history: get a quote" }, "Estimate")
      : src.kind === "brief_amount" ? h("span", { class: "badge badge-info internal", title: "Amount from the brief" }, "Brief") : null;
    const details = h("div", { class: `q-details${line.details ? "" : " is-empty"}` },
      text(line.details, (v) => { D.setLine(doc, line.id, "details", v); details.classList.toggle("is-empty", !v); },
        { placeholder: "Details: what's included, sizes, who it covers", multiline: true, label: "Details" }));
    details.addEventListener("focusout", () => details.classList.remove("is-open"));
    const row = h("tr", { class: `q-line${odd ? " is-odd" : ""}`, "data-id": line.id },
      h("td", { class: "q-sku" }, no),
      h("td", { class: "q-part" },
        h("div", { class: "q-part-main" }, text(line.particular, (v) => D.setLine(doc, line.id, "particular", v), { placeholder: "Particular", label: "Particular" }), flag),
        details),
      h("td", { class: "q-c" }, numberCell(line.qty, (v) => D.setLine(doc, line.id, "qty", v), { label: "Quantity" })),
      h("td", { class: "q-c" }, numberCell(line.frq, (v) => D.setLine(doc, line.id, "frq", v), { label: "Frequency" })),
      h("td", { class: "q-per" }, perCell(line)),
      h("td", { class: "num" }, numberCell(D.clientUnit(line), (v) => D.setLine(doc, line.id, "client_unit", v), { format: D.peso, label: "Cost per unit", cls: "money" })),
      h("td", { class: "num q-sub", "data-sub": line.id }, D.peso(D.lineTotal(line))),
      h("td", { class: "q-rem" }, text(line.remarksOnQuote, (v) => D.setLine(doc, line.id, "remarksOnQuote", v), { placeholder: "", label: "Remarks", multiline: true })),
      h("td", { class: "q-tools no-print" },
        tool("pencil", line.details ? "Edit the details" : "Add details under this line", () => { details.classList.add("is-open"); details.querySelector(".ed").focus(); }),
        tool("plus", "Add a line below", () => { let l; reshape(() => { l = D.addLine(group, line.id); }); focusLine(l.id); }),
        tool("trash", "Remove this line", () => {
          const r = D.removeLine(doc, line.id);
          if (r) removed(`"${r.line.particular || "the line"}"`, () => D.restoreLine(r));
        })));
    if (!ctx.costs()) return [row];
    const internal = h("tr", { class: `q-internal internal no-print${odd ? " is-odd" : ""}`, "data-for": line.id },
      h("td"),
      h("td", { colspan: "7" },
        h("div", { class: "q-cost" },
          h("label", null, "Internal cost ", numberCell(line.unit_cost, (v) => D.setLine(doc, line.id, "unit_cost", v), { format: D.peso, label: "Internal cost per unit", cls: "money" })),
          h("label", null, "Markup ", numberCell(line.markup * 100, (v) => D.setLine(doc, line.id, "markup", v / 100), { format: (x) => `${D.qtyText(x)}%`, label: "Markup percent" })),
          line.category ? h("span", null, line.category) : null, line.method ? h("span", null, line.method) : null,
          h("span", { class: "q-src" }, (SOURCE_TEXT[src.kind] || SOURCE_TEXT.estimate)(src)),
          line.covers ? h("span", null, `Covers: ${line.covers}`) : null,
          line.remarks ? h("span", null, `Note: ${line.remarks}`) : null)),
      h("td"));
    return [row, internal];
  }

  function focusLine(id) {
    const el = box().querySelector(`tr[data-id="${id}"] .ed`);
    if (el) el.focus();
  }

  function table(doc) {
    const body = [];
    let n = 0;
    doc.sections.forEach((s, si) => {
      body.push(h("tr", { class: "q-section", "data-sec": si }, h("td", { class: "q-sku" }, D.sku(si)),
        h("td", { colspan: "7" }, text(s.name, (v) => { s.name = v; }, { placeholder: "Section", label: "Section name" })),
        h("td", { class: "q-tools no-print" },
          tool("plus", "Add a sub-section", () => reshape(() => D.addGroup(s), `tr[data-grp="${si}.${s.groups.length - 1}"] .ed`)),
          tool("trash", "Remove this section", () => {
            const r = D.removeSection(doc, s);
            if (r) removed(`the section "${s.name || "untitled"}" and its lines`, () => D.restoreItem(r));
          }))));
      s.groups.forEach((g, gi) => {
        body.push(h("tr", { class: "q-group", "data-grp": `${si}.${gi}` }, h("td", { class: "q-sku" }, D.sku(si, gi)),
          h("td", { colspan: "7" }, text(g.name, (v) => { g.name = v; }, { placeholder: "Sub-section", label: "Sub-section name" })),
          h("td", { class: "q-tools no-print" },
            tool("plus", `Add a line to ${g.name || "this sub-section"}`, () => { let l; reshape(() => { l = D.addLine(g); }); focusLine(l.id); }),
            tool("trash", "Remove this sub-section", () => {
              const r = D.removeGroup(s, g);
              if (r) removed(`the sub-section "${g.name || "untitled"}" and its lines`, () => D.restoreItem(r));
            }))));
        g.lines.forEach((l, li) => body.push(...lineRows(l, g, D.sku(si, gi, li), n++ % 2 === 1)));
      });
    });
    return h("div", { class: "q-table-wrap" },
      h("table", { class: "q-table" },
        h("colgroup", null, h("col", { class: "c-sku" }), h("col", { class: "c-part" }), h("col", { class: "c-qty" }), h("col", { class: "c-frq" }),
          h("col", { class: "c-per" }), h("col", { class: "c-money" }), h("col", { class: "c-sub" }), h("col", { class: "c-rem" }), h("col", { class: "c-tools no-print" })),
        h("thead", null, h("tr", null, ...[["SKU", "q-c"], ["PARTICULARS", ""], ["QUANTITY", "q-c"], ["FREQUENCY", "q-c"], ["PER", ""], ["COST", "num"], ["SUBTOTAL", "num"], ["REMARKS", ""]]
          .map(([t, cls]) => h("th", { scope: "col", class: cls }, t)), h("th", { class: "q-tools no-print" }, h("span", { class: "sr-only" }, "Edit")))),
        h("tbody", null, ...body)),
      h("div", { class: "q-add no-print" },
        h("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => reshape(() => D.addSection(doc), `tr[data-sec="${doc.sections.length}"] .ed`) },
          ic("plus"), " Add a section")));
  }

  function totalsBlock(doc) {
    const t = D.totals(doc);
    const asf = numberCell(doc.asf_rate * 100, (v) => { doc.asf_rate = v / 100; }, { format: (x) => `${D.qtyText(x)}%`, label: "ASF percent", cls: "rate" });
    const disc = numberCell(doc.discount, (v) => { doc.discount = v; }, { format: D.peso, label: "Discount", cls: "money" });
    const vat = h("select", { class: "cell-per rate", "aria-label": "VAT" },
      h("option", { value: "0.12", selected: doc.vat_rate > 0 }, "12%"), h("option", { value: "0", selected: !(doc.vat_rate > 0) }, "0%"));
    vat.addEventListener("change", () => { doc.vat_rate = Number(vat.value); ctx.changed(); });
    const row = (label, rate, value, key, cls = "") => h("tr", { class: cls }, h("th", { scope: "row" }, label), h("td", { class: "rate-cell" }, rate || ""), h("td", { class: "num", "data-total": key }, value));
    return h("table", { class: "q-totals" }, h("tbody", null,
      row("TOTAL COST", "", D.peso(t.total), "total", "q-total"),
      row("ASF", asf, D.peso(t.asf), "asf"),
      row("DISCOUNT", "", disc, "discount", `q-discount${t.discount ? "" : " is-zero"}`),
      row("SUBTOTAL", "", D.peso(t.subtotal), "subtotal"),
      row("VAT", vat, D.peso(t.vat), "vat"),
      row("GRAND TOTAL", "", D.peso(t.grand), "grand", "q-grand")));
  }

  const fill = (s, doc) => {
    const e = RULES.entities[doc.entity] || RULES.entities.PDEI;
    return s.replace(/\{company\}/g, e.company || "[registered name]").replace(/\{brand\}/g, e.brand || "MINESKI");
  };

  function tranchesTable(doc) {
    if (!doc.tranches || !doc.tranches.length) doc.tranches = RULES.tranches.map((t) => ({ ...t }));
    const rows = D.tranches(doc, []).map((x, i) => h("tr", null,
      h("td", null, ordinal(i)),
      h("td", null, numberCell(x.pct * 100, (v) => { doc.tranches[i].pct = v / 100; }, { format: (v) => `${D.qtyText(v)}%`, label: `${ordinal(i)} tranche percent`, cls: "rate" })),
      h("td", { "data-total": `tranche${i}` }, D.peso(x.amount)),
      h("td", null, text(x.when, (v) => { doc.tranches[i].when = v; }, { placeholder: "Date or terms", label: `${ordinal(i)} tranche date` })),
      h("td", { class: "q-tools no-print" }, doc.tranches.length > 1 ? tool("trash", `Remove the ${ordinal(i)} tranche`, () => {
        const [gone] = doc.tranches.splice(i, 1);
        removed(`the ${ordinal(i)} tranche`, () => doc.tranches.splice(i, 0, gone));
      }) : null)));
    return h("div", { class: "q-centered" },
      h("table", { class: "q-mini" }, h("thead", null, h("tr", null, h("th", null, "Tranches"), h("th", null, "%"), h("th", null, "Amount"), h("th", null, "Date"), h("th", { class: "no-print" }))),
        h("tbody", null, ...rows)),
      doc.tranches.length < 4 ? h("button", { type: "button", class: "btn btn-sm btn-ghost no-print",
        onclick: () => reshape(() => doc.tranches.push({ label: "", pct: 0, when: "" })) }, ic("plus"), " Add a tranche") : null);
  }

  function termsBlock(doc) {
    const items = TERMS.map((t) => {
      const parts = [h("p", null, fill(t.text, doc))];
      if (t.key === "payment") {
        parts.push(h("p", { class: "q-amount", "data-total": "grandWords" }, D.peso(D.totals(doc).grand)));
        parts.push(tranchesTable(doc));
      }
      if (t.key === "bank") {
        const e = RULES.entities[doc.entity] || RULES.entities.PDEI;
        parts.push(h("dl", { class: "q-bank" },
          h("dt", null, "Bank:"), h("dd", null, text(doc.bank.name, (v) => { doc.bank.name = v; }, { placeholder: "Bank name", label: "Bank name" })),
          h("dt", null, "Account No.:"), h("dd", null, text(doc.bank.account, (v) => { doc.bank.account = v; }, { placeholder: "Account number from Finance", label: "Account number" })),
          h("dt", null, "Company Name:"), h("dd", null, e.company || "[registered name]")));
      }
      if (t.table) parts.push(h("div", { class: "q-centered" }, h("table", { class: "q-mini" }, h("thead", null, h("tr", null, ...t.table[0].map((c) => h("th", null, c)))),
        h("tbody", null, ...t.table.slice(1).map((r) => h("tr", null, ...r.map((c) => h("td", null, c))))))));
      (t.after || []).forEach((p) => parts.push(h("p", null, fill(p, doc))));
      return h("li", null, h("span", { class: "q-n" }, t.n), h("div", null, ...parts));
    });
    return h("section", { class: "q-terms" }, h("h3", null, "Terms and Conditions"), h("ol", null, ...items));
  }

  function signatures(doc) {
    const p = doc.project;
    const sig = (name, title, onName, onTitle, label, binds = []) => {
      const n = text(name, onName, { placeholder: "Name", cls: "q-signame", label: `${label} name` });
      const t = text(title, onTitle, { placeholder: "Designation", label: `${label} designation` });
      if (binds.length) { bound(n, binds[0]); bound(t, binds[1]); }
      return h("div", { class: "q-sig" }, h("div", { class: "q-sigline" }), n, t);
    };
    return h("section", { class: "q-signs" },
      h("div", { class: "q-conforme" },
        sig(p.contact, p.designation, (v) => { p.contact = v; syncContact(); }, (v) => { p.designation = v; syncContact(); }, "Client", ["contact", "designation"]),
        h("p", { class: "q-conforme-label" }, "CONFORME")),
      h("p", { class: "q-contact", "data-hide-blank": "" }, "For concerns or inquiries, email ",
        text(doc.prepared_by.email, (v) => { doc.prepared_by.email = v; }, { placeholder: "your e-mail", label: "E-mail for client questions" })),
      h("div", { class: "q-two" },
        h("div", null, h("p", { class: "q-siglabel" }, "Prepared by:"),
          sig(doc.prepared_by.name, doc.prepared_by.title, (v) => { doc.prepared_by.name = v; }, (v) => { doc.prepared_by.title = v; }, "Prepared by")),
        h("div", null, h("p", { class: "q-siglabel" }, "Approved by:"),
          sig(doc.approved_by.name, doc.approved_by.title, (v) => { doc.approved_by.name = v; }, (v) => { doc.approved_by.title = v; }, "Approved by"))));
  }

  /* The contact person is on the page twice (client information and the signature): typing in one fills the other. */
  function syncContact() {
    const p = ctx.doc().project;
    for (const el of box().querySelectorAll("[data-bind]")) {
      if (el !== document.activeElement && el.textContent !== (p[el.dataset.bind] || "")) el.textContent = p[el.dataset.bind] || "";
    }
  }
  const bound = (el, key) => { el.dataset.bind = key; return el; };

  function info(doc) {
    const p = doc.project;
    const f = (label, key, placeholder) => [h("dt", null, label), h("dd", null, text(p[key], (v) => { p[key] = v; }, { placeholder, label: label.replace(":", "") }))];
    const dateField = (label, key) => {
      const show = () => D.shortDate(p[key]) || "Set a date";
      const input = h("input", { type: "date", class: "q-date-input", value: p[key] || "", tabindex: "-1", "aria-hidden": "true" });
      const btn = h("button", { type: "button", class: "ed q-date", title: "Change the date" }, show());
      btn.addEventListener("click", () => { try { input.showPicker(); } catch { input.focus(); } });
      input.addEventListener("change", () => { p[key] = input.value; btn.textContent = show(); ctx.changed(); });
      return [h("dt", null, label), h("dd", { class: "q-date-wrap" }, btn, input)];
    };
    return h("section", { class: "q-info" },
      h("dl", null, ...f("Project Name:", "title", "Project name"), ...f("Project Code:", "code", "2026TEG-P0000"),
        ...f("Project Duration:", "period", "Dates or period"), ...f("Client's Name:", "client", "Client company"),
        ...f("PO Number:", "po", "If the client has one"),
        h("dt", null, "Contact Person:"), h("dd", { class: "q-contact-person" },
          bound(text(p.contact, (v) => { p.contact = v; syncContact(); }, { placeholder: "Name", label: "Contact person" }), "contact"),
          text(p.contact_email, (v) => { p.contact_email = v; }, { placeholder: "E-mail", label: "Contact person's e-mail" }),
          bound(text(p.designation, (v) => { p.designation = v; syncContact(); }, { placeholder: "Designation", label: "Contact person's designation" }), "designation"))),
      h("dl", null, ...dateField("Prepared Date:", "prepared"), ...dateField("Expiration:", "expires")));
  }

  function head(doc) {
    const e = RULES.entities[doc.entity] || RULES.entities.PDEI;
    return h("header", { class: "q-head" },
      h("div", { class: "q-title" }, h("h2", null, "PROJECT QUOTATION"), h("p", null, "CLIENT INFORMATION")),
      h("img", { class: "q-logo", src: e.logo || "img/mineski-philippines.svg", alt: e.logoAlt || "Mineski Philippines", width: "118", height: "84" }));
  }

  function render() {
    const doc = ctx.doc();
    if (!doc) { box().replaceChildren(); return; }
    box().replaceChildren(head(doc), info(doc), table(doc), totalsBlock(doc), termsBlock(doc), signatures(doc));
    box().classList.toggle("show-costs", ctx.costs());
  }

  /* After an edit: redraw the numbers only, so the field being edited keeps its focus. */
  function paintTotals() {
    const doc = ctx.doc();
    if (!doc) return;
    const t = D.totals(doc);
    const set = (key, v) => { const el = box().querySelector(`[data-total="${key}"]`); if (el) el.textContent = D.peso(v); };
    set("total", t.total); set("asf", t.asf); set("subtotal", t.subtotal); set("vat", t.vat); set("grand", t.grand); set("grandWords", t.grand);
    const disc = box().querySelector(".q-discount");
    if (disc) disc.classList.toggle("is-zero", !t.discount);
    D.tranches(doc, RULES.tranches).forEach((x, i) => set(`tranche${i}`, x.amount));
    for (const l of D.allLines(doc)) {
      const el = box().querySelector(`[data-sub="${l.id}"]`);
      if (el) el.textContent = D.peso(D.lineTotal(l));
    }
  }

  /* Before printing: blank fields print as nothing (no placeholder), and a row that is only a blank field goes. */
  function prepPrint() {
    for (const el of box().querySelectorAll(".ed")) el.classList.toggle("is-blank", !el.textContent.trim());
    for (const el of box().querySelectorAll("[data-hide-blank]")) el.classList.toggle("is-blank", [...el.querySelectorAll(".ed")].every((x) => !x.textContent.trim()));
  }

  return { render, paintTotals, prepPrint };
}
