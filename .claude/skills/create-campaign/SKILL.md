---
name: create-campaign
description: Interactively draft a new letter-writing campaign for action.hashin.me. Asks Hashin for the topic, target minister, background, and the specific ask, drafts a subject + letter, and appends it to data/campaigns.json. Trigger when Hashin asks to add, create, draft, or launch a new campaign for the action site.
---

# Create a new action.hashin.me campaign

This skill turns a topic Hashin describes into a ready-to-publish campaign entry in
`data/campaigns.json` — the file the site reads to render the homepage and each campaign page.

## 1. Gather the details

Ask Hashin for each of the following (use `AskUserQuestion` where it fits, otherwise ask in
chat). Don't skip straight to drafting on assumptions — this becomes a real email to a real
government office.

- **Campaign title** — short, public-facing (e.g. "Fix Kuttanad Flood Drainage").
- **Category/tag** — one or two words (e.g. "Environment", "Roads & Infrastructure").
- **Target minister** — read `data/ministers.json` and show the list of names/portfolios so
  Hashin can pick one (or more, for a joint letter). Do not invent a minister not in that file.
- **Background** — what's happening and why it matters, in Hashin's own words or notes.
- **The specific ask** — exactly what the minister/office should do (a decision, an inspection,
  funding, a timeline). Letters without a concrete ask are weak — push for one if it's vague.
- **Tone/register** — default to formal and respectful; ask if Hashin wants urgent, personal-story,
  or another register.
- **Any deadline or time-sensitivity** worth naming in the letter.

## 2. Check the minister's email before drafting further

Look up the chosen minister's `email` field in `data/ministers.json`.

- If it's still `"FILL_ME"` (unfilled placeholder): **stop and flag this clearly.** Tell Hashin
  the email hasn't been verified yet (see `data/ministers-roster.xlsx` / `docs/SETUP.md`). Offer
  two options: (a) draft the campaign now but leave its `status` as `"demo"` routed to a safe
  test inbox (e.g. `hashjith@gmail.com`) until a real address is confirmed, or (b) hold off
  entirely. Never guess or fabricate an official email address.
- If it's a real address: proceed, and set `status` to `"live"` once Hashin confirms it's ready
  to publish (default to `"demo"` first so Hashin can test-send to themself, same as the seed
  demo campaign).

## 3. Draft the letter

Write:

- **subject** — one line, may include `{{constituency}}`. This becomes the actual email's
  Subject header (used by both the Gmail-compose and mailto: send paths).
- **body** — 150–250 words, formal register, references the constituency, states the ask
  plainly. Must start with `{{subject_line}}` (expands to `Subject: <the subject above>` — the
  formal-letter convention of restating the subject inline before the salutation), then
  "Respected Sir/Madam," and the letter itself, and close with a signature block using
  `{{sender_name}}`, `{{constituency}}`, `{{contact_line}}`, `{{date}}` on their own lines.
  `{{contact_line}}` expands to `Email: ...` (and `Phone: ...` on its own line, only if the
  visitor gave one) — so the office can identify/reply to the sender directly. Use this
  skeleton and just replace the middle paragraphs:

  ```
  {{subject_line}}

  Respected Sir/Madam,

  <2-4 paragraphs of letter body>

  Regards,
  {{sender_name}}
  {{constituency}} constituency
  {{contact_line}}
  {{date}}
  ```

  Required placeholders (verbatim, double curly braces) — the site substitutes them live as the
  visitor fills the form: `{{subject_line}}`, `{{sender_name}}`, `{{constituency}}`,
  `{{contact_line}}`, `{{date}}`.
- **background** — 2–4 sentences shown on the campaign page above the letter, explaining the
  issue to a visitor who knows nothing about it yet.
- **summary** — one sentence for the homepage card.

Show the full draft to Hashin and revise until approved. Keep the mailto payload reasonably
short — long letters can hit URL-length limits in some email clients, so don't let the body run
past ~1,800 characters.

## 4. Publish it

1. Generate a `slug`: kebab-case of the title, ASCII only (e.g. `fix-kuttanad-flood-drainage`).
2. Read `data/campaigns.json`, append a new object to the `campaigns` array in this shape, and
   write the file back (preserve every existing campaign untouched):

```json
{
  "slug": "fix-kuttanad-flood-drainage",
  "status": "demo",
  "title": "Fix Kuttanad Flood Drainage",
  "category": "Environment",
  "summary": "One-sentence summary for the homepage card.",
  "background": "2-4 sentences of context shown on the campaign page.",
  "minister": {
    "name": "Minister Name (from data/ministers.json)",
    "designation": "Portfolio, from data/ministers.json",
    "email": "the verified email, or a safe test inbox if still unverified",
    "cc": []
  },
  "subject": "Subject line with optional {{constituency}}",
  "body": "{{subject_line}}\n\nRespected Sir/Madam,\n\n...letter text with {{constituency}}...\n\nRegards,\n{{sender_name}}\n{{constituency}} constituency\n{{contact_line}}\n{{date}}",
  "created": "YYYY-MM-DD"
}
```

3. Tell Hashin the local test URL: `campaign.html?c=<slug>` (open via a local static server —
   `python3 -m http.server` from the repo root — since `fetch()` of local JSON needs http(s), not
   `file://`).
4. Remind Hashin: test the full send flow (including the Google Sheet log, if
   `assets/js/config.js` has `APPS_SCRIPT_URL` set) before flipping `status` to `"live"` and
   pushing to GitHub.
