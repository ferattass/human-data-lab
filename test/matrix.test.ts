// 42 çekirdek kabul senaryosunun (A01–A14, B01–B14, C01–C14) her biri en az bir testin adında geçmeli (§34).
// Bir senaryo testi silinir veya yeniden adlandırılırsa bu test kırılır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const sources = readdirSync(dir).filter((f) => f.endsWith('.test.ts') && f !== 'matrix.test.ts').map((f) => readFileSync(new URL(f, dir), 'utf8'));
const names = sources.flatMap((s) => [...s.matchAll(/\btest\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]));

test('kabul matrisi: 42 senaryonun hepsi test edilmiş', () => {
  const ids = ['A', 'B', 'C'].flatMap((g) => Array.from({ length: 14 }, (_, i) => `${g}${String(i + 1).padStart(2, '0')}`));
  assert.equal(ids.length, 42);
  const missing = ids.filter((id) => !names.some((n) => n.startsWith(id + ' ')));
  assert.deepEqual(missing, [], `testi olmayan senaryolar: ${missing.join(', ')}`);
});
