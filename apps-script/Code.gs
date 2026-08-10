/**
 * action.hashin.me — submission logger.
 * Deploy as a Web App bound to a Google Sheet. See docs/SETUP.md for step-by-step instructions.
 *
 * The front end POSTs a JSON body (as text/plain, to avoid a CORS preflight) with fields:
 *   campaign_slug, campaign_title, sender_name, sender_email, sender_phone,
 *   constituency, minister, timestamp, token
 *
 * This script appends one row per submission to the "Submissions" sheet,
 * creating the header row on first run.
 */

// Lightweight deterrent against random bot spam. Must match window.SUBMIT_TOKEN
// in assets/js/config.js. Not real security — it's readable in the site's JS by
// anyone who looks — just enough to stop non-targeted spam bots.
const SHARED_TOKEN = "JdKbkmiaOIO41uUqgrTpaPO2LL-4evwC";

const SHEET_NAME = "Submissions";
const HEADERS = [
  "Timestamp", "Campaign", "Campaign Slug", "Sender Name", "Sender Email",
  "Sender Phone", "Constituency", "Minister", "Received At (Server)"
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (SHARED_TOKEN && data.token !== SHARED_TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = getOrCreateSheet();
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

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
