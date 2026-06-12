import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const execFileAsync = promisify(execFile);
const publicDir = join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const CACHE_MS = 1000 * 60 * 20;

const newsQueries = [
  {
    id: "ai-market-global",
    label: "AI 시장 전체",
    query: '("AI market" OR "generative AI" OR "AI adoption" OR "AI revenue" OR "AI spending" OR "AI investment" OR "AI demand")',
    lang: "en",
  },
  {
    id: "ai-market-business",
    label: "AI 시장·비즈니스",
    query: '("AI startup" OR "AI SaaS" OR "enterprise AI" OR "AI app" OR "AI search" OR "AI model revenue" OR "AI subscription")',
    lang: "en",
  },
  {
    id: "ai-investment-market",
    label: "AI 투자·자본시장",
    query: '("AI funding" OR "AI IPO" OR "AI M&A" OR "AI stocks" OR "AI capex" OR "AI valuation" OR "AI earnings")',
    lang: "en",
  },
  {
    id: "ai-agents-cloud",
    label: "AI 서비스·클라우드",
    query: '("AI agent" OR "enterprise AI" OR "AI cloud" OR "AI datacenter" OR "LLM inference" OR "AI search")',
    lang: "en",
  },
  {
    id: "nvidia-ai",
    label: "NVIDIA 이슈",
    query: '(NVIDIA OR Nvidia) (AI OR GPU OR Blackwell OR Rubin OR "AI chip" OR datacenter OR inference)',
    lang: "en",
  },
  {
    id: "google-ai",
    label: "Google AI 이슈",
    query: '(Google OR Alphabet OR Gemini OR TPU OR DeepMind) (AI OR "AI chip" OR datacenter OR cloud OR inference)',
    lang: "en",
  },
  {
    id: "korea-global-ai-companies",
    label: "해외 빅테크 국내 보도",
    query: "(엔비디아 OR NVIDIA OR 구글 OR Google OR 알파벳 OR 제미나이 OR Gemini OR 딥마인드 OR DeepMind) (AI OR 인공지능 OR 반도체 OR GPU OR TPU OR 데이터센터 OR 클라우드 OR 추론)",
    lang: "ko",
  },
  {
    id: "global-ai-chip",
    label: "해외 AI반도체",
    query: '("AI chip" OR NPU OR "AI accelerator" OR "inference chip") (AMD OR Broadcom OR TSMC OR Arm OR Samsung OR SK hynix)',
    lang: "en",
  },
  {
    id: "global-policy",
    label: "해외 정책·투자",
    query: '("AI semiconductor" OR "advanced chips" OR "AI infrastructure") (policy OR subsidy OR export OR investment OR sovereign AI)',
    lang: "en",
  },
  {
    id: "korea-npu",
    label: "국내 NPU 기업",
    query: "(리벨리온 OR 퓨리오사AI OR 퓨리오사 OR 하이퍼엑셀 OR 딥엑스 OR 모빌린트 OR K-엔비디아 OR NPU)",
    lang: "ko",
  },
  {
    id: "rebellions",
    label: "리벨리온",
    query: "(리벨리온 OR Rebellions) (NPU OR AI반도체 OR 인공지능 반도체 OR 데이터센터 OR 추론 OR K-엔비디아)",
    lang: "ko",
  },
  {
    id: "furiosa",
    label: "퓨리오사AI",
    query: "(퓨리오사AI OR 퓨리오사 OR FuriosaAI OR Furiosa) (NPU OR AI반도체 OR 인공지능 반도체 OR RNGD OR 추론 OR K-엔비디아)",
    lang: "ko",
  },
  {
    id: "hyperaccel",
    label: "하이퍼엑셀",
    query: "(하이퍼엑셀 OR HyperAccel) (NPU OR AI반도체 OR 인공지능 반도체 OR LLM OR 추론 OR K-엔비디아)",
    lang: "ko",
  },
  {
    id: "hyperaccel-broad",
    label: "하이퍼엑셀 확장",
    query: "(하이퍼엑셀 OR HyperAccel OR HyperDex)",
    lang: "ko",
  },
  {
    id: "hyperaccel-global",
    label: "HyperAccel global",
    query: '("HyperAccel" OR "HyperDex" OR "Latency Processing Unit")',
    lang: "en",
  },
  {
    id: "deepx",
    label: "딥엑스",
    query: "(딥엑스 OR DEEPX) (NPU OR 온디바이스 AI OR AI반도체 OR 인공지능 반도체 OR 엣지AI OR K-엔비디아)",
    lang: "ko",
  },
  {
    id: "mobilint",
    label: "모빌린트",
    query: "(모빌린트 OR Mobilint) (NPU OR AI반도체 OR 인공지능 반도체 OR 에지 AI OR 추론 OR K-엔비디아)",
    lang: "ko",
  },
  {
    id: "mobilint-broad",
    label: "모빌린트 확장",
    query: "모빌린트",
    lang: "ko",
  },
  {
    id: "mobilint-global",
    label: "Mobilint global",
    query: "Mobilint",
    lang: "en",
  },
  {
    id: "korea-ai-market",
    label: "국내 AI 시장",
    query: "(생성형 AI OR AI 에이전트 OR 인공지능 서비스 OR AI 데이터센터 OR 온디바이스 AI OR AI 반도체 OR AI 투자 OR AI 매출 OR AI 수요 OR AI 도입 OR AI 스타트업 OR AI 서비스)",
    lang: "ko",
  },
  {
    id: "korea-ai-policy",
    label: "국내 AI 정책",
    query: "(AI 반도체 OR 인공지능 반도체 OR 국가 AI OR AI 컴퓨팅 OR 데이터센터) (정책 OR 예산 OR 투자 OR 사업 OR 조달)",
    lang: "ko",
  },
  {
    id: "nipa-msit-policy",
    label: "NIPA·과기정통부 정책",
    query: "(NIPA OR 정보통신산업진흥원 OR 과기정통부 OR 과학기술정보통신부 OR IITP OR 정보통신기획평가원) (AI OR 인공지능 OR AI반도체 OR 인공지능반도체 OR NPU OR 데이터센터 OR 사업공고 OR 보도자료 OR 지원사업 OR 공모)",
    lang: "ko",
  },
  {
    id: "msit-ai-chip",
    label: "과기정통부 AI반도체",
    query: "과기정통부 AI 반도체 NPU 인공지능반도체",
    lang: "ko",
  },
  {
    id: "nipa-ai-chip",
    label: "NIPA AI반도체",
    query: "정보통신산업진흥원 NIPA AI반도체 NPU 지원사업 사업공고",
    lang: "ko",
  },
  {
    id: "ai-chip-public-program",
    label: "AI반도체 공공사업",
    query: "(AI반도체 OR 인공지능반도체 OR NPU OR K-엔비디아 OR 국산 AI반도체) (보도자료 OR 사업공고 OR 지원사업 OR 공모 OR 실증 OR 바우처 OR 조달 OR 과기정통부 OR NIPA)",
    lang: "ko",
  },
];

