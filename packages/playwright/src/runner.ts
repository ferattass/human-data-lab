// Deneme yürütücüsü (§17, §20–26). Yaşam döngüsü, bütçeler, iptal, cleanup yükümlülüğü ve kanıt.
import { chromium, request as pwRequest } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BUDGETS, SCHEMA_VERSION, SchemaError, classifyReproducibility, digestOf, escaped, codePoints, measures,
  evaluateTrial, exitCode, firstObservedDivergence, reductions, resolveExpectation, runtimeInfo, sameSignature,
  signatureOf, summarize, validateContract,
} from '../../core/src/index.ts';
import type {
  Budgets, CleanupStatus, ExitCode, Finding, FindingSignature, Fixture, Observation, Observations, OwnedFixture, Phase,
  PhaseEvent, ShrinkSummary, TrialError, TrialIdentity, TrialResult,
} from '../../core/src/index.ts';
import { loadCorpus } from '../../corpus/src/index.ts';
import { RunDir } from '../../store/src/index.ts';
import type { Manifest } from '../../store/src/index.ts';
import { renderReportFile } from '../../reporter/src/index.ts';
import { AdapterError, ScopeError } from './adapter.ts';
import type { CleanupContext, CleanupResult, ReadObservation, RoundtripAdapter, TrialContext } from './adapter.ts';
import type { FixtureOverride, RoundtripConfig } from './config.ts';

/** Sürüm tek yerden: package.json (depoda ../../../, derlenmiş dist/ içinde ../../../../). */
function readVersion(): string {
  for (const rel of ['../../../package.json', '../../../../package.json']) {
    try {
      const p = JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as { name?: string; version?: string };
      if (p.name === 'human-data-lab' && typeof p.version === 'string') return p.version;
    } catch { /* sonraki aday */ }
  }
  return '0.0.0';
}
export const TOOL = { name: 'human-data-lab', version: readVersion() };

export interface RunOptions {
  config: RoundtripConfig;
  /** Yapılandırma dosyasının yolu: repro spec'i bu dosyaya bağlanır. */
  configPath?: string;
  corpusSet?: string;
  fixtures?: FixtureOverride[];
  artifactsDir?: string;
  runId?: string;
  signal?: AbortSignal;
  browser?: Browser;
  reproduce?: boolean;
  shrink?: boolean;
  replayOf?: Manifest['replayOf'];
  log?: (line: string) => void;
}

export interface RunOutcome {
  runDir: string;
  exitCode: ExitCode;
  manifest: Manifest;
  trials: TrialResult[];
  findings: Finding[];
}

class PhaseTimeout extends Error { readonly errorClass = 'target'; }
class Cancelled extends Error {}

const now = () => new Date().toISOString();
const newRunId = () => `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}-${randomBytes(3).toString('hex')}`;

function originsOf(list: string[]) {
  return new Set(list.map((o) => new URL(o).origin));
}

/** Sonucu bir abort sinyaline bağlı yarışa sokar; Playwright çağrıları signal'ı kendileri dinlemez. */
export function raceSignal<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  // Sinyal kazanırsa terk edilen işlemin geç gelen hatası işlenmemiş reddetmeye dönüşmesin.
  p.catch(() => {});
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((res, rej) => {
    const onAbort = () => rej(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    p.then((v) => { signal.removeEventListener('abort', onAbort); res(v); }, (e) => { signal.removeEventListener('abort', onAbort); rej(e); });
  });
}

/** Origin allowlist uygulanmış HTTP istemcisi: izinli olmayan origin'e istek atmaz, yönlendirme izlemez (§30). CLI kurtarma temizliği de bunu kullanır. */
export async function guardedRequestContext(baseURL: string, allowed: Set<string>, storageState?: Awaited<ReturnType<BrowserContext['storageState']>>): Promise<APIRequestContext> {
  const api = await pwRequest.newContext({ baseURL, storageState });
  return new Proxy(api, {
    get(t, prop, recv) {
      const v = Reflect.get(t, prop, recv);
      if (typeof v !== 'function' || !['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'].includes(String(prop))) return typeof v === 'function' ? v.bind(t) : v;
      return (url: string | { url(): string }, options?: Record<string, unknown>) => {
        const href = typeof url === 'string' ? url : url.url();
        const origin = new URL(href, baseURL).origin;
        if (!allowed.has(origin)) throw new ScopeError(`izinli olmayan origin'e istek engellendi: ${origin}`);
        // Yönlendirme izlenmez: izinli sunucunun 3xx'i sırlı başlıkları başka origin'e taşımasın (§30).
        return (v as (...a: unknown[]) => unknown).call(t, url, { ...(options ?? {}), maxRedirects: 0 });
      };
    },
  });
}

function classifyError(e: unknown): TrialError['class'] {
  if (e instanceof ScopeError || e instanceof SchemaError) return 'configuration';
  if (e instanceof AdapterError) return e.errorClass;
  if (e instanceof PhaseTimeout) return 'target';
  const m = String((e as Error)?.message ?? e);
  if (/strict mode violation|locator|selector|waiting for/i.test(m)) return 'adapter';
  if (/net::|ECONNREFUSED|ECONNRESET|socket hang up|Target page, context or browser has been closed/i.test(m)) return 'target';
  return 'adapter';
}

