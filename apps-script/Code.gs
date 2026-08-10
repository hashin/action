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
 */

// Lightweight deterrent against random bot spam. Must match window.SUBMIT_TOKEN
// in assets/js/config.js. Not real security — it's readable in the site's JS by
// anyone who looks — just enough to stop non-targeted spam bots.
const SHARED_TOKEN = "JdKbkmiaOIO41uUqgrTpaPO2LL-4evwC";

// Ops dashboard (ops.html) access — this one IS real security, unlike SHARED_TOKEN above.
// Must exactly match GOOGLE_CLIENT_ID in assets/js/config.js. See docs/SETUP.md, part 4.
const GOOGLE_CLIENT_ID = "730575915949-6lhke3abh9c67p0cqarup9d6r5l2c85j.apps.googleusercontent.com";
const ALLOWED_OPS_EMAILS = ["sneha4luvn@gmail.com", "hashjith@gmail.com"]; // add more Google accounts here to grant access

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

    const email = verifyGoogleIdToken(idToken);
    if (!email || ALLOWED_OPS_EMAILS.indexOf(email) === -1) {
      // Not exposed in the HTTP response (stays generic there on purpose) — check
      // this script's Executions log (left sidebar → Executions) to see exactly why
      // a given sign-in was rejected.
      Logger.log("ops doGet rejected: resolvedEmail=%s allowedEmails=%s", email, JSON.stringify(ALLOWED_OPS_EMAILS));
      return jsonOutput({ ok: false, error: "unauthorized" });
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
    Logger.log("ops tokeninfo call failed: status=%s body=%s", res.getResponseCode(), res.getContentText());
    return null;
  }
  const payload = JSON.parse(res.getContentText());
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    Logger.log("ops token aud mismatch: tokenAud=%s expectedAud=%s", payload.aud, GOOGLE_CLIENT_ID);
    return null;
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    Logger.log("ops token email not verified: email=%s email_verified=%s", payload.email, payload.email_verified);
    return null;
  }
  return payload.email || null;
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
    rows.forEach(function (row) {
      if (String(row[statusCol] || "").trim() !== "") return; // already reviewed
      pendingRequests.push({
        timestamp: row[0] instanceof Date ? row[0].toISOString() : String(row[0] || ""),
        title: String(row[2] || ""),
        category: String(row[3] || ""),
        targetMinister: String(row[4] || ""),
        senderName: String(row[7] || ""),
        senderEmail: String(row[8] || ""),
        constituency: String(row[10] || "")
      });
    });
  }

  return { totalSent: totalSent, sentThisWeek: sentThisWeek, campaigns: campaigns, pendingRequests: pendingRequests };
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
