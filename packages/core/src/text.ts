// Metin gözlem araçları (§14). Hiçbiri karşılaştırma öncesi metni dönüştürmez.
import type { DifferenceClass } from './types.ts';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(s: string): string[] {
  return [...segmenter.segment(s)].map((g) => g.segment);
}

export function codePoints(s: string): string[] {
  return [...s].map((ch) => 'U+' + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'));
}

/** Uzunluk birimleri ayrı adlandırılır (§14): "4 karakter" demeden önce birim söylenir. */
export function measures(s: string) {
  return {
    utf16CodeUnits: s.length,
    codePoints: [...s].length,
    graphemes: graphemes(s).length,
    utf8Bytes: new TextEncoder().encode(s).length,
  };
}

/** Görünmez/ASCII dışı karakterleri kaçışlı gösterir. Ham değer ayrıca saklanır (C12). */
export function escaped(s: string): string {
  return [...s]
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x20 && cp < 0x7f && ch !== '\\') return ch;
      if (ch === '\\') return '\\\\';
      return cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`;
    })
    .join('');
}

/** İlk farklı kod noktasının indeksi (kod noktası birimi); eşitse -1. */
export function firstDifference(a: string, b: string): number {
  const ca = [...a];
  const cb = [...b];
  const n = Math.max(ca.length, cb.length);
  for (let i = 0; i < n; i++) if (ca[i] !== cb[i]) return i;
  return -1;
}

const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Farkın biçimini adlandırır. Kök neden iddiası değildir; yalnız gözlenen iki dizginin ilişkisidir.
 * Sıra önemlidir: daha dar açıklama önce.
 */
export function classifyDifference(expected: string, actual: string): DifferenceClass {
  if (expected === actual) return 'none';
  if (actual === '' && expected !== '') return 'emptied';
  if (expected.normalize('NFC') === actual.normalize('NFC')) return 'normalization-form-changed';
  if (expected.trim() === actual) return 'trimmed';
  if (expected.replace(/\u00a0/g, ' ') === actual) return 'nbsp-replaced';
  if (expected.replace(/[ \u00a0]{2,}/g, ' ') === actual || expected.replace(/\s+/g, ' ') === actual) return 'whitespace-collapsed';
  if (expected.normalize('NFKC') === actual.normalize('NFKC')) return 'compatibility-folded';
  if (actual.length < expected.length && expected.startsWith(actual)) return 'truncated';
  if (stripMarks(expected) === stripMarks(actual)) return 'marks-stripped';
  if (/[?�]/.test(actual) && [...actual].length <= [...expected].length + 2) return 'replacement-characters';
  if (expected.toLowerCase() === actual.toLowerCase() || expected.toLocaleLowerCase('tr') === actual.toLocaleLowerCase('tr')) return 'case-changed';
  return 'other';
}

/** İnsan okunur fark açıklaması: kural, sınıf, kaçışlı değerler, kod noktaları ve adlandırılmış ölçüler. */
export function describeDifference(expected: string, actual: string, rule = 'text.exact.v1'): string {
  const m = (s: string) => { const x = measures(s); return `${x.graphemes} grafem · ${x.codePoints} kod noktası · ${x.utf16CodeUnits} UTF-16 birimi · ${x.utf8Bytes} UTF-8 baytı`; };
  return [
    `kural: ${rule}`,
    `fark sınıfı: ${classifyDifference(expected, actual)}  (ilk fark: ${firstDifference(expected, actual)}. kod noktası)`,
    `beklenen: "${escaped(expected)}"`,
    `görülen:  "${escaped(actual)}"`,
    `beklenen kod noktaları: ${codePoints(expected).join(' ')}`,
    `görülen kod noktaları:  ${codePoints(actual).join(' ')}`,
    `beklenen: ${m(expected)}`,
    `görülen:  ${m(actual)}`,
  ].join('\n');
}

/** Raporda gösterim için kısaltma. Oracle her zaman tam değerle çalışır (A13). */
export function truncateForDisplay(s: string, maxGraphemes = 80): { text: string; truncated: boolean } {
  const g = graphemes(s);
  if (g.length <= maxGraphemes) return { text: s, truncated: false };
  return { text: g.slice(0, maxGraphemes).join('') + '…', truncated: true };
}
