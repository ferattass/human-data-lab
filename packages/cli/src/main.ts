// @human-data-lab/cli — run / replay / report / owned cleanup / export / demo / init (§28).
// CLI ikinci bir oracle yaratmaz; çekirdek sonuçlarını serileştirir.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EXIT_MEANING, SCHEMA_VERSION, digestOf, sameSignature, signatureOf } from '../../core/src/index.ts';
import type { ExitCode, Fixture } from '../../core/src/index.ts';
import { readCorpusFile } from '../../corpus/src/index.ts';
import { compactRun, readRun, writeShare, planShare } from '../../store/src/index.ts';
import { renderReport } from '../../reporter/src/index.ts';
import { loadConfigFile, runRoundtrip, TOOL } from '../../playwright/src/index.ts';
import type { RoundtripConfig } from '../../playwright/src/index.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** Derlenmiş paketten mi (dist/*.js) yoksa depodaki TypeScript kaynağından mı çalışıyoruz? */
const COMPILED = import.meta.url.endsWith('.js');

const HELP = `human-data-lab ${TOOL.version} — kabul edilen insan metninin kaydet → taze okuma yolculuğunda korunduğunu sınar

Kullanım:
  hdl demo [--out runs/demo]                         sentetik demo: doğru mod + üç bilinçli hata (§35)
  hdl init --adapter playwright [--dir hdl]          incelenebilir taslak dosyalar üretir (siteyi keşfetmez)
  hdl run <roundtrip.config.ts> [--corpus smoke|full|<set>] [--out runs] [--no-reproduce] [--no-shrink]
  hdl replay <run-dizini> --finding f1 --config <dosya> [--candidate original|best]
  hdl report <run-dizini> [--out rapor.html] [--json] bütünlüğü denetler, raporu gösterir/üretir (--json: makine okunur özet)
  hdl cleanup <run-dizini> --owned-only --config <dosya>     yalnız allocation günlüğündeki sahipli kaynaklar
  hdl export <run-dizini> --out <dizin> [--include-evidence] [--dry-run] paylaşım paketi (allowlist; auth/trace hariç)
  hdl mcp [--allow-run] [--root <dizin>]             MCP sunucusu (stdio): ajanlar için oracle, corpus ve koşu kanıtı; koşu yalnız --allow-run ile; yollar kökün içinde
  hdl lab <search|identity|collision|roundtrip> …   araştırma araçları (deneysel, v0.1 kapsamı dışında)

Çıkış kodları: ${Object.entries(EXIT_MEANING).map(([k, v]) => `\n  ${k.padStart(3)}  ${v}`).join('')}
Birden çok durum varsa öncelik 130 > 3 > 2 > 1 > 0. "fail yok" ile "tüm gerekli kontroller geçti" aynı değildir.`;

type Args = { _: string[]; flags: Record<string, string | boolean> };
function parse(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) out.flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

async function loadConfig(p: string): Promise<RoundtripConfig> {
  try { return await loadConfigFile(p); }
  catch (e) { throw new UsageError((e as Error).message); }
}

class UsageError extends Error {}

/**
 * Yapılandırma dosyası import edilir, yani KOD ÇALIŞTIRIR. Koşu dizinleri paylaşılabilir (hdl export), bu yüzden
 * artifact içindeki yol asla kendiliğinden import edilmez; kullanıcı --config ile açıkça vermelidir (§13, §30).
 */
function requireConfigFlag(a: Args, storedPath: string | undefined, cmd: string): string {
  const p = a.flags.config;
  if (typeof p === 'string' && p) return p;
  throw new UsageError(`hdl ${cmd} için --config <roundtrip.config.ts> zorunlu.` +
    (storedPath ? `\nKaynak koşu şu dosyayı kaydetmiş (yalnız bilgi; otomatik çalıştırılmaz, önce içeriğine bakın): ${storedPath}` : ''));
}

function abortOnSigint() {
  const ac = new AbortController();
  let n = 0;
  process.on('SIGINT', () => {
    n++;
    if (n === 1) { console.error('\niptal istendi: mevcut deneme durduruluyor, sahipli kaynaklar ayrı bütçeyle temizleniyor… (zorla çıkmak için tekrar Ctrl+C)'); ac.abort(new Error('kullanıcı iptali')); }
    else process.exit(130);
  });
  return ac.signal;
}

// ---------- komutlar ----------

async function cmdRun(a: Args): Promise<ExitCode> {
  const cfgPath = a._[1];
  if (!cfgPath) throw new UsageError('kullanım: hdl run <roundtrip.config.ts>');
  const config = await loadConfig(cfgPath);
  const out = await runRoundtrip({
    config, configPath: cfgPath, corpusSet: a.flags.corpus as string | undefined,
    artifactsDir: (a.flags.out as string) ?? config.artifactsDir, signal: abortOnSigint(),
    reproduce: a.flags['no-reproduce'] ? false : undefined, shrink: a.flags['no-shrink'] ? false : undefined,
    log: (l) => console.log(l),
  });
  return out.exitCode;
}

