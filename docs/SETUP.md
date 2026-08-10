# Setup guide for action.hashin.me

Five one-time setup steps (the fourth and fifth are optional). Do them in this order.

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
7. Commit and push that change. Submissions will now silently log in the background — visitors never see the Sheet, only the form. Each campaign gets its **own tab, named after the campaign**, created automatically the first time someone sends a letter for it (see "How submissions are organised" below).

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

## 4. Ops dashboard (optional — Google sign-in for internal stats)

`ops.html` shows live counts (total letters sent, this week, campaign breakdown, pending
"Start a Campaign" proposals) pulled from the Sheet. It isn't linked from the public site, and
even if someone finds the URL, they can't see any data without signing in with an authorised
Google account — access is checked server-side on every request, not just in the page's JS.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), and create (or select) a project.
2. Go to **APIs & Services → OAuth consent screen**.
   - User type: **External**.
   - App name: `Action Ops` (or anything — only you and people you approve will see this).
   - Add a support email (yours).
   - Under **Test users**, add every Google account that should be able to sign in — e.g.
     `sneha4luvn@gmail.com`, and your own if you want access too. While the app is in
     **Testing** status (the default — no need to publish it), sign-in only works for accounts
     on this list, which is a useful second layer on top of the allowlist in step 5.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Action Ops Dashboard`.
   - Authorized JavaScript origins: add `https://action.hashin.me`.
   - Leave **Authorized redirect URIs** empty — Google Identity Services' sign-in button doesn't need one.
   - Click **Create** and copy the **Client ID** (ends in `.apps.googleusercontent.com`).
4. Paste that Client ID into [`assets/js/config.js`](../assets/js/config.js):
   ```js
   window.GOOGLE_CLIENT_ID = "XXXXXXXX.apps.googleusercontent.com";
   ```
5. Paste the **same** Client ID into [`apps-script/Code.gs`](../apps-script/Code.gs) (`GOOGLE_CLIENT_ID` near the top), and edit `ALLOWED_OPS_EMAILS` to list exactly which Google accounts may view the dashboard.
6. Redeploy the script: **Deploy → Manage deployments → Edit (pencil) → New version → Deploy** — same step as any other `Code.gs` change.
7. Commit and push the `config.js` change, then visit `https://action.hashin.me/ops.html` and sign in. (You'll see an "unverified app" warning during sign-in while the OAuth consent screen is in Testing status — that's expected for your own app; click through it.)
8. **Important, easy to miss:** pasting `Code.gs` into GitHub does *not* update the live script — it's a separate copy running on Google's servers. Every time you change `Code.gs`, you must also paste it into the Apps Script editor and redeploy (step 6) for the change to take effect.
9. The first time `Code.gs` calls an external service it hasn't called before (`UrlFetchApp`, used for verifying sign-in and, if you set up part 5, for GitHub/Gemini), Google won't have granted that permission yet, and every request will fail with `You do not have permission to call UrlFetchApp.fetch`. Redeploying doesn't trigger the consent prompt by itself — you have to run something that uses it once, manually: temporarily add
   ```js
   function testAuth() { UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=test"); }
   ```
   anywhere in the file, select `testAuth` from the function dropdown in the toolbar, click **Run**, and approve the permissions dialog (**Review permissions → your account → Advanced → Go to [project name] (unsafe) → Allow** — expected, since it's your own unverified script). It'll finish with a harmless error (the fake token gets rejected) — that's fine, the point was just granting the permission. Delete `testAuth` afterwards.

## 5. Approving campaigns from the ops dashboard (optional)

With this set up, the "Approve" button next to a pending "Start a Campaign" submission on
`ops.html` drafts a formal letter (matching the site's existing tone) using Gemini, and opens a
GitHub pull request adding it to `data/campaigns.json`. **Nothing goes live automatically** —
merging that PR is the actual publish step, so you always get a chance to read the AI-drafted
letter before a real minister sees it. Approve is disabled for any submission whose target
minister still has a `"FILL_ME"` placeholder email in `data/ministers.json`.

This needs two secrets. Both go in the Apps Script editor's **Project Settings → Script
Properties** — never paste either into `Code.gs` itself, since that file is committed to a
public GitHub repo.

1. Get a free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (Google AI Studio — no billing required for the free tier this uses).
2. Create a GitHub **fine-grained personal access token** at [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - Repository access: **Only select repositories** → `hashin/action`.
   - Permissions: **Contents** → Read and write, **Pull requests** → Read and write.
   - Set an expiry (90 days is reasonable) — you'll get an email reminder to renew it before Approve stops working.
3. In the Apps Script editor, open **Project Settings** (gear icon, left sidebar) → **Script Properties → Add script property**, and add two:
   - `GEMINI_API_KEY` = the key from step 1
   - `GITHUB_TOKEN` = the token from step 2
4. That's it — no redeploy needed for Script Properties changes (they're read at request time). Try Approve on a pending submission whose minister has a real email.

If you ever need to revoke access, delete the Script Property or the GitHub token — Approve will fail with a clear "isn't set" error rather than silently doing nothing.

## How submissions are organised

Every campaign gets its own sheet tab, named after the campaign's title (e.g. sending a letter
for "Demo: Fix My Local Road" creates/uses a tab named that), with columns: Timestamp, Sender
Name, Sender Email, Sender Phone, Constituency, Minister, Campaign Slug, Received At (Server).
The tab is created automatically on that campaign's first submission — nothing to set up per
campaign.

Two things worth knowing:
- Tab names can't contain `[ ] * ? / \ :` or exceed 100 characters, so long or punctuated
  titles get lightly cleaned up (colons become dashes, names get truncated) — the script does
  this automatically.
- If you rename a campaign's `title` in `data/campaigns.json` after it's already collected
  submissions, new ones start a new tab under the new name rather than continuing the old one.
  Keep titles stable once a campaign is live, or manually rename the sheet tab to match.

"Start a Campaign" proposals (below) are separate from this — they always go to one shared
"Campaign Requests" tab, since they aren't yet real campaigns.

## Testing safely

The site ships with one **demo campaign** ("Demo: Fix My Local Road") whose "minister" email is your own inbox (`hashjith@gmail.com`), so you can click through the whole flow — including the Google Sheet logging — without emailing anyone real. Once you're happy, add real campaigns (see the `create-campaign` skill) and either edit `data/campaigns.json` to remove the demo, or set its `"status"` to `"closed"` so it stops showing on the homepage but stays in history.

## Reviewing "Start a Campaign" requests

Any visitor can propose a new campaign from `start-campaign.html` (linked from the homepage). Nothing is published automatically — each submission lands as a new row in the **"Campaign Requests"** tab of your Google Sheet (created automatically on first submission), with columns: Timestamp, Status, Campaign Title, Category, Target Minister, Background / Issue, The Ask, Sender Name, Sender Email, Sender Phone, Constituency.

To review:
1. Open the Sheet and check the "Campaign Requests" tab periodically.
2. For a submission worth pursuing, either ask Claude Code to run it through the `create-campaign` skill (paste in the row's details — title, minister, background, ask), or draft it yourself and add it to `data/campaigns.json` directly.
3. Once you've acted on a row, fill in its **Status** cell — `Published` or `Rejected` — so you don't review it twice. Rows with a blank Status are your queue.

If you update `apps-script/Code.gs` for this (it now routes by a `type` field, and the token check is unchanged), remember the redeploy step from part 1: **Deploy → Manage deployments → Edit → New version → Deploy**.
