const monthlyStyles = `
  .monthly-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; }
  .monthly-controls { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; }
  .monthly-controls label { display:grid; gap:6px; font-size:12px; color:var(--muted, #6b7280); }
  .monthly-controls select { min-width:180px; padding:10px 12px; border:1px solid rgba(15,23,42,.14); border-radius:10px; background:#fff; color:inherit; }
  .monthly-status { display:inline-flex; align-items:center; min-height:30px; padding:5px 10px; border-radius:999px; background:rgba(15,23,42,.06); font-size:12px; font-weight:700; }
  .monthly-document { width:100%; max-width:none; margin:22px 0 0; padding:36px 42px; border:1px solid rgba(15,23,42,.08); border-radius:18px; background:#fff; box-shadow:0 18px 45px rgba(15,23,42,.06); line-height:1.8; }
  .monthly-document h1 { margin:0 0 24px; font-size:30px; line-height:1.3; letter-spacing:-.03em; }
  .monthly-document h2 { margin:38px 0 14px; padding-top:8px; border-top:1px solid rgba(15,23,42,.08); font-size:22px; line-height:1.4; }
  .monthly-document h3 { margin:24px 0 10px; font-size:18px; line-height:1.45; }
  .monthly-document p { margin:10px 0; }
  .monthly-document ul { margin:8px 0 16px; padding-left:22px; }
  .monthly-document li { margin:6px 0; }
  .monthly-document blockquote { margin:0 0 24px; padding:14px 18px; border-left:4px solid rgba(15,23,42,.22); border-radius:8px; background:rgba(15,23,42,.035); color:var(--muted, #64748b); }
  .monthly-document code { padding:2px 5px; border-radius:5px; background:rgba(15,23,42,.06); font-size:.92em; }
  .monthly-document a { color:inherit; text-decoration:underline; text-underline-offset:3px; }
  .monthly-document .footnote-ref { margin-left:2px; font-size:.75em; vertical-align:super; }
  .monthly-document .footnote-ref a { text-decoration:none; font-weight:800; }
  .monthly-document .footnote-item { margin:7px 0; padding:7px 10px; border-radius:8px; background:rgba(15,23,42,.035); font-size:13px; color:var(--muted,#64748b); }
  .monthly-document .footnote-item sup { display:inline-block; min-width:24px; color:inherit; font-weight:800; }
  .monthly-empty { padding:48px 20px; text-align:center; color:var(--muted, #64748b); }
  @media (max-width: 720px) { .monthly-document { padding:24px 20px; } .monthly-document h1 { font-size:25px; } }
`;

function installMonthlyStyles() {
  if (document.getElementById("monthlyStyles")) return;
  const style = document.createElement("style");
  style.id = "monthlyStyles";
  style.textContent = monthlyStyles;
  document.head.appendChild(style);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(text = "") {
  let value = escapeHtml(text);
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  value = value.replace(/\[\^([^\]]+)\]/g, '<sup class="footnote-ref"><a href="#fn-$1">[$1]</a></sup>');
  return value;
}

