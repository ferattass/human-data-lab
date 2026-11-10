// Şema doğrulama. Hata varsa preflight durur ve tarayıcı mutasyonu başlamaz (§22, A14).
// Bağımlılıksız el yazımı doğrulayıcı; JSON Schema belgeleri /schema altında aynı kuralları anlatır.
import { isKnownRule, isPreservationRule } from './comparators.ts';
import { SCHEMA_VERSION } from './types.ts';
import type { Corpus, Fixture, FlowContract } from './types.ts';

export interface ValidationIssue { path: string; message: string }

export class SchemaError extends Error {
  readonly issues: ValidationIssue[];
  readonly errorClass = 'configuration';
  constructor(what: string, issues: ValidationIssue[]) {
    super(`${what} geçersiz:\n` + issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n'));
    this.issues = issues;
  }
}

const SUPPORTED_MAJOR = SCHEMA_VERSION.split('.')[0];

/** Bilinmeyen büyük sürüm sessizce okunmaz (§27). */
export function checkSchemaVersion(v: unknown, path = 'schemaVersion'): ValidationIssue[] {
  if (typeof v !== 'string' || !/^\d+\.\d+$/.test(v)) return [{ path, message: `"major.minor" biçiminde olmalı, görülen: ${JSON.stringify(v)}` }];
  if (v.split('.')[0] !== SUPPORTED_MAJOR) return [{ path, message: `desteklenmeyen büyük şema sürümü ${v} (desteklenen: ${SUPPORTED_MAJOR}.x)` }];
  return [];
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const CONTROLS = ['input-text', 'textarea'];
const EXPECTS = ['must-accept', 'must-reject', 'unspecified'];
const BOUNDARIES = ['authored', 'injected', 'submitted', 'readback'];

/** İyi biçimlenmiş Unicode skaler değerleri (§14: lone surrogate ayrı dayanıklılık sınıfı). */
const isWellFormed = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

export function validateFixture(f: unknown, path = 'fixture'): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!f || typeof f !== 'object') return [{ path, message: 'nesne olmalı' }];
  const x = f as Record<string, unknown>;
  out.push(...checkSchemaVersion(x.schemaVersion, `${path}.schemaVersion`));
  if (!isStr(x.id) || !/^[a-z0-9][a-z0-9.-]*\.\d{3}$/.test(x.id)) out.push({ path: `${path}.id`, message: 'aile.ad.NNN biçiminde olmalı' });
  if (!isStr(x.value)) out.push({ path: `${path}.value`, message: 'dizgi olmalı' });
  else if (!isWellFormed(x.value)) out.push({ path: `${path}.value`, message: 'eşleşmemiş surrogate içeriyor (temel corpus dışı)' });
  if (!isStrArr(x.properties) || !x.properties.length) out.push({ path: `${path}.properties`, message: 'en az bir özellik' });
  if (!isStrArr(x.applicableControls) || !x.applicableControls.length || !x.applicableControls.every((c) => CONTROLS.includes(c)))
    out.push({ path: `${path}.applicableControls`, message: `şunlardan: ${CONTROLS.join(', ')}` });
  if (x.inputMethod !== 'fill') out.push({ path: `${path}.inputMethod`, message: 'v0.1 yalnız "fill"' });
  if (!EXPECTS.includes(x.defaultExpectation as string)) out.push({ path: `${path}.defaultExpectation`, message: `şunlardan: ${EXPECTS.join(', ')}` });
  const p = x.provenance as Record<string, unknown> | undefined;
  if (!p || !['synthetic', 'third-party'].includes(p.kind as string) || !isStr(p.license) || !p.license)
    out.push({ path: `${path}.provenance`, message: 'kind (synthetic|third-party) ve license zorunlu' });
  else if (p.kind === 'third-party' && !isStr(p.source)) out.push({ path: `${path}.provenance.source`, message: 'üçüncü taraf içerikte kaynak zorunlu' });
  return out;
}

export function validateCorpus(c: unknown): asserts c is Corpus {
  const issues: ValidationIssue[] = [];
  if (!c || typeof c !== 'object') throw new SchemaError('corpus', [{ path: '', message: 'nesne olmalı' }]);
  const x = c as Record<string, unknown>;
  issues.push(...checkSchemaVersion(x.schemaVersion));
  if (!isStr(x.id)) issues.push({ path: 'id', message: 'zorunlu' });
  if (!isStr(x.version) || !/^\d+\.\d+\.\d+$/.test(x.version)) issues.push({ path: 'version', message: 'semver zorunlu' });
  if (!Array.isArray(x.fixtures) || !x.fixtures.length) issues.push({ path: 'fixtures', message: 'boş olamaz' });
  else {
    const seen = new Set<string>();
    x.fixtures.forEach((f, i) => {
      issues.push(...validateFixture(f, `fixtures[${i}]`));
      const id = (f as Fixture)?.id;
      if (seen.has(id)) issues.push({ path: `fixtures[${i}].id`, message: `yinelenen kimlik ${id}` });
      seen.add(id);
    });
  }
  if (issues.length) throw new SchemaError('corpus', issues);
}

