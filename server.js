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
    id: "global-ai-chip",
    label: "해외 AI반도체",
    query: '("AI chip" OR NPU OR "AI accelerator" OR "inference chip") (NVIDIA OR Google OR AMD OR Broadcom OR TSMC OR Arm)',
    lang: "en",
  },
  {
    id: "global-policy",
    label: "해외 정책·투자",
    query: '("AI semiconductor" OR "advanced chips") (policy OR subsidy OR export OR fab OR datacenter OR sovereign AI)',
    lang: "en",
  },
  {
    id: "korea-npu",
    label: "국내 NPU 기업",
    query: "(리벨리온 OR 퓨리오사AI OR 퓨리오사 OR 하이퍼엑셀 OR 딥엑스 OR 모빌린트 OR K-엔비디아 OR NPU)",
    lang: "ko",
  },
  {
    id: "ai-market",
    label: "AI 시장·수요",
    query: '("generative AI" OR "AI datacenter" OR "edge AI" OR "AI PC" OR "on-device AI" OR "LLM inference") semiconductor',
    lang: "en",
  },
  {
    id: "korea-ai-policy",
    label: "국내 AI 정책",
    query: "(AI 반도체 OR 인공지능 반도체 OR 온디바이스 AI OR 데이터센터 OR 국가 AI) (정책 OR 예산 OR 투자 OR 사업)",
    lang: "ko",
  },
];

const watchCompanies = [
  "NVIDIA",
  "Google",
  "AMD",
  "Broadcom",
  "TSMC",
  "Arm",
  "Samsung",
  "SK hynix",
  "리벨리온",
  "퓨리오사",
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
  { key: "인퍼런스", terms: ["inference", "추론", "serving", "inference chip", "LLM inference"] },
  { key: "온디바이스", terms: ["edge AI", "on-device", "AI PC", "smartphone", "device", "엣지", "온디바이스"] },
  { key: "데이터센터", terms: ["datacenter", "data center", "rack", "HBM", "liquid cooling", "데이터센터", "전력"] },
  { key: "파운드리·공정", terms: ["TSMC", "Samsung Foundry", "process", "packaging", "advanced packaging", "CoWoS", "파운드리", "패키징"] },
  { key: "수출통제·공급망", terms: ["export control", "sanction", "supply chain", "China", "sovereign", "수출통제", "공급망"] },
  { key: "투자·M&A", terms: ["funding", "investment", "valuation", "IPO", "acquisition", "투자", "상장", "인수"] },
  { key: "공공조달·실증", terms: ["procurement", "pilot", "deployment", "PoC", "실증", "조달", "레퍼런스"] },
];