const watchCompanies = [
  "NVIDIA",
  "Nvidia",
  "엔비디아",
  "Google",
  "구글",
  "Alphabet",
  "알파벳",
  "Gemini",
  "제미나이",
  "DeepMind",
  "딥마인드",
  "TPU",
  "AMD",
  "Broadcom",
  "TSMC",
  "Arm",
  "Samsung",
  "리벨리온",
  "Rebellions",
  "퓨리오사",
  "퓨리오사AI",
  "Furiosa",
  "FuriosaAI",
  "하이퍼엑셀",
  "HyperAccel",
  "딥엑스",
  "DEEPX",
  "모빌린트",
  "Mobilint",
];

const equities = [
  { symbol: "NVDA", name: "NVIDIA", market: "US" },
  { symbol: "GOOGL", name: "Alphabet", market: "US" },
  { symbol: "AMD", name: "AMD", market: "US" },
  { symbol: "AVGO", name: "Broadcom", market: "US" },
  { symbol: "TSM", name: "TSMC ADR", market: "US" },
  { symbol: "ARM", name: "Arm", market: "US" },
  { symbol: "MU", name: "Micron", market: "US" },
  { symbol: "SMCI", name: "Supermicro", market: "US" },
  { symbol: "005930.KS", name: "삼성전자", market: "KR" },
  { symbol: "000660.KS", name: "SK하이닉스", market: "KR" },
  { symbol: "091990.KQ", name: "셀바스AI", market: "KR AI proxy" },
];

const indices = [
  { symbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "^SOX", name: "PHLX Semiconductor" },
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^KS11", name: "KOSPI" },
  { symbol: "^KQ11", name: "KOSDAQ" },
];

