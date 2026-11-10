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
import { appendFileSync, closeSync, constants as fsConstants, copyFileSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { EXIT_MEANING, SCHEMA_VERSION, checkSchemaVersion, escaped, firstObservedDivergence, sha256 } from '../../core/src/index.ts';
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
    mkdirSync(resolve(parent), { recursive: true });
    // Atomik: var olan dizin EEXIST verir (existsSync + mkdir yarışı yok); üzerine yazılmaz.
    try { mkdirSync(root); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new ArtifactError(`koşu dizini zaten var, üzerine yazılmaz: ${root}`); throw e; }
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
    // Manifest'te listelenmeyen artifact: tamamlanmış koşuya sonradan eklenmiş dosya (ör. findings/f9.json) kanıt sayılmaz.
    // recovery/ hariç: hdl cleanup finalize'dan sonra yazar ve ayrı dosyadır.
    if (manifest.status === 'complete') {
      const listed = new Set(Object.keys(manifest.files ?? {}));
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const abs = join(dir, name);
          const rel = relative(root, abs).split(sep).join('/');
          if (statSync(abs).isDirectory()) { if (rel !== 'recovery') walk(abs); }
          else if (rel !== 'manifest.json' && !rel.includes('.tmp-') && !listed.has(rel)) problems.push(`manifest'te listelenmeyen dosya: ${rel}`);
        }
      };
      walk(root);
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
  for (const [i, a] of attempts.entries()) {
    // Geçerli JSON ama bozuk kayıt (identity yok, attemptId'de ayraç) çökme değil sorun üretir.
    const id = (a as { identity?: { attemptId?: unknown } } | null)?.identity?.attemptId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(id)) { problems.push(`attempts.jsonl:${i + 1} geçersiz veya eksik attemptId`); continue; }
    const rel = `observations/${id}.json`;
    const abs = safeResolve(root, rel);
    if (!existsSync(abs)) { problems.push(`eksik gözlem: ${rel}`); continue; }
    try { observations[id] = JSON.parse(readFileSync(abs, 'utf8')); } catch { problems.push(`${rel} bozuk JSON`); }
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
  mkdirSync(outDir, { recursive: true }); // dahil edilen dosya olmasa da CONTENTS.txt yazılır
  for (const rel of plan.included) {
    const src = safeResolve(plan.root, rel);
    // Plan ile kopya arasında değişmiş olabilir (TOCTOU): yeniden denetle, dosyayı BİR KEZ aç, açılan tanımlayıcının
    // kimliğini lstat ile karşılaştır ve kopyayı yoldan değil tanımlayıcıdan yap. POSIX'te O_NOFOLLOW bağlantıyı açmaz;
    // Windows'ta bayrak yok, ama arada bağlantıya çevrilen dosyanın hedefi farklı dev/ino verir ve reddedilir.
    const st = lstatSync(src, { bigint: true });
    const r = relative(realRoot, realpathSync(src));
    if (st.isSymbolicLink() || !st.isFile() || r.startsWith('..') || isAbsolute(r)) throw new ArtifactError(`paylaşım: ${rel} koşu dizini dışına işaret ediyor veya normal dosya değil`);
    const fd = openSync(src, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    let data: Buffer;
    try {
      const fst = fstatSync(fd, { bigint: true });
      if (!fst.isFile() || fst.dev !== st.dev || fst.ino !== st.ino) throw new ArtifactError(`paylaşım: ${rel} denetimden sonra değişti; kopyalanmadı`);
      data = readFileSync(fd);
    } finally { closeSync(fd); }
    const dst = safeResolve(outDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, data, { flag: 'wx' }); // hedefte önceden var olan dosya/bağlantının üzerine yazılmaz
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

// ---------- Makine okunur koşu görünümü (hdl report --json, MCP) ----------

export interface RunView {
  schemaVersion: string;
  runDir: string;
  runId: string | null;
  status: RunStatus | 'unknown';
  complete: boolean;
  exitCode: ExitCode | null;
  exitMeaning: string | null;
  cancelled: boolean;
  syntheticDemo: boolean;
  replayOf: Manifest['replayOf'] | null;
  problems: string[];
  target: Manifest['provenance']['target'] | null;
  adapter: { id: string; version: string } | null;
  corpus: Manifest['provenance']['corpus'] | null;
  summary: RunSummary | null;
  findings: Array<{
    id: string; fixtureId: string; rule: string; boundary: string; differenceClass: string; applicationOutcome: string;
    reproducibility: string; attemptsReproduced: number; attemptsObserved: number;
    original: { value: string; escaped: string }; smallest: { value: string; escaped: string; status: string; note: string } | null;
    attemptIds: string[]; reproSpec: string;
  }>;
  attempts: Array<{
    attemptId: string; candidateId: string; fixtureId: string; expectation: string; execution: string; applicationOutcome: string; cleanup: string;
    recordId: string | null;
    assertions: Array<{ id: string; rule: string; required: boolean; status: string; difference?: string; firstDifferenceAt?: number; rawEqual?: boolean; reason?: string }>;
    observations: Partial<Record<string, { status: string; value?: string; escaped?: string; source?: string; note?: string }>>;
    firstObservedDivergence: { at: string | null; from: string | null; unobserved: string[] };
    errors: TrialResult['errors'];
  }>;
  reportPath: string;
}

/**
 * Koşu dizininin yoğunlaştırılmış, makine okunur görünümü. Yalnız kayıtlı kanıtı yeniden düzenler; yeni karar üretmez
 * (CLI ve MCP ikinci bir oracle yaratmaz, §28). Görünmez karakterler için her değerin kaçışlı biçimi de verilir.
 */
export function compactRun(run: LoadedRun): RunView {
  const m = run.manifest;
  const code = m?.exitCode;
  return {
    schemaVersion: SCHEMA_VERSION,
    runDir: run.root,
    runId: m?.runId ?? null,
    status: m?.status ?? 'unknown',
    complete: run.complete,
    exitCode: code ?? null,
    exitMeaning: code === undefined ? null : EXIT_MEANING[code],
    cancelled: !!m?.cancelled,
    syntheticDemo: !!m?.syntheticDemo,
    replayOf: m?.replayOf ?? null,
    problems: run.problems,
    target: m?.provenance?.target ?? null,
    adapter: m?.provenance?.adapter ? { id: m.provenance.adapter.id, version: m.provenance.adapter.version } : null,
    corpus: m?.provenance?.corpus ?? null,
    summary: m?.summary ?? null,
    findings: [...run.findings].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).map((f) => ({
      id: f.id, fixtureId: f.fixtureId, rule: f.signature.ruleId, boundary: f.signature.boundary.join('→'),
      differenceClass: f.signature.differenceClass, applicationOutcome: f.signature.applicationOutcome,
      reproducibility: f.reproducibility, attemptsReproduced: f.attemptsReproduced, attemptsObserved: f.attemptsObserved,
      original: { value: f.original.value, escaped: escaped(f.original.value) },
      smallest: f.shrink ? { value: f.shrink.best.value, escaped: escaped(f.shrink.best.value), status: f.shrink.status, note: f.shrink.note } : null,
      attemptIds: f.original.attemptIds, reproSpec: `repro/${f.id}.spec.ts`,
    })),
    attempts: run.attempts.filter((t) => t && typeof t === 'object' && t.identity && Array.isArray(t.assertions)).map((t) => ({
      attemptId: t.identity.attemptId, candidateId: t.identity.candidateId, fixtureId: t.fixtureId, expectation: t.expectation,
      execution: t.execution, applicationOutcome: t.applicationOutcome, cleanup: t.cleanup,
      recordId: t.acceptanceEvidence?.recordId ?? null,
      assertions: t.assertions.map((a) => ({ id: a.id, rule: a.rule, required: a.required, status: a.status, difference: a.difference, firstDifferenceAt: a.firstDifferenceAt, rawEqual: a.rawEqual, reason: a.reason })),
      observations: Object.fromEntries(Object.entries(t.observations).map(([b, o]) => [b, o ? { status: o.status, value: o.value, escaped: typeof o.value === 'string' ? escaped(o.value) : undefined, source: o.source, note: o.note } : undefined])),
      firstObservedDivergence: firstObservedDivergence(t.observations),
      errors: t.errors,
    })),
    reportPath: join(run.root, 'report.html'),
  };
}