export async function runRoundtrip(opts: RunOptions): Promise<RunOutcome> {
  const { config } = opts;
  const log = opts.log ?? (() => {});
  const runId = opts.runId ?? newRunId();
  const budgets: Budgets = { ...DEFAULT_BUDGETS, ...(config.budgets ?? {}), workers: 1 };
  const artifactsDir = resolve(opts.artifactsDir ?? config.artifactsDir ?? 'runs');
  const run = RunDir.create(artifactsDir, runId);
  const startedAt = now();
  const problems: string[] = [];
  const adapter = config.adapter;
  const runSignal = opts.signal ?? new AbortController().signal;
  // Sırlar her kullanımda yeniden okunur: adapter authenticate sırasında öğrendiği sırları (oturum token'ı) da bildirebilir.
  const secretsNow = () => { try { return (adapter?.secrets?.() ?? []).filter((x) => typeof x === 'string' && x.length >= 4); } catch { return []; } };
  const redact = (e: unknown, o: { multiline?: boolean } = {}) => redactMessage(e, secretsNow(), o);

  // ---------- Preflight: şema hatasında browser mutasyonu başlamaz (§22, A14) ----------
  let fixtures: Array<{ fixture: Fixture; value: string; origin: string; expect?: 'must-accept' | 'must-reject' }> = [];
  let corpusInfo = { id: 'inline', version: '0.0.0', set: 'inline', digest: '' };
  const outOfScope: Array<{ fixtureId: string; reason: string }> = [];
  const allowed = (() => { try { return originsOf(config.allowedOrigins ?? []); } catch { return new Set<string>(); } })();
  const manifestBase = (): Manifest => ({
    schemaVersion: SCHEMA_VERSION, kind: 'roundtrip-run', runId, status: 'incomplete', startedAt, cancelled: false,
    syntheticDemo: !!config.syntheticDemo, replayOf: opts.replayOf,
    provenance: {
      tool: TOOL,
      adapter: { id: adapter?.id ?? '?', version: adapter?.version ?? '?', capabilities: adapter?.capabilities ?? null },
      target: { name: config.target?.name ?? '?', baseURL: config.target?.baseURL ?? '?' },
      corpus: corpusInfo, contractDigest: safeDigest(config.contract), flowDigest: safeDigest({ field: config.contract?.field, readback: config.contract?.readback, adapter: adapter?.id, adapterVersion: adapter?.version }),
      browser: { name: 'chromium', version: '' }, runtime: runtimeInfo(), budgets, allowedOrigins: [...allowed], order: [],
    },
    problems, files: {},
  });
  try {
    validateContract(config.contract);
    if (!adapter || typeof adapter.prepare !== 'function' || typeof adapter.create !== 'function' || typeof adapter.readFresh !== 'function' || typeof adapter.cleanup !== 'function')
      throw new SchemaError('adapter', [{ path: 'adapter', message: 'prepare/create/readFresh/cleanup zorunlu' }]);
    if (!allowed.size) throw new SchemaError('yapılandırma', [{ path: 'allowedOrigins', message: 'en az bir izinli origin zorunlu' }]);
    if (!allowed.has(new URL(config.target.baseURL).origin)) throw new SchemaError('yapılandırma', [{ path: 'target.baseURL', message: 'baseURL izinli originlerde değil' }]);
    const caps = adapter.capabilities;
    if (!caps.control.includes(config.contract.field.control)) throw new SchemaError('adapter yetenekleri', [{ path: 'capabilities.control', message: `${config.contract.field.control} desteklenmiyor` }]);
    for (const c of config.contract.preservation) {
      const missing = c.boundary.filter((b) => b !== 'authored' && !caps.boundaries.includes(b));
      if (missing.length && c.required) throw new SchemaError('adapter yetenekleri', [{ path: `preservation.${c.id}`, message: `required kontrol için gözlenemeyen sınır: ${missing.join(', ')}` }]);
    }
    if (config.contract.readback.kind === 'readiness-signal' && typeof adapter.readiness !== 'function')
      throw new SchemaError('adapter yetenekleri', [{ path: 'readback', message: 'readiness-signal politikası adapter.readiness gerektirir' }]);
    if (opts.fixtures) {
      fixtures = opts.fixtures.map((o) => ({ fixture: o.fixture, value: o.value ?? o.fixture.value, origin: o.origin, expect: o.expect }));
      corpusInfo = { id: 'override', version: '0.0.0', set: opts.fixtures[0]?.origin ?? 'inline', digest: digestOf(opts.fixtures.map((o) => [o.fixture.id, o.value ?? o.fixture.value])) };
    } else {
      const c = loadCorpus(opts.corpusSet ?? config.corpus?.set ?? 'smoke', config.corpus?.file);
      corpusInfo = { id: c.id, version: c.version, set: c.set, digest: c.digest };
      fixtures = c.fixtures.map((f) => ({ fixture: f, value: f.value, origin: 'corpus' }));
    }
  } catch (e) {
    problems.push(`preflight: ${redact(e, { multiline: true })}`);
    run.writeJsonAtomic('contract.json', { contract: config.contract ?? null, preflightFailed: true });
    const m = manifestBase();
    m.finishedAt = now();
    m.exitCode = 2;
    m.summary = summarize({ selected: 0, outOfScope: [], trials: [], findings: 0 });
    run.writeManifest(m);
    log(`preflight başarısız — tarayıcı başlatılmadı:\n${redact(e, { multiline: true })}`);
    return { runDir: run.root, exitCode: 2, manifest: m, trials: [], findings: [] };
  }

  const contract = config.contract;
  run.writeJsonAtomic('contract.json', {
    schemaVersion: SCHEMA_VERSION, contract, contractDigest: digestOf(contract),
    target: config.target, adapter: { id: adapter.id, version: adapter.version, capabilities: adapter.capabilities },
    budgets, allowedOrigins: [...allowed], configPath: opts.configPath ? resolve(opts.configPath) : undefined,
  });

  const applicable: Array<{ fixture: Fixture; value: string; origin: string; expect: 'must-accept' | 'must-reject' }> = [];
  for (const f of fixtures) {
    if (f.expect) { applicable.push({ ...f, expect: f.expect }); continue; }
    const r = resolveExpectation(contract, f.fixture);
    if (r.kind === 'out-of-scope') outOfScope.push({ fixtureId: f.fixture.id, reason: r.reason });
    else applicable.push({ ...f, expect: r.expect });
  }

  const ownsBrowser = !opts.browser;
  const browser = opts.browser ?? await chromium.launch({ headless: config.headless ?? true });
  const browserVersion = browser.version();
  let storageState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;
  let cancelled = false;
  let stopRun: string | null = null;
  /** Herhangi bir denemenin cleanup'ı doğrulanamadıysa ortam kirlidir: sonraki tekrar ve küçültme yapılmaz (§26). */
  let dirtyEnv = false;
  const trials: TrialResult[] = [];
  const order: string[] = [];
  let seq = 0;
  let targetBuild: string | undefined;

  // Cleanup bağlamı: kapı kapandıktan (bütçe/timeout sonrası) sonra yeni istek bağlamı açılamaz; geç gelen istek sonraki denemeyle çakışmaz.
  const cleanupCtxFor = (identity: TrialIdentity, signal: AbortSignal, apis: APIRequestContext[], gate: { closed: boolean } = { closed: false }): CleanupContext => ({
    identity, baseURL: config.target.baseURL, signal,
    request: async () => {
      if (gate.closed) throw new Cancelled('cleanup kapandı; yeni istek bağlamı açılmaz');
      const api = await guardedApi();
      if (gate.closed) { await api.dispose().catch(() => {}); throw new Cancelled('cleanup kapandı; yeni istek bağlamı açılmaz'); }
      apis.push(api); return api;
    },
  });

  const guardedApi = () => guardedRequestContext(config.target.baseURL, allowed, storageState);

  /** Koşu başı adımları (authenticate, targetBuild) deneme bütçesi ve iptal sinyaliyle sınırlıdır: asılı bir /health koşuyu kilitlemez. */
  const budgeted = async <T>(what: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const ac = new AbortController();
    const onAbort = () => ac.abort(runSignal.reason ?? new Cancelled('koşu iptal edildi'));
    runSignal.addEventListener('abort', onAbort, { once: true });
    if (runSignal.aborted) onAbort();
    const timer = setTimeout(() => ac.abort(new PhaseTimeout(`${what} bütçesi aşıldı (${budgets.trialTimeoutMs} ms)`)), budgets.trialTimeoutMs);
    try { return await raceSignal(fn(ac.signal), ac.signal); }
    finally { clearTimeout(timer); runSignal.removeEventListener('abort', onAbort); }
  };
  try {
    if (adapter.authenticate) storageState = await budgeted('authenticate', () => adapter.authenticate!(browser, config.target.baseURL));
    if (adapter.targetBuild) {
      const apis: APIRequestContext[] = [];
      try { targetBuild = await budgeted('targetBuild', (signal) => adapter.targetBuild!(cleanupCtxFor({ runId, caseId: '-', candidateId: '-', attemptId: '-', fixtureKey: '-' }, signal, apis))); }
      catch (e) { problems.push(`targetBuild okunamadı: ${redact(e)}`); }
      finally { for (const a of apis) await a.dispose().catch(() => {}); }
    }
  } catch (e) {
    problems.push(`authenticate: ${redact(e)}`);
    stopRun = 'authenticate başarısız';
  }

  // ---------- Tek deneme ----------
  async function runTrial(fixture: Fixture, value: string, expectation: 'must-accept' | 'must-reject', caseId: string, candidateId: string, origin: string): Promise<TrialResult> {
    const attemptId = `attempt-${String(++seq).padStart(3, '0')}`;
    order.push(attemptId);
    const identity: TrialIdentity = { runId, caseId, candidateId, attemptId, fixtureKey: fixture.id };
    run.appendJsonl('fixtures.jsonl', { fixtureId: fixture.id, caseId, candidateId, attemptId, value, origin, escaped: escaped(value) });
    const events: PhaseEvent[] = [];
    const timings: Partial<Record<Phase, number>> = {};
    const errors: TrialError[] = [];
    const observations: Observations = { authored: { boundary: 'authored', status: 'observed', value, source: 'fixture', at: now() } };
    const readbackSamples: NonNullable<TrialResult['readbackSamples']> = [];
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    const apis: APIRequestContext[] = [];
    let scopeViolation: string | null = null;
    let trialClosed = false;
    let applicationOutcome: TrialResult['applicationOutcome'] = 'indeterminate';
    let acceptanceEvidence: TrialResult['acceptanceEvidence'];
    let execution: TrialResult['execution'] = 'completed';
    let own: OwnedFixture | undefined;
    const allocNamespaces: string[] = [];
    const allocResources: string[] = [];

    const trialAc = new AbortController();
    const onRunAbort = () => trialAc.abort(new Cancelled('koşu iptal edildi'));
    runSignal.addEventListener('abort', onRunAbort, { once: true });
    if (runSignal.aborted) trialAc.abort(new Cancelled('koşu iptal edildi'));
    const timer = setTimeout(() => trialAc.abort(new PhaseTimeout(`deneme bütçesi aşıldı (${budgets.trialTimeoutMs} ms)`)), budgets.trialTimeoutMs);

    const allocations = {
      ref: 'allocations.jsonl',
      reserve(namespace: string) {
        allocNamespaces.push(namespace);
        run.appendJsonl('allocations.jsonl', { at: now(), attemptId, event: 'reserve', namespace });
      },
      resource(namespace: string, resourceId: string, kind?: string) {
        allocResources.push(resourceId);
        run.appendJsonl('allocations.jsonl', { at: now(), attemptId, event: 'resource', namespace, resourceId, kind });
      },
    };

    const guardContext = (ctx: BrowserContext) => {
      ctx.on('request', (r) => {
        let origin: string;
        try { origin = new URL(r.url()).origin; } catch { return; }
        if (r.url().startsWith('data:') || r.url().startsWith('about:')) return;
        if (!allowed.has(origin) && !scopeViolation) {
          scopeViolation = r.url();
          trialAc.abort(new ScopeError(`izinli olmayan origin: ${r.url()} — mutasyon durduruldu`));
        }
      });
      // WebSocket bağlantıları request/route akışına düşmez; ayrıca denetlenir. İzinli origin'e gidenler sunucuya bağlanır.
      const ws = ctx.routeWebSocket(/.*/, (socket) => {
        let o = '';
        try { o = new URL(socket.url()).origin.replace(/^ws/, 'http'); } catch { /* geçersiz URL */ }
        if (!allowed.has(o)) {
          if (!scopeViolation) { scopeViolation = socket.url(); trialAc.abort(new ScopeError(`izinli olmayan origin (WebSocket): ${socket.url()} — mutasyon durduruldu`)); }
          socket.close({ code: 1008, reason: 'origin allowlist' });
          return;
        }
        socket.connectToServer();
      });
      return Promise.all([ws, ctx.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith('data:')) return route.continue();
        const o = new URL(u).origin;
        if (!allowed.has(o)) return route.abort('blockedbyclient');
        return route.continue();
      })]).then(() => undefined);
    };

    const tctx: TrialContext = {
      identity, baseURL: config.target.baseURL, signal: trialAc.signal,
      async newPage() {
        if (trialClosed) throw new Cancelled('deneme kapandı; yeni sayfa açılmaz');
        const ctx = await browser.newContext({ baseURL: config.target.baseURL, storageState });
        // Deneme bu arada kapandıysa (iptal/timeout), geç gelen context de kapatılır: cleanup'tan sonra mutasyon yok.
        if (trialClosed) { await ctx.close().catch(() => {}); throw new Cancelled('deneme kapandı; yeni sayfa açılmaz'); }
        contexts.push(ctx);
        await guardContext(ctx);
        const p = await ctx.newPage();
        pages.push(p);
        return p;
      },
      async request() {
        if (trialClosed) throw new Cancelled('deneme kapandı; yeni istek bağlamı açılmaz');
        const a = await guardedApi();
        if (trialClosed) { await a.dispose().catch(() => {}); throw new Cancelled('deneme kapandı; yeni istek bağlamı açılmaz'); }
        apis.push(a); return a;
      },
      observe(boundary, obs) { observations[boundary] = { boundary, at: now(), ...obs, ...(obs.note === undefined ? {} : { note: redact(obs.note) }) } as Observation; },
      allocations,
      async evidence(name, page) { return captureEvidence(page, `${attemptId}-${name}`); },
      async unique(locator, what) {
        const n = await locator.count();
        if (n !== 1) throw new AdapterError(`"${what}" için ${n} eşleşme var; tam olarak 1 olmalı (rastgele ilki seçilmez)`, 'adapter');
        return locator;
      },
    };

    async function captureEvidence(page: Page, name: string) {
      try {
        if (page.isClosed()) return undefined;
        const buf = await page.screenshot({ fullPage: false, timeout: 3000 });
        if (buf.length > budgets.maxEvidenceBytes) return undefined;
        const rel = `evidence/${name}.png`;
        run.writeTextAtomic(rel, buf);
        return rel;
      } catch { return undefined; }
    }

    async function phase<T>(name: Phase, fn: () => Promise<T>): Promise<T> {
      const t0 = Date.now();
      events.push({ phase: name, event: 'start', at: now() });
      try {
        const v = await raceSignal(fn(), trialAc.signal);
        events.push({ phase: name, event: 'end', at: now() });
        return v;
      } catch (e) {
        const cls = classifyError(e);
        events.push({ phase: name, event: 'error', at: now(), errorClass: cls, message: redact(e) });
        throw e;
      } finally { timings[name] = (timings[name] ?? 0) + Date.now() - t0; }
    }

    try {
      own = await phase('prepare', () => adapter.prepare(tctx));
      const created = await phase('submit', () => adapter.create(tctx, own!, value));
      events.push({ phase: 'acceptance', event: 'end', at: now() });
      if (created.kind === 'accepted') {
        if (!created.recordId) {
          // B05: başarı mesajı var ama kayıt kimliği yok → kabul kanıtlanmadı.
          applicationOutcome = 'indeterminate';
          acceptanceEvidence = { reason: 'kabul bildirildi ama kayıt kimliği yok', evidenceRef: created.evidenceRef };
        } else {
          applicationOutcome = 'accepted';
          acceptanceEvidence = { recordId: created.recordId, evidenceRef: created.evidenceRef };
          allocations.resource(own.namespace, created.recordId, 'record');
          if (created.submitted !== undefined && !observations.submitted) tctx.observe('submitted', { status: 'observed', value: created.submitted, source: 'request-body' });
        }
      } else if (created.kind === 'rejected') {
        applicationOutcome = 'rejected';
        acceptanceEvidence = { reason: redact(created.reason), evidenceRef: created.evidenceRef };
      } else {
        applicationOutcome = 'indeterminate';
        acceptanceEvidence = { reason: redact(created.reason) };
      }
      if (!observations.injected) observations.injected = { boundary: 'injected', status: adapter.capabilities.boundaries.includes('injected') ? 'not-observed' : 'not-supported' };
      if (!observations.submitted) observations.submitted = { boundary: 'submitted', status: adapter.capabilities.boundaries.includes('submitted') ? 'not-observed' : 'not-supported', note: 'submitted gözlenmedi; injected değeri submitted diye etiketlenmez' };

      if (applicationOutcome === 'accepted') {
        const recordId = acceptanceEvidence!.recordId!;
        const rb = await phase('readFresh', () => readWithPolicy(recordId));
        if (rb) {
          if (rb.recordIdSeen !== undefined && rb.recordIdSeen !== recordId) {
            observations.readback = { boundary: 'readback', status: 'not-observed', source: rb.source, note: `yanlış kayıt okundu (${rb.recordIdSeen} ≠ ${recordId})` };
            errors.push({ class: 'observation', phase: 'readFresh', message: `readFresh beklenen kaydı okumadı: ${rb.recordIdSeen} ≠ ${recordId}` });
          } else {
            observations.readback = { boundary: 'readback', status: rb.status, value: rb.status === 'observed' ? rb.value : undefined, source: rb.source, note: rb.note === undefined ? undefined : redact(rb.note), at: now() };
          }
        }
      }
    } catch (e) {
      if (e instanceof Cancelled || (runSignal.aborted && !(e instanceof ScopeError) && !scopeViolation)) {
        execution = 'cancelled';
        cancelled = true;
      } else {
        execution = 'error';
        const err = scopeViolation ? new ScopeError(`izinli olmayan origin: ${scopeViolation}`) : e;
        const cls = classifyError(err);
        const lastPhase = [...events].reverse().find((ev) => ev.event === 'error')?.phase ?? 'prepare';
        errors.push({ class: cls, phase: lastPhase, message: redact(err) });
        if (err instanceof ScopeError) stopRun = `kapsam hatası: ${(err as Error).message}`;
      }
    } finally {
      clearTimeout(timer);
      runSignal.removeEventListener('abort', onRunAbort);
    }
    // Son aşama bittikten sonra gelen yabancı origin isteği de kapsam ihlalidir: engellendi ama kayda geçer ve koşuyu durdurur (§30).
    if (scopeViolation && execution === 'completed') {
      execution = 'error';
      errors.push({ class: 'configuration', phase: 'finalize', message: redact(new ScopeError(`izinli olmayan origin: ${scopeViolation}`)) });
      stopRun = `kapsam hatası: izinli olmayan origin: ${scopeViolation}`;
    }

    // ---------- Karşılaştırma ----------
    const t0 = Date.now();
    const assertions = evaluateTrial({ contract, expectation, execution, applicationOutcome, observations, attemptId });
    timings.compare = Date.now() - t0;
    const violated = assertions.some((a) => a.required && a.status === 'failed');
    let evidenceRef: string | undefined;
    if (violated || execution !== 'completed') {
      const last = [...pages].reverse().find((p) => !p.isClosed());
      if (last) evidenceRef = await captureEvidence(last, attemptId);
    }

    // Denemenin browser context'leri cleanup'tan ÖNCE kapatılır: iptal/timeout sonrası arkada süren adapter
    // işlemleri (ör. yarım kalmış gönderim) temizlikten sonra yeni kayıt yaratamasın (B11).
    trialClosed = true;
    for (const c of contexts) await c.close().catch(() => {});
    // Denemenin kendi API bağlamları da kapanır; cleanup kendi bağlamlarını açar.
    for (const a of apis.splice(0)) await a.dispose().catch(() => {});

    // ---------- Cleanup: ana signal'dan bağımsız, ayrı bütçe (§22, B11) ----------
    let cleanup: CleanupStatus = 'not-needed';
    // Rezerve edilen HER namespace temizlenir (prepare yarıda kalmış veya birden çok alan açmış olabilir); en kötü durum raporlanır.
    const namespaces = [...new Set([...(own ? [own.namespace] : []), ...allocNamespaces])];
    if (namespaces.length) {
      if (own) own.resourceIds = [...new Set([...own.resourceIds, ...allocResources])];
      const rank: Record<CleanupStatus, number> = { 'not-needed': 0, verified: 1, pending: 2, failed: 3 };
      const cGate = { closed: false };
      const cAc = new AbortController();
      const cTimer = setTimeout(() => cAc.abort(new PhaseTimeout('cleanup bütçesi aşıldı')), budgets.cleanupTimeoutMs);
      const c0 = Date.now();
      events.push({ phase: 'cleanup', event: 'start', at: now() });
      try {
        for (const ns of namespaces) {
          const target: OwnedFixture = own && own.namespace === ns ? own : { namespace: ns, resourceIds: allocResources, allocationLogRef: 'allocations.jsonl' };
          let status: CleanupStatus;
          try {
            const r: CleanupResult = await raceSignal(adapter.cleanup(cleanupCtxFor(identity, cAc.signal, apis, cGate), target), cAc.signal);
            status = r.status;
            events.push({ phase: 'cleanup', event: 'end', at: now(), message: r.detail === undefined ? undefined : redact(r.detail) });
            if (r.status === 'failed' || r.status === 'pending') errors.push({ class: 'cleanup', phase: 'cleanup', message: redact(r.detail ?? r.status) });
          } catch (e) {
            status = e instanceof PhaseTimeout ? 'pending' : 'failed';
            events.push({ phase: 'cleanup', event: 'error', at: now(), errorClass: 'cleanup', message: redact(e) });
            errors.push({ class: 'cleanup', phase: 'cleanup', message: redact(e) });
          }
          run.appendJsonl('allocations.jsonl', { at: now(), attemptId, event: 'cleanup', namespace: ns, status });
          if (rank[status] > rank[cleanup]) cleanup = status;
          if (cAc.signal.aborted) break; // bütçe bitti: kalan namespace'ler günlükte 'reserve' olarak kalır, hdl cleanup --owned-only bulur
        }
      } finally { clearTimeout(cTimer); cGate.closed = true; timings.cleanup = Date.now() - c0; }
    }
    if (cleanup === 'failed' || cleanup === 'pending') dirtyEnv = true;
    // Auth/API bağlamı temizlik tamamlanmadan kapatılmaz.
    for (const a of apis) await a.dispose().catch(() => {});

    const trial: TrialResult = {
      schemaVersion: SCHEMA_VERSION, identity, fixtureId: fixture.id, expectation, execution, applicationOutcome,
      acceptanceEvidence, observations, readbackSamples: readbackSamples.length ? readbackSamples : undefined,
      assertions, cleanup, errors, events, timings,
    };
    const div = firstObservedDivergence(observations);
    run.writeJsonAtomic(`observations/${attemptId}.json`, {
      schemaVersion: SCHEMA_VERSION, identity, origin,
      ...Object.fromEntries(Object.entries(observations).map(([b, o]) => [b, o && typeof o.value === 'string' ? { ...o, escaped: escaped(o.value), codePoints: codePoints(o.value), measures: measures(o.value) } : o])),
      readbackSamples, firstObservedDivergence: div, evidence: evidenceRef ? [evidenceRef] : [],
    });
    run.appendJsonl('attempts.jsonl', trial);
    trials.push(trial);
    log(`  ${attemptId} ${fixture.id.padEnd(34)} ${execution.padEnd(9)} ${applicationOutcome.padEnd(13)} ${assertions.map((a) => `${a.id}:${a.status}`).join(' ')}  cleanup:${cleanup}`);
    return trial;

    async function readWithPolicy(recordId: string): Promise<ReadObservation | undefined> {
      const pol = contract.readback;
      if (pol.kind === 'first-independent-read') return adapter.readFresh(tctx, own!, recordId);
      if (pol.kind === 'readiness-signal') {
        const deadline = Date.now() + budgets.trialTimeoutMs;
        while (Date.now() < deadline && !trialAc.signal.aborted) {
          if (await adapter.readiness!(tctx, own!, recordId)) return adapter.readFresh(tctx, own!, recordId);
          await new Promise((r) => setTimeout(r, 200));
        }
        return { status: 'not-observed', source: 'readiness-signal', note: 'hazır olma sinyali bütçe içinde gelmedi' };
      }
      // stable-read: N ardışık aynı gözlem; ara örnekler saklanır. Eşitliği kovalamak geçici bozulmayı gizleyebilir (§21).
      const deadline = Date.now() + pol.budgetMs;
      let streak = 0; let last: string | undefined; let lastObs: ReadObservation | undefined;
      while (Date.now() < deadline && !trialAc.signal.aborted) {
        const r = await adapter.readFresh(tctx, own!, recordId);
        readbackSamples.push({ at: now(), value: r.value, status: r.status });
        if (r.status === 'observed' && r.value === last) streak++; else streak = r.status === 'observed' ? 1 : 0;
        last = r.value; lastObs = r;
        if (streak >= pol.consecutive) return { ...r, note: `stable-read: ${pol.consecutive} ardışık aynı gözlem (${readbackSamples.length} örnek)` };
        await new Promise((res) => setTimeout(res, pol.intervalMs));
      }
      return { status: 'not-observed', source: lastObs?.source ?? 'stable-read', note: `stable-read: ${pol.budgetMs} ms içinde ${pol.consecutive} ardışık aynı gözlem yok (${readbackSamples.length} örnek saklandı)` };
    }
  }

  // ---------- Ana geçiş (seri, 1 worker: §26) ----------
  const findings: Finding[] = [];
  const mainAttemptIds = new Set<string>();
  try {
    if (!stopRun) log(`${adapter.id} · ${contract.id} · ${contract.preservation.map((p) => p.rule).join('+')} · ${applicable.length}/${fixtures.length} uygun fixture`);
    for (const f of applicable) {
      if (stopRun || runSignal.aborted) break;
      const t = await runTrial(f.fixture, f.value, f.expect, f.fixture.id, 'original', f.origin);
      mainAttemptIds.add(t.identity.attemptId);
    }

    // ---------- Bulgular: kararlılık + küçültme ----------
    const doReproduce = (opts.reproduce ?? config.reproduce ?? true) && budgets.reproduceTrials > 0;
    const doShrink = opts.shrink ?? config.shrink ?? true;
    const originals = trials.filter((t) => mainAttemptIds.has(t.identity.attemptId));
    for (const t of originals) {
      const sig = signatureOf(t, adapter.id, contract.field.id);
      if (!sig) continue;
      const f = applicable.find((x) => x.fixture.id === t.fixtureId)!;
      const findingId = `f${findings.length + 1}`;
      const attemptIds = [t.identity.attemptId];
      let repeats: TrialResult[] = [];
      let note = '';
      if (dirtyEnv) note = 'ortam kirli (doğrulanmamış cleanup); tekrar yapılmadı';
      else if (doReproduce && !stopRun && !runSignal.aborted) {
        for (let i = 0; i < budgets.reproduceTrials - 1 && !stopRun && !runSignal.aborted; i++) {
          const r = await runTrial(f.fixture, t.observations.authored!.value!, f.expect, f.fixture.id, 'original', 'reproduce');
          repeats.push(r); attemptIds.push(r.identity.attemptId);
          if (dirtyEnv) { note = 'cleanup doğrulanamadı; tekrar durdu'; break; }
        }
      }
      // Planlanan tekrarların hepsi koşmadıysa (kirli ortam, iptal, kapsam hatası) karar verilemez; "stable" denmez (C03).
      const planned = doReproduce ? budgets.reproduceTrials - 1 : 0;
      const reproducibility = !repeats.length ? 'not-checked' : repeats.length < planned ? 'inconclusive' : classifyReproducibility(sig, [t, ...repeats], adapter.id, contract.field.id);
      const reproduced = [t, ...repeats].filter((r) => sameSignature(sig, signatureOf(r, adapter.id, contract.field.id))).length;
      let shrink: ShrinkSummary | undefined;
      if (doShrink && reproducibility === 'stable' && !dirtyEnv && !stopRun && !runSignal.aborted) shrink = await shrinkFinding(f, sig);
      else shrink = { status: 'not-attempted', best: { value: t.observations.authored!.value!, candidateId: 'original', verifiedTrials: reproduced }, trialsUsed: 0, elapsedMs: 0, note: reproducibility === 'stable' ? (dirtyEnv ? 'ortam kirli (doğrulanmamış cleanup); küçültme yapılmadı' : doShrink ? 'koşu durdu' : 'küçültme kapalı') : `küçültme yapılmadı: tekrar durumu ${reproducibility}${note ? '; ' + note : ''}` };
      const finding: Finding = {
        schemaVersion: SCHEMA_VERSION, id: findingId, fixtureId: t.fixtureId, signature: sig,
        original: { value: t.observations.authored!.value!, attemptIds }, reproducibility,
        attemptsObserved: 1 + repeats.length, attemptsReproduced: reproduced, shrink, syntheticDemo: !!config.syntheticDemo,
      };
      findings.push(finding);
      run.writeJsonAtomic(`findings/${findingId}.json`, finding);
      run.writeTextAtomic(`repro/${findingId}.spec.ts`, reproSpec(finding, run.root, opts.configPath));
    }

    async function shrinkFinding(f: (typeof applicable)[number], sig: FindingSignature): Promise<ShrinkSummary> {
      const t0 = Date.now();
      let trialsUsed = 0;
      const history: Array<{ value: string; candidateId: string; verifiedTrials: number }> = [{ value: f.value, candidateId: 'original', verifiedTrials: budgets.reproduceTrials }];
      let best = history[0];
      let status: ShrinkSummary['status'] = 'no-smaller-found';
      let cand = 0;
      // Arama sırasında son bağımsız onay için reproduceTrials deneme rezerve edilir; bütçe biten aday atılmaz, onayı eksik işaretlenir.
      const budgetLeft = (reserve = 0) => trialsUsed + reserve < budgets.shrinkMaxTrials && Date.now() - t0 < budgets.shrinkMaxMs;
      let finalNote = '';
      const confirm = async (value: string, candidateId: string, n: number, reserve = 0) => {
        let ok = 0;
        for (let i = 0; i < n; i++) {
          if (!budgetLeft(reserve) || stopRun || runSignal.aborted) return { ok, complete: false, dirty: false };
          const r = await runTrial(f.fixture, value, f.expect, f.fixture.id, candidateId, 'shrink-confirm'); trialsUsed++;
          if (r.cleanup === 'failed' || r.cleanup === 'pending') return { ok, complete: false, dirty: true };
          if (sameSignature(sig, signatureOf(r, adapter.id, contract.field.id))) ok++; else return { ok, complete: true, dirty: false };
        }
        return { ok, complete: true, dirty: false };
      };
      outer: while (true) {
        let improved = false;
        for (const red of reductions(best.value)) {
          if (!budgetLeft(budgets.reproduceTrials)) { status = 'budget-exhausted'; break outer; }
          if (stopRun || runSignal.aborted) { status = 'budget-exhausted'; break outer; }
          const candidateId = `c${++cand}`;
          const r = await runTrial(f.fixture, red.value, f.expect, f.fixture.id, candidateId, `shrink:${red.strategy}`); trialsUsed++;
          if (r.cleanup === 'failed' || r.cleanup === 'pending') { status = 'stopped-cleanup'; break outer; }
          if (!sameSignature(sig, signatureOf(r, adapter.id, contract.field.id))) continue; // C04: farklı imza (ör. red) aynı hata değildir
          const c = await confirm(red.value, candidateId, budgets.reproduceTrials - 1, budgets.reproduceTrials);
          if (c.dirty) { status = 'stopped-cleanup'; break outer; }
          if (!c.complete) { status = 'budget-exhausted'; break outer; }
          if (c.ok !== budgets.reproduceTrials - 1) { status = 'stopped-unstable'; break outer; }
          best = { value: red.value, candidateId, verifiedTrials: c.ok + 1 };
          history.push(best);
          improved = true; status = 'completed';
          break;
        }
        if (!improved) break;
      }
      // Son bağımsız onay; kararsızsa önceki doğrulanmış aday korunur (C06).
      if (best.candidateId !== 'original' && status !== 'stopped-cleanup') {
        const fin = await confirm(best.value, `${best.candidateId}-final`, budgets.reproduceTrials);
        if (fin.dirty || (fin.complete && fin.ok !== budgets.reproduceTrials)) {
          // Kararsız veya kirli: önceki doğrulanmış aday korunur (C06).
          history.pop();
          best = history[history.length - 1];
          status = fin.dirty ? 'stopped-cleanup' : 'stopped-unstable';
        } else if (!fin.complete) {
          // Süre/iptal son onaya yetmedi: aday arama sırasında zaten reproduceTrials kez doğrulanmıştı, atılmaz; eksik onay not edilir.
          status = 'budget-exhausted';
          finalNote = ` Son bağımsız onay tamamlanmadı (${fin.ok}/${budgets.reproduceTrials}; bütçe veya iptal).`;
        }
      }
      const elapsedMs = Date.now() - t0;
      const note = best.candidateId === 'original'
        ? 'Belirtilen strateji ve bütçe altında daha küçük doğrulanmış örnek bulunamadı.'
        : `Belirtilen strateji ve bütçe altında doğrulanmış en küçük aday: ${[...best.value].length} kod noktası. Küresel minimum garantisi yoktur.`;
      return { status, best, trialsUsed, elapsedMs, note: note + finalNote };
    }
  } finally {
    if (ownsBrowser) await browser.close().catch(() => {});
  }

  if (runSignal.aborted) cancelled = true;
  if (stopRun) problems.push(stopRun);
  // Özet ana geçişin denemelerini sayar (tekrar/küçültme denemeleri attempts.jsonl'da ayrıca durur);
  // cleanup sayımı ise TÜM denemeleri kapsar: herhangi bir doğrulanmamış temizlik exit 3 gerektirir.
  const mainTrials = trials.filter((t) => mainAttemptIds.has(t.identity.attemptId));
  const s = summarize({ selected: fixtures.length, outOfScope, trials: mainTrials, findings: findings.length });
  for (const k of Object.keys(s.cleanup) as CleanupStatus[]) s.cleanup[k] = trials.filter((t) => t.cleanup === k).length;
  if (mainTrials.length < applicable.length && !cancelled && !stopRun) problems.push(`yürütülmeyen uygun fixture: ${applicable.length - mainTrials.length}`);
  if (cancelled && mainTrials.length < applicable.length) problems.push(`iptal: ${applicable.length - mainTrials.length} fixture yürütülmedi`);
  const code = exitCode({ cancelled, summary: s, runLevelProblems: problems });
  const m = manifestBase();
  m.provenance.corpus = corpusInfo;
  m.provenance.browser = { name: 'chromium', version: browserVersion };
  m.provenance.target.build = targetBuild;
  m.provenance.order = order;
  m.summary = s;
  m.cancelled = cancelled;
  m.exitCode = code;
  m.finishedAt = now();
  m.status = cancelled || stopRun || mainTrials.length < applicable.length ? 'incomplete' : 'complete';
  // Rapor manifest'ten önce yazılır ki digest listesinde yer alsın; rapor aynı veriyi okur.
  run.writeManifest(m);
  renderReportFile(run.root);
  run.writeManifest(m);
  log(`\nexit ${code} · ${s.executed} deneme · ${s.requiredFailed} required ihlal · ${s.requiredNotRun} çalışmayan required · cleanup ${JSON.stringify(s.cleanup)} · rapor: ${relative(process.cwd(), run.path('report.html'))}`);
  return { runDir: run.root, exitCode: code, manifest: m, trials, findings };
}

