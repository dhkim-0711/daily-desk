import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('static build retains archive tail and history without enlarging page payload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'daily-desk-archive-'));
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(join(root, 'docs/data/archive'), { recursive: true });
    for (const name of ['server.js', 'package.json', 'scripts/build-static-data.js'])
      await copyFile(new URL('../' + name, import.meta.url), join(root, name));
    const historical = { month: '2026-01', articles: [{ title: 'Preserved historical event', link: 'https://history.test/event',
      publishedAt: '2026-01-01T00:00:00Z', firstSeenAt: '2026-01-01T01:00:00Z' }] };
    await writeFile(join(root, 'docs/data/archive/2026-01.json'), JSON.stringify(historical));
    await writeFile(join(root, 'mock.mjs'), `
      const date = new Date(Date.now() - 1000).toUTCString();
      const items = Array.from({length:225},(_,n)=>'<item><title>Current AI contract '+n+'</title><link>https://fixture.test/'+n+'</link><pubDate>'+date+'</pubDate></item>').join('');
      globalThis.fetch = async url => ({ ok:true, text: async () => String(url).includes('finance.yahoo.com')
        ? JSON.stringify({chart:{result:[]}}) : /news.google.com|feed\\/|releases.xml/.test(url)
        ? '<rss><channel>'+items+'</channel></rss>' : '<html><body>Fixture only</body></html>' });
    `);
    execFileSync(process.execPath, ['--import', join(root, 'mock.mjs'), 'scripts/build-static-data.js'], { cwd:root, timeout:30000 });
    const data = JSON.parse(await readFile(join(root, 'docs/data/dashboard.json')));
    assert.equal(data.news.articles.length, 180);
    assert.equal(data.archiveArticles, undefined);
    assert.equal(data.collectionAudit, undefined);
    const month = new Date(Date.now() - 1000).toISOString().slice(0,7);
    const archived = JSON.parse(await readFile(join(root, 'docs/data/archive/'+month+'.json')));
    assert.equal(archived.articles.length,225);
    const index = JSON.parse(await readFile(join(root, 'docs/data/archive/index.json')));
    const parts = index.months.find(m=>m.month===month).parts;
    assert.equal(parts.length,3);
    const reconstructed=[];
    for (const part of parts) {
      const page=JSON.parse(await readFile(join(root,'docs/data/archive',part)));
      assert.ok(page.articles.length<=100);
      reconstructed.push(...page.articles);
    }
    assert.deepEqual(reconstructed,archived.articles);
    assert.ok(archived.articles.some(a=>a.link==='https://fixture.test/224'));
    assert.ok(archived.articles.every(a=>a.firstSeenAt && a.lastSeenAt));
    assert.deepEqual(JSON.parse(await readFile(join(root, 'docs/data/archive/2026-01.json'))), historical);
    assert.equal(await readFile(join(root, 'docs/data/archive/'+month+'.json'),'utf8'),
                 await readFile(join(root, 'public/data/archive/'+month+'.json'),'utf8'));
    const day = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
    const ledger = JSON.parse(await readFile(join(root, 'docs/data/collection/'+day+'.json')));
    assert.equal(ledger.runs[0].archived_candidates,225);
    assert.equal(ledger.runs[0].displayed_count,180);
  } finally { await rm(root,{recursive:true,force:true}); }
});
