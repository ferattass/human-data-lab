#!/usr/bin/env node
// Arama deneyi: her fixture için kayıt yarat, sonra sorgu varyantlarıyla ara.
// Adapter: create(page, value) + search(context, query, recordId) -> { found: boolean, total?: number }
// Kullanım: node src/search-run.mjs <adapter.mjs> [--only id1,id2] [--out runs/x.json]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCorpus, escaped } from './index.mjs';
import { queriesFor, VARIANTS } from './variants.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const adapter = (await import(pathToFileURL(resolve(args[0])).href)).default;
const only = (opt('--only', '') || '').split(',').filter(Boolean);
const fixtures = loadCorpus('text-smoke').filter((f) => !only.length || only.includes(f.id));

const browser = await chromium.launch();
const newCtx = () => (adapter.newContext ? adapter.newContext(browser) : browser.newContext());
const results = [];
for (const fixture of fixtures) {
  const rec = { fixtureId: fixture.id, value: fixture.value, queries: [] };
  const ctx = await newCtx();
  try {
    const created = await adapter.create(await ctx.newPage(), fixture.value);
    rec.recordId = created.recordId;
    if (!created.recordId) rec.skipped = created.rejected ?? 'not-created';
  } catch (e) { rec.skipped = 'create-error: ' + e.message.split('\n')[0]; }
  await ctx.close();
  if (!rec.skipped && results.length === 0) {
    // Negatif kontrol: hiçbir kayıtla eşleşmemesi gereken sorgu "bulundu" dönerse adapter güvenilmezdir
    // (ör. sayfa başlığındaki profil linki, filtreyi yok sayan URL). Matris bu durumda üretilmez.
    const c = await newCtx();
    const neg = await adapter.search(c, `zzq-hdl-neg-${Date.now()}`, rec.recordId);
    await c.close();
    if (neg.found) {
      console.error('Negatif kontrol başarısız: anlamsız sorgu kaydı "buldu". Adapter arama sonucunu yanlış okuyor.');
      await browser.close();
      process.exit(2);
    }
  }
  if (!rec.skipped) {
    for (const q of queriesFor(fixture.value)) {
      const c = await newCtx();
      try {
        const r = await adapter.search(c, q.query, rec.recordId);
        rec.queries.push({ ...q, found: r.found });
      } catch (e) {
        rec.queries.push({ ...q, error: e.message.split('\n')[0] });
      } finally { await c.close(); }
    }
  }
  results.push(rec);
}
await browser.close();

// Matris: satır = fixture, sütun = varyant. ✓ bulundu, · bulunamadı, ! hata, (boş) = sorgu üretilmedi.
const cols = VARIANTS.map((v) => v.id);
const cell = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
console.log(`\n${adapter.name} — arama matrisi (✓ bulundu  · bulunamadı  ! hata)\n`);
console.log(cell('fixture', 34), cols.map((c) => cell(c, 11)).join(''));
let requiredMiss = 0;
for (const r of results) {
  if (r.skipped) { console.log(cell(r.fixtureId, 34), `atlandı: ${r.skipped}`); continue; }
  const marks = cols.map((c) => {
    const q = r.queries.find((x) => x.variants.includes(c));
    if (!q) return cell('', 11);
    return cell(q.error ? '!' : q.found ? '✓' : '·', 11);
  });
  if (r.queries.some((q) => q.required && q.found === false)) requiredMiss++;
  console.log(cell(r.fixtureId, 34), marks.join(''));
}
console.log(`\nzorunlu (exact) aramada bulunamayan: ${requiredMiss}`);
for (const r of results) for (const q of r.queries) if (q.required && q.found === false)
  console.log(`  ✗ ${r.fixtureId}: "${escaped(q.query)}" kendi değeriyle aranınca bulunamadı`);

const out = opt('--out', `runs/search-${adapter.name}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ schemaVersion: '0.1', kind: 'search', adapter: adapter.name, at: new Date().toISOString(), results }, null, 2));
console.log(`sonuç: ${out}`);
process.exitCode = requiredMiss ? 1 : 0;
