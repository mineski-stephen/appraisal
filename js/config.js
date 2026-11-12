/*
 * Appraisal: everything a maintainer may change. No secrets: the site is public.
 *
 * Appraisal turns a client brief into a first-draft cost estimate (CE), shown as a project
 * quotation you can edit and save as a PDF. The drafting and the pricing happen on its own
 * service, anthropic-ce (Cloudflare Workers, with Render as the backup), which holds the
 * Anthropic key and the price knowledge base. The page never sees either.
 *
 * Every Lark call runs as the person who logged in (their own user token, about 2 hours). The
 * service checks that token with Lark: only people who can open the CE Line Items table may draft.
 *
 * For local testing, per tab (local page only, shown by a red badge):
 *   http://127.0.0.1:9126/?ce=http://127.0.0.1:8002      the estimate service on this computer
 *   http://127.0.0.1:9126/?lark=http://127.0.0.1:8001    the Lark proxy on this computer
 *   ?reset clears both. Settings > Advanced does the same and is remembered.
 */

/* version: bump it with every release and add an entry to CHANGELOG.md (newest first, same number). */
export const APP = { name: "Appraisal", key: "appraisal", version: "0.2.3", env: "live" };   // env: "live" | "test"
export const ENV_LABEL = APP.env === "test" ? "Test copy" : "";

export const SERVICES = {   // hosted defaults, tried in order; `min` and `headers` are checked on every wake
  lark: { urls: ["https://lark-proxy.stephen-lin.workers.dev", "https://lark-proxy-dwiw.onrender.com"],
          service: "lark-cors-proxy", min: "2.0.0", headers: ["Authorization"] },
  // anthropic-ce. Fill in the Render address once it's deployed (it gets a random suffix), and add
  // both addresses to index.html's connect-src.
  ce: { urls: ["https://anthropic-ce.stephen-lin.workers.dev"],
        service: "anthropic-ce", min: "1.1.0", headers: ["Authorization"] },
};

export const LARK = {
  appId: "cli_aab0716138b8ded3",
  scopes: "bitable:app",
  api: "https://open.larksuite.com/open-apis",
  authorize: "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
  tzOffsetMinutes: 480,
};

export const RULES = {
  maxUploadMb: 30,          // until the service says otherwise (GET / limits)
  maxFiles: 8,
  accepted: ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv",
  asfRate: 0.125,           // agency service fee, unless the draft or the person sets another
  vatRate: 0.12,
  validDays: 7,             // the quotation's expiration, from the prepared date
  tranches: [{ label: "1st", pct: 0.7, when: "30 days from invoice date" }, { label: "2nd", pct: 0.3, when: "30 days from invoice date" }],
  // Each entity's registered name, as it appears in the quotation's terms. Fill GG's in when known.
  entities: {
    PDEI: { company: "Pillar Digital E-Commerce Inc.", brand: "MINESKI" },
    GG: { company: "", brand: "MINESKI" },
  },
  // Typical time for one draft (seconds), for the loader's estimate before any run has been timed.
  typicalSeconds: 90,
};
