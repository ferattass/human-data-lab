#!/usr/bin/env node
// human-data-lab CLI girişi.
//   Depoda: TypeScript kaynağı doğrudan çalışır (Node ≥ 22.18 tip silme, build yok).
//   Kurulu pakette: derlenmiş dist/ çalışır (Node, node_modules içinde .ts çalıştırmaz).
import { existsSync } from 'node:fs';

const source = new URL('../packages/cli/src/main.ts', import.meta.url);
const compiled = new URL('../dist/packages/cli/src/main.js', import.meta.url);
const [major, minor] = process.versions.node.split('.').map(Number);

let entry;
if (existsSync(source)) {
  if (major < 22 || (major === 22 && minor < 18)) {
    console.error(`human-data-lab kaynaktan çalışırken Node >= 22.18 gerektirir (bulunan ${process.versions.node}).`);
    process.exit(2);
  }
  entry = source;
} else if (existsSync(compiled)) entry = compiled;
else {
  console.error('human-data-lab: ne kaynak ne derlenmiş çıktı bulundu (npm run build?).');
  process.exit(2);
}
const { main } = await import(entry.href);
process.exitCode = await main();