async function cmdReplay(a: Args): Promise<ExitCode> {
  const dir = a._[1];
  const fid = a.flags.finding as string;
  if (!dir || !fid) throw new UsageError('kullanım: hdl replay <run-dizini> --finding f1');
  const run = readRun(dir);
  const finding = run.findings.find((f) => f.id === fid);
  if (!finding) throw new UsageError(`bulgu yok: ${fid} (mevcut: ${run.findings.map((f) => f.id).join(', ') || '—'})`);
  const stored = run.contract as { contract: RoundtripConfig['contract']; contractDigest: string; configPath?: string; adapter: { id: string; version: string } };
  const cfgPath = requireConfigFlag(a, stored?.configPath, 'replay');
  const config = await loadConfig(cfgPath);
  const mismatches: string[] = [];
  if (digestOf(config.contract) !== stored.contractDigest) mismatches.push('akış sözleşmesi/oracle digest\'i değişmiş (C02)');
  if (config.adapter.id !== stored.adapter.id || config.adapter.version !== stored.adapter.version) mismatches.push(`adapter ${stored.adapter.id}@${stored.adapter.version} → ${config.adapter.id}@${config.adapter.version}`);
  if (run.manifest && config.target.baseURL !== run.manifest.provenance.target.baseURL) mismatches.push(`hedef ${run.manifest.provenance.target.baseURL} → ${config.target.baseURL}`);
  const candidate = (a.flags.candidate as string) ?? 'original';
  const value = candidate === 'best' ? (finding.shrink?.best.value ?? finding.original.value) : finding.original.value;
  const firstAttempt = run.attempts.find((t) => t.identity.attemptId === finding.original.attemptIds[0]);
  const expect = firstAttempt?.expectation ?? 'must-accept';
  let fixture: Fixture | undefined;
  try { fixture = readCorpusFile(config.corpus?.file).fixtures.find((f) => f.id === finding.fixtureId); } catch { /* yok */ }
  fixture ??= { schemaVersion: SCHEMA_VERSION, id: finding.fixtureId, value, properties: ['replay'], applicableControls: [config.contract.field.control], inputMethod: 'fill', defaultExpectation: 'unspecified', provenance: { kind: 'synthetic', license: 'Apache-2.0' } };
  if (fixture.value !== value) console.log(`not: corpus'taki güncel değer saklı değerden farklı; replay SAKLI somut değeri kullanır (C01).`);
  const n = (run.manifest?.provenance.budgets as { reproduceTrials?: number } | undefined)?.reproduceTrials ?? 3;
  if (mismatches.length) console.log(`UYARI — bu koşu orijinal sürümün yeniden üretimi olarak eşlenmeyecek:\n  - ${mismatches.join('\n  - ')}`);
  const out = await runRoundtrip({
    config, configPath: cfgPath, artifactsDir: (a.flags.out as string) ?? dirname(run.root), signal: abortOnSigint(),
    fixtures: Array.from({ length: n }, () => ({ fixture: fixture!, value, expect, origin: 'replay' as const })),
    reproduce: false, shrink: false, replayOf: { runId: run.manifest?.runId ?? '?', findingId: fid, mismatches },
    log: (l) => console.log(l),
  });
  const same = out.trials.filter((t) => sameSignature(finding.signature, signatureOf(t, config.adapter.id, config.contract.field.id))).length;
  console.log(`\nreplay ${fid}: ${same}/${out.trials.length} denemede aynı imza (${finding.signature.ruleId} · ${finding.signature.boundary.join('→')} · ${finding.signature.differenceClass}).`);
  console.log(mismatches.length ? 'Bu sonuç bir regresyon koşusudur; "orijinal sürüm yeniden üretildi" anlamına gelmez.' : same === out.trials.length ? 'Aynı hedefte kararlı biçimde yeniden üretildi.' : same === 0 ? 'Bu hedefte yeniden üretilemedi (düzeltilmiş olabilir veya ortam farklı).' : 'Kararsız: bazı denemeler aynı imzayı vermedi.');
  return out.exitCode;
}

