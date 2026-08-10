# action.hashin.me

A free, static "write to your minister" site: visitors pick a campaign, review a drafted
letter, fill in their name/contact/constituency, and send it to the target office in one click.
No visitor registration. No paid backend.

## Stack (all free)

- **Hosting:** GitHub Pages (this repo), custom domain `action.hashin.me`.
- **Sending:** primary button opens a **Gmail compose window** pre-filled (works for anyone
  signed into Gmail in their browser — the common case for this audience, and needs no
  registered mail handler). A secondary "use your device's mail app" link falls back to a
  `mailto:` link for people with a desktop client. Either way, the visitor presses Send
  themselves — nothing is sent from a server. (Plain `mailto:` alone silently does nothing for
  visitors with no default mail app registered, which is most browser-only Gmail users — that's
  why Gmail compose is the primary path.)
- **Storage:** a Google Sheet, written to in the background via a Google Apps Script Web App
  (free, no server to run or pay for). Visitors never see the Sheet — only a normal form.
- **Letters:** pre-written per campaign (see the `create-campaign` skill below) rather than a
  live AI API call, since that would need a paid/hosted backend or an exposed API key to work
  from a static site.

## Structure

```
index.html              Homepage — campaign list
campaign.html            Campaign detail + send form (reads ?c=<slug>)
assets/css/style.css
assets/js/app.js         Shared logic: render pages, mailto builder, Sheet logging
assets/js/config.js      Set APPS_SCRIPT_URL here after deploying the Apps Script
data/campaigns.json      All campaigns — the site's only content database
data/ministers.json      Kerala Council of Ministers roster (emails start as placeholders)
data/ministers-roster.xlsx   Fill-in spreadsheet to collect verified staff emails
apps-script/Code.gs       Google Apps Script source — appends submissions to a Sheet
docs/SETUP.md             Step-by-step: Apps Script, DNS (Spaceship), GitHub Pages
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
