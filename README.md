# DXLVI

A private tracker for weight, daily habits, and (soon) body measurements. DXLVI is 546 in Roman numerals, the weight of the first weigh-in on Aug 13, 2012.

This is **phase 1**: sign-in gate, daily log (weight, water, strength, cardio, stretching, balance, meditation, food, alcohol, steps, notes) with editing and backfill, history, a weight chart, settings, history import, and export.
Coming next: monthly measurements with the in/cm toggle and reminder banner (phase 2), then medications, streaks and highlights (phase 3).

## How it fits together

- `public/` is the website (plain HTML, CSS, and JavaScript, no build step).
- `netlify/functions/api.mjs` is the one server function. It checks your passcode and saves data in Netlify Blobs.
- `server/` holds the logic the function uses. `test/` checks it.
- Entries are stored one month per record (`entries/2026-10`), plus a `settings` record.

## Put it online (GitHub, then Netlify)

1. Create a **private** GitHub repository and upload everything in this folder **except** `Seed data/`, `Referenced files/`, and `node_modules/` (they are listed in `.gitignore`, which keeps them out if you use Git).
2. In Netlify choose **Add new site, Import an existing project**, and pick the repository. The settings come from `netlify.toml`, so leave the build command empty.
3. Before the first deploy, open **Site configuration, Environment variables** and add:
   - `APP_PASSCODE`: the passcode you will type to sign in. Pick something long. Anyone with it can read and change your data.
   - `SESSION_SECRET` (optional): a long random string. If you leave it out, one is derived from your passcode.
   Make sure the variables are available to **Functions**.
4. Deploy, open the site, and sign in.
5. Go to **Settings, Bring in old history** and choose `dxlvi-historical-weights.csv` and `dxlvi-historical-extras.csv` from your `Seed data` folder. It only fills gaps, so running it twice is safe.
6. On your phone, use the browser's **Add to Home Screen** to get the DXLVI icon.

To sign every device out, change `SESSION_SECRET` (or `APP_PASSCODE`, if you never set a secret) and redeploy.

## Try it on your computer first

```
npm install
npm run dev:local
```

Then open http://localhost:8888 and sign in with the passcode `dxlvi-local` (or set `APP_PASSCODE` yourself). Data is saved as JSON files in `.local-data/` and never touches Netlify. `npm run dev` uses the Netlify CLI instead, with a sandboxed local store.

`npm test` runs the checks on the API.

## Your data

- **Settings, Download backup (JSON)** saves everything. Do it now and then; Netlify Blobs is storage, not a backup service.
- **Settings, Download days (CSV)** opens in a spreadsheet.
- Weight is always pounds. Measurements will be stored in inches and can be shown in centimeters.
- A reading marked "Needs review" (hollow dot on the chart) is left out of the 31-day average until you tap "Looks right".

## Privacy

The site tells search engines to stay away, every request needs your passcode, and wrong guesses lock the sign-in for 15 minutes after eight misses. Keep the repository private, since the code is not secret but your passcode and data should be.
