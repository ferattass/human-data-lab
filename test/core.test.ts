// Kabul matrisi A (oracle) + C14 — saf çekirdek, tarayıcı yok (§32, §34).
// Test adları rapordaki senaryo kimlikleriyle başlar; test/matrix.test.ts 42 kimliğin hepsinin kapsandığını denetler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTrial, exitCode, summarize, validateContract, validateFixture, checkSchemaVersion, truncateForDisplay,
  classifyDifference, describeDifference, measures, reductions, classifyReproducibility, signatureOf, SchemaError,
} from '../packages/core/src/index.ts';
import type { FlowContract, Observations, TrialResult, ApplicationOutcome, Execution } from '../packages/core/src/index.ts';
import { displayNameContract } from '../examples/profile-demo/contract.ts';

const C = displayNameContract();
const NFC_C = displayNameContract({ rule: 'text.nfc.v1' });
const obs = (authored: string, readback?: string, extra: Partial<Observations> = {}): Observations => ({
  authored: { boundary: 'authored', status: 'observed', value: authored },
  injected: { boundary: 'injected', status: 'observed', value: authored },
  submitted: { boundary: 'submitted', status: 'observed', value: authored },
  ...(readback !== undefined ? { readback: { boundary: 'readback', status: 'observed', value: readback } } : {}),
  ...extra,
});
const ev = (o: { contract?: FlowContract; expectation?: 'must-accept' | 'must-reject'; outcome?: ApplicationOutcome; execution?: Execution; observations: Observations }) =>
  evaluateTrial({ contract: o.contract ?? C, expectation: o.expectation ?? 'must-accept', execution: o.execution ?? 'completed', applicationOutcome: o.outcome ?? 'accepted', observations: o.observations, attemptId: 'attempt-001' });
const required = (a: ReturnType<typeof ev>) => a.find((x) => x.id === 'display-name-preserved')!;
const acceptance = (a: ReturnType<typeof ev>) => a.find((x) => x.id === 'acceptance')!;

const trial = (assertions: ReturnType<typeof ev>, over: Partial<TrialResult> = {}): TrialResult => ({
  schemaVersion: '0.1', identity: { runId: 'r', caseId: 'c', candidateId: 'original', attemptId: 'a1', fixtureKey: 'f' }, fixtureId: 'f',
  expectation: 'must-accept', execution: 'completed', applicationOutcome: 'accepted', observations: {}, assertions, cleanup: 'verified', errors: [], events: [], timings: {}, ...over,
});

test('A01 basit Latin metni exact geri gelir → preservation passed', () => {
  const a = ev({ observations: obs('Ayse Kaya', 'Ayse Kaya') });
  assert.equal(required(a).status, 'passed');
  assert.equal(acceptance(a).status, 'passed');
});

test('A02 İpek yerine pek okunur → seçili exact sınırında failed', () => {
  const a = ev({ observations: obs('İpek', 'pek') });
  const r = required(a);
  assert.equal(r.status, 'failed');
  assert.deepEqual(r.boundary, ['authored', 'readback']);
  assert.equal(r.firstDifferenceAt, 0);
});

test('A03 é / e+U+0301 değişimi, exact → ham fark failed', () => {
  const r = required(ev({ observations: obs('José', 'José') }));
  assert.equal(r.status, 'failed');
  assert.equal(r.rawEqual, false);
  assert.equal(r.difference, 'normalization-form-changed');
});

test('A04 aynı çift, açık NFC policy → NFC passed; ham fark saklı', () => {
  const a = ev({ contract: NFC_C, observations: obs('José', 'José') });
  const r = required(a);
  assert.equal(r.rule, 'text.nfc.v1');
  assert.equal(r.status, 'passed');
  assert.equal(r.rawEqual, false, 'NFC geçse de ham fark kaydedilir');
  const exact = a.find((x) => x.id === 'display-name-exact')!;
  assert.equal(exact.status, 'failed');
  assert.equal(exact.required, false, 'tanısal exact CI sonucunu etkilemez');
  assert.equal(exitCode({ cancelled: false, summary: summarize({ selected: 1, outOfScope: [], trials: [trial(a)], findings: 0 }), runLevelProblems: [] }), 0);
});

test('A05 NFKC ile eşit ama NFC ile farklı metin → NFC failed; gizli NFKC uygulanmaz', () => {
  // U+FB01 "ﬁ" ligatürü: NFKC → "fi", NFC → değişmez.
  const r = required(ev({ contract: NFC_C, observations: obs('ﬁle', 'file') }));
  assert.equal('ﬁle'.normalize('NFKC'), 'file');
  assert.equal(r.status, 'failed');
  assert.equal(r.difference, 'compatibility-folded');
});

