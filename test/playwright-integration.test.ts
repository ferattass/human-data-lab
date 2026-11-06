// examples/existing-test: mevcut Playwright projesine entegrasyon gerçekten çalışıyor mu? (§28 "ilk sınıf kullanım")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const runExample = (bugs: string, port: number) => spawnSync(process.execPath, [cli, 'test', '-c', 'examples/existing-test/playwright.config.ts'], {
  cwd: root, encoding: 'utf8', timeout: 180_000, env: { ...process.env, DEMO_BUGS: bugs, HDL_EXAMPLE_PORT: String(port), CI: '1' },
});

test('Playwright Test entegrasyonu: doğru modda yeşil, bozuk modda kırmızı ve açıklamalı', () => {
  const ok = runExample('', 4471);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /5 passed/);
  const bad = runExample('strip-marks', 4472);
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /3 failed/);
  assert.match(bad.stdout, /marks-stripped/);
});
