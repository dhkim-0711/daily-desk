import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const refreshHoursKst = [7, 10, 13, 16, 19, 22];
const refreshMinute = 10;
const primarySchedule = "10 22,1,4,7,10,13 * * *";
const watchdogSchedule = "43 * * * *";
const koreaOffsetMs = 9 * 60 * 60 * 1000;
const emergencyStaleAfterMs = 4 * 60 * 60 * 1000;
const schedule = process.argv[2] || "";

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    return;
  }
  console.log(`${name}=${value}`);
}

function getLatestRefreshSlot(now) {
  const kstNow = new Date(now.getTime() + koreaOffsetMs);
  const dayStart = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  ) - koreaOffsetMs;

  for (const hour of [...refreshHoursKst].reverse()) {
    const slot = dayStart + hour * 60 * 60 * 1000 + refreshMinute * 60 * 1000;
    if (slot <= now.getTime()) {
      return slot;
    }
  }

  return dayStart - 24 * 60 * 60 * 1000 + 22 * 60 * 60 * 1000 + refreshMinute * 60 * 1000;
}

async function decideRefresh() {
  if (!schedule) {
    console.log("Manual or push refresh received.");
    return { shouldRefresh: true, reason: "manual_or_push" };
  }

  if (schedule === primarySchedule) {
    console.log("Primary 3-hour collection slot received.");
    return { shouldRefresh: true, reason: "primary_slot" };
  }

  if (schedule !== watchdogSchedule) {
    console.warn(`Unknown schedule received: ${schedule}. Treating it as a refresh request.`);
    return { shouldRefresh: true, reason: "unknown_schedule" };
  }

  try {
    const snapshot = JSON.parse(await readFile(join(rootDir, "docs", "data", "dashboard.json"), "utf8"));
    const generatedAt = Date.parse(snapshot.generatedAt || "");
    const now = new Date();
    const latestSlot = getLatestRefreshSlot(now);
    const ageMs = Number.isNaN(generatedAt) ? Infinity : now.getTime() - generatedAt;

    if (Number.isNaN(generatedAt)) {
      console.warn("Watchdog refresh started: latest snapshot timestamp is missing.");
      return { shouldRefresh: true, reason: "missing_timestamp" };
    }

    if (generatedAt >= latestSlot) {
      console.log(`Watchdog check skipped: current KST slot was collected at ${snapshot.generatedAt}.`);
      return { shouldRefresh: false, reason: "current_slot_collected" };
    }

    if (ageMs >= emergencyStaleAfterMs) {
      console.warn(`Emergency refresh started: snapshot age is ${Math.round(ageMs / 60000)} minutes.`);
      return { shouldRefresh: true, reason: "emergency_stale" };
    }

    console.log(`Missed-slot refresh started: latest snapshot predates the ${new Date(latestSlot).toISOString()} slot.`);
    return { shouldRefresh: true, reason: "missed_slot" };
  } catch (error) {
    console.warn("Watchdog refresh started: latest snapshot could not be read.", error.message);
    return { shouldRefresh: true, reason: "missing_snapshot" };
  }
}

const result = await decideRefresh();
await setOutput("should_refresh", result.shouldRefresh ? "true" : "false");
await setOutput("refresh_reason", result.reason);
