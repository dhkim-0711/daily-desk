import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardData } from "../server.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");
const docsDir = join(rootDir, "docs");
const dataDir = join(publicDir, "data");
const docsDataDir = join(docsDir, "data");

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

const previous = await readPreviousDashboard();
const data = preservePreviousNewsWhenFetchFails(await dashboardData(true), previous);
const json = JSON.stringify(data, null, 2);

await mkdir(dataDir, { recursive: true });
await mkdir(docsDataDir, { recursive: true });
await writeFile(join(dataDir, "dashboard.json"), json, "utf8");
await writeFile(join(docsDataDir, "dashboard.json"), json, "utf8");
await writeFile(
  join(publicDir, "data-snapshot.js"),
  `window.__DASHBOARD_DATA__ = ${json};\n`,
  "utf8",
);
await writeFile(
  join(docsDir, "data-snapshot.js"),
  `window.__DASHBOARD_DATA__ = ${json};\n`,
  "utf8",
);

console.log(`Wrote ${data.news.articles.length} articles to public/ and docs/ snapshots`);
