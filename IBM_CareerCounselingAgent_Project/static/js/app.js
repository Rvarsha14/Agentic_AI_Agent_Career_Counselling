/* =============================================================
   IBM Career Counseling Agent — Frontend Application
   app.js — All UI logic, API calls, charts, and interactions
   ============================================================= */

"use strict";

// ─── App State ────────────────────────────────────────────────
const State = {
  sessionActive: false,
  isLoading: false,
  dashboardLoaded: false,
  currentTab: "chat",
  selectedSkills: new Set(),
  activeSkillCategory: null,
  dashboardData: null,
  careerModal: null,
  currentModalPathwayId: null,
};

// ─── Markdown → HTML (lightweight renderer) ───────────────────
const Markdown = {
  render(text) {
    if (!text) return "";
    let html = text
      // Escape HTML entities first (safety)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Headings
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      // Bold and italic
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Blockquotes
      .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
      // Numbered lists
      .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
      // Bullet lists
      .replace(/^[•\-\*] (.+)$/gm, "<li>$1</li>")
      // Wrap consecutive <li> items in <ul>
      .replace(/(<li>.*<\/li>(\n)?)+/gs, (match) => `<ul>${match}</ul>`)
      // Horizontal rule
      .replace(/^---$/gm, "<hr/>")
      // Paragraphs (double newline → <p>)
      .replace(/\n\n/g, "</p><p>")
      // Single newlines in middle of text → <br>
      .replace(/\n/g, "<br/>");

    return `<p>${html}</p>`;
  }
};

// ─── API Helpers ──────────────────────────────────────────────
const API = {
  async post(endpoint, body = {}) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async get(endpoint) {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
};

// ─── Toast Notifications ──────────────────────────────────────
function showToast(message, type = "info", duration = 3500) {
  const container = document.getElementById("toastContainer");
  const id = `toast-${Date.now()}`;
  const iconMap = { info: "bi-info-circle", success: "bi-check-circle-fill", error: "bi-exclamation-triangle-fill", warning: "bi-exclamation-circle-fill" };
  const colorMap = { info: "#1a6fe8", success: "#059669", error: "#dc2626", warning: "#d97706" };

  const toastEl = document.createElement("div");
  toastEl.id = id;
  toastEl.className = "toast show custom-toast";
  toastEl.setAttribute("role", "alert");
  toastEl.innerHTML = `
    <div class="toast-body d-flex align-items-center gap-2 p-3">
      <i class="bi ${iconMap[type]}" style="color:${colorMap[type]};font-size:16px;flex-shrink:0"></i>
      <span style="flex:1">${message}</span>
      <button type="button" class="btn-close btn-close-sm ms-2" onclick="document.getElementById('${id}').remove()"></button>
    </div>`;
  container.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), duration);
}

// ─── Status Badge ─────────────────────────────────────────────
function setStatus(state, text) {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusText");
  dot.className = `status-dot ${state}`;
  label.textContent = text;
}

// ─── Theme Toggle ─────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);
  document.getElementById("themeIcon").className = isDark ? "bi bi-moon-stars-fill" : "bi bi-sun-fill";
  localStorage.setItem("stride-theme", newTheme);
}

function applyStoredTheme() {
  const saved = localStorage.getItem("stride-theme");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("themeIcon").className = "bi bi-sun-fill";
  }
}

