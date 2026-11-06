#!/usr/bin/env node
// human-data-lab CLI girişi. Node ≥ 22.18 TypeScript kaynaklarını doğrudan çalıştırır (build adımı yok).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`human-data-lab Node >= 22.18 gerektirir (bulunan ${process.versions.node}).`);
  process.exit(2);
}
const { main } = await import('../packages/cli/src/main.ts');
process.exitCode = await main();
