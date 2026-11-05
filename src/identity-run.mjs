#!/usr/bin/env node
// Kimlik deneyi: e-posta çiftleri. A ile hesap aç, B ile ikinci hesap aç; saklanan adresleri taze oku.
// Adapter: newContext(browser), createUser(page, { login, email }) -> { recordId } | { rejected },
//          readEmail(context, recordId) -> string
// Kullanım: node src/identity-run.mjs <adapter.mjs> [--only id1,id2] [--out runs/x.json]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { escaped } from './index.mjs';
import { identityFlags, isDuplicateFlag } from './identity.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const adapter = (await import(pathToFileURL(resolve(args[0])).href)).default;
const only = (opt('--only', '') || '').split(',').filter(Boolean);
const corpusPath = resolve(dirname(fileURLToPath(import.meta.url)), '../corpus/email-identity.json');
const pairs = JSON.parse(readFileSync(corpusPath, 'utf8')).pairs.filter((p) => !only.length || only.includes(p.id));

const browser = await chromium.launch();
const newCtx = () => (adapter.newContext ? adapter.newContext(browser) : browser.newContext());
let seq = 0;

async function create(email) {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  const statuses = [];
  page.on('response', (r) => { if (r.request().method() !== 'GET') statuses.push(r.status()); });
  const login = `hdlid${Date.now().toString(36)}${seq++}`;
  const out = { email, login };
  try {
    const r = await adapter.createUser(page, { login, email });
    if (statuses.some((s) => s >= 500)) out.outcome = 'server-error';
    else if (r.recordId) { out.outcome = 'accepted'; out.recordId = r.recordId; }
    else { out.outcome = 'rejected'; out.reason = r.rejected; }
  } catch (e) { out.outcome = 'error'; out.reason = e.message.split('\n')[0]; }
  await ctx.close();
  if (out.recordId) {
    const c = await newCtx();
    try { out.stored = await adapter.readEmail(c, out.recordId); } catch (e) { out.readError = e.message.split('\n')[0]; }
    await c.close();
  }
  return out;
}

const results = [];
for (const p of pairs) {
  const n = `${Date.now().toString(36).slice(-5)}${seq}`;
  const a = await create(p.a.replaceAll('{n}', n));
  const b = await create(p.b.replaceAll('{n}', n));
  results.push({ id: p.id, sameMailbox: p.sameMailbox, a, b, flags: identityFlags(p, a, b) });
}
await browser.close();

const cell = (s, w) => { s = String(s ?? ''); return s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w); };
console.log(`\n${adapter.name} — e-posta kimlik çiftleri\n`);
console.log(cell('çift', 16), cell('A', 10), cell('B', 13), cell('B saklanan', 34), 'işaretler');
for (const r of results) {
  console.log(cell(r.id, 16), cell(r.a.outcome, 10), cell(r.b.outcome, 13),
    cell(r.b.stored !== undefined ? escaped(r.b.stored) : (r.b.reason ?? ''), 34), r.flags.join(', '));
}
const dup = results.filter((r) => r.flags.some(isDuplicateFlag));
console.log(`\naynı posta kutusu için ikinci hesap: ${dup.length}`);
const out = opt('--out', `runs/identity-${adapter.name}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ schemaVersion: '0.1', kind: 'identity', adapter: adapter.name, at: new Date().toISOString(), results }, null, 2));
console.log(`sonuç: ${out}`);
process.exitCode = dup.length ? 1 : 0;
