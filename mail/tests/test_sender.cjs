/* Synthetic connector tests. No network, actual recipients, or email delivery. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {runDailyDeskSend} = require('../send_with_connectors.js');

const DATE = '2026-09-29';
const NOW = new Date('2026-09-29T00:10:00Z');
const SENDER = 'sender@example.com', RECIPIENT = 'recipient@example.com';
const READY = `briefings/ready/${DATE}.json`, BUNDLE = `briefings/rendered/${DATE}.json`, STATE = `briefings/state/${DATE}.json`;
const SUBJECT = 'AI반도체 일일 브리핑[2026.09.29]';
const FILENAME = 'AI반도체_일일_브리핑_2026.09.29.pdf';
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const wrap = structuredContent => ({content:[{type:'text',text:'Action completed'}],structuredContent});

function fixture() {
  const ready = {schema_version:1,status:'ready',date:DATE,cutoff_at:DATE+'T09:00:00+09:00',created_at:DATE+'T09:05:00+09:00',articles:[{title:'합성 기사 · 한글과 🧪'}]};
  const html = '<html><body><h1>테스트 전용 브리핑 🧪</h1><img src="cid:nipa-logo"></body></html>';
  const pdf = Buffer.from('%PDF-1.4\n% synthetic test only\n%%EOF\n');
  const payload = {mime_type:'multipart/mixed',parts:[
    {mime_type:'multipart/related',parts:[{mime_type:'text/html',charset:'utf-8',body:{content:html}},
      {mime_type:'image/png',content_disposition:'inline',content_id:'<nipa-logo>',filename:'nipa-white.png',body:{base64_url_content:Buffer.from('synthetic-logo').toString('base64url')}}]},
    {mime_type:'application/pdf',content_disposition:'attachment',filename:FILENAME,body:{base64_url_content:pdf.toString('base64url')}}
  ]};
  const bundle={schema_version:1,status:'rendered',date:DATE,cutoff_at:ready.cutoff_at,subject:SUBJECT,source_sha256:hash(canonical(ready)),renderer_sha256:hash('test-renderer'),rendered_at:DATE+'T09:06:00+09:00',html_sha256:hash(html),payload_sha256:hash(canonical(payload)),pdf_sha256:hash(pdf),pdf_bytes:pdf.length,payload};
  return {ready,bundle,pdf,html};
}

function sentMessage(id, payload = fixture().bundle.payload, bytes = false) {
  const tree=clone(payload);
  tree.headers=[{name:'From',value:`"Test Sender" <${SENDER}>`},{name:'To',value:RECIPIENT},{name:'Subject',value:SUBJECT}];
  const pdf=tree.parts.find(part=>part.mime_type==='application/pdf');
  pdf.headers=[{name:'Content-Disposition',value:'attachment'}];
  if (!bytes) pdf.body={size:Buffer.from(pdf.body.base64_url_content,'base64url').length,attachment_id:'synthetic-attachment-id'};
  return {id,label_ids:['SENT'],internal_date:String(NOW.getTime()),payload:tree};
}

function harness(options = {}) {
  const data=fixture();
  const files=new Map(), messages=new Map(), calls=[];
  let serial=0, sends=0, writes=0;
  function setFile(file,value) { files.set(file,{content:JSON.stringify(value),sha:hash('file-'+(++serial))}); }
  function getFile(file) { return files.has(file)?JSON.parse(files.get(file).content):null; }
  setFile(READY,data.ready); setFile(BUNDLE,data.bundle);
  if (options.state) setFile(STATE,options.state);
  if (options.legacy) messages.set('legacy0123456789',sentMessage('legacy0123456789'));
  const tools={
    async mcp__codex_apps__gmail_get_profile() { calls.push('profile'); return wrap({email:options.profile||SENDER}); },
    async mcp__codex_apps__github_fetch_file(args) {
      calls.push('read:'+args.path);
      if (options.beforeRead) await options.beforeRead(args.path,{files,messages,setFile,getFile,calls});
      if (!files.has(args.path)) throw new Error('GitHub 404 Not Found');
      return wrap({...clone(files.get(args.path)),encoding:'utf-8'});
    },
    async mcp__codex_apps__github_create_file(args) {
      calls.push('create');
      assert.equal(args.repository_full_name,'dhkim-0711/daily-desk');
      if (files.has(args.path)) throw new Error('422 file already exists');
      if (options.createError) throw new Error('network error');
      setFile(args.path,JSON.parse(args.content)); writes++;
      if (options.afterCreate) await options.afterCreate({files,messages,setFile,getFile,calls});
      return wrap({commit_sha:'commit-'+serial});
    },
    async mcp__codex_apps__github_update_file(args) {
      calls.push('update');
      if (options.updateError) throw new Error('network error');
      if (!files.has(args.path)||files.get(args.path).sha!==args.sha) throw new Error('409 SHA conflict');
      setFile(args.path,JSON.parse(args.content)); writes++;
      return wrap({commit_sha:'commit-'+serial,content_sha:files.get(args.path).sha});
    },
    async mcp__codex_apps__gmail_search_emails(args) {
      calls.push('search');
      assert.match(args.query,/after:1790607599 before:1790694000/);
      if (options.searchError) throw new Error('network query failed');
      return wrap({emails:[...messages.values()].map(m=>({id:m.id,subject:SUBJECT})),next_page_token:null});
    },
    async mcp__codex_apps__gmail_read_email(args) {
      calls.push('readmail');
      if (!messages.has(args.message_id)) throw new Error('Gmail 404');
      return wrap(clone(messages.get(args.message_id)));
    },
    async mcp__codex_apps__gmail_send_email(args) {
      calls.push('send'); sends++;
      assert.equal(getFile(STATE).status,'sending','durable claim must precede Gmail');
      assert.deepEqual(Object.keys(args).sort(),['from_address','payload','response_fields','subject','to']);
      assert.equal(args.from_address,SENDER); assert.equal(args.to,RECIPIENT); assert.equal(args.subject,SUBJECT);
      if (!options.missingSent) messages.set('abcdef0123456789',sentMessage('abcdef0123456789',args.payload,options.byteEvidence));
      if (options.afterSend) await options.afterSend({files,messages,setFile,getFile,calls,args});
      if (options.sendError) throw new Error('ambiguous network timeout containing sensitive data');
      return wrap({id:'abcdef0123456789',label_ids:['SENT']});
    }
  };
  const run=extra=>runDailyDeskSend({tools,now:NOW,sender:SENDER,recipient:RECIPIENT,...extra});
  return {data,tools,files,messages,calls,setFile,getFile,run,get sends(){return sends;},get writes(){return writes;}};
}

function state(status, extra = {}) {
  return {version:1,date:DATE,recipient_key:hash(RECIPIENT),status,...extra};
}
function rehash(bundle) { bundle.payload_sha256=hash(canonical(bundle.payload)); return bundle; }

test('pure V8 entry point loads without Node, crypto, Buffer, atob, or TextEncoder', async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../send_with_connectors.js'),'utf8');
  const fn=vm.runInNewContext(source+'; runDailyDeskSend',{});
  const h=harness();
  const result=await fn({tools:h.tools,now:NOW,sender:SENDER,recipient:RECIPIENT,dryRun:true});
  assert.equal(result.status,'ready'); assert.equal(h.writes,0); assert.equal(h.sends,0);
});

test('matching ready/rendered bundle sends once and persists confirmed MIME evidence',async()=>{
  const h=harness(); const result=await h.run();
  assert.equal(result.status,'sent'); assert.equal(h.sends,1);
  assert.equal(h.getFile(STATE).status,'sent');
  assert.equal(h.getFile(STATE).gmail_message_id,'abcdef0123456789');
  assert.equal(h.getFile(STATE).evidence,'gmail_sent');
  assert.equal(result.verification,'gmail_sent_html_pdf_metadata');
  assert.ok(!h.files.get(STATE).content.includes(RECIPIENT));
  assert.ok(!h.files.get(STATE).content.includes(SENDER));
  const again=await h.run(); assert.equal(again.status,'already_sent'); assert.equal(h.sends,1);
});

test('Sent byte evidence is checked against the exact PDF digest',async()=>{
  const h=harness({byteEvidence:true});
  assert.equal((await h.run()).verification,'gmail_sent_html_pdf_bytes');
});

test('two concurrent runners acquire at most one durable sending claim',async()=>{
  const h=harness(); const results=await Promise.all([h.run(),h.run()]);
  assert.equal(h.sends,1); assert.equal(results.filter(r=>r.status==='sent').length,1);
  assert.equal(h.getFile(STATE).status,'sent');
});

test('09:09 KST is too early and performs no connector calls',async()=>{
  const h=harness(); const result=await h.run({now:new Date('2026-09-29T00:09:59Z')});
  assert.equal(result.status,'too_early'); assert.equal(h.calls.length,0);
});

test('next KST day never reuses the previous day edition',async()=>{
  const h=harness();
  // Stop before querying because the new day is earlier than the delivery gate.
  const result=await h.run({now:new Date('2026-09-29T15:00:00Z')});
  assert.equal(result.date,'2026-09-30'); assert.equal(result.status,'too_early'); assert.equal(h.sends,0);
});

test('missing rendered artifact remains not_ready without claiming',async()=>{
  const h=harness(); h.files.delete(BUNDLE);
  assert.equal((await h.run()).status,'not_ready'); assert.equal(h.writes,0);
});

test('legacy same-day HTML plus PDF suppresses delivery even with no ready files',async()=>{
  const h=harness({legacy:true}); h.files.delete(READY); h.files.delete(BUNDLE);
  const result=await h.run();
  assert.equal(result.status,'already_sent'); assert.equal(h.sends,0);
  assert.equal(h.getFile(STATE).evidence,'legacy_subject_match');
  assert.ok(!('source_sha256' in h.getFile(STATE)));
  assert.ok(!h.calls.includes('read:'+READY));
});

test('legacy reconciliation does not attribute the candidate bundle hash to an earlier mail',async()=>{
  const h=harness({legacy:true,state:state('uncertain',{source_sha256:'a'.repeat(64),payload_sha256:'b'.repeat(64)})});
  assert.equal((await h.run()).status,'already_sent');
  assert.equal(h.getFile(STATE).candidate_source_sha256,'a'.repeat(64));
  assert.ok(!('source_sha256' in h.getFile(STATE)));
});

test('dryRun of an existing sent mail does not write reconciliation state',async()=>{
  const h=harness({legacy:true}); assert.equal((await h.run({dryRun:true})).status,'already_sent');
  assert.equal(h.writes,0); assert.equal(h.sends,0);
});

test('source changed after rendering is blocked before any claim',async()=>{
  const h=harness(); const ready=clone(h.data.ready); ready.articles[0].title='new title'; h.setFile(READY,ready);
  assert.equal((await h.run()).code,'SOURCE_HASH_MISMATCH'); assert.equal(h.writes,0); assert.equal(h.sends,0);
});

test('payload corruption is detected independently of source hash',async()=>{
  const h=harness(); const bundle=clone(h.data.bundle); bundle.payload.parts[0].parts[0].body.content='tampered'; h.setFile(BUNDLE,bundle);
  assert.equal((await h.run()).code,'PAYLOAD_HASH_MISMATCH'); assert.equal(h.sends,0);
});

test('PDF hash cannot be forged by updating payload hash only',async()=>{
  const h=harness(); const bundle=clone(h.data.bundle); bundle.pdf_sha256='0'.repeat(64); h.setFile(BUNDLE,bundle);
  assert.equal((await h.run()).code,'PDF_HASH_MISMATCH'); assert.equal(h.sends,0);
});

test('HTML hash is verified separately',async()=>{
  const h=harness(); const bundle=clone(h.data.bundle); bundle.html_sha256='0'.repeat(64); h.setFile(BUNDLE,bundle);
  assert.equal((await h.run()).code,'HTML_HASH_MISMATCH');
});

test('MIME cannot inject recipients through headers or unknown properties',async()=>{
  for (const key of ['headers','to','cc','bcc']) {
    const h=harness(); const bundle=clone(h.data.bundle); bundle.payload[key]='another@example.com'; h.setFile(BUNDLE,rehash(bundle));
    assert.equal((await h.run()).code,'MIME_INVALID'); assert.equal(h.sends,0);
  }
});

test('bundle cannot override caller-supplied recipient',async()=>{
  const h=harness(); const bundle=clone(h.data.bundle); bundle.recipient='another@example.com'; h.setFile(BUNDLE,bundle);
  assert.equal((await h.run()).code,'BUNDLE_INVALID'); assert.equal(h.sends,0);
});

test('wrong PDF filename and non-PDF bytes are rejected',async()=>{
  for (const change of [pdf=>{pdf.filename='other.pdf';},pdf=>{pdf.body.base64_url_content=Buffer.from('not a PDF').toString('base64url');}]) {
    const h=harness(); const bundle=clone(h.data.bundle); change(bundle.payload.parts[1]); h.setFile(BUNDLE,rehash(bundle));
    assert.equal((await h.run()).code,'MIME_PDF_INVALID'); assert.equal(h.sends,0);
  }
});

test('profile mismatch blocks even an apparently ready edition',async()=>{
  const h=harness({profile:'wrong@example.com'}); assert.equal((await h.run()).code,'GMAIL_PROFILE_MISMATCH');
  assert.equal(h.writes,0); assert.equal(h.sends,0);
});

test('malformed private email address cannot enter Gmail search query',async()=>{
  const h=harness(); assert.equal((await h.run({recipient:'recipient@example.com OR in:inbox'})).code,'MAIL_ADDRESS_INVALID');
  assert.equal(h.calls.length,0);
});

test('state belonging to another recipient is a conflict',async()=>{
  const h=harness({state:state('sent',{recipient_key:hash('other@example.com')})});
  assert.equal((await h.run()).code,'STATE_CONFLICT'); assert.equal(h.sends,0);
});

test('sending and uncertain states never expire into a blind resend',async()=>{
  for (const status of ['sending','uncertain']) {
    const h=harness({state:state(status,{attempted_at:DATE+'T09:10:00+09:00'})});
    assert.equal((await h.run()).status,'uncertain'); assert.equal(h.sends,0); assert.equal(h.writes,0);
  }
});

test('unverifiable sent state is a barrier, not a reason to send again',async()=>{
  const h=harness({state:state('sent')}); assert.equal((await h.run()).code,'STATE_SENT_UNVERIFIED'); assert.equal(h.sends,0);
});

test('Gmail send timeout is uncertain; a later Sent match reconciles without resending',async()=>{
  const h=harness({sendError:true}); const result=await h.run();
  assert.equal(result.status,'uncertain'); assert.equal(h.getFile(STATE).status,'uncertain'); assert.equal(h.sends,1);
  assert.ok(!JSON.stringify(result).includes('sensitive'));
  assert.equal((await h.run()).status,'already_sent'); assert.equal(h.sends,1);
});

test('successful Gmail response without verifiable Sent copy remains uncertain',async()=>{
  const h=harness({missingSent:true}); assert.equal((await h.run()).status,'uncertain'); assert.equal(h.sends,1);
  assert.equal(h.getFile(STATE).gmail_message_id,'abcdef0123456789');
  assert.equal((await h.run()).status,'error'); assert.equal(h.sends,1);
});

test('claim write failure blocks Gmail and never retries the send',async()=>{
  const h=harness({createError:true}); assert.equal((await h.run()).code,'CLAIM_NOT_CONFIRMED'); assert.equal(h.sends,0);
});

test('post-claim source change is recorded as a proven safe pre-send failure',async()=>{
  const h=harness({afterCreate:({setFile,getFile})=>{const ready=getFile(READY); ready.articles[0].title='changed'; setFile(READY,ready);}});
  const result=await h.run(); assert.equal(result.status,'pre_send_failed'); assert.equal(h.sends,0);
  assert.equal(h.getFile(STATE).status,'safe_pre_send_failure');
});

test('a proven safe pre-send failure can acquire a new CAS claim',async()=>{
  const h=harness({state:state('safe_pre_send_failure',{failure_code:'EDITION_CHANGED_BEFORE_SEND'})});
  assert.equal((await h.run()).status,'sent'); assert.equal(h.sends,1);
});

test('a post-claim connector read failure remains uncertain',async()=>{
  let claimed=false;
  const h=harness({afterCreate:()=>{claimed=true;},beforeRead:(file)=>{if(claimed&&file===READY)throw new Error('temporary outage');}});
  assert.equal((await h.run()).status,'uncertain'); assert.equal(h.getFile(STATE).status,'uncertain'); assert.equal(h.sends,0);
});

test('state persistence failure after send cannot cause a second send',async()=>{
  const options={afterSend:()=>{options.updateError=true;}};
  const h=harness(options); assert.equal((await h.run()).status,'uncertain'); assert.equal(h.sends,1);
  options.updateError=false;
  assert.equal((await h.run()).status,'already_sent'); assert.equal(h.sends,1);
});

test('Sent verification rejects changed HTML, missing PDF, extra attachments and wrong recipient',async()=>{
  const changes=[
    m=>{m.payload.parts[0].parts[0].body.content='wrong HTML';},
    m=>{m.payload.parts.pop();},
    m=>{m.payload.parts.push({mime_type:'text/plain',filename:'extra.txt',content_disposition:'attachment',body:{content:'extra'}});},
    m=>{m.payload.headers.find(h=>h.name==='To').value='other@example.com';}
  ];
  for (const change of changes) {
    const h=harness({afterSend:({messages})=>change(messages.get('abcdef0123456789'))});
    assert.equal((await h.run()).status,'uncertain'); assert.equal(h.sends,1);
  }
});

test('future rendered timestamps are rejected before claiming',async()=>{
  const h=harness(); const bundle=clone(h.data.bundle); bundle.rendered_at=DATE+'T12:00:00+09:00'; h.setFile(BUNDLE,bundle);
  assert.equal((await h.run()).code,'BUNDLE_INVALID'); assert.equal(h.writes,0);
});

test('cutoff accepts equivalent zero fractional seconds but not a different offset or instant',async()=>{
  const h=harness(); const ready=clone(h.data.ready),bundle=clone(h.data.bundle);
  ready.cutoff_at=DATE+'T09:00:00.000+09:00'; bundle.cutoff_at=ready.cutoff_at; bundle.source_sha256=hash(canonical(ready));
  h.setFile(READY,ready); h.setFile(BUNDLE,bundle);
  assert.equal((await h.run({dryRun:true})).status,'ready');
});
