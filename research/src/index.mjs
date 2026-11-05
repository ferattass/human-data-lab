import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate, describe } from './compare.mjs';

export * from './compare.mjs';

const corpusDir = fileURLToPath(new URL('../corpus/', import.meta.url));

export function loadCorpus(name = 'text-smoke', { exclude = [] } = {}) {
  const data = JSON.parse(readFileSync(corpusDir + name + '.json', 'utf8'));
  return data.fixtures.filter((f) => !f.properties.some((p) => exclude.includes(p)));
}

// Playwright/ Node assert ile kullanılabilir: başarısızsa kod noktası ayrıntılı hata fırlatır.
export function expectTextPreserved(expected, actual, { rule = 'text.exact.v1', label = '' } = {}) {
  const r = evaluate(rule, expected, actual);
  if (r.status !== 'passed') {
    const err = new Error(`Metin korunmadı${label ? ` [${label}]` : ''}\n${describe(expected, actual ?? '', rule)}`);
    err.result = r;
    throw err;
  }
  return r;
}

/**
 * Tek fixture için roundtrip. Uygulamaya özgü kısımlar adapter'dadır:
 *   create(page, value)        -> { recordId, injected }   (form doldur + kaydet)
 *   readFresh(browser, id)     -> string                   (YENİ context'te taze okuma)
 * Dönen kayıt, gözlem sınırlarını ayrı tutar; kabul ve korunma ayrı değerlendirilir.
 */
export async function roundtrip({ browser, adapter, fixture, rules = ['text.exact.v1', 'text.nfc.v1'] }) {
  const newCtx = () => (adapter.newContext ? adapter.newContext(browser) : browser.newContext());
  const ctx = await newCtx();
  const page = await ctx.newPage();
  const rec = { fixtureId: fixture.id, authored: fixture.value };
  const writeStatuses = [];
  page.on('response', (r) => { if (r.request().method() !== 'GET') writeStatuses.push(r.status()); });
  try {
    const created = await adapter.create(page, fixture.value);
    rec.injected = created.injected;
    rec.writeStatuses = writeStatuses;
    const serverError = writeStatuses.some((s) => s >= 500);
    rec.applicationOutcome = serverError ? 'server-error'
      : created.recordId ? 'accepted' : created.rejected ? 'rejected' : 'indeterminate';
    rec.recordId = created.recordId;
    if (created.rejected) rec.rejectReason = created.rejected;
  } catch (e) {
    rec.execution = 'error';
    rec.error = String(e.message).split('\n')[0];
    await ctx.close();
    return rec;
  }
  await ctx.close();

  if (rec.applicationOutcome === 'accepted') {
    const fresh = await newCtx(); // önceki form/sayfa durumu taşınmaz; yalnız oturum
    try {
      rec.readback = await adapter.readFresh(fresh, rec.recordId);
    } catch (e) {
      rec.readbackError = String(e.message).split('\n')[0];
    } finally {
      await fresh.close();
    }
    if (adapter.exportValue) {
      const ex = await newCtx();
      try {
        const out = await adapter.exportValue(ex, rec.recordId);
        rec.exported = out.value;
        rec.exportMeta = out.meta;
      } catch (e) {
        rec.exportError = String(e.message).split('\n')[0];
      } finally {
        await ex.close();
      }
    }
  }
  rec.execution ??= 'completed';
  // Başlangıç sınırı authored; injected farkı ayrıca görünür kalır.
  rec.inputChangedBeforeSubmit = rec.injected !== undefined && rec.injected !== rec.authored;
  rec.firstDivergence = rec.inputChangedBeforeSubmit ? 'injected (gönderimden önce, tarayıcı/form)'
    : rec.readback !== undefined && rec.readback !== rec.authored ? 'readback (kayıt sonrası)' : null;
  rec.assertions = rules.map((rule) => evaluate(rule, rec.authored, rec.readback));
  if (adapter.exportValue) rec.exportAssertions = rules.map((rule) => evaluate(rule, rec.authored, rec.exported));
  return rec;
}
