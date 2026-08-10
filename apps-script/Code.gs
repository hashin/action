/**
 * action.hashin.me — submission logger.
 * Deploy as a Web App bound to a Google Sheet. See docs/SETUP.md for step-by-step instructions.
 *
 * The front end POSTs a JSON body (as text/plain, to avoid a CORS preflight) with a `type`
 * field selecting where it goes:
 *
 *   type: "send" (default, existing behaviour) — a visitor sent a letter for an existing
 *     campaign. Fields: campaign_slug, campaign_title, sender_name, sender_email,
 *     sender_phone, constituency, minister, timestamp, token
 *     Logged to a sheet named after that campaign (created on its first submission).
 *
 *   type: "campaign_request" — a visitor used the "Start a Campaign" form to propose a new
 *     campaign. Fields: campaign_title, category, target_minister, background, the_ask,
 *     sender_name, sender_email, sender_phone, constituency, timestamp, token
 *     Logged to the shared "Campaign Requests" sheet with an empty Status cell — review
 *     and mark it "Published" or "Rejected" once you've acted on it (see docs/SETUP.md).
 *
 * Each sheet gets its header row created automatically on first use.
 *
 * doGet handles the internal ops dashboard (ops.html): reading a live snapshot (default),
 * and the "Approve" action, which drafts a letter with Gemini and opens a GitHub pull request
 * adding the campaign to data/campaigns.json — merging that PR is what makes it live. Both
 * require a Google-signed credential from an address in ALLOWED_OPS_EMAILS. See docs/SETUP.md,
 * parts 4 and 5.
 */

// Lightweight deterrent against random bot spam. Must match window.SUBMIT_TOKEN
// in assets/js/config.js. Not real security — it's readable in the site's JS by
// anyone who looks — just enough to stop non-targeted spam bots.
const SHARED_TOKEN = "JdKbkmiaOIO41uUqgrTpaPO2LL-4evwC";

// Ops dashboard (ops.html) access — this one IS real security, unlike SHARED_TOKEN above.
// Must exactly match GOOGLE_CLIENT_ID in assets/js/config.js. See docs/SETUP.md, part 4.
const GOOGLE_CLIENT_ID = "730575915949-6lhke3abh9c67p0cqarup9d6r5l2c85j.apps.googleusercontent.com";
const ALLOWED_OPS_EMAILS = ["sneha4luvn@gmail.com", "hashjith@gmail.com"]; // add more Google accounts here to grant access

// "Approve" on ops.html (see docs/SETUP.md, part 5). These are real secrets — set them in
// Project Settings → Script Properties in the Apps Script editor, NEVER paste them into this
// file (which is committed to a public GitHub repo).
const GITHUB_REPO = "hashin/action";

function getSecret(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(name + " isn't set — add it in Project Settings → Script Properties (see docs/SETUP.md, part 5).");
  return value;
}

const FALLBACK_SHEET_NAME = "Submissions"; // used only if a send has no campaign title/slug at all
const SEND_HEADERS = [
  "Timestamp", "Sender Name", "Sender Email", "Sender Phone", "Constituency",
  "Minister", "Campaign Slug", "Received At (Server)"
];

