// Saf karşılaştırıcılar ve fark açıklaması. Tarayıcıya bağımlı değildir.
// Kural: örtük trim / case-fold / NFKC yok. NFC yalnız açıkça seçilirse.

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export const RULES = {
  'text.exact.v1': (expected, actual) => expected === actual,
  'text.nfc.v1': (expected, actual) => expected.normalize('NFC') === actual.normalize('NFC'),
};

export function codePoints(s) {
  return [...s].map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
}

export function measures(s) {
  return {
    utf16: s.length,
    codePoints: [...s].length,
    graphemes: [...segmenter.segment(s)].length,
    utf8Bytes: new TextEncoder().encode(s).length,
  };
}

// İlk farklı kod noktasının indeksi (kod noktası birimiyle); eşitse -1.
export function firstDifference(a, b) {
  const ca = [...a];
  const cb = [...b];
  const n = Math.max(ca.length, cb.length);
  for (let i = 0; i < n; i++) if (ca[i] !== cb[i]) return i;
  return -1;
}

// Gözle görünmeyen karakterleri görünür kılan kaçışlı gösterim.
export function escaped(s) {
  return [...s]
    .map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp >= 0x20 && cp < 0x7f) return ch;
      return cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`;
    })
    .join('');
}

// Bilinen dönüşüm sınıflarını tahmin eder. Bu bir kök neden iddiası değil, farkın şeklidir.
export function classifyDifference(expected, actual) {
  if (expected === actual) return 'none';
  if (actual === '') return 'emptied';
  if (expected.normalize('NFC') === actual.normalize('NFC')) return 'normalization-form-changed';
  if (expected.trim() === actual) return 'trimmed';
  if (expected.replace(/ /g, ' ') === actual) return 'nbsp-replaced';
  if (expected.replace(/ {2,}/g, ' ') === actual) return 'whitespace-collapsed';
  if (expected.startsWith(actual)) return 'truncated';
  if (expected.normalize('NFD').replace(/\p{M}/gu, '') === actual.normalize('NFD').replace(/\p{M}/gu, ''))
    return 'marks-stripped';
  if (/\?|�/.test(actual) && actual.length <= expected.length + 2) return 'replacement-characters';
  if (expected.toLowerCase() === actual.toLowerCase()) return 'case-changed';
  return 'other';
}

export function evaluate(rule, expected, actual) {
  const fn = RULES[rule];
  if (!fn) throw new Error(`Bilinmeyen kural: ${rule}`);
  if (actual === undefined || actual === null) return { status: 'not-run', rule, reason: 'readback-missing' };
  const passed = fn(expected, actual);
  return {
    status: passed ? 'passed' : 'failed',
    rule,
    rawEqual: expected === actual,
    difference: classifyDifference(expected, actual),
    firstDifferenceAt: firstDifference(expected, actual),
  };
}

export function describe(expected, actual, rule = 'text.exact.v1') {
  const r = evaluate(rule, expected, actual);
  const lines = [
    `kural: ${rule} → ${r.status}${r.status === 'passed' && !r.rawEqual ? ' (ham fark var)' : ''}`,
    `fark sınıfı: ${r.difference}  (ilk fark: ${r.firstDifferenceAt} . kod noktası)`,
    `beklenen: "${escaped(expected)}"`,
    `okunan:   "${escaped(actual)}"`,
    `beklenen kod noktaları: ${codePoints(expected).join(' ')}`,
    `okunan kod noktaları:   ${codePoints(actual).join(' ')}`,
    `ölçüler beklenen: ${JSON.stringify(measures(expected))}`,
    `ölçüler okunan:   ${JSON.stringify(measures(actual))}`,
  ];
  return lines.join('\n');
}
