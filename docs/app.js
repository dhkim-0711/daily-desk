const state = {
  data: null,
  filter: "all",
  month: "all",
  date: "all",
  view: "briefing",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const issueOrder = ["인퍼런스", "온디바이스", "데이터센터", "파운드리·공정", "수출통제·공급망", "투자·M&A", "공공조달·실증"];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, options = {}) {
  const date = asDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: options.short ? "short" : "medium",
    ...(options.time ? { timeStyle: "short" } : {}),
  }).format(date);
}

function monthKey(value) {
  const date = asDate(value);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(value) {
  const date = asDate(value);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthLabel(key) {
  if (key === "all") return "전체";
  const [year, month] = key.split("-");
  return `${year}년 ${Number(month)}월`;
}

function dayLabel(key) {
  if (key === "all") return "전체";
  if (key === "unknown") return "날짜 없음";
  const [, month, day] = key.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function formatNumber(value, currency = "") {
  if (!Number.isFinite(value)) return "-";
  const maximumFractionDigits = value > 1000 ? 0 : 2;
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits }).format(value)} ${currency}`.trim();
}

function formatPct(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function cleanSummary(text = "") {
  const normalized = text.replace(/\s+-\s+[^-]+$/, "").replace(/\s+/g, " ").trim();
  if (!normalized) return "요약문이 제공되지 않았습니다.";
  return normalized.length > 150 ? `${normalized.slice(0, 150).trim()}...` : normalized;
}

function articleMatches(article) {
  const haystack = `${article.source} ${article.title} ${article.summary} ${(article.taxonomyHits || []).join(" ")} ${(article.companyHits || []).join(" ")}`.toLowerCase();
  if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) return false;
  if (state.date !== "all" && dayKey(article.publishedAt) !== state.date) return false;
  if (state.filter === "all") return true;
  if (state.filter === "domestic") return /국내|korea|리벨리온|퓨리오사|하이퍼엑셀|딥엑스|모빌린트|삼성|하이닉스|k-엔비디아/.test(haystack);
  if (state.filter === "global") return /해외|global|nvidia|google|amd|broadcom|tsmc|arm|alphabet|micron/.test(haystack);
  if (state.filter === "policy") return /정책|policy|subsidy|export|수출|공급망|예산|사업|조달|규제/.test(haystack);
  if (state.filter === "market") return /시장|market|investment|funding|ipo|datacenter|데이터센터|투자|valuation|earnings/.test(haystack);
  return true;
}

function issueName(article) {
  const hit = (article.taxonomyHits || []).find((item) => issueOrder.includes(item));
  if (hit) return hit;
  if (/국내|리벨리온|퓨리오사|하이퍼엑셀|딥엑스|모빌린트|K-엔비디아/.test(article.source + article.title)) return "국내 NPU";
  if (/정책|policy|export|subsidy|예산|조달/.test(`${article.source} ${article.title} ${article.summary}`.toLowerCase())) return "정책·제도";
  return article.source || "기타 이슈";
}

function groupByIssue(articles) {
  const groups = new Map();
  for (const article of articles) {
    const key = issueName(article);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(article);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      items: items.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)),
      score: items.reduce((sum, item) => sum + (item.score || 0), 0),
    }))
    .sort((a, b) => b.score - a.score || b.items.length - a.items.length);
}

function renderChips(container, entries, limit = 8) {
  container.innerHTML = entries?.length
    ? entries.slice(0, limit).map(([label, count]) => `<span class="chip">${escapeHtml(label)} <b>${count}</b></span>`).join("")
    : `<span class="muted-text">신호 없음</span>`;
}

function renderBriefing(data) {
  $("#briefDate").textContent = data.briefing.date;
  const filtered = data.news.articles.filter(articleMatches);
  const groups = groupByIssue(filtered).slice(0, 3);
  const summary = groups.length
    ? groups.map((group) => `${group.name}: ${group.items[0].title}`)
    : data.briefing.summary;

  $("#summaryList").innerHTML = summary.slice(0, 3).map((item) => `
    <div class="brief-line">${escapeHtml(item)}</div>
  `).join("");
  renderChips($("#techSignals"), data.briefing.signals.technologies, 6);
  renderChips($("#companySignals"), data.briefing.signals.companies, 6);
}

function renderSelectors(data) {
  const articles = data.news.articles;
  const months = [...new Set(articles.map((article) => monthKey(article.publishedAt)))].filter(Boolean).sort().reverse();
  const dates = [...new Set(articles
    .filter((article) => state.month === "all" || monthKey(article.publishedAt) === state.month)
    .map((article) => dayKey(article.publishedAt)))]
    .filter(Boolean)
    .sort()
    .reverse();

  $("#monthSelect").innerHTML = [`<option value="all">전체 월</option>`, ...months.map((key) => (
    `<option value="${key}" ${state.month === key ? "selected" : ""}>${monthLabel(key)}</option>`
  ))].join("");

  if (state.date !== "all" && !dates.includes(state.date)) state.date = "all";
  $("#dateSelect").innerHTML = [`<option value="all">전체 일자</option>`, ...dates.map((key) => (
    `<option value="${key}" ${state.date === key ? "selected" : ""}>${dayLabel(key)}</option>`
  ))].join("");
}

function renderIssues(data) {
  const articles = data.news.articles.filter(articleMatches);
  const groups = groupByIssue(articles).slice(0, 10);
  $("#issueList").innerHTML = groups.length
    ? groups.map((group) => {
        const topTags = [...new Set(group.items.flatMap((item) => [...(item.taxonomyHits || []), ...(item.companyHits || [])]))].slice(0, 7);
        const lead = group.items[0];
        return `
          <article class="issue-card">
            <div class="issue-head">
              <div>
                <p class="issue-date">${dayLabel(dayKey(lead.publishedAt))} · 기사 ${group.items.length}건</p>
                <h3>${escapeHtml(group.name)}</h3>
              </div>
              <div class="chips">${topTags.map((tag) => `<span class="chip pale">${escapeHtml(tag)}</span>`).join("")}</div>
            </div>
            <p class="issue-summary">${escapeHtml(cleanSummary(lead.summary))}</p>
            <div class="article-stack">
              ${group.items.slice(0, 5).map((article) => `
                <a class="article-row" href="${article.link}" target="_blank" rel="noreferrer">
                  <span class="article-title">${escapeHtml(article.title)}</span>
                  <span class="article-meta">${escapeHtml(article.outlet)} · ${formatDate(article.publishedAt, { short: true })}</span>
                </a>
              `).join("")}
            </div>
          </article>
        `;
      }).join("")
    : `<div class="empty">선택한 조건에 맞는 이슈가 없습니다.</div>`;
}

function renderPolicyIdeas(data) {
  $("#policyIdeas").innerHTML = data.briefing.policyIdeas.map((idea) => `
    <article class="policy-card">
      <div class="policy-top">
        <h3>${escapeHtml(idea.title)}</h3>
        <span class="priority">우선순위 ${escapeHtml(idea.priority)}</span>
      </div>
      <p><strong>예산화</strong>${escapeHtml(idea.budgetItem)}</p>
      <p><strong>근거</strong>${escapeHtml(idea.why)}</p>
      <p><strong>KPI</strong>${escapeHtml(idea.kpi)}</p>
    </article>
  `).join("");
}

function sparkline(values = []) {
  const points = values.filter(Number.isFinite);
  if (points.length < 2) return `<div class="spark empty-spark"></div>`;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 34 - ((value - min) / range) * 28;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return `
    <svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function marketCard(item) {
  const trendClass = item.changePct > 0 ? "up" : item.changePct < 0 ? "down" : "";
  const series = item.closes || [];
  return `
    <article class="market-card ${trendClass}">
      <div class="market-top">
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          <span>${escapeHtml(item.symbol)}${item.market ? ` · ${escapeHtml(item.market)}` : ""}</span>
        </div>
        <strong>${item.error ? "-" : formatPct(item.changePct)}</strong>
      </div>
      ${sparkline(series)}
      <div class="market-bottom">
        <span>${item.error ? "수집 실패" : formatNumber(item.price, item.currency)}</span>
        <small>${item.error ? escapeHtml(item.error) : "최근 5거래일"}</small>
      </div>
    </article>
  `;
}

function renderMarket(data) {
  $("#indexList").innerHTML = data.market.indices.map(marketCard).join("");
  $("#equityList").innerHTML = data.market.equities.map(marketCard).join("");
}

function renderErrors(data) {
  if (!data.news.errors?.length) return;
  $("#issueList").insertAdjacentHTML(
    "afterbegin",
    `<div class="error">일부 뉴스 소스 수집 실패: ${escapeHtml(data.news.errors.join(" / "))}</div>`,
  );
}

function render() {
  const { data } = state;
  if (!data) return;
  $("#updatedAt").textContent = `갱신 ${formatDate(data.generatedAt, { time: true })}`;
  renderSelectors(data);
  renderBriefing(data);
  renderIssues(data);
  renderPolicyIdeas(data);
  renderMarket(data);
  renderErrors(data);
}

async function loadDashboard(force = false) {
  $("#refreshBtn").disabled = true;
  $("#refreshBtn").textContent = "수집 중";
  try {
    if (location.protocol === "file:" && window.__DASHBOARD_DATA__) {
      state.data = window.__DASHBOARD_DATA__;
    } else {
      const response = await fetch(`api/dashboard${force ? "?refresh=1" : ""}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.data = await response.json();
    }
    render();
  } catch (error) {
    if (window.__DASHBOARD_DATA__) {
      state.data = window.__DASHBOARD_DATA__;
      render();
    } else {
      $("#issueList").innerHTML = `<div class="error">데이터를 불러오지 못했습니다. 로컬 네트워크 또는 뉴스/금융 API 접근 상태를 확인해주세요. ${escapeHtml(error.message)}</div>`;
    }
  } finally {
    $("#refreshBtn").disabled = false;
    $("#refreshBtn").textContent = "새로고침";
  }
}

$$(".view-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    $$(".view-tab").forEach((item) => item.classList.toggle("active", item === button));
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${state.view}View`));
  });
});

$$(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    render();
  });
});

$("#monthSelect").addEventListener("change", (event) => {
  state.month = event.target.value;
  state.date = "all";
  render();
});

$("#dateSelect").addEventListener("change", (event) => {
  state.date = event.target.value;
  render();
});

$("#refreshBtn").addEventListener("click", () => loadDashboard(true));

loadDashboard();
