// action.hashin.me — internal ops dashboard (ops.html). Requires Google sign-in from an
// authorised account; the Apps Script endpoint re-verifies that server-side on every request,
// so this file only has to handle the UI, not enforce access on its own.

function formatOpsDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function renderDashboard(data) {
  const el = document.getElementById("dashboard");

  const campaignRows = data.campaigns.map(c => `
    <tr>
      <td>${escapeHtml(c.title)}</td>
      <td>${c.sent.toLocaleString("en-IN")}</td>
      <td>${c.uniqueConstituencies}</td>
    </tr>
  `).join("") || `<tr><td colspan="3">No submissions logged yet.</td></tr>`;

  const pendingRows = data.pendingRequests.map(r => `
    <tr>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.senderName)} &lt;${escapeHtml(r.senderEmail)}&gt;</td>
      <td>${formatOpsDate(r.timestamp)}</td>
    </tr>
  `).join("") || `<tr><td colspan="3">Nothing pending.</td></tr>`;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;margin:28px 0">
      <div class="card">
        <span class="badge live">Total</span>
        <h3 style="font-size:28px;margin:0">${data.totalSent.toLocaleString("en-IN")}</h3>
        <p>letters sent, all campaigns</p>
      </div>
      <div class="card">
        <span class="badge live">This week</span>
        <h3 style="font-size:28px;margin:0">${data.sentThisWeek.toLocaleString("en-IN")}</h3>
        <p>letters sent in the last 7 days</p>
      </div>
      <div class="card">
        <span class="badge demo">Pending</span>
        <h3 style="font-size:28px;margin:0">${data.pendingRequests.length}</h3>
        <p>campaign proposals awaiting review</p>
      </div>
      <div class="card">
        <span class="badge closed">Campaigns</span>
        <h3 style="font-size:28px;margin:0">${data.campaigns.length}</h3>
        <p>with at least one submission tab</p>
      </div>
    </div>

    <div class="panel">
      <h2>Campaign performance</h2>
      <table class="table">
        <thead><tr><th>Campaign</th><th>Sent</th><th>Unique constituencies</th></tr></thead>
        <tbody>${campaignRows}</tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Submissions awaiting review</h2>
      <table class="table">
        <thead><tr><th>Title</th><th>Submitted by</th><th>Date</th></tr></thead>
        <tbody>${pendingRows}</tbody>
      </table>
      <p class="hint" style="margin-top:14px">Review these in the Google Sheet's "Campaign Requests" tab — mark a Status there once you've acted on it.</p>
    </div>
  `;
}

async function fetchOpsData(idToken) {
  const url = `${window.APPS_SCRIPT_URL}?credential=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  return res.json();
}

function handleCredentialResponse(response) {
  const authStatus = document.getElementById("authStatus");
  authStatus.className = "status-msg";
  authStatus.textContent = "Checking authorisation…";

  fetchOpsData(response.credential).then(result => {
    if (!result.ok) {
      authStatus.className = "status-msg error";
      authStatus.textContent = "This Google account isn't authorised to view the ops dashboard.";
      return;
    }
    document.getElementById("signinGate").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    renderDashboard(result.data);
  }).catch(err => {
    authStatus.className = "status-msg error";
    authStatus.textContent = "Couldn't reach the ops endpoint. Please refresh and try again.";
    console.error(err);
  });
}

// The GSI script tag is async, so it may not have finished loading (and defining
// window.google) by the time this runs — poll briefly rather than assuming order.
function waitForGoogleIdentityServices(cb, attemptsLeft = 100) {
  if (window.google && window.google.accounts && window.google.accounts.id) return cb();
  if (attemptsLeft <= 0) {
    document.getElementById("authStatus").className = "status-msg error";
    document.getElementById("authStatus").textContent = "Couldn't load Google Sign-In. Please refresh.";
    return;
  }
  setTimeout(() => waitForGoogleIdentityServices(cb, attemptsLeft - 1), 50);
}

document.addEventListener("DOMContentLoaded", () => {
  const authStatus = document.getElementById("authStatus");

  if (!window.GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID.indexOf("PASTE_") === 0) {
    authStatus.className = "status-msg error";
    authStatus.textContent = "Ops dashboard isn't configured yet — see docs/SETUP.md, part 4.";
    return;
  }

  waitForGoogleIdentityServices(() => {
    google.accounts.id.initialize({
      client_id: window.GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse
    });
    google.accounts.id.renderButton(document.getElementById("gsiButton"), { theme: "outline", size: "large" });
  });
});
