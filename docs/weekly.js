const weeklyAnalysisStyles = `
  .weekly-analysis-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; }
  .weekly-analysis-controls { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; }
  .weekly-analysis-controls label { display:grid; gap:6px; font-size:12px; color:var(--muted,#64748b); }
  .weekly-analysis-controls select { min-width:220px; padding:10px 12px; border:1px solid rgba(15,23,42,.14); border-radius:10px; background:#fff; color:inherit; }
  .weekly-analysis-status { display:inline-flex; align-items:center; min-height:30px; padding:5px 10px; border-radius:999px; background:rgba(15,23,42,.06); font-size:12px; font-weight:700; }
  .weekly-analysis-document { max-width:980px; margin:22px auto 0; padding:36px 42px; border:1px solid rgba(15,23,42,.08); border-radius:18px; background:#fff; box-shadow:0 18px 45px rgba(15,23,42,.06); line-height:1.8; }
  .weekly-analysis-document h1 { margin:0 0 24px; font-size:28px; line-height:1.35; letter-spacing:-.03em; }
  .weekly-analysis-document h2 { margin:34px 0 14px; padding-top:8px; border-top:1px solid rgba(15,23,42,.08); font-size:21px; line-height:1.45; }
  .weekly-analysis-document h3 { margin:22px 0 10px; font-size:17px; line-height:1.45; }
  .weekly-analysis-document p { margin:10px 0; }
  .weekly-analysis-document ul { margin:8px 0 16px; padding-left:22px; }
  .weekly-analysis-document li { margin:6px 0; }
  .weekly-analysis-document blockquote { margin:0 0 22px; padding:14px 18px; border-left:4px solid rgba(15,23,42,.22); border-radius:8px; background:rgba(15,23,42,.035); color:var(--muted,#64748b); }
  .weekly-analysis-document code { padding:2px 5px; border-radius:5px; background:rgba(15,23,42,.06); font-size:.92em; }
  .weekly-analysis-document a { color:inherit; text-decoration:underline; text-underline-offset:3px; }
  .weekly-analysis-empty { padding:48px 20px; text-align:center; color:var(--muted,#64748b); }
  @media (max-width:720px) { .weekly-analysis-document { padding:24px 20px; } .weekly-analysis-document h1 { font-size:24px; } }
`;