const keywordTaxonomy = [
  { key: "정책", terms: ["정책", "예산", "사업공고", "지원사업", "공모", "보도자료", "과기정통부", "과학기술정보통신부", "nipa", "정보통신산업진흥원", "iitp", "정보통신기획평가원"] },
  { key: "AI시장", terms: ["ai market", "ai adoption", "ai spending", "ai revenue", "ai investment", "ai demand", "ai funding", "ai ipo", "ai m&a", "ai capex", "ai valuation", "ai earnings", "enterprise ai", "ai startup", "ai saas", "생성형 ai", "인공지능 서비스", "ai 투자", "ai 매출", "ai 수요", "ai 도입", "ai 스타트업", "ai 서비스"] },
  { key: "AI에이전트", terms: ["ai agent", "agentic ai", "에이전트", "agent"] },
  { key: "AI인프라", terms: ["ai infrastructure", "ai compute", "accelerated computing", "cloud", "클라우드", "ai 컴퓨팅", "가속 컴퓨팅"] },
  { key: "데이터센터", terms: ["ai datacenter", "datacenter", "data center", "데이터센터", "data centre", "rack", "랙", "liquid cooling", "냉각"] },
  { key: "NPU", terms: ["npu", "neural processing unit", "신경망처리장치", "ai반도체", "인공지능 반도체"] },
  { key: "추론", terms: ["inference", "serving", "llm inference", "추론"] },
  { key: "온디바이스AI", terms: ["edge ai", "on-device", "ai pc", "smartphone", "device", "엣지", "온디바이스", "온디바이스 ai"] },
  { key: "K-엔비디아", terms: ["k-엔비디아", "k-nvidia", "국산 npu", "국내 npu"] },
  { key: "리벨리온", terms: ["리벨리온", "rebellions"] },
  { key: "퓨리오사AI", terms: ["퓨리오사ai", "퓨리오사", "furiosaai", "furiosa"] },
  { key: "하이퍼엑셀", terms: ["하이퍼엑셀", "hyperaccel"] },
  { key: "딥엑스", terms: ["딥엑스", "deepx"] },
  { key: "모빌린트", terms: ["모빌린트", "mobilint"] },
  { key: "NVIDIA", terms: ["nvidia", "엔비디아", "blackwell", "블랙웰", "rubin", "루빈", "cuda", "쿠다"] },
  { key: "Google", terms: ["google", "구글", "alphabet", "알파벳", "gemini", "제미나이", "deepmind", "딥마인드", "tpu"] },
  { key: "파운드리·패키징", terms: ["tsmc", "samsung foundry", "process", "packaging", "advanced packaging", "cowos", "파운드리", "패키징"] },
  { key: "수출통제·공급망", terms: ["export control", "sanction", "supply chain", "china", "sovereign", "수출통제", "공급망"] },
  { key: "투자·M&A", terms: ["funding", "investment", "valuation", "ipo", "acquisition", "투자", "상장", "인수"] },
  { key: "실증·조달", terms: ["procurement", "pilot", "deployment", "poc", "실증", "조달", "레퍼런스"] },
];

let cache = new Map();

const technologySignalOrder = [
  "NPU",
  "AI인프라",
  "데이터센터",
  "온디바이스AI",
  "추론",
  "AI에이전트",
  "파운드리·패키징",
];

const domesticNpuCompanies = ["리벨리온", "퓨리오사AI", "하이퍼엑셀", "딥엑스", "모빌린트"];

const marketIssueTerms = [
  "시장",
  "매출",
  "실적",
  "수요",
  "공급",
  "투자",
  "상장",
  "인수",
  "합병",
  "주가",
  "밸류에이션",
  "기업가치",
  "자금조달",
  "펀딩",
  "고객",
  "계약",
  "수주",
  "market",
  "revenue",
  "earnings",
  "sales",
  "demand",
  "supply",
  "forecast",
  "outlook",
  "guidance",
  "investment",
  "funding",
  "valuation",
  "ipo",
  "m&a",
  "acquisition",
  "merger",
  "shares",
  "stock",
  "capex",
  "orders",
  "customer",
  "contract",
  "tsmc",
  "broadcom",
  "amd",
  "arm",
  "micron",
];

const policyOrgTerms = [
  "과기정통부",
  "과학기술정보통신부",
  "nipa",
  "정보통신산업진흥원",
  "iitp",
  "정보통신기획평가원",
  "정부",
  "부처",
  "ministry",
  "government",
  "white house",
];

const policyActionTerms = [
  "정책",
  "예산",
  "사업공고",
  "지원사업",
  "공모",
  "보도자료",
  "조달",
  "규제",
  "수출통제",
  "보조금",
  "지원",
  "선정",
  "실증사업",
  "policy",
  "subsidy",
  "regulation",
  "export control",
  "sanction",
  "procurement",
  "chips act",
];

