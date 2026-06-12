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
    query: '("AI market" OR "generative AI" OR "AI adoption" OR "AI revenue" OR "AI spending" OR "AI infrastructure")',
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
    id: "korea-ai-market",
    label: "국내 AI 시장",
    query: "(생성형 AI OR AI 에이전트 OR 인공지능 서비스 OR AI 데이터센터 OR 온디바이스 AI OR AI 반도체)",
    lang: "ko",
  },
  {
    id: "korea-ai-policy",
    label: "국내 AI 정책",
    query: "(AI 반도체 OR 인공지능 반도체 OR 국가 AI OR AI 컴퓨팅 OR 데이터센터) (정책 OR 예산 OR 투자 OR 사업 OR 조달)",
    lang: "ko",
  },
];

const watchCompanies = [
  "NVIDIA",
  "Nvidia",
  "Google",
  "Alphabet",
  "Gemini",
  "DeepMind",
  "TPU",
  "AMD",
  "Broadcom",
  "TSMC",
  "Arm",
  "Samsung",
  "SK hynix",
  "리벨리온",
  "퓨리오사",
  "퓨리오사AI",
  "하이퍼엑셀",
  "딥엑스",
  "모빌린트",
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
  { key: "AI시장", terms: ["ai market", "ai adoption", "ai spending", "ai revenue", "enterprise ai", "생성형 ai", "인공지능 서비스"] },
  { key: "AI에이전트", terms: ["ai agent", "agentic ai", "에이전트", "agent"] },
  { key: "AI인프라", terms: ["ai infrastructure", "ai datacenter", "datacenter", "data center", "cloud", "데이터센터", "클라우드"] },
  { key: "인퍼런스", terms: ["inference", "serving", "llm inference", "추론"] },
  { key: "온디바이스", terms: ["edge ai", "on-device", "ai pc", "smartphone", "device", "엣지", "온디바이스"] },
  { key: "NVIDIA", terms: ["nvidia", "blackwell", "rubin", "cuda"] },
  { key: "Google", terms: ["google", "alphabet", "gemini", "deepmind", "tpu"] },
  { key: "파운드리·패키징", terms: ["tsmc", "samsung foundry", "process", "packaging", "advanced packaging", "cowos", "파운드리", "패키징"] },
  { key: "수출통제·공급망", terms: ["export control", "sanction", "supply chain", "china", "sovereign", "수출통제", "공급망"] },
  { key: "투자·M&A", terms: ["funding", "investment", "valuation", "ipo", "acquisition", "투자", "상장", "인수"] },
  { key: "실증·조달", terms: ["procurement", "pilot", "deployment", "poc", "실증", "조달", "레퍼런스"] },
];

let cache = new Map();

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
      source,
    };
  });
}

function scoreArticle(article) {
  const text = `${article.title} ${article.summary} ${article.source}`.toLowerCase();
  const companyHits = watchCompanies.filter((company) => text.includes(company.toLowerCase()));
  const taxonomyHits = keywordTaxonomy
    .filter((group) => group.terms.some((term) => text.includes(term.toLowerCase())))
    .map((group) => group.key);
  const aiBoost = /\bai\b|artificial intelligence|인공지능|생성형|llm|agent|gpu|tpu|npu/i.test(text) ? 5 : 0;
  const recency = article.publishedAt ? Math.max(0, 8 - Math.floor((Date.now() - Date.parse(article.publishedAt)) / 86400000)) : 0;
  return {
    companyHits: [...new Set(companyHits.map((hit) => (hit === "Nvidia" ? "NVIDIA" : hit)))],
    taxonomyHits: [...new Set(taxonomyHits)],
    score: companyHits.length * 4 + taxonomyHits.length * 3 + aiBoost + recency,
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
      return parseRss(xml, source.label);
    }),
  );
  const articles = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const errors = settled
    .map((result, index) => (result.status === "rejected" ? `${newsQueries[index].label}: ${result.reason.message}` : null))
    .filter(Boolean);
  return { articles: dedupeArticles(articles).slice(0, 140), errors };
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
  return {
    technologies: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    companies: [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
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
      priority: techKeys.has("실증·조달") || techKeys.has("인퍼런스") ? "상" : "중",
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
  return ideas.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "상" ? -1 : 1)).slice(0, 6);
}

function makeBriefing(news, market) {
  const articles = news.articles;
  const signals = topSignals(articles);
  const policyIdeas = generatePolicyIdeas(articles, market);
  const leadArticles = articles.slice(0, 10);
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
