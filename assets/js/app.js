// action.hashin.me — shared front-end logic (no build step, no framework).

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function todayHuman() {
  return new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function badgeClass(status) {
  if (status === "live") return "live";
  if (status === "closed") return "closed";
  return "demo";
}

function badgeLabel(status) {
  if (status === "live") return "Live";
  if (status === "closed") return "Closed";
  return "Demo";
}

// ---------- Homepage ----------

async function renderHomepage() {
  const grid = document.getElementById("campaignGrid");
  try {
    const data = await fetchJSON("data/campaigns.json");
    const campaigns = data.campaigns || [];
    if (!campaigns.length) {
      grid.innerHTML = `<div class="empty-state">No campaigns are live yet. Check back soon.</div>`;
      return;
    }
    grid.innerHTML = campaigns.map(c => `
      <a class="card" href="campaign.html?c=${encodeURIComponent(c.slug)}">
        <span class="badge ${badgeClass(c.status)}">${badgeLabel(c.status)}</span>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.summary || "")}</p>
        <span class="cta">Read &amp; send &rarr;</span>
      </a>
    `).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Couldn't load campaigns. Please refresh.</div>`;
    console.error(err);
  }
}

// ---------- Campaign detail ----------

function substitute(text, values) {
  return text
    .replace(/{{\s*sender_name\s*}}/g, values.sender_name || "[Your Name]")
    .replace(/{{\s*constituency\s*}}/g, values.constituency || "[Your Constituency]")
    .replace(/{{\s*date\s*}}/g, values.date || todayHuman());
}

function buildMailtoUrl({ to, cc, subject, body }) {
  const params = new URLSearchParams();
  if (cc && cc.length) params.set("cc", cc.join(","));
  params.set("subject", subject);
  params.set("body", body);
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, "%20")}`;
}

async function submitToSheet(payload) {
  if (!window.APPS_SCRIPT_URL) return; // logging is optional
  try {
    await fetch(window.APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors", // Apps Script doesn't return CORS headers; we don't need to read the response
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Sheet logging failed (send still proceeds):", err);
  }
}

async function renderCampaignPage() {
  const root = document.getElementById("campaignRoot");
  const slug = getQueryParam("c");
  let campaign, constituencies;
  try {
    const [campaignData, constituencyData] = await Promise.all([
      fetchJSON("data/campaigns.json"),
      fetchJSON("data/constituencies.json")
    ]);
    campaign = (campaignData.campaigns || []).find(c => c.slug === slug);
    constituencies = constituencyData;
  } catch (err) {
    root.innerHTML = `<a class="back-link" href="index.html">&larr; All campaigns</a><p>Couldn't load this campaign. Please refresh.</p>`;
    console.error(err);
    return;
  }

  if (!campaign) {
    root.innerHTML = `<a class="back-link" href="index.html">&larr; All campaigns</a><p>Campaign not found.</p>`;
    return;
  }

  document.title = `${campaign.title} — action.hashin.me`;

  const demoBanner = campaign.status === "demo"
    ? `<div class="demo-flag">This is a <strong>demo campaign</strong>. Sending it will email a test inbox, not a real minister — safe to try.</div>`
    : "";

  const constituencyOptions = constituencies.map(name =>
    `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
  ).join("");

  root.innerHTML = `
    <a class="back-link" href="index.html">&larr; All campaigns</a>
    <div class="detail-header">
      <span class="badge ${badgeClass(campaign.status)}">${badgeLabel(campaign.status)}</span>
      <h1>${escapeHtml(campaign.title)}</h1>
      <div class="to-line">To: <strong>${escapeHtml(campaign.minister.name)}</strong> &mdash; ${escapeHtml(campaign.minister.designation || "")}</div>
    </div>
    ${demoBanner}
    <div class="panel">
      <h2>About this campaign</h2>
      <p>${escapeHtml(campaign.background || campaign.summary || "")}</p>
    </div>
    <form id="sendForm">
      <div class="panel">
        <h2>Your details</h2>
        <div class="field-grid">
          <div class="field">
            <label for="senderName">Full name *</label>
            <input id="senderName" name="senderName" type="text" required autocomplete="name">
          </div>
          <div class="field">
            <label for="senderEmail">Your email *</label>
            <input id="senderEmail" name="senderEmail" type="email" required autocomplete="email">
          </div>
          <div class="field">
            <label for="senderPhone">Phone number</label>
            <input id="senderPhone" name="senderPhone" type="tel" autocomplete="tel" placeholder="Optional">
          </div>
          <div class="field">
            <label for="constituency">Assembly constituency *</label>
            <select id="constituency" name="constituency" required>
              <option value="" disabled selected>Select your constituency</option>
              ${constituencyOptions}
            </select>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>Your letter (editable)</h2>
        <textarea id="letterPreview">${escapeHtml(substitute(campaign.body, {}))}</textarea>
        <p class="hint">Edit freely — this is exactly what will be sent.</p>
      </div>

      <button type="submit" class="send-btn">Send email to ${escapeHtml(campaign.minister.name)}</button>
      <p class="status-msg" id="statusMsg"></p>
      <p class="privacy-note">Clicking send opens your own email app with this letter pre-filled — you press the final Send yourself. We record your name, constituency and contact details only to track campaign participation.</p>
    </form>
  `;

  const nameEl = document.getElementById("senderName");
  const constEl = document.getElementById("constituency");
  const letterEl = document.getElementById("letterPreview");
  const statusEl = document.getElementById("statusMsg");

  function refreshLetter() {
    letterEl.value = substitute(campaign.body, {
      sender_name: nameEl.value.trim(),
      constituency: constEl.value,
      date: todayHuman()
    });
  }
  nameEl.addEventListener("input", refreshLetter);
  constEl.addEventListener("change", refreshLetter);

  document.getElementById("sendForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.className = "status-msg";
    statusEl.textContent = "";

    const senderName = nameEl.value.trim();
    const senderEmail = document.getElementById("senderEmail").value.trim();
    const senderPhone = document.getElementById("senderPhone").value.trim();
    const constituency = constEl.value;

    if (!senderName || !senderEmail || !constituency) {
      statusEl.className = "status-msg error";
      statusEl.textContent = "Please fill in your name, email, and constituency.";
      return;
    }

    const finalSubject = substitute(campaign.subject, { sender_name: senderName, constituency, date: todayHuman() });
    const finalBody = letterEl.value;

    submitToSheet({
      campaign_slug: campaign.slug,
      campaign_title: campaign.title,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_phone: senderPhone,
      constituency,
      minister: campaign.minister.name,
      timestamp: new Date().toISOString()
    });

    const mailto = buildMailtoUrl({
      to: campaign.minister.email,
      cc: campaign.minister.cc || [],
      subject: finalSubject,
      body: finalBody
    });

    window.location.href = mailto;
    statusEl.className = "status-msg ok";
    statusEl.textContent = "Your email app should now be open with the letter ready — press Send there to finish.";
  });
}
