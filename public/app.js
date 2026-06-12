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
  "정책",
  "AI시장",
  "NPU",
  "AI인프라",
  "데이터센터",
  "온디바이스AI",
  "인퍼런스",
  "AI에이전트",
  "K-엔비디아",
  "NVIDIA",
  "Google",
  "파운드리·패키징",
  "수출통제·공급망",
  "투자·M&A",
  "실증·조달",
];

const searchAliases = {
  구글: ["구글", "google", "alphabet", "알파벳", "gemini", "제미나이", "deepmind", "딥마인드", "tpu"],
  google: ["google", "구글", "alphabet", "알파벳", "gemini", "제미나이", "deepmind", "딥마인드", "tpu"],
  알파벳: ["alphabet", "알파벳", "google", "구글"],
  alphabet: ["alphabet", "알파벳", "google", "구글"],
  제미나이: ["gemini", "제미나이", "google", "구글"],
  gemini: ["gemini", "제미나이", "google", "구글"],
  딥마인드: ["deepmind", "딥마인드", "google", "구글"],
  deepmind: ["deepmind", "딥마인드", "google", "구글"],
  엔비디아: ["엔비디아", "nvidia", "nvda", "blackwell", "블랙웰", "rubin", "루빈", "cuda", "쿠다", "gpu"],
  nvidia: ["nvidia", "엔비디아", "nvda", "blackwell", "블랙웰", "rubin", "루빈", "cuda", "쿠다", "gpu"],
  nvda: ["nvda", "nvidia", "엔비디아"],
  블랙웰: ["blackwell", "블랙웰", "nvidia", "엔비디아"],
  루빈: ["rubin", "루빈", "nvidia", "엔비디아"],
  쿠다: ["cuda", "쿠다", "nvidia", "엔비디아"],
  과기정통부: ["과기정통부", "과학기술정보통신부", "msit", "정책", "보도자료"],
  과학기술정보통신부: ["과학기술정보통신부", "과기정통부", "msit", "정책", "보도자료"],
  nipa: ["nipa", "정보통신산업진흥원", "정책", "사업공고", "지원사업"],
  정보통신산업진흥원: ["정보통신산업진흥원", "nipa", "정책", "사업공고", "지원사업"],
};

const domesticNpuCompanies = ["리벨리온", "퓨리오사AI", "하이퍼엑셀", "딥엑스", "모빌린트"];
const marketIssueTerms = ["시장", "매출", "실적", "수요", "공급", "투자", "상장", "인수", "합병", "주가", "밸류에이션", "기업가치", "자금조달", "펀딩", "고객", "계약", "수주", "market", "revenue", "earnings", "sales", "demand", "supply", "forecast", "outlook", "guidance", "investment", "funding", "valuation", "ipo", "m&a", "acquisition", "merger", "shares", "stock", "capex", "orders", "customer", "contract", "tsmc", "broadcom", "amd", "arm", "micron"];
const policyOrgTerms = ["과기정통부", "과학기술정보통신부", "nipa", "정보통신산업진흥원", "iitp", "정보통신기획평가원", "정부", "부처", "ministry", "government", "white house"];
const policyActionTerms = ["정책", "예산", "사업공고", "지원사업", "공모", "보도자료", "조달", "규제", "수출통제", "보조금", "지원", "선정", "실증사업", "policy", "subsidy", "regulation", "export control", "sanction", "procurement", "chips act"];

function countTermHits(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
}

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

function articleContentText(article) {
  return `${article.title} ${article.summary}`.toLowerCase();
}

function articleMatches(article, options = {}) {
  const haystack = articleText(article);
  if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) return false;
  if (state.date !== "all" && dayKey(article.publishedAt) !== state.date) return false;
  if (state.tag && !haystack.includes(state.tag.toLowerCase())) return false;
  if (!options.ignoreIssue && state.issue && issueName(article) !== state.issue) return false;
  if (state.search) {
    const terms = expandSearchTerms(state.search);
    if (!terms.every((group) => group.some((term) => haystack.includes(term)))) return false;
  }
  if (state.filter === "all") return true;
  if (state.filter === "domestic") return /국내|korea|리벨리온|퓨리오사|하이퍼엑셀|딥엑스|모빌린트|삼성|하이닉스|k-엔비디아/.test(haystack);
  if (state.filter === "global") return /해외|global|nvidia|엔비디아|google|구글|alphabet|알파벳|gemini|제미나이|deepmind|딥마인드|amd|broadcom|tsmc|arm|micron/.test(haystack);
  if (state.filter === "policy") return issueName(article) === "정책";
  if (state.filter === "market") return issueName(article) === "AI시장" || /시장|market|investment|funding|ipo|datacenter|데이터센터|투자|valuation|earnings|spending|revenue|매출|실적|수요|주가|계약|수주|capex|forecast|outlook/.test(haystack);
  return true;
}

