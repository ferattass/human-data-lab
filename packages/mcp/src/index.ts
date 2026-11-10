// @human-data-lab/mcp — Model Context Protocol sunucusu (stdio, JSON-RPC 2.0, satır sonu ayraçlı). Bağımlılık yok.
//
// Kod ajanları (MCP istemcisi olan her asistan/IDE) buradan çekirdeğin oracle'ına, corpus'a ve koşu kanıtına ulaşır.
// Çekirdek kararını model vermez (ADR 0005): sunucu yalnız aynı sonuç modelini okunur biçimde sunar, ikinci oracle yazmaz.
// Koşu başlatma (hdl_run) hedef uygulamada kayıt yaratır ve siler; bu yüzden yalnız operatör sunucuyu --allow-run ile
// başlattıysa açıktır (§30). stdout protokole aittir; günlük stderr'e gider.
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_RULES, PRESERVATION_RULES, SchemaError, classifyDifference, codePoints, describeDifference, escaped,
  firstDifference, measures, validateContract,
} from '../../core/src/index.ts';
import type { PreservationRuleId } from '../../core/src/index.ts';
import { isCorpusName, loadCorpus } from '../../corpus/src/index.ts';
import { compactRun, planShare, readRun } from '../../store/src/index.ts';
import { TOOL, loadConfigFile, runRoundtrip } from '../../playwright/src/index.ts';

export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

/** Depo/paket kökü: package.json'ı (name=human-data-lab) içeren en yakın üst dizin. Kaynakta ve dist/ içinde çalışır. */
function findRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    try { if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === 'human-data-lab') return dir; } catch { /* yukarı */ }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}
const ROOT = findRoot();

// ---------- JSON-RPC ----------

interface Req { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: Record<string, unknown> }
type Json = Record<string, unknown>;
class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) { super(message); this.code = code; this.data = data; }
}
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL = -32603;
const PARSE_ERROR = -32700;
const RESOURCE_NOT_FOUND = -32002;

// ---------- Araçlar ----------

interface ServeContext { allowRun: boolean; log: (l: string) => void; running: boolean; root: string }

/**
 * Ajanın verdiği yol sunucu kökünün (`--root`, varsayılan çalışma dizini) içinde kalmalı (§30): koşu dizini, yapılandırma
 * dosyası ve artifact dizini. Gerçek yol (realpath) ile denetlenir; sembolik bağlantıyla kök dışına çıkılamaz. UNC yolu reddedilir.
 */
function within(ctx: ServeContext, p: string, what: string): string {
  if (/^[\\/]{2}/.test(p)) throw new RpcError(INVALID_PARAMS, `${what}: UNC yolu kabul edilmez`);
  const abs = resolve(ctx.root, p);
  // Var olmayan hedefte (ör. yeni artifact dizini) en yakın var olan üst dizinin gerçek yolu alınır.
  let probe = abs; const rest: string[] = [];
  while (!existsSync(probe)) { const up = dirname(probe); if (up === probe) break; rest.unshift(probe.slice(up.length + 1)); probe = up; }
  const real = join(realpathSync(probe), ...rest);
  const rel = relative(realpathSync(ctx.root), real);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new RpcError(INVALID_PARAMS, `${what}: yol sunucu kökünün dışında (${ctx.root}); hdl mcp --root ile kökü değiştirin`);
  return abs;
}

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  run(args: Json, ctx: ServeContext): Promise<unknown>;
}