function countTermHits(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function classifyIssue(text, taxonomyHits = [], companyHits = []) {
  const taxonomy = new Set(taxonomyHits);
  const companies = new Set(companyHits);
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

  for (const key of ["AI인프라", "데이터센터", "온디바이스AI", "추론", "AI에이전트", "파운드리·패키징", "수출통제·공급망", "실증·조달"]) {
    if (taxonomy.has(key)) return key;
  }
  if (companies.has("NVIDIA")) return "NVIDIA";
  if (companies.has("Google")) return "Google";
  return "";
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

function decodeEntities(value = "") {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function stripTags(value = "") {
  return decodeEntities(String(value)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function googleNewsUrl({ query, lang }) {
  const locale = lang === "ko" ? "hl=ko&gl=KR&ceid=KR:ko" : "hl=en-US&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${locale}`;
}

async function getCached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < CACHE_MS) return hit.value;
  const value = await loader();
  cache.set(key, { timestamp: Date.now(), value });
  return value;
}

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "AI-Chip-Intelligence/1.0 (+local strategy dashboard)",
        accept: "application/rss+xml, application/xml, text/xml, application/json, text/plain, */*",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  } catch (error) {
    if (process.platform !== "win32") throw error;
    const script = [
      "$ProgressPreference = 'SilentlyContinue'",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "$response = Invoke-WebRequest -UseBasicParsing -Uri $env:AI_CHIP_FETCH_URL -TimeoutSec 25",
      "$response.Content",
    ].join("; ");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: { ...process.env, AI_CHIP_FETCH_URL: url },
        timeout: 35000,
        maxBuffer: 1024 * 1024 * 12,
        windowsHide: true,
      },
    );
    return stdout;
  }
}

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  return items.map((item) => {
    const pick = (tag) => {
      const found = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return found ? stripTags(found[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")) : "";
    };
    const sourceMatch = item.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    return {
      title: pick("title"),
      link: pick("link"),
      publishedAt: pick("pubDate"),
      summary: pick("description"),
      outlet: sourceMatch ? stripTags(sourceMatch[2]) : "Google News",
      outletUrl: sourceMatch ? decodeEntities(sourceMatch[1]) : "https://news.google.com",
      source: source.label,
      sourceLang: source.lang,
      region: source.lang === "ko" ? "domestic" : "global",
    };
  });
}

function scoreArticle(article) {
  const contentText = `${article.title} ${article.summary}`.toLowerCase();
  const companyHits = watchCompanies.filter((company) => contentText.includes(company.toLowerCase()));
  const taxonomyHits = keywordTaxonomy
    .filter((group) => group.terms.some((term) => contentText.includes(term.toLowerCase())))
    .map((group) => group.key);
  const aiBoost = /\bai\b|artificial intelligence|인공지능|생성형|llm|agent|gpu|tpu|npu/i.test(contentText) ? 5 : 0;
  const policyBoost = /nipa|정보통신산업진흥원|과기정통부|과학기술정보통신부|iitp|정보통신기획평가원|사업공고|지원사업|보도자료|공모/i.test(contentText) ? 10 : 0;
  const recency = article.publishedAt ? Math.max(0, 8 - Math.floor((Date.now() - Date.parse(article.publishedAt)) / 86400000)) : 0;
  const normalizeCompany = (hit) => ({
    Nvidia: "NVIDIA",
    엔비디아: "NVIDIA",
    구글: "Google",
    알파벳: "Google",
    Alphabet: "Google",
    제미나이: "Gemini",
    딥마인드: "DeepMind",
    Rebellions: "리벨리온",
    Furiosa: "퓨리오사AI",
    FuriosaAI: "퓨리오사AI",
    퓨리오사: "퓨리오사AI",
    HyperAccel: "하이퍼엑셀",
    DEEPX: "딥엑스",
    Mobilint: "모빌린트",
  }[hit] || hit);
  const normalizedCompanyHits = [...new Set(companyHits.map(normalizeCompany))];
  const uniqueTaxonomyHits = [...new Set(taxonomyHits)];
  return {
    companyHits: normalizedCompanyHits,
    taxonomyHits: uniqueTaxonomyHits,
    issueCategory: classifyIssue(contentText, uniqueTaxonomyHits, normalizedCompanyHits),
    score: companyHits.length * 4 + taxonomyHits.length * 3 + aiBoost + policyBoost + recency,
  };
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles
    .filter((article) => {
      const key = article.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 120);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((article) => ({ ...article, ...scoreArticle(article) }))
    .sort((a, b) => b.score - a.score || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
}

async function loadNews() {
  const settled = await Promise.allSettled(
    newsQueries.map(async (source) => {
      const xml = await fetchText(googleNewsUrl(source));
      return parseRss(xml, source);
    }),
  );
  const articles = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const errors = settled
    .map((result, index) => (result.status === "rejected" ? `${newsQueries[index].label}: ${result.reason.message}` : null))
    .filter(Boolean);
  return { articles: dedupeArticles(articles).slice(0, 180), errors };
}

function finiteAt(values, index) {
  const value = values?.[index];
  return Number.isFinite(value) ? value : null;
}

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
  const data = JSON.parse(await fetchText(url));
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  const timestamps = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0] || {};
  const candles = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString(),
      open: finiteAt(q.open, index),
      high: finiteAt(q.high, index),
      low: finiteAt(q.low, index),
      close: finiteAt(q.close, index),
    }))
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
  const closes = candles.map((candle) => candle.close);
  const latest = meta?.regularMarketPrice ?? closes.at(-1);
  const previous = meta?.chartPreviousClose ?? closes.at(-2);
  const changePct = latest && previous ? ((latest - previous) / previous) * 100 : null;
  return {
    symbol,
    price: latest ?? null,
    currency: meta?.currency || "",
    changePct,
    previousClose: previous ?? null,
    marketTime: meta?.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    closes,
    candles,
  };
}

