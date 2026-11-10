// Mevcut Playwright testine entegrasyon (§28: ilk sınıf kullanım).
//
//   import { test, expectTextPreserved } from 'human-data-lab/playwright/test';
//   test('profil adı korunur', async ({ humanData }) => {
//     const r = await humanData.trial({ config, fixtureId: 'tr-i.dotted-capital.001', value: 'İpek' });
//     expect(r.violations, r.describe).toEqual([]);
//     expect(r.notRun, r.describe).toEqual([]);   // required kontrol çalışmadan "geçti" denmez
//   });
//
// Kullanıcının mevcut browser'ı ve proje ayarları kullanılır; ayrı CLI auth/fixture düzeni kopyalatılmaz.
import { test as base, expect } from '@playwright/test';
import { PRESERVATION_RULES, describeDifference } from '../../core/src/index.ts';
import type { PreservationRuleId } from '../../core/src/index.ts';
import { loadCorpus } from '../../corpus/src/index.ts';
import { runSingleTrial } from './index.ts';
import type { SingleTrialResult } from './index.ts';
import type { RoundtripConfig } from './config.ts';

export interface HumanDataFixture {
  trial(p: { config: RoundtripConfig; fixtureId: string; value: string }): Promise<SingleTrialResult>;
  corpus: typeof loadCorpus;
}

export const test = base.extend<{ humanData: HumanDataFixture }>({
  humanData: async ({ browser }, use, testInfo) => {
    await use({
      trial: (p) => runSingleTrial({ ...p, browser, artifactsDir: testInfo.outputPath('human-data-lab') }),
      corpus: loadCorpus,
    });
  },
});

/**
 * Kendi doldur/kaydet/yeniden-aç adımlarını yazan testler için kural kontrolü.
 * Başarısızlıkta kod noktası düzeyinde açıklama verir. Örtük trim/case-fold/NFKC yok.
 */
export function expectTextPreserved(expected: string, actual: string | null | undefined, opts: { rule?: PreservationRuleId; label?: string } = {}) {
  const rule = opts.rule ?? 'text.exact.v1';
  if (actual === null || actual === undefined) throw new Error(`Okuma alınamadı${opts.label ? ` [${opts.label}]` : ''}: korunma değerlendirilmedi (boş dizgi varsayılmaz).`);
  const ok = PRESERVATION_RULES[rule](expected, actual);
  expect(ok, `Metin korunmadı${opts.label ? ` [${opts.label}]` : ''}\n${describeDifference(expected, actual, rule)}`).toBe(true);
}

export { expect };