test('A06 baş/son ASCII boşluk sessiz temizlenir → exact failed', () => {
  const r = required(ev({ observations: obs(' Ayse Kaya ', 'Ayse Kaya') }));
  assert.equal(r.status, 'failed');
  assert.equal(r.difference, 'trimmed');
});

test('A07 NBSP normal boşluğa çevrilir → exact failed; "trim" altında gizlenmez', () => {
  const r = required(ev({ observations: obs('Ayse Kaya', 'Ayse Kaya') }));
  assert.equal(r.status, 'failed');
  assert.equal(r.difference, 'nbsp-replaced');
  assert.notEqual(r.difference, 'trimmed');
});

test('A08 must-accept örnek validation ile reddedilir → acceptance failed; preservation not-run', () => {
  const a = ev({ outcome: 'rejected', observations: obs('İpek') });
  assert.equal(acceptance(a).status, 'failed');
  assert.equal(required(a).status, 'not-run');
  assert.match(required(a).reason!, /reddedildi/);
});

test('A09 must-reject örnek doğru reddedilir → yalnız rejection assertion passed', () => {
  const a = ev({ expectation: 'must-reject', outcome: 'rejected', observations: obs('Ayse\u0000Kaya') });
  assert.equal(acceptance(a).rule, 'acceptance.must-reject.v1');
  assert.equal(acceptance(a).status, 'passed');
  for (const p of a.filter((x) => x.id !== 'acceptance')) {
    assert.equal(p.status, 'not-run', 'beklenen red korunma başarısı sayılmaz');
    assert.equal(p.required, false);
  }
});

test('A10 must-reject örnek kabul edilir → acceptance failed; sonuç ayrı tutulur', () => {
  const a = ev({ expectation: 'must-reject', outcome: 'accepted', observations: obs('Ayse\u0000Kaya', 'Ayse\u0000Kaya') });
  assert.equal(acceptance(a).status, 'failed');
  assert.equal(required(a).status, 'not-run');
  assert.equal(exitCode({ cancelled: false, summary: summarize({ selected: 1, outOfScope: [], trials: [trial(a, { expectation: 'must-reject' })], findings: 0 }), runLevelProblems: [] }), 1);
});

test('A11 readback yok / selector bulunamıyor → boş dizgi üretme; incomplete kontrol', () => {
  for (const o of [obs('Ayse Kaya'), obs('Ayse Kaya', undefined, { readback: { boundary: 'readback', status: 'not-observed', note: 'selector yok' } })]) {
    const a = ev({ observations: o, execution: 'error' });
    const r = required(a);
    assert.equal(r.status, 'not-run');
    assert.equal(r.difference, undefined, 'eksik değer "" ile karşılaştırılmaz');
    assert.match(r.reason!, /readback gözlemi yok/);
    const s = summarize({ selected: 1, outOfScope: [], trials: [trial(a, { execution: 'error' })], findings: 0 });
    assert.equal(exitCode({ cancelled: false, summary: s, runLevelProblems: [] }), 2);
  }
});

test('A12 sadece görünüş aynı, kod noktaları farklı → görselden exact eşitlik çıkarma', () => {
  // Latin "a" (U+0061) ile Kiril "а" (U+0430) aynı görünür.
  const r = required(ev({ observations: obs('Kaya', 'Kаya') }));
  assert.equal(r.status, 'failed');
  assert.equal(r.firstDifferenceAt, 1);
  assert.match(describeDifference('Kaya', 'Kаya'), /U\+0430/);
});

test('A13 uzun metin raporda kesilerek gösteriliyor → oracle tam değerde çalışır', () => {
  const long = 'Ayse '.repeat(100) + 'Kaya';
  const shown = truncateForDisplay(long, 80);
  assert.equal(shown.truncated, true);
  // Fark yalnız kesilen kısımda: gösterimdeki metin aynı olsa da kontrol farkı görür.
  const r = required(ev({ observations: obs(long, long.slice(0, -1) + 'A') }));
  assert.equal(r.status, 'failed');
  assert.equal(truncateForDisplay(long.slice(0, -1) + 'A', 80).text, shown.text);
  assert.equal(measures(long).graphemes, 504);
});

