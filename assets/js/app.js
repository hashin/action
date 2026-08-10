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

// Most visitors will be on a phone, where mailto: reliably opens whatever mail app
// (Gmail, Outlook, Yahoo, a carrier app — anything) is already set up as the OS handler.
// On desktop that handler is often missing, so we adjust the helper text accordingly.
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform)); // iPadOS reports as Mac
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) { /* fall through to legacy method */ }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    return false;
  }
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
    .replace(/{{\s*date\s*}}/g, values.date || todayHuman())
    .replace(/{{\s*contact_line\s*}}/g, values.contact_line || "[Your Email]");
}

// Builds the full placeholder set for one letter, including the computed contact_line
// (Email + Phone, phone omitted if not given).
function buildLetterValues(campaign, { senderName, senderEmail, senderPhone, constituency }) {
  const date = todayHuman();
  const contactLines = [];
  if (senderEmail) contactLines.push(`Email: ${senderEmail}`);
  if (senderPhone) contactLines.push(`Phone: ${senderPhone}`);

  return {
    sender_name: senderName,
    constituency,
    date,
    contact_line: contactLines.length ? contactLines.join("\n") : ""
  };
}

function buildMailtoUrl({ to, cc, subject, body }) {
  const params = new URLSearchParams();
  if (cc && cc.length) params.set("cc", cc.join(","));
  params.set("subject", subject);
  // RFC 6068 expects CRLF line breaks in a mailto: body — plain \n (as URLSearchParams
  // would encode it, %0A) renders as one unbroken paragraph in several mail clients.
  params.set("body", body.replace(/\r?\n/g, "\r\n"));
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, "%20")}`;
}

// Gmail-specific fallback for the minority of visitors (mostly on desktop) whose browser
// has no mail app registered for mailto:, but who are signed into Gmail in that browser.
// Not the primary path — it only helps Gmail users, and most visitors are on phones where
// mailto: already works via whatever mail app they have installed.
function buildGmailComposeUrl({ to, cc, subject, body }) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  if (cc && cc.length) params.set("cc", cc.join(","));
  return `https://mail.google.com/mail/?${params.toString()}`;
}

async function submitToSheet(payload) {
  if (!window.APPS_SCRIPT_URL) return; // logging is optional
  try {
    await fetch(window.APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors", // Apps Script doesn't return CORS headers; we don't need to read the response
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, token: window.SUBMIT_TOKEN || "" })
    });
  } catch (err) {
    console.warn("Sheet logging failed (send still proceeds):", err);
  }
}

