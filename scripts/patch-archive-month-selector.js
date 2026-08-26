import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const files = [join(rootDir, "public", "app.js"), join(rootDir, "docs", "app.js")];
const marker = "// NEWS_ARCHIVE_MONTH_SELECTOR_V2";
const before = '  const months = [...new Set([...state.archiveMonths, ...articles.map((article) => monthKey(article.publishedAt))])].filter(Boolean).sort().reverse();';
const after = `  ${marker}\n  const recentMonths = [...new Set(articles.map((article) => monthKey(article.publishedAt)))].filter(Boolean).sort().reverse();\n  const months = state.archiveMonths.length ? [...state.archiveMonths] : recentMonths;`;

for (const file of files) {
  let source = await readFile(file, "utf8");
  if (source.includes(marker)) {
    console.log(`Archive month selector already patched: ${file}`);
    continue;
  }
  if (!source.includes(before)) throw new Error(`Archive month selector target not found: ${file}`);
  source = source.replace(before, after);
  await writeFile(file, source, "utf8");
  console.log(`Patched archive month selector: ${file}`);
}
