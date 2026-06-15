const state = {
  data: null,
  filter: "all",
  month: "all",
  date: "all",
  tag: "",
  issue: "",
  search: "",
  view: "briefing",
  policyIdeas: null,
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
  "추론",
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

const policyCandidateIdeas = [
  {
    title: "국산 NPU 전환 컨설팅 바우처",
    trigger: "수요 전환",
    budgetItem: "AI 서비스 기업의 GPU 워크로드를 진단하고 국산 NPU 전환 가능성, 비용, 성능, 일정 설계를 지원",
    why: "수요기업은 어떤 모델과 서비스가 국산 NPU에 맞는지 판단하기 어렵습니다. 초기 진단비를 낮추면 PoC 진입 장벽이 줄어듭니다.",
    kpi: "전환진단 보고서 수, PoC 착수율, 예상 비용절감률, 전환 대상 워크로드 수",
    priority: "상",
  },
  {
    title: "공공 AI서비스 국산 NPU 우선 실증 트랙",
    trigger: "공공 실증",
    budgetItem: "민원, 문서요약, 보안관제, 콜센터 등 공공 AI서비스 일부를 국산 NPU 기반으로 운영 검증",
    why: "비R&D 사업은 실제 운영 레퍼런스를 만드는 데 강점이 있습니다. 공공 수요는 초기 신뢰 확보에 특히 유효합니다.",
    kpi: "공공 워크로드 수, 월간 사용시간, 운영비 절감률, 후속 구매전환 건수",
    priority: "상",
  },
  {
    title: "AI 서비스·NPU 공동 가격표준 파일럿",
    trigger: "시장 형성",
    budgetItem: "국산 NPU 추론 서비스의 과금 단위, SLA, 성능 기준, 견적 템플릿을 수요기업과 공동 검증",
    why: "수요기업은 가격과 성능을 비교할 기준이 부족합니다. 표준 견적 체계가 생기면 구매 의사결정이 빨라집니다.",
    kpi: "표준 견적 발급 건수, 유료 전환율, 평균 견적 소요기간, 고객 재문의율",
    priority: "중",
  },
  {
    title: "K-NPU 해외 레퍼런스 쇼케이스",
    trigger: "해외진출",
    budgetItem: "해외 클라우드, SI, AI 서비스 기업을 대상으로 공동 데모, 현지 PoC, 벤치마크 리포트 제작 지원",
    why: "국내 기업의 해외 매출 전환에는 신뢰 가능한 현지 레퍼런스가 필요합니다. 전시보다 검증자료 중심 지원이 효과적입니다.",
    kpi: "해외 PoC 수, MOU·계약 건수, 벤치마크 다운로드 수, 후속 투자상담 건수",
    priority: "중",
  },
  {
    title: "온디바이스 AI 수요처 매칭 챌린지",
    trigger: "온디바이스AI",
    budgetItem: "제조, 모빌리티, 의료기기, 보안 분야 수요처와 국내 NPU 기업을 매칭해 현장형 실증비 지원",
    why: "온디바이스 AI는 데이터 반출 제한과 저전력 요구가 명확한 영역에서 시장성이 높습니다.",
    kpi: "매칭 수요처 수, 제품 탑재 건수, 지연시간 개선, 전력 절감률",
    priority: "중",
  },
  {
    title: "국산 AI컴퓨팅 인증·성능 리포트 사업",
    trigger: "성능검증",
    budgetItem: "제3자 시험기관을 통해 추론 성능, 전력효율, 호환성, 보안성 검증 리포트를 발급",
    why: "구매자는 홍보자료보다 검증된 비교 데이터를 요구합니다. 인증형 리포트는 조달과 민간 구매의 공통 근거가 됩니다.",
    kpi: "인증 제품 수, 공개 벤치마크 수, 인증 기반 계약액, 조달 등록 건수",
    priority: "상",
  },
  {
    title: "AI 데이터센터 전력절감 구매연계 실증",
    trigger: "데이터센터",
    budgetItem: "데이터센터 일부 추론 워크로드를 국산 NPU로 이전하고 전력, 냉각, 운영비 절감 효과를 측정",
    why: "AI 인프라 비용과 전력 이슈가 커지면서 국산 NPU의 경제성 검증 수요가 커지고 있습니다.",
    kpi: "전력 절감률, 랙당 처리량, 운영비 절감액, 구매전환 워크로드 수",
    priority: "상",
  },
  {
    title: "NPU 친화형 AI서비스 크레딧",
    trigger: "AI시장",
    budgetItem: "AI 서비스 기업이 국산 NPU 기반 추론 API나 클라우드 자원을 구매할 수 있는 사용권 지원",
    why: "서비스 기업의 초기 전환비를 낮춰야 AI 시장 수요가 국내 NPU 매출로 연결됩니다.",
    kpi: "크레딧 사용 기업 수, 국산 NPU 사용액, 서비스 출시 건수, 월간 추론 처리량",
    priority: "상",
  },
  {
    title: "국산 NPU 조달 카탈로그 고도화",
    trigger: "조달",
    budgetItem: "공공기관이 국산 AI컴퓨팅을 쉽게 구매할 수 있도록 제품·서비스 카탈로그, 가격 기준, 구매 가이드 마련",
    why: "조달 규격과 가격 기준이 불명확하면 실제 구매로 이어지기 어렵습니다.",
    kpi: "카탈로그 등록 제품 수, 조달 등록 건수, 공공 구매액, 구매 리드타임 단축률",
    priority: "중",
  },
  {
    title: "AI반도체 수요기업 운영인력 전환 교육",
    trigger: "운영역량",
    budgetItem: "MLOps, 인프라 운영, 모델 최적화 담당자를 대상으로 국산 NPU 적용 교육과 실습 환경 제공",
    why: "도입은 하드웨어 구매만으로 끝나지 않습니다. 운영인력이 있어야 반복 사용과 확산이 가능합니다.",
    kpi: "교육 수료자 수, 기업별 적용 프로젝트 수, 모델 전환 성공률, 교육 후 PoC 착수율",
    priority: "중",
  },
  {
    title: "국산 NPU 금융·보안 특화 레퍼런스",
    trigger: "고신뢰 수요",
    budgetItem: "금융, 보안, 공공 데이터처럼 외부 전송 제한이 큰 워크로드를 대상으로 폐쇄망 실증 지원",
    why: "민감 데이터 영역은 온프레미스·저전력 국산 NPU의 차별점이 뚜렷합니다.",
    kpi: "폐쇄망 실증 수, 보안성 검증 통과율, 도입기관 수, 운영비 절감률",
    priority: "중",
  },
  {
    title: "K-엔비디아 공동 영업자료 패키지",
    trigger: "시장 접점",
    budgetItem: "5개 NPU 기업의 제품별 적용 분야, 성능, 가격, 도입 절차를 비교 가능한 공동 영업자료로 제작",
    why: "수요기업 입장에서는 기업별 정보를 따로 확인하는 비용이 큽니다. 비교 가능한 자료가 있어야 상담 전환이 쉬워집니다.",
    kpi: "자료 배포 수, 상담 신청 건수, 공동 데모 요청 수, PoC 전환율",
    priority: "중",
  },
];

const policyDomains = [
  { name: "공공 AI서비스", target: "민원, 문서요약, 보안관제, 콜센터 등 공공 AI서비스", reason: "공공 부문은 초기 레퍼런스를 만들고 조달 전환까지 연결하기 쉽습니다.", signal: "정책" },
  { name: "AI 데이터센터", target: "민간·공공 데이터센터의 추론 워크로드", reason: "전력비와 냉각비 절감은 국산 NPU 도입의 가장 직접적인 경제성 근거입니다.", signal: "데이터센터" },
  { name: "온디바이스 산업현장", target: "제조, 모빌리티, 보안, 의료기기 현장의 온디바이스 AI", reason: "데이터 반출 제한과 저전력 요구가 있는 현장은 국산 NPU의 차별점이 명확합니다.", signal: "온디바이스AI" },
  { name: "금융·보안 폐쇄망", target: "금융, 보안, 공공기관의 폐쇄망 AI 워크로드", reason: "민감 데이터 환경은 해외 클라우드 GPU보다 국내 통제 가능한 AI컴퓨팅 수요가 큽니다.", signal: "수출통제·공급망" },
  { name: "AI 서비스기업", target: "SaaS, SI, 생성형 AI 서비스 기업의 추론 API 사용 수요", reason: "서비스 기업의 초기 전환비를 낮춰야 AI 시장 수요가 국내 NPU 매출로 연결됩니다.", signal: "AI시장" },
  { name: "중소 클라우드·IDC", target: "중소 클라우드와 IDC의 GPU 대체·보완 워크로드", reason: "대형 GPU 확보가 어려운 사업자에게 비용 효율형 AI컴퓨팅 대안이 필요합니다.", signal: "AI인프라" },
  { name: "해외 PoC 거점", target: "해외 클라우드, SI, AI서비스 파트너의 현지 검증 수요", reason: "국내 시장만으로는 스케일업이 어려우므로 해외 고객 접점과 검증자료가 필요합니다.", signal: "투자·M&A" },
  { name: "조달 후보 업무", target: "공공기관이 반복 구매 가능한 AI 추론·검색·요약 업무", reason: "반복 구매 가능한 업무를 먼저 정의해야 조달 카탈로그와 단가 기준을 만들 수 있습니다.", signal: "실증·조달" },
];

const policyMechanisms = [
  { name: "구매전환 바우처", action: "PoC 비용과 초기 구매비를 함께 지원", kpi: "유료 전환율, 구매계약액, 국산 NPU 사용시간" },
  { name: "성능검증 인증", action: "제3자 시험기관을 통해 성능, 전력효율, 보안성, 호환성을 검증", kpi: "인증 제품 수, 공개 벤치마크 수, 인증 기반 계약액" },
  { name: "운영비 절감 실증", action: "기존 GPU 대비 전력, 냉각, 운영비 절감 효과를 실제 워크로드에서 측정", kpi: "전력 절감률, 랙당 처리량, 운영비 절감액" },
  { name: "조달 카탈로그", action: "제품·서비스 사양, 가격 기준, SLA, 구매 가이드를 표준화", kpi: "카탈로그 등록 수, 조달 등록 건수, 구매 리드타임" },
  { name: "수요처 매칭 트랙", action: "수요기업과 NPU 기업을 매칭하고 8-12주 단기 실증을 지원", kpi: "매칭 건수, PoC 착수율, 후속 상담 건수" },
  { name: "전환 컨설팅", action: "GPU 워크로드를 진단하고 NPU 전환 가능성, 비용, 일정, 리스크를 설계", kpi: "전환진단 보고서 수, PoC 전환율, 예상 비용절감률" },
  { name: "해외 레퍼런스 패키지", action: "현지 PoC, 공동 데모, 벤치마크 리포트, 계약 컨설팅을 묶어 지원", kpi: "해외 PoC 수, MOU·계약 건수, 후속 투자상담 건수" },
  { name: "운영인력 전환교육", action: "MLOps, 모델 최적화, NPU 운영 담당자 교육과 실습환경을 제공", kpi: "수료자 수, 모델 전환 성공률, 교육 후 PoC 착수율" },
];

function hashString(value = "") {
  let hash = 0;
  for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

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

const autoRefreshSlots = [
  { hour: 7, minute: 10 },
  { hour: 10, minute: 10 },
  { hour: 13, minute: 10 },
  { hour: 16, minute: 10 },
  { hour: 19, minute: 10 },
  { hour: 22, minute: 10 },
];

function formatClock(value) {
  const date = asDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(date);
}

function getKstClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value || 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value || 0),
  };
}

