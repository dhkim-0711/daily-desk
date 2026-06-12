const state = {
  data: null,
  filter: "all",
  month: "all",
  date: "all",
  tag: "",
  issue: "",
  search: "",
  view: "briefing",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const issueOrder = [
  "AI시장",
  "AI에이전트",
  "AI인프라",
  "K-엔비디아",
  "NPU",
  "리벨리온",
  "퓨리오사AI",
  "하이퍼엑셀",
  "딥엑스",
  "모빌린트",
  "NVIDIA",
  "Google",
  "인퍼런스",
  "온디바이스",
  "파운드리·패키징",
  "수출통제·공급망",
  "투자·M&A",
  "실증·조달",
];

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
  return normalized.length > 170 ? `${normalized.slice(0, 170).trim()}...` : normalized;
}

function articleText(article) {
  return `${article.source} ${article.title} ${article.summary} ${(article.taxonomyHits || []).join(" ")} ${(article.companyHits || []).join(" ")}`.toLowerCase();
}

function articleMatches(article) {
  const haystack = articleText(article);
  if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) return false;
  if (state.date !== "all" && dayKey(article.publishedAt) !== state.date) return false;
  if (state.tag && !haystack.includes(state.tag.toLowerCase())) return false;
  if (state.issue && issueName(article) !== state.issue) return false;
  if (state.search) {
    const terms = state.search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.every((term) => haystack.includes(term))) return false;
  }
  if (state.filter === "all") return true;
  if (state.filter === "domestic") return /국내|korea|리벨리온|퓨리오사|하이퍼엑셀|딥엑스|모빌린트|삼성|하이닉스|k-엔비디아/.test(haystack);
  if (state.filter === "global") return /해외|global|nvidia|google|alphabet|gemini|deepmind|amd|broadcom|tsmc|arm|micron/.test(haystack);
  if (state.filter === "policy") return /정책|policy|subsidy|export|수출|공급망|예산|사업|조달|규제/.test(haystack);
  if (state.filter === "market") return /시장|market|investment|funding|ipo|datacenter|데이터센터|투자|valuation|earnings|spending|revenue/.test(haystack);
  return true;
}

function issueName(article) {
  const hit = (article.taxonomyHits || []).find((item) => issueOrder.includes(item));
  if (hit) return hit;
  const text = articleText(article);
  if (/리벨리온|퓨리오사|하이퍼엑셀|딥엑스|모빌린트|k-엔비디아/.test(text)) return "국내 NPU";
  if (/ai market|ai adoption|생성형|인공지능 서비스|enterprise ai/.test(text)) return "AI시장";
  if (/정책|policy|export|subsidy|예산|조달/.test(text)) return "정책·제도";
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

function tagButton(label, count, variant = "") {
  const active = state.tag.toLowerCase() === String(label).toLowerCase();
  return `
    <button class="chip tag-chip ${variant} ${active ? "active" : ""}" type="button" data-tag="${escapeHtml(label)}">
      ${escapeHtml(label)}${Number.isFinite(count) ? ` <b>${count}</b>` : ""}
    </button>
  `;
}

function renderChips(container, entries, limit = 8) {
  container.innerHTML = entries?.length
    ? entries.slice(0, limit).map(([label, count]) => tagButton(label, count)).join("")
    : `<span class="muted-text">신호 없음</span>`;
}

function renderActiveTag() {
  const container = $("#activeTag");
  if (!container) return;
  const label = state.issue ? `브리핑: ${state.issue}` : state.tag ? `태그 검색: ${state.tag}` : state.search ? `검색: ${state.search}` : "";
  container.innerHTML = label
    ? `<button class="active-tag" type="button" id="clearTagBtn">${escapeHtml(label)} ×</button>`
    : `<span class="muted-text">핵심신호 태그를 누르면 관련 이슈만 볼 수 있습니다.</span>`;
}

function renderBriefing(data) {
  $("#briefDate").textContent = data.briefing.date;
  const filtered = data.news.articles.filter(articleMatches);
  const groups = groupByIssue(filtered).slice(0, 3);
  const summary = groups.length
    ? groups.map((group) => ({ issue: group.name, title: group.items[0].title, count: group.items.length }))
    : data.briefing.summary.map((title) => ({ issue: "", title, count: null }));

  $("#summaryList").innerHTML = summary.slice(0, 3).map((item) => `
    <button class="brief-line" type="button" ${item.issue ? `data-brief-issue="${escapeHtml(item.issue)}"` : ""}>
      <span>${item.issue ? `${escapeHtml(item.issue)}${item.count ? ` · ${item.count}건` : ""}` : "요약"}</span>
      <strong>${escapeHtml(item.title)}</strong>
    </button>
  `).join("");
  renderChips($("#techSignals"), data.briefing.signals.technologies, 8);
  renderChips($("#companySignals"), data.briefing.signals.companies, 8);
}

function renderSelectors(data) {
  const articles = data.news.articles;
  const months = [...new Set(articles.map((article) => monthKey(article.publishedAt)))].filter(Boolean).sort().reverse();
  const dateCounts = new Map();
  for (const article of articles) {
    if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) continue;
    const key = dayKey(article.publishedAt);
    dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
  }
  const dates = calendarDaysForSelection(months);

  $("#monthSelect").innerHTML = [`<option value="all">전체 월</option>`, ...months.map((key) => (
    `<option value="${key}" ${state.month === key ? "selected" : ""}>${monthLabel(key)}</option>`
  ))].join("");

  if (state.date !== "all" && !dates.includes(state.date)) state.date = "all";
  $("#dateSelect").innerHTML = [`<option value="all">전체 일자</option>`, ...dates.map((key) => (
    `<option value="${key}" ${state.date === key ? "selected" : ""}>${dayLabel(key)} (${dateCounts.get(key) || 0})</option>`
  ))].join("");
}

