#!/usr/bin/env node
// Ad çakışması deneyi: yalnız aksan/noktalama/büyüklükle ayrılan iki ad ayrı kayıt olarak kalıyor mu?
// Adapter:
//   newContext?(browser)
//   save(page, { name, body }) -> { recordId } | { rejected }   (bu adla kaydet; uygulamanın gerçekte yazdığı kaydın kimliği)
//   read(context, recordId)    -> { name, body? }                (yeni oturumda taze okuma)
// Kullanım: node src/collision-run.mjs <adapter.mjs> [--only id1,id2] [--out runs/x.json]
// Exit: 0 ihlal yok · 1 distinct beklenen çift karıştı · 2 kontrol çifti karıştı / çalışmayan kontrol
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { classifyCollision, verdict, withSuffix } from './collision.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (!args[0]) { console.error('adapter yolu gerekli'); process.exit(2); }
const adapter = (await import(pathToFileURL(resolve(args[0])).href)).default;
const only = (opt('--only', '') || '').split(',').filter(Boolean);
const corpusPath = resolve(dirname(fileURLToPath(import.meta.url)), '../corpus/name-pairs.json');
const pairs = JSON.parse(readFileSync(corpusPath, 'utf8')).pairs.filter((p) => !only.length || only.includes(p.id));

const browser = await chromium.launch();
const newCtx = () => (adapter.newContext ? adapter.newContext(browser) : browser.newContext());
const runTag = Date.now().toString(36);

async function save(name, body) {
  const ctx = await newCtx();
  const out = { name, body };
  try {
    const r = await adapter.save(await ctx.newPage(), { name, body });
    if (r.recordId !== undefined) out.recordId = String(r.recordId);
    else out.rejected = r.rejected ?? 'unknown';
  } catch (e) { out.error = e.message.split('\n')[0]; }
  await ctx.close();
  return out;
}
async function read(x) {
  if (x.recordId === undefined) return;
  const ctx = await newCtx();
  try { x.read = await adapter.read(ctx, x.recordId); } catch (e) { x.readError = e.message.split('\n')[0]; }
  await ctx.close();
}

const results = [];
for (const [i, p] of pairs.entries()) {
  const sfx = `${runTag}${i}`;
  const a = await save(withSuffix(p.a, sfx), `A gövdesi: ${p.a}`);
  const b = await save(withSuffix(p.b, sfx), `B gövdesi: ${p.b}`);
  await read(a); await read(b); // her iki kayıt da B'den SONRA okunur: üzerine yazma görünür olur
  if (adapter.bodyless) { delete a.body; delete b.body; }
  const outcome = classifyCollision({ a, b });
  results.push({ id: p.id, expect: p.expect, note: p.note, a, b, outcome, verdict: verdict(p.expect, outcome) });
}
await browser.close();

const cell = (s, w) => { s = String(s ?? ''); return s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w); };
const icon = { pass: '✓', fail: '✗', blocked: '⊘', observed: '·', 'adapter-suspect': '!', 'not-run': '?' };
console.log(`\n${adapter.name} — ad çakışması (✓ ayrı  ✗ karıştı  ⊘ reddedildi  · politika  ! adapter şüpheli  ? çalışmadı)\n`);
console.log(cell('', 2), cell('çift', 18), cell('A', 14), cell('B', 14), cell('sonuç', 12), 'ayrıntı');
for (const r of results) {
  const detail = r.outcome === 'overwritten' ? `"${r.b.name}" kaydı "${r.a.read?.name ?? r.a.name}" üzerine yazdı`
    : r.outcome === 'merged' ? `"${r.b.name}" → mevcut "${r.b.read?.name ?? r.a.name}"`
    : r.outcome === 'rejected' ? `red: ${r.b.rejected}`
    : r.outcome === 'renamed' ? `okunan: "${r.a.read?.name}" / "${r.b.read?.name}"`
    : r.outcome === 'error' ? (r.a.error ?? r.b.error ?? r.a.readError ?? r.b.readError ?? '') : '';
  console.log(cell(icon[r.verdict], 2), cell(r.id, 18), cell(r.a.name, 14), cell(r.b.name, 14), cell(r.outcome, 12), detail);
}
const count = (v) => results.filter((r) => r.verdict === v).length;
console.log(`\nkarışan: ${count('fail')}  reddedilen: ${count('blocked')}  politika gözlemi: ${count('observed')}  adapter şüpheli: ${count('adapter-suspect')}  çalışmayan: ${count('not-run')}`);

const out = opt('--out', `runs/collision-${adapter.name}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ schemaVersion: '0.1', kind: 'collision', adapter: adapter.name, at: new Date().toISOString(), results }, null, 2));
console.log(`sonuç: ${out}`);
process.exitCode = count('adapter-suspect') || count('not-run') ? 2 : count('fail') ? 1 : 0;
