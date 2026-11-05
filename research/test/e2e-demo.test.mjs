// Uçtan uca: demo uygulamasını hata modlarıyla başlatır, koşucuların çıkış kodlarını doğrular.
// Docker gerekmez; Chromium gerekir (npx playwright install chromium).  node --test test/e2e-demo.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'hdl-e2e-'));
const servers = [];
let port = 4400 + Math.floor(Math.random() * 400);

async function startDemo(bugs) {
  const p = port++;
  const child = spawn(process.execPath, ['demo-app/server.mjs'], { cwd: root, env: { ...process.env, PORT: String(p), DEMO_BUGS: bugs }, stdio: ['ignore', 'pipe', 'inherit'] });
  servers.push(child);
  await new Promise((res, rej) => {
    child.stdout.once('data', res);
    child.once('exit', (c) => rej(new Error(`demo çıktı: ${c}`)));
  });
  return `http://localhost:${p}`;
}

function run(script, adapter, baseUrl, name) {
  const r = spawnSync(process.execPath, [script, adapter, '--out', join(out, `${name}.json`)], { cwd: root, env: { ...process.env, BASE_URL: baseUrl }, encoding: 'utf8', timeout: 180_000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const urls = {};
before(async () => {
  for (const mode of ['', 'latin1', 'utf8mb3', 'fold-lookup', 'slug-lookup']) urls[mode || 'ok'] = await startDemo(mode);
});
after(() => { for (const s of servers) s.kill(); });

test('roundtrip: doğru modda ihlal yok (exit 0)', () => {
  const r = run('src/run.mjs', 'adapters/demo.mjs', urls.ok, 'rt-ok');
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /exact ihlal: 0/);
});

test('roundtrip: latin1 modunda ihlal bulunur (exit 1)', () => {
  const r = run('src/run.mjs', 'adapters/demo.mjs', urls.latin1, 'rt-latin1');
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /replacement-characters/);
});

test('roundtrip: utf8mb3 modunda emoji kesilir (exit 1)', () => {
  const r = run('src/run.mjs', 'adapters/demo.mjs', urls.utf8mb3, 'rt-utf8mb3');
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /truncated|emptied/);
});

test('çakışma: doğru modda karışma yok (exit 0)', () => {
  const r = run('src/collision-run.mjs', 'adapters/demo-pages.mjs', urls.ok, 'col-ok');
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /karışan: 0/);
});

test('çakışma: fold-lookup aksanlı ikizleri karıştırır, C++/C ayrı kalır', () => {
  const r = run('src/collision-run.mjs', 'adapters/demo-pages.mjs', urls['fold-lookup'], 'col-fold');
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗\s+tr\.cedilla-c/);
  assert.match(r.stdout, /✓\s+punct\.cpp/);
  assert.match(r.stdout, /✓\s+control\.unrelated/);
});

test('çakışma: slug-lookup noktalamayı da karıştırır (C++ → C)', () => {
  const r = run('src/collision-run.mjs', 'adapters/demo-pages.mjs', urls['slug-lookup'], 'col-slug');
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗\s+punct\.cpp/);
});
