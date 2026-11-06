// Beta ölçütü (§46): "demo yayımlanacak paket üzerinden çalışır". npm pack → boş projeye kur → yalnız dist/ ile çalıştır.
// Kaynak (.ts) olmadan, derlenmiş çıktıyla; Playwright eş bağımlılığı depodaki kurulumdan bağlanır (ağ gerekmez).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { tmp } from './helpers.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

/** npm tarball'ını (gzip + ustar) açar; sistem `tar`'ının platform farklarına bağımlı değildir. */
function untgz(file: string, dest: string) {
  const buf = gunzipSync(readFileSync(file));
  const str = (b: Buffer) => b.toString('utf8').replace(/\0.*$/s, '');
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const name = (str(h.subarray(345, 500)) ? str(h.subarray(345, 500)) + '/' : '') + str(h.subarray(0, 100));
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    off += 512;
    if (name.split('/').includes('..') || isAbsolute(name)) throw new Error(`güvensiz tar yolu: ${name}`);
    const target = join(dest, name);
    if (type === '5') mkdirSync(target, { recursive: true });
    else if (type === '0') { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, buf.subarray(off, off + size)); }
    off += Math.ceil(size / 512) * 512;
  }
}
const sh = (cmd: string, args: string[], cwd: string) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300_000 });

test('paket: npm pack içeriği ve kurulu paketten demo', () => {
  const work = tmp('hdl-pack-');
  const pack = sh('npm', ['pack', '--json', '--pack-destination', work], root);
  assert.equal(pack.status, 0, pack.stderr);
  const info = JSON.parse(pack.stdout.slice(pack.stdout.indexOf('[')))[0];
  const files: string[] = info.files.map((f: { path: string }) => f.path);

  // İçerik: dağıtılması gerekenler var, gerekmeyenler yok.
  for (const must of ['LICENSE', 'NOTICE', 'README.md', 'bin/hdl.mjs', 'dist/packages/cli/src/main.js', 'dist/packages/playwright/src/index.d.ts', 'dist/packages/corpus/data/human-text.json', 'schema/fixture.schema.json'])
    assert.ok(files.includes(must), `pakette olmalı: ${must}`);
  for (const f of files) {
    assert.ok(!/^(research|test|runs|docs|examples|packages)\//.test(f), `pakete girmemeli: ${f}`);
    assert.ok(!/\.pdf$|storage-state|\.env/i.test(f), `pakete girmemeli: ${f}`);
  }

  // Boş projeye kur: tarball'ı aç, eş bağımlılıkları bağla.
  const proj = join(work, 'proj');
  mkdirSync(join(proj, 'node_modules', '@playwright'), { recursive: true });
  writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  untgz(join(work, info.filename), join(proj, 'node_modules'));
  renameSync(join(proj, 'node_modules', 'package'), join(proj, 'node_modules', 'human-data-lab'));
  const link = (name: string) => symlinkSync(join(root, 'node_modules', name), join(proj, 'node_modules', name), 'junction');
  link('@playwright/test'); link('playwright'); link('playwright-core');
  const pkgDir = join(proj, 'node_modules', 'human-data-lab');
  assert.ok(!existsSync(join(pkgDir, 'packages')), 'kurulu pakette TypeScript kaynağı yok');

  // Paket dışa aktarımları ve CLI
  writeFileSync(join(proj, 'check.mjs'), `
import { runRoundtrip, defineConfig, TOOL } from 'human-data-lab';
import { test, expectTextPreserved } from 'human-data-lab/playwright/test';
import { evaluateTrial, describeDifference } from 'human-data-lab/core';
import { loadCorpus } from 'human-data-lab/corpus';
if (typeof runRoundtrip !== 'function' || typeof defineConfig !== 'function' || typeof test !== 'function' || typeof expectTextPreserved !== 'function' || typeof evaluateTrial !== 'function') throw new Error('eksik dışa aktarım');
console.log(TOOL.version, loadCorpus('smoke').fixtures.length, describeDifference('\\u0130pek', 'pek').split('\\n')[0]);
`);
  const check = spawnSync(process.execPath, ['check.mjs'], { cwd: proj, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /^0\.\d+\.\d+ 24 kural: text\.exact\.v1/);

  const hdl = join(pkgDir, 'bin', 'hdl.mjs');
  const ver = spawnSync(process.execPath, [hdl, '--version'], { cwd: proj, encoding: 'utf8' });
  assert.equal(ver.stdout.trim(), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);

  // init: kurulu pakette taslaklar paket adıyla import eder
  const init = spawnSync(process.execPath, [hdl, 'init', '--adapter', 'playwright'], { cwd: proj, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  assert.match(readFileSync(join(proj, 'hdl', 'adapter.ts'), 'utf8'), /from 'human-data-lab\/playwright'/);
  // lab: araştırma araçları pakette yok, açık mesaj
  assert.equal(spawnSync(process.execPath, [hdl, 'lab', 'search'], { cwd: proj, encoding: 'utf8' }).status, 2);

  // Demo, kurulu paketten
  const demo = spawnSync(process.execPath, [hdl, 'demo', '--out', 'runs'], { cwd: proj, encoding: 'utf8', timeout: 300_000 });
  assert.equal(demo.status, 0, demo.stdout + demo.stderr);
  assert.equal((demo.stdout.match(/^✓ /gm) ?? []).length, 4, demo.stdout);
  for (const s of ['ok', 'a', 'b', 'c']) {
    const run = readdirSync(join(proj, 'runs', s)).find((n) => n.startsWith('run-'))!;
    assert.ok(existsSync(join(proj, 'runs', s, run, 'report.html')));
  }
});
