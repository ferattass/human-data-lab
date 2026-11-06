#!/usr/bin/env node
// Yayın derlemesi: TypeScript kaynaklarını dist/ altına JS + .d.ts olarak üretir ve çalışma zamanı verilerini kopyalar.
// Geliştirmede derleme gerekmez (Node tip silme); bu yalnız paket içindir: Node, node_modules içinde .ts çalıştırmaz.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const r = spawnSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json')], { stdio: 'inherit' });
if (r.status !== 0) { console.error(`tsc başarısız (status ${r.status})`); process.exit(r.status ?? 1); }

// fs.cpSync kullanılmaz: Node 24.14 / Windows'ta ASCII dışı yolda (ör. "Yayında") sessizce 127 ile çöküyor.
function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyTree(join(src, e.name), join(dst, e.name));
    else if (e.isFile()) copyFileSync(join(src, e.name), join(dst, e.name));
  }
}

// Çalışma zamanında dosya yoluyla okunan veriler
for (const p of ['packages/corpus/data', 'packages/cli/templates']) copyTree(join(root, p), join(dist, p));

const missing = ['packages/cli/src/main.js', 'packages/playwright/src/index.js', 'packages/playwright/src/test.js', 'packages/corpus/data/human-text.json']
  .filter((f) => !existsSync(join(dist, f)));
if (missing.length) { console.error(`derleme eksik: ${missing.map((f) => 'dist/' + f).join(', ')}`); process.exitCode = 1; }
else console.log('dist/ hazır');