export function validateContract(c: unknown): asserts c is FlowContract {
  const issues: ValidationIssue[] = [];
  if (!c || typeof c !== 'object') throw new SchemaError('akış sözleşmesi', [{ path: '', message: 'nesne olmalı' }]);
  const x = c as Record<string, unknown>;
  issues.push(...checkSchemaVersion(x.schemaVersion));
  if (!isStr(x.id) || !x.id) issues.push({ path: 'id', message: 'zorunlu' });
  const field = x.field as Record<string, unknown> | undefined;
  if (!field || !isStr(field.id) || !CONTROLS.includes(field.control as string)) issues.push({ path: 'field', message: 'id ve control (input-text|textarea) zorunlu' });
  if (x.inputMethod !== 'fill') issues.push({ path: 'inputMethod', message: 'v0.1 yalnız "fill"' });
  if (!Array.isArray(x.expectations) || !x.expectations.length) issues.push({ path: 'expectations', message: 'en az bir kabul beklentisi bağlanmalı (ürün tahmin etmez)' });
  else x.expectations.forEach((raw: unknown, i: number) => {
    if (!raw || typeof raw !== 'object') { issues.push({ path: `expectations[${i}]`, message: 'nesne olmalı' }); return; }
    const e = raw as Record<string, unknown>;
    if (!(e.properties === '*' || isStrArr(e.properties))) issues.push({ path: `expectations[${i}].properties`, message: '"*" veya özellik listesi' });
    if (!['must-accept', 'must-reject'].includes(e.expect as string)) issues.push({ path: `expectations[${i}].expect`, message: 'must-accept | must-reject' });
  });
  if (x.fixtureExpectations !== undefined) {
    if (!x.fixtureExpectations || typeof x.fixtureExpectations !== 'object' || Array.isArray(x.fixtureExpectations)) issues.push({ path: 'fixtureExpectations', message: 'nesne olmalı' });
    else for (const [k, v] of Object.entries(x.fixtureExpectations as object))
      if (!['must-accept', 'must-reject'].includes(v)) issues.push({ path: `fixtureExpectations.${k}`, message: 'must-accept | must-reject' });
  }
  if (!Array.isArray(x.preservation) || !x.preservation.length) issues.push({ path: 'preservation', message: 'en az bir korunma kontrolü' });
  else {
    const ids = new Set<string>();
    x.preservation.forEach((raw: unknown, i: number) => {
      if (!raw || typeof raw !== 'object') { issues.push({ path: `preservation[${i}]`, message: 'nesne olmalı' }); return; }
      const p = raw as Record<string, unknown>;
      if (!isStr(p.id) || ids.has(p.id)) issues.push({ path: `preservation[${i}].id`, message: 'benzersiz kimlik zorunlu' });
      ids.add(p.id as string);
      if (!isStr(p.rule) || !isKnownRule(p.rule) || !isPreservationRule(p.rule)) issues.push({ path: `preservation[${i}].rule`, message: `bilinmeyen karşılaştırıcı ${JSON.stringify(p.rule)}` });
      if (typeof p.required !== 'boolean') issues.push({ path: `preservation[${i}].required`, message: 'boolean zorunlu' });
      const b = p.boundary as unknown[];
      if (!Array.isArray(b) || b.length !== 2 || !b.every((v) => BOUNDARIES.includes(v as string)) || BOUNDARIES.indexOf(b[0] as string) >= BOUNDARIES.indexOf(b[1] as string))
        issues.push({ path: `preservation[${i}].boundary`, message: 'iki farklı gözlem, sıralı: authored < injected < submitted < readback' });
    });
  }
  const rb = x.readback as Record<string, unknown> | undefined;
  if (!rb || !['first-independent-read', 'stable-read', 'readiness-signal'].includes(rb.kind as string)) issues.push({ path: 'readback', message: 'first-independent-read | stable-read | readiness-signal' });
  else if (rb.kind === 'stable-read' && !(typeof rb.consecutive === 'number' && rb.consecutive >= 2 && typeof rb.budgetMs === 'number' && rb.budgetMs > 0 && typeof rb.intervalMs === 'number' && rb.intervalMs >= 0))
    issues.push({ path: 'readback', message: 'stable-read: consecutive ≥ 2, intervalMs, budgetMs zorunlu' });
  if (issues.length) throw new SchemaError('akış sözleşmesi', issues);
}
