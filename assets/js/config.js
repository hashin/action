// Fill this in after deploying the Google Apps Script web app (see docs/SETUP.md).
// Leave as-is and the site still works end-to-end via mailto: — submissions just won't be logged.
window.APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw9PmlHrvW2YoNJyFHils8nOocpjxSOmksXB2le7jJNPO0qNuv0PRkVydOg5NDYtQM0YQ/exec";

// Must exactly match SHARED_TOKEN in apps-script/Code.gs. It's visible in this public JS file
// (not real security) — it's just a filter so random bots can't fill your Sheet with junk rows.
window.SUBMIT_TOKEN = "JdKbkmiaOIO41uUqgrTpaPO2LL-4evwC";

// Ops dashboard (ops.html) sign-in. This is a public OAuth 2.0 Web Client ID — safe to expose
// in front-end code, unlike an API key or secret. Get it from Google Cloud Console (see
// docs/SETUP.md, part 4). Must exactly match GOOGLE_CLIENT_ID in apps-script/Code.gs.
window.GOOGLE_CLIENT_ID = "PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com";
