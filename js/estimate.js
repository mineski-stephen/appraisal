/*
 * Talking to the estimate service (anthropic-ce): the wait-time estimate and the request itself
 * (XHR, for real upload progress). Adapted from Fetch's js/extract.js. Waking the service, its
 * status and the compatibility check are in net.js (ceService).
 */
import * as auth from "./auth.js";
import { ceService } from "./net.js";
import { RULES } from "./config.js";
import { store, recall } from "./ui.js";

/** Upload limits: what the service reports at GET /, else the config's fallback. */
export function limits() {
  const l = (ceService.status.info || {}).limits || {};
  return { maxUploadMb: Number(l.max_upload_mb) || RULES.maxUploadMb, maxFiles: Number(l.max_files) || RULES.maxFiles };
}

const ACCEPT = /\.(pdf|png|jpe?g|webp|gif|txt|md|csv)$/i;
export const acceptable = (file) => ACCEPT.test(file.name || "");

// ---- wait-time estimate ----------------------------------------------------------------
const TIMES_KEY = "appraisal.etaSeconds";   // the last few drafts' durations (seconds)
/** Seconds a draft usually takes, from the last runs in this browser (else the config's guess). */
export function estimate(files) {
  const past = (recall("local", TIMES_KEY) || []).filter((x) => x > 0);
  const base = past.length ? past.reduce((a, b) => a + b, 0) / past.length : RULES.typicalSeconds;
  const mb = files.reduce((s, f) => s + f.size, 0) / 1048576;
  return Math.round(base + mb / 1.5);
}
export function remember(seconds) {
  if (!(seconds > 0)) return;
  store("local", TIMES_KEY, [...(recall("local", TIMES_KEY) || []), Math.round(seconds)].slice(-5));
}
export const resetEstimate = () => store("local", TIMES_KEY, undefined);

// ---- the request -------------------------------------------------------------------------
export class EstimateError extends Error {
  constructor(message, code, status, retryAfter) {
    super(message);
    Object.assign(this, { code, status, retryAfter });
  }
}

/* The address in use couldn't do the work at all: send it again to the other one. A draft writes
   nothing, so that's safe. Never for answers about the brief, the login or the limits. */
const RESEND = new Set(["network", "gateway", "worker_limit", "misconfigured", "busy"]);

/** POST /appraise, moving to the other address if this one can't do the work. Returns
 *  { promise, abort }. Hooks: onUploadProgress(fraction), onUploaded(), onBackup(). */
export function send(files, text, inputs, hooks = {}) {
  let current = null, aborted = false;
  const promise = (async () => {
    for (let hop = 0; ; hop++) {
      const used = ceService.url();
      current = sendOnce(files, text, inputs, hooks);
      try {
        return await current.promise;
      } catch (err) {
        if (aborted || !RESEND.has(err.code) || hop >= ceService.count() - 1) throw err;
        if (ceService.url() === used && !ceService.failover()) throw err;
        hooks.onBackup?.();
        if (!await ceService.wake()) throw err;
        if (aborted) throw new EstimateError("Cancelled.", "aborted", 0);
      }
    }
  })();
  return { promise, abort: () => { aborted = true; current?.abort(); } };
}

function sendOnce(files, text, inputs, { onUploadProgress, onUploaded } = {}) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f, f.name));
  if (text) form.append("text", text);
  form.append("inputs", JSON.stringify(inputs));
  const xhr = new XMLHttpRequest();
  const started = performance.now();
  const promise = new Promise((resolve, reject) => {
    const login = auth.token();
    if (!login) {
      auth.end();
      return reject(new EstimateError("Your login has ended. Log in again, then draft the estimate.", "login_expired", 401));
    }
    xhr.open("POST", `${ceService.url()}/appraise`);
    xhr.setRequestHeader("Authorization", `Bearer ${login}`);   // the service checks this with Lark
    xhr.timeout = 6 * 60 * 1000;
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onUploadProgress?.(e.loaded / e.total);
    xhr.upload.onload = () => onUploaded?.();
    xhr.onload = () => {
      ceService.worked();
      const body = xhr.response || {};
      if (xhr.status === 200 && body.appraisal) return resolve(body);
      const err = body.error || {};
      if (["login_required", "login_expired", "login_invalid"].includes(err.code)) auth.end(err.message);
      const code = err.code || ([502, 503, 504].includes(xhr.status) ? "gateway" : "http");
      reject(new EstimateError(err.message || `The estimate service answered with an error (HTTP ${xhr.status}). Try again in a moment.`,
        code, xhr.status, Number(xhr.getResponseHeader("Retry-After")) || 0));
    };
    xhr.onerror = () => {
      ceService.threw(started);
      reject(new EstimateError(ceService.isBlocked()
        ? `Your browser is blocking ${ceService.host()}, probably an ad blocker or privacy extension. Allow that site, then reload.`
        : `Appraisal can't reach its estimate service (${ceService.host()}). It may still be waking up; try again in a moment.`,
        "network", 0));
    };
    xhr.ontimeout = () => reject(new EstimateError("The draft took too long. Try again, or send a shorter brief.", "timeout", 0));
    xhr.onabort = () => reject(new EstimateError("Cancelled.", "aborted", 0));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