async function loadMarket() {
  const all = [...equities, ...indices];
  const settled = await Promise.allSettled(all.map((item) => quote(item.symbol)));
  const quotes = settled.map((result, index) => ({
    ...all[index],
    ...(result.status === "fulfilled" ? result.value : { error: result.reason.message }),
  }));
  return {
    equities: quotes.slice(0, equities.length),
    indices: quotes.slice(equities.length),
    generatedAt: new Date().toISOString(),
  };
}

function topSignals(articles) {
  const counts = new Map();
  const companyCounts = new Map();
  for (const article of articles) {
    for (const key of article.taxonomyHits || []) counts.set(key, (counts.get(key) || 0) + 1);
    for (const company of article.companyHits || []) companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
  }
  for (const key of ["정책", ...technologySignalOrder, "K-엔비디아", "리벨리온", "퓨리오사AI", "하이퍼엑셀", "딥엑스", "모빌린트"]) {
    if (!counts.has(key)) counts.set(key, 0);
  }
  for (const key of ["리벨리온", "퓨리오사AI", "하이퍼엑셀", "딥엑스", "모빌린트"]) {
    if (!companyCounts.has(key)) companyCounts.set(key, 0);
  }
  const pinnedCompanies = ["리벨리온", "퓨리오사AI", "하이퍼엑셀", "딥엑스", "모빌린트"];
  return {
    technologies: technologySignalOrder.map((key) => [key, counts.get(key) || 0]),
    companies: [...companyCounts.entries()].sort((a, b) => {
      const pinScore = pinnedCompanies.includes(b[0]) - pinnedCompanies.includes(a[0]);
      return pinScore || b[1] - a[1];
    }).slice(0, 12),
  };
}