function installWeeklyAnalysisStyles() {
  if (document.getElementById("weeklyAnalysisStyles")) return;
  const style = document.createElement("style");
  style.id = "weeklyAnalysisStyles";
  style.textContent = weeklyAnalysisStyles;
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
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
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
    const h3 = trimmed.match(/^###\s+(.+)/);
    const h2 = trimmed.match(/^##\s+(.+)/);
    const h1 = trimmed.match(/^#\s+(.+)/);
    const bullet = trimmed.match(/^[-*]\s+(.+)/);
    if (h3) { closeList(); html.push(`<h3>${inlineWeeklyMarkdown(h3[1])}</h3>`); }
    else if (h2) { closeList(); html.push(`<h2>${inlineWeeklyMarkdown(h2[1])}</h2>`); }
    else if (h1) { closeList(); html.push(`<h1>${inlineWeeklyMarkdown(h1[1])}</h1>`); }
    else if (bullet) { if (!inList) { html.push("<ul>"); inList = true; } html.push(`<li>${inlineWeeklyMarkdown(bullet[1])}</li>`); }
    else if (!trimmed.startsWith("<!--")) { closeList(); html.push(`<p>${inlineWeeklyMarkdown(trimmed)}</p>`); }
  }
  closeQuote(); closeList();
  return html.join("\n");
}

function stripRuleBasedWeeklyAnalysis() {
  const panel = document.getElementById("weeklyPanel");
  if (!panel) return;
  panel.querySelectorAll(".weekly-insight").forEach((card) => card.remove());
}

function ensureWeeklyAnalysisView() {
  const nav = document.querySelector(".view-tabs");
  const main = document.querySelector("main");
  const weeklyTab = document.querySelector('[data-view="weekly"]');
  const monthlyTab = document.querySelector('[data-view="monthly"]');
  const weeklyView = document.getElementById("weeklyView");
  if (!nav || !main || !weeklyTab || !weeklyView) return null;

  let tab = document.querySelector('[data-view="weeklyAnalysis"]');
  if (!tab) {
    tab = document.createElement("button");
    tab.className = "view-tab";
    tab.dataset.view = "weeklyAnalysis";
    tab.type = "button";
    tab.textContent = "주간 분석";
    if (monthlyTab) nav.insertBefore(tab, monthlyTab);
    else weeklyTab.insertAdjacentElement("afterend", tab);
  }

  let view = document.getElementById("weeklyAnalysisView");
  if (!view) {
    view = document.createElement("section");
    view.id = "weeklyAnalysisView";
    view.className = "view";
    view.innerHTML = `
      <section class="section-band">
        <div class="weekly-analysis-head">
          <div><p class="eyebrow">Weekly Intelligence</p><h2>주간 분석</h2></div>
          <div class="weekly-analysis-controls">
            <label><span>분석 주간</span><select id="weeklyAnalysisSelect" aria-label="주간 분석 선택"></select></label>
            <span id="weeklyAnalysisStatus" class="weekly-analysis-status">불러오는 중</span>
          </div>
        </div>
        <article id="weeklyAnalysisDocument" class="weekly-analysis-document"><div class="weekly-analysis-empty">주간 분석을 불러오는 중입니다.</div></article>
      </section>`;
    weeklyView.insertAdjacentElement("afterend", view);
  }

  tab.addEventListener("click", () => {
    document.querySelectorAll(".view-tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    view.classList.add("active");
  });
  return view;
}

async function loadWeeklyAnalysis(entry) {
  const doc = document.getElementById("weeklyAnalysisDocument");
  const status = document.getElementById("weeklyAnalysisStatus");
  if (!doc || !status || !entry) return;
  status.textContent = entry.status || "주간 분석";
  doc.innerHTML = '<div class="weekly-analysis-empty">주간 분석을 불러오는 중입니다.</div>';
  try {
    const response = await fetch(`reports/weekly/${entry.file}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    doc.innerHTML = renderWeeklyMarkdown(await response.text());
  } catch (error) {
    console.error("Weekly analysis load failed", error);
    status.textContent = "불러오기 실패";
    doc.innerHTML = '<div class="weekly-analysis-empty">주간 분석 파일을 불러오지 못했습니다.</div>';
  }
}

async function initWeeklyAnalysis() {
  installWeeklyAnalysisStyles();
  const panel = document.getElementById("weeklyPanel");
  if (panel) {
    stripRuleBasedWeeklyAnalysis();
    const observer = new MutationObserver(() => stripRuleBasedWeeklyAnalysis());
    observer.observe(panel, { childList:true, subtree:false });
  }

  const view = ensureWeeklyAnalysisView();
  if (!view) return;
  const select = document.getElementById("weeklyAnalysisSelect");
  const status = document.getElementById("weeklyAnalysisStatus");
  try {
    const response = await fetch(`reports/weekly/index.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const reports = Array.isArray(data) ? data : (data.reports || []);
    if (!reports.length) {
      select.innerHTML = '<option value="">등록된 주간 분석 없음</option>';
      status.textContent = "자료 없음";
      return;
    }
    reports.sort((a,b) => String(b.period || "").localeCompare(String(a.period || "")));
    select.innerHTML = reports.map((entry,index) => `<option value="${index}">${escapeWeeklyHtml(entry.label || entry.period || entry.title)}</option>`).join("");
    const showSelected = () => loadWeeklyAnalysis(reports[Number(select.value) || 0]);
    select.addEventListener("change", showSelected);
    select.value = "0";
    await showSelected();
  } catch (error) {
    console.error("Weekly analysis index load failed", error);
    status.textContent = "불러오기 실패";
    document.getElementById("weeklyAnalysisDocument").innerHTML = '<div class="weekly-analysis-empty">주간 분석 목록을 불러오지 못했습니다.</div>';
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initWeeklyAnalysis, { once:true });
else initWeeklyAnalysis();