/**
 * Artifact'a yazılan her hata/ayrıntı mesajı buradan geçer (§30). Playwright "Call log" bölümleri istek
 * başlıklarını içerebilir: ilk satır alınır, bilinen sırlı başlıklar ve adapter'ın bildirdiği sır değerleri maskelenir.
 * Redaction kusursuz gizlilik garantisi değildir.
 */
export function redactMessage(e: unknown, secrets: string[] = [], o: { multiline?: boolean } = {}): string {
  let m = String((e as Error)?.message ?? e ?? '');
  m = m.split(/\n\s*Call log:/i)[0];
  if (!o.multiline) m = m.split('\n')[0];
  // Sıra önemli: önce şema+token (Bearer/Basic), sonra cookie satırının tamamı, sonra tek değerli başlıklar.
  // Aksi halde "Authorization: Bearer x" → "[REDACTED] x" olur ve token kalır.
  m = m.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, '$1 [REDACTED]');
  m = m.replace(/\b(cookie|set-cookie)(["']?\s*[:=]\s*["']?)[^\n"'}]+/gi, '$1$2[REDACTED]');
  m = m.replace(/\b(x-[a-z0-9-]*token|authorization|proxy-authorization|x-api-key)(["']?\s*[:=]\s*["']?(?:(?:Bearer|Basic)\s+)?)[^\s"',;}]+/gi, '$1$2[REDACTED]');
  for (const sec of secrets) m = m.split(sec).join('[REDACTED]');
  return m.slice(0, 2000);
}

