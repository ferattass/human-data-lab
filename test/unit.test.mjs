// Saf modüllerin birim testleri: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, classifyDifference, escaped, firstDifference, measures, codePoints } from '../src/compare.mjs';
import { expectTextPreserved, loadCorpus } from '../src/index.mjs';
import { queriesFor, VARIANTS } from '../src/variants.mjs';
import { parseCsv, decodeCsv, cellFor } from '../src/csv.mjs';
import { mailboxKey, identityFlags, isDuplicateFlag } from '../src/identity.mjs';
import { classifyCollision, verdict, withSuffix } from '../src/collision.mjs';

const NFD = 'José';
const NFC = 'José';

test('exact kural: NFC/NFD farkını ihlal sayar, nfc kuralı saymaz', () => {
  assert.equal(evaluate('text.exact.v1', NFC, NFD).status, 'failed');
  assert.equal(evaluate('text.nfc.v1', NFC, NFD).status, 'passed');
  assert.equal(evaluate('text.nfc.v1', NFC, NFD).rawEqual, false);
});

test('okuma yoksa sonuç "not-run" olur, "passed" değil', () => {
  assert.equal(evaluate('text.exact.v1', 'a', undefined).status, 'not-run');
  assert.equal(evaluate('text.exact.v1', 'a', null).status, 'not-run');
});

test('bilinmeyen kural hata fırlatır', () => {
  assert.throws(() => evaluate('text.nope', 'a', 'a'), /Bilinmeyen kural/);
});

test('fark sınıfları', () => {
  const cases = [
    ['Ayşe 🙂', '', 'emptied'],
    [NFC, NFD, 'normalization-form-changed'],
    [' Ali ', 'Ali', 'trimmed'],
    ['Ali Veli', 'Ali Veli', 'nbsp-replaced'],
    ['Ali  Veli', 'Ali Veli', 'whitespace-collapsed'],
    ['Abcdef', 'Abc', 'truncated'],
    ['Çağlar', 'Caglar', 'marks-stripped'],
    ['李小龍', '???', 'replacement-characters'],
    ['Ankara', 'ANKARA', 'case-changed'],
    ['Elma', 'Armut', 'other'],
  ];
  for (const [e, a, want] of cases) assert.equal(classifyDifference(e, a), want, `${e} -> ${a}`);
});

test('kaçışlı gösterim görünmeyen karakterleri açığa çıkarır', () => {
  assert.equal(escaped('a b'), 'a\\u00a0b');
  assert.equal(escaped('🙂'), '\\u{1f642}');
  assert.equal(firstDifference('abc', 'abd'), 2);
  assert.equal(firstDifference('abc', 'abc'), -1);
  assert.deepEqual(codePoints('é'), ['U+00E9']);
});

test('ölçüler: grafem, kod noktası, UTF-16 ve UTF-8 ayrı sayılır', () => {
  const m = measures('👩‍👩‍👧');
  assert.equal(m.graphemes, 1);
  assert.equal(m.codePoints, 5);
  assert.equal(m.utf16, 8);
  assert.equal(m.utf8Bytes, 18);
});

test('expectTextPreserved kod noktası ayrıntılı hata verir', () => {
  assert.doesNotThrow(() => expectTextPreserved('Işık', 'Işık'));
  assert.throws(() => expectTextPreserved('Işık', 'Isik', { label: 'ad' }), (e) =>
    /Metin korunmadı \[ad\]/.test(e.message) && /U\+0131/.test(e.message) && e.result.status === 'failed');
});

test('korpus: 25 fixture, benzersiz kimlik, her biri en az bir özellik', () => {
  const fx = loadCorpus();
  assert.equal(fx.length, 25);
  assert.equal(new Set(fx.map((f) => f.id)).size, fx.length);
  for (const f of fx) assert.ok(Array.isArray(f.properties) && f.properties.length, f.id);
  assert.ok(loadCorpus('text-smoke', { exclude: ['emoji'] }).length < fx.length);
});

test('ad çifti ve e-posta korpusları şemaya uyar', () => {
  const np = JSON.parse(readFileSync(new URL('../corpus/name-pairs.json', import.meta.url), 'utf8'));
  assert.equal(new Set(np.pairs.map((p) => p.id)).size, np.pairs.length);
  for (const p of np.pairs) {
    assert.ok(['distinct', 'policy', 'control'].includes(p.expect), p.id);
    assert.notEqual(p.a, p.b, p.id);
  }
  assert.ok(np.pairs.some((p) => p.expect === 'control'), 'en az bir kontrol çifti şart');
  const em = JSON.parse(readFileSync(new URL('../corpus/email-identity.json', import.meta.url), 'utf8'));
  for (const p of em.pairs) assert.ok(p.a.includes('{n}') && p.b.includes('{n}'), p.id);
});

