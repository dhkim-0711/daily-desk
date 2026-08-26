import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardData } from "../server.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");
const docsDir = join(rootDir, "docs");
const dataDir = join(publicDir, "data");
const docsDataDir = join(docsDir, "data");
const publicArchiveDir = join(dataDir, "archive");
const docsArchiveDir = join(docsDataDir, "archive");

async function readPreviousDashboard() {
  for (const file of [join(docsDataDir, "dashboard.json"), join(dataDir, "dashboard.json")]) {
    try {
      const previous = JSON.parse(await readFile(file, "utf8"));
      if (previous?.news?.articles?.length) return previous;
    } catch {
      // Try the next snapshot location.
    }
  }
  return null;
}

function preservePreviousNewsWhenFetchFails(data, previous) {
  if (data.news.articles.length || !data.news.errors?.length || !previous?.news?.articles?.length) return data;
  return {
    ...previous,
    market: data.market,
    sources: data.sources,
    news: {
      ...previous.news,
      errors: [
        `이번 자동 수집에서 Google News RSS가 모두 실패해 이전 정상 뉴스 ${previous.news.articles.length}건을 유지했습니다.`,
        ...data.news.errors,
      ],
    },
  };
}

function normalizeTitle(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function articleKey(article = {}) {
  const title = normalizeTitle(article.title);
  if (title) return `title:${title}`;
  if (article.link) return `link:${article.link}`;
  return `fallback:${article.publishedAt || ""}:${article.outlet || ""}:${article.source || ""}`;
}

function compactArticle(article = {}) {
  const { fullText, ...rest } = article;
  return rest;
}

function richness(article = {}) {
  return (article.fullSummary?.length || 0) * 3
    + (article.summary?.length || 0)
    + (article.taxonomyHits?.length || 0) * 50
    + (article.companyHits?.length || 0) * 50
    + Object.values(article).filter((value) => value !== null && value !== undefined && value !== "").length * 5;
}

function minIso(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function maxIso(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function mergeArticle(existing, incoming, seenAt) {
  const cleanIncoming = compactArticle(incoming);
  if (!existing) {
    return {
      ...cleanIncoming,
      firstSeenAt: cleanIncoming.firstSeenAt || seenAt || null,
      lastSeenAt: cleanIncoming.lastSeenAt || seenAt || null,
    };
  }
  const primary = richness(cleanIncoming) > richness(existing) ? cleanIncoming : existing;
  const secondary = primary === cleanIncoming ? existing : cleanIncoming;
  const merged = { ...secondary, ...primary };
  for (const [key, value] of Object.entries(secondary)) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") merged[key] = value;
  }
  merged.taxonomyHits = [...new Set([...(existing.taxonomyHits || []), ...(cleanIncoming.taxonomyHits || [])])];
  merged.companyHits = [...new Set([...(existing.companyHits || []), ...(cleanIncoming.companyHits || [])])];
  merged.firstSeenAt = minIso(existing.firstSeenAt, cleanIncoming.firstSeenAt || seenAt);
  merged.lastSeenAt = maxIso(existing.lastSeenAt, cleanIncoming.lastSeenAt || seenAt);
  return merged;
}

function monthKey(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sortArticles(articles) {
  return articles.sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0) || (b.score || 0) - (a.score || 0));
}

async function readArchiveMonth(month) {
  for (const file of [join(docsArchiveDir, `${month}.json`), join(publicArchiveDir, `${month}.json`)]) {
    try {
      const payload = JSON.parse(await readFile(file, "utf8"));
      if (Array.isArray(payload?.articles)) return payload;
    } catch {
      // Try the mirrored location next.
    }
  }
  return { month, articles: [] };
}

async function readArchiveIndex() {
  for (const file of [join(docsArchiveDir, "index.json"), join(publicArchiveDir, "index.json")]) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      // Try the mirrored location next.
    }
  }
  return null;
}

async function writeArchiveMirror(file, payload) {
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(join(publicArchiveDir, file), json, "utf8");
  await writeFile(join(docsArchiveDir, file), json, "utf8");
}

async function updateNewsArchive(articles, seenAt) {
  await mkdir(publicArchiveDir, { recursive: true });
  await mkdir(docsArchiveDir, { recursive: true });

  const grouped = new Map();
  for (const article of articles) {
    const month = monthKey(article.publishedAt);
    if (!grouped.has(month)) grouped.set(month, []);
    grouped.get(month).push(article);
  }

  for (const [month, incoming] of grouped) {
    const existing = await readArchiveMonth(month);
    const map = new Map();
    for (const article of existing.articles || []) map.set(articleKey(article), compactArticle(article));
    for (const article of incoming) {
      const key = articleKey(article);
      map.set(key, mergeArticle(map.get(key), article, seenAt));
    }
    const merged = sortArticles([...map.values()]);
    await writeArchiveMirror(`${month}.json`, {
      month,
      updatedAt: seenAt || new Date().toISOString(),
      articles: merged,
    });
  }

  const previousIndex = await readArchiveIndex();
  const files = (await readdir(docsArchiveDir)).filter((file) => /^\d{4}-\d{2}\.json$/.test(file));
  const storedMonths = [];
  let collectionStartedAt = previousIndex?.recovery?.collectionStartedAt || null;

  for (const file of files) {
    const payload = JSON.parse(await readFile(join(docsArchiveDir, file), "utf8"));
    const archived = sortArticles(payload.articles || []);
    for (const article of archived) collectionStartedAt = minIso(collectionStartedAt, article.firstSeenAt);
    storedMonths.push({
      month: payload.month || file.replace(/\.json$/, ""),
      file,
      count: archived.length,
      newestPublishedAt: archived[0]?.publishedAt || null,
      oldestPublishedAt: archived.at(-1)?.publishedAt || null,
    });
  }
  storedMonths.sort((a, b) => b.month.localeCompare(a.month));

  const collectionStartMonth = collectionStartedAt ? monthKey(collectionStartedAt) : null;
  const months = collectionStartMonth
    ? storedMonths.filter((item) => item.month !== "unknown" && item.month >= collectionStartMonth)
    : storedMonths.filter((item) => item.month !== "unknown");
  const recovery = previousIndex?.recovery
    ? { ...previousIndex.recovery, collectionStartedAt, collectionStartMonth }
    : { collectionStartedAt, collectionStartMonth };

  await writeArchiveMirror("index.json", {
    version: 1,
    updatedAt: seenAt || new Date().toISOString(),
    recovery,
    totalArticles: months.reduce((sum, item) => sum + item.count, 0),
    storedArticles: storedMonths.reduce((sum, item) => sum + item.count, 0),
    months,
  });
  return months;
}

const previous = await readPreviousDashboard();
const data = preservePreviousNewsWhenFetchFails(await dashboardData(true), previous);
const json = JSON.stringify(data, null, 2);

await mkdir(dataDir, { recursive: true });
await mkdir(docsDataDir, { recursive: true });
await writeFile(join(dataDir, "dashboard.json"), json, "utf8");
await writeFile(join(docsDataDir, "dashboard.json"), json, "utf8");
await writeFile(join(publicDir, "data-snapshot.js"), `window.__DASHBOARD_DATA__ = ${json};\n`, "utf8");
await writeFile(join(docsDir, "data-snapshot.js"), `window.__DASHBOARD_DATA__ = ${json};\n`, "utf8");

const archiveMonths = await updateNewsArchive(data.news.articles, data.generatedAt);
console.log(`Wrote ${data.news.articles.length} recent-feed articles to public/ and docs/ snapshots`);
console.log(`News archive exposes ${archiveMonths.length} collection-period months.`);
