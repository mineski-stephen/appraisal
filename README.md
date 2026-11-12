# Appraisal

<img src="img/appraisal-icon.svg" alt="Appraisal logo" width="96" align="right">

Turns a client brief into a first-draft cost estimate, shown as a Mineski **project quotation**
(the "Quotation (Automated)" layout) that you edit in place and save as a PDF.

1. **Add the brief.** PDFs, images or text files, or paste it. Optionally set the client budget,
   VAT, billing entity, event days, audience, cities, talents and notes; these override the brief.
2. **Draft the estimate.** Usually one to two minutes. Claude chooses the sections and lines;
   prices come from Mineski's past CEs (the price knowledge base), not from the AI.
3. **Check and edit.** Every cell is editable. **Show costs** reveals each line's internal cost,
   markup and where the price came from. Lines marked **Estimate** have no price history: get a
   quote. The side panel shows our cost, gross profit, the budget check, questions for the
   client, assumptions and what was left out.
4. **Save as PDF.** Uses the browser's print dialog ("Save as PDF"). Only the quotation prints:
   costs, markups and the notes never appear in it.

The draft stays in this tab (it survives a reload or a re-login) until you close the tab, log
out or start a new estimate.

## How it's built

```
Browser: static page (GitHub Pages, no build step, ES modules)
  ├── Lark proxy (shared)          login and user check, as every Mineski tool
  └── anthropic-ce (Workers/Render) POST /appraise: checks the Lark login, asks Claude for the
                                    lines, prices them from kb.json, returns the priced draft
```

The page holds no prices, markups or keys. The service (`../tech/anthropic-ce`) holds the Anthropic
key and the knowledge base, and only answers people who can open the CE Line Items table in Lark.

`internal/` holds the CE data project that builds the knowledge base: the CE workbooks, signed CEs,
invoices, Lark pulls, the pipeline, its outputs and the hand-off notes. It is internal and
confidential, and `.gitignore` keeps all of it out of the repo. Start at `internal/hand-off/README.md`.

| File | Purpose |
| ---- | ------- |
| `js/config.js` | Names, version, service addresses, quotation rules (ASF, VAT, tranches, entities) |
| `js/app.js` | State, routes, the brief form, the draft request, the quotation screen |
| `js/doc.js` | The quotation's model and maths (pure, tested) |
| `js/quote.js` | Draws and edits the quotation; what prints and what doesn't |
| `js/terms.js` | The Terms and Conditions text from the Automated quotation tabs |
| `js/estimate.js` | The request to anthropic-ce (upload progress, backup address) |
| `js/auth.js`, `net.js`, `errors.js`, `session.js` | The family's login and connections (from Suppliers / the systems skill) |
| `js/settings.js`, `settings-view.js` | Settings |
| `css/mineski-base.css`, `js/ui.js`, `js/icons.js`, `tools/serve.py` | Shared design-language files, copied unedited |

## Running it

```bash
python tools/serve.py
```

Open http://127.0.0.1:9126/. Before the first login, add `http://127.0.0.1:9126/` (and the Pages
address once published) to the Lark app's Redirect URLs. Port 9126 is Appraisal's.

- `?preview` (this computer only): runs on `tests/fixture.json`, a made-up appraisal, with no
  login and no service. A red badge says so.
- `?ce=http://127.0.0.1:8002`: use a local anthropic-ce. `?reset` clears it.

## Settings

Account, Appearance (`appraisal.theme`), your details for "Prepared by" (`appraisal.settings`),
Connections (the Lark proxy, the estimate service and its knowledge base), and This browser.
Storage: `appraisal.settings`, `appraisal.etaSeconds`, `appraisal.costs` (localStorage);
`appraisal.draft`, `appraisal.compose` (this tab only). The login is shared by every Mineski tool.

## Testing

`npm test` runs the document tests offline. `npm run test:proxy` runs the service's tests.
`node tests/make-fixture.mjs` rebuilds the preview sample.

## Security and privacy

No secrets or prices in the page. The brief is sent to the estimate service and from there to
Anthropic. Costs and markups appear on screen only for people the service lets in, and never in
the PDF. Closing the tab doesn't log you out (the login is shared and lasts about 2 hours); Log
out ends it for every Mineski tool in this browser.

## Troubleshooting

| You see | What to do |
| ------- | ---------- |
| "Appraisal can't reach its estimate service right now." | Settings > Connections. If it says "Not set", the service address in `js/config.js` is missing. |
| "Your Lark account doesn't have access to the CE Line Items table." | Ask the Base owner to share it with you, then log in again. |
| "The appraisal service has no price knowledge base yet." | The admin uploads `kb.json` (see `../tech/anthropic-ce/README.md`). |
| "This address (…) isn't registered on the Lark app." | Add the address to the Lark app's Redirect URLs. |
| Lines marked Estimate | No past price for that item: get a supplier quote before sending. |
