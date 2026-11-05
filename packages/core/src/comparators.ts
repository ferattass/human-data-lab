// Yerleşik karşılaştırıcılar (§13). Küçük ve kapalı set: dışarıdan gelen kod çalıştırılmaz.
import type { PreservationRuleId, RuleId } from './types.ts';

export const PRESERVATION_RULES: Record<PreservationRuleId, (expected: string, actual: string) => boolean> = {
  // JS dizgisi tam eşit. Örtük trim / case-fold / NFC / NFKC yok.
  'text.exact.v1': (e, a) => e === a,
  // Yalnız kanonik eşdeğerlik (NFC). NFKC uyumluluk eşdeğerliği BURADA DEĞİL (A05).
  'text.nfc.v1': (e, a) => e.normalize('NFC') === a.normalize('NFC'),
};

export const KNOWN_RULES: readonly RuleId[] = [
  'acceptance.must-accept.v1',
  'acceptance.must-reject.v1',
  'text.exact.v1',
  'text.nfc.v1',
];

export const isKnownRule = (r: string): r is RuleId => (KNOWN_RULES as readonly string[]).includes(r);
export const isPreservationRule = (r: string): r is PreservationRuleId => r in PRESERVATION_RULES;