const str = (a: Json, k: string, required = true): string | undefined => {
  const v = a[k];
  if (v === undefined || v === null) { if (required) throw new RpcError(INVALID_PARAMS, `${k} zorunlu (dizgi)`); return undefined; }
  if (typeof v !== 'string') throw new RpcError(INVALID_PARAMS, `${k} dizgi olmalı`);
  return v;
};
const bool = (a: Json, k: string): boolean | undefined => {
  const v = a[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw new RpcError(INVALID_PARAMS, `${k} boolean olmalı`);
  return v;
};

const textView = (s: string) => ({ value: s, escaped: escaped(s), codePoints: codePoints(s), measures: measures(s) });

export const TOOLS: ToolDef[] = [
  {
    name: 'hdl_describe_difference',
    title: 'İki metni korunma kuralıyla karşılaştır',
    description: 'Beklenen ve görülen metni kapalı kural setiyle (text.exact.v1 | text.nfc.v1) karşılaştırır; tarayıcı veya ağ kullanmaz. ' +
      'Fark sınıfı (marks-stripped, normalization-form-changed, trimmed, truncated, …), ilk farklı kod noktası, kaçışlı değerler, kod noktaları ve birimli ölçüler döner. ' +
      'Fark sınıfı kök neden iddiası değildir; yalnız iki dizginin gözlenen ilişkisidir. Örtük trim/case-fold/NFKC uygulanmaz.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['expected', 'actual'],
      properties: {
        expected: { type: 'string', description: 'Tasarlanan (authored) değer' },
        actual: { type: 'string', description: 'Gözlenen (ör. readback) değer' },
        rule: { type: 'string', enum: Object.keys(PRESERVATION_RULES), default: 'text.exact.v1' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(a) {
      const expected = str(a, 'expected')!;
      const actual = str(a, 'actual')!;
      const rule = (str(a, 'rule', false) ?? 'text.exact.v1') as PreservationRuleId;
      if (!(rule in PRESERVATION_RULES)) throw new RpcError(INVALID_PARAMS, `bilinmeyen kural ${rule}; bilinen: ${KNOWN_RULES.join(', ')}`);
      return {
        rule, passed: PRESERVATION_RULES[rule](expected, actual), rawEqual: expected === actual,
        differenceClass: classifyDifference(expected, actual), firstDifferenceAt: firstDifference(expected, actual),
        expected: textView(expected), actual: textView(actual), text: describeDifference(expected, actual, rule),
      };
    },
  },
  {
    name: 'hdl_list_fixtures',
    title: 'Corpus fixture listesi',
    description: 'Sentetik insan metni corpus\'unu listeler (99 fixture, 11 aile; smoke seti 24). set: smoke | full | demo-a | demo-b | demo-c. ' +
      'family (kimliğin ilk parçası: tr-i, combining, compat, punct, space, length, script, emoji, newline, control, latin) ve property (ör. nfc-sensitive, rtl, technical-control) ile daraltılır. ' +
      'Fixture kabul politikası belirlemez; must-accept/must-reject bağlamasını akış sözleşmesi yapar.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        set: { type: 'string', default: 'smoke' },
        family: { type: 'string' },
        property: { type: 'string' },
        file: { type: 'string', description: 'Corpus dosyası adı (varsayılan human-text)' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(a) {
      const set = str(a, 'set', false) ?? 'smoke';
      const family = str(a, 'family', false);
      const property = str(a, 'property', false);
      const file = str(a, 'file', false) ?? 'human-text';
      if (!isCorpusName(file)) throw new RpcError(INVALID_PARAMS, 'file: yalnız harf, rakam, "-" ve "_" (corpus dosya adı, yol değil)');
      const c = loadCorpus(set, file);
      const fixtures = c.fixtures
        .filter((f) => !family || f.id.split('.')[0] === family)
        .filter((f) => !property || f.properties.includes(property))
        .map((f) => ({ id: f.id, value: f.value, escaped: escaped(f.value), properties: f.properties, applicableControls: f.applicableControls, measures: measures(f.value), notes: f.notes }));
      return { corpus: { id: c.id, version: c.version, digest: c.digest }, set, count: fixtures.length, fixtures };
    },
  },
  {
    name: 'hdl_validate_contract',
    title: 'Akış sözleşmesini doğrula',
    description: 'Bir akış sözleşmesini (FlowContract, schema/contract.schema.json) çekirdeğin preflight denetiminden geçirir; tarayıcı kullanmaz. ' +
      'Geçersizse yol + mesaj listesi döner. Bilinmeyen karşılaştırıcı, sırasız sınır veya eksik kabul beklentisi burada yakalanır.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['contract'], properties: { contract: { type: 'object', description: 'FlowContract nesnesi' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(a) {
      const c = a.contract;
      if (!c || typeof c !== 'object') throw new RpcError(INVALID_PARAMS, 'contract nesne olmalı');
      try { validateContract(c); return { valid: true, issues: [] }; }
      catch (e) { if (e instanceof SchemaError) return { valid: false, issues: e.issues }; throw e; }
    },
  },
  {
    name: 'hdl_read_run',
    title: 'Koşu dizinini oku',
    description: 'Bir koşu dizinini (run-<id>/) okur: bütünlük denetimi (eksik dosya, digest uyuşmazlığı), manifest özeti, bulgular, bütün denemeler ve ' +
      'aşama gözlemleri (authored/injected/submitted/readback, kaçışlı). Yeni karar üretmez; kayıtlı sonucu düzenler. ' +
      'complete=false ise "tüm kontroller geçti" sonucu çıkarılamaz. exitCode anlamı exitMeaning alanındadır.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['runDir'], properties: { runDir: { type: 'string', description: 'run-<id> dizini; sunucu kökünün (--root, varsayılan çalışma dizini) içinde' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(a, ctx) {
      const dir = within(ctx, str(a, 'runDir')!, 'runDir');
      if (!existsSync(dir)) throw new RpcError(INVALID_PARAMS, `koşu dizini yok: ${dir}`);
      return compactRun(readRun(dir));
    },
  },
  {
    name: 'hdl_plan_export',
    title: 'Paylaşım paketini planla',
    description: 'hdl export için kuru çalışma: koşu dizininde hangi dosyaların paylaşım paketine girip (allowlist) hangilerinin dışarıda kalacağını ' +
      '(auth/storageState/trace/cookie, sembolik bağlantı, allowlist dışı) nedenleriyle listeler. Hiçbir dosya yazmaz.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['runDir'], properties: { runDir: { type: 'string', description: 'run-<id> dizini; sunucu kökünün içinde' }, includeEvidence: { type: 'boolean', default: false } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(a, ctx) {
      const dir = within(ctx, str(a, 'runDir')!, 'runDir');
      if (!existsSync(dir)) throw new RpcError(INVALID_PARAMS, `koşu dizini yok: ${dir}`);
      return planShare(dir, { includeEvidence: bool(a, 'includeEvidence') ?? false });
    },
  },
  {
    name: 'hdl_run',
    title: 'Roundtrip koşusu başlat',
    description: 'roundtrip.config.ts ile gerçek Chromium\'da koşu yapar: her fixture için hedef uygulamada kayıt yaratır, bağımsız taze okuma yapar, kuralla karşılaştırır, ' +
      'sahipli kaynakları temizler ve kanıt paketi (run-<id>/) yazar. Hedef uygulamada YAZMA yapar; yalnız yerel/izinli test ortamı. ' +
      'Sunucu --allow-run ile başlatılmadıysa reddedilir. Yapılandırma dosyası import edilir (kod çalışır): yalnız gözden geçirdiğiniz dosyayı verin; configPath ve artifactsDir sunucu kökünün içinde olmalı. ' +
      'Seri çalışır; aynı anda ikinci koşu reddedilir. Sonuç hdl_read_run ile aynı görünümdür.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['configPath'],
      properties: {
        configPath: { type: 'string', description: 'roundtrip.config.ts yolu' },
        corpusSet: { type: 'string', description: 'smoke | full | <set> (varsayılan: yapılandırmadaki)' },
        artifactsDir: { type: 'string', description: 'Koşu dizinlerinin yazılacağı üst dizin (varsayılan: yapılandırmadaki veya runs/)' },
        reproduce: { type: 'boolean', description: 'Bulguları 3 bağımsız denemede doğrula (varsayılan true)' },
        shrink: { type: 'boolean', description: 'Kararlı bulguları küçült (varsayılan true)' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    async run(a, ctx) {
      if (!ctx.allowRun) throw new Error('hdl_run kapalı: sunucu --allow-run olmadan başlatıldı. Araç hedef uygulamada kayıt yaratır ve siler; operatör `hdl mcp --allow-run` ile açıkça izin vermeli.');
      if (ctx.running) throw new Error('başka bir koşu sürüyor; koşular seri yürütülür (veri izolasyonu, §26). Bitmesini bekleyin.');
      // Kilit denetimden hemen sonra, ilk await'ten ÖNCE alınır: iki eşzamanlı çağrı kapıyı birlikte geçemez.
      ctx.running = true;
      try {
        const configPath = within(ctx, str(a, 'configPath')!, 'configPath');
        const config = await loadConfigFile(configPath);
        const artifactsDir = within(ctx, str(a, 'artifactsDir', false) ?? config.artifactsDir ?? 'runs', 'artifactsDir');
        const out = await runRoundtrip({
          config, configPath, corpusSet: str(a, 'corpusSet', false), artifactsDir,
          reproduce: bool(a, 'reproduce'), shrink: bool(a, 'shrink'), log: (l) => ctx.log(l),
        });
        return compactRun(readRun(out.runDir));
      } finally { ctx.running = false; }
    },
  },
];

// ---------- Kaynaklar ----------

interface ResourceDef { uri: string; name: string; title: string; description: string; mimeType: string; read(): string }

function resources(): ResourceDef[] {
  const out: ResourceDef[] = [];
  const schemaDir = join(ROOT, 'schema');
  if (existsSync(schemaDir)) {
    for (const f of readdirSync(schemaDir).filter((n) => n.endsWith('.schema.json')).sort()) {
      const name = f.replace('.schema.json', '');
      out.push({ uri: `hdl://schema/${name}`, name: `${name}.schema.json`, title: `JSON Schema: ${name}`, description: `schema/${f} — sürümlü sözleşme`, mimeType: 'application/schema+json', read: () => readFileSync(join(schemaDir, f), 'utf8') });
    }
  }
  const docs: Array<[string, string, string, string]> = [
    ['AGENTS.md', 'hdl://docs/agents', 'Ajan rehberi', 'Aracı bir ajanın nasıl kullanması gerektiği: komutlar, çıkış kodları, kanıt düzeni, yapılmaması gerekenler'],
    ['docs/contracts.md', 'hdl://docs/contracts', 'Sözleşmeler', 'Fixture, akış sözleşmesi, gözlem sınırları, sonuç modeli, kanıt paketi, replay, küçültme'],
    ['docs/adapter-guide.md', 'hdl://docs/adapter-guide', 'Adapter rehberi', 'Kendi uygulamanız için adapter yazma kuralları'],
  ];
  for (const [file, uri, title, description] of docs) {
    const p = join(ROOT, file);
    if (existsSync(p)) out.push({ uri, name: file, title, description, mimeType: 'text/markdown', read: () => readFileSync(p, 'utf8') });
  }
  return out;
}

// ---------- Sunucu ----------

export interface ServeOptions {
  allowRun?: boolean;
  /** Ajanın verebileceği yolların kökü (koşu dizini, yapılandırma, artifact). Varsayılan: çalışma dizini. */
  root?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  log?: (line: string) => void;
}

const INSTRUCTIONS = [
  'Human Data Lab: bir uygulamanın kabul ettiği insan metninin (Türkçe İ/ı, birleşik aksan, emoji, RTL) kaydet → taze okuma yolculuğunda korunup korunmadığını gerçek tarayıcıda sınar.',
  'Önce hdl_describe_difference ve hdl_list_fixtures ile tarayıcısız çalışın. Bir koşunun sonucunu hdl_read_run ile okuyun; "geçti" yalnız complete=true ve exitCode=0 ise söylenir.',
  'exit 1 = required ihlal; 2 = yapılandırma/yürütme/eksik kanıt (required not-run dahil); 3 = cleanup doğrulanamadı; 130 = iptal. Yürütme hatası veri bozulması değildir.',
  'Fark sınıfı ve "ilk gözlenen sapma" kök neden iddiası değildir. Araç hedef uygulamada yazar: yalnız yerel veya açıkça izinli test ortamı.',
  'Human Data Lab checks whether human text an application accepts survives the save → fresh re-read journey in a real browser. Use the read-only tools first; hdl_run works only when the operator enabled --allow-run.',
].join('\n');

/**
 * stdio üzerinden MCP sunar. Girdi kapanınca çözülür. Çıktıya yalnız protokol mesajları yazılır.
 */
export async function serveStdio(o: ServeOptions = {}): Promise<void> {
  const input = o.input ?? process.stdin;
  const output = o.output ?? process.stdout;
  const root = resolve(o.root ?? process.cwd());
  if (!existsSync(root)) throw new Error(`mcp: kök dizin yok: ${root}`);
  const ctx: ServeContext = { allowRun: !!o.allowRun, log: o.log ?? ((l) => process.stderr.write(l + '\n')), running: false, root };
  const send = (msg: Json) => { output.write(JSON.stringify(msg) + '\n'); };
  const ok = (id: Req['id'], result: unknown) => send({ jsonrpc: '2.0', id: id ?? null, result });
  const fail = (id: Req['id'], e: unknown) => {
    const error = e instanceof RpcError ? { code: e.code, message: e.message, ...(e.data === undefined ? {} : { data: e.data }) } : { code: INTERNAL, message: String((e as Error)?.message ?? e) };
    send({ jsonrpc: '2.0', id: id ?? null, error });
  };

  async function handle(req: Req): Promise<void> {
    const isNotification = req.id === undefined;
    const p = (req.params ?? {}) as Json;
    try {
      switch (req.method) {
        case 'initialize': {
          const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
          const version = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[1];
          return ok(req.id, {
            protocolVersion: version,
            capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
            serverInfo: { name: TOOL.name, title: 'Human Data Lab', version: TOOL.version },
            instructions: INSTRUCTIONS + `\nYol kökü: ${ctx.root} (runDir, configPath ve artifactsDir bunun içinde olmalı).` + (ctx.allowRun ? '\nhdl_run açık (--allow-run).' : '\nhdl_run kapalı: operatör sunucuyu --allow-run ile başlatmadı.'),
          });
        }
        case 'notifications/initialized': case 'notifications/cancelled': case 'notifications/roots/list_changed': return;
        case 'ping': return ok(req.id, {});
        case 'tools/list':
          return ok(req.id, { tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...t.annotations } })) });
        case 'tools/call': {
          const name = typeof p.name === 'string' ? p.name : '';
          const tool = TOOLS.find((t) => t.name === name);
          if (!tool) throw new RpcError(INVALID_PARAMS, `bilinmeyen araç: ${name} (mevcut: ${TOOLS.map((t) => t.name).join(', ')})`);
          const args = (p.arguments ?? {}) as Json;
          if (typeof args !== 'object' || Array.isArray(args)) throw new RpcError(INVALID_PARAMS, 'arguments nesne olmalı');
          try {
            const result = await tool.run(args, ctx);
            return ok(req.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false });
          } catch (e) {
            if (e instanceof RpcError) throw e; // parametre hatası protokol hatasıdır
            // Araç hatası: sonucun içinde döner (ajan görür ve düzeltir); protokol hatası değildir.
            return ok(req.id, { content: [{ type: 'text', text: `hata: ${String((e as Error)?.message ?? e)}` }], isError: true });
          }
        }
        case 'resources/list':
          return ok(req.id, { resources: resources().map(({ read: _read, ...rest }) => rest) });
        case 'resources/read': {
          const uri = typeof p.uri === 'string' ? p.uri : '';
          const r = resources().find((x) => x.uri === uri);
          if (!r) throw new RpcError(RESOURCE_NOT_FOUND, `kaynak yok: ${uri}`);
          return ok(req.id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.read() }] });
        }
        case 'resources/templates/list': return ok(req.id, { resourceTemplates: [] });
        case 'prompts/list': return ok(req.id, { prompts: [] });
        default:
          if (isNotification) return;
          throw new RpcError(METHOD_NOT_FOUND, `yöntem yok: ${req.method}`);
      }
    } catch (e) {
      if (!isNotification) fail(req.id, e);
      else ctx.log(`mcp: bildirim işlenemedi (${req.method}): ${String((e as Error)?.message ?? e)}`);
    }
  }

  const rl = createInterface({ input, crlfDelay: Infinity });
  const pending = new Set<Promise<void>>();
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    let msg: unknown;
    try { msg = JSON.parse(text); } catch { fail(null, new RpcError(PARSE_ERROR, 'JSON ayrıştırılamadı')); continue; }
    const list = Array.isArray(msg) ? msg : [msg];
    for (const m of list) {
      if (!m || typeof m !== 'object' || typeof (m as Req).method !== 'string') { fail((m as Req)?.id ?? null, new RpcError(INVALID_REQUEST, 'geçersiz istek')); continue; }
      // İstekler eşzamanlı işlenir (okuma araçları hızlıdır); hdl_run kendi seri kilidini uygular.
      const done = handle(m as Req).catch((e) => fail((m as Req).id, e));
      pending.add(done);
      void done.finally(() => pending.delete(done));
    }
  }
  await Promise.all(pending);
}
