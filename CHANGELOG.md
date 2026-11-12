# Changelog

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
