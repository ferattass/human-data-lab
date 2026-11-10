// @human-data-lab/playwright — adapter bağlama + deneme yaşam döngüsü.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { SCHEMA_VERSION, describeDifference } from '../../core/src/index.ts';
import type { AssertionResult, Fixture, TrialResult } from '../../core/src/index.ts';
import { readCorpusFile } from '../../corpus/src/index.ts';
import { runRoundtrip } from './runner.ts';
import type { RoundtripConfig } from './config.ts';

export * from './adapter.ts';
export * from './config.ts';
export { runRoundtrip, TOOL, redactMessage, guardedRequestContext, raceSignal } from './runner.ts';
export type { RunOptions, RunOutcome } from './runner.ts';

export interface SingleTrialResult {
  execution: TrialResult['execution'];
  applicationOutcome: TrialResult['applicationOutcome'];
  violations: AssertionResult[];
  notRun: AssertionResult[];
  trial: TrialResult;
  runDir: string;
  describe: string;
}

/** Corpus'ta varsa fixture'ı, yoksa satır içi sentetik fixture'ı döndürür. Değer her zaman verilen somut değerdir (C01). */
function fixtureFor(fixtureId: string, value: string, file?: string): Fixture {
  try {
    const f = readCorpusFile(file).fixtures.find((x) => x.id === fixtureId);
    if (f) return f;
  } catch { /* corpus yoksa satır içi */ }
  return {
    schemaVersion: SCHEMA_VERSION, id: fixtureId, value, properties: ['inline'], applicableControls: ['input-text', 'textarea'],
    inputMethod: 'fill', defaultExpectation: 'unspecified', provenance: { kind: 'synthetic', license: 'Apache-2.0' },
  };
}

/**
 * Tek fixture'ı tam yaşam döngüsüyle çalıştırır (prepare → … → cleanup). Mevcut Playwright testi ve repro spec'leri için.
 * Tekrar ve küçültme yapılmaz; kanıt geçici koşu dizinine yazılır.
 */
export async function runSingleTrial(p: { config: RoundtripConfig; browser?: Browser; fixtureId: string; value: string; artifactsDir?: string }): Promise<SingleTrialResult> {
  const fixture = fixtureFor(p.fixtureId, p.value, p.config.corpus?.file);
  const out = await runRoundtrip({
    config: p.config, browser: p.browser, fixtures: [{ fixture, value: p.value, origin: 'inline' }],
    artifactsDir: p.artifactsDir ?? mkdtempSync(join(tmpdir(), 'hdl-single-')), reproduce: false, shrink: false,
  });
  const trial = out.trials[0];
  if (!trial) {
    return {
      execution: 'error', applicationOutcome: 'indeterminate', violations: [], notRun: [], trial: undefined as never, runDir: out.runDir,
      describe: `deneme yürütülmedi: ${out.manifest.problems.join('; ') || 'fixture bu sözleşmenin kapsamı dışında'}`,
    };
  }
  const violations = trial.assertions.filter((a) => a.required && a.status === 'failed');
  const notRun = trial.assertions.filter((a) => a.required && (a.status === 'not-run' || a.status === 'indeterminate'));
  const lines = [`koşu: ${out.runDir}`, `execution=${trial.execution} applicationOutcome=${trial.applicationOutcome} cleanup=${trial.cleanup}`];
  for (const e of trial.errors) lines.push(`hata [${e.class}/${e.phase}]: ${e.message}`);
  for (const a of trial.assertions) {
    lines.push(`- ${a.id} (${a.rule}) ${a.status}${a.reason ? ' — ' + a.reason : ''}`);
    if (a.status === 'failed' && a.boundary) {
      const exp = trial.observations[a.boundary[0]]?.value;
      const act = trial.observations[a.boundary[1]]?.value;
      if (typeof exp === 'string' && typeof act === 'string') lines.push(describeDifference(exp, act, a.rule).replace(/^/gm, '    '));
    }
  }
  return { execution: trial.execution, applicationOutcome: trial.applicationOutcome, violations, notRun, trial, runDir: out.runDir, describe: lines.join('\n') };
}
