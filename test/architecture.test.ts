// Paket sınırları (§37): core Playwright/React/dosya sistemine bağımlı olmaz; reporter tarayıcı veya uygulama
// üzerinde yazma yapmaz; paketler yalnız izin verilen yöne import eder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../packages/', import.meta.url));
const filesOf = (pkg: string) => readdirSync(join(root, pkg, 'src'), { recursive: true }).map(String).filter((f) => f.endsWith('.ts')).map((f) => join(root, pkg, 'src', f));
// Statik import/export-from, yan etkili import, dinamik import() ve createRequire hepsi bağımlılıktır.
const importsOf = (file: string) => {
  const src = readFileSync(file, 'utf8');
  return [
    ...[...src.matchAll(/^\s*(?:import|export)\s[^'"]*?\sfrom\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
    ...[...src.matchAll(/createRequire\([^)]*\)\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  ];
};

// paket → import edebileceği paketler
const ALLOWED: Record<string, string[]> = {
  core: [],
  corpus: ['core'],
  store: ['core'],
  reporter: ['core', 'store'],
  playwright: ['core', 'corpus', 'store', 'reporter'],
  mcp: ['core', 'corpus', 'store', 'reporter', 'playwright'],
  cli: ['core', 'corpus', 'store', 'reporter', 'playwright', 'mcp'],
};

test('core: Playwright, React, dosya sistemi veya ağ bağımlılığı yok', () => {
  for (const f of filesOf('core')) {
    for (const i of importsOf(f)) {
      assert.ok(!/playwright|react|^node:(fs|http|https|net|child_process)/.test(i), `${f} → ${i}`);
    }
  }
});

test('reporter: browser veya uygulama yazması yok (yalnız sonuç okur, HTML yazar)', () => {
  for (const f of filesOf('reporter')) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/@playwright|fetch\(|node:http/.test(src), f);
  }
});

test('paketler arası bağımlılık yönü', () => {
  for (const [pkg, allowed] of Object.entries(ALLOWED)) {
    for (const f of filesOf(pkg)) {
      for (const i of importsOf(f)) {
        const m = i.match(/^\.\.\/\.\.\/([a-z]+)\/src\//);
        if (!m || m[1] === pkg) continue;
        assert.ok(allowed.includes(m[1]), `${pkg} paketi ${m[1]} paketini import edemez (${f})`);
      }
    }
  }
});
