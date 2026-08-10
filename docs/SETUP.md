# Setup guide for action.hashin.me

Three one-time setup steps. Do them in this order.

## 1. Google Sheet + Apps Script (stores sender submissions — free, no server)

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet. Name it e.g. **"Action Campaign Submissions"**.
2. In the sheet, go to **Extensions → Apps Script**. This opens the script editor, already linked to this sheet.
3. Delete the placeholder `myFunction() {}` code, and paste in the contents of [`apps-script/Code.gs`](../apps-script/Code.gs) from this repo.
4. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" → choose **Web app**.
   - Description: `action.hashin.me submissions`
   - Execute as: **Me**
   - Who has access: **Anyone** (this is required so the public site can submit to it — it can only *write* rows via this script, nobody can read your sheet through it)
   - Click **Deploy**, then **Authorize access** and approve the permissions (it's your own script, on your own sheet).
5. Copy the **Web app URL** it gives you (ends in `/exec`).
6. Open [`assets/js/config.js`](../assets/js/config.js) in the repo and paste it in:
   ```js
   window.APPS_SCRIPT_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
   ```
7. Commit and push that change. Submissions will now silently log to your Sheet's "Submissions" tab in the background — visitors never see the Sheet, only the form.

Whenever you edit `Code.gs` later, you need to **Deploy → Manage deployments → Edit (pencil) → New version → Deploy** again for changes to take effect.

## 2. DNS at Spaceship (points action.hashin.me at GitHub Pages)

1. Log in to [spaceship.com](https://www.spaceship.com) and go to your **hashin.me** domain → **DNS records** (sometimes called "Advanced DNS" or "DNS & Nameservers").
2. Add a new record:
   - **Type:** `CNAME`
   - **Host / Name:** `action`
   - **Value / Target / Points to:** `hashin.github.io`
   - **TTL:** leave default (or 3600)
3. Save. If Spaceship already has an `A` record or other record for `action`, remove it first — you can only have one record per host name.
4. DNS changes can take a few minutes up to a few hours to propagate. You can check with:
   ```bash
   dig action.hashin.me CNAME +short
   ```
   It should eventually print `hashin.github.io.`

## 3. GitHub Pages (serves the site, enforces HTTPS)

This repo already has:
- A `CNAME` file containing `action.hashin.me`
- Pages will be enabled automatically once pushed (see repo setup step run by Claude)

After pushing, in the repo on GitHub go to **Settings → Pages** and confirm:
- **Source:** Deploy from branch → `main` / `(root)`
- **Custom domain:** `action.hashin.me` (should already be filled in from the CNAME file)
- Once GitHub verifies DNS (can take up to ~24h after step 2), tick **Enforce HTTPS**.

That's it — visiting `https://action.hashin.me` should show the site.

## Testing safely

The site ships with one **demo campaign** ("Demo: Fix My Local Road") whose "minister" email is your own inbox (`hashjith@gmail.com`), so you can click through the whole flow — including the Google Sheet logging — without emailing anyone real. Once you're happy, add real campaigns (see the `create-campaign` skill) and either edit `data/campaigns.json` to remove the demo, or set its `"status"` to `"closed"` so it stops showing on the homepage but stays in history.

## Reviewing "Start a Campaign" requests

Any visitor can propose a new campaign from `start-campaign.html` (linked from the homepage). Nothing is published automatically — each submission lands as a new row in the **"Campaign Requests"** tab of your Google Sheet (created automatically on first submission, alongside the existing "Submissions" tab), with columns: Timestamp, Status, Campaign Title, Category, Target Minister, Background / Issue, The Ask, Sender Name, Sender Email, Sender Phone, Constituency.

To review:
1. Open the Sheet and check the "Campaign Requests" tab periodically.
2. For a submission worth pursuing, either ask Claude Code to run it through the `create-campaign` skill (paste in the row's details — title, minister, background, ask), or draft it yourself and add it to `data/campaigns.json` directly.
3. Once you've acted on a row, fill in its **Status** cell — `Published` or `Rejected` — so you don't review it twice. Rows with a blank Status are your queue.

If you update `apps-script/Code.gs` for this (it now routes by a `type` field, and the token check is unchanged), remember the redeploy step from part 1: **Deploy → Manage deployments → Edit → New version → Deploy**.