const CAMPAIGN_REQUESTS_SHEET_NAME = "Campaign Requests";
const CAMPAIGN_REQUESTS_HEADERS = [
  "Timestamp", "Status", "Campaign Title", "Category", "Target Minister", "Background / Issue",
  "The Ask", "Sender Name", "Sender Email", "Sender Phone", "Constituency", "Received At (Server)"
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (SHARED_TOKEN && data.token !== SHARED_TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === "campaign_request") {
      const sheet = getOrCreateSheet(CAMPAIGN_REQUESTS_SHEET_NAME, CAMPAIGN_REQUESTS_HEADERS);
      sheet.appendRow([
        data.timestamp || "",
        "", // Status — left blank for you to fill in once reviewed
        data.campaign_title || "",
        data.category || "",
        data.target_minister || "",
        data.background || "",
        data.the_ask || "",
        data.sender_name || "",
        data.sender_email || "",
        data.sender_phone || "",
        data.constituency || "",
        new Date()
      ]);
    } else {
      // One sheet per campaign, named after the campaign, created the first time
      // anyone sends a letter for it.
      const sheetName = sanitizeSheetName(data.campaign_title || data.campaign_slug);
      const sheet = getOrCreateSheet(sheetName, SEND_HEADERS);
      sheet.appendRow([
        data.timestamp || "",
        data.sender_name || "",
        data.sender_email || "",
        data.sender_phone || "",
        data.constituency || "",
        data.minister || "",
        data.campaign_slug || "",
        new Date()
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------- Ops dashboard (ops.html) — read-only, gated by Google sign-in ----------

function doGet(e) {
  try {
    const idToken = e.parameter.credential;
    if (!idToken) {
      return jsonOutput({ ok: false, error: "missing credential" });
    }

    const verified = verifyGoogleIdToken(idToken);
    if (!verified.email || ALLOWED_OPS_EMAILS.indexOf(verified.email) === -1) {
      // TEMPORARY: reasonDetail exposes why a sign-in was rejected (mismatched Client ID vs.
      // an email genuinely not on the allowlist) so it's visible right on ops.html instead of
      // digging through the Executions log. Only reachable by someone who already completed a
      // real Google sign-in against our OAuth client — remove once ops.html works reliably.
      return jsonOutput({ ok: false, error: "unauthorized", reasonDetail: verified.reason });
    }

    if (e.parameter.action === "approve") {
      return jsonOutput(approveCampaignFlow(e.parameter.row));
    }

    return jsonOutput({ ok: true, data: buildOpsSnapshot() });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Verifies a Google Identity Services ID token server-side via Google's tokeninfo endpoint
// (Apps Script has no JWT library). Confirms the token is genuine, was issued for our own
// OAuth client (not some other app), and carries a verified email — then returns that email.
function verifyGoogleIdToken(idToken) {
  const res = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    return { email: null, reason: "tokeninfo call failed: status=" + res.getResponseCode() + " body=" + res.getContentText() };
  }
  const payload = JSON.parse(res.getContentText());
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    return { email: null, reason: "aud mismatch: tokenAud=" + payload.aud + " expectedAud=" + GOOGLE_CLIENT_ID };
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    return { email: null, reason: "email not verified: email=" + payload.email };
  }
  return { email: payload.email || null, reason: "email=" + payload.email + " allowedEmails=" + JSON.stringify(ALLOWED_OPS_EMAILS) };
}

// Aggregates real counts from the Sheet — nothing here is estimated or fabricated. Ministry
// reply status isn't tracked anywhere in this Sheet, so it's intentionally left out rather
// than guessed at.
function buildOpsSnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const receivedAtCol = SEND_HEADERS.length - 1; // "Received At (Server)" is always the last column
  const constituencyCol = SEND_HEADERS.indexOf("Constituency");

  let totalSent = 0;
  let sentThisWeek = 0;
  const campaigns = [];

  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (name === CAMPAIGN_REQUESTS_SHEET_NAME) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      campaigns.push({ title: name, sent: 0, uniqueConstituencies: 0 });
      return;
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, SEND_HEADERS.length).getValues();
    const constituencies = {};
    let thisWeek = 0;

    rows.forEach(function (row) {
      const constituency = row[constituencyCol];
      if (constituency) constituencies[String(constituency)] = true;
      const receivedAt = row[receivedAtCol];
      if (receivedAt instanceof Date && receivedAt >= weekAgo) thisWeek++;
    });

    totalSent += rows.length;
    sentThisWeek += thisWeek;
    campaigns.push({ title: name, sent: rows.length, uniqueConstituencies: Object.keys(constituencies).length });
  });

  campaigns.sort(function (a, b) { return b.sent - a.sent; });

  const pendingRequests = [];
  const reqSheet = ss.getSheetByName(CAMPAIGN_REQUESTS_SHEET_NAME);
  if (reqSheet && reqSheet.getLastRow() >= 2) {
    const statusCol = CAMPAIGN_REQUESTS_HEADERS.indexOf("Status");
    const rows = reqSheet.getRange(2, 1, reqSheet.getLastRow() - 1, CAMPAIGN_REQUESTS_HEADERS.length).getValues();
    const ministers = safeFetchMinisters();
    rows.forEach(function (row, i) {
      if (String(row[statusCol] || "").trim() !== "") return; // already reviewed
      const targetMinister = String(row[4] || "");
      const minister = ministers.filter(function (m) { return m.name === targetMinister; })[0];
      pendingRequests.push({
        rowIndex: 2 + i, // actual sheet row number — needed to act on this request later
        timestamp: row[0] instanceof Date ? row[0].toISOString() : String(row[0] || ""),
        title: String(row[2] || ""),
        category: String(row[3] || ""),
        targetMinister: targetMinister,
        senderName: String(row[7] || ""),
        senderEmail: String(row[8] || ""),
        constituency: String(row[10] || ""),
        // Approve is blocked client-side when this is false — a campaign shouldn't be able
        // to go live pointing at a minister whose email is still a FILL_ME placeholder.
        emailVerified: !!(minister && minister.email && minister.email !== "FILL_ME")
      });
    });
  }

  return { totalSent: totalSent, sentThisWeek: sentThisWeek, campaigns: campaigns, pendingRequests: pendingRequests };
}

