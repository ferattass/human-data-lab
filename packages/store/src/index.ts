// Koşu dizini ve kanıt dosyaları (§27). Kısmi çalışma korunur; tamamlanma atomik ilan edilir.
//
// run-<id>/
//   manifest.json            yalnız finalize sonrası status=complete
//   contract.json            çalıştırılan policy + flow
//   fixtures.jsonl           kullanılan somut girdiler (küçültme adayları dahil)
//   attempts.jsonl           bütün denemeler
//   allocations.jsonl        sahipli kaynak günlüğü (mutasyondan ÖNCE yazılır)
//   observations/<attempt>.json
//   findings/<finding>.json
//   repro/<finding>.spec.ts
//   evidence/                seçili screenshot
//   report.html
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { SCHEMA_VERSION, checkSchemaVersion, sha256 } from '../../core/src/index.ts';
import type { ExitCode, Finding, RunStatus, RunSummary, TrialResult } from '../../core/src/index.ts';

export class ArtifactError extends Error {
  readonly errorClass = 'artifact';
}

/** Dizin dışına çıkan yolu reddeder (C09). */
export function safeResolve(root: string, rel: string): string {
  // Artifact yolları platformdan bağımsızdır: yalnız '/' ayraç. Ters eğik çizgi, sürücü harfi ve ':' her işletim sisteminde
  // reddedilir; aksi halde Windows'ta üretilmiş bir manifest Linux'ta (veya tersi) dizin denetimini atlatabilir (C09).
  if (typeof rel !== 'string' || !rel || isAbsolute(rel) || /[\0\\:]/.test(rel)) throw new ArtifactError(`geçersiz artifact yolu: ${JSON.stringify(rel)}`);
  const abs = resolve(root, rel);
  const r = relative(resolve(root), abs);
  if (r === '' || r.startsWith('..') || isAbsolute(r) || r.split(sep).includes('..')) throw new ArtifactError(`artifact yolu koşu dizini dışına çıkıyor: ${rel}`);
  return abs;
}

export interface Manifest {
  schemaVersion: string;
  kind: 'roundtrip-run';
  runId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  cancelled: boolean;
  exitCode?: ExitCode;
  syntheticDemo: boolean;
  replayOf?: { runId: string; findingId: string; mismatches: string[] };
  provenance: {
    tool: { name: string; version: string };
    adapter: { id: string; version: string; capabilities: unknown };
    target: { name: string; baseURL: string; build?: string };
    corpus: { id: string; version: string; set: string; digest: string };
    contractDigest: string;
    flowDigest: string;
    browser: { name: string; version: string };
    runtime: Record<string, unknown>;
    budgets: unknown;
    allowedOrigins: string[];
    order: string[];
  };
  summary?: RunSummary;
  problems: string[];
  files: Record<string, string>;
}

export class RunDir {
  readonly root: string;
  constructor(root: string) { this.root = root; }

  /** Her çalışma yeni dizine yazılır; mevcut artifact üzerine yazılmaz (§27). */
  static create(parent: string, runId: string): RunDir {
    if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new ArtifactError(`geçersiz runId: ${runId}`);
    const root = join(resolve(parent), `run-${runId}`);
    if (existsSync(root)) throw new ArtifactError(`koşu dizini zaten var, üzerine yazılmaz: ${root}`);
    mkdirSync(root, { recursive: true });
    for (const d of ['observations', 'findings', 'repro', 'evidence']) mkdirSync(join(root, d));
    return new RunDir(root);
  }

  path(rel: string) { return safeResolve(this.root, rel); }

  appendJsonl(rel: string, obj: unknown) {
    appendFileSync(this.path(rel), JSON.stringify(obj) + '\n', 'utf8');
  }

  /** Geçici dosyaya yaz, sonra rename: yarım dosya bırakmaz. */
  writeJsonAtomic(rel: string, obj: unknown) { this.writeTextAtomic(rel, JSON.stringify(obj, null, 2) + '\n'); }

