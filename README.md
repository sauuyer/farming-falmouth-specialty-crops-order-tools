# Farming Falmouth Specialty Crops — weekly order system

Two pages on GitHub Pages, one Google Sheet behind them.

- `index.html` — the restaurant order form. This is the only URL chefs get.
- `admin.html` — the farm console: this week's offerings, order form preview, order records.

## Why there's a second piece

GitHub Pages serves files. It has no database, so it cannot store an order or count
down remaining units — a purely static site would show a form that quietly drops
everything typed into it.

So the pages are static and the data lives in a Google Sheet, reached through a small
Apps Script web app. Free, no server to maintain, and the farm can open the raw sheet
any time. The pages hold no data of their own; they ask the sheet.

```
GitHub Pages                    Google
┌─────────────┐                ┌──────────────┐
│ index.html  │──── order ────▶│  Apps Script │──▶ Sheet: Catalog
│ admin.html  │◀─ what's left ─│   web app    │──▶ Sheet: Orders
└─────────────┘                └──────────────┘──▶ Sheet: Config
```

## Setup

**1. The sheet and its script**

Create a Google Sheet. **Extensions → Apps Script.** Paste in `backend/Code.gs`, save,
then run `setupSheets` once from the function dropdown and approve the permissions
prompt. That builds three tabs — Catalog, Orders, Config — with all fourteen crops loaded.

**2. The admin key**

In Apps Script: **Project Settings → Script Properties → Add script property.** Name it
`ADMIN_KEY`, value = whatever passphrase the farm will type to open the console.

This is a shared password, not real authentication. It keeps a curious chef out of the
settings page. It will not stop someone determined, and it is not the thing protecting
the sheet — the sheet itself stays private to the Google account that owns it, and the
public endpoint only ever returns offered crops and remaining counts.

**3. Deploy the script**

**Deploy → New deployment → Web app.** *Execute as* **Me**, *Who has access* **Anyone**.
Copy the `/exec` URL.

"Anyone" sounds alarming and isn't: it means anyone can send the form a request, which
is exactly what a restaurant does. Order records and settings still need the key.

**4. The pages**

Push this folder to a repo, then **Settings → Pages → Deploy from a branch → main / root.**

Edit `assets/config.js` with the `/exec` URL and a link to your sheet. It's the only
file you touch.

**5. Hand out the links**

- Restaurants: `https://<you>.github.io/<repo>/`
- The farm: `https://<you>.github.io/<repo>/admin.html`

Re-deploying the script after any `Code.gs` edit gives a new URL unless you use
**Manage deployments → edit → New version**, which keeps it. Use that, or you'll be
re-sending links to every restaurant.

## The weekly rhythm

Open the console. Set the delivery Thursday — the Wednesday cutoff and the delivery
week both compute from it. Toggle on what you can cut. Adjust units and prices. Put a
number in **Units available** for anything you have a hard ceiling on.

That last field is what stops double-selling. It's optional; leave it blank and the crop
reads "Ask for any quantity." Fill it in and every chef sees the live remainder, the
quantity box caps itself, and the count is re-checked inside a lock at the moment an
order is submitted — so two restaurants hitting send in the same minute can't both take
the last twenty pounds.

## Adding a crop

"Add a crop to Herbs" writes a new **row** on the Catalog tab. Not a column.

This is worth being deliberate about, because a column per crop is the intuitive move
and it's the one that breaks. With a column per crop, adding an offering mid-season means
altering the shape of the Orders tab and repairing every formula that pointed at it, and
because most crops don't sell most weeks, the sheet fills with blanks. One row per crop
ordered keeps the columns fixed forever. A new crop is just more rows, and every question
worth asking is a pivot table:

| Question | Pivot |
|---|---|
| Revenue by crop by month | Crop × Month, sum Line total |
| Biggest account | Restaurant, sum Line total |
| Was thyme worth the bed space | Filter Crop, sum Qty and Line total |
| What sells in week 36, so you know what to plant | Delivery week × Crop |

## Things worth adding later

- **Status column.** Already on the Orders tab. Run it *New → Packed → Delivered →
  Invoiced* and unpaid invoices become a filter instead of a memory exercise.
- **Per-restaurant pricing**, if you end up with a standing wholesale account.
- **A minimum order**, if small orders stop being worth the drive.

## One note on the price list

Half-pound units make a chef do arithmetic before they can compare you to a distributor.
Thyme at "$7 / 0.5 lb" is $14/lb — right inside the $13.80–$15.00 band your own notes cite
— but the chef has to work that out. Listing it as **$14 per lb, half-pound minimum** is
the same money in the number they already know. The unit field is free text, so you can
change it whenever you want to try it.

## Customer facing URL
https://sauuyer.github.io/farming-falmouth-specialty-crops-order-tools/

## Farmer facing URL
https://sauuyer.github.io/farming-falmouth-specialty-crops-order-tools/admin.html