// ---------- Approve flow (ops.html "Approve" button) ----------
// Drafts a letter with Gemini and opens a GitHub pull request adding it to
// data/campaigns.json — merging that PR is what actually makes the campaign live. Nothing
// here pushes straight to main, and it refuses to run at all if the target minister's email
// in ministers.json is still the "FILL_ME" placeholder.

function approveCampaignFlow(rowIndexParam) {
  const rowIndex = parseInt(rowIndexParam, 10);
  if (!rowIndex || rowIndex < 2) return { ok: false, error: "invalid row" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reqSheet = ss.getSheetByName(CAMPAIGN_REQUESTS_SHEET_NAME);
  if (!reqSheet) return { ok: false, error: "no Campaign Requests sheet found" };

  const row = reqSheet.getRange(rowIndex, 1, 1, CAMPAIGN_REQUESTS_HEADERS.length).getValues()[0];
  const statusCol = CAMPAIGN_REQUESTS_HEADERS.indexOf("Status");
  if (String(row[statusCol] || "").trim() !== "") {
    return { ok: false, error: "already reviewed" };
  }

  const title = String(row[2] || "");
  const category = String(row[3] || "");
  const targetMinister = String(row[4] || "");
  const background = String(row[5] || "");
  const theAsk = String(row[6] || "");
  const senderName = String(row[7] || "");
  const senderEmail = String(row[8] || "");
  const timestamp = row[0] instanceof Date ? row[0].toISOString() : String(row[0] || "");

  const ministers = fetchMinistersFromGitHub();
  const minister = ministers.filter(function (m) { return m.name === targetMinister; })[0];
  if (!minister) return { ok: false, error: "minister not found in ministers.json: " + targetMinister };
  if (!minister.email || minister.email === "FILL_ME") {
    return { ok: false, error: "minister email not verified", reasonDetail: "Add a real email for " + minister.name + " in data/ministers.json first." };
  }

  const letter = draftLetterWithGemini({ title: title, category: category, minister: minister, background: background, theAsk: theAsk });

  const campaignEntry = {
    slug: "", // finalized inside openCampaignPullRequest, once it knows the other existing slugs
    status: "live",
    title: title,
    category: category || minister.portfolios || minister.designation || "",
    summary: letter.summary,
    background: background,
    minister: { name: minister.name, designation: minister.portfolios || minister.designation || "", email: minister.email, cc: [] },
    subject: letter.subject,
    body: letter.body,
    created: new Date().toISOString().slice(0, 10)
  };

  const prUrl = openCampaignPullRequest(campaignEntry, { senderName: senderName, senderEmail: senderEmail, timestamp: timestamp });

  reqSheet.getRange(rowIndex, statusCol + 1).setValue("PR opened: " + prUrl);

  return { ok: true, prUrl: prUrl };
}

// Ministers live in the site's own data file, not the Sheet — always read the current version
// from GitHub rather than trusting anything cached, so a just-filled-in email is picked up
// immediately without needing a separate sync step.
function fetchMinistersFromGitHub() {
  const res = UrlFetchApp.fetch(
    "https://raw.githubusercontent.com/" + GITHUB_REPO + "/main/data/ministers.json",
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    throw new Error("couldn't fetch ministers.json from GitHub: " + res.getResponseCode());
  }
  return JSON.parse(res.getContentText()).ministers || [];
}

// Used by the read-only dashboard snapshot, where a GitHub hiccup shouldn't take down the
// whole page — just fail closed (no minister counts as verified) rather than crash.
function safeFetchMinisters() {
  try {
    return fetchMinistersFromGitHub();
  } catch (err) {
    return [];
  }
}

// Drafts a formal citizen-to-minister letter with Gemini, matching the tone of existing
// campaigns. Requires a free Gemini API key (Google AI Studio) in Script Properties.
function draftLetterWithGemini(input) {
  const apiKey = getSecret("GEMINI_API_KEY");

  const prompt = [
    "You draft short, formal letters from a Kerala citizen to a state minister, for a civic action website called action.hashin.me.",
    "Match this exact style, register, and structure (from an existing live campaign):",
    "",
    "SUBJECT: Please prioritise repair of {{constituency}} local roads",
    "BODY:",
    "Respected Sir/Madam,",
    "",
    "I am writing as a resident of {{constituency}} constituency to draw your attention to the poor condition of local roads in our area, which has become a daily hazard for commuters, students, and senior citizens, especially during the monsoon.",
    "",
    "I request that the department prioritise inspection and repair works in this constituency at the earliest, and share an indicative timeline for the same.",
    "",
    "Thank you for your attention to this matter.",
    "",
    "Regards,",
    "{{sender_name}}",
    "{{constituency}} constituency",
    "{{contact_line}}",
    "{{date}}",
    "",
    "Now draft a new letter for this campaign. Keep the placeholder tokens EXACTLY as shown — {{sender_name}}, {{constituency}}, {{contact_line}}, {{date}} — wherever a sender's personal detail belongs. Do not invent facts beyond what's given below; write only from the background and ask provided.",
    "",
    "Campaign title: " + input.title,
    "Minister: " + input.minister.name + ", " + (input.minister.portfolios || input.minister.designation || ""),
    "Category: " + (input.category || ""),
    "Issue background (from the citizen who proposed this): " + input.background,
    "What the minister should do: " + input.theAsk,
    "",
    "Respond with ONLY minified JSON, no markdown code fences, in exactly this shape:",
    '{"subject":"...","body":"...","summary":"one sentence, under 200 characters, no placeholder tokens"}'
  ].join("\n");

  const res = UrlFetchApp.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true
    }
  );
  if (res.getResponseCode() !== 200) {
    throw new Error("Gemini call failed: " + res.getResponseCode() + " " + res.getContentText());
  }

  const data = JSON.parse(res.getContentText());
  const text = data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error("Gemini returned no text: " + res.getContentText());

  const cleaned = text.trim().replace(/^```(json)?\s*/i, "").replace(/```\s*$/, "");
  const letter = JSON.parse(cleaned);
  if (!letter.subject || !letter.body) throw new Error("Gemini response missing subject/body: " + cleaned);
  return letter;
}

