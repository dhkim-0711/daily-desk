import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { getLatestRefreshSlot } from '../scripts/should-refresh-data.js';

test('watchdog recognizes 09:20 briefing slot without changing regular slots',()=>{
  for (const [clock,expected] of [['09:19:59','07:10:00'],['09:20:00','09:20:00'],['09:43:00','09:20:00'],['10:10:00','10:10:00']])
    assert.equal(getLatestRefreshSlot(new Date(`2026-10-07T${clock}+09:00`)),Date.parse(`2026-10-07T${expected}+09:00`));
  assert.equal(getLatestRefreshSlot(new Date('2026-10-07T00:01:00+09:00')),Date.parse('2026-10-06T22:10:00+09:00'));
});
test('pre-briefing cron always requests fresh collection instead of treating 07:10 as sufficient',()=>{
  const output=execFileSync(process.execPath,['scripts/should-refresh-data.js','20 0 * * *'],{cwd:new URL('..',import.meta.url),env:{...process.env,GITHUB_OUTPUT:''},encoding:'utf8'});
  assert.match(output,/should_refresh=true/);assert.match(output,/refresh_reason=pre_briefing_slot/);
});