function generatePolicyIdeas(articles, market) {
  const signals = topSignals(articles);
  const techKeys = new Set(signals.technologies.map(([key]) => key));
  const ideas = [
    {
      title: "국산 NPU 수요연계 실증·구매전환 바우처",
      trigger: "실증·조달",
      budgetItem: "비R&D 성격으로 수요기관의 PoC 비용, 클라우드 전환비, 성능검증, 초기 구매비를 패키지로 지원",
      why: "국내 NPU 기업은 기술개발 이후 레퍼런스, 구매사례, 운영검증이 부족해 매출 전환이 지연됩니다.",
      kpi: "유료 전환 PoC 수, 구매계약 금액, 국산 NPU 사용 시간, 고객 재구매율",
      priority: techKeys.has("실증·조달") || techKeys.has("추론") ? "상" : "중",
    },
    {
      title: "AI 서비스 기업·NPU 기업 매칭형 마켓플레이스",
      trigger: "AI시장",
      budgetItem: "AI 서비스·SaaS·SI 기업이 국산 NPU에서 모델을 시험하고 견적을 비교할 수 있는 중개 플랫폼 운영",
      why: "비R&D 사업은 기술 자체보다 수요 발굴과 거래비용 절감이 중요합니다. 시장 접점을 만들면 기업 간 매칭 속도가 올라갑니다.",
      kpi: "등록 수요기업 수, 매칭 건수, PoC 전환율, 상용 계약 전환율",
      priority: techKeys.has("AI시장") || techKeys.has("AI에이전트") ? "상" : "중",
    },
    {
      title: "국산 AI컴퓨팅 성능·전력 검증 인증제",
      trigger: "AI인프라",
      budgetItem: "민간 시험기관과 연계해 추론 성능, 전력효율, 호환성, 보안성을 검증하고 인증마크를 부여",
      why: "구매자는 칩 홍보자료보다 제3자 검증 데이터를 요구합니다. 인증 체계는 조달·금융·해외진출의 공통 근거가 됩니다.",
      kpi: "인증 제품 수, 공개 벤치마크 수, 조달 등록 건수, 인증 기반 계약 금액",
      priority: techKeys.has("AI인프라") || techKeys.has("NVIDIA") ? "상" : "중",
    },
    {
      title: "공공 AI서비스 국산 NPU 우선 실증 트랙",
      trigger: "공공 실증",
      budgetItem: "민원, 문서요약, 보안관제, 제조안전 등 공공 AI서비스에 국산 NPU 적용 가능성을 평가하는 운영비 지원",
      why: "공공 부문은 초기 레퍼런스 시장을 열 수 있습니다. 단순 R&D 과제가 아니라 운영 워크로드 확보에 초점을 둬야 합니다.",
      kpi: "공공 워크로드 수, 서비스 가동률, 비용 절감률, GPU 대비 전력 절감률",
      priority: techKeys.has("실증·조달") ? "상" : "중",
    },
    {
      title: "K-NPU 해외 PoC·전시·파트너링 지원",
      trigger: "글로벌 진출",
      budgetItem: "해외 클라우드·디바이스·AI서비스 파트너 대상 데모 환경, 현지 PoC, 전시회 공동관, 법무·계약 컨설팅 지원",
      why: "국내 시장만으로는 스케일업이 어렵습니다. 비R&D 예산은 해외 고객 접점과 신뢰 확보에 쓰일 때 효과가 큽니다.",
      kpi: "해외 PoC 수, 파트너 MOU, 수출계약 금액, 후속 투자 유치",
      priority: techKeys.has("투자·M&A") || techKeys.has("Google") ? "상" : "중",
    },
    {
      title: "K-엔비디아 기업 공동 데모룸·상설 쇼케이스",
      trigger: "판로·홍보",
      budgetItem: "5개 NPU 기업의 제품을 공공·민간 수요자가 직접 비교 체험할 수 있는 상설 데모룸과 온라인 쇼케이스 운영",
      why: "비R&D 사업은 수요자가 실제 성능과 적용 시나리오를 이해하도록 만드는 접점이 중요합니다.",
      kpi: "방문 수요기관 수, 데모 신청 건수, 후속 상담 건수, PoC 전환율",
      priority: techKeys.has("K-엔비디아") || techKeys.has("NPU") ? "상" : "중",
    },
    {
      title: "국산 NPU 도입 컨설팅·전환 설계 지원단",
      trigger: "수요 전환",
      budgetItem: "수요기업의 기존 GPU 워크로드를 진단하고 국산 NPU 적용 가능성, 비용, 전력, 전환 일정을 설계해주는 컨설팅 지원",
      why: "수요기업은 국산 NPU를 쓰고 싶어도 모델 변환, 운영비 비교, 리스크 판단을 자체적으로 하기 어렵습니다.",
      kpi: "전환진단 보고서 수, 전환 가능 워크로드 수, 실제 PoC 착수율, 예상 비용 절감액",
      priority: techKeys.has("추론") || techKeys.has("AI인프라") ? "상" : "중",
    },
    {
      title: "NPU 친화형 AI서비스 바우처",
      trigger: "AI시장",
      budgetItem: "AI 서비스 기업이 국산 NPU 기반 추론 API나 클라우드 자원을 구매할 때 사용 가능한 바우처 지급",
      why: "AI 시장 전체 수요를 NPU 기업 매출로 연결하려면 서비스 기업의 초기 전환비를 낮춰야 합니다.",
      kpi: "바우처 사용 기업 수, 국산 NPU 사용액, 서비스 출시 건수, 월간 추론 처리량",
      priority: techKeys.has("AI시장") ? "상" : "중",
    },
    {
      title: "국산 NPU 조달 카탈로그·가격 기준 마련",
      trigger: "조달 제도",
      budgetItem: "공공기관이 국산 AI컴퓨팅을 쉽게 구매할 수 있도록 제품·서비스 카탈로그, 가격 기준, 구매 가이드 마련",
      why: "공공 수요는 있어도 구매 규격과 가격 기준이 없으면 실제 계약으로 이어지기 어렵습니다.",
      kpi: "카탈로그 등록 제품 수, 조달 등록 건수, 공공 구매 금액, 구매 리드타임 단축률",
      priority: techKeys.has("실증·조달") ? "상" : "중",
    },
    {
      title: "AI반도체 현장전문인력 전환 교육",
      trigger: "인력·운영",
      budgetItem: "AI 서비스 개발자, MLOps 담당자, 공공 정보화 담당자를 대상으로 NPU 모델 최적화·운영 교육 제공",
      why: "칩 도입은 하드웨어 구매만으로 끝나지 않고 운영인력이 있어야 반복 사용과 확산이 가능합니다.",
      kpi: "교육 수료자 수, 기업별 적용 프로젝트 수, 모델 변환 성공률, 교육 후 PoC 착수율",
      priority: techKeys.has("NPU") || techKeys.has("추론") ? "상" : "중",
    },
    {
      title: "온디바이스 AI 실증처 발굴 프로그램",
      trigger: "온디바이스AI",
      budgetItem: "제조, 보안, 모빌리티, 의료기기 분야에서 국산 NPU 모듈을 적용할 수요처를 발굴하고 실증 운영비 지원",
      why: "데이터 외부 전송이 어렵거나 저전력이 중요한 분야는 국산 NPU가 차별화될 수 있는 초기 시장입니다.",
      kpi: "실증처 수, 제품 탑재 건수, 지연시간 개선, 전력 절감률",
      priority: techKeys.has("온디바이스AI") ? "상" : "중",
    },
    {
      title: "국산 NPU 기반 AI 데이터센터 전력절감 실증",
      trigger: "데이터센터",
      budgetItem: "공공·민간 데이터센터 일부 워크로드를 국산 NPU로 이전해 전력, 냉각, 비용 절감 효과를 검증",
      why: "AI 인프라 비용과 전력 문제가 커질수록 GPU 대체·보완재로서 국산 NPU의 정책 명분이 커집니다.",
      kpi: "전력 절감률, 랙당 처리량, 운영비 절감액, 전환 대상 워크로드 수",
      priority: techKeys.has("데이터센터") || techKeys.has("AI인프라") ? "상" : "중",
    },
    {
      title: "AI컴퓨팅 공급망·수출통제 대응 컨설팅",
      trigger: "수출통제·공급망",
      budgetItem: "국내 NPU 기업과 수요기업에 수출통제, 클라우드 리전, 보안인증, 공급망 리스크 컨설팅을 제공",
      why: "글로벌 GPU 접근성과 수출통제 리스크가 커질수록 국산 AI컴퓨팅 도입의 정책 명분이 커집니다.",
      kpi: "컨설팅 기업 수, 리스크 진단 보고서, 대체 도입 계획, 규제 대응 완료 건수",
      priority: techKeys.has("수출통제·공급망") ? "상" : "중",
    },
  ];
  const weakMarket = market.equities.some((item) => item.changePct < -3);
  if (weakMarket) {
    ideas.unshift({
      title: "투자위축 대응형 구매확약·스케일업 보증",
      trigger: "시장 변동성",
      budgetItem: "비R&D 금융·판로 사업으로 구매확약, 보증, 레퍼런스 확보를 묶어 민간 투자 공백을 완화",
      why: "AI·반도체 주가 변동성이 커지면 비상장 팹리스의 투자 유치와 고객 PoC가 동시에 지연될 수 있습니다.",
      kpi: "구매확약 금액, 보증 연계 금액, 후속 투자 유치, 고용 유지",
      priority: "상",
    });
  }
  return ideas.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "상" ? -1 : 1)).slice(0, 10);
}