function safeDigest(v: unknown) { try { return digestOf(v ?? null); } catch { return ''; } }

/** Regresyon spec'i: adapter ve hedef ortam bağımlılığı açık (§27). Somut değer saklıdır; corpus'tan yeniden üretilmez (C01). */
function reproSpec(f: Finding, runRoot: string, configPath?: string): string {
  const value = f.shrink?.best.value ?? f.original.value;
  const lit = JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const pkg = relative(resolve(runRoot, 'repro'), resolve(dirname(fileURLToPath(import.meta.url)), import.meta.url.endsWith('.ts') ? 'index.ts' : 'index.js')).split('\\').join('/');
  const cfg = configPath ? relative(resolve(runRoot, 'repro'), resolve(configPath)).split('\\').join('/') : null;
  return `// Human Data Lab — bulgu ${f.id} için regresyon testi.
// BAĞIMLILIK: bu test adapter'a ve çalışan hedef ortama bağlıdır; tek başına her bilgisayarda hatayı çalıştırmaz (§9).
//   adapter: ${f.signature.adapterId}  alan: ${f.signature.fieldId}  kural: ${f.signature.ruleId}  sınır: ${f.signature.boundary.join(' → ')}
//   imza: ${f.signature.applicationOutcome} / ${f.signature.differenceClass}   tekrar: ${f.reproducibility} (${f.attemptsReproduced}/${f.attemptsObserved})
//   ${f.syntheticDemo ? 'SENTETİK DEMO: kasıtlı eklenmiş hata.' : 'Gerçek hedef koşusu.'}
// Çalıştır: npx playwright test ${'<bu dosya>'}  (hedef uygulama ayakta olmalı)
import { test, expect } from '@playwright/test';
import { runSingleTrial } from '${pkg.startsWith('.') ? pkg : './' + pkg}';
${cfg ? `import config from '${cfg.startsWith('.') ? cfg : './' + cfg}';` : `// configPath bilinmiyor: aşağıya kendi roundtrip.config.ts dosyanızı import edin.\nconst config = undefined as never;`}

test(${JSON.stringify(`${f.id}: ${f.fixtureId} korunmalı (${f.signature.ruleId})`)}, async ({ browser }) => {
  const value = ${lit}; // escaped: ${JSON.stringify(escapedForComment(value))}
  const r = await runSingleTrial({ config, browser, fixtureId: ${JSON.stringify(f.fixtureId)}, value });
  expect(r.execution, r.describe).toBe('completed');
  expect(r.violations, r.describe).toEqual([]);
  expect(r.notRun, r.describe).toEqual([]); // required kontrol çalışmadan "geçti" denmez (C14)
});
`;
}
function escapedForComment(s: string) { return escaped(s); }
