import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const recoveryCron = "25 22,1,4,7,10,13 * * *";
const staleAfterMs = 70 * 60 * 1000;
const schedule = process.argv[2] || "";

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    return;
  }
  console.log(`${name}=${value}`);
}

async function decideRefresh() {
  if (schedule !== recoveryCron) {
    console.log(`Regular refresh schedule received: ${schedule || "manual dispatch"}`);
    return { shouldRefresh: true, reason: "regular" };
  }

  try {
    const snapshot = JSON.parse(await readFile(join(rootDir, "docs", "data", "dashboard.json"), "utf8"));
    const generatedAt = Date.parse(snapshot.generatedAt || "");
    const ageMs = Number.isNaN(generatedAt) ? Infinity : Date.now() - generatedAt;
    if (ageMs < staleAfterMs) {
      console.log(`Recovery check skipped: snapshot age is ${Math.round(ageMs / 60000)} minutes.`);
      return { shouldRefresh: false, reason: "fresh" };
    }
    console.log(`Recovery refresh started: snapshot age is ${Math.round(ageMs / 60000)} minutes.`);
    return { shouldRefresh: true, reason: "stale" };
  } catch (error) {
    console.warn("Recovery refresh started: latest snapshot could not be read.", error.message);
    return { shouldRefresh: true, reason: "missing_snapshot" };
  }
}

const result = await decideRefresh();
await setOutput("should_refresh", result.shouldRefresh ? "true" : "false");
await setOutput("refresh_reason", result.reason);
