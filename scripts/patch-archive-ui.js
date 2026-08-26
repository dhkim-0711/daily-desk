import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const targets = [join(rootDir, "public", "app.js"), join(rootDir, "docs", "app.js")];
const marker = "// NEWS_ARCHIVE_UI_V1";

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Archive UI patch target not found: ${label}`);
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

const archiveHelpers = `${marker}
function normalizeArchiveTitle(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\\s+-\\s+[^-]+$/, "")
    .replace(/[^\\p{L}\\p{N}]+/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function archiveArticleKey(article = {}) {
  const title = normalizeArchiveTitle(article.title);
  if (title) return \`title:\${title}\`;
  if (article.link) return \`link:\${article.link}\`;
  return \`fallback:\${article.publishedAt || ""}:\${article.outlet || ""}:\${article.source || ""}\`;
}

function archiveArticleRichness(article = {}) {
  return (article.fullSummary?.length || 0) * 3
    + (article.summary?.length || 0)
    + (article.taxonomyHits?.length || 0) * 50
    + (article.companyHits?.length || 0) * 50;
}

function mergeArchiveArticles(current = [], archived = []) {
  const map = new Map();
  for (const article of [...current, ...archived]) {
    const key = archiveArticleKey(article);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, article);
      continue;
    }
    const primary = archiveArticleRichness(article) > archiveArticleRichness(existing) ? article : existing;
    const secondary = primary === article ? existing : article;
    map.set(key, {
      ...secondary,
      ...primary,
      taxonomyHits: [...new Set([...(existing.taxonomyHits || []), ...(article.taxonomyHits || [])])],
      companyHits: [...new Set([...(existing.companyHits || []), ...(article.companyHits || [])])],
    });
  }
  return [...map.values()];
}

async function loadArchiveIndex() {
  if (state.archiveIndexLoaded) return;
  state.archiveIndexLoaded = true;
  try {
    const response = await fetch(\`data/archive/index.json?v=\${Date.now()}\`, { cache: "no-store" });
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    const payload = await response.json();
    state.archiveMonths = (payload.months || [])
      .map((entry) => typeof entry === "string" ? entry : entry.month)
      .filter(Boolean)
      .sort()
      .reverse();
  } catch (error) {
    console.warn("News archive index is not available yet", error);
    state.archiveMonths = [];
  }
}

async function ensureArchiveMonthLoaded(month) {
  if (!month || month === "all" || state.archiveLoadedMonths.has(month)) return;
  try {
    const response = await fetch(\`data/archive/\${month}.json?v=\${Date.now()}\`, { cache: "no-store" });
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    const payload = await response.json();
    state.data.news.articles = mergeArchiveArticles(state.data.news.articles, payload.articles || []);
    state.archiveLoadedMonths.add(month);
  } catch (error) {
    console.warn(\`News archive \${month} could not be loaded\`, error);
  }
}
`;

for (const path of targets) {
  let source = await readFile(path, "utf8");
  if (source.includes(marker)) {
    console.log(`Archive UI already patched: ${path}`);
    continue;
  }

  source = replaceOnce(
    source,
    '  policyIdeas: null,\n};',
    '  policyIdeas: null,\n  archiveMonths: [],\n  archiveLoadedMonths: new Set(),\n  archiveIndexLoaded: false,\n  recentArticleKeys: new Set(),\n};',
    "state archive fields",
  );

  source = replaceOnce(
    source,
    'const $$ = (selector) => [...document.querySelectorAll(selector)];\n',
    `const $$ = (selector) => [...document.querySelectorAll(selector)];\n\n${archiveHelpers}\n`,
    "archive helpers insertion",
  );

  source = replaceOnce(
    source,
    'function articleMatches(article, options = {}) {\n  const haystack = articleText(article);\n  if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) return false;',
    'function articleMatches(article, options = {}) {\n  const haystack = articleText(article);\n  if (state.month === "all" && state.recentArticleKeys.size && !state.recentArticleKeys.has(archiveArticleKey(article))) return false;\n  if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) return false;',
    "recent feed article filter",
  );

  source = replaceOnce(
    source,
    '  const months = [...new Set(articles.map((article) => monthKey(article.publishedAt)))].filter(Boolean).sort().reverse();',
    '  const months = [...new Set([...state.archiveMonths, ...articles.map((article) => monthKey(article.publishedAt))])].filter(Boolean).sort().reverse();',
    "archive month selector",
  );

  source = replaceOnce(
    source,
    '  for (const article of articles) {\n    if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) continue;\n    const key = dayKey(article.publishedAt);',
    '  for (const article of articles) {\n    if (state.month === "all" && state.recentArticleKeys.size && !state.recentArticleKeys.has(archiveArticleKey(article))) continue;\n    if (state.month !== "all" && monthKey(article.publishedAt) !== state.month) continue;\n    const key = dayKey(article.publishedAt);',
    "archive date counts",
  );

  source = replaceOnce(
    source,
    '<option value="all">전체 월</option>',
    '<option value="all">최근 피드</option>',
    "recent feed month label",
  );

  source = replaceOnce(
    source,
    '$("#monthSelect").addEventListener("change", (event) => {\n  state.month = event.target.value;\n  state.date = "all";\n  render();\n});',
    '$("#monthSelect").addEventListener("change", async (event) => {\n  state.month = event.target.value;\n  state.date = "all";\n  await ensureArchiveMonthLoaded(state.month);\n  render();\n});',
    "archive month load handler",
  );

  source = replaceOnce(
    source,
    '    state.policyIdeas = loadSavedPolicyIdeas(state.data) || state.data.briefing.policyIdeas.map((idea) => ({ ...idea }));\n    render();',
    '    state.archiveLoadedMonths.clear();\n    state.archiveIndexLoaded = false;\n    state.recentArticleKeys = new Set((state.data?.news?.articles || []).map(archiveArticleKey));\n    await loadArchiveIndex();\n    state.policyIdeas = loadSavedPolicyIdeas(state.data) || state.data.briefing.policyIdeas.map((idea) => ({ ...idea }));\n    render();',
    "primary dashboard render",
  );

  source = replaceOnce(
    source,
    '      state.policyIdeas = loadSavedPolicyIdeas(state.data) || state.data.briefing.policyIdeas.map((idea) => ({ ...idea }));\n      render();',
    '      state.archiveLoadedMonths.clear();\n      state.archiveIndexLoaded = false;\n      state.recentArticleKeys = new Set((state.data?.news?.articles || []).map(archiveArticleKey));\n      await loadArchiveIndex();\n      state.policyIdeas = loadSavedPolicyIdeas(state.data) || state.data.briefing.policyIdeas.map((idea) => ({ ...idea }));\n      render();',
    "snapshot fallback render",
  );

  await writeFile(path, source, "utf8");
  console.log(`Patched archive UI: ${path}`);
}
