#!/usr/bin/env node
// human-data-lab tek giriş noktası.
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const commands = {
  roundtrip: ['src/run.mjs', 'form → kaydet → taze okuma; metin aynen korunuyor mu', '<adapter> [--corpus text-smoke] [--exclude emoji,…] [--out f.json]'],
  search: ['src/search-run.mjs', 'kaydı kullanıcının yazabileceği biçimlerle ara (negatif kontrollü)', '<adapter> [--only id,…] [--out f.json]'],
  identity: ['src/identity-run.mjs', 'e-posta çiftleri: aynı posta kutusuna ikinci hesap açılıyor mu', '<adapter> [--only id,…] [--out f.json]'],
  collision: ['src/collision-run.mjs', 'yalnız aksan/noktalamayla ayrılan adlar ayrı kayıt kalıyor mu', '<adapter> [--only id,…] [--out f.json]'],
  demo: ['demo-app/server.mjs', 'hata modlu yerel demo uygulaması', '[hata,modu,…]   (PORT ortam değişkeni, varsayılan 4310)'],
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === '-h' || cmd === '--help' || !commands[cmd]) {
  if (cmd && !commands[cmd] && cmd !== '-h' && cmd !== '--help') console.error(`bilinmeyen komut: ${cmd}\n`);
  console.log('human-data-lab — insan metni bütünlüğü testleri\n\nKullanım: hdl <komut> …\n');
  for (const [name, [, desc, usage]] of Object.entries(commands)) console.log(`  ${name.padEnd(10)} ${desc}\n  ${' '.repeat(10)} hdl ${name} ${usage}\n`);
  console.log('Çıkış kodları: 0 ihlal yok · 1 ihlal bulundu · 2 çalışmayan kontrol / adapter şüpheli');
  process.exit(cmd && !commands[cmd] && cmd !== '-h' && cmd !== '--help' ? 2 : 0);
}

const [script] = commands[cmd];
if (cmd === 'demo' && rest[0]) process.env.DEMO_BUGS = rest[0];
// Alt betikler argümanları process.argv.slice(2)'den okur.
process.argv = [process.argv[0], root + script, ...(cmd === 'demo' ? [] : rest)];
await import(pathToFileURL(root + script).href);
