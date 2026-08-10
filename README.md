# action.hashin.me

A free, static "write to your minister" site: visitors pick a campaign, review a drafted
letter, fill in their name/contact/constituency, and send it to the target office in one click.
Visitors can also propose new campaigns themselves via a "Start a Campaign" form. No visitor
registration. No paid backend.

## Stack (all free)

- **Hosting:** GitHub Pages (this repo), custom domain `action.hashin.me`.
- **Sending:** primary button is a plain `mailto:` link, pre-filled. Most visitors are expected
  to be on a phone, where mailto: reliably opens whatever mail app is already installed and set
  as the OS handler — Gmail, Outlook, Yahoo, a carrier app, anything — so this works for
  everyone, not just Gmail users. Two secondary options cover the remaining cases: "Open in
  Gmail" (a Gmail compose window, for desktop browsers with no mail app registered but a
  signed-in Gmail session) and "Copy letter to paste elsewhere" (copies To/Subject/body to the
  clipboard, for any other webmail or app). Whichever path, the visitor presses Send
  themselves — nothing is sent from a server.
- **Storage:** a Google Sheet, written to in the background via a Google Apps Script Web App
  (free, no server to run or pay for). Visitors never see the Sheet — only a normal form. Each
  campaign gets its own tab, named after the campaign, created automatically on its first
  submission — so senders for different campaigns never mix in one list.
- **Letters:** pre-written per campaign (see the `create-campaign` skill below) rather than a
  live AI API call, since that would need a paid/hosted backend or an exposed API key to work
  from a static site.
- **New campaign proposals:** `start-campaign.html` lets any visitor propose a campaign (pick a
  minister, describe the issue and the ask). Nothing publishes automatically — it's moderated:
  submissions land in a "Campaign Requests" tab in the same Sheet, and you review and publish
  the ones worth pursuing (see `docs/SETUP.md`). A public form that auto-published straight to
  `data/campaigns.json` would let anyone send letters to real ministers under this site's name
  with no review — not something to build unmoderated.

## Structure

```
index.html              Homepage — campaign list
campaign.html            Campaign detail + send form (reads ?c=<slug>)
start-campaign.html      Public "propose a campaign" form (goes to a review queue)
assets/css/style.css
assets/js/app.js         Shared logic: render pages, mailto builder, Sheet logging
assets/js/config.js      Set APPS_SCRIPT_URL here after deploying the Apps Script
data/campaigns.json      All campaigns — the site's only content database
data/ministers.json      Kerala Council of Ministers roster (emails start as placeholders)
data/ministers-roster.xlsx   Fill-in spreadsheet to collect verified staff emails
apps-script/Code.gs       Google Apps Script source — one tab per campaign for sends,
                            plus a shared tab for campaign requests
docs/SETUP.md             Step-by-step: Apps Script, DNS (Spaceship), GitHub Pages,
                            reviewing campaign requests
.claude/skills/create-campaign/   A Claude Code skill: run it to interactively draft
                                    and add a new campaign
```

## First-time setup

See [`docs/SETUP.md`](docs/SETUP.md) — three steps: deploy the Apps Script, add a DNS record
at your registrar, and confirm GitHub Pages picks up the custom domain.

## Adding a campaign

Open this repo in Claude Code and ask it to create a new campaign (or run the
`create-campaign` skill directly). It will ask for the topic, the target minister, the
background, and the specific ask, draft the letter, and add it to `data/campaigns.json`.

Never publish a campaign with an unverified minister email. `data/ministers.json` starts with
`"FILL_ME"` placeholders — fill in real, confirmed addresses (via `data/ministers-roster.xlsx`)
before setting a campaign's `status` to `"live"`.