let cache = new Map();

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  return decodeEntities(String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
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
  const text = `${article.title} ${article.summary}`.toLowerCase();
  const companyHits = watchCompanies.filter((company) => text.includes(company.toLowerCase()));
  const taxonomyHits = keywordTaxonomy
    .filter((group) => group.terms.some((term) => text.includes(term.toLowerCase())))
    .map((group) => group.key);
  const recency = article.publishedAt ? Math.max(0, 6 - Math.floor((Date.now() - Date.parse(article.publishedAt)) / 86400000)) : 0;
  return {
    companyHits,
    taxonomyHits,
    score: companyHits.length * 4 + taxonomyHits.length * 3 + recency,
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
  return { articles: dedupeArticles(articles).slice(0, 80), errors };
}

async function quote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const data = JSON.parse(await fetchText(url));
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close?.filter((value) => Number.isFinite(value)) || [];
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
    dates: timestamps.map((value) => new Date(value * 1000).toISOString()),
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
    for (const key of article.taxonomyHits) counts.set(key, (counts.get(key) || 0) + 1);
    for (const company of article.companyHits) companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
  }
  return {
    technologies: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7),
    companies: [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

function generatePolicyIdeas(articles, market) {
  const signals = topSignals(articles);
  const techKeys = new Set(signals.technologies.map(([key]) => key));
  const ideas = [
    {
      title: "국산 NPU 레퍼런스 확보형 공공 AI 추론 바우처",
      trigger: "공공조달·실증",
      budgetItem: "공공·민간 수요기관이 국산 NPU 기반 추론 서비스를 구매하면 클라우드 사용료와 전환 비용을 지원",
      why: "국내 팹리스의 가장 큰 병목은 칩 성능 홍보가 아니라 운영 레퍼런스와 소프트웨어 검증 데이터입니다.",
      kpi: "국산 NPU 상용 추론 워크로드 30건, 월간 토큰 처리량, 전력당 처리성능, 고객 재구매율",
      priority: techKeys.has("공공조달·실증") || techKeys.has("인퍼런스") ? "상" : "중",
    },
    {
      title: "K-NPU 소프트웨어 스택 상호운용성 사업",
      trigger: "인퍼런스",
      budgetItem: "컴파일러, 런타임, 모델 최적화, 벤치마크를 공동 레이어로 구축하고 기업별 SDK 차이를 흡수",
      why: "칩 자체보다 개발자 전환 비용이 시장 진입을 늦춥니다. 공통 도구와 검증 체계가 생태계 확장의 지렛대입니다.",
      kpi: "지원 모델 수, ONNX/PyTorch 변환 성공률, 개발자 온보딩 시간, 벤치마크 공개 횟수",
      priority: techKeys.has("인퍼런스") ? "상" : "중",
    },
    {
      title: "온디바이스 AI 실증 패키지",
      trigger: "온디바이스",
      budgetItem: "제조·모빌리티·보안·의료기기 분야에 저전력 NPU 모듈, 모델 경량화, 인증 컨설팅을 묶어 지원",
      why: "데이터 주권, 지연시간, 전력 이슈가 커질수록 국내 NPU가 글로벌 GPU와 다른 시장을 만들 수 있습니다.",
      kpi: "제품 탑재 건수, 배터리 사용시간 개선, 지연시간, 개인정보 외부 전송 감소율",
      priority: techKeys.has("온디바이스") ? "상" : "중",
    },
    {
      title: "AI반도체 패키징·HBM 연계 테스트베드",
      trigger: "파운드리·공정",
      budgetItem: "국내 메모리·패키징·EDA 역량과 NPU 팹리스를 묶는 MPW, 패키징, 신뢰성 평가 지원",
      why: "차세대 AI반도체 경쟁은 칩 설계와 메모리 대역폭, 패키징, 전력·열 설계가 함께 움직입니다.",
      kpi: "시제품 tape-out, 패키징 수율, HBM 연동 성능, 해외 고객 평가 진입 건수",
      priority: techKeys.has("파운드리·공정") || techKeys.has("데이터센터") ? "상" : "중",
    },
    {
      title: "수출통제 대응형 AI컴퓨팅 주권 과제",
      trigger: "수출통제·공급망",
      budgetItem: "제재·공급망 리스크 시나리오별 대체 칩, 국내 클라우드, 공공 필수 AI서비스 운영계획 수립",
      why: "글로벌 고성능 GPU 접근성이 정책 리스크가 되면 국산 AI컴퓨팅 역량은 산업정책이자 안보정책이 됩니다.",
      kpi: "필수 서비스별 대체 가능성, 국산 칩 전환 기간, 공급망 리스크 지표, 공공 클라우드 적용 건수",
      priority: techKeys.has("수출통제·공급망") ? "상" : "중",
    },
  ];
  const weakMarket = market.equities.some((item) => item.changePct < -3);
  if (weakMarket) {
    ideas.unshift({
      title: "시장 변동성 대응형 스케일업 금융·구매확약",
      trigger: "시장 급락",
      budgetItem: "민간 투자 위축기에 R&D 후속자금, 선구매, 조건부 구매확약을 결합해 성장 공백을 방지",
      why: "상장 빅테크·반도체주의 변동성이 커지면 비상장 팹리스의 투자 유치와 고객 PoC도 지연될 수 있습니다.",
      kpi: "후속투자 유치, 구매확약 금액, 고용 유지, 해외 PoC 지속률",
      priority: "상",
    });
  }
  return ideas.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "상" ? -1 : 1)).slice(0, 5);
}

function makeBriefing(news, market) {
  const articles = news.articles;
  const signals = topSignals(articles);
  const policyIdeas = generatePolicyIdeas(articles, market);
  const leadArticles = articles.slice(0, 8);
  return {
    date: new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeZone: "Asia/Seoul" }).format(new Date()),
    summary: [
      leadArticles[0]?.title ? `오늘 가장 강한 신호는 "${leadArticles[0].title}"입니다.` : "아직 수집된 뉴스가 없습니다.",
      signals.technologies.length ? `반복 출현 기술 키워드: ${signals.technologies.map(([key, count]) => `${key}(${count})`).join(", ")}` : "기술 키워드 신호가 약합니다.",
      signals.companies.length ? `관측 기업: ${signals.companies.map(([key, count]) => `${key}(${count})`).join(", ")}` : "기업명 직접 언급은 제한적입니다.",
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
