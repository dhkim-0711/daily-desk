const state = {
  data: null,
  filter: "all",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function articleMatches(article, filter) {
  if (filter === "all") return true;
  const haystack = `${article.source} ${article.title} ${article.summary} ${article.taxonomyHits?.join(" ")}`.toLowerCase();
  if (filter === "국내") return /국내|korea|리벨리온|퓨리오사|하이퍼엑셀|딥엑스|모빌린트|삼성|하이닉스/.test(haystack);
  if (filter === "해외") return /해외|global|nvidia|google|amd|broadcom|tsmc|arm|alphabet/.test(haystack);
  if (filter === "정책") return /정책|policy|subsidy|export|수출|공급망|예산|사업/.test(haystack);
  if (filter === "시장") return /시장|market|investment|funding|ipo|datacenter|데이터센터|투자/.test(haystack);
  return true;
}

function renderChips(container, entries) {
  container.innerHTML = entries.length
    ? entries.map(([label, count]) => `<span class="chip">${escapeHtml(label)} ${count}</span>`).join("")
    : `<span class="empty">아직 뚜렷한 신호가 없습니다.</span>`;
}

function renderBriefing(data) {
  $("#briefDate").textContent = data.briefing.date;
  $("#summaryList").innerHTML = data.briefing.summary
    .map((item) => `<div class="summary-item">${escapeHtml(item)}</div>`)
    .join("");
  renderChips($("#techSignals"), data.briefing.signals.technologies);
  renderChips($("#companySignals"), data.briefing.signals.companies);
}

function renderArticles(data) {
  const articles = data.news.articles.filter((article) => articleMatches(article, state.filter)).slice(0, 24);
  $("#articleList").innerHTML = articles.length
    ? articles.map((article) => {
        const tags = [...(article.taxonomyHits || []), ...(article.companyHits || [])].slice(0, 5);
        return `
          <article class="article-card">
            <div>
              <h3><a href="${article.link}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a></h3>
              <p>${escapeHtml(article.summary || "요약문이 제공되지 않았습니다.")}</p>
              <div class="meta-row">
                <a class="source-link" href="${article.outletUrl}" target="_blank" rel="noreferrer">${escapeHtml(article.outlet)}</a>
                <span>${escapeHtml(article.source)}</span>
                <span>${formatDate(article.publishedAt)}</span>
                ${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
            <div class="score-pill" title="관련도 점수">${article.score}</div>
          </article>
        `;
      }).join("")
    : `<div class="empty">선택한 필터에 맞는 기사가 없습니다.</div>`;
}

function renderPolicyIdeas(data) {
  $("#policyIdeas").innerHTML = data.briefing.policyIdeas.map((idea) => `
    <article class="policy-card">
      <div class="policy-top">
        <h3>${escapeHtml(idea.title)}</h3>
        <span class="priority">우선순위 ${escapeHtml(idea.priority)}</span>
      </div>
      <p><strong>예산화:</strong> ${escapeHtml(idea.budgetItem)}</p>
      <p><strong>근거:</strong> ${escapeHtml(idea.why)}</p>
      <p><strong>KPI:</strong> ${escapeHtml(idea.kpi)}</p>
    </article>
  `).join("");
}

function marketRow(item) {
  const trendClass = item.changePct > 0 ? "up" : item.changePct < 0 ? "down" : "";
  return `
    <div class="market-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="ticker">${escapeHtml(item.symbol)} ${item.market ? `· ${escapeHtml(item.market)}` : ""}</div>
      </div>
      <span class="price">${item.error ? "수집 실패" : formatNumber(item.price, item.currency)}</span>
      <span class="${trendClass}">${item.error ? "-" : formatPct(item.changePct)}</span>
    </div>
  `;
}

function renderMarket(data) {
  $("#indexList").innerHTML = data.market.indices.map(marketRow).join("");
  $("#equityList").innerHTML = data.market.equities.map(marketRow).join("");
}

function renderSources(data) {
  $("#sourceList").innerHTML = data.sources.map((source) => `
    <a class="source-item" href="${source.url}" target="_blank" rel="noreferrer">
      <strong>${escapeHtml(source.label)}</strong>
      <span>${escapeHtml(source.url)}</span>
    </a>
  `).join("");
}

function renderErrors(data) {
  if (!data.news.errors?.length) return;
  $("#articleList").insertAdjacentHTML(
    "afterbegin",
    `<div class="error">일부 뉴스 소스 수집 실패: ${escapeHtml(data.news.errors.join(" / "))}</div>`,
  );
}

function render() {
  const { data } = state;
  if (!data) return;
  $("#updatedAt").textContent = `갱신 ${formatDate(data.generatedAt)}`;
  renderBriefing(data);
  renderArticles(data);
  renderPolicyIdeas(data);
  renderMarket(data);
  renderSources(data);
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
      $("#articleList").innerHTML = `<div class="error">데이터를 불러오지 못했습니다. 로컬 네트워크 또는 뉴스/금융 API 접근 상태를 확인해주세요. ${escapeHtml(error.message)}</div>`;
    }
  } finally {
    $("#refreshBtn").disabled = false;
    $("#refreshBtn").textContent = "새로고침";
  }
}

$$(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderArticles(state.data);
  });
});

$("#refreshBtn").addEventListener("click", () => loadDashboard(true));

loadDashboard();
