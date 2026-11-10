// The quotation's maths and edits (js/doc.js). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as D from "../js/doc.js";

const fixture = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
const fresh = () => D.fromAppraisal(fixture.appraisal, { today: "2026-11-10", validDays: 7, preparer: { name: "A. Manager" }, inputs: { budget: 900000 } });

test("a new document takes the service's lines, rates and dates", () => {
  const doc = fresh();
  assert.equal(doc.project.title, "Sample Mall Gaming Weekend");
  assert.equal(doc.project.prepared, "2026-11-10");
  assert.equal(doc.project.expires, "2026-11-17");
  assert.equal(doc.asf_rate, 0.125);
  assert.equal(doc.vat_rate, 0.12);
  assert.equal(D.allLines(doc).length, 6);                 // one left out to fit the sample budget
  assert.equal(doc.notes.removed.length, 1);
  assert.equal(D.addBack(doc, 0).particular, "Lights and Sounds Package");
  assert.equal(D.allLines(doc).length, 7);
  assert.equal(doc.prepared_by.name, "A. Manager");
  assert.equal(doc.notes.budget, 450000);                  // the service's budget wins over the form's
});

test("totals match the service's and the template's formulas", () => {
  const doc = fresh();
  const t = D.totals(doc);
  const s = fixture.appraisal.totals;
  assert.equal(t.total, s.total_cost);
  assert.equal(t.asf, s.asf);
  assert.equal(t.subtotal, s.subtotal);
  assert.equal(t.vat, s.vat);
  assert.equal(t.grand, s.grand_total);
  assert.equal(t.base, s.base_cost);
  doc.discount = 1000;
  assert.equal(D.totals(doc).subtotal, Math.round((t.total + t.asf - 1000) * 100) / 100);
});

test("editing the client price moves the markup, never the internal cost", () => {
  const doc = fresh();
  const l = D.allLines(doc)[0];            // Account Management, cost 20,000, markup 10%
  D.setLine(doc, l.id, "client_unit", 25000);
  assert.equal(l.unit_cost, 20000);
  assert.equal(l.markup, 0.25);
  assert.equal(D.clientUnit(l), 25000);
  D.setLine(doc, l.id, "qty", 2);
  assert.equal(D.lineTotal(l), 50000);
});

test("lines can be added, removed and put back", () => {
  const doc = fresh();
  const g = doc.sections[0].groups[0];
  const n = g.lines.length;
  const added = D.addLine(g, g.lines[0].id);
  assert.equal(g.lines[1], added);
  const removed = D.removeLine(doc, g.lines[0].id);
  assert.equal(g.lines.length, n);
  D.restoreLine(removed);
  assert.equal(g.lines[0], removed.line);
});

test("tranches, formats and old drafts", () => {
  const doc = fresh();
  const tr = D.tranches(doc, [{ label: "1st", pct: 0.7 }, { label: "2nd", pct: 0.3 }]);
  assert.equal(Math.round((tr[0].amount + tr[1].amount) * 100) / 100, D.totals(doc).grand);
  assert.equal(D.peso(34019.244), "₱34,019.24");
  assert.equal(D.sectionNo(0), "1.0");
  assert.equal(D.sectionNo(2), "3");
  assert.equal(D.longDate("2026-11-10"), "November 10, 2026");
  assert.equal(D.normalize({}), null);
  const old = D.normalize({ sections: [{ name: "X", groups: [{ name: "Y", lines: [{ particular: "Z", qty: "2" }] }] }] });
  assert.equal(old.sections[0].groups[0].lines[0].qty, 2);
  assert.ok(old.sections[0].groups[0].lines[0].id);
});