// Opens a PR against data/campaigns.json on GitHub rather than pushing to main directly —
// merging it is the human review step before a campaign (and its AI-drafted letter) goes
// live. Requires a GitHub token (Contents + Pull requests write, scoped to just this repo)
// in Script Properties.
function openCampaignPullRequest(campaignEntry, meta) {
  const token = getSecret("GITHUB_TOKEN");
  const apiBase = "https://api.github.com/repos/" + GITHUB_REPO;
  const ghHeaders = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json" };

  const fileRes = UrlFetchApp.fetch(apiBase + "/contents/data/campaigns.json?ref=main", { headers: ghHeaders, muteHttpExceptions: true });
  if (fileRes.getResponseCode() !== 200) throw new Error("couldn't read campaigns.json from GitHub: " + fileRes.getContentText());
  const fileData = JSON.parse(fileRes.getContentText());
  const currentJson = JSON.parse(Utilities.newBlob(Utilities.base64Decode(fileData.content), "application/json").getDataAsString());

  const existingSlugs = currentJson.campaigns.map(function (c) { return c.slug; });
  campaignEntry.slug = uniqueSlug(campaignEntry.title, existingSlugs);
  currentJson.campaigns.push(campaignEntry);
  const newContent = JSON.stringify(currentJson, null, 2) + "\n";

  const mainRefRes = UrlFetchApp.fetch(apiBase + "/git/ref/heads/main", { headers: ghHeaders, muteHttpExceptions: true });
  if (mainRefRes.getResponseCode() !== 200) throw new Error("couldn't read main branch ref: " + mainRefRes.getContentText());
  const mainSha = JSON.parse(mainRefRes.getContentText()).object.sha;

  const branchName = "campaign/" + campaignEntry.slug + "-" + Date.now();
  const branchRes = UrlFetchApp.fetch(apiBase + "/git/refs", {
    method: "post", headers: ghHeaders, contentType: "application/json",
    payload: JSON.stringify({ ref: "refs/heads/" + branchName, sha: mainSha }),
    muteHttpExceptions: true
  });
  if (branchRes.getResponseCode() !== 201) throw new Error("couldn't create branch: " + branchRes.getContentText());

  const putRes = UrlFetchApp.fetch(apiBase + "/contents/data/campaigns.json", {
    method: "put", headers: ghHeaders, contentType: "application/json",
    payload: JSON.stringify({
      message: "Add campaign: " + campaignEntry.title,
      content: Utilities.base64Encode(newContent),
      sha: fileData.sha,
      branch: branchName
    }),
    muteHttpExceptions: true
  });
  if (putRes.getResponseCode() !== 200 && putRes.getResponseCode() !== 201) {
    throw new Error("couldn't update campaigns.json: " + putRes.getContentText());
  }

  const prBody = [
    "AI-drafted from a citizen submission via the ops dashboard — **please review the letter text and minister details before merging.**",
    "",
    "- Submitted by: " + meta.senderName + " <" + meta.senderEmail + ">",
    "- Submitted: " + meta.timestamp,
    "- Minister email used: " + campaignEntry.minister.email + " (from ministers.json)",
    "",
    "Merging this PR makes the campaign live immediately."
  ].join("\n");

  const prRes = UrlFetchApp.fetch(apiBase + "/pulls", {
    method: "post", headers: ghHeaders, contentType: "application/json",
    payload: JSON.stringify({ title: "Add campaign: " + campaignEntry.title, head: branchName, base: "main", body: prBody }),
    muteHttpExceptions: true
  });
  if (prRes.getResponseCode() !== 201) throw new Error("couldn't open PR: " + prRes.getContentText());
  return JSON.parse(prRes.getContentText()).html_url;
}

function uniqueSlug(title, existingSlugs) {
  const base = String(title).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").substring(0, 60) || "campaign";
  let slug = base;
  let n = 2;
  while (existingSlugs.indexOf(slug) !== -1) {
    slug = base + "-" + n;
    n++;
  }
  return slug;
}

// Google Sheets tab names can't contain [ ] * ? / \ : , can't be blank, can't exceed 100
// characters, and can't be exactly "History" (a reserved name). Campaign titles can easily
// hit any of these (e.g. "Demo: Fix My Local Road" has a colon) so every name is cleaned up
// before use. Two campaign titles that only differ in stripped characters would end up
// sharing a sheet — acceptable for how few campaigns this runs.
function sanitizeSheetName(name) {
  let clean = String(name || "").replace(/[\[\]\*\?\/\\:]/g, "-").trim();
  if (clean.length > 95) clean = clean.substring(0, 95).trim();
  if (!clean || clean.toLowerCase() === "history") clean = FALLBACK_SHEET_NAME;
  return clean;
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
