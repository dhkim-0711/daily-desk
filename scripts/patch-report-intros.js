import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const roots = ["docs", "public"];

async function patchWeekly(base) {
  const dir = join(rootDir, base, "reports", "weekly");
  const files = (await readdir(dir)).filter((file) => /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.md$/.test(file));
  for (const file of files) {
    const [start, end] = file.replace(/\.md$/, "").split("_");
    const path = join(dir, file);
    let text = await readFile(path, "utf8");
    const lines = text.replace(/\r/g, "").split("\n");
    const titleIndex = lines.findIndex((line) => line.startsWith("# "));
    if (titleIndex < 0) continue;
    let firstSection = lines.findIndex((line, index) => index > titleIndex && line.startsWith("## "));
    if (firstSection < 0) firstSection = lines.length;
    const body = lines.slice(firstSection);
    const title = lines[titleIndex];
    const intro = [
      title,
      "",
      `> 분석기간: ${start} ~ ${end}  `,
      "> 최근 7일 Daily Desk 브리핑을 바탕으로 단순 기사 요약이 아니라 반복 이슈와 산업적 의미를 연결해 정리한 주간 분석입니다.",
      "",
    ];
    text = [...intro, ...body].join("\n");
    await writeFile(path, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  }
}

async function patchMonthly(base) {
  const dir = join(rootDir, base, "reports", "monthly");
  const files = (await readdir(dir)).filter((file) => /^\d{4}-\d{2}\.md$/.test(file));
  for (const file of files) {
    const path = join(dir, file);
    let text = await readFile(path, "utf8");
    const lines = text.replace(/\r/g, "").split("\n");
    const titleIndex = lines.findIndex((line) => line.startsWith("# "));
    if (titleIndex < 0) continue;
    let firstSection = lines.findIndex((line, index) => index > titleIndex && line.startsWith("## "));
    if (firstSection < 0) firstSection = lines.length;
    const existingIntro = lines.slice(titleIndex + 1, firstSection);
    const dateLine = existingIntro.find((line) => /기준일/.test(line));
    const dateMatch = dateLine?.match(/(20\d{2}-\d{2}-\d{2})/);
    const analysisDate = dateMatch?.[1] || new Date().toISOString().slice(0, 10);
    const body = lines.slice(firstSection);
    const title = lines[titleIndex];
    const intro = [
      title,
      "",
      `> 분석 기준일: ${analysisDate}  `,
      "> 분석 범위: Daily Desk에 1개월간 축적된 브리핑을 중심으로 시장·기술·기업·정책 이슈를 교차 분석했습니다.",
      "",
    ];
    text = [...intro, ...body].join("\n");
    await writeFile(path, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  }
}

for (const base of roots) {
  await patchWeekly(base);
  await patchMonthly(base);
}

console.log("Patched current weekly/monthly report intro wording.");
