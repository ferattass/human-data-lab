// Corpus dosyasını kanonik biçimde yazar: değerler dahil tüm ASCII dışı karakterler \uXXXX kaçışlı (incelenebilirlik, §16).
// Kullanım: node packages/corpus/scripts/write-corpus.ts   (sets/version değişikliklerini aşağıdaki SETS ile uygular)
import { readFileSync, writeFileSync } from 'node:fs';
import { validateCorpus } from '../../core/src/index.ts';

const path = new URL('../data/human-text.json', import.meta.url);
const c = JSON.parse(readFileSync(path, 'utf8'));

const SETS: Record<string, string[]> = {
  'demo-a': ['latin.basic.001', 'tr-i.dotted-capital.002', 'combining.nfc-acute.001'],
  'demo-b': ['latin.basic.001', 'combining.nfc-acute.001', 'combining.nfd-acute.001', 'combining.nfd-turkish.001'],
  'demo-c': ['control.nul.001', 'latin.basic.001', 'tr-i.dotted-capital.002'],
};
const VERSION = '1.1.0';

let changed = c.version !== VERSION;
for (const [k, v] of Object.entries(SETS)) if (JSON.stringify(c.sets[k]) !== JSON.stringify(v)) { c.sets[k] = v; changed = true; }
c.version = VERSION;
validateCorpus(c as unknown); // ifade üzerinde: c'nin tipi daraltılmaz (sets alanı Corpus tipinde yok)

// Yalnız "value" satırları kaçışlanır; açıklama/notlar okunabilir Türkçe kalır.
const escapeLine = (l: string) => l.replace(/[\u007f-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
const out = JSON.stringify(c, null, 2).split('\n').map((l) => (/^\s*"value": "/.test(l) ? escapeLine(l) : l)).join('\n');
writeFileSync(path, out + '\n');
console.log(changed ? `yazıldı: ${c.id}@${c.version}, setler: ${Object.keys(c.sets).join(', ')}` : 'değişiklik yok');