function countByIssue(articles) {
  const counts = new Map();
  for (const article of articles) {
    const key = article.issueCategory || "기타";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function generateBriefingReview(articles, market, signals, policyIdeas) {
  const issueCounts = countByIssue(articles);
  const topIssue = issueCounts[0]?.[0] || "AI시장";
  const topTech = signals.technologies.find(([, count]) => count > 0)?.[0] || "NPU";
  const aiMarketCount = issueCounts.find(([key]) => key === "AI시장")?.[1] || 0;
  const npuCount = issueCounts.find(([key]) => key === "NPU")?.[1] || 0;
  const policyCount = issueCounts.find(([key]) => key === "정책")?.[1] || 0;
  const semisWeak = market.indices.some((item) => /SOX|Semiconductor/i.test(`${item.symbol} ${item.name}`) && item.changePct < -1);
  const headline = `${topIssue} 신호가 가장 크며, 정책 설계의 기준 기술축은 ${topTech}로 잡는 것이 적절합니다.`;
  return {
    headline,
    metrics: [
      ["AI시장", aiMarketCount],
      ["NPU", npuCount],
      ["정책", policyCount],
      ["국내 기사", articles.filter((article) => article.region === "domestic").length],
      ["해외 기사", articles.filter((article) => article.region === "global").length],
    ],
    sections: [
      {
        title: "정책수립 시사점",
        body: aiMarketCount >= npuCount
          ? "시장 신호가 기술 신호보다 넓게 잡히고 있어, 신규 예산은 기술공급 지원보다 수요처 확보와 구매전환 구조를 중심에 두는 편이 타당합니다."
          : "NPU 및 제품화 신호가 강하므로, 신규 예산은 연구개발보다 레퍼런스 확보, 운영검증, 성능인증을 통해 상용 전환을 앞당기는 방향이 적절합니다.",
        bullets: [
          `${topTech}는 예산기획의 핵심 기술축으로 유지`,
          "시장 기사는 수요·투자 근거, 정책 기사는 집행근거와 제도개선 근거로 분리 활용",
          "기업별 보조보다 공동 검증·공동 조달·공동 수요처 발굴 체계가 정책효과 측정에 유리",
        ],
      },
      {
        title: "시장·기술동향 판단",
        body: "AI 인프라 투자 확대와 공급망 재편은 국산 NPU에 기회지만, 실제 도입은 성능·전력·가격·운영 안정성 비교자료가 있어야 가능합니다.",
        bullets: [
          "데이터센터 전력비와 추론비용 절감은 가장 설득력 있는 시장 진입 논리",
          "온디바이스AI와 보안·금융 등 폐쇄망 수요는 해외 GPU 대비 차별화 가능성이 큼",
          "파운드리·공급망 이슈는 국산 NPU 정책의 필요조건이지만, 구매전환을 보장하지는 않음",
        ],
      },
      {
        title: "정부정책 방향",
        body: semisWeak
          ? "반도체 투자심리가 약한 구간에서는 직접 보조보다 구매확약, 보증, 실증비, 운영비 절감 검증처럼 민간 리스크를 줄이는 방식이 적합합니다."
          : "시장 여건이 크게 위축되지 않은 구간에서는 공공 실증과 민간 수요처 매칭을 동시에 추진해 초기 매출 레퍼런스를 만드는 방식이 적합합니다.",
        bullets: [
          "실증과 구매전환을 분리하지 말고 한 사업 안에서 단계형으로 설계",
          "공공 AI서비스, 보안·금융, 데이터센터, 온디바이스 산업현장처럼 수요가 명확한 분야부터 선별",
          "성과지표는 과제 수가 아니라 사용시간, 전력절감률, 유료전환율, 구매계약액으로 설정",
        ],
      },
      {
        title: "예산기획 체크포인트",
        body: `우선 검토할 정책 아이템은 "${policyIdeas[0]?.title || "국산 NPU 수요연계 실증·구매전환 바우처"}"입니다. 신규 예산은 제품 개발비보다 수요처 발굴, 실증 운영비, 성능검증, 구매전환 조건을 묶는 방향이 적합합니다.`,
        bullets: [
          "기업별 제품성숙도, 적용 가능 워크로드, 목표 수요처를 표준 양식으로 비교",
          "시장 기사에서 반복되는 수요 분야를 공공 실증 후보 업무로 매핑",
          "사업 공고에는 성능검증, 보안검증, 가격비교, 구매전환 조건을 필수 항목으로 포함",
        ],
      },
    ],
  };
}

function makeBriefing(news, market) {
  const articles = news.articles;
  const signals = topSignals(articles);
  const policyIdeas = generatePolicyIdeas(articles, market);
  const leadArticles = articles.slice(0, 10);
  const review = generateBriefingReview(articles, market, signals, policyIdeas);
  return {
    date: new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeZone: "Asia/Seoul" }).format(new Date()),
    summary: [
      leadArticles[0]?.title ? `오늘의 최상위 이슈: ${leadArticles[0].title}` : "아직 수집된 뉴스가 없습니다.",
      signals.technologies.length ? `강한 기술·시장 신호: ${signals.technologies.slice(0, 5).map(([key, count]) => `${key} ${count}`).join(", ")}` : "기술·시장 신호가 약합니다.",
      signals.companies.length ? `주요 기업 신호: ${signals.companies.slice(0, 5).map(([key, count]) => `${key} ${count}`).join(", ")}` : "기업 직접 언급은 제한적입니다.",
    ],
    leadArticles,
    signals,
    policyIdeas,
    review,
  };
}

export async function dashboardData(force = false) {
  if (force) cache = new Map();
  const [news, market] = await Promise.all([
    getCached("news", loadNews),
    getCached("market", loadMarket),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    news,
    market,
    briefing: makeBriefing(news, market),
    sources: newsQueries.map((source) => ({ label: source.label, url: googleNewsUrl(source) })),
  };
}

async function serveStatic(req, res) {
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const safePath = normalize(requested === "/" ? "/index.html" : requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === "/api/dashboard") {
        sendJson(res, 200, await dashboardData(url.searchParams.get("refresh") === "1"));
        return;
      }
      if (url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true, now: new Date().toISOString() });
        return;
      }
      await serveStatic(req, res);
    } catch (error) {
      sendJson(res, 500, {
        error: "데이터를 불러오지 못했습니다.",
        detail: error.message,
      });
    }
  }).listen(PORT, () => {
    console.log(`AI Chip Intelligence dashboard: http://localhost:${PORT}`);
  });
}
