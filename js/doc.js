/*
 * The estimate as a document: the model behind the quotation on screen. Pure (no DOM, no network),
 * tested in Node (tests/doc.test.mjs).
 *
 * A line keeps its internal cost (unit_cost, VAT-inclusive, before markup) and its markup; the
 * quotation shows only the client price: client_unit = unit_cost x (1 + markup). Changing the
 * client price on the quotation changes the markup, never the internal cost. Markups and costs are
 * never part of the printed quotation (the client must not see them).
 *
 * Totals follow the "Quotation (Automated)" tabs:
 *   TOTAL COST  = sum of qty x frq x client_unit
 *   ASF         = TOTAL COST x asf_rate
 *   DISCOUNT    = an amount
 *   SUBTOTAL    = TOTAL COST + ASF - DISCOUNT
 *   VAT         = SUBTOTAL x vat_rate
 *   GRAND TOTAL = SUBTOTAL + VAT
 */
export const DOC_VERSION = 1;

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x, d = 0) => { const v = Number(x); return Number.isFinite(v) ? v : d; };
let seq = 0;
export const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A fresh document from the service's appraisal. */
export function fromAppraisal(ap, { today, validDays = 7, entity = "PDEI", preparer = {}, inputs = {} } = {}) {
  const p = ap.project || {};
  return {
    v: DOC_VERSION,
    project: {
      title: String(p.title || "").trim(), code: "", client: String(p.client || "").trim(),
      period: String(p.period || "").trim(), venue: String(p.venue || "").trim(), contact: "", designation: "",
      prepared: today, expires: addDays(today, validDays),
    },
    sections: (ap.sections || []).map((s) => ({
      name: s.name, groups: (s.groups || []).map((g) => ({
        name: g.name, lines: (g.lines || []).map((l) => ({
          id: newId(), particular: l.particular, details: l.details || "", qty: num(l.qty, 1), frq: num(l.frq, 1), per: l.per || "per project",
          unit_cost: num(l.unit_cost), markup: num(l.markup), category: l.category || "", method: l.method || "",
          covers: l.covers || "", remarks: l.remarks || "", source: l.source || { kind: "estimate" }, remarksOnQuote: "",
        })),
      })),
    })),
    asf_rate: num((ap.defaults || {}).asf_rate, 0.125),
    vat_rate: num((ap.defaults || {}).vat_rate, 0.12),
    discount: 0,
    entity: (ap.defaults || {}).entity || entity,
    bank: { name: "", account: "" },
    prepared_by: { name: preparer.name || "", title: preparer.title || "", email: preparer.email || "" },
    approved_by: { name: "", title: "" },
    notes: {
      summary: p.summary || "", assumptions: ap.assumptions || [], clarifications: ap.clarifications || [],
      excluded: ap.excluded || [], checks: ap.checks || [], stats: ap.stats || {},
      budget: num(inputs.budget), budget_basis: inputs.budget_basis || "VAT_INC",
    },
  };
}

export const clientUnit = (l) => r2(num(l.unit_cost) * (1 + num(l.markup)));
export const lineTotal = (l) => r2(num(l.qty) * num(l.frq) * clientUnit(l));
export const lineCost = (l) => r2(num(l.qty) * num(l.frq) * num(l.unit_cost));
export const allLines = (doc) => doc.sections.flatMap((s) => s.groups.flatMap((g) => g.lines));

export function totals(doc) {
  const lines = allLines(doc);
  const total = r2(lines.reduce((n, l) => n + lineTotal(l), 0));
  const base = r2(lines.reduce((n, l) => n + lineCost(l), 0));
  const asf = r2(total * num(doc.asf_rate));
  const discount = r2(num(doc.discount));
  const subtotal = r2(total + asf - discount);
  const vat = r2(subtotal * num(doc.vat_rate));
  const grand = r2(subtotal + vat);
  const gp = r2(subtotal - base);
  return { total, asf, discount, subtotal, vat, grand, base, gp, gp_margin: subtotal ? r2((gp / subtotal) * 10000) / 10000 : 0,
    lines: lines.length };
}

/** Section number as on the template: "1.0" for the first, then "2", "3"... */
export const sectionNo = (i) => (i === 0 ? "1.0" : String(i + 1));

/** Find a line (and its group) by id. */
export function findLine(doc, id) {
  for (const s of doc.sections) for (const g of s.groups) {
    const i = g.lines.findIndex((l) => l.id === id);
    if (i >= 0) return { section: s, group: g, index: i, line: g.lines[i] };
  }
  return null;
}

/** Change one field of a line. Setting the client price ("client_unit") moves the markup. */
export function setLine(doc, id, field, value) {
  const hit = findLine(doc, id);
  if (!hit) return false;
  const l = hit.line;
  if (["qty", "frq", "unit_cost"].includes(field)) l[field] = Math.max(0, num(value));
  else if (field === "markup") l.markup = num(value);
  else if (field === "client_unit") {
    const v = Math.max(0, num(value));
    if (l.unit_cost > 0) l.markup = r2((v / l.unit_cost - 1) * 10000) / 10000;
    else { l.unit_cost = v; l.markup = 0; }
  } else l[field] = String(value ?? "");
  return true;
}

export function removeLine(doc, id) {
  const hit = findLine(doc, id);
  if (!hit) return null;
  const [line] = hit.group.lines.splice(hit.index, 1);
  return { line, group: hit.group, index: hit.index };
}

/** Put a removed line back (Undo). */
export function restoreLine(removed) {
  removed.group.lines.splice(Math.min(removed.index, removed.group.lines.length), 0, removed.line);
}

export function addLine(group, after = null) {
  const line = { id: newId(), particular: "", details: "", qty: 1, frq: 1, per: "per project", unit_cost: 0, markup: 0.1,
    category: "", method: "Procurement", covers: "", remarks: "", source: { kind: "manual" }, remarksOnQuote: "" };
  const i = after ? group.lines.findIndex((l) => l.id === after) : -1;
  group.lines.splice(i >= 0 ? i + 1 : group.lines.length, 0, line);
  return line;
}

/** Payment tranches on the grand total. */
export const tranches = (doc, list) => list.map((t) => ({ ...t, amount: r2(totals(doc).grand * t.pct) }));

/** Money as on the template: ₱34,019.24. */
export const peso = (x) => `₱${(Number(x) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (x) => `${Math.round((Number(x) || 0) * 1000) / 10}%`;
export const qtyText = (x) => (Number.isInteger(Number(x)) ? String(Number(x)) : String(Math.round(Number(x) * 100) / 100));

/** "2026-11-10" -> "November 10, 2026". */
export function longDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** A saved document from an older or damaged draft, made safe to show (unknown fields dropped). */
export function normalize(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.sections)) return null;
  for (const s of doc.sections) {
    s.groups = (s.groups || []).filter((g) => g && Array.isArray(g.lines));
    for (const g of s.groups) for (const l of g.lines) {
      l.id = l.id || newId();
      for (const k of ["qty", "frq", "unit_cost", "markup"]) l[k] = num(l[k]);
      l.source = l.source || { kind: "estimate" };
    }
  }
  doc.project = doc.project || {};
  doc.bank = doc.bank || { name: "", account: "" };
  doc.prepared_by = doc.prepared_by || { name: "", title: "", email: "" };
  doc.approved_by = doc.approved_by || { name: "", title: "" };
  doc.notes = doc.notes || { assumptions: [], clarifications: [], excluded: [], checks: [], stats: {} };
  return doc;
}
