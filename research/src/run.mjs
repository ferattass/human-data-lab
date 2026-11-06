#!/usr/bin/env node
// Kullanım: node src/run.mjs <adapter.mjs> [--corpus text-smoke] [--exclude prop1,prop2] [--out runs/x.json]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCorpus, roundtrip, escaped } from './index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const adapterPath = args[0];
if (!adapterPath) { console.error('adapter yolu gerekli'); process.exit(2); }
const adapter = (await import(pathToFileURL(resolve(adapterPath)).href)).default;
const fixtures = loadCorpus(opt('--corpus', 'text-smoke'), { exclude: (opt('--exclude', '') || '').split(',').filter(Boolean) });

const browser = await chromium.launch();
const results = [];
for (const fixture of fixtures) results.push(await roundtrip({ browser, adapter, fixture })); // seri: veri izolasyonu
await browser.close();

const cell = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
console.log(`\n${adapter.name} — ${results.length} fixture\n`);
const hasExport = !!adapter.exportValue;
console.log(cell('fixture', 34), cell('kabul', 13), cell('exact', 8), cell('nfc', 8), hasExport ? cell('export', 8) : '', 'fark / okunan');
let exportFail = 0;
let exactFail = 0, nfcFail = 0, notRun = 0, serverErr = 0;
for (const r of results) {
  const [ex, nf] = r.assertions ?? [];
  if (ex?.status === 'failed') exactFail++;
  if (nf?.status === 'failed') nfcFail++;
  if (!ex || ex.status === 'not-run') notRun++;
  if (r.applicationOutcome === 'server-error') serverErr++;
  const detail = r.error ? `HATA: ${r.error}` : r.readbackError ? `okuma hatası: ${r.readbackError}`
    : ex?.status === 'failed' ? `${ex.difference} @${r.firstDivergence?.split(' ')[0]}: "${escaped(r.readback)}"` : r.applicationOutcome === 'server-error' ? `HTTP ${r.writeStatuses.join(',')}` : r.rejectReason ? `red: ${r.rejectReason}` : '';
  const xe = r.exportAssertions?.[0];
  if (xe?.status === 'failed') exportFail++;
  const xdetail = xe?.status === 'failed' ? ` | export ${xe.difference}: "${escaped(r.exported)}"` : r.exportError ? ` | export hatası: ${r.exportError}` : '';
  console.log(cell(r.fixtureId, 34), cell(r.applicationOutcome ?? r.execution, 13), cell(ex?.status ?? '-', 8), cell(nf?.status ?? '-', 8), hasExport ? cell(xe?.status ?? '-', 8) : '', detail + xdetail);
}
console.log(`\nexact ihlal: ${exactFail}  nfc ihlal: ${nfcFail}  çalışmayan kontrol: ${notRun}  sunucu hatası: ${serverErr}${hasExport ? `  export ihlal: ${exportFail}` : ''}`);
if (hasExport) { const m = results.find((r) => r.exportMeta)?.exportMeta; if (m) console.log('export meta:', JSON.stringify(m)); }

const out = opt('--out', `runs/${adapter.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ schemaVersion: '0.1', adapter: adapter.name, at: new Date().toISOString(), results }, null, 2));
console.log(`sonuç: ${out}`);
process.exitCode = notRun || serverErr ? 2 : exactFail || exportFail ? 1 : 0;
