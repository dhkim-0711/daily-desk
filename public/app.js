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
        weeklyScore: (article.score || 0) + tagScore + issueScore + Math.max(0, 7 - ageDays),
      };
    })
    .sort((a, b) => b.weeklyScore - a.weeklyScore);

  const seen = new Set();
  return articles.filter((article) => {
    const key = article.title.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function renderWeeklyIssueBriefing(data) {
  const topIssues = weeklyIssueBriefing(data);
  if (!topIssues.length) {
    return `
      <article class="weekly-brief review-card">
        <p class="eyebrow">Weekly Issue Briefing</p>
        <h3>주간 이슈 브리핑 Top 5</h3>
        <p>최근 7일 이내 수집된 기사 중 선별할 수 있는 이슈가 아직 없습니다.</p>
      </article>
    `;
  }

  return `
    <article class="weekly-brief review-card">
      <div class="weekly-brief-head">
        <div>
          <p class="eyebrow">Weekly Issue Briefing</p>
          <h3>주간 이슈 브리핑 Top 5</h3>
        </div>
        <span>최근 7일 기준</span>
      </div>
      <div class="weekly-list">
        ${topIssues.map((article, index) => {
          const tags = [...new Set([issueName(article), ...(article.taxonomyHits || []), ...(article.companyHits || [])])].filter(Boolean).slice(0, 5);
          return `
            <a class="weekly-item" href="${escapeHtml(article.link)}" target="_blank" rel="noreferrer">
              <strong>${index + 1}</strong>
              <span class="weekly-copy">
                <b>${escapeHtml(article.title)}</b>
                <em>${escapeHtml(cleanSummary(article.summary))}</em>
                <small>${escapeHtml(article.source)} · ${formatDate(article.publishedAt, { short: true })}</small>
                <span class="weekly-tags">
                  ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
                </span>
              </span>
            </a>
          `;
        }).join("")}
      </div>
    </article>
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
    ${renderWeeklyIssueBriefing(data)}
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