test('arama varyantları: Türkçe yerel ayar farkı ve tekilleştirme', () => {
  const q = queriesFor('Ilık Işık');
  const by = (v) => q.find((x) => x.variants.includes(v)).query;
  assert.equal(by('lower-tr'), 'ılık ışık');
  assert.equal(by('lower-root'), 'ilık işık');
  assert.equal(by('upper-tr'), 'ILIK IŞIK');
  assert.equal(by('ascii-fold'), 'Ilik Isik');
  assert.equal(q.filter((x) => x.required).length, 1);
  assert.equal(new Set(q.map((x) => x.query)).size, q.length, 'aynı sorgu iki kez gönderilmez');
  // Her varyant bir sorguya düşer (boş olanlar hariç)
  assert.equal(q.flatMap((x) => x.variants).length, VARIANTS.length);
  // Kök (yerel ayarsız) küçültme İ'yi "i + U+0307" yapar; Türkçe küçültme düz "i".
  const ip = queriesFor('İpek');
  assert.equal(ip.find((x) => x.variants.includes('lower-root')).query, 'i̇pek');
  assert.equal(ip.find((x) => x.variants.includes('lower-tr')).query, 'ipek');
});

test('CSV: tırnak, kaçış, alan içi satır sonu, BOM', () => {
  const rows = parseCsv('#,Ad\r\n1,"O""Brien, Jr."\r\n2,"Satır\nikinci"\r\n');
  assert.deepEqual(rows[1], ['1', 'O"Brien, Jr.']);
  assert.equal(rows[2][1], 'Satır\nikinci');
  assert.equal(cellFor(rows, { idColumn: '#', valueColumn: 'Ad', id: 2 }), 'Satır\nikinci');
  assert.throws(() => cellFor(rows, { idColumn: 'x', valueColumn: 'Ad', id: 1 }), /kolon yok/);
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a,ş')]);
  const d = decodeCsv(bytes, 'text/csv; charset=utf-8');
  assert.equal(d.hasBom, true);
  assert.equal(d.text, 'a,ş');
  const latin = decodeCsv(new Uint8Array([0x61, 0x2c, 0xfe]), 'text/csv; charset=ISO-8859-9');
  assert.equal(latin.text, 'a,ş');
});

test('posta kutusu anahtarı: IDN, büyüklük, boşluk, NFC', () => {
  assert.equal(mailboxKey(' Ali@ÖRNEK.com.tr '), 'ali@xn--rnek-4qa.com.tr');
  assert.equal(mailboxKey('ali@xn--rnek-4qa.com.tr'), mailboxKey('ali@örnek.com.tr'));
  assert.equal(mailboxKey('josé@x.com'), mailboxKey('josé@x.com'));
  assert.notEqual(mailboxKey('admın@x.com'), mailboxKey('admin@x.com'));
});

test('kimlik işaretleri: aynı posta kutusuna ikinci hesap yakalanır', () => {
  const acc = (email, stored = email) => ({ email, stored, outcome: 'accepted' });
  const f1 = identityFlags({ sameMailbox: true }, acc('a@x.com'), acc('A@X.COM'));
  assert.ok(f1.some(isDuplicateFlag));
  const f2 = identityFlags({ sameMailbox: false }, acc('kim@x.com'), acc('Kim@x.com', 'kim@x.com'));
  assert.ok(f2.includes('two-accounts-same-stored-address'));
  assert.ok(f2.includes('b-mutated'));
  const f3 = identityFlags({ sameMailbox: true }, acc('a@x.com'), { email: 'A@x.com', outcome: 'rejected' });
  assert.ok(!f3.some(isDuplicateFlag));
});

test('çakışma sınıflandırması', () => {
  const rec = (name, id, body, read) => ({ name, recordId: id, body, read });
  assert.equal(classifyCollision({ a: rec('Çam', '1', 'a', { name: 'Çam', body: 'a' }), b: rec('Cam', '2', 'b', { name: 'Cam', body: 'b' }) }), 'distinct');
  assert.equal(classifyCollision({ a: rec('Çam', '1', 'a', { name: 'Çam', body: 'b' }), b: rec('Cam', '1', 'b', { name: 'Çam', body: 'b' }) }), 'overwritten');
  assert.equal(classifyCollision({ a: rec('Şiş', '4', undefined, { name: 'Şiş' }), b: rec('Sis', '4', undefined, { name: 'Şiş' }) }), 'merged');
  assert.equal(classifyCollision({ a: rec('X', '1', 'a', { name: 'X', body: 'a' }), b: { name: 'Y', rejected: 'zaten var' } }), 'rejected');
  assert.equal(classifyCollision({ a: rec('a b', '1', 'a', { name: 'a_b', body: 'a' }), b: rec('c', '2', 'b', { name: 'c', body: 'b' }) }), 'renamed');
  assert.equal(classifyCollision({ a: { name: 'X', error: 'timeout' }, b: rec('Y', '2') }), 'error');
});

test('çakışma hükmü beklentiye bağlıdır', () => {
  assert.equal(verdict('distinct', 'overwritten'), 'fail');
  assert.equal(verdict('distinct', 'rejected'), 'blocked');
  assert.equal(verdict('policy', 'merged'), 'observed');
  assert.equal(verdict('control', 'merged'), 'adapter-suspect');
  assert.equal(verdict('distinct', 'error'), 'not-run');
  assert.equal(verdict('distinct', 'distinct'), 'pass');
  assert.equal(withSuffix('Çam', 'x1'), 'Çam-x1');
});