function calendarDaysForSelection(months) {
  const today = new Date();
  const targetMonth = state.month === "all" ? months[0] : state.month;
  if (!targetMonth || targetMonth === "unknown") return [];
  const [year, month] = targetMonth.split("-").map(Number);
  const lastDay = today.getFullYear() === year && today.getMonth() + 1 === month
    ? today.getDate()
    : new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const day = lastDay - index;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

function renderIssues(data) {
  const articles = data.news.articles.filter(articleMatches);
  const groups = groupByIssue(articles).slice(0, 12);
  $("#issueList").innerHTML = groups.length
    ? groups.map((group) => {
        const topTags = [...new Set(group.items.flatMap((item) => [...(item.taxonomyHits || []), ...(item.companyHits || [])]))].slice(0, 8);
        const lead = group.items[0];
        return `
          <article class="issue-card">
            <div class="issue-head">
              <div>
                <p class="issue-date">${dayLabel(dayKey(lead.publishedAt))} · 기사 ${group.items.length}건</p>
                <h3>${escapeHtml(group.name)}</h3>
              </div>
              <div class="chips">${topTags.map((tag) => tagButton(tag, null, "pale")).join("")}</div>
            </div>
            <p class="issue-summary">${escapeHtml(cleanSummary(lead.summary))}</p>
            <div class="article-stack">
              ${group.items.slice(0, 6).map((article) => `
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
  $("#policyIdeas").innerHTML = data.briefing.policyIdeas.map((idea, index) => `
    <article class="policy-card">
      <div class="policy-top">
        <button class="policy-title" type="button" data-policy-index="${index}">${escapeHtml(idea.title)}</button>
        <span class="priority">우선순위 ${escapeHtml(idea.priority)}</span>
      </div>
      <p><strong>비R&D 예산화</strong>${escapeHtml(idea.budgetItem)}</p>
      <p><strong>추진 근거</strong>${escapeHtml(idea.why)}</p>
      <p><strong>관리 KPI</strong>${escapeHtml(idea.kpi)}</p>
    </article>
  `).join("");
}

function openPolicyModal(index) {
  const idea = state.data?.briefing?.policyIdeas?.[index];
  if (!idea) return;
  $("#policyModalTitle").textContent = idea.title;
  $("#policyModalBody").innerHTML = `
    <dl>
      <div><dt>사업유형</dt><dd>비R&D 수요창출·실증·조달 연계 사업</dd></div>
      <div><dt>대상</dt><dd>국내 NPU 기업, AI 서비스 기업, 공공·민간 수요기관</dd></div>
      <div><dt>예산화 방향</dt><dd>${escapeHtml(idea.budgetItem)}</dd></div>
      <div><dt>추진 근거</dt><dd>${escapeHtml(idea.why)}</dd></div>
      <div><dt>주요 KPI</dt><dd>${escapeHtml(idea.kpi)}</dd></div>
      <div><dt>1차 실행안</dt><dd>수요기관 모집 → 국산 NPU 매칭 → 8-12주 PoC → 성능·전력 검증 → 구매전환 또는 후속 실증으로 연결</dd></div>
    </dl>
  `;
  $("#policyModal").hidden = false;
}

function closePolicyModal() {
  $("#policyModal").hidden = true;
}

function candleChart(candles = []) {
  const data = candles.slice(-20);
  if (data.length < 2) return `<div class="candle-chart empty-spark"></div>`;
  const highs = data.map((item) => item.high);
  const lows = data.map((item) => item.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  const width = 180;
  const height = 76;
  const slot = width / data.length;
  const bodyWidth = Math.max(3, Math.min(7, slot * 0.52));
  const y = (value) => height - 8 - ((value - min) / range) * (height - 16);
  const candlesSvg = data.map((item, index) => {
    const x = index * slot + slot / 2;
    const openY = y(item.open);
    const closeY = y(item.close);
    const highY = y(item.high);
    const lowY = y(item.low);
    const up = item.close >= item.open;
    const color = up ? "var(--up)" : "var(--down)";
    const bodyY = Math.min(openY, closeY);
    const bodyH = Math.max(2, Math.abs(closeY - openY));
    return `
      <line x1="${x.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${x.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${color}" stroke-width="1.2"></line>
      <rect x="${(x - bodyWidth / 2).toFixed(2)}" y="${bodyY.toFixed(2)}" width="${bodyWidth.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="1" fill="${color}"></rect>
    `;
  }).join("");
  return `
    <svg class="candle-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="최근 20거래일 일봉 차트">
      <line x1="0" y1="${height - 8}" x2="${width}" y2="${height - 8}" stroke="#d9e0e8" stroke-width="1"></line>
      ${candlesSvg}
    </svg>
  `;
}

function marketCard(item) {
  const trendClass = item.changePct > 0 ? "up" : item.changePct < 0 ? "down" : "";
  return `
    <article class="market-card ${trendClass}">
      <div class="market-top">
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          <span>${escapeHtml(item.symbol)}${item.market ? ` · ${escapeHtml(item.market)}` : ""}</span>
        </div>
        <strong>${item.error ? "-" : formatPct(item.changePct)}</strong>
      </div>
      ${candleChart(item.candles || [])}
      <div class="market-bottom">
        <span>${item.error ? "수집 실패" : formatNumber(item.price, item.currency)}</span>
        <small>${item.error ? escapeHtml(item.error) : "최근 20거래일 일봉"}</small>
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
  renderActiveTag();
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

document.addEventListener("click", (event) => {
  const tag = event.target.closest("[data-tag]");
  if (tag) {
    state.tag = tag.dataset.tag;
    state.issue = "";
    state.search = "";
    $("#searchInput").value = "";
    state.view = "briefing";
    $$(".view-tab").forEach((item) => item.classList.toggle("active", item.dataset.view === "briefing"));
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === "briefingView"));
    render();
    return;
  }
  if (event.target.closest("#clearTagBtn")) {
    state.tag = "";
    state.issue = "";
    state.search = "";
    $("#searchInput").value = "";
    render();
    return;
  }
  const brief = event.target.closest("[data-brief-issue]");
  if (brief) {
    state.issue = brief.dataset.briefIssue;
    state.tag = "";
    state.search = "";
    $("#searchInput").value = "";
    render();
    $("#issueList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const policy = event.target.closest("[data-policy-index]");
  if (policy) {
    openPolicyModal(Number(policy.dataset.policyIndex));
  }
});

$("#policyModalClose").addEventListener("click", closePolicyModal);
$("#policyModal").addEventListener("click", (event) => {
  if (event.target.id === "policyModal") closePolicyModal();
});

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
    state.issue = "";
    render();
  });
});

$("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  state.tag = "";
  state.issue = "";
  render();
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