  writeTextAtomic(rel: string, text: string | Uint8Array) {
    const target = this.path(rel);
    mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, text);
    renameSync(tmp, target);
  }

  /** Manifest'teki dosya digest listesi; manifest kendisi hariç. */
  digestFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        const rel = relative(this.root, abs).split(sep).join('/');
        if (statSync(abs).isDirectory()) walk(abs);
        else if (rel !== 'manifest.json' && !rel.includes('.tmp-')) out[rel] = sha256(readFileSync(abs));
      }
    };
    walk(this.root);
    return out;
  }

  writeManifest(m: Manifest) {
    m.files = this.digestFiles();
    this.writeJsonAtomic('manifest.json', m);
  }
}

export interface LoadedRun {
  root: string;
  manifest: Manifest | null;
  contract: unknown;
  attempts: TrialResult[];
  fixtures: Array<{ fixtureId: string; candidateId: string; value: string; origin: string }>;
  allocations: Array<Record<string, unknown>>;
  findings: Finding[];
  observations: Record<string, unknown>;
  /** Okuma sırasında görülen bütünlük/kapsam sorunları. Sessizce atlanmaz (§27). */
  problems: string[];
  complete: boolean;
}

function readJsonl<T>(file: string, problems: string[], label: string): T[] {
  if (!existsSync(file)) return [];
  const out: T[] = [];
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line)); } catch { problems.push(`${label}:${i + 1} bozuk JSON satırı`); }
  });
  return out;
}

/** Koşu dizinini okur. Eksik/bozuk kanıt, dizin dışı referans ve tamamlanmamış koşu AÇIKÇA raporlanır (C07, C09, C11). */
export function readRun(dir: string): LoadedRun {
  const root = resolve(dir);
  const problems: string[] = [];
  let manifest: Manifest | null = null;
  const mpath = join(root, 'manifest.json');
  if (!existsSync(mpath)) problems.push('manifest.json yok: koşu tamamlanmamış (çökme veya iptal)');
  else {
    try {
      manifest = JSON.parse(readFileSync(mpath, 'utf8'));
      const sv = checkSchemaVersion(manifest!.schemaVersion);
      if (sv.length) throw new ArtifactError(`manifest: ${sv[0].message}`);
    } catch (e) {
      if (e instanceof ArtifactError) throw e;
      problems.push('manifest.json bozuk JSON');
      manifest = null;
    }
  }
  if (manifest) {
    if (manifest.status !== 'complete') problems.push(`manifest status=${manifest.status}`);
    for (const [rel, digest] of Object.entries(manifest.files ?? {})) {
      let abs: string;
      try { abs = safeResolve(root, rel); } catch (e) { problems.push((e as Error).message); continue; }
      if (!existsSync(abs)) problems.push(`eksik kanıt dosyası: ${rel}`);
      else if (sha256(readFileSync(abs)) !== digest) problems.push(`digest uyuşmuyor: ${rel}`);
    }
  }
  let contract: unknown = null;
  try { contract = JSON.parse(readFileSync(join(root, 'contract.json'), 'utf8')); } catch { problems.push('contract.json okunamadı'); }
  const attempts = readJsonl<TrialResult>(join(root, 'attempts.jsonl'), problems, 'attempts.jsonl');
  const fixtures = readJsonl<LoadedRun['fixtures'][number]>(join(root, 'fixtures.jsonl'), problems, 'fixtures.jsonl');
  const allocations = readJsonl<Record<string, unknown>>(join(root, 'allocations.jsonl'), problems, 'allocations.jsonl');
  const findings: Finding[] = [];
  const fdir = join(root, 'findings');
  if (existsSync(fdir)) for (const f of readdirSync(fdir).filter((n) => n.endsWith('.json'))) {
    try { findings.push(JSON.parse(readFileSync(join(fdir, f), 'utf8'))); } catch { problems.push(`findings/${f} bozuk JSON`); }
  }
  const observations: Record<string, unknown> = {};
  for (const a of attempts) {
    const rel = `observations/${a.identity.attemptId}.json`;
    const abs = safeResolve(root, rel);
    if (!existsSync(abs)) { problems.push(`eksik gözlem: ${rel}`); continue; }
    try { observations[a.identity.attemptId] = JSON.parse(readFileSync(abs, 'utf8')); } catch { problems.push(`${rel} bozuk JSON`); }
  }
  return { root, manifest, contract, attempts, fixtures, allocations, findings, observations, problems, complete: !!manifest && manifest.status === 'complete' && problems.length === 0 };
}