function expandSearchTerms(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => searchAliases[term] || [term]);
}

function issueName(article) {
  if (article.issueCategory) return article.issueCategory;
  const text = articleContentText(article);
  const taxonomy = new Set(article.taxonomyHits || []);
  const companies = new Set(article.companyHits || []);
  const policyOrgScore = countTermHits(text, policyOrgTerms);
  const policyActionScore = countTermHits(text, policyActionTerms);
  const marketScore = countTermHits(text, marketIssueTerms);
  const hasDomesticNpuCompany = domesticNpuCompanies.some((company) => companies.has(company) || text.includes(company.toLowerCase()));
  const strongPolicy = policyActionScore >= 2 || (policyOrgScore >= 1 && policyActionScore >= 1);

  if (marketScore >= 2 && !strongPolicy) return "AI시장";
  if (hasDomesticNpuCompany) return "NPU";
  if (marketScore >= 1 || taxonomy.has("AI시장") || taxonomy.has("투자·M&A")) return "AI시장";
  if (strongPolicy || (taxonomy.has("정책") && policyOrgScore >= 1 && policyActionScore >= 1)) return "정책";
  if (taxonomy.has("NPU") || taxonomy.has("K-엔비디아")) return "NPU";
  const hit = [...taxonomy].find((item) => issueOrder.includes(item));
  if (hit) return hit;
  if (/npu|ai반도체|인공지능 반도체|신경망처리장치/.test(text)) return "NPU";
  if (/datacenter|data center|데이터센터|rack|liquid cooling|냉각/.test(text)) return "데이터센터";
  if (/ai infrastructure|ai compute|accelerated computing|클라우드|ai 컴퓨팅|가속 컴퓨팅/.test(text)) return "AI인프라";
  if (/edge ai|on-device|온디바이스|ai pc|스마트폰|엣지/.test(text)) return "온디바이스AI";
  if (/ai market|ai adoption|생성형|인공지능 서비스|enterprise ai/.test(text)) return "AI시장";
  if (/정책|policy|export|subsidy|예산|조달|과기정통부|과학기술정보통신부|nipa|정보통신산업진흥원|iitp|정보통신기획평가원|보도자료|사업공고|지원사업|공모/.test(text)) return "정책";
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
                <button class="issue-title" type="button" data-issue-modal="${escapeHtml(group.name)}">${escapeHtml(group.name)}</button>
              </div>
              <div class="chips">${topTags.map((tag) => tagButton(tag, null, "pale")).join("")}</div>
            </div>
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

function openIssueModal(issue) {
  const articles = state.data?.news?.articles
    ?.filter((article) => articleMatches(article, { ignoreIssue: true }) && issueName(article) === issue)
    ?.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)) || [];
  if (!articles.length) return;
  $("#issueModalTitle").textContent = issue;
  $("#issueModalCount").textContent = `기사 ${articles.length}건`;
  $("#issueModalBody").innerHTML = `
    <div class="modal-article-list">
      ${articles.slice(0, 30).map((article) => `
        <a class="modal-article" href="${article.link}" target="_blank" rel="noreferrer">
          <span class="modal-article-title">${escapeHtml(article.title)}</span>
          <span class="modal-article-meta">${escapeHtml(article.outlet)} · ${formatDate(article.publishedAt, { short: true })}</span>
        </a>
      `).join("")}
    </div>
  `;
  $("#issueModal").hidden = false;
}

function closeIssueModal() {
  $("#issueModal").hidden = true;
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
    return;
  }
  const issue = event.target.closest("[data-issue-modal]");
  if (issue) {
    openIssueModal(issue.dataset.issueModal);
  }
});

$("#policyModalClose").addEventListener("click", closePolicyModal);
$("#policyModal").addEventListener("click", (event) => {
  if (event.target.id === "policyModal") closePolicyModal();
});
$("#issueModalClose").addEventListener("click", closeIssueModal);
$("#issueModal").addEventListener("click", (event) => {
  if (event.target.id === "issueModal") closeIssueModal();
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
