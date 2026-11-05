// Kullanıcının aynı kaydı aramak için yazabileceği sorgu biçimleri.
// Her varyantın beklentisi ayrıdır: yalnız `exact` zorunludur; diğerleri ürün politikasıdır ve gözlem olarak raporlanır.

const stripMarks = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
// Türkçe klavyede noktasız/noktalı harfleri ASCII'ye indirerek yazan kullanıcı ("Ipek Caglar").
const asciiFold = (s) => stripMarks(s).replace(/ı/g, 'i').replace(/İ/g, 'I');

export const VARIANTS = [
  { id: 'exact', required: true, make: (s) => s },
  { id: 'lower-root', make: (s) => s.toLowerCase() },
  { id: 'lower-tr', make: (s) => s.toLocaleLowerCase('tr') },
  { id: 'upper-root', make: (s) => s.toUpperCase() },
  { id: 'upper-tr', make: (s) => s.toLocaleUpperCase('tr') },
  { id: 'nfd', make: (s) => s.normalize('NFD') },
  { id: 'nfc', make: (s) => s.normalize('NFC') },
  { id: 'ascii-fold', make: asciiFold },
  { id: 'first-word', make: (s) => s.trim().split(/\s+/u)[0] },
];

// Aynı sorguyu üreten varyantları tek sorguda birleştirir; hangi etiketlerin onu ürettiği korunur.
export function queriesFor(value) {
  const byQuery = new Map();
  for (const v of VARIANTS) {
    const q = v.make(value);
    if (!q.trim()) continue;
    const e = byQuery.get(q) ?? { query: q, variants: [], required: false };
    e.variants.push(v.id);
    e.required ||= !!v.required;
    byQuery.set(q, e);
  }
  return [...byQuery.values()];
}