function cmdReport(a: Args): ExitCode {
  const dir = a._[1];
  if (!dir) throw new UsageError('kullanım: hdl report <run-dizini>');
  const run = readRun(dir);
  const m = run.manifest;
  if (a.flags.json) {
    // Makine okunur özet (ajanlar ve CI için): manifest + bulgular + denemeler, aynı sonuç modeliyle; ikinci oracle yok.
    console.log(JSON.stringify(compactRun(run), null, 2));
    return run.complete ? ((m?.exitCode ?? 2) as ExitCode) : 2;
  }
  console.log(`koşu ${m?.runId ?? '?'} · durum ${m?.status ?? 'manifest yok'} · exit ${m?.exitCode ?? '?'}${m?.syntheticDemo ? ' · SENTETİK DEMO' : ''}`);
  if (m?.summary) console.log(`seçilen ${m.summary.selected} · uygun ${m.summary.applicable} · yürütülen ${m.summary.executed} · korunma kontrolü çalışan ${m.summary.preservationChecked} · required ihlal ${m.summary.requiredFailed} · çalışmayan required ${m.summary.requiredNotRun} · bulgu ${m.summary.findings}`);
  if (run.problems.length) console.log(`sorunlar:\n  - ${run.problems.join('\n  - ')}`);
  const target = a.flags.out ? resolve(a.flags.out as string) : join(run.root, 'report.html');
  if (a.flags.out || !existsSync(target)) {
    // Tamamlanmamış/çökmüş koşu için rapor üretilebilir; tamamlanmış koşunun digestli raporu üzerine yazılmaz.
    writeFileSync(target, renderReport(run), 'utf8');
    console.log(`rapor yazıldı: ${relative(process.cwd(), target)}`);
  } else console.log(`rapor: ${relative(process.cwd(), target)}`);
  return run.complete ? ((m?.exitCode ?? 2) as ExitCode) : 2;
}

async function cmdCleanup(a: Args): Promise<ExitCode> {
  const dir = a._[1];
  if (!dir || !a.flags['owned-only']) throw new UsageError('kullanım: hdl cleanup <run-dizini> --owned-only --config <dosya>  (yalnız sahipli kaynaklar; --owned-only zorunlu)');
  const run = readRun(dir);
  const stored = run.contract as { configPath?: string } | null;
  const cfgPath = requireConfigFlag(a, stored?.configPath, 'cleanup');
  const config = await loadConfig(cfgPath);
  const expectedBase = run.manifest?.provenance.target.baseURL;
  if (expectedBase && expectedBase !== config.target.baseURL) throw new UsageError(`yanlış test ortamı: koşu ${expectedBase} üzerinde, yapılandırma ${config.target.baseURL} — temizlik yapılmadı`);
  // Namespace başına son durum: reserve var, doğrulanmış cleanup yok → kurtarma adayı.
  const state = new Map<string, { resources: Set<string>; last?: string; attemptId: string }>();
  for (const e of run.allocations) {
    const ns = String(e.namespace);
    const s = state.get(ns) ?? { resources: new Set<string>(), attemptId: String(e.attemptId) };
    if (e.event === 'resource') s.resources.add(String(e.resourceId));
    if (e.event === 'cleanup' || e.event === 'recovery-cleanup') s.last = String(e.status);
    state.set(ns, s);
  }
  const todo = [...state].filter(([, s]) => s.last !== 'verified' && s.last !== 'not-needed');
  console.log(`${state.size} sahipli namespace, ${todo.length} tanesi doğrulanmış temizlik bekliyor.`);
  if (!todo.length) return 0;
  const { request } = await import('@playwright/test');
  const recovery: unknown[] = [];
  let bad = 0;
  for (const [ns, s] of todo) {
    const api = await request.newContext({ baseURL: config.target.baseURL, maxRedirects: 0 });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), config.budgets?.cleanupTimeoutMs ?? 10_000);
    let status = 'failed'; let detail = '';
    try {
      const r = await config.adapter.cleanup({ identity: { runId: run.manifest?.runId ?? '?', caseId: '-', candidateId: '-', attemptId: s.attemptId, fixtureKey: '-' }, baseURL: config.target.baseURL, signal: ac.signal, request: async () => api }, { namespace: ns, resourceIds: [...s.resources], allocationLogRef: 'allocations.jsonl' });
      status = r.status; detail = r.detail ?? '';
    } catch (e) { detail = String((e as Error).message).split('\n')[0]; }
    finally { clearTimeout(timer); await api.dispose(); }
    if (status !== 'verified' && status !== 'not-needed') bad++;
    recovery.push({ at: new Date().toISOString(), namespace: ns, status, detail });
    console.log(`  ${ns}: ${status}${detail ? ' — ' + detail : ''}`);
  }
  // Özgün kanıt değiştirilmez; kurtarma sonucu ayrı dosyaya yazılır.
  const rdir = join(run.root, 'recovery');
  mkdirSync(rdir, { recursive: true });
  writeFileSync(join(rdir, `cleanup-${Date.now()}.json`), JSON.stringify({ schemaVersion: SCHEMA_VERSION, results: recovery }, null, 2));
  return bad ? 3 : 0;
}