function formatRefreshSlot(slot) {
  return `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
}

function nextAutoRefreshLabel(now = new Date()) {
  const { hour, minute } = getKstClock(now);
  const currentMinutes = hour * 60 + minute;
  const nextSlot = autoRefreshSlots.find((slot) => slot.hour * 60 + slot.minute > currentMinutes);
  return nextSlot ? formatRefreshSlot(nextSlot) : `내일 ${formatRefreshSlot(autoRefreshSlots[0])}`;
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
  return `${article.source} ${article.title} ${article.summary} ${article.fullSummary || ""} ${article.fullText || ""} ${(article.taxonomyHits || []).join(" ")} ${(article.companyHits || []).join(" ")}`.toLowerCase();
}

function articleContentText(article) {
  return `${article.title} ${article.summary} ${article.fullSummary || ""} ${article.fullText || ""}`.toLowerCase();
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
  if (state.filter === "domestic") return article.region === "domestic" || (!article.region && article.sourceLang === "ko");
  if (state.filter === "global") return article.region === "global" || (!article.region && article.sourceLang === "en");
  if (state.filter === "policy") return issueName(article) === "정책";
  if (state.filter === "market") return issueName(article) === "AI시장";
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

function weeklyAnalysisSectionBody(section) {
  return `<p>${escapeHtml(section.body)}</p>`;
}

function openWeeklyAnalysisModal(index) {
  const topIssues = weeklyIssueBriefing(state.data);
  const article = topIssues[index];
  if (!article) return;
  const sections = weeklyArticleAnalysis(article);
  const isGlobal = weeklyRegion(article) === "global";
  const sourceMeta = `${issueName(article)} · ${article.source} · ${formatDate(article.publishedAt, { short: true })}`;
  $("#weeklyAnalysisKicker").textContent = isGlobal ? `${sourceMeta} · 외신 제목 번역` : sourceMeta;
  $("#weeklyAnalysisTitle").textContent = weeklyDisplayTitle(article);
  $("#weeklyAnalysisBody").innerHTML = `
    <div class="weekly-modal-meta">
      <a href="${escapeHtml(article.link)}" target="_blank" rel="noreferrer">원문 기사 보기</a>
      ${(article.taxonomyHits || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
    </div>
    <div class="weekly-analysis-grid weekly-modal-grid">
      ${sections.map((section) => `
        <section>
          <h4>${escapeHtml(section.title)}</h4>
          ${weeklyAnalysisSectionBody(section)}
        </section>
      `).join("")}
    </div>
  `;
  $("#weeklyAnalysisModal").hidden = false;
}

function closeWeeklyAnalysisModal() {
  $("#weeklyAnalysisModal").hidden = true;
}

function policyStorageKey(data = state.data) {
  const day = dayKey(data?.generatedAt || new Date().toISOString());
  return `daily-desk-policy-ideas:${day}`;
}

function loadSavedPolicyIdeas(data) {
  try {
    const raw = localStorage.getItem(policyStorageKey(data));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved?.ideas)) return null;
    if (saved.ideas.length !== data.briefing.policyIdeas.length) return null;
    return saved.ideas.map((idea) => ({ ...idea }));
  } catch {
    return null;
  }
}

function savePolicyIdeas() {
  if (!state.data || !state.policyIdeas) return;
  try {
    localStorage.setItem(policyStorageKey(), JSON.stringify({
      savedAt: new Date().toISOString(),
      ideas: state.policyIdeas,
    }));
  } catch {
    // 저장이 막힌 환경에서는 현재 화면 상태만 유지합니다.
  }
}

function currentPolicyIdeas(data = state.data) {
  if (!state.policyIdeas && data?.briefing?.policyIdeas) {
    state.policyIdeas = loadSavedPolicyIdeas(data) || data.briefing.policyIdeas.map((idea) => ({ ...idea }));
  }
  return state.policyIdeas || [];
}

function replacementPolicyIdea(index, usedTitles = new Set(currentPolicyIdeas().map((idea) => idea.title))) {
  const signalTags = new Set(state.data?.briefing?.signals?.technologies?.filter(([, count]) => count > 0).map(([label]) => label) || []);
  const marketCount = state.data?.news?.articles?.filter((article) => issueName(article) === "AI시장").length || 0;
  const base = [
    state.data?.generatedAt,
    [...signalTags].join("|"),
    marketCount,
    index,
    Date.now(),
    usedTitles.size,
  ].join(":");
  let seed = hashString(base);
  for (let attempt = 0; attempt < policyDomains.length * policyMechanisms.length; attempt += 1) {
    const preferredDomains = policyDomains.filter((domain) => signalTags.has(domain.signal));
    const domains = preferredDomains.length ? preferredDomains : policyDomains;
    const domain = domains[(seed + attempt) % domains.length];
    const mechanism = policyMechanisms[(Math.floor(seed / 7) + attempt) % policyMechanisms.length];
    const title = `${domain.name} ${mechanism.name}`;
    if (usedTitles.has(title) && attempt < policyDomains.length * policyMechanisms.length - 1) continue;
    return {
      title,
      trigger: domain.signal,
      budgetItem: `${domain.target}을 대상으로 ${mechanism.action}하는 비R&D 패키지 사업`,
      why: `${domain.reason} ${mechanism.name} 방식은 구매자 리스크를 낮추고 실증 결과를 계약·조달 근거로 전환하기 쉽습니다.`,
      kpi: mechanism.kpi,
      priority: signalTags.has(domain.signal) || marketCount > 40 ? "상" : "중",
    };
  }
  return { ...policyCandidateIdeas[(seed + index) % policyCandidateIdeas.length] };
}

function regenerateSelectedPolicies() {
  const selected = $$(".policy-check:checked").map((item) => Number(item.dataset.policyCheck));
  if (!selected.length) return;
  const ideas = currentPolicyIdeas().map((idea) => ({ ...idea }));
  const usedTitles = new Set(ideas.map((idea) => idea.title));
  for (const index of selected) {
    if (Number.isInteger(index) && ideas[index]) {
      usedTitles.delete(ideas[index].title);
      ideas[index] = replacementPolicyIdea(index, usedTitles);
      usedTitles.add(ideas[index].title);
    }
  }
  state.policyIdeas = ideas;
  savePolicyIdeas();
  renderPolicyIdeas(state.data);
}

function renderPolicyIdeas(data) {
  const ideas = currentPolicyIdeas(data);
  $("#policyIdeas").innerHTML = ideas.map((idea, index) => `
    <article class="policy-card">
      <div class="policy-top">
        <label class="policy-check-label">
          <input class="policy-check" type="checkbox" data-policy-check="${index}">
          <span>교체</span>
        </label>
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
  const idea = currentPolicyIdeas()[index];
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

const weeklyIssueStopwords = new Set([
  "ai",
  "the",
  "and",
  "for",
  "with",
  "from",
  "news",
  "weekly",
  "issue",
  "국내",
  "해외",
  "기자",
  "관련",
  "이번",
  "지난",
  "통해",
  "대한",
  "위한",
  "시장",
  "기업",
  "산업",
  "반도체",
  "이슈",
  "투자",
  "확대",
]);

function weeklyIssueTerms(article) {
  const raw = `${article.title || ""} ${article.summary || ""}`
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/, " ");
  const terms = new Set(
    (raw.match(/[a-z0-9]{2,}|[가-힣]{2,}/g) || [])
      .map((term) => term.trim())
      .filter((term) => term.length >= 2 && !weeklyIssueStopwords.has(term)),
  );

  for (const tag of [...(article.taxonomyHits || []), ...(article.companyHits || [])]) {
    const normalized = String(tag).toLowerCase().replace(/\s+/g, "");
    if (normalized && !weeklyIssueStopwords.has(normalized)) terms.add(normalized);
  }
  return terms;
}

function countSharedItems(left = [], right = [], ignored = new Set()) {
  const rightSet = new Set(right.filter((item) => !ignored.has(item)));
  return left.filter((item) => !ignored.has(item) && rightSet.has(item)).length;
}

function termOverlapRatio(leftTerms, rightTerms) {
  if (!leftTerms?.size || !rightTerms?.size) return 0;
  let shared = 0;
  for (const term of leftTerms) {
    if (rightTerms.has(term)) shared += 1;
  }
  return shared / Math.min(leftTerms.size, rightTerms.size);
}

function isSameWeeklyIssue(article, selected) {
  const titleKey = article.title.replace(/\s+-\s+[^-]+$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const selectedTitleKey = selected.title.replace(/\s+-\s+[^-]+$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (titleKey === selectedTitleKey) return true;

  const overlap = termOverlapRatio(article.weeklyTerms, selected.weeklyTerms);
  const sharedCompanies = countSharedItems(article.companyHits || [], selected.companyHits || []);
  const sharedTaxonomy = countSharedItems(article.taxonomyHits || [], selected.taxonomyHits || [], new Set(["AI시장"]));
  const sameCategory = issueName(article) === issueName(selected);

  if (overlap >= 0.58) return true;
  if (sameCategory && sharedCompanies >= 2 && overlap >= 0.36) return true;
  if (sameCategory && sharedCompanies >= 1 && overlap >= 0.48) return true;
  if (sameCategory && sharedTaxonomy >= 2 && overlap >= 0.42) return true;
  return false;
}

function weeklyRegion(article) {
  return article.region === "domestic" || (!article.region && article.sourceLang === "ko") ? "domestic" : "global";
}

function selectBalancedWeeklyIssues(articles, limit = 7) {
  const targets = { domestic: Math.ceil(limit / 2), global: Math.floor(limit / 2) };
  const counts = { domestic: 0, global: 0 };
  const selected = [];

  for (const article of articles) {
    const region = weeklyRegion(article);
    if (counts[region] >= targets[region]) continue;
    if (selected.some((item) => isSameWeeklyIssue(article, item))) continue;
    selected.push(article);
    counts[region] += 1;
    if (selected.length >= limit) return selected;
  }

  for (const article of articles) {
    if (selected.includes(article)) continue;
    if (selected.some((item) => isSameWeeklyIssue(article, item))) continue;
    selected.push(article);
    if (selected.length >= limit) break;
  }
  return selected;
}

function translateForeignTitle(title = "") {
  const cleanTitle = title.replace(/\s+-\s+[^-]+$/, "").replace(/\s+/g, " ").trim();
  if (!cleanTitle || /[가-힣]/.test(cleanTitle)) return cleanTitle || title;

  const lower = cleanTitle.toLowerCase();
  if (lower.includes("nvidia accelerates google deepmind") && lower.includes("diffusiongemma")) {
    return "엔비디아, 구글 딥마인드의 로컬 AI용 DiffusionGemma 가속";
  }
  if (lower.includes("ai infrastructure spending") && lower.includes("700 billion")) {
    return "AI 인프라 지출, 2026년 7,000억 달러 돌파 전망";
  }
  if (lower.includes("nvidia pitches arm-based vera cpus") && lower.includes("chinese clients")) {
    return "엔비디아, 중국 고객에 Arm 기반 Vera CPU 제안...8월 출하 목표";
  }
  if (lower.includes("jensen huang") && lower.includes("tsmc")) {
    return "젠슨 황, TSMC의 AI 수익성을 강조...TSMC 투자 관점 부각";
  }

  return cleanTitle
    .replace(/\bNVIDIA\b/gi, "엔비디아")
    .replace(/\bNvidia\b/g, "엔비디아")
    .replace(/\bGoogle DeepMind\b/gi, "구글 딥마인드")
    .replace(/\bGoogle\b/gi, "구글")
    .replace(/\bTSMC\b/g, "TSMC")
    .replace(/\bSamsung\b/gi, "삼성")
    .replace(/\bArm-Based\b/gi, "Arm 기반")
    .replace(/\bArm\b/g, "Arm")
    .replace(/\bVera CPUs\b/gi, "Vera CPU")
    .replace(/\bAI Infrastructure\b/gi, "AI 인프라")
    .replace(/\bData Center\b/gi, "데이터센터")
    .replace(/\bData Centers\b/gi, "데이터센터")
    .replace(/\bSpending\b/gi, "지출")
    .replace(/\bAccelerates\b/gi, "가속")
    .replace(/\bTargets\b/gi, "목표")
    .replace(/\bShipments\b/gi, "출하")
    .replace(/\bChinese Clients\b/gi, "중국 고객")
    .replace(/\bLocal AI\b/gi, "로컬 AI")
    .replace(/\bAnalysis\b/gi, "분석")
    .replace(/\bForecast\b/gi, "전망")
    .replace(/\bExceed\b/gi, "돌파")
    .replace(/\bBillion\b/gi, "십억 달러")
    .replace(/\bTrillion\b/gi, "조 달러")
    .replace(/\s+/g, " ")
    .trim();
}

function weeklyDisplayTitle(article) {
  return weeklyRegion(article) === "global" ? translateForeignTitle(article.title) : article.title;
}

function articleHasAny(article, terms) {
  const haystack = articleText(article);
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function weeklyArticleAnalysis(article) {
  const isGlobal = weeklyRegion(article) === "global";
  const companyTags = (article.companyHits || []).filter((tag) => !["AI시장", "정책", "NPU"].includes(tag)).slice(0, 3);
  const companyText = companyTags.length ? companyTags.join(", ") : "관련 기업";
  const title = weeklyDisplayTitle(article);
  const issue = issueName(article);
  const source = article.source || article.outlet || "해당 매체";
  const hasSupplyChain = articleHasAny(article, ["samsung", "삼성", "tsmc", "foundry", "파운드리", "2나노", "공급망", "tpu", "ai chip"]);
  const hasInfrastructure = articleHasAny(article, ["data center", "데이터센터", "ai infrastructure", "gpu", "ai factory", "투자", "spending", "cloud"]);
  const hasDomesticNpu = articleHasAny(article, ["리벨리온", "퓨리오사", "딥엑스", "모빌린트", "하이퍼엑셀", "npu", "온디바이스", "국산"]);
  const hasPolicy = articleHasAny(article, ["과기정통부", "정부", "nipa", "공모", "정책", "공공", "조달", "예산", "사업"]);
  const hasMarket = articleHasAny(article, ["market", "시장", "매출", "수요", "점유율", "실적", "전망", "valuation", "funding"]);
  const hasFoundry = articleHasAny(article, ["foundry", "파운드리", "2나노", "4나노", "samsung foundry", "tsmc"]);
  const hasPackaging = articleHasAny(article, ["packaging", "패키징", "hbm", "cowos", "advanced package"]);
  const hasCustomChip = articleHasAny(article, ["tpu", "custom chip", "자체칩", "ai chip", "asic", "deepmind", "gemini"]);
  const hasCapex = articleHasAny(article, ["capex", "spending", "투자", "데이터센터 투자", "ai factory", "인프라 투자"]);
  const hasInferenceCost = articleHasAny(article, ["inference", "추론", "전력", "power", "latency", "지연시간", "운영비", "비용", "저전력"]);
  const hasProduction = articleHasAny(article, ["양산", "mass production", "sample", "샘플", "시제품", "tape-out", "테이프아웃", "launch"]);
  const hasCustomerProof = articleHasAny(article, ["고객", "계약", "공급", "파트너", "협약", "mou", "poc", "실증", "레퍼런스", "도입"]);
  const hasFunding = articleHasAny(article, ["funding", "투자 유치", "펀드", "국민성장펀드", "ipo", "상장", "valuation", "기업가치"]);
  const hasSoftwareStack = articleHasAny(article, ["sdk", "software", "소프트웨어", "compiler", "컴파일러", "개발도구", "모델 포팅"]);
  const hasProcurement = articleHasAny(article, ["조달", "공공", "공모", "사업공고", "예산", "바우처", "지원사업"]);
  const hasEarnings = articleHasAny(article, ["earnings", "revenue", "매출", "실적", "가이던스", "주가", "수익"]);
  const hasModelPlatform = articleHasAny(article, ["model", "모델", "gemini", "deepmind", "agent", "local ai", "온디바이스", "diffusion", "llm"]);

  let impact = `${source}의 이번 이슈는 ${issue} 영역에서 기술 성능보다 실제 도입 조건이 중요해지고 있음을 보여줍니다. 산업적으로는 ${companyText}를 포함한 공급자들이 고객 레퍼런스, 가격 경쟁력, 전력 효율, 운용 안정성을 함께 증명해야 하는 방향으로 압력이 커집니다.`;
  let outlook = `앞으로는 "${title}" 이슈가 단발 보도에 그치는지, 후속 고객 발표·제품 일정·투자 반응으로 이어지는지가 관건입니다. 1~3개월 안에 같은 주제가 다른 매체나 기업 발표에서 반복되는지 확인해야 합니다.`;
  let policy = "비R&D 사업으로는 기술개발비 지원보다 수요처 발굴, 실증 환경 제공, 조달 연계, 해외 PoC 지원처럼 시장 진입 장벽을 낮추는 장치를 우선 검토하는 편이 적합합니다.";

  if (hasSupplyChain) {
    impact = `파급효과는 설계 경쟁보다 생산 실행력 쪽에서 크게 나타납니다. ${companyText} 관련 공급망 이슈가 커질수록 AI칩 기업은 파운드리 접근성, 패키징 선택, 검증 일정, 납기 신뢰성을 함께 보여줘야 하며, 국내 NPU 기업도 기술 발표만으로는 고객 신뢰를 확보하기 어려워집니다.`;
    outlook = "후속으로 볼 것은 실제 양산 일정, 파운드리·패키징 파트너 공개 여부, 초도 물량 확보, 고객사의 구매 확약 또는 PoC 전환입니다. 같은 공급망 이슈가 반복되면 시장은 성능보다 납기와 생산 안정성을 더 강하게 평가할 가능성이 큽니다.";
    policy = "정책은 공급망 병목을 줄이는 쪽으로 좁히는 게 좋습니다. MPW·시제품 제작 연계, 패키징·검증 바우처, 파운드리 상담·매칭, 수요기업 공동 PoC를 하나의 비R&D 패키지로 설계하면 기사 이슈와 직접 연결됩니다.";
  } else if (hasInfrastructure) {
    impact = `파급효과는 데이터센터 운영비와 추론 인프라 선택지에서 발생합니다. GPU 확보 경쟁이 심해질수록 반복 추론, 특정 모델 서빙, 온프레미스·공공 AI 서비스처럼 전력비가 민감한 영역에서 국산 NPU가 보완재로 들어갈 공간이 생깁니다.`;
    outlook = "후속으로는 데이터센터 투자 규모, 전력비 절감 수치, 클라우드 사업자의 NPU 적용 여부, 실제 서비스 지연시간·처리량 공개를 봐야 합니다. 단순 투자 뉴스보다 운영비 절감 데이터가 나오는지가 더 중요합니다.";
    policy = "정책은 공공·민간 데이터센터 실증에 맞추는 것이 좋습니다. 국산 NPU 기반 추론 서비스를 실제 워크로드에 태우고, 전력 대비 성능과 운영비 절감 데이터를 공개 벤치마크로 축적하는 사업이 적합합니다.";
  } else if (hasDomesticNpu) {
    impact = `${companyText} 이슈는 국내 NPU 기업이 기술 홍보 단계에서 고객 검증과 매출 전환 단계로 넘어가고 있는지를 보여주는 신호입니다. 산업적으로는 칩 성능 수치보다 SDK, 모델 포팅, 서버·모듈 파트너, 유지보수 체계가 함께 평가되며, 한 기업의 레퍼런스가 국내 생태계 전체 신뢰도로 번질 수 있습니다.`;
    outlook = "후속으로는 고객사 공개, 양산 일정, 상장·투자 일정, SDK 공개 수준, 실제 서비스 적용 사례가 중요합니다. 특히 같은 기업명이 기술 기사보다 계약·매출 기사에서 반복되는지 봐야 사업화 신호로 해석할 수 있습니다.";
    policy = "정책은 기업별 기술지원보다 수요처 매칭과 레퍼런스 형성에 집중하는 편이 좋습니다. K-엔비디아 참여기업별 PoC 패키지, 공공서비스 적용 트랙, 해외 전시·고객검증 지원을 분리 운영하는 방식이 맞습니다.";
  } else if (hasPolicy) {
    impact = "정책 이슈의 파급효과는 예산 규모보다 시장에 주는 수요 신호에서 갈립니다. 공공사업이 성능평가, 실증, 조달, 데이터센터 적용으로 이어지면 국내 NPU 기업은 민간 고객에게 보여줄 레퍼런스를 확보하지만, 공모·행사 중심이면 홍보 효과에 그칠 가능성이 큽니다.";
    outlook = "후속으로는 실제 공고 여부, 예산 규모, 지원 대상, 성과지표, 조달 전환 가능성을 봐야 합니다. 특히 성과지표가 과제 수행 건수인지, 실제 도입·운영 데이터인지가 정책 효과를 가를 것입니다.";
    policy = "NIPA·과기정통부 사업과 연결한다면 수요기업 컨소시엄, 공공 레퍼런스, 조달 전환, 성능·전력 데이터 공개를 한 묶음으로 설계하는 것이 좋습니다. 비R&D 사업은 구매자와 운용 현장을 만드는 구조여야 합니다.";
  } else if (hasMarket) {
    impact = `시장 이슈는 투자자 평가 기준과 고객 구매 타이밍에 영향을 줍니다. ${companyText} 관련 실적·투자·수요 뉴스가 강해질수록 국내 NPU 기업도 기술 가능성보다 매출 전환성, 고객군의 질, 단가 경쟁력, 양산 일정의 현실성을 더 엄격하게 검증받게 됩니다.`;
    outlook = "후속으로는 CAPEX 변화, 고객 계약, 투자 유치, 주가 반응, AI 서비스 매출 전환 여부를 봐야 합니다. 같은 시장 신호가 반복되면 국내 기업에도 '기술 보유'보다 '팔 수 있는 제품' 압력이 커질 가능성이 큽니다.";
    policy = "정책은 보조금 배분보다 민간 자금이 들어올 조건을 만드는 쪽이 효과적입니다. 수요 기반 실증, 투자 연계 IR, 해외 고객 검증, 성능·비용 절감 지표 표준화가 비R&D 사업 후보입니다.";
  }

  const detailedRule = [
    {
      when: hasFoundry || hasPackaging,
      impact: `이 기사의 파급효과는 칩 설계보다 제조 가능성과 공급망 실행력에서 나타납니다. ${companyText} 관련 이슈가 파운드리·패키징·공정 선택과 연결될수록 국내 NPU 기업은 성능 발표만으로는 부족하고, 어느 공정에서 언제 만들 수 있는지와 검증·납기 리스크를 함께 설명해야 합니다.`,
      outlook: "후속으로는 생산 파트너 공개, 공정 노드 확정, 시제품 일정, 패키징 병목 해소 여부를 확인해야 합니다. 같은 이슈가 반복되면 시장의 관심은 칩 아키텍처보다 양산 가능성과 공급 안정성으로 이동할 가능성이 큽니다.",
      policy: "비R&D 사업은 공급망 연결을 직접 돕는 방향이 적합합니다. 파운드리·패키징 상담회, MPW 연계, 시제품 검증 바우처, 수요기업 공동 테스트베드를 묶으면 기사에서 드러난 병목과 바로 연결됩니다.",
    },
    {
      when: hasCustomChip && !hasDomesticNpu,
      impact: "빅테크 자체칩 또는 전용 AI칩 이슈는 GPU 중심 조달 구조가 특정 워크로드별 전용 가속기 경쟁으로 쪼개지고 있음을 보여줍니다. 국내 기업 입장에서는 범용 GPU 대체보다 특정 모델·서비스·비용 구조에 맞춘 틈새 가속기 전략의 중요성이 커집니다.",
      outlook: "후속으로는 해당 칩이 실제 클라우드 서비스나 모델 배포에 쓰이는지, 외부 고객에게 개방되는지, 기존 GPU 구매 계획을 줄이는지 봐야 합니다. 자체칩 뉴스가 서비스 적용 사례로 이어질 때 시장 신호가 강해집니다.",
      policy: "정책은 자체칩 경쟁을 따라가기보다 국산 NPU가 들어갈 수 있는 특화 워크로드를 정의하는 쪽이 좋습니다. 공공 LLM 추론, 검색·추천, 영상분석, 온디바이스 AI처럼 수요처와 모델을 함께 묶은 실증 과제가 적합합니다.",
    },
    {
      when: hasCapex && hasInfrastructure,
      impact: "AI 인프라 투자 이슈는 칩 수요가 단발 구매가 아니라 데이터센터, 전력, 냉각, 클라우드 상품 구성까지 묶인 설비투자 문제로 바뀌고 있음을 보여줍니다. 국내 NPU 기업에는 칩 단품 판매보다 서버·클라우드·운영비 절감 패키지로 제안해야 하는 압력이 커집니다.",
      outlook: "후속으로는 CAPEX 계획이 실제 장비 발주로 이어지는지, GPU 외 대체 가속기 검토가 포함되는지, 전력비와 서버 효율 지표가 공개되는지 확인해야 합니다.",
      policy: "비R&D 사업은 데이터센터 운영자와 NPU 기업을 한 테이블에 앉히는 방식이 좋습니다. 공공·민간 IDC 실증, 전력 대비 처리량 벤치마크, 추론 운영비 절감 리포트 발간을 사업 산출물로 잡을 수 있습니다.",
    },
    {
      when: hasInferenceCost,
      impact: "추론 비용·전력·지연시간 신호는 AI 반도체 경쟁의 기준이 학습 성능에서 서비스 운영 효율로 이동하고 있음을 뜻합니다. 국내 NPU에는 대규모 학습 경쟁보다 반복 추론, 엣지·온프레미스, 공공서비스 같은 비용 민감 영역에서 기회가 생깁니다.",
      outlook: "후속으로는 전력 대비 성능, 지연시간, 동시 사용자 처리량, 모델별 포팅 결과가 공개되는지 봐야 합니다. 실제 운영비 절감 수치가 나오면 단순 기술 기사보다 시장성이 강한 신호입니다.",
      policy: "정책은 '성능이 좋다'보다 '운영비가 줄었다'를 검증하게 설계해야 합니다. 국산 NPU 추론비용 벤치마크, 공공서비스 적용 실증, 모델 포팅 지원, 전력계측 기반 성과지표가 필요합니다.",
    },
    {
      when: hasDomesticNpu && hasProduction,
      impact: `${companyText} 이슈는 국내 NPU 기업이 연구개발 설명에서 양산·시제품 검증 단계로 이동하는 신호입니다. 산업적으로는 TOPS 수치보다 수율, 보드·서버 형태, 고객 테스트 일정, 반복 공급 가능성이 더 중요한 평가 기준으로 올라옵니다.`,
      outlook: "후속으로는 샘플 제공 대상, 양산 착수 시점, 실제 고객 테스트 결과, 서버·모듈 파트너 공개 여부를 확인해야 합니다. 일정이 구체화될수록 투자와 조달 판단의 신뢰도가 올라갑니다.",
      policy: "비R&D 사업은 양산 직전 기업의 고객 검증을 돕는 쪽이 효과적입니다. 시제품 검증 바우처, 수요기업 테스트 비용 지원, 공공 PoC 장비 임차, 양산 전 레퍼런스 확보 프로그램을 검토할 수 있습니다.",
    },
    {
      when: hasDomesticNpu && hasCustomerProof,
      impact: `${companyText} 관련 고객·협약·실증 이슈는 국내 NPU 기업의 병목이 기술개발보다 레퍼런스 확보에 있음을 보여줍니다. 산업적으로는 고객 이름, 적용 업무, 반복 구매 가능성이 기업 신뢰도를 좌우합니다.`,
      outlook: "후속으로는 협약이 실제 납품·유료 PoC·상용 서비스로 전환되는지 봐야 합니다. 특히 고객사의 산업군이 금융, 공공, 제조, 데이터센터 중 어디인지에 따라 파급 범위가 달라집니다.",
      policy: "정책은 수요처 매칭 이후의 전환율을 관리해야 합니다. 단순 매칭 행사가 아니라 PoC 비용, 보안 검증, 조달 전환, 성과 데이터 공개까지 이어지는 단계형 비R&D 사업이 적합합니다.",
    },
    {
      when: hasDomesticNpu && hasFunding,
      impact: `${companyText} 관련 투자·상장·펀드 이슈는 국내 NPU 기업이 기술 가능성보다 성장 자금과 시장 신뢰를 확보하는 단계에 들어섰다는 뜻입니다. 산업적으로는 자금 유입이 양산, 인력, 고객 검증 속도를 좌우할 수 있습니다.`,
      outlook: "후속으로는 투자금 사용처, 양산 일정, 주요 고객 확보, 상장 심사 또는 후속 투자 여부를 확인해야 합니다. 자금 뉴스가 고객·매출 뉴스로 이어지는지가 핵심입니다.",
      policy: "정책은 민간 투자와 공공 실증을 연결하는 방식이 좋습니다. 투자 연계 IR, 정책금융 보증, 해외 고객 검증 바우처, 공공 레퍼런스 제공을 묶으면 자금 조달 효과를 사업화로 연결할 수 있습니다.",
    },
    {
      when: hasSoftwareStack,
      impact: "소프트웨어·SDK·모델 포팅 이슈는 AI칩 경쟁이 하드웨어 성능만으로 결정되지 않는다는 신호입니다. 개발자가 쉽게 모델을 올리고 운영할 수 있어야 고객 전환비용이 낮아지기 때문에, 국내 NPU 생태계에는 도구와 문서화가 중요한 경쟁 자산이 됩니다.",
      outlook: "후속으로는 지원 모델 수, 개발자 문서, 오픈소스 공개, 클라우드 이미지 제공, 실제 포팅 사례가 늘어나는지 봐야 합니다. 소프트웨어 개선이 고객 도입 속도로 이어지는지가 관찰 포인트입니다.",
      policy: "비R&D 사업은 NPU 개발자 생태계 조성으로 설계할 수 있습니다. 모델 포팅 챌린지, SDK 교육, 공통 벤치마크, 개발자 크레딧, 수요기업 PoC 템플릿을 지원하는 방식이 적합합니다.",
    },
    {
      when: hasPolicy && hasProcurement,
      impact: "공공 조달·공모·예산 이슈는 정책이 시장을 만들 수 있는지 보여주는 신호입니다. 사업 설계가 실증과 조달로 이어지면 국내 NPU 기업의 첫 레퍼런스가 될 수 있지만, 행사성 지원에 머물면 산업 파급은 제한됩니다.",
      outlook: "후속으로는 공고문에 수요처, 실증 환경, 조달 전환, 성능 지표가 명시되는지 확인해야 합니다. 예산 규모보다 실제 구매 가능성이 있는 구조인지가 더 중요합니다.",
      policy: "정책 방향은 명확합니다. 공공 수요기관 컨소시엄, 실증 후 조달 전환, 전력·성능 데이터 공개, 보안 검증을 한 사업 안에 묶어야 비R&D 사업 효과가 납니다.",
    },
    {
      when: hasEarnings || (hasMarket && hasCapex),
      impact: "실적·매출·CAPEX 이슈는 AI 반도체 수요가 기대감에서 실제 지출로 전환되는지 판단하는 신호입니다. 국내 NPU 기업도 기술 서사보다 고객 예산, 구매 주기, 단가 경쟁력에 맞춘 사업화 논리가 필요해집니다.",
      outlook: "후속으로는 기업 실적 발표, CAPEX 가이던스, 데이터센터 발주, AI 서비스 매출 전환을 확인해야 합니다. 숫자가 반복되면 시장은 더 냉정하게 비용 대비 효과를 요구할 것입니다.",
      policy: "정책은 민간 지출을 보완하는 방향이 적합합니다. 수요기업 바우처, 투자 연계 실증, 비용 절감 성과지표, 해외 고객 검증 프로그램을 통해 민간 구매 결정을 앞당기는 것이 좋습니다.",
    },
    {
      when: hasModelPlatform,
      impact: "모델·플랫폼 이슈는 AI 반도체 수요가 특정 모델의 실행 방식과 함께 움직인다는 점을 보여줍니다. 병렬 생성, 로컬 AI, 에이전트형 워크로드처럼 모델 특성이 달라지면 필요한 가속기와 소프트웨어 최적화 방향도 달라집니다.",
      outlook: "후속으로는 해당 모델이 실제 서비스에 배포되는지, 로컬·온디바이스 실행 요구가 커지는지, 특정 하드웨어 최적화 사례가 늘어나는지 봐야 합니다.",
      policy: "비R&D 사업은 모델 중심 실증으로 설계할 수 있습니다. 공공·산업별 대표 모델을 정하고, 국산 NPU에서 포팅·최적화·운영비 절감까지 검증하는 트랙을 만드는 방식이 적합합니다.",
    },
  ].find((rule) => rule.when);

  if (detailedRule) {
    impact = detailedRule.impact;
    outlook = detailedRule.outlook;
    policy = detailedRule.policy;
  }

  if (isGlobal) {
    outlook += " 해외 기사이므로 국내 적용 시에는 한국 기업의 공급망 접근성, 고객 확보 가능성, 규제·조달 환경 차이를 함께 보정해 해석해야 합니다.";
  }

  return [
    { title: "산업적 파급효과", body: impact },
    { title: "전망", body: outlook },
    { title: "정책 방향 추천", body: policy },
  ];
}

function weeklyIssueBriefing(data) {
  const generatedAt = asDate(data.generatedAt) || new Date();
  const weekStart = new Date(generatedAt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const articles = data.news.articles
    .filter((article) => {
      const publishedAt = asDate(article.publishedAt);
      return publishedAt && publishedAt >= weekStart && publishedAt <= generatedAt;
    })
    .map((article) => {
      const publishedAt = asDate(article.publishedAt);
      const ageDays = publishedAt ? Math.max(0, (generatedAt - publishedAt) / (24 * 60 * 60 * 1000)) : 7;
      const tagScore = (article.taxonomyHits?.length || 0) * 2 + (article.companyHits?.length || 0);
      const issueScore = issueName(article) === "AI시장" ? 4 : issueName(article) === "정책" ? 3 : 2;
      return {
        ...article,
        weeklyTerms: weeklyIssueTerms(article),
        weeklyScore: (article.score || 0) + tagScore + issueScore + Math.max(0, 7 - ageDays),
      };
    })
    .sort((a, b) => b.weeklyScore - a.weeklyScore);

  return selectBalancedWeeklyIssues(articles, 7);
}

function weeklyIssueInsights(topIssues) {
  const corpus = topIssues.map((article) => articleText(article)).join(" ");
  const hasAny = (terms) => terms.some((term) => corpus.includes(term.toLowerCase()));
  const hasSupplyChain = hasAny(["samsung", "삼성", "tsmc", "파운드리", "foundry", "2나노", "공급망", "tpu", "ai chip"]);
  const hasInfrastructure = hasAny(["data center", "데이터센터", "ai infrastructure", "gpu", "ai factory", "팩토리", "투자", "spending"]);
  const hasDomesticNpu = hasAny(["리벨리온", "퓨리오사", "딥엑스", "모빌린트", "하이퍼엑셀", "npu", "국민성장펀드", "코스닥"]);
  const hasPolicy = hasAny(["과기정통부", "정부", "공모전", "확보", "정책", "공공", "nipa", "조달"]);

  const focus = [
    hasSupplyChain ? "AI칩 공급망 재편" : "",
    hasInfrastructure ? "AI 인프라 투자 확대" : "",
    hasDomesticNpu ? "국내 NPU 기업의 사업화·자금조달" : "",
    hasPolicy ? "정부 주도 AI 인프라·공공 수요 형성" : "",
  ].filter(Boolean);

  const focusText = focus.length ? focus.join(", ") : "AI 시장 수요와 반도체 공급 역학";
  return {
    headline: `이번 주 Top 7은 ${focusText}가 맞물리며 AI반도체 정책의 초점이 기술개발에서 수요·실증·공급망 전략으로 이동하고 있음을 보여줍니다.`,
    sections: [
      {
        title: "핵심내용",
        body: hasSupplyChain
          ? "구글, 엔비디아, 삼성, TSMC 등 빅테크·파운드리 이슈가 함께 등장하면서 AI 칩 경쟁이 단일 기업 성능 경쟁을 넘어 생산 파트너, 공급 안정성, 전용칩 확보 경쟁으로 확장되고 있습니다."
          : "Top 7 기사는 AI 서비스 수요, 인프라 투자, 국내 기업 사업화가 동시에 움직이는 흐름을 보여주며, 단발성 뉴스보다 시장 구조 변화의 신호로 해석할 필요가 있습니다.",
      },
      {
        title: "산업적 파급효과",
        body: hasInfrastructure
          ? "AI 인프라 투자와 데이터센터 수요 확대는 GPU 중심 병목을 심화시키는 동시에 추론 비용·전력 효율을 낮출 대체 컴퓨팅 수요를 키웁니다. 이는 국산 NPU가 데이터센터, 공공 AI서비스, 온디바이스 영역으로 진입할 수 있는 실증 명분을 강화합니다."
          : "AI 반도체 수요는 모델 개발 자체보다 서비스 운영비, 전력, 공급망 안정성 문제와 결합되고 있어 국내 기업에는 성능 수치뿐 아니라 운영 경제성을 입증할 기회가 생기고 있습니다.",
      },
      {
        title: "전망",
        body: "단기적으로는 엔비디아와 글로벌 빅테크 중심의 AI 인프라 투자가 시장 방향을 계속 좌우할 가능성이 큽니다. 다만 중기적으로는 추론 워크로드 증가, 전력비 부담, 공급망 다변화 요구가 커지면서 전용 NPU와 국산 AI컴퓨팅의 정책적 활용 공간이 넓어질 수 있습니다.",
      },
      {
        title: "정책 방향 추천",
        body: hasPolicy
          ? "비R&D 사업은 단순 보조보다 수요처 매칭, 성능·전력 검증, 공공 조달 전환, 해외 PoC를 하나의 패키지로 묶는 방식이 적절합니다. 특히 정부가 확보하는 GPU·AI 인프라 사업과 국산 NPU 실증 트랙을 병행 설계하면 정책 효과를 더 명확히 측정할 수 있습니다."
          : "정책은 기업별 지원보다 공통 실증 인프라, 표준 벤치마크, 수요기업 전환 바우처, 조달 카탈로그 구축처럼 시장 실패를 줄이는 비R&D 수단에 집중하는 편이 효과적입니다.",
      },
    ],
  };
}

function renderWeeklyIssueBriefing(data, topIssues = weeklyIssueBriefing(data)) {
  if (!topIssues.length) {
    return `
      <article class="weekly-brief review-card">
        <p class="eyebrow">Weekly Issue Top 7</p>
        <h3>주간 이슈 Top 7</h3>
        <p>최근 7일 이내 수집된 기사 중 선별할 수 있는 이슈가 아직 없습니다.</p>
      </article>
    `;
  }

  return `
    <article class="weekly-brief review-card">
      <div class="weekly-brief-head">
        <div>
          <p class="eyebrow">Weekly Issue Top 7</p>
          <h3>주간 이슈 Top 7</h3>
        </div>
        <span>최근 7일 기준</span>
      </div>
      <div class="weekly-list">
        ${topIssues.map((article, index) => {
          const tags = [...new Set([issueName(article), ...(article.taxonomyHits || []), ...(article.companyHits || [])])].filter(Boolean).slice(0, 5);
          const displayTitle = weeklyDisplayTitle(article);
          const originalTitle = displayTitle !== article.title ? ` title="${escapeHtml(article.title)}"` : "";
          return `
            <article class="weekly-item">
              <strong>${index + 1}</strong>
              <a class="weekly-copy" href="${escapeHtml(article.link)}" target="_blank" rel="noreferrer"${originalTitle}>
                <b>${escapeHtml(displayTitle)}</b>
                <small>${escapeHtml(article.source)} · ${formatDate(article.publishedAt, { short: true })}</small>
                <span class="weekly-tags">
                  ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
                </span>
              </a>
              <button class="weekly-analysis-btn" type="button" data-weekly-analysis-index="${index}">분석</button>
            </article>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function renderWeeklyInsights(topIssues) {
  if (!topIssues.length) return "";
  const insight = weeklyIssueInsights(topIssues);
  return `
    <article class="weekly-insight review-card">
      <p class="eyebrow">Issue Takeaways</p>
      <h3>종합분석</h3>
      <p>${escapeHtml(insight.headline)}</p>
      <div class="weekly-analysis-grid">
        ${insight.sections.map((section) => `
          <section>
            <h4>${escapeHtml(section.title)}</h4>
            <p>${escapeHtml(section.body)}</p>
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function renderWeeklyPage(data) {
  const panel = $("#weeklyPanel");
  if (!panel) return;
  const topIssues = weeklyIssueBriefing(data);
  panel.innerHTML = `
    ${renderWeeklyIssueBriefing(data, topIssues)}
    ${renderWeeklyInsights(topIssues)}
  `;
}

function fallbackReview(data) {
  const signals = data.briefing.signals;
  const topTech = signals.technologies.find(([, count]) => count > 0)?.[0] || "NPU";
  return {
    headline: `오늘 브리핑은 ${topTech}를 중심으로 정책 연결 가능성을 점검해야 합니다.`,
    metrics: signals.technologies.slice(0, 5),
    sections: [
      {
        title: "시사점",
        body: "AI 시장 수요와 국내 NPU 기업의 사업화 이슈를 함께 봐야 합니다.",
        bullets: ["기술개발보다 레퍼런스 확보가 중요", "시장 기사와 정책 기사를 분리해서 해석", "수요처 발굴형 비R&D 사업으로 연결"],
      },
      {
        title: "정부정책 방향",
        body: "구매자 리스크를 줄이는 실증, 검증, 조달 연계 프로그램이 필요합니다.",
        bullets: ["실증 바우처", "성능검증 인증", "조달 카탈로그", "해외 PoC"],
      },
    ],
  };
}

function renderReview(data) {
  const review = data.briefing.review || fallbackReview(data);
  $("#reviewPanel").innerHTML = `
    <article class="review-hero">
      <p class="eyebrow">오늘의 판단</p>
      <h3>${escapeHtml(review.headline)}</h3>
      <div class="review-metrics">
        ${(review.metrics || []).map(([label, value]) => `
          <span class="review-metric"><b>${escapeHtml(label)}</b>${escapeHtml(value)}</span>
        `).join("")}
      </div>
    </article>
    <div class="review-grid">
      ${(review.sections || []).map((section) => `
        <article class="review-card">
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.body)}</p>
          <ul>
            ${(section.bullets || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
      `).join("")}
    </div>
  `;
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
  $("#updatedAt").textContent = `최근 데이터 생성 ${formatClock(data.generatedAt)} · 다음 자동 갱신 ${nextAutoRefreshLabel()}`;
  renderSelectors(data);
  renderActiveTag();
  renderBriefing(data);
  renderIssues(data);
  renderPolicyIdeas(data);
  renderMarket(data);
  renderWeeklyPage(data);
  renderReview(data);
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
    state.policyIdeas = loadSavedPolicyIdeas(state.data) || state.data.briefing.policyIdeas.map((idea) => ({ ...idea }));
    render();
  } catch (error) {
    if (window.__DASHBOARD_DATA__) {
      state.data = window.__DASHBOARD_DATA__;
      state.policyIdeas = loadSavedPolicyIdeas(state.data) || state.data.briefing.policyIdeas.map((idea) => ({ ...idea }));
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
  const weeklyAnalysis = event.target.closest("[data-weekly-analysis-index]");
  if (weeklyAnalysis) {
    openWeeklyAnalysisModal(Number(weeklyAnalysis.dataset.weeklyAnalysisIndex));
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
$("#weeklyAnalysisModalClose").addEventListener("click", closeWeeklyAnalysisModal);
$("#weeklyAnalysisModal").addEventListener("click", (event) => {
  if (event.target.id === "weeklyAnalysisModal") closeWeeklyAnalysisModal();
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

$("#regenPolicyBtn").addEventListener("click", regenerateSelectedPolicies);

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
