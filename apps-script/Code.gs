/**
 * action.hashin.me — submission logger.
 * Deploy as a Web App bound to a Google Sheet. See docs/SETUP.md for step-by-step instructions.
 *
 * The front end POSTs a JSON body (as text/plain, to avoid a CORS preflight) with a `type`
 * field selecting which sheet it goes to:
 *
 *   type: "send" (default, existing behaviour) — a visitor sent a letter for an existing
 *     campaign. Fields: campaign_slug, campaign_title, sender_name, sender_email,
 *     sender_phone, constituency, minister, timestamp, token
 *
 *   type: "campaign_request" — a visitor used the "Start a Campaign" form to propose a new
 *     campaign. Fields: campaign_title, category, target_minister, background, the_ask,
 *     sender_name, sender_email, sender_phone, constituency, timestamp, token
 *
 * Each type appends one row to its own sheet, creating the header row on first run.
 * Campaign requests land with an empty Status cell — review them in the sheet and fill in
 * "Published" or "Rejected" once you've acted on one (see docs/SETUP.md).
 */

// Lightweight deterrent against random bot spam. Must match window.SUBMIT_TOKEN
// in assets/js/config.js. Not real security — it's readable in the site's JS by
// anyone who looks — just enough to stop non-targeted spam bots.
const SHARED_TOKEN = "JdKbkmiaOIO41uUqgrTpaPO2LL-4evwC";

const SUBMISSIONS_SHEET_NAME = "Submissions";
const SUBMISSIONS_HEADERS = [
  "Timestamp", "Campaign", "Campaign Slug", "Sender Name", "Sender Email",
  "Sender Phone", "Constituency", "Minister", "Received At (Server)"
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
      const sheet = getOrCreateSheet(SUBMISSIONS_SHEET_NAME, SUBMISSIONS_HEADERS);
      sheet.appendRow([
        data.timestamp || "",
        data.campaign_title || "",
        data.campaign_slug || "",
        data.sender_name || "",
        data.sender_email || "",
        data.sender_phone || "",
        data.constituency || "",
        data.minister || "",
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
