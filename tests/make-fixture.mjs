// Builds tests/fixture.json: a MADE-UP appraisal (invented items and prices) for ?preview, priced
// by the service's own code (../anthropic-ce/src/appraise.js). Run: node tests/make-fixture.mjs
import { writeFileSync } from "node:fs";
import { price, readInputs } from "../../anthropic-ce/src/appraise.js";

const KB = { version: "sample", items: [
  { id: "S-1", name: "Account Management", cat: "Manpower", per: "per project", cost: 20000, low: 15000, high: 25000, projects: 40, markup: 0.1, method: "Internal" },
  { id: "S-2", name: "LED Wall", cat: "Stage Technicals", per: "per day", cost: 45000, low: 38000, high: 55000, projects: 12, markup: 0.1, method: "Procurement" },
  { id: "S-3", name: "Ushers", cat: "Manpower", per: "per day", cost: 1500, low: 1300, high: 1800, projects: 30, markup: null, method: "Procurement" },
], rules: { markup_by_category: { Manpower: 0.1, "Stage Technicals": 0.1, Service: 0, "Talent/KOL": 0.11, "Food & Beverage": 0.1 }, asf_rate: 0.125, vat_rate: 0.12 } };
const L = (item_id, particular, qty, frq, per, category, method, pricing, unit_cost, covers, details = "", remarks = "") =>
  ({ item_id, particular, details, qty, frq, per, category, method, pricing, unit_cost, covers, remarks });
const draft = {
  project: { title: "Sample Mall Gaming Weekend", client: "Sample Client Inc.", period: "December 5-6, 2026", venue: "Sample Mall Atrium, Pasig",
    summary: "A two-day mobile gaming tournament and activation at a mall atrium.", event_days: 2, audience: 800 },
  sections: [
    { name: "GENERAL OPERATIONS", groups: [{ name: "Project Planning", lines: [
      L("S-1", "Account Management", 1, 1, "per project", "Manpower", "Internal", "catalogue", 0, "standard"),
      L("", "Project Management", 1, 1, "per project", "Manpower", "Internal", "estimate", 20000, "standard") ] }] },
    { name: "PRODUCTION", groups: [{ name: "Stage & Technicals", lines: [
      L("S-2", "LED Wall 4m x 2.5m", 1, 2, "per day", "Stage Technicals", "Procurement", "catalogue", 0, "Main stage", "P3.9, with processor and operator"),
      L("", "Lights and Sounds Package", 1, 2, "per day", "Stage Technicals", "Procurement", "estimate", 60000, "Main stage") ] }] },
    { name: "MANPOWER", groups: [{ name: "Event Staff", lines: [
      L("S-3", "Ushers", 6, 2, "per day", "Manpower", "Procurement", "catalogue", 0, "Crowd handling") ] }] },
    { name: "TALENTS", groups: [{ name: "Hosts and Casters", lines: [
      L("", "Event Host", 1, 2, "per day", "Talent/KOL", "Procurement", "estimate", 25000, "Program flow"),
      L("", "Prize Pool", 1, 1, "per project", "Service", "Procurement", "brief_amount", 100000, "Tournament prizes") ] }] },
  ],
  assumptions: ["The mall provides the venue and power.", "Two event days, 9 AM to 9 PM."],
  clarifications: ["How many teams will join the tournament?", "Is the prize pool part of the budget?"],
  excluded: ["Livestream production: the brief asks for photos only."],
};
const appraisal = price(draft, KB, readInputs({ budget: 450000, vat: "YES" }));
writeFileSync(new URL("./fixture.json", import.meta.url), JSON.stringify({ appraisal, meta: { model: "claude-opus-5-5", duration_ms: 64000, cost_usd: 0.41, usage: { output_tokens: 9800 } } }, null, 1));
console.log("fixture:", appraisal.stats, appraisal.totals);
