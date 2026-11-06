// Gözlemlerden assertion üretimi (§12, §13). Kabul ve korunma iki ayrı assertion'dır.
import { PRESERVATION_RULES } from './comparators.ts';
import { classifyDifference, firstDifference } from './text.ts';
import type {
  ApplicationOutcome, AssertionResult, Boundary, Execution, Fixture, FlowContract, Observations,
} from './types.ts';

export type ResolvedExpectation =
  | { kind: 'in-scope'; expect: 'must-accept' | 'must-reject'; source: string }
  | { kind: 'out-of-scope'; reason: string };

/**
 * Fixture'a hangi kabul beklentisinin uygulanacağını AKIŞ SÖZLEŞMESİ belirler (§16).
 * Fixture'ın defaultExpectation'ı ancak sözleşme o fixture'ı bir aileyle bağladığında ve
 * defaultExpectation "unspecified" değilse ipucu olarak kayda geçer; asla tek başına politika olmaz.
 */
export function resolveExpectation(contract: FlowContract, fixture: Fixture): ResolvedExpectation {
  if (!fixture.applicableControls.includes(contract.field.control))
    return { kind: 'out-of-scope', reason: `kontrol türü uygun değil (${contract.field.control})` };
  if (fixture.inputMethod !== contract.inputMethod)
    return { kind: 'out-of-scope', reason: `giriş yöntemi uygun değil (${fixture.inputMethod})` };
  const direct = contract.fixtureExpectations?.[fixture.id];
  if (direct) return { kind: 'in-scope', expect: direct, source: `fixtureExpectations.${fixture.id}` };
  for (const [i, b] of contract.expectations.entries()) {
    if (b.properties === '*' || b.properties.some((p) => fixture.properties.includes(p)))
      return { kind: 'in-scope', expect: b.expect, source: `expectations[${i}]` };
  }
  return { kind: 'out-of-scope', reason: 'sözleşme bu fixture ailesi için kabul beklentisi bağlamıyor' };
}

export interface EvaluateInput {
  contract: FlowContract;
  expectation: 'must-accept' | 'must-reject';
  execution: Execution;
  applicationOutcome: ApplicationOutcome;
  observations: Observations;
  attemptId: string;
}

const ORDER: Boundary[] = ['authored', 'injected', 'submitted', 'readback'];

export function evaluateTrial(input: EvaluateInput): AssertionResult[] {
  const { contract, expectation, applicationOutcome: outcome, observations: obs, attemptId } = input;
  const out: AssertionResult[] = [];

  // --- Kabul assertion'ı (her zaman required) ---
  const accRule = expectation === 'must-accept' ? 'acceptance.must-accept.v1' : 'acceptance.must-reject.v1';
  const want = expectation === 'must-accept' ? 'accepted' : 'rejected';
  out.push({
    id: 'acceptance',
    rule: accRule,
    required: true,
    status: outcome === 'indeterminate' ? (input.execution === 'completed' ? 'indeterminate' : 'not-run')
      : outcome === want ? 'passed' : 'failed',
    reason: outcome === 'indeterminate' ? 'uygulamanın kabul/red kararı kanıtlanamadı' : undefined,
  });

  // --- Korunma assertion'ları ---
  for (const check of contract.preservation) {
    const base: AssertionResult = {
      id: check.id, rule: check.rule, required: check.required, boundary: check.boundary,
      expectedRef: `observations/${attemptId}.json#${check.boundary[0]}`,
      actualRef: `observations/${attemptId}.json#${check.boundary[1]}`,
      status: 'not-run',
    };
    if (expectation === 'must-reject') {
      // A09: beklenen red doğru görülse bile bu korunma başarısı değildir.
      out.push({ ...base, required: false, reason: 'uygulanamaz: bu fixture için red bekleniyor' });
      continue;
    }
    if (outcome !== 'accepted') {
      // A08: kabul edilmeyen değerde korunma değerlendirilmez.
      out.push({ ...base, reason: outcome === 'rejected' ? 'kayıt reddedildi; korunma değerlendirilmedi' : 'kabul kanıtlanamadı' });
      continue;
    }
    const [from, to] = check.boundary;
    const a = obs[from];
    const b = obs[to];
    // Not: .find() burada kullanılamaz — eksik gözlem `undefined` olduğunda find da undefined döner ve eksiklik gizlenir.
    const unusable = (o: typeof a) => !o || o.status !== 'observed' || typeof o.value !== 'string';
    if (unusable(a) || unusable(b)) {
      // A11: gözlenmeyen değer yerine boş dizgi ÜRETİLMEZ.
      const which = !a || a.status !== 'observed' || typeof a.value !== 'string' ? from : to;
      out.push({ ...base, reason: `${which} gözlemi yok (${obs[which]?.status ?? 'kayıt yok'}${obs[which]?.note ? ': ' + obs[which]!.note : ''})` });
      continue;
    }
    const expected = a!.value!;
    const actual = b!.value!;
    const passed = PRESERVATION_RULES[check.rule](expected, actual);
    out.push({
      ...base,
      status: passed ? 'passed' : 'failed',
      rawEqual: expected === actual,
      difference: classifyDifference(expected, actual),
      firstDifferenceAt: firstDifference(expected, actual),
    });
  }
  return out;
}

/**
 * Gözlem sınırları içinde farkın ilk görüldüğü aşama (§11). Kök neden DEĞİLDİR.
 * Gözlenmeyen aşamalar atlanır ve listelenir; karşılaştırma başlangıcı sessizce ileri taşınmaz.
 */
export function firstObservedDivergence(obs: Observations): { at: Boundary | null; from: Boundary | null; unobserved: Boundary[] } {
  const unobserved: Boundary[] = [];
  let prev: { b: Boundary; v: string } | null = null;
  for (const b of ORDER) {
    const o = obs[b];
    if (!o || o.status !== 'observed' || typeof o.value !== 'string') { unobserved.push(b); continue; }
    if (prev && prev.v !== o.value) return { at: b, from: prev.b, unobserved };
    prev = { b, v: o.value };
  }
  return { at: null, from: null, unobserved };
}
