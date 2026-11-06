// Küçültme ve kararlılık için saf mantık (§25, §26). Yürütme playwright paketindedir.
import { graphemes } from './text.ts';
import type { FindingSignature, Reproducibility, TrialResult } from './types.ts';

/**
 * Bir denemenin ihlal imzası. İhlal yoksa null.
 * Kabul edilmiş veri bozulması ile validation reddi farklı imzalardır (C04): applicationOutcome imzanın parçasıdır.
 */
export function signatureOf(t: TrialResult, adapterId: string, fieldId: string): FindingSignature | null {
  if (t.execution !== 'completed') return null;
  const failed = t.assertions.find((a) => a.required && a.status === 'failed');
  if (!failed) return null;
  return {
    adapterId,
    fieldId,
    boundary: failed.boundary ?? ['authored', 'authored'],
    ruleId: failed.rule,
    applicationOutcome: t.applicationOutcome,
    differenceClass: failed.difference ?? 'n/a',
  };
}

export const sameSignature = (a: FindingSignature | null, b: FindingSignature | null) =>
  !!a && !!b && a.adapterId === b.adapterId && a.fieldId === b.fieldId && a.ruleId === b.ruleId &&
  a.boundary[0] === b.boundary[0] && a.boundary[1] === b.boundary[1] &&
  a.applicationOutcome === b.applicationOutcome && a.differenceClass === b.differenceClass;

/**
 * Bağımsız tekrarların durumu. Her tekrar saklanır; seçilerek raporlanmaz (§23, C03).
 *  stable       hepsi aynı imza
 *  unstable     bazıları aynı imza, bazıları ihlalsiz/farklı imza
 *  inconclusive yürütme hatası veya belirsizlik yüzünden karar verilemiyor
 */
export function classifyReproducibility(original: FindingSignature, repeats: TrialResult[], adapterId: string, fieldId: string): Reproducibility {
  if (!repeats.length) return 'not-checked';
  const unusable = repeats.filter((r) => r.execution !== 'completed' || r.applicationOutcome === 'indeterminate');
  const same = repeats.filter((r) => sameSignature(original, signatureOf(r, adapterId, fieldId)));
  if (same.length === repeats.length) return 'stable';
  if (unusable.length && same.length + unusable.length === repeats.length) return 'inconclusive';
  return 'unstable';
}

export interface Reduction { value: string; strategy: 'grapheme-half' | 'grapheme-delete' | 'codepoint-delete' }

/**
 * Aday üretici. Önce grafem kümelerini koruyan silmeler (yarılar, tek grafem silme),
 * sonra isteğe bağlı kod noktası silme. Aynı aday iki kez, boş dizgi ve orijinalin kendisi üretilmez.
 */
export function* reductions(value: string, { codePoints = true } = {}): Generator<Reduction> {
  const seen = new Set<string>([value, '']);
  const emit = function* (v: string, strategy: Reduction['strategy']) {
    if (!seen.has(v)) { seen.add(v); yield { value: v, strategy }; }
  };
  const g = graphemes(value);
  if (g.length > 1) {
    const mid = Math.ceil(g.length / 2);
    yield* emit(g.slice(0, mid).join(''), 'grapheme-half');
    yield* emit(g.slice(mid).join(''), 'grapheme-half');
    for (let i = 0; i < g.length; i++) yield* emit([...g.slice(0, i), ...g.slice(i + 1)].join(''), 'grapheme-delete');
  }
  if (codePoints) {
    const cp = [...value];
    if (cp.length > 1) for (let i = 0; i < cp.length; i++) yield* emit([...cp.slice(0, i), ...cp.slice(i + 1)].join(''), 'codepoint-delete');
  }
}
