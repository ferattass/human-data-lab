// CLI davranışı tarayıcısız: argüman ayrıştırma, hdl report çıkış kodu önceliği (§28) ve bozuk manifest'e dayanıklılık.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp } from './helpers.ts';
import { main } from '../packages/cli/src/main.ts';

/** console çıktısını yakalayarak main() çalıştırır. */
async function quiet(argv: string[]): Promise<{ code: number; out: string }> {
  const log = console.log; const err = console.error; const out: string[] = [];
  console.log = (...a: unknown[]) => { out.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { out.push(a.map(String).join(' ')); };
  try { return { code: await main(argv), out: out.join('\n') }; }
  finally { console.log = log; console.error = err; }
}

test('CLI argümanları: boolean bayrak konumsal argümanı yutmaz; değer bayrağı değersiz kalamaz; bilinmeyen komut 2', async () => {
  assert.equal((await quiet(['--version'])).code, 0);
  assert.equal((await quiet(['help'])).code, 0);
  const missing = await quiet(['demo', '--out']);
  assert.equal(missing.code, 2);
  assert.match(missing.out, /--out bir değer gerektirir/);
  const noValue = await quiet(['report', '--json=evet', 'x']);
  assert.equal(noValue.code, 2);
  assert.match(noValue.out, /--json değer almaz/);
  assert.equal((await quiet(['nope'])).code, 2);
  // `--json` konumsal argümanı yutmaz: dizin okunur (manifest yok → tamamlanmamış, exit 2), kullanım hatası değil.
  const dir = tmp('hdl-cli-');
  const j = await quiet(['report', '--json', dir]);
  assert.equal(j.code, 2);
  assert.doesNotMatch(j.out, /kullanım/);
  assert.match(j.out, /"complete": false/);
});

test('hdl report çıkış kodu önceliği: tamamlanmamış koşuda 130 ve 3 korunur, 1 → 2; provenance\'sız manifest çökertmez', async () => {
  const mk = (exitCode: number) => {
    const d = join(tmp('hdl-report-'), 'run-x');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'manifest.json'), JSON.stringify({
      schemaVersion: '0.1', kind: 'roundtrip-run', runId: 'x', status: 'incomplete', startedAt: '2026-01-01T00:00:00.000Z',
      cancelled: exitCode === 130, syntheticDemo: false, exitCode, problems: [], files: {},
    }));
    return d;
  };
  assert.equal((await quiet(['report', mk(130), '--json'])).code, 130, 'iptal 2\'ye düşmez');
  assert.equal((await quiet(['report', mk(3)])).code, 3, 'doğrulanmamış cleanup 2\'ye düşmez');
  assert.equal((await quiet(['report', mk(1)])).code, 2, 'tamamlanmamış koşu en az 2');
  const d = mk(2);
  assert.equal((await quiet(['report', d])).code, 2);
  assert.ok(existsSync(join(d, 'report.html')), 'provenance olmadan da rapor üretilir');
  const r = await quiet(['report', d, '--json']);
  const view = JSON.parse(r.out.slice(r.out.indexOf('{')));
  assert.equal(view.target, null);
  assert.equal(view.exitMeaning, 'yapılandırma, yürütme, eksik kanıt veya belirsiz sonuç');
  assert.ok(view.problems.some((p: string) => /incomplete/.test(p)));
});
