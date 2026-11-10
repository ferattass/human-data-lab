// Koşu özeti ve çıkış kodu (§28). Exit code JSON'daki ayrıntının yerine geçmez; yalnız özetler.
import type { CleanupStatus, ExitCode, RunSummary, TrialResult } from './types.ts';

export function summarize(params: {
  selected: number;
  outOfScope: Array<{ fixtureId: string; reason: string }>;
  trials: TrialResult[];
  findings: number;
}): RunSummary {
  const { trials } = params;
  const cleanup: Record<CleanupStatus, number> = { verified: 0, failed: 0, pending: 0, 'not-needed': 0 };
  for (const t of trials) cleanup[t.cleanup]++;
  const required = trials.flatMap((t) => t.assertions.filter((a) => a.required));
  return {
    selected: params.selected,
    applicable: params.selected - params.outOfScope.length,
    outOfScope: params.outOfScope,
    executed: trials.length,
    // Yalnız required korunma kontrolü sayılır: tanısal (opsiyonel) kontrolün geçmesi "korunma kontrolü çalıştı" demek değildir.
    preservationChecked: trials.filter((t) => t.assertions.some((a) => a.id !== 'acceptance' && a.required && (a.status === 'passed' || a.status === 'failed'))).length,
    accepted: trials.filter((t) => t.applicationOutcome === 'accepted').length,
    rejected: trials.filter((t) => t.applicationOutcome === 'rejected').length,
    indeterminate: trials.filter((t) => t.applicationOutcome === 'indeterminate').length,
    executionErrors: trials.filter((t) => t.execution !== 'completed').length,
    requiredFailed: required.filter((a) => a.status === 'failed').length,
    requiredNotRun: required.filter((a) => a.status === 'not-run' || a.status === 'indeterminate').length,
    cleanup,
    findings: params.findings,
  };
}

export interface ExitInputs {
  cancelled: boolean;
  summary: RunSummary;
  /** Yapılandırma hatası, eksik kanıt, tamamlanmamış manifest gibi koşu düzeyi sorunlar. */
  runLevelProblems: string[];
}

/**
 * Öncelik 130 > 3 > 2 > 1 > 0 (§28).
 *  0  gerekli kontroller tamamlandı; ihlal veya çözümsüz durum yok
 *  1  en az bir required assertion ihlali
 *  2  yapılandırma, yürütme, eksik kanıt veya belirsiz sonuç (required not-run dahil, C14)
 *  3  cleanup doğrulanamadı
 *  130 kullanıcı iptali
 */
export function exitCode({ cancelled, summary: s, runLevelProblems }: ExitInputs): ExitCode {
  if (cancelled) return 130;
  if (s.cleanup.failed > 0 || s.cleanup.pending > 0) return 3;
  if (runLevelProblems.length || s.executionErrors > 0 || s.requiredNotRun > 0 || s.indeterminate > 0) return 2;
  if (s.executed === 0) return 2; // hiçbir şey yürütülmediyse "ihlal yok" denemez
  if (s.requiredFailed > 0) return 1;
  return 0;
}

export const EXIT_MEANING: Record<ExitCode, string> = {
  0: 'gerekli kontroller tamamlandı; ihlal veya çözümsüz durum yok',
  1: 'en az bir required assertion ihlali',
  2: 'yapılandırma, yürütme, eksik kanıt veya belirsiz sonuç',
  3: 'cleanup doğrulanamadı; sahipli veri için işlem gerekiyor',
  130: 'kullanıcı iptali; kısmi sonuç ve cleanup durumu JSON\'da',
};
