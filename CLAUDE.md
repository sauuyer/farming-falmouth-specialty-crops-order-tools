# Farming Falmouth Specialty Crops — order system

Weekly produce ordering between a small farm in Falmouth, MA and local restaurants.
The farm posts what it can cut each week; chefs order against that list; orders land in
a Google Sheet the farm can pivot for season-over-season sales.

## Shape

Static pages on GitHub Pages + a Google Apps Script web app on the farm's own Sheet.
GitHub Pages has no database, so the pages hold no data — they ask the Sheet for
everything.

```
index.html   restaurant order form — the only URL chefs get
admin.html   farm console: offerings / order form preview / weekly summary
assets/app.js    shared by both pages; each sets window.MODE first
assets/app.css   shared stylesheet
assets/config.js the only file edited after deploy (API_URL, SHEET_URL)
backend/Code.gs  Apps Script JSON API; lives in the Sheet, not deployed from here
```

Sheet tabs: **Catalog** (every crop ever offered), **Orders** (long format), **Config**
(deliveryDate, orderCloseDate, notifyEmail, farmName), **OrderMeta** (orderId → fulfilled,
farmNotes — separate lifecycle from Orders; run `setupSheets()` to create it).

## Decisions that look wrong and aren't

**Orders are long format — one row per crop ordered, never one column per crop.**
This is the single most important property of the system. A column per crop means every
new offering mid-season reshapes the table and breaks formulas pointing at it, and since
most crops don't sell most weeks the sheet fills with blanks. Adding a crop must stay a
row operation. If someone asks for a wide crop-by-week grid, build it as a derived view,
never as the storage format.

**Every price row stores its own unit price.** Prices drift between seasons. Looking
price up from the Catalog at report time would silently recalculate last year's revenue
at this year's prices.

**`api()` posts with `Content-Type: text/plain`.** Deliberate. That makes it a CORS
"simple request", so the browser skips the preflight that Apps Script does not answer.
Changing it to `application/json` breaks every call from the GitHub Pages origin. There
is a comment saying so in `app.js`; keep it.

**Availability is re-checked inside the `LockService` lock in `placeOrder_`.** Checking
before the lock lets two restaurants both pass on the last twenty pounds of shishitos.
The front end's cap on the quantity input is a courtesy; the server check is the real one.

**`ADMIN_KEY` is a shared passphrase, not authentication.** It keeps a curious chef out
of the settings page. Do not describe it to the user as security, and do not build
anything on top of it that assumes it is. It lives in Apps Script → Project Settings →
Script Properties and **must never appear in this repo**. The public endpoint is safe
because it only ever returns offered crops and remaining counts — keep it that way; any
new public action needs the same scrutiny.

**Units are free text** ("1 lb", "0.5 lb", "per flower", "per stem"). Farmers price the
way they'd say it out loud. Don't normalize to a unit enum.

## Working with the user

**Do not commit or push unless explicitly told to.** Stage files when asked, show the
diff or status, and wait for the user to say "commit" or "push" before running those
commands.

## Working on this

No build step, no dependencies, no tests. To see changes, open the pages against a
deployed backend — `config.js` must point at a real `/exec` URL or every call fails.
There is no local mock; adding one is a reasonable task if iteration gets painful.

After editing `Code.gs`, redeploy via **Manage deployments → edit → New version**, not
*New deployment*. New deployment mints a new URL and every restaurant's bookmark dies.

Design: Inter throughout, green palette defined as CSS custom properties at the top of
`app.css` with light and dark variants. Three sections in this order — Herbs, Flowers,
Other Produce — declared as `SECTIONS` in both `app.js` and `Code.gs`. Changing them
means changing both.

## Known gaps

- The Claude artifact demo is a separate, self-contained copy of this UI running on a
  different storage layer. The two can drift. This repo is the source of truth.
- The `status` column in Orders (`New / Packed / Delivered / Invoiced`) is not read or
  written by the UI. Fulfillment state lives in **OrderMeta** instead (keyed by orderId,
  stored as a checkbox in the weekly summary's expandable detail row).
- No order cutoff enforcement — the Wednesday date is displayed, not enforced.
- No per-restaurant pricing, no order minimum.
- `admin.html` re-fetches everything after each write. Fine at this size; would need
  attention past a few thousand order rows.
