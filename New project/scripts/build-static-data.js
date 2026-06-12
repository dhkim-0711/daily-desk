import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardData } from "../server.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");
const dataDir = join(publicDir, "data");

const data = await dashboardData(true);
const json = JSON.stringify(data, null, 2);

await mkdir(dataDir, { recursive: true });
await writeFile(join(dataDir, "dashboard.json"), json, "utf8");
await writeFile(
  join(publicDir, "data-snapshot.js"),
  `window.__DASHBOARD_DATA__ = ${json};\n`,
  "utf8",
);

console.log(`Wrote ${data.news.articles.length} articles to public/data-snapshot.js`);