function cmdExport(a: Args): ExitCode {
  const dir = a._[1];
  const out = a.flags.out as string;
  if (!dir || !out) throw new UsageError('kullanım: hdl export <run-dizini> --out <dizin> [--include-evidence]');
  const plan = a.flags['dry-run'] ? planShare(dir, { includeEvidence: !!a.flags['include-evidence'] }) : writeShare(dir, resolve(out), { includeEvidence: !!a.flags['include-evidence'] });
  console.log(`dahil (${plan.included.length}):\n${plan.included.map((f) => '  + ' + f).join('\n')}\ndışarıda (${plan.excluded.length}):\n${plan.excluded.map((e) => `  - ${e.file} (${e.reason})`).join('\n')}`);
  console.log('Paylaşmadan önce içeriği gözden geçirin: sentetik değerler de endpoint adı veya ekran içeriği taşıyabilir.');
  return 0;
}

function cmdInit(a: Args): ExitCode {
  if (a.flags.adapter !== 'playwright') throw new UsageError('kullanım: hdl init --adapter playwright [--dir hdl]');
  const dir = resolve((a.flags.dir as string) ?? 'hdl');
  const files: Record<string, string> = {
    'adapter.ts': readFileSync(join(ROOT, 'packages/cli/templates/adapter.ts.txt'), 'utf8'),
    'roundtrip.config.ts': readFileSync(join(ROOT, 'packages/cli/templates/roundtrip.config.ts.txt'), 'utf8'),
  };
  // Kurulu pakette (derlenmiş .js) paket adıyla, depoda kaynak yoluyla import edilir.
  const rel = relative(dir, ROOT).split('\\').join('/') || '.';
  const vars: Record<string, string> = COMPILED
    ? { PW: 'human-data-lab/playwright', DOCS: 'https://github.com/ferattass/human-data-lab/blob/main/docs', EXAMPLES: 'https://github.com/ferattass/human-data-lab/blob/main/examples' }
    : { PW: `${rel}/packages/playwright/src/index.ts`, DOCS: `${rel}/docs`, EXAMPLES: `${rel}/examples` };
  for (const name of Object.keys(files)) if (existsSync(join(dir, name))) throw new UsageError(`${join(dir, name)} zaten var; üzerine yazılmaz`);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`));
  console.log(`Taslak dosyalar yazıldı (incelenmeden çalıştırmayın):\n  ${join(dir, 'adapter.ts')}\n  ${join(dir, 'roundtrip.config.ts')}\nHedef site keşfedilmedi; seçicileri, test fixture API'sini ve temizlik yolunu siz bağlarsınız.\nSonra: hdl run ${relative(process.cwd(), join(dir, 'roundtrip.config.ts'))} --corpus smoke`);
  return 0;
}

async function cmdMcp(a: Args): Promise<ExitCode> {
  // stdout protokole aittir; günlük stderr'e gider. Koşu başlatma yalnız operatör açıkça izin verdiyse (§30).
  const { serveStdio } = await import('../../mcp/src/index.ts');
  await serveStdio({ allowRun: !!a.flags['allow-run'], root: typeof a.flags.root === 'string' ? a.flags.root : undefined, log: (l) => console.error(l) });
  return 0;
}

async function cmdDemo(a: Args): Promise<ExitCode> {
  const { runDemo } = await import('./demo.ts');
  return runDemo({ out: (a.flags.out as string) ?? 'runs/demo' });
}

function cmdLab(a: Args): ExitCode {
  if (!existsSync(join(ROOT, 'research/hdl-research.mjs'))) throw new UsageError('hdl lab araştırma araçları pakete dahil değildir; depodan çalıştırın: https://github.com/ferattass/human-data-lab/tree/main/research');
  const r = spawnSync(process.execPath, [join(ROOT, 'research/hdl-research.mjs'), ...a._.slice(1), ...Object.entries(a.flags).flatMap(([k, v]) => (v === true ? [`--${k}`] : [`--${k}`, String(v)]))], { stdio: 'inherit' });
  return (r.status ?? 2) as ExitCode;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const a = parse(argv);
  const cmd = a._[0] ?? (a.flags.version ? 'version' : a.flags.help ? 'help' : undefined);
  try {
    switch (cmd) {
      case 'run': return await cmdRun(a);
      case 'replay': return await cmdReplay(a);
      case 'report': return cmdReport(a);
      case 'cleanup': return await cmdCleanup(a);
      case 'export': return cmdExport(a);
      case 'init': return cmdInit(a);
      case 'demo': return await cmdDemo(a);
      case 'mcp': return await cmdMcp(a);
      case 'lab': return cmdLab(a);
      case undefined: case 'help': case '-h': case '--help': console.log(HELP); return 0;
      case '--version': case 'version': console.log(TOOL.version); return 0;
      default: console.error(`bilinmeyen komut: ${cmd}\n\n${HELP}`); return 2;
    }
  } catch (e) {
    console.error(e instanceof UsageError ? e.message : `hata: ${(e as Error).message}`);
    return 2;
  }
}
