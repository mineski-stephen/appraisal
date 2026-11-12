# Changelog

## 0.3.1 · Nov 12, 2026

- The quotation's header carries the official Mineski Philippines logo (`mineski-philippines-vertical.svg`). The page uses a copy with the letters turned into outlines (`img/mineski-philippines.svg`), because the original needs the Gotham font, which most computers don't have; it would have printed in a fallback font.
- The totals now sit under the Quantity to Subtotal columns, so the gold grand total and every amount above it end exactly where the Subtotal column ends.
- Shared design fixes (also in the other tools): the side notes scroll by themselves, collapsible cards and label/figure pairs use the family's shared styles, the wide quotation view uses the shared `wide` rule, and the phone top bar rule moved into the shared stylesheet. No change to how the page looks.
- New `npm run check:shell`: fails if an id is used twice in `index.html` (the cause of the Designation bug fixed in 0.3.0), if the version and the changelog disagree, or if a script doesn't parse.

## 0.3.0 · Nov 12, 2026

The quotation now looks like the quotations Mineski sends to clients, and the page is easier to work in.

- **New quotation layout**, modelled on the signed quotations (baseline: 2026TEG-P0293) without copying the spreadsheet cell for cell: the centred title with the Mineski mark, the client information block with a PO Number and the contact's e-mail, a navy band per section, pale blue per sub-section, striped lines, and the gold grand total. Dates read "Nov 12, 2026".
- **Template slips corrected**: "FREQUENCE" is "FREQUENCY"; rows are numbered in order (1, 1.1, 1.1.1) with no skipped or empty numbered rows; a zero discount, the bank block's "Select:" row and blank contact lines no longer print; VAT is no longer red; amounts are not in brackets; the signature blocks stay on one page. In the terms, "dates about stated" reads "dates above stated" and "returned to the Mineski" reads "returned to MINESKI"; clauses are numbered 1 to 17.
- **More to edit**: add or remove sections, sub-sections and payment tranches (each with Undo), set each tranche's percent and date, and add details under any line from its pencil button. Esc cancels a number you are typing.
- **Easier to use**: the particulars column is about twice as wide (the page is wider on the quotation and the notes move below it on smaller screens); the toolbar stays in view with the grand total and how it stands against the budget; the notes list what is still blank before sending; the notes column scrolls by itself; Ctrl+P prints the same clean PDF as the button.
- **Fixes**: the Designation box in Settings was never saved (two elements shared one id). "New estimate" on the quotation looked like a back button but discarded the draft; it is now "Back to the brief" and keeps it. The preview sample could not draft (it reported an old service version). On phones the top bar no longer pushes the avatar off the screen.
- **Tidier brief page**: the brief and "Budget and scale" are one card instead of two with different corners and padding; the disclosure arrows match the rest of the family.

## 0.2.3 · Nov 12, 2026

- Appraisal has its own logo: a teal price tag with two estimate lines and an orange string, drawn to the Mineski app-icon recipe. It shows as the favicon, the home-screen icon, the top-bar mark and on the login card (`img/appraisal-icon.svg` plus 32, 180 and 512 px PNGs).

## 0.2.2 · Nov 12, 2026

- Housekeeping, no change to the page: the CE data project moved into `internal/`, which is never committed (new `.gitignore`), and the paths to the service (now `../tech/anthropic-ce`) are fixed in the README, `npm run test:proxy` and the preview-sample builder.

## 0.2.1 · Nov 10, 2026

- The Estimate and Brief tags now follow the particular instead of squeezing it onto extra lines.

## 0.2.0 · Nov 10, 2026

- Drafts fit the client's budget. The notes say what was done to fit it, list any lines left out with an Add back button, and show what the draft cost. Saving a PDF that is over the budget asks first. Needs anthropic-ce 1.1.0.

## 0.1.0 · Nov 10, 2026

- First prototype: add a client brief (PDF, images or pasted text) plus budget and scale, and Appraisal drafts a cost estimate as a Mineski project quotation. Edit it in place, show or hide internal costs and markups, and save it as a PDF. Needs the anthropic-ce service 1.0.0.
