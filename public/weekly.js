const weeklyHumanStyles = `
  .weekly-human-card { position:relative; overflow:hidden; }
  .weekly-human-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
  .weekly-human-head h3 { margin:2px 0 0; }
  .weekly-human-period { display:inline-flex; align-items:center; padding:6px 10px; border-radius:999px; background:rgba(15,23,42,.06); color:var(--muted,#64748b); font-size:12px; font-weight:700; }
  .weekly-human-document { line-height:1.75; }
  .weekly-human-document h1 { margin:0 0 18px; font-size:23px; line-height:1.4; letter-spacing:-.02em; }
  .weekly-human-document h2 { margin:28px 0 12px; padding-top:16px; border-top:1px solid rgba(15,23,42,.08); font-size:19px; line-height:1.45; }
  .weekly-human-document h3 { margin:20px 0 8px; font-size:16px; line-height:1.5; }
  .weekly-human-document p { margin:8px 0; }
  .weekly-human-document ul { margin:8px 0 14px; padding-left:21px; }
  .weekly-human-document li { margin:6px 0; }
  .weekly-human-document blockquote { margin:0 0 18px; padding:12px 16px; border-left:4px solid rgba(15,23,42,.22); border-radius:8px; background:rgba(15,23,42,.035); color:var(--muted,#64748b); }
  .weekly-human-document code { padding:2px 5px; border-radius:5px; background:rgba(15,23,42,.06); font-size:.92em; }
`;

let weeklyHumanReport = null;
let weeklyHumanHtml = "";

function installWeeklyHumanStyles() {
  if (document.getElementById("weeklyHumanStyles")) return;
  const style = document.createElement("style");
  style.id = "weeklyHumanStyles";
  style.textContent = weeklyHumanStyles;
  document.head.appendChild(style);
}

function escapeWeeklyHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineWeeklyMarkdown(text = "") {
  let value = escapeWeeklyHtml(text);
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return value;
}

function renderWeeklyMarkdown(markdown = "") {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const html = [];
  let inList = false;
  let inQuote = false;
  let quoteLines = [];
  const closeList = () => { if (inList) { html.push("</ul>"); inList = false; } };
  const closeQuote = () => { if (inQuote) { html.push(`<blockquote>${quoteLines.map(inlineWeeklyMarkdown).join("<br>")}</blockquote>`); inQuote = false; quoteLines = []; } };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith(">")) { closeList(); inQuote = true; quoteLines.push(trimmed.replace(/^>\s?/, "")); continue; }
    closeQuote();
    if (!trimmed) { closeList(); continue; }
    const h3 = trimmed.match(/^###\s+(.+)/); const h2 = trimmed.match(/^##\s+(.+)/); const h1 = trimmed.match(/^#\s+(.+)/); const bullet = trimmed.match(/^[-*]\s+(.+)/);
    if (h3) { closeList(); html.push(`<h3>${inlineWeeklyMarkdown(h3[1])}</h3>`); }
    else if (h2) { closeList(); html.push(`<h2>${inlineWeeklyMarkdown(h2[1])}</h2>`); }
    else if (h1) { closeList(); html.push(`<h1>${inlineWeeklyMarkdown(h1[1])}</h1>`); }
    else if (bullet) { if (!inList) { html.push("<ul>"); inList = true; } html.push(`<li>${inlineWeeklyMarkdown(bullet[1])}</li>`); }
    else if (!trimmed.startsWith("<!--")) { closeList(); html.push(`<p>${inlineWeeklyMarkdown(trimmed)}</p>`); }
  }
  closeQuote(); closeList(); return html.join("\n");
}

function applyWeeklyHumanAnalysis() {
  if (!weeklyHumanReport || !weeklyHumanHtml) return;
  const panel = document.getElementById("weeklyPanel");
  if (!panel || !panel.children.length) return;
  let card = panel.querySelector(".weekly-insight");
  if (!card) { card = document.createElement("article"); card.className = "weekly-insight review-card"; panel.appendChild(card); }
  if (card.dataset.weeklyHuman === weeklyHumanReport.period) return;
  card.dataset.weeklyHuman = weeklyHumanReport.period;
  card.classList.add("weekly-human-card");
  card.innerHTML = `<div class="weekly-human-head"><div><p class="eyebrow">Weekly Intelligence · MD Analysis</p><h3>종합분석</h3></div><span class="weekly-human-period">${escapeWeeklyHtml(weeklyHumanReport.label || weeklyHumanReport.period)}</span></div><div class="weekly-human-document">${weeklyHumanHtml}</div>`;
}

async function initWeeklyHumanAnalysis() {
  installWeeklyHumanStyles();
  const panel = document.getElementById("weeklyPanel");
  if (!panel) return;
  const observer = new MutationObserver(() => applyWeeklyHumanAnalysis());
  observer.observe(panel, { childList: true, subtree: false });
  try {
    const indexResponse = await fetch(`reports/weekly/index.json?v=${Date.now()}`, { cache: "no-store" });
    if (!indexResponse.ok) throw new Error(`HTTP ${indexResponse.status}`);
    const indexData = await indexResponse.json();
    const reports = Array.isArray(indexData) ? indexData : (indexData.reports || []);
    if (!reports.length) return;
    reports.sort((a, b) => String(b.period || "").localeCompare(String(a.period || "")));
    const latest = reports[0];
    const reportResponse = await fetch(`reports/weekly/${latest.file}?v=${Date.now()}`, { cache: "no-store" });
    if (!reportResponse.ok) throw new Error(`HTTP ${reportResponse.status}`);
    weeklyHumanReport = latest;
    weeklyHumanHtml = renderWeeklyMarkdown(await reportResponse.text());
    applyWeeklyHumanAnalysis();
  } catch (error) {
    console.error("Weekly MD analysis load failed; keeping rule-based fallback", error);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initWeeklyHumanAnalysis, { once: true });
else initWeeklyHumanAnalysis();