/** Paylaşım paketi: yalnız allowlist'teki dosyalar; auth/storageState/trace varsayılan dışarıda (C10, §30). */
export const SHARE_ALLOWLIST = [/^manifest\.json$/, /^contract\.json$/, /^fixtures\.jsonl$/, /^attempts\.jsonl$/, /^observations\/[^/]+\.json$/, /^findings\/[^/]+\.json$/, /^repro\/[^/]+\.spec\.ts$/, /^report\.html$/];
export const SHARE_DENY = [/storage-?state/i, /auth/i, /cookie/i, /\.zip$/i, /trace/i, /secret/i, /\.env/i];

export function planShare(run: RunDir | string, { includeEvidence = false } = {}) {
  const root = typeof run === 'string' ? resolve(run) : run.root;
  const included: string[] = [];
  const excluded: Array<{ file: string; reason: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(root, abs).split(sep).join('/');
      // lstat: sembolik bağlantı/junction izlenmez. Başkasından gelen bir koşu dizinindeki bağlantı
      // (ör. report.html → ~/.ssh/id_rsa) paylaşım paketine hedefin içeriğini taşıyamaz.
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) { excluded.push({ file: rel, reason: 'sembolik bağlantı; izlenmez' }); continue; }
      if (st.isDirectory()) { walk(abs); continue; }
      if (!st.isFile()) { excluded.push({ file: rel, reason: 'normal dosya değil' }); continue; }
      const deny = SHARE_DENY.find((r) => r.test(rel));
      if (deny) { excluded.push({ file: rel, reason: `hassas olabilir (${deny})` }); continue; }
      if (SHARE_ALLOWLIST.some((r) => r.test(rel)) || (includeEvidence && /^evidence\//.test(rel))) included.push(rel);
      else excluded.push({ file: rel, reason: rel.startsWith('evidence/') ? 'kanıt görselleri yalnız --include-evidence ile' : 'allowlist dışında' });
    }
  };
  walk(root);
  return { root, included: included.sort(), excluded };
}

export function writeShare(runDir: string, outDir: string, opts: { includeEvidence?: boolean } = {}) {
  const plan = planShare(runDir, opts);
  if (existsSync(outDir)) throw new ArtifactError(`paylaşım dizini zaten var: ${outDir}`);
  const realRoot = realpathSync(plan.root);
  for (const rel of plan.included) {
    const src = safeResolve(plan.root, rel);
    // Plan ile kopya arasında değişmiş olabilir (TOCTOU): kopyalamadan hemen önce yeniden denetle.
    const st = lstatSync(src);
    const r = relative(realRoot, realpathSync(src));
    if (st.isSymbolicLink() || !st.isFile() || r.startsWith('..') || isAbsolute(r)) throw new ArtifactError(`paylaşım: ${rel} koşu dizini dışına işaret ediyor veya normal dosya değil`);
    const dst = safeResolve(outDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
  writeFileSync(join(outDir, 'CONTENTS.txt'), ['Dahil edilen dosyalar:', ...plan.included.map((f) => '  + ' + f), '', 'Dışarıda bırakılan dosyalar:', ...plan.excluded.map((e) => `  - ${e.file}  (${e.reason})`), ''].join('\n'));
  return plan;
}

/**
 * Özyinelemeli kopya. `fs.cpSync` kullanılmaz: Node 24.14 / Windows'ta yolda ASCII dışı karakter (ör. "Yayında",
 * "C:\Users\Işıl") varsa süreç hiçbir hata basmadan 127 koduyla sonlanıyor. copyFileSync + mkdirSync etkilenmiyor.
 */
export function copyTree(src: string, dst: string): void {
  if (!statSync(src).isDirectory()) { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); return; }
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name), d = join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) copyFileSync(s, d);
  }
}

export const STORE_SCHEMA_VERSION = SCHEMA_VERSION;