function renderMarkdown(markdown = "") {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const html = [];
  let inList = false;
  let inQuote = false;
  let quoteLines = [];

  const closeList = () => { if (inList) { html.push("</ul>"); inList = false; } };
  const closeQuote = () => {
    if (inQuote) {
      html.push(`<blockquote>${quoteLines.map(inlineMarkdown).join("<br>")}</blockquote>`);
      inQuote = false;
      quoteLines = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) {
      closeList();
      inQuote = true;
      quoteLines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    closeQuote();
    if (!trimmed) { closeList(); continue; }

    const footnote = trimmed.match(/^\[\^([^\]]+)\]:\s*(.+)/);
    const h3 = trimmed.match(/^###\s+(.+)/);
    const h2 = trimmed.match(/^##\s+(.+)/);
    const h1 = trimmed.match(/^#\s+(.+)/);
    const bullet = trimmed.match(/^[-*]\s+(.+)/);

    if (footnote) {
      closeList();
      html.push(`<p class="footnote-item" id="fn-${escapeHtml(footnote[1])}"><sup>[${escapeHtml(footnote[1])}]</sup>${inlineMarkdown(footnote[2])}</p>`);
    } else if (h3) {
      closeList(); html.push(`<h3>${inlineMarkdown(h3[1])}</h3>`);
    } else if (h2) {
      closeList(); html.push(`<h2>${inlineMarkdown(h2[1])}</h2>`);
    } else if (h1) {
      closeList(); html.push(`<h1>${inlineMarkdown(h1[1])}</h1>`);
    } else if (bullet) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
    } else if (!trimmed.startsWith("<!--")) {
      closeList(); html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
    }
  }
  closeQuote(); closeList();
  return html.join("\n");
}

function ensureMonthlyView() {
  const nav = document.querySelector(".view-tabs");
  const main = document.querySelector("main");
  if (!nav || !main) return null;

  let tab = document.querySelector('[data-view="monthly"]');
  if (!tab) {
    tab = document.createElement("button");
    tab.className = "view-tab";
    tab.dataset.view = "monthly";
    tab.type = "button";
    tab.textContent = "월간 분석";
    nav.appendChild(tab);
  }

  let view = document.getElementById("monthlyView");
  if (!view) {
    view = document.createElement("section");
    view.id = "monthlyView";
    view.className = "view";
    view.innerHTML = `
      <section class="section-band">
        <div class="monthly-head">
          <div><p class="eyebrow">Monthly Intelligence</p><h2>월간 정책 인사이트</h2></div>
          <div class="monthly-controls">
            <label><span>분석 월</span><select id="monthlySelect" aria-label="월간 분석 월 선택"></select></label>
            <span id="monthlyStatus" class="monthly-status">불러오는 중</span>
          </div>
        </div>
        <article id="monthlyDocument" class="monthly-document"><div class="monthly-empty">월간 분석을 불러오는 중입니다.</div></article>
      </section>`;
    main.appendChild(view);
  }

  tab.addEventListener("click", () => {
    document.querySelectorAll(".view-tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    view.classList.add("active");
  });
  return view;
}

async function loadMonthlyReport(entry) {
  const doc = document.getElementById("monthlyDocument");
  const status = document.getElementById("monthlyStatus");
  if (!doc || !status || !entry) return;
  status.textContent = entry.status || "월간 분석";
  doc.innerHTML = '<div class="monthly-empty">월간 분석을 불러오는 중입니다.</div>';
  try {
    const response = await fetch(`reports/monthly/${entry.file}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    doc.innerHTML = renderMarkdown(await response.text());
  } catch (error) {
    console.error("Monthly report load failed", error);
    doc.innerHTML = '<div class="monthly-empty">월간 분석 파일을 불러오지 못했습니다.</div>';
    status.textContent = "불러오기 실패";
  }
}

async function initMonthlyReports() {
  installMonthlyStyles();
  const view = ensureMonthlyView();
  if (!view) return;
  const select = document.getElementById("monthlySelect");
  const status = document.getElementById("monthlyStatus");
  try {
    const response = await fetch(`reports/monthly/index.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const reports = Array.isArray(data) ? data : (data.reports || []);
    if (!reports.length) {
      select.innerHTML = '<option value="">등록된 월간 분석 없음</option>';
      status.textContent = "자료 없음";
      return;
    }
    reports.sort((a, b) => String(b.month).localeCompare(String(a.month)));
    select.innerHTML = reports.map((entry, index) => `<option value="${index}">${escapeHtml(entry.label || entry.month || entry.title)}</option>`).join("");
    const showSelected = () => loadMonthlyReport(reports[Number(select.value) || 0]);
    select.addEventListener("change", showSelected);
    select.value = "0";
    await showSelected();
  } catch (error) {
    console.error("Monthly index load failed", error);
    status.textContent = "불러오기 실패";
    document.getElementById("monthlyDocument").innerHTML = '<div class="monthly-empty">월간 분석 목록을 불러오지 못했습니다.</div>';
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMonthlyReports, { once: true });
else initMonthlyReports();