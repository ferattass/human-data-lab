// schema/*.json belgeleri ile gerçek veri arasında tutarlılık (§37: sözleşmeler sürümlü JSON).
// Tam bir JSON Schema doğrulayıcısı değildir: zorunlu alanlar, enum'lar, const ve additionalProperties=false denetlenir.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { browser, closeBrowser, config, fixture, run, withDemo } from './helpers.ts';
import { displayNameContract } from '../examples/profile-demo/contract.ts';

after(closeBrowser);
const schema = (n: string) => JSON.parse(readFileSync(new URL(`../schema/${n}.schema.json`, import.meta.url), 'utf8'));
type S = { required?: string[]; properties?: Record<string, S>; enum?: unknown[]; const?: unknown; additionalProperties?: boolean | S; items?: S; type?: string };

/** Hafif yapısal denetim; hataları yol ile döndürür. */
function check(s: S, v: unknown, path = '$'): string[] {
  const out: string[] = [];
  if (s.const !== undefined && v !== s.const) out.push(`${path}: const ${JSON.stringify(s.const)} bekleniyor, ${JSON.stringify(v)}`);
  if (s.enum && !s.enum.includes(v)) out.push(`${path}: ${JSON.stringify(v)} enum dışında (${s.enum.join(', ')})`);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in o)) out.push(`${path}.${k}: zorunlu alan yok`);
    for (const [k, sub] of Object.entries(s.properties ?? {})) if (k in o && o[k] !== undefined) out.push(...check(sub, o[k], `${path}.${k}`));
    if (s.additionalProperties === false) {
      for (const k of Object.keys(o)) if (!(k in (s.properties ?? {}))) out.push(`${path}.${k}: şemada olmayan alan`);
    } else if (typeof s.additionalProperties === 'object') {
      for (const [k, x] of Object.entries(o)) out.push(...check(s.additionalProperties, x, `${path}.${k}`));
    }
  }
  if (Array.isArray(v) && s.items) v.forEach((x, i) => out.push(...check(s.items!, x, `${path}[${i}]`)));
  return out;
}

test('denetleyici gerçekten ihlal yakalar (negatif kontrol)', () => {
  const f = { ...fixture('latin.basic.001') };
  assert.ok(check(schema('fixture'), { ...f, extra: 1 }).some((e) => /şemada olmayan alan/.test(e)));
  assert.ok(check(schema('fixture'), { ...f, inputMethod: 'type' }).some((e) => /const/.test(e)));
  const { value: _v, ...noValue } = f;
  assert.ok(check(schema('fixture'), noValue).some((e) => /\$\.value: zorunlu/.test(e)));
  const obsSchema = schema('trial-result');
  assert.ok(check(obsSchema, { observations: { readback: { boundary: 'readback', status: 'maybe' } } }).some((e) => /status: "maybe" enum/.test(e)), 'nesne tipli additionalProperties denetleniyor');
  assert.ok(check(schema('manifest'), { files: { 'a.json': 'md5:x' } }).length > 0);
});

test('corpus adı allowlist: dizin ayracı veya ".." içeren ad data/ dışına çıkamaz', async () => {
  const { readCorpusFile, isCorpusName } = await import('../packages/corpus/src/index.ts');
  for (const bad of ['../package', 'x/y', 'a\\b', '', 'human-text.json']) {
    assert.equal(isCorpusName(bad), false, bad);
    assert.throws(() => readCorpusFile(bad), /geçersiz corpus adı/, bad);
  }
  assert.equal(isCorpusName('human-text'), true);
  assert.equal(readCorpusFile('human-text').id, 'human-text');
});

test('corpus ve fixture şeması gerçek corpus dosyasıyla uyumlu', () => {
  const c = JSON.parse(readFileSync(new URL('../packages/corpus/data/human-text.json', import.meta.url), 'utf8'));
  assert.deepEqual(check(schema('corpus'), c), []);
  const fs = schema('fixture');
  for (const f of c.fixtures) assert.deepEqual(check(fs, f), [], f.id);
});

test('sözleşme şeması örnek sözleşmelerle uyumlu', () => {
  for (const c of [displayNameContract(), displayNameContract({ rule: 'text.nfc.v1' })]) assert.deepEqual(check(schema('contract'), c), []);
});

test('trial-result, finding ve manifest şemaları gerçek koşu çıktısıyla uyumlu', async () => {
  await withDemo(['strip-marks'], async (d) => {
    await browser();
    const r = await run(config(d), [fixture('latin.basic.001'), fixture('tr-i.dotted-capital.002'), fixture('control.nul.001')], { reproduce: true });
    const attempts = readFileSync(join(r.runDir, 'attempts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    for (const a of attempts) assert.deepEqual(check(schema('trial-result'), a), [], a.identity.attemptId);
    const fdir = join(r.runDir, 'findings');
    const findings = readdirSync(fdir).map((f) => JSON.parse(readFileSync(join(fdir, f), 'utf8')));
    assert.ok(findings.length >= 1);
    for (const f of findings) assert.deepEqual(check(schema('finding'), f), [], f.id);
    const m = JSON.parse(readFileSync(join(r.runDir, 'manifest.json'), 'utf8'));
    assert.deepEqual(check(schema('manifest'), m), []);
  });
});
