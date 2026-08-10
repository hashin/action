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
