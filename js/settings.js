/*
 * Settings: per-browser preferences layered over config.js (copied from Suppliers' settings.js,
 * with the estimate service added and Suppliers' price choices left out).
 *
 *   config.js defaults  <-  saved in this browser (local page only)  <-  ?lark= / ?ce= (local page only, per tab)
 *
 * Both services receive people's login tokens, so a hosted page always uses the real ones. Every
 * active override is listed by cfg().overrides and shown as a red badge in the top bar.
 */
import { APP, SERVICES } from "./config.js";
import { store, recall } from "./ui.js";

const KEY = "appraisal.settings";

const isLocalHost = (name) => /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/.test(name);
const isLocal = (u) => { try { return isLocalHost(new URL(u).hostname); } catch (_) { return false; } };
/** https, or http on this computer. */
export const isServiceUrl = (u) => {
  try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && isLocal(u)); } catch (_) { return false; }
};
export const localPage = isLocalHost(location.hostname);

const read = () => recall("local", KEY) || {};

let current;
const listeners = new Set();
/** The configuration in force: { larkUrls, ceUrls, overrides: ["…"] }. */
export const cfg = () => current;
export const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const SERVICE_KEYS = [
  ["lark", "larkUrl", "Connection service"],
  ["ce", "ceUrl", "Estimate service"],
];

export function rebuild() {
  const s = localPage ? read() : {};
  const c = { larkUrls: [...SERVICES.lark.urls], ceUrls: [...SERVICES.ce.urls], overrides: [] };
  const q = localPage ? new URLSearchParams(location.search) : null;
  for (const [id, saved, label] of SERVICE_KEYS) {
    const list = `${id}Urls`;
    if (s[saved] && isServiceUrl(s[saved])) { c[list] = [s[saved]]; c.overrides.push(`${label} address (Settings)`); }
    if (q) {
      const tabKey = `appraisal.override.${id}`;
      if (q.has("reset")) store("session", tabKey, undefined);
      if (q.get(id) && isServiceUrl(q.get(id))) store("session", tabKey, q.get(id));
      const v = recall("session", tabKey);
      if (v && isServiceUrl(v)) { c[list] = [v]; c.overrides.push(`${label} address (page link)`); }
    }
    c[list] = c[list].map((u) => String(u || "").replace(/\/+$/, "")).filter(Boolean);
  }
  if (APP.env !== "live") c.overrides.push(`Environment: ${APP.env}`);
  current = c;
}

/** Save a change ({ key: value }, "" or null removes it). */
export function set(patch) {
  const next = Object.assign(read(), patch);
  Object.keys(next).forEach((k) => (next[k] == null || next[k] === "") && delete next[k]);
  const ok = store("local", KEY, next);
  rebuild();
  listeners.forEach((fn) => fn(patch));
  return ok;
}

/** The person's own details for the quotation's "Prepared by" (remembered in this browser). */
export function preparer() {
  const s = read();
  return { name: s.preparedName || "", title: s.preparedTitle || "", email: s.preparedEmail || "" };
}

export { read as get };

rebuild();