// ─── Tab Navigation ───────────────────────────────────────────
function switchTab(tabId) {
  State.currentTab = tabId;

  // Desktop nav
  document.querySelectorAll("#mainNavTabs .nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  // Mobile nav
  document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  // Content panes
  document.querySelectorAll(".tab-pane-custom").forEach(pane => {
    pane.classList.toggle("active", pane.id === `tab-${tabId}`);
  });

  // Lazy-load dashboard
  if (tabId === "dashboard" && !State.dashboardLoaded) {
    loadDashboardData();
  }
  // Lazy-load skills tab
  if (tabId === "skills" && !State.dashboardLoaded) {
    loadDashboardData();
  }
  // Lazy-load trends
  if (tabId === "trends" && !State.dashboardLoaded) {
    loadDashboardData();
  }
}

// ─── Session Management ───────────────────────────────────────
async function startSession() {
  try {
    const data = await API.post("/api/session/start");
    State.sessionActive = true;

    // Remove empty state, enable input
    const emptyState = document.getElementById("chatEmptyState");
    if (emptyState) emptyState.remove();
    enableChatInput();

    // Update profile sidebar
    document.getElementById("profileSession").textContent =
      `Session ${data.conversation_id.slice(0, 8).toUpperCase()}`;

    // Show welcome message
    appendMessage("assistant", data.welcome_message);
    setStatus("online", "Stride is ready");
    showToast("Session started — Stride is ready to help!", "success");
  } catch (err) {
    setStatus("error", "Connection failed");
    showToast("Failed to start session. Check server connection.", "error");
    console.error("startSession error:", err);
  }
}

async function clearSession() {
  try {
    await API.post("/api/session/clear");
    State.sessionActive = false;
    State.selectedSkills.clear();

    // Reset UI
    const chatWindow = document.getElementById("chatWindow");
    chatWindow.innerHTML = `
      <div class="chat-empty-state" id="chatEmptyState">
        <div class="empty-icon"><i class="bi bi-robot"></i></div>
        <h4>Welcome to Stride</h4>
        <p>Your AI-powered IBM Career Counseling Companion is ready.<br>Click <strong>Start Session</strong> to begin.</p>
        <button class="btn btn-primary btn-lg start-btn" onclick="startSession()">
          <i class="bi bi-play-circle-fill me-2"></i>Start Session
        </button>
      </div>`;
    disableChatInput();
    resetProfileSidebar();
    document.getElementById("recommendationsList").innerHTML = `
      <div class="rec-empty">
        <i class="bi bi-compass bi-lg"></i>
        <p>Your personalized career matches will appear here during counseling.</p>
      </div>`;
    setStatus("online", "Ready");
    showToast("Session cleared. Ready for a fresh start.", "info");
  } catch (err) {
    showToast("Error clearing session.", "error");
  }
}

// ─── Chat Input ───────────────────────────────────────────────
function enableChatInput() {
  const input = document.getElementById("chatInput");
  const btn = document.getElementById("sendBtn");
  input.disabled = false;
  btn.disabled = false;
  input.focus();
}

function disableChatInput() {
  const input = document.getElementById("chatInput");
  const btn = document.getElementById("sendBtn");
  input.disabled = true;
  btn.disabled = true;
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
  document.getElementById("charCounter").textContent = `${el.value.length}/4000`;
}

function handleInputKey(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function insertQuickPrompt(btn) {
  if (!State.sessionActive) {
    showToast("Start a session first!", "warning");
    return;
  }
  const text = btn.textContent.replace(/^[^\s]+\s/, ""); // Strip emoji prefix
  document.getElementById("chatInput").value = text;
  autoResizeTextarea(document.getElementById("chatInput"));
  document.getElementById("chatInput").focus();
}

// ─── Send Message ─────────────────────────────────────────────
async function sendMessage() {
  if (State.isLoading) return;
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;

  // Clear input
  input.value = "";
  input.style.height = "auto";
  document.getElementById("charCounter").textContent = "0/4000";

  // Show user message
  appendMessage("user", message);
  setTyping(true);
  disableChatInput();
  State.isLoading = true;

  try {
    const data = await API.post("/api/chat", { message });
    setTyping(false);
    appendMessage("assistant", data.reply);
    detectAndUpdateProfile(data.reply, message);
    enableChatInput();
  } catch (err) {
    setTyping(false);
    appendMessage("assistant", `⚠️ **Error:** ${err.message}. Please try again.`);
    enableChatInput();
    showToast("Failed to get response from Stride.", "error");
  } finally {
    State.isLoading = false;
  }
}

// ─── Message Rendering ────────────────────────────────────────
function appendMessage(role, content) {
  const chatWindow = document.getElementById("chatWindow");

  // Remove empty state if present
  const empty = document.getElementById("chatEmptyState");
  if (empty) empty.remove();

  const isUser = role === "user";
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const renderedContent = isUser
    ? escapeHtml(content)
    : Markdown.render(content);

  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  row.innerHTML = `
    <div class="message-avatar ${role}">
      ${isUser ? '<i class="bi bi-person-fill"></i>' : '<i class="bi bi-cpu-fill"></i>'}
    </div>
    <div class="message-bubble-wrap">
      <div class="message-bubble ${role}">${renderedContent}</div>
      <div class="message-time">${isUser ? "You" : "Stride"} · ${now}</div>
    </div>`;

  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Typing Indicator ─────────────────────────────────────────
function setTyping(show) {
  const indicator = document.getElementById("typingIndicator");
  indicator.style.display = show ? "flex" : "none";
  if (show) {
    document.getElementById("chatWindow").scrollTop =
      document.getElementById("chatWindow").scrollHeight;
  }
}

// ─── Profile Sidebar Auto-Update ──────────────────────────────
function detectAndUpdateProfile(reply, userMsg) {
  // Detect career recommendations in reply
  const recPatterns = [
    { re: /\*\*#1[:\s]+(.+?)\*\*/i, rank: 1 },
    { re: /\*\*#2[:\s]+(.+?)\*\*/i, rank: 2 },
    { re: /\*\*#3[:\s]+(.+?)\*\*/i, rank: 3 },
    { re: /Rank 1[:\s]+\*\*(.+?)\*\*/i, rank: 1 },
    { re: /1\.\s+\*\*(.+?)\*\*/i, rank: 1 },
  ];

  const found = [];
  recPatterns.forEach(({ re, rank }) => {
    const m = reply.match(re);
    if (m) found.push({ rank, title: m[1].trim() });
  });

  if (found.length > 0) {
    updateRecommendationsPanel(found);
    // Update top match card
    const best = found.find(f => f.rank === 1) || found[0];
    document.getElementById("topMatchCard").innerHTML = `
      <div class="top-match-icon"><i class="bi bi-trophy-fill" style="color:#d97706"></i></div>
      <div style="font-weight:700;font-size:13px;color:var(--text-primary);margin-bottom:4px">${best.title}</div>
      <div style="font-size:11px;color:var(--text-muted)">#1 Personalized Match</div>`;
  }

  // Detect skills mentioned by user
  const skillKeywords = ["python", "java", "sql", "machine learning", "data analysis",
    "javascript", "react", "statistics", "excel", "tableau", "figma", "aws", "azure",
    "docker", "kubernetes", "tensorflow", "pytorch", "r ", "c++", "node.js"];
  const lowerMsg = userMsg.toLowerCase();
  skillKeywords.forEach(sk => {
    if (lowerMsg.includes(sk)) {
      const tag = document.createElement("span");
      tag.className = "skill-tag";
      tag.textContent = sk.charAt(0).toUpperCase() + sk.slice(1);
      const cloud = document.getElementById("profileSkillTags");
      const empty = cloud.querySelector(".tag-empty");
      if (empty) empty.remove();
      if (![...cloud.children].some(c => c.textContent.toLowerCase() === sk)) {
        cloud.appendChild(tag);
      }
    }
  });
}

function updateRecommendationsPanel(recs) {
  const panel = document.getElementById("recommendationsList");
  const rankLabels = ["", "#1 Best Fit", "#2 Strong Match", "#3 Good Fit"];
  panel.innerHTML = recs.map(r => `
    <div class="rec-card">
      <div class="rec-rank">${rankLabels[r.rank] || `#${r.rank}`}</div>
      <div class="rec-title">${r.title}</div>
      <div class="rec-match-bar">
        <div class="rec-match-label">Fit Confidence</div>
        <div class="rec-match-track">
          <div class="rec-match-fill" style="width:${90 - (r.rank - 1) * 14}%"></div>
        </div>
      </div>
    </div>`).join("");
}

function resetProfileSidebar() {
  document.getElementById("profileName").textContent = "Student";
  document.getElementById("profileSession").textContent = "New Session";
  document.getElementById("profileSkillTags").innerHTML = '<span class="tag-empty">Chat to reveal skills…</span>';
  document.getElementById("topMatchCard").innerHTML = `
    <div class="top-match-icon"><i class="bi bi-trophy-fill"></i></div>
    <div class="top-match-text">Your #1 career match will appear here after counseling.</div>`;
}

// ─── Dashboard Data Loading ────────────────────────────────────
async function loadDashboardData() {
  try {
    const data = await API.get("/api/dashboard/data");
    State.dashboardData = data;
    State.dashboardLoaded = true;

    document.getElementById("datasetVersionLabel").textContent =
      `Dataset v${data.dataset_version} | ${data.career_pathways.length} pathways`;

    renderCareerCards(data.career_pathways);
    renderSalaryGrowthChart(data.career_pathways);
    renderDemandPieChart(data.career_pathways);
    renderTrends(data.industry_trends);
    populateSkillsTab(data.career_pathways, data.skill_categories);
  } catch (err) {
    console.error("Dashboard load error:", err);
    document.getElementById("careerCardsGrid").innerHTML =
      `<div class="loading-spinner"><p class="text-muted">Failed to load dashboard data.</p></div>`;
  }
}

// ─── Career Cards ─────────────────────────────────────────────
const DOMAIN_COLORS = {
  "Technology": { bg: "rgba(26,111,232,0.10)", color: "#1a6fe8", icon: "bi-laptop" },
  "Technology / Analytics": { bg: "rgba(26,111,232,0.10)", color: "#1a6fe8", icon: "bi-graph-up" },
  "Technology / Infrastructure": { bg: "rgba(124,58,237,0.10)", color: "#7c3aed", icon: "bi-cloud" },
  "Technology / Security": { bg: "rgba(220,38,38,0.10)", color: "#dc2626", icon: "bi-shield-lock" },
  "Business / Technology": { bg: "rgba(217,119,6,0.10)", color: "#d97706", icon: "bi-briefcase" },
  "Business / Analytics": { bg: "rgba(217,119,6,0.10)", color: "#d97706", icon: "bi-bar-chart" },
  "Design / Technology": { bg: "rgba(236,72,153,0.10)", color: "#ec4899", icon: "bi-palette" },
  "Engineering / Healthcare": { bg: "rgba(5,150,105,0.10)", color: "#059669", icon: "bi-heart-pulse" },
  "Engineering / Environment": { bg: "rgba(5,150,105,0.10)", color: "#059669", icon: "bi-tree" },
};

function getDomainStyle(domain) {
  return DOMAIN_COLORS[domain] || { bg: "rgba(99,110,126,0.10)", color: "#636d7e", icon: "bi-briefcase" };
}

function getDemandClass(demand) {
  if (!demand) return "demand-moderate";
  const d = demand.toLowerCase();
  if (d.includes("very high")) return "demand-very-high";
  if (d.includes("high") && !d.includes("moderate")) return "demand-high";
  if (d.includes("moderate-high") || d.includes("moderate high")) return "demand-moderate-high";
  return "demand-moderate";
}

function renderCareerCards(pathways) {
  const grid = document.getElementById("careerCardsGrid");
  grid.innerHTML = "";
  const sorted = [...pathways].sort((a, b) => b.growth - a.growth);
  sorted.forEach(p => grid.appendChild(buildCareerCard(p)));
}

function buildCareerCard(p) {
  const style = getDomainStyle(p.domain);
  const card = document.createElement("div");
  card.className = "career-card";
  card.dataset.domain = p.domain;
  card.dataset.growth = p.growth;
  card.dataset.salary = p.salary;
  card.dataset.demand = p.demand;
  card.dataset.id = p.id;

  const tags = (p.tags || []).slice(0, 4);
  card.innerHTML = `
    <div class="career-card-header">
      <div>
        <div class="career-card-icon" style="background:${style.bg};color:${style.color}">
          <i class="bi ${style.icon}"></i>
        </div>
      </div>
      <div style="flex:1;margin-left:12px">
        <div class="career-card-title">${p.title}</div>
        <div class="career-card-domain">${p.domain}</div>
      </div>
      <span class="demand-badge ${getDemandClass(p.demand)}">${p.demand}</span>
    </div>
    <div class="career-card-stats">
      <div class="stat-item">
        <span class="stat-label">Growth</span>
        <span class="stat-value">${p.growth}%</span>
        <span class="stat-unit">10-yr projection</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Salary</span>
        <span class="stat-value">$${(p.salary / 1000).toFixed(0)}K</span>
        <span class="stat-unit">median/year</span>
      </div>
    </div>
    <p class="career-card-desc">${p.description}</p>
    <div class="career-card-tags">
      ${tags.map(t => `<span class="tag-chip">${t}</span>`).join("")}
    </div>`;

  card.addEventListener("click", () => openCareerModal(p.id));
  return card;
}

function filterCards() {
  if (!State.dashboardData) return;
  const domain = document.getElementById("domainFilter").value.toLowerCase();
  const sort = document.getElementById("sortFilter").value;
  const search = document.getElementById("searchFilter").value.toLowerCase();

  let filtered = [...State.dashboardData.career_pathways];
  if (domain) filtered = filtered.filter(p => p.domain.toLowerCase().includes(domain));
  if (search) filtered = filtered.filter(p =>
    p.title.toLowerCase().includes(search) ||
    p.domain.toLowerCase().includes(search) ||
    (p.tags || []).some(t => t.toLowerCase().includes(search))
  );

  if (sort === "growth") filtered.sort((a, b) => b.growth - a.growth);
  else if (sort === "salary") filtered.sort((a, b) => b.salary - a.salary);
  else if (sort === "demand") {
    const order = ["Very High", "High", "Moderate-High", "Moderate"];
    filtered.sort((a, b) => order.indexOf(a.demand) - order.indexOf(b.demand));
  }

  const grid = document.getElementById("careerCardsGrid");
  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="loading-spinner" style="grid-column:1/-1"><p class="text-muted">No careers match your filter.</p></div>`;
  } else {
    filtered.forEach(p => grid.appendChild(buildCareerCard(p)));
  }
}

// ─── Career Detail Modal ──────────────────────────────────────
function openCareerModal(pathwayId) {
  if (!State.dashboardData) return;
  const full = State.dashboardData.career_pathways.find(p => p.id === pathwayId);
  if (!full) return;

  // We need the full dataset detail — fetch from the global data
  State.currentModalPathwayId = pathwayId;

  // We have abbreviated data; enhance with what we have
  const style = getDomainStyle(full.domain);
  document.getElementById("modalTitle").textContent = full.title;
  document.getElementById("modalDomain").textContent = full.domain;
  document.getElementById("modalHeader").style.borderBottom = `3px solid ${style.color}`;

  document.getElementById("modalBody").innerHTML = buildModalBody(full);

  // Button actions
  document.getElementById("modalAnalyzeBtn").onclick = () => {
    State.careerModal.hide();
    switchTab("skills");
    setTimeout(() => {
      const sel = document.getElementById("pathwaySelect");
      if (sel) { sel.value = pathwayId; sel.dispatchEvent(new Event("change")); }
    }, 300);
  };

  document.getElementById("modalChatBtn").onclick = () => {
    State.careerModal.hide();
    switchTab("chat");
    if (!State.sessionActive) {
      startSession().then(() => {
        setTimeout(() => {
          document.getElementById("chatInput").value = `Tell me more about a career as ${full.title} and how I can get started.`;
          autoResizeTextarea(document.getElementById("chatInput"));
        }, 500);
      });
    } else {
      document.getElementById("chatInput").value = `Tell me more about a career as ${full.title} and how I can get started.`;
      autoResizeTextarea(document.getElementById("chatInput"));
      document.getElementById("chatInput").focus();
    }
  };

  if (!State.careerModal) {
    State.careerModal = new bootstrap.Modal(document.getElementById("careerDetailModal"));
  }
  State.careerModal.show();
}

function buildModalBody(p) {
  return `
    <div class="modal-stat-row">
      <div class="modal-stat-box">
        <div class="modal-stat-num">${p.growth}%</div>
        <div class="modal-stat-lbl">Job Growth (10yr)</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-num">$${(p.salary / 1000).toFixed(0)}K</div>
        <div class="modal-stat-lbl">Median Salary</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-num">${p.demand}</div>
        <div class="modal-stat-lbl">Market Demand</div>
      </div>
    </div>
    <p style="font-size:14px;color:var(--text-secondary);line-height:1.65">${p.description}</p>
    <div class="modal-section-title">Top Tags</div>
    <div class="modal-skill-list">${(p.tags || []).map(t => `<span class="modal-skill-badge">${t}</span>`).join("")}</div>
    <div class="modal-section-title">Key Technical Skills</div>
    <p style="font-size:13px;color:var(--text-secondary)">See the Skills tab for a full gap analysis specific to your background.</p>
    <div class="modal-section-title">Data Source</div>
    <p style="font-size:12.5px;color:var(--text-muted);font-style:italic">Figures are from the curated dataset (BLS, LinkedIn, WEF, McKinsey). Dataset version is shown in the Dashboard header.</p>
  `;
}

// ─── SVG Chart: Salary + Growth Bar Chart ─────────────────────
function renderSalaryGrowthChart(pathways) {
  const svg = document.getElementById("salaryGrowthChart");
  if (!svg) return;
  const sorted = [...pathways].sort((a, b) => b.growth - a.growth);
  const W = svg.parentElement.clientWidth || 600;
  const H = 340;
  const margin = { top: 28, right: 60, bottom: 90, left: 54 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const maxGrowth = Math.max(...sorted.map(p => p.growth));
  const maxSalary = Math.max(...sorted.map(p => p.salary));
  const barW = innerW / sorted.length * 0.55;
  const gap = innerW / sorted.length;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const textColor = isDark ? "#a0aec0" : "#636d7e";
  const gridColor = isDark ? "#2a3448" : "#e5e8ef";
  const barColor = "#1a6fe8";
  const lineColor = "#7c3aed";

  const scaleY = v => innerH - (v / maxGrowth) * innerH;
  const scaleSalary = v => innerH - (v / maxSalary) * innerH;

  let bars = "", gridLines = "", labels = "", linePoints = "";

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = (innerH / 4) * i;
    gridLines += `<line x1="0" y1="${y}" x2="${innerW}" y2="${y}" stroke="${gridColor}" stroke-width="1" stroke-dasharray="4"/>`;
    const val = Math.round(maxGrowth * (1 - i / 4));
    gridLines += `<text x="-6" y="${y + 4}" text-anchor="end" font-size="10" fill="${textColor}">${val}%</text>`;
  }

  // Right axis (salary)
  for (let i = 0; i <= 4; i++) {
    const y = (innerH / 4) * i;
    const val = Math.round(maxSalary * (1 - i / 4) / 1000);
    gridLines += `<text x="${innerW + 6}" y="${y + 4}" text-anchor="start" font-size="10" fill="${lineColor}">$${val}K</text>`;
  }

  sorted.forEach((p, i) => {
    const x = gap * i + gap / 2 - barW / 2;
    const barH = innerH - scaleY(p.growth);
    const barY = scaleY(p.growth);
    const cx = gap * i + gap / 2;
    const cy = scaleSalary(p.salary);

    bars += `<rect class="chart-bar" x="${x}" y="${barY}" width="${barW}" height="${barH}" rx="4" fill="${barColor}" opacity="0.82" data-val="${p.growth}%">
      <title>${p.title}: ${p.growth}% growth, $${(p.salary / 1000).toFixed(0)}K salary</title>
    </rect>`;

    // Line point
    linePoints += `${cx},${cy} `;

    // X label (rotated)
    const shortTitle = p.title.length > 14 ? p.title.substring(0, 13) + "…" : p.title;
    labels += `<text x="${cx}" y="${innerH + 16}" text-anchor="end" font-size="10" fill="${textColor}" transform="rotate(-35, ${cx}, ${innerH + 16})">${shortTitle}</text>`;
  });

  // Draw polyline for salary
  const pts = linePoints.trim().split(" ").join(" ");
  const polyline = `<polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  // Line dots
  const lineDots = sorted.map((p, i) => {
    const cx = gap * i + gap / 2;
    const cy = scaleSalary(p.salary);
    return `<circle cx="${cx}" cy="${cy}" r="4" fill="${lineColor}" stroke="white" stroke-width="1.5"><title>$${(p.salary/1000).toFixed(0)}K</title></circle>`;
  }).join("");

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <g transform="translate(${margin.left},${margin.top})">
      ${gridLines}
      ${bars}
      ${polyline}
      ${lineDots}
      ${labels}
      <text x="0" y="-10" font-size="11" fill="${textColor}" font-weight="600">Job Growth (%)</text>
      <text x="${innerW}" y="-10" font-size="11" fill="${lineColor}" font-weight="600" text-anchor="end">Median Salary ($)</text>
    </g>`;
}

// ─── SVG Chart: Demand Pie Chart ──────────────────────────────
function renderDemandPieChart(pathways) {
  const svg = document.getElementById("demandPieChart");
  const legend = document.getElementById("pieLegend");
  if (!svg || !legend) return;

  const counts = {};
  pathways.forEach(p => { counts[p.demand] = (counts[p.demand] || 0) + 1; });

  const colors = {
    "Very High": "#059669",
    "High": "#1a6fe8",
    "Moderate-High": "#d97706",
    "Moderate": "#636d7e"
  };

  const entries = Object.entries(counts);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = 140, cy = 140, r = 110;
  let startAngle = -Math.PI / 2;
  let slices = "";

  entries.forEach(([label, count]) => {
    const angle = (count / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const color = colors[label] || "#636d7e";

    slices += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z"
      fill="${color}" opacity="0.88" stroke="var(--bg-primary)" stroke-width="2">
      <title>${label}: ${count} pathway${count > 1 ? "s" : ""}</title>
    </path>`;

    // Label inside slice
    const midAngle = startAngle + angle / 2;
    const lx = cx + (r * 0.64) * Math.cos(midAngle);
    const ly = cy + (r * 0.64) * Math.sin(midAngle);
    slices += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="white">${count}</text>`;

    startAngle = endAngle;
  });

  svg.innerHTML = slices;

  legend.innerHTML = entries.map(([label, count]) =>
    `<div class="pie-legend-item">
      <div class="pie-legend-dot" style="background:${colors[label] || '#636d7e'}"></div>
      <span>${label} (${count})</span>
    </div>`
  ).join("");
}

// ─── Trends Rendering ─────────────────────────────────────────
function renderTrends(trends) {
  const grid = document.getElementById("trendsGrid");
  if (!grid || !trends) return;

  const icons = [
    "bi-robot", "bi-cloud-fill", "bi-shield-fill", "bi-tree-fill", "bi-database-fill", "bi-heart-pulse-fill"
  ];
  const iconColors = ["#1a6fe8", "#7c3aed", "#dc2626", "#059669", "#d97706", "#0891b2"];

  grid.innerHTML = trends.map((t, i) => `
    <div class="trend-card">
      <div class="trend-header">
        <div class="trend-icon" style="background:${iconColors[i % iconColors.length]}1a;color:${iconColors[i % iconColors.length]}">
          <i class="bi ${icons[i % icons.length]}"></i>
        </div>
        <div class="trend-title">${t.trend}</div>
      </div>
      <p class="trend-impact">${t.impact}</p>
      <div class="trend-roles">
        ${(t.top_roles_impacted || []).slice(0, 4).map(r => `<span class="trend-role-tag">${r.replace(/_/g, " ")}</span>`).join("")}
      </div>
      <div class="trend-source"><i class="bi bi-bookmark-check me-1"></i>Source: ${t.source}</div>
    </div>`).join("");
}

// ─── Skills Tab ───────────────────────────────────────────────
function populateSkillsTab(pathways, skillCategories) {
  // Populate pathway selector
  const sel = document.getElementById("pathwaySelect");
  pathways.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.title;
    sel.appendChild(opt);
  });

  // Build category tabs
  const tabsEl = document.getElementById("skillCategoryTabs");
  const categories = Object.keys(skillCategories);
  categories.forEach((cat, idx) => {
    const btn = document.createElement("button");
    btn.className = `skill-cat-btn${idx === 0 ? " active" : ""}`;
    btn.textContent = cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    btn.dataset.category = cat;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".skill-cat-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.activeSkillCategory = cat;
      renderSkillPalette(skillCategories[cat]);
    });
    tabsEl.appendChild(btn);
  });

  // Default category
  if (categories.length > 0) {
    State.activeSkillCategory = categories[0];
    renderSkillPalette(skillCategories[categories[0]]);
  }
}

function renderSkillPalette(skills) {
  const palette = document.getElementById("skillPalette");
  palette.innerHTML = "";
  skills.forEach(skill => {
    const chip = document.createElement("button");
    chip.className = `skill-chip${State.selectedSkills.has(skill) ? " selected" : ""}`;
    chip.textContent = skill;
    chip.addEventListener("click", () => toggleSkill(skill, chip));
    palette.appendChild(chip);
  });
}

function toggleSkill(skill, chip) {
  if (State.selectedSkills.has(skill)) {
    State.selectedSkills.delete(skill);
    chip.classList.remove("selected");
  } else {
    State.selectedSkills.add(skill);
    chip.classList.add("selected");
  }
  updateSelectedSkillsDisplay();
}

function addCustomSkill(event) {
  if (event.key !== "Enter") return;
  const input = document.getElementById("customSkillInput");
  const val = input.value.trim();
  if (!val) return;
  State.selectedSkills.add(val);
  input.value = "";
  updateSelectedSkillsDisplay();
}

function updateSelectedSkillsDisplay() {
  const display = document.getElementById("selectedSkillsDisplay");
  document.getElementById("selectedCount").textContent = State.selectedSkills.size;
  if (State.selectedSkills.size === 0) {
    display.innerHTML = '<span class="tag-empty">No skills selected yet</span>';
    return;
  }
  display.innerHTML = [...State.selectedSkills].map(s =>
    `<span class="selected-tag" onclick="removeSkill('${s.replace(/'/g, "\\'")}', this)" title="Click to remove">${s} ×</span>`
  ).join("");
}

function removeSkill(skill, el) {
  State.selectedSkills.delete(skill);
  el.remove();
  document.getElementById("selectedCount").textContent = State.selectedSkills.size;
  if (State.selectedSkills.size === 0) {
    document.getElementById("selectedSkillsDisplay").innerHTML = '<span class="tag-empty">No skills selected yet</span>';
  }
  // De-select in palette
  document.querySelectorAll(".skill-chip").forEach(chip => {
    if (chip.textContent === skill) chip.classList.remove("selected");
  });
}

// ─── Skill Gap Assessment ─────────────────────────────────────
async function runSkillAssessment() {
  const pathwayId = document.getElementById("pathwaySelect").value;
  if (!pathwayId) { showToast("Please select a target career pathway.", "warning"); return; }
  if (State.selectedSkills.size === 0) { showToast("Please select at least one skill.", "warning"); return; }

  const resultArea = document.getElementById("skillsResultArea");
  resultArea.innerHTML = `<div class="d-flex align-items-center justify-content-center h-100 gap-3 py-5">
    <div class="spinner-border text-primary" role="status"></div>
    <span class="text-muted">Analyzing your skill gap…</span>
  </div>`;

  try {
    const data = await API.post("/api/skills/assess", {
      skills: [...State.selectedSkills],
      pathway_id: pathwayId,
    });
    renderSkillGapResult(data);
  } catch (err) {
    resultArea.innerHTML = `<div class="skills-result-empty"><p class="text-danger">Analysis failed: ${err.message}</p></div>`;
    showToast("Skill assessment failed.", "error");
  }
}

function renderSkillGapResult(data) {
  const pct = data.match_percentage;
  let readiness = "Beginner";
  let readinessColor = "#dc2626";
  if (pct >= 75) { readiness = "Advanced"; readinessColor = "#059669"; }
  else if (pct >= 50) { readiness = "Intermediate"; readinessColor = "#d97706"; }
  else if (pct >= 25) { readiness = "Developing"; readinessColor = "#1a6fe8"; }

  const resultArea = document.getElementById("skillsResultArea");
  resultArea.innerHTML = `
    <div style="padding:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h5 style="font-size:17px;font-weight:800;color:var(--text-primary);margin:0">${data.pathway_title}</h5>
        <span style="font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;background:${readinessColor}18;color:${readinessColor};border:1px solid ${readinessColor}30">${readiness}</span>
      </div>

      <div class="match-gauge-wrap">
        <div class="match-gauge-number">${pct}%</div>
        <div class="progress-bar-custom" style="max-width:280px;margin:10px auto 6px">
          <div class="progress-fill" style="width:0%" id="matchProgressFill"></div>
        </div>
        <div class="match-gauge-label">Skills Match — ${data.matched_skills.length} of ${data.matched_skills.length + data.missing_skills.length} required skills</div>
      </div>

      <div class="mb-4">
        <div class="result-section-title"><i class="bi bi-check-circle-fill me-1" style="color:#059669"></i>Skills You Already Have (${data.matched_skills.length})</div>
        <div>${data.matched_skills.length > 0
          ? data.matched_skills.map(s => `<span class="skill-gap-tag skill-have"><i class="bi bi-check-lg"></i>${s}</span>`).join("")
          : '<span style="font-size:13px;color:var(--text-muted)">None matched yet — add more skills above.</span>'
        }</div>
      </div>

      <div class="mb-4">
        <div class="result-section-title"><i class="bi bi-exclamation-circle-fill me-1" style="color:#dc2626"></i>Skills You Need to Develop (${data.missing_skills.length})</div>
        <div>${data.missing_skills.length > 0
          ? data.missing_skills.map(s => `<span class="skill-gap-tag skill-need"><i class="bi bi-plus-lg"></i>${s}</span>`).join("")
          : '<span style="font-size:13px;color:#059669;font-weight:600">🎉 Excellent! You meet all listed requirements.</span>'
        }</div>
      </div>

      ${data.certifications && data.certifications.length > 0 ? `
      <div class="mb-4">
        <div class="result-section-title"><i class="bi bi-award-fill me-1" style="color:#d97706"></i>Recommended Certifications</div>
        <ul class="cert-list">
          ${data.certifications.map(c => `<li class="cert-item"><i class="bi bi-patch-check-fill"></i>${c}</li>`).join("")}
        </ul>
      </div>` : ""}

      ${data.entry_roles && data.entry_roles.length > 0 ? `
      <div>
        <div class="result-section-title"><i class="bi bi-door-open-fill me-1" style="color:#1a6fe8"></i>Entry-Level Roles to Target</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${data.entry_roles.map(r => `<span class="modal-skill-badge">${r}</span>`).join("")}
        </div>
      </div>` : ""}

      <div class="mt-4 pt-3" style="border-top:1px solid var(--border-color)">
        <button class="btn btn-primary btn-sm me-2" onclick="switchTab('chat');if(!State.sessionActive){startSession();}">
          <i class="bi bi-chat-dots me-1"></i>Discuss with Stride
        </button>
        <button class="btn btn-outline-secondary btn-sm" onclick="runSkillAssessment()">
          <i class="bi bi-arrow-counterclockwise me-1"></i>Re-analyze
        </button>
      </div>
    </div>`;

  // Animate progress bar
  setTimeout(() => {
    const fill = document.getElementById("matchProgressFill");
    if (fill) fill.style.width = `${pct}%`;
  }, 100);
}

// ─── Health Check ─────────────────────────────────────────────
async function checkHealth() {
  try {
    const data = await API.get("/api/health");
    if (data.model_ready) {
      setStatus("online", `${data.model.split("/").pop()} ready`);
    } else {
      setStatus("demo", "Demo mode");
    }
  } catch {
    setStatus("error", "Offline");
  }
}

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyStoredTheme();
  checkHealth();

  // Auto-load dashboard data in background
  setTimeout(() => loadDashboardData(), 1000);

  // Handle window resize for SVG charts
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (State.dashboardData && State.currentTab === "dashboard") {
        renderSalaryGrowthChart(State.dashboardData.career_pathways);
      }
    }, 300);
  });

  // Focus chat input if session already active
  const chatInput = document.getElementById("chatInput");
  if (!chatInput.disabled) chatInput.focus();
});