test('A14 bilinmeyen comparator / schema sürümü → preflight açık hata (doğrulama katmanı)', () => {
  assert.throws(() => validateContract({ ...C, preservation: [{ id: 'x', rule: 'text.nfkc.v1', required: true, boundary: ['authored', 'readback'] }] }), (e: unknown) => e instanceof SchemaError && /bilinmeyen karşılaştırıcı/.test((e as Error).message));
  assert.throws(() => validateContract({ ...C, schemaVersion: '1.0' }), /desteklenmeyen büyük şema sürümü/);
  assert.equal(checkSchemaVersion('0.9').length, 0);
  assert.throws(() => validateContract({ ...C, expectations: [] }), /kabul beklentisi bağlanmalı/);
  assert.throws(() => validateContract({ ...C, preservation: [{ id: 'x', rule: 'text.exact.v1', required: true, boundary: ['readback', 'authored'] }] }), /sıralı/);
  assert.ok(validateFixture({ schemaVersion: '0.1', id: 'x.y.001', value: 'a\ud800b', properties: ['p'], applicableControls: ['input-text'], inputMethod: 'fill', defaultExpectation: 'unspecified', provenance: { kind: 'synthetic', license: 'Apache-2.0' } }).some((i) => /surrogate/.test(i.message)));
  // Tarayıcı mutasyonu olmadığı test/acceptance.test.ts "A14 …" içinde gerçek runner ile doğrulanır.
});

test('C14 gerekli bir assertion not-run → exit 0 üretilemez', () => {
  const a = ev({ outcome: 'indeterminate', observations: obs('Ayse Kaya') });
  const s = summarize({ selected: 1, outOfScope: [], trials: [trial(a, { applicationOutcome: 'indeterminate' })], findings: 0 });
  assert.ok(s.requiredNotRun > 0);
  assert.equal(s.requiredFailed, 0, '"fail yok"');
  assert.equal(exitCode({ cancelled: false, summary: s, runLevelProblems: [] }), 2, '…ama "tüm gerekli kontroller geçti" değil');
  // Hiçbir şey yürütülmediyse de 0 değil.
  assert.equal(exitCode({ cancelled: false, summary: summarize({ selected: 0, outOfScope: [], trials: [], findings: 0 }), runLevelProblems: [] }), 2);
});

test('çıkış kodu önceliği 130 > 3 > 2 > 1 > 0 (§28)', () => {
  const failed = ev({ observations: obs('İpek', 'pek') });
  const base = (over: Partial<TrialResult>) => summarize({ selected: 1, outOfScope: [], trials: [trial(failed, over)], findings: 1 });
  assert.equal(exitCode({ cancelled: false, summary: base({}), runLevelProblems: [] }), 1);
  assert.equal(exitCode({ cancelled: false, summary: base({}), runLevelProblems: ['eksik kanıt'] }), 2);
  assert.equal(exitCode({ cancelled: false, summary: base({ cleanup: 'failed' }), runLevelProblems: ['x'] }), 3);
  assert.equal(exitCode({ cancelled: true, summary: base({ cleanup: 'failed' }), runLevelProblems: ['x'] }), 130);
});

test('fark sınıfları ve küçültme adayları grafem kümelerini korur', () => {
  assert.equal(classifyDifference('İpek Çağlar', 'Ipek Caglar'), 'marks-stripped');
  const fam = '\u{1f469}‍\u{1f469}‍\u{1f467}';
  const cands = [...reductions(`a${fam}b`, { codePoints: false })].map((r) => r.value);
  assert.ok(cands.every((c) => !c.includes('‍') || c.includes(fam)), 'grafem silmeleri ZWJ dizisini bölmez');
  assert.ok(!cands.includes('') && !cands.includes(`a${fam}b`));
});

test('tekrar sınıflaması: hepsi aynı → stable, karışık → unstable, hata → inconclusive', () => {
  const bad = trial(ev({ observations: obs('İpek', 'pek') }));
  const good = trial(ev({ observations: obs('İpek', 'İpek') }));
  const err = trial(ev({ observations: obs('İpek'), execution: 'error' }), { execution: 'error' });
  const sig = signatureOf(bad, 'a', 'f')!;
  assert.equal(classifyReproducibility(sig, [bad, bad, bad], 'a', 'f'), 'stable');
  assert.equal(classifyReproducibility(sig, [bad, good, bad], 'a', 'f'), 'unstable');
  assert.equal(classifyReproducibility(sig, [bad, err, bad], 'a', 'f'), 'inconclusive');
  // C04 çekirdeği: kabul edilmiş bozulma ile red farklı imzadır.
  const rejected = trial(ev({ outcome: 'rejected', observations: obs('İ') }), { applicationOutcome: 'rejected' });
  const rs = signatureOf(rejected, 'a', 'f');
  assert.notDeepEqual(rs, sig);
});
