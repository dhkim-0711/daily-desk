import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicArchiveDir = join(rootDir, "public", "data", "archive");
const docsArchiveDir = join(rootDir, "docs", "data", "archive");

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
  // Keep metadata, summaries and source links for analysis/navigation, but do not
  // replicate full publisher article bodies into the permanent archive.
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

async function writeMirror(path, content) {
  await writeFile(join(publicArchiveDir, path), content, "utf8");
  await writeFile(join(docsArchiveDir, path), content, "utf8");
}

await mkdir(publicArchiveDir, { recursive: true });
await mkdir(docsArchiveDir, { recursive: true });

const { stdout: logOutput } = await execFileAsync(
  "git",
  ["log", "--format=%H", "--reverse", "--all", "--", "docs/data/dashboard.json"],
  { cwd: rootDir, maxBuffer: 1024 * 1024 * 10 },
);
const commits = logOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const articleMap = new Map();
let snapshotsScanned = 0;
let articleOccurrences = 0;

for (const sha of commits) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["show", `${sha}:docs/data/dashboard.json`],
      { cwd: rootDir, maxBuffer: 1024 * 1024 * 30 },
    );
    const snapshot = JSON.parse(stdout);
    const articles = snapshot?.news?.articles || [];
    if (!Array.isArray(articles)) continue;
    const seenAt = snapshot.generatedAt || null;
    snapshotsScanned += 1;
    articleOccurrences += articles.length;
    for (const article of articles) {
      const key = articleKey(article);
      articleMap.set(key, mergeArticle(articleMap.get(key), article, seenAt));
    }
  } catch (error) {
    console.warn(`Skipped historical snapshot ${sha.slice(0, 8)}: ${error.message}`);
  }
}

// Include the current working-tree snapshot as a final safety net.
try {
  const current = JSON.parse(await readFile(join(rootDir, "docs", "data", "dashboard.json"), "utf8"));
  const seenAt = current.generatedAt || null;
  for (const article of current?.news?.articles || []) {
    const key = articleKey(article);
    articleMap.set(key, mergeArticle(articleMap.get(key), article, seenAt));
  }
} catch {
  // Git history remains the source of truth if the working-tree snapshot is absent.
}

const byMonth = new Map();
for (const article of articleMap.values()) {
  const month = monthKey(article.publishedAt);
  if (!byMonth.has(month)) byMonth.set(month, []);
  byMonth.get(month).push(article);
}

const recoveredAt = new Date().toISOString();
const months = [];
for (const [month, articles] of [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
  const sorted = sortArticles(articles);
  const payload = { month, updatedAt: recoveredAt, articles: sorted };
  await writeMirror(`${month}.json`, `${JSON.stringify(payload, null, 2)}\n`);
  months.push({
    month,
    file: `${month}.json`,
    count: sorted.length,
    newestPublishedAt: sorted[0]?.publishedAt || null,
    oldestPublishedAt: sorted.at(-1)?.publishedAt || null,
  });
}

const index = {
  version: 1,
  updatedAt: recoveredAt,
  recovery: {
    source: "git-history",
    recoveredAt,
    commitsFound: commits.length,
    snapshotsScanned,
    articleOccurrences,
    uniqueArticles: articleMap.size,
  },
  totalArticles: articleMap.size,
  months,
};
await writeMirror("index.json", `${JSON.stringify(index, null, 2)}\n`);

console.log(`Recovered ${articleMap.size} unique articles from ${snapshotsScanned}/${commits.length} committed snapshots.`);
console.log(`Archive months: ${months.map((item) => `${item.month}:${item.count}`).join(", ")}`);