function campaignUrl(slug) {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}campaign.html?c=${encodeURIComponent(slug)}`;
}

// Shown in place of the send form right after a visitor triggers mailto: or the Gmail
// fallback. We can't detect whether they actually pressed Send in their mail app — same
// optimistic assumption the inline status message already made — so this fires immediately
// rather than waiting for confirmation that doesn't exist.
function renderSentConfirmation(campaign, root) {
  root.innerHTML = `
    <a class="back-link" href="index.html">&larr; All campaigns</a>
    <div class="detail-header" style="text-align:center">
      <h1>Your letter is on its way to ${escapeHtml(campaign.minister.name)}.</h1>
      <p class="to-line" style="margin:0 auto 8px;max-width:56ch">A copy stays in your own mail app — nothing more to do here.</p>
    </div>
    <div class="panel" style="text-align:center">
      <h2>Help this reach more people</h2>
      <p class="hint" style="margin-bottom:18px">Share this campaign so more people from your constituency add their name.</p>
      <div class="secondary-row">
        <button type="button" class="btn-secondary" id="shareWhatsapp">Share on WhatsApp</button>
        <button type="button" class="btn-secondary" id="copyLinkBtn">Copy link</button>
      </div>
      <p class="status-msg" id="shareStatus"></p>
    </div>
  `;

  document.getElementById("shareWhatsapp").addEventListener("click", () => {
    const text = `${campaign.title} — add your name: ${campaignUrl(campaign.slug)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  });

  document.getElementById("copyLinkBtn").addEventListener("click", async () => {
    const ok = await copyToClipboard(campaignUrl(campaign.slug));
    const el = document.getElementById("shareStatus");
    el.className = ok ? "status-msg ok" : "status-msg error";
    el.textContent = ok
      ? "Link copied."
      : "Couldn't copy — copy the URL from your address bar instead.";
  });
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
      <div class="to-line">To: <strong>${escapeHtml(campaign.minister.name)}</strong> &mdash; ${escapeHtml(campaign.minister.designation || "")} &lt;${escapeHtml(campaign.minister.email)}&gt;</div>
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
        <textarea id="letterPreview">${escapeHtml(substitute(campaign.body, buildLetterValues(campaign, {})))}</textarea>
        <p class="hint">Edit freely — this is exactly what will be sent.</p>
      </div>

      <button type="submit" class="send-btn">Send email to ${escapeHtml(campaign.minister.name)}</button>
      <div class="secondary-row">
        <button type="button" class="secondary-link" id="gmailBtn">Open in Gmail instead</button>
        <button type="button" class="secondary-link" id="copyBtn">Copy letter to paste elsewhere</button>
      </div>
      <p class="status-msg" id="statusMsg"></p>
      <p class="privacy-note">Sending opens your mail app (or, on some desktop browsers, a Gmail compose window) with this letter pre-filled — you press Send yourself. We record your name, constituency and contact details only to track campaign participation.</p>
    </form>
  `;

  const nameEl = document.getElementById("senderName");
  const emailEl = document.getElementById("senderEmail");
  const phoneEl = document.getElementById("senderPhone");
  const constEl = document.getElementById("constituency");
  const letterEl = document.getElementById("letterPreview");
  const statusEl = document.getElementById("statusMsg");

  function refreshLetter() {
    letterEl.value = substitute(campaign.body, buildLetterValues(campaign, {
      senderName: nameEl.value.trim(),
      senderEmail: emailEl.value.trim(),
      senderPhone: phoneEl.value.trim(),
      constituency: constEl.value
    }));
  }
  nameEl.addEventListener("input", refreshLetter);
  emailEl.addEventListener("input", refreshLetter);
  phoneEl.addEventListener("input", refreshLetter);
  constEl.addEventListener("change", refreshLetter);

  function gatherAndValidate() {
    const senderName = nameEl.value.trim();
    const senderEmail = emailEl.value.trim();
    const senderPhone = phoneEl.value.trim();
    const constituency = constEl.value;

    if (!senderName || !senderEmail || !constituency) {
      statusEl.className = "status-msg error";
      statusEl.textContent = "Please fill in your name, email, and constituency.";
      return null;
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

    return { senderName, senderEmail, senderPhone, constituency, finalSubject, finalBody };
  }

  document.getElementById("sendForm").addEventListener("submit", (e) => {
    e.preventDefault();
    statusEl.className = "status-msg";
    statusEl.textContent = "";

    const data = gatherAndValidate();
    if (!data) return;

    const mailto = buildMailtoUrl({
      to: campaign.minister.email,
      cc: campaign.minister.cc || [],
      subject: data.finalSubject,
      body: data.finalBody
    });

    window.location.href = mailto;

    // mailto: reliably opens a mail app on mobile, so we can confirm optimistically there.
    // On desktop, a missing mail-app handler fails silently — keep the form and fallback
    // buttons (Gmail / copy) visible instead of claiming success.
    if (isMobileDevice()) {
      renderSentConfirmation(campaign, root);
    } else {
      statusEl.className = "status-msg ok";
      statusEl.textContent = "Your default mail app should now open with the letter ready — press Send there to finish. Nothing happened? Use the options below instead.";
    }
  });

  document.getElementById("gmailBtn").addEventListener("click", () => {
    statusEl.className = "status-msg";
    statusEl.textContent = "";

    const data = gatherAndValidate();
    if (!data) return;

    const gmailUrl = buildGmailComposeUrl({
      to: campaign.minister.email,
      cc: campaign.minister.cc || [],
      subject: data.finalSubject,
      body: data.finalBody
    });

    window.open(gmailUrl, "_blank", "noopener");
    renderSentConfirmation(campaign, root);
  });

  document.getElementById("copyBtn").addEventListener("click", async () => {
    statusEl.className = "status-msg";
    statusEl.textContent = "";

    const data = gatherAndValidate();
    if (!data) return;

    const text = `To: ${campaign.minister.email}\nSubject: ${data.finalSubject}\n\n${data.finalBody}`;
    const ok = await copyToClipboard(text);
    statusEl.className = ok ? "status-msg ok" : "status-msg error";
    statusEl.textContent = ok
      ? "Copied — paste it into any email app or webmail, addressed to the minister's email shown above."
      : "Couldn't copy automatically. Select the letter above and copy it manually.";
  });
}

// ---------- Start a Campaign (public submission, goes to a review queue) ----------

async function renderStartCampaignPage() {
  const root = document.getElementById("startCampaignRoot");
  let ministers, constituencies;
  try {
    const [ministerData, constituencyData] = await Promise.all([
      fetchJSON("data/ministers.json"),
      fetchJSON("data/constituencies.json")
    ]);
    ministers = ministerData.ministers || [];
    constituencies = constituencyData;
  } catch (err) {
    root.innerHTML = `<p>Couldn't load this page. Please refresh.</p>`;
    console.error(err);
    return;
  }

  document.title = "Start a Campaign — action.hashin.me";

  const ministerOptions = ministers.map(m =>
    `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)} — ${escapeHtml(m.portfolios || m.designation)}</option>`
  ).join("");

  const constituencyOptions = constituencies.map(name =>
    `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
  ).join("");

  root.innerHTML = `
    <section class="hero">
      <h1>Start a campaign</h1>
      <p>Tell us about an issue you want raised with a minister. We'll review it and, if it's a
      good fit, turn it into a campaign others can send too. This doesn't send anything by
      itself — it's a proposal for review.</p>
    </section>
    <form id="requestForm">
      <div class="panel">
        <h2>The campaign</h2>
        <div class="field field full">
          <label for="campaignTitle">Campaign title *</label>
          <input id="campaignTitle" type="text" required placeholder="e.g. Fix Kuttanad Flood Drainage">
        </div>
        <div class="field-grid">
          <div class="field">
            <label for="targetMinister">Target minister *</label>
            <select id="targetMinister" required>
              <option value="" disabled selected>Select a minister</option>
              ${ministerOptions}
            </select>
          </div>
          <div class="field">
            <label for="category">Category</label>
            <input id="category" type="text" placeholder="e.g. Roads & Infrastructure (optional)">
          </div>
        </div>
        <div class="field field full">
          <label for="background">What's the issue? *</label>
          <textarea id="background" required placeholder="What's happening, and why does it matter?" style="min-height:100px"></textarea>
        </div>
        <div class="field field full">
          <label for="theAsk">What should the minister do? *</label>
          <textarea id="theAsk" required placeholder="Be specific — a decision, an inspection, funding, a timeline..." style="min-height:80px"></textarea>
        </div>
      </div>

      <div class="panel">
        <h2>Your details</h2>
        <div class="field-grid">
          <div class="field">
            <label for="senderName">Full name *</label>
            <input id="senderName" type="text" required autocomplete="name">
          </div>
          <div class="field">
            <label for="senderEmail">Your email *</label>
            <input id="senderEmail" type="email" required autocomplete="email">
          </div>
          <div class="field">
            <label for="senderPhone">Phone number</label>
            <input id="senderPhone" type="tel" autocomplete="tel" placeholder="Optional">
          </div>
          <div class="field">
            <label for="constituency">Assembly constituency *</label>
            <select id="constituency" required>
              <option value="" disabled selected>Select your constituency</option>
              ${constituencyOptions}
            </select>
          </div>
        </div>
      </div>

      <button type="submit" class="send-btn">Submit for review</button>
      <p class="status-msg" id="statusMsg"></p>
      <p class="privacy-note">This submits your proposal to our review queue — nothing is sent
      to any minister and no campaign is published automatically. We record your details only
      to follow up with you about this submission.</p>
    </form>
  `;

  const statusEl = document.getElementById("statusMsg");

  document.getElementById("requestForm").addEventListener("submit", (e) => {
    e.preventDefault();
    statusEl.className = "status-msg";
    statusEl.textContent = "";

    const campaignTitle = document.getElementById("campaignTitle").value.trim();
    const targetMinister = document.getElementById("targetMinister").value;
    const category = document.getElementById("category").value.trim();
    const background = document.getElementById("background").value.trim();
    const theAsk = document.getElementById("theAsk").value.trim();
    const senderName = document.getElementById("senderName").value.trim();
    const senderEmail = document.getElementById("senderEmail").value.trim();
    const senderPhone = document.getElementById("senderPhone").value.trim();
    const constituency = document.getElementById("constituency").value;

    if (!campaignTitle || !targetMinister || !background || !theAsk || !senderName || !senderEmail || !constituency) {
      statusEl.className = "status-msg error";
      statusEl.textContent = "Please fill in all the required fields (marked *).";
      return;
    }

    if (!window.APPS_SCRIPT_URL) {
      // Unlike the send-letter flow (where mailto: still works without the Sheet), this
      // form has no fallback — without logging configured, a submission would vanish silently.
      statusEl.className = "status-msg error";
      statusEl.textContent = "Submissions aren't being accepted right now — please try again later.";
      return;
    }

    submitToSheet({
      type: "campaign_request",
      campaign_title: campaignTitle,
      category,
      target_minister: targetMinister,
      background,
      the_ask: theAsk,
      sender_name: senderName,
      sender_email: senderEmail,
      sender_phone: senderPhone,
      constituency,
      timestamp: new Date().toISOString()
    });

    document.getElementById("requestForm").reset();
    statusEl.className = "status-msg ok";
    statusEl.textContent = "Thanks — your campaign idea has been submitted for review. We'll be in touch if it goes live.";
  });
}
