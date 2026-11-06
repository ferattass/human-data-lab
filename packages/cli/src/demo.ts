// hdl demo — üç demo, üç farklı ders (§35). Gerçek motor çalışır; hatalar bilerek eklenmiştir ve öyle etiketlenir.
import { relative, join } from 'node:path';
import { startDemo } from '../../../examples/profile-demo/server.ts';
import { profileDemoAdapter } from '../../../examples/profile-demo/adapter.ts';
import { displayNameContract } from '../../../examples/profile-demo/contract.ts';
import { runRoundtrip } from '../../playwright/src/index.ts';
import type { ExitCode } from '../../core/src/index.ts';

interface Scenario { id: string; title: string; lesson: string; bugs: string[]; set: string; rule: 'text.exact.v1' | 'text.nfc.v1'; expectExit: ExitCode; shrink: boolean }

const SCENARIOS: Scenario[] = [
  { id: 'ok', title: 'Doğru mod', lesson: 'Smoke corpus (24 fixture) aynen korunur; teknik kontrol girdisi doğru reddedilir.', bugs: [], set: 'smoke', rule: 'text.exact.v1', expectExit: 0, shrink: false },
  { id: 'a', title: 'A / Başarı mesajının arkasındaki kayıp', lesson: 'Sunucu birleşik işaretleri atar; "Kaydedildi" görünür, taze okuma farklıdır. Rapor kök neden uydurmaz, ilk gözlenen sapmayı gösterir.', bugs: ['strip-marks'], set: 'demo-a', rule: 'text.exact.v1', expectExit: 1, shrink: true },
  { id: 'b', title: 'B / Farklı kod noktası, izinli eşdeğerlik', lesson: 'Sunucu NFC uygular. Açık NFC politikası geçer; tanısal exact kontrolü ham farkı görünür tutar. Araç her farkı hata ilan etmez.', bugs: ['nfc'], set: 'demo-b', rule: 'text.nfc.v1', expectExit: 0, shrink: false },
  { id: 'c', title: 'C / Red, ihlal ve yürütme engeli', lesson: 'Teknik kontrol girdisi doğru reddedilir (korunma başarısı sayılmaz); üçüncü denemede oturum geçersizdir: yürütme engeli, "Unicode bozuldu" değil.', bugs: ['session-expire:2'], set: 'demo-c', rule: 'text.exact.v1', expectExit: 2, shrink: false },
];

export async function runDemo({ out }: { out: string }): Promise<ExitCode> {
  console.log('Human Data Lab demo — SENTETİK: hatalar demo uygulamasına bilerek eklenmiştir; dış projede doğrulanmış bulgu değildir.\n');
  const rows: string[] = [];
  let allAsExpected = true;
  for (const s of SCENARIOS) {
    const d = await startDemo({ bugs: s.bugs });
    try {
      console.log(`── ${s.title}  [${d.build}]\n   ${s.lesson}`);
      const r = await runRoundtrip({
        config: {
          target: { name: 'profile-demo', baseURL: d.url }, allowedOrigins: [d.url], syntheticDemo: true,
          adapter: profileDemoAdapter({ testToken: d.token, ...d.credentials }),
          contract: displayNameContract({ rule: s.rule }), corpus: { set: s.set },
        },
        artifactsDir: join(out, s.id), shrink: s.shrink, log: (l) => console.log('   ' + l),
      });
      const ok = r.exitCode === s.expectExit;
      allAsExpected &&= ok;
      rows.push(`${ok ? '✓' : '✗'} ${s.title.padEnd(44)} exit ${r.exitCode} (beklenen ${s.expectExit}) · rapor ${relative(process.cwd(), join(r.runDir, 'report.html'))}`);
      console.log('');
    } finally { await d.close(); }
  }
  console.log(rows.join('\n'));
  console.log(allAsExpected ? '\nDört senaryo da beklenen sonucu verdi.' : '\nEn az bir senaryo beklenenden farklı sonuçlandı — motor veya demo ayarı incelenmeli.');
  return allAsExpected ? 0 : 1;
}
