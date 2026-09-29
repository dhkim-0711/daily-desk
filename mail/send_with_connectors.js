/* Daily Desk delivery through the user's existing GitHub and Gmail connectors.
 * No Node, network, secrets, or environment APIs are used. This file can run as
 * new Function(source + '; return runDailyDeskSend')() in a functions.exec cell.
 * A durable claim precedes the ONE Gmail send call. An ambiguous attempt is
 * reconciled, never automatically resent. GitHub and Gmail cannot share a
 * transaction: a crash immediately after claiming may require manual review.
 */

async function runDailyDeskSend({tools, now = new Date(), sender, recipient, dryRun = false}) {
  const repository = 'dhkim-0711/daily-desk';
  const started = Date.now();
  const injectedNow = new Date(now).getTime();
  const current = () => new Date(injectedNow + Date.now() - started);
  const kst = value => new Date(value.getTime() + 9 * 3600000).toISOString();
  let date;
  let claim = null;
  let attemptedSend = false;
  let stateFile = null;
  const result = (status, extra = {}) => ({date, status, sent: status === 'sent', ...extra});
  const fail = code => { const error = new Error(code); error.safeCode = code; throw error; };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keysOnly = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));

  function utf8(value) {
    const bytes = [];
    for (let i = 0; i < value.length; i++) {
      let cp = value.charCodeAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff) {
        const low = value.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff)) fail('INVALID_UNICODE');
        cp = 0x10000 + ((cp - 0xd800) << 10) + low - 0xdc00;
      } else if (cp >= 0xdc00 && cp <= 0xdfff) fail('INVALID_UNICODE');
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) bytes.push(0xc0 | cp >> 6, 0x80 | cp & 63);
      else if (cp < 0x10000) bytes.push(0xe0 | cp >> 12, 0x80 | cp >> 6 & 63, 0x80 | cp & 63);
      else bytes.push(0xf0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63);
    }
    return bytes;
  }

  // Python json.dumps(ensure_ascii=False, sort_keys=True, separators=(',', ':')).
  // The briefing/MIME contract uses strings, booleans, null and safe integers.
  function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) fail('NONCANONICAL_NUMBER');
      return String(value);
    }
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (!record(value)) fail('NONCANONICAL_VALUE');
    const compare = (a, b) => {
      const aa = Array.from(a, c => c.codePointAt(0));
      const bb = Array.from(b, c => c.codePointAt(0));
      for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
      return aa.length - bb.length;
    };
    return '{' + Object.keys(value).sort(compare).map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }

  function sha256(input) {
    const bytes = typeof input === 'string' ? utf8(input) : Array.from(input);
    const length = bytes.length;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(length / 0x20000000), low = length * 8 >>> 0;
    for (let i = 3; i >= 0; i--) bytes.push(high >>> i * 8 & 255);
    for (let i = 3; i >= 0; i--) bytes.push(low >>> i * 8 & 255);
    const constants = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const rotate = (n, count) => n >>> count | n << 32 - count;
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = bytes[offset + i * 4] << 24 | bytes[offset + i * 4 + 1] << 16 | bytes[offset + i * 4 + 2] << 8 | bytes[offset + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotate(w[i - 15], 7) ^ rotate(w[i - 15], 18) ^ w[i - 15] >>> 3;
        const s1 = rotate(w[i - 2], 17) ^ rotate(w[i - 2], 19) ^ w[i - 2] >>> 10;
        w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
      }
      let [a,b,c,d,e,f,g,hh] = h;
      for (let i = 0; i < 64; i++) {
        const s1 = rotate(e,6) ^ rotate(e,11) ^ rotate(e,25);
        const choice = e & f ^ ~e & g;
        const t1 = hh + s1 + choice + constants[i] + w[i] | 0;
        const s0 = rotate(a,2) ^ rotate(a,13) ^ rotate(a,22);
        const majority = a & b ^ a & c ^ b & c;
        const t2 = s0 + majority | 0;
        hh=g; g=f; f=e; e=d+t1|0; d=c; c=b; b=a; a=t1+t2|0;
      }
      [a,b,c,d,e,f,g,hh].forEach((value, i) => { h[i] = h[i] + value | 0; });
    }
    return h.map(value => (value >>> 0).toString(16).padStart(8,'0')).join('');
  }

  function decodeBase64(value) {
    if (typeof value !== 'string' || value.length > 8000000 || !/^[A-Za-z0-9_+/\-]*={0,2}$/.test(value)) fail('MIME_BASE64_INVALID');
    const plain = value.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (plain.length % 4 === 1) fail('MIME_BASE64_INVALID');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const output = [];
    let bits = 0, count = 0;
    for (const character of plain) {
      bits = bits << 6 | alphabet.indexOf(character); count += 6;
      if (count >= 8) { count -= 8; output.push(bits >>> count & 255); bits &= (1 << count) - 1; }
    }
    if (bits) fail('MIME_BASE64_INVALID');
    return output;
  }

  const unpack = value => {
    for (let i = 0; i < 6; i++) {
      if (value && value.isError) { const error = new Error('CONNECTOR_ERROR'); error.connector = value; throw error; }
      if (value && value.structuredContent !== undefined) { value = value.structuredContent; continue; }
      if (record(value) && value.result !== undefined && Object.keys(value).every(key => ['result','success','status'].includes(key))) { value = value.result; continue; }
      if (record(value) && value.data !== undefined && Object.keys(value).every(key => ['data','success','status'].includes(key))) { value = value.data; continue; }
      if (record(value) && Array.isArray(value.content) && value.content.length === 1 && value.content[0].type === 'text') {
        try { value = JSON.parse(value.content[0].text); continue; } catch (_) { /* not JSON */ }
      }
      break;
    }
    return value;
  };
  async function call(name, args) {
    if (!tools || typeof tools[name] !== 'function') fail('CONNECTOR_UNAVAILABLE');
    return unpack(await tools[name](args));
  }
  const errorText = error => {
    try { return String(error && error.message || '') + JSON.stringify(error && error.connector || error); }
    catch (_) { return ''; }
  };

  async function readFile(path, optional = false) {
    let file;
    try {
      file = await call('mcp__codex_apps__github_fetch_file', {repository_full_name:repository,path,ref:'main',encoding:'utf-8'});
    } catch (error) {
      if (optional && /\b404\b|not[ _-]?found/i.test(errorText(error))) return null;
      fail('GITHUB_READ_FAILED');
    }
    if (!record(file) || typeof file.content !== 'string' || typeof file.sha !== 'string' || !file.sha) fail('GITHUB_FILE_INVALID');
    if (file.encoding && file.encoding !== 'utf-8') fail('GITHUB_ENCODING_INVALID');
    if (file.content.length > 9000000 || file.truncated || file.content_truncated) fail('GITHUB_FILE_TRUNCATED');
    let data;
    try { data = JSON.parse(file.content); } catch (_) { fail('GITHUB_JSON_INVALID'); }
    if (!record(data)) fail('GITHUB_JSON_INVALID');
    return {data,sha:file.sha};
  }

  async function writeState(value, previous) {
    const args = {repository_full_name:repository,path:`briefings/state/${date}.json`,branch:'main',
      message:`Record Daily Desk ${date} ${value.status} [skip ci]`,content:canonical(value)+'\n'};
    if (previous) args.sha = previous.sha;
    await call(previous ? 'mcp__codex_apps__github_update_file' : 'mcp__codex_apps__github_create_file', args);
    const fresh = await readFile(args.path);
    if (canonical(fresh.data) !== canonical(value)) fail('STATE_WRITE_CONFLICT');
    return fresh;
  }

  function addresses(value) {
    if (typeof value !== 'string' || /[\r\n]/.test(value)) return [];
    return (value.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(address => address.toLowerCase());
  }
  function walk(node, output = []) {
    if (!record(node)) return output;
    output.push(node);
    for (const child of node.parts || []) walk(child,output);
    return output;
  }
  const header = (node,name) => (node.headers || []).filter(h => String(h.name).toLowerCase() === name.toLowerCase()).map(h => h.value).join(',');
  const normalizeHtml = value => value.replace(/\r\n/g,'\n').trim();

  function verifySent(message, expected = null) {
    if (!record(message) || !record(message.payload)) return null;
    const labels = message.label_ids || message.labelIds || message.labels || [];
    if (!labels.includes('SENT')) return null;
    const mime = message.payload;
    const from = addresses(header(mime,'From')), to = addresses(header(mime,'To'));
    if (from.length !== 1 || from[0] !== sender.toLowerCase() || to.length !== 1 || to[0] !== recipient.toLowerCase()) return null;
    if (header(mime,'Subject') !== subject || header(mime,'Cc') || header(mime,'Bcc')) return null;
    const sentAt = message.internal_date || message.internalDate;
    if (sentAt !== undefined && sentAt !== null) {
      const value = new Date(/^\d+$/.test(String(sentAt)) ? Number(sentAt) : sentAt);
      if (!Number.isFinite(value.getTime()) || kst(value).slice(0,10) !== date) return null;
    }
    const nodes = walk(mime);
    const html = nodes.filter(n => n.mime_type === 'text/html' && typeof n.body?.content === 'string' && n.body.content.trim());
    const attachments = nodes.filter(n => n.content_disposition === 'attachment' || /^attachment\b/i.test(header(n,'Content-Disposition')) ||
      n.filename && n.mime_type !== 'image/png' && n.mime_type !== 'image/jpeg');
    const pdfs = nodes.filter(n => n.mime_type === 'application/pdf');
    if (html.length !== 1 || attachments.length !== 1 || pdfs.length !== 1 || attachments[0] !== pdfs[0]) return null;
    const pdf = pdfs[0];
    if (pdf.filename !== pdfFilename || !record(pdf.body)) return null;
    let bytes = null;
    if (typeof pdf.body.base64_url_content === 'string') {
      try { bytes = decodeBase64(pdf.body.base64_url_content); } catch (_) { return null; }
      if (String.fromCharCode(...bytes.slice(0,5)) !== '%PDF-') return null;
    }
    if (!(bytes ? bytes.length > 5 : Number.isSafeInteger(pdf.body.size) && pdf.body.size > 5 && pdf.body.attachment_id)) return null;
    if (expected) {
      if (normalizeHtml(html[0].body.content) !== normalizeHtml(expected.html)) return null;
      if (bytes ? sha256(bytes) !== expected.bundle.pdf_sha256 : pdf.body.size !== expected.bundle.pdf_bytes) return null;
    }
    return {message_id:message.id,verification:bytes ? 'gmail_sent_html_pdf_bytes' : 'gmail_sent_html_pdf_metadata'};
  }

  async function findSent(state, expected = null) {
    const checked = new Set();
    const storedId = state && (state.gmail_message_id || (/^[a-f0-9]{10,}$/i.test(state.message_id || '') ? state.message_id : null));
    async function examine(id) {
      if (!id || checked.has(id)) return null;
      checked.add(id);
      const message = await call('mcp__codex_apps__gmail_read_email',{message_id:id,format:'full'});
      return verifySent(message,expected);
    }
    if (storedId) {
      const match = await examine(storedId);
      if (match) return match;
    }
    const dayStart = Math.floor(new Date(date+'T00:00:00+09:00').getTime()/1000);
    let token;
    for (let page = 0; page < 10; page++) {
      const args = {query:`in:sent from:${sender} to:${recipient} subject:"${subject}" after:${dayStart-1} before:${dayStart+86400}`,max_results:100};
      if (token) args.next_page_token = token;
      const response = await call('mcp__codex_apps__gmail_search_emails',args);
      if (!record(response) || !Array.isArray(response.emails)) fail('GMAIL_SEARCH_INVALID');
      for (const email of response.emails) {
        const match = await examine(email.id || email.message_id);
        if (match) return match;
      }
      token = response.next_page_token;
      if (!token) return null;
    }
    fail('GMAIL_SEARCH_INCOMPLETE');
  }

  function validateMime(payload) {
    let html = null, pdf = null, nodeCount = 0;
    const allowed = ['mime_type','charset','content_disposition','content_id','filename','body','parts'];
    function validate(node,depth) {
      if (++nodeCount > 20 || depth > 4 || !keysOnly(node,allowed)) fail('MIME_INVALID');
      if (typeof node.mime_type !== 'string') fail('MIME_INVALID');
      if (node.charset != null && !/^utf-8$/i.test(node.charset)) fail('MIME_INVALID');
      if (node.content_disposition != null && !['inline','attachment'].includes(node.content_disposition)) fail('MIME_INVALID');
      for (const field of ['filename','content_id']) if (node[field] != null && (typeof node[field] !== 'string' || /[\r\n\x00]/.test(node[field]))) fail('MIME_INVALID');
      if (node.mime_type.startsWith('multipart/')) {
        if (!['multipart/mixed','multipart/related','multipart/alternative'].includes(node.mime_type) || node.body != null || !Array.isArray(node.parts) || !node.parts.length || node.content_disposition === 'attachment') fail('MIME_INVALID');
        node.parts.forEach(child => validate(child,depth+1)); return;
      }
      if (node.parts != null || !keysOnly(node.body,['content','base64_url_content'])) fail('MIME_INVALID');
      if (node.mime_type === 'text/html' || node.mime_type === 'text/plain') {
        if (typeof node.body.content !== 'string' || !node.body.content.trim() || node.body.base64_url_content != null || node.filename != null || node.content_disposition === 'attachment') fail('MIME_INVALID');
        if (node.mime_type === 'text/html') { if (html !== null) fail('MIME_INVALID'); html=node.body.content; }
      } else if (node.mime_type === 'application/pdf') {
        if (pdf !== null || node.content_disposition !== 'attachment' || node.filename !== pdfFilename || node.body.content != null) fail('MIME_PDF_INVALID');
        pdf = decodeBase64(node.body.base64_url_content);
        if (String.fromCharCode(...pdf.slice(0,5)) !== '%PDF-') fail('MIME_PDF_INVALID');
      } else if (['image/png','image/jpeg'].includes(node.mime_type)) {
        if (node.content_disposition !== 'inline' || !node.content_id || node.body.content != null || !decodeBase64(node.body.base64_url_content).length) fail('MIME_INLINE_INVALID');
      } else fail('MIME_TYPE_UNEXPECTED');
    }
    validate(payload,0);
    if (payload.mime_type !== 'multipart/mixed' || html === null || pdf === null) fail('MIME_INVALID');
    return {html,pdf};
  }

  async function loadEdition() {
    const ready = await readFile(`briefings/ready/${date}.json`,true);
    const rendered = await readFile(`briefings/rendered/${date}.json`,true);
    if (!ready || !rendered) return null;
    const source = ready.data, bundle = rendered.data;
    const cutoff = date+'T09:00:00+09:00';
    const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
    const isCutoff = value => timestamp(value) && new RegExp('^'+date+'T09:00:00(?:\\.0+)?\\+09:00$').test(value);
    if (source.schema_version !== 1 || source.status !== 'ready' || source.date !== date || !isCutoff(source.cutoff_at) ||
        !timestamp(source.created_at) || Date.parse(source.created_at) < Date.parse(cutoff) || Date.parse(source.created_at) > current().getTime()) fail('SOURCE_INVALID');
    if (!keysOnly(bundle,['schema_version','status','date','cutoff_at','subject','source_sha256','renderer_sha256','rendered_at','html_sha256','payload_sha256','pdf_sha256','pdf_bytes','payload']) || bundle.schema_version !== 1 || bundle.status !== 'rendered' || bundle.date !== date || !isCutoff(bundle.cutoff_at) || bundle.subject !== subject ||
        !timestamp(bundle.rendered_at) || Date.parse(bundle.rendered_at) < Date.parse(source.created_at) || Date.parse(bundle.rendered_at) > current().getTime()) fail('BUNDLE_INVALID');
    for (const field of ['source_sha256','renderer_sha256','html_sha256','payload_sha256','pdf_sha256']) if (!/^[a-f0-9]{64}$/.test(bundle[field] || '')) fail('BUNDLE_HASH_INVALID');
    if (sha256(canonical(source)) !== bundle.source_sha256) fail('SOURCE_HASH_MISMATCH');
    if (sha256(canonical(bundle.payload)) !== bundle.payload_sha256) fail('PAYLOAD_HASH_MISMATCH');
    const checked = validateMime(bundle.payload);
    if (sha256(checked.html) !== bundle.html_sha256) fail('HTML_HASH_MISMATCH');
    if (checked.pdf.length !== bundle.pdf_bytes || sha256(checked.pdf) !== bundle.pdf_sha256) fail('PDF_HASH_MISMATCH');
    return {bundle,html:checked.html,fingerprint:sha256(canonical(bundle))};
  }

  let subject, pdfFilename, recipientKey, senderKey;
  function stateValid(state) {
    return state.date === date && state.recipient_key === recipientKey && (!state.sender_key || state.sender_key === senderKey) &&
      ['sending','sent','uncertain','safe_pre_send_failure'].includes(state.status);
  }
  async function reconcile(found, file) {
    if (dryRun) return result('already_sent',{verification:found.verification});
    const prior = file ? file.data : {};
    const value = {...prior,version:1,date,recipient_key:recipientKey,sender_key:senderKey,status:'sent',
      gmail_message_id:found.message_id,verified_at:current().toISOString(),updated_at:current().toISOString(),evidence:'legacy_subject_match',verification:found.verification};
    // A legacy Sent match suppresses a duplicate without asserting that the
    // current ready/rendered files produced that earlier message.
    for (const field of ['source_sha256','payload_sha256','content_hash','pdf_sha256']) {
      if (value[field]) value['candidate_'+field] = value[field];
      delete value[field];
    }
    try { stateFile = await writeState(value,file); }
    catch (_) { return result('already_sent',{code:'SENT_CONFIRMED_STATE_WRITE_FAILED',verification:found.verification}); }
    return result('already_sent',{verification:found.verification});
  }

  try {
    if (!Number.isFinite(injectedNow)) fail('DATE_INVALID');
    date = kst(current()).slice(0,10);
    if (kst(current()).slice(11,16) < '09:10') return result('too_early');
    const addressPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!addressPattern.test(sender || '') || !addressPattern.test(recipient || '')) fail('MAIL_ADDRESS_INVALID');
    subject = `AI반도체 일일 브리핑[${date.replace(/-/g,'.')}]`;
    pdfFilename = `AI반도체_일일_브리핑_${date.replace(/-/g,'.')}.pdf`;
    recipientKey=sha256(recipient.toLowerCase()); senderKey=sha256(sender.toLowerCase());
    const profile = await call('mcp__codex_apps__gmail_get_profile',{});
    if (!record(profile) || String(profile.email || profile.email_address || profile.emailAddress || '').toLowerCase() !== sender.toLowerCase()) fail('GMAIL_PROFILE_MISMATCH');
    stateFile = await readFile(`briefings/state/${date}.json`,true);
    if (stateFile && !stateValid(stateFile.data)) fail('STATE_CONFLICT');
    const found = await findSent(stateFile?.data);
    if (found) {
      if (stateFile?.data.status === 'sent') return result('already_sent',{verification:found.verification});
      return await reconcile(found,stateFile);
    }
    if (stateFile && ['sending','uncertain','sent'].includes(stateFile.data.status)) return result('uncertain',{code:stateFile.data.status === 'sent' ? 'STATE_SENT_UNVERIFIED' : 'DELIVERY_UNCERTAIN'});
    const edition = await loadEdition();
    if (!edition) return result('not_ready');
    if (dryRun) return result('ready',{source_sha256:edition.bundle.source_sha256,payload_sha256:edition.bundle.payload_sha256});
    if (kst(current()).slice(0,10) !== date) fail('DATE_ROLLED_OVER');
    claim = {version:1,date,recipient_key:recipientKey,sender_key:senderKey,status:'sending',
      attempt_id:sha256(date+':'+Date.now()+':'+Math.random()+':'+Math.random()).slice(0,32),
      source_sha256:edition.bundle.source_sha256,payload_sha256:edition.bundle.payload_sha256,pdf_sha256:edition.bundle.pdf_sha256,
      attempted_at:current().toISOString(),updated_at:current().toISOString()};
    try { stateFile = await writeState(claim,stateFile); }
    catch (_) { claim=null; return result('uncertain',{code:'CLAIM_NOT_CONFIRMED'}); }
    // Check the current source again AFTER claiming, so a changed draft cannot
    // silently send an obsolete rendering. A local pre-send failure is safe to
    // retry; a connector failure after claiming is treated as ambiguous.
    const latest = await loadEdition();
    if (!latest || latest.fingerprint !== edition.fingerprint) fail('EDITION_CHANGED_BEFORE_SEND');
    if (kst(current()).slice(0,10) !== date) fail('DATE_ROLLED_OVER');
    attemptedSend = true;
    const sent = await call('mcp__codex_apps__gmail_send_email',{
      to:recipient,from_address:sender,subject,payload:latest.bundle.payload,response_fields:['id','label_ids']
    });
    const messageId = sent && (sent.id || sent.message_id || sent.message?.id);
    if (typeof messageId === 'string' && messageId) {
      claim = {...claim,gmail_message_id:messageId,updated_at:current().toISOString()};
      stateFile = await writeState(claim,stateFile);
    }
    const verified = await findSent(claim,latest);
    if (!verified) fail('GMAIL_SENT_NOT_VERIFIED');
    claim={...claim,status:'sent',gmail_message_id:verified.message_id,verified_at:current().toISOString(),updated_at:current().toISOString(),evidence:'gmail_sent',verification:verified.verification};
    stateFile=await writeState(claim,stateFile);
    return result('sent',{verification:verified.verification});
  } catch (error) {
    const code=error && error.safeCode || 'CONNECTOR_CALL_FAILED';
    if (!claim) return result('error',{code});
    const safeCodes=['SOURCE_INVALID','BUNDLE_INVALID','BUNDLE_HASH_INVALID','SOURCE_HASH_MISMATCH','PAYLOAD_HASH_MISMATCH','HTML_HASH_MISMATCH','PDF_HASH_MISMATCH','MIME_INVALID','MIME_PDF_INVALID','MIME_INLINE_INVALID','MIME_TYPE_UNEXPECTED','MIME_BASE64_INVALID','EDITION_CHANGED_BEFORE_SEND','DATE_ROLLED_OVER','NONCANONICAL_NUMBER','NONCANONICAL_VALUE','INVALID_UNICODE'];
    const safe=!attemptedSend && safeCodes.includes(code);
    const failed={...claim,status:safe?'safe_pre_send_failure':'uncertain',failure_code:code,updated_at:current().toISOString()};
    try { await writeState(failed,stateFile); } catch (_) { /* keep existing durable barrier */ }
    return result(safe?'pre_send_failed':'uncertain',{code});
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = {runDailyDeskSend};
