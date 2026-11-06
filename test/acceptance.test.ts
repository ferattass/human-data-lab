// Kabul matrisleri B (yürütme) ve C (kanıt/replay) + A14'ün runner tarafı — gerçek Chromium, demo uygulaması (§33, §34).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, readdirSync, symlinkSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser } from '@playwright/test';
import { browser, closeBrowser, config, fixture, inline, run, tmp, withDemo } from './helpers.ts';
import { runRoundtrip, ScopeError } from '../packages/playwright/src/index.ts';
import type { RoundtripAdapter } from '../packages/playwright/src/index.ts';
import { readRun, planShare, writeShare, copyTree, safeResolve, ArtifactError } from '../packages/store/src/index.ts';
import { renderReport } from '../packages/reporter/src/index.ts';
import { main } from '../packages/cli/src/main.ts';
import { displayNameContract } from '../examples/profile-demo/contract.ts';

after(closeBrowser);

const req = (t: { assertions: Array<{ id: string; status: string }> }) => t.assertions.find((a) => a.id === 'display-name-preserved')!;
const byId = (t: { assertions: Array<{ id: string; status: string }> }, id: string) => t.assertions.find((a) => a.id === id)!;
const observationsFile = (runDir: string, attemptId: string) => JSON.parse(readFileSync(join(runDir, 'observations', `${attemptId}.json`), 'utf8'));
const testApi = async (d: { url: string; token: string }, path: string, body: unknown) => {
  const r = await fetch(d.url + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-token': d.token }, body: JSON.stringify(body) });
  return r.json();
};
const wrap = (base: RoundtripAdapter, over: Partial<RoundtripAdapter>): RoundtripAdapter => ({ ...base, ...over });

// ---------------- A14 (runner) ----------------

test('A14 bilinmeyen comparator → preflight açık hata; tarayıcı mutasyonu yok', async () => {
  await withDemo([], async (d) => {
    const cfg = config(d);
    (cfg.contract.preservation[0] as { rule: string }).rule = 'text.lowercase.v1';
    let touched = false;
    const trap = new Proxy({}, { get() { touched = true; throw new Error('tarayıcıya dokunuldu'); } }) as Browser;
    const r = await runRoundtrip({ config: cfg, browser: trap, artifactsDir: tmp(), fixtures: [{ fixture: fixture('latin.basic.001'), origin: 'inline' }] });
    assert.equal(r.exitCode, 2);
    assert.equal(touched, false, 'şema hatasında browser kullanılmaz');
    assert.equal(r.trials.length, 0);
    assert.equal(d.stats.creates, 0, 'uygulamada kayıt yaratılmadı');
    assert.match(r.manifest.problems.join(' '), /bilinmeyen karşılaştırıcı/);
    assert.equal(r.manifest.status, 'incomplete');
  });
});

// ---------------- B: yürütme ----------------

test('B01 yazarken sanitizer değeri değiştiriyor → authored → injected farkı açık', async () => {
  await withDemo(['client-sanitize'], async (d) => {
    const r = await run(config(d), [fixture('tr-i.dotted-capital.002')]);
    const t = r.trials[0];
    assert.equal(byId(t, 'input-preserved').status, 'failed');
    assert.equal(req(t).status, 'failed');
    const o = observationsFile(r.runDir, t.identity.attemptId);
    assert.equal(o.firstObservedDivergence.at, 'injected');
    assert.notEqual(o.injected.value, o.authored.value);
  });
});

test('B02 istek serializer değeri değiştiriyor; submitted gözlemi bağlı → injected → submitted farkı açık', async () => {
  await withDemo(['serializer'], async (d) => {
    const r = await run(config(d), [fixture('space.leading-trailing.001')]);
    const t = r.trials[0];
    assert.equal(byId(t, 'input-preserved').status, 'passed');
    assert.equal(byId(t, 'submit-preserved').status, 'failed');
    assert.equal(t.observations.submitted?.source, 'request-body');
    assert.equal(observationsFile(r.runDir, t.identity.attemptId).firstObservedDivergence.at, 'submitted');
  });
});

test('B03 aynı ada sahip iki kayıt var → recordId ile doğru kayıt okunur', async () => {
  await withDemo([], async (d) => {
    await testApi(d, '/__test/namespaces', { namespace: 'other-tenant' });
    const pre = await testApi(d, '/__test/records', { namespace: 'other-tenant', displayName: 'Ayse Kaya' });
    const r = await run(config(d), [fixture('latin.basic.001')]);
    const t = r.trials[0];
    assert.equal(req(t).status, 'passed');
    assert.notEqual(t.acceptanceEvidence?.recordId, pre.id, 'önceden var olan aynı adlı kayıt okunmadı');
    // Adapter yanlış kaydı okursa: korunma değerlendirilmez, gözlem hatası kaydedilir.
    const cfg = config(d);
    const base = cfg.adapter;
    cfg.adapter = wrap(base, { readFresh: async (ctx, own, id) => ({ ...(await base.readFresh(ctx, own, id)), recordIdSeen: pre.id }) });
    const r2 = await run(cfg, [fixture('latin.basic.001')]);
    assert.equal(req(r2.trials[0]).status, 'not-run');
    assert.equal(r2.trials[0].errors[0].class, 'observation');
    assert.equal(r2.exitCode, 2);
  });
});

test('B04 hedef alan iki locator ile eşleşiyor → rastgele ilkini seçme; adapter error', async () => {
  await withDemo(['ambiguous-label'], async (d) => {
    const r = await run(config(d), [fixture('latin.basic.001')]);
    const t = r.trials[0];
    assert.equal(t.execution, 'error');
    assert.equal(t.errors[0].class, 'adapter');
    assert.match(t.errors[0].message, /2 eşleşme/);
    assert.equal(d.stats.creates, 0, 'alan seçilemeyince gönderim yapılmadı');
    assert.ok(!t.assertions.some((a) => a.status === 'failed'), 'yürütme hatası veri ihlali sayılmaz');
  });
});

test('B05 başarı toast\'ı var, kimlik/readback yok → korunma passed değil; belirsiz', async () => {
  await withDemo(['toast-no-id'], async (d) => {
    const r = await run(config(d), [fixture('latin.basic.001')]);
    const t = r.trials[0];
    assert.equal(t.applicationOutcome, 'indeterminate');
    assert.equal(req(t).status, 'not-run');
    assert.equal(byId(t, 'acceptance').status, 'indeterminate');
    assert.equal(r.exitCode, 2);
  });
});

test('B06 SPA eski input değerini gösteriyor → fresh read şartı sağlanır, bozulma görünür', async () => {
  await withDemo(['stale-spa'], async (d) => {
    const r = await run(config(d), [fixture('tr-i.dotted-capital.002')]);
    const t = r.trials[0];
    assert.equal(t.observations.readback?.source, 'ui-detail');
    assert.equal(req(t).status, 'failed', 'yeni context + kayıt kimliği ile okunan değer bellekteki değer değildir');
    assert.equal(t.observations.readback?.value, 'Ipek Caglar');
  });
});

test('B07 oturum düşüyor / login yönlendirmesi → önkoşul/yürütme engeli; ihlal uydurma', async () => {
  await withDemo(['session-expire:0'], async (d) => {
    const r = await run(config(d), [fixture('latin.basic.001')]);
    const t = r.trials[0];
    assert.equal(t.execution, 'error');
    assert.equal(t.errors[0].class, 'target');
    assert.match(t.errors[0].message, /oturum geçersiz/);
    assert.ok(!t.assertions.some((a) => a.status === 'failed'));
    assert.equal(r.exitCode, 2);
  });
});

test('B08 POST sonrası bağlantı kesiliyor → sonuç belirsiz; otomatik tekrar submit yok', async () => {
  await withDemo(['drop-connection'], async (d) => {
    const r = await run(config(d), [fixture('latin.basic.001')]);
    const t = r.trials[0];
    assert.equal(t.applicationOutcome, 'indeterminate');
    assert.match(t.acceptanceEvidence?.reason ?? '', /tekrar gönderilmedi/);
    assert.equal(d.stats.creates, 1, 'tek istek, tek kayıt');
    assert.equal(t.cleanup, 'verified', 'bağlantı kopsa da yaratılmış olabilecek kayıt namespace üzerinden temizlendi');
    assert.equal(d.state.records.size, 0);
  });
});

test('B09 aynı endpoint\'e başka POST gidiyor → owned request korelasyonu doğru', async () => {
  await withDemo(['extra-post'], async (d) => {
    const r = await run(config(d), [fixture('tr-i.dotted-capital.002')]);
    const t = r.trials[0];
    assert.equal(t.observations.submitted?.value, fixture('tr-i.dotted-capital.002').value);
    assert.equal(req(t).status, 'passed');
    assert.equal(r.exitCode, 0);
  });
});

test('B10 prepare yarıda kaynak yaratıp çöküyor → allocation log ile sahipli cleanup mümkün', async () => {
  await withDemo(['prepare-crash'], async (d) => {
    const r = await run(config(d), [fixture('latin.basic.001')]);
    const t = r.trials[0];
    assert.equal(t.execution, 'error');
    assert.equal(t.errors[0].phase, 'prepare');
    assert.equal(t.cleanup, 'verified');
    assert.equal(d.state.records.size, 0, 'yarım kalan seed kaydı temizlendi');
    const log = readFileSync(join(r.runDir, 'allocations.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(log[0].event, 'reserve', 'rezervasyon ilk mutasyondan önce yazıldı');
    assert.equal(log.at(-1).event, 'cleanup');
  });
});

test('B11 koşu iptal ediliyor → ayrı timeout ile cleanup denenir', async () => {
  await withDemo([], async (d) => {
    const ac = new AbortController();
    const cfg = config(d);
    const base = cfg.adapter;
    cfg.adapter = wrap(base, { create: async (ctx, own, v) => { ac.abort(new Error('kullanıcı iptali')); return base.create(ctx, own, v); } });
    const r = await run(cfg, [fixture('latin.basic.001'), fixture('tr-i.dotted-capital.002')], { signal: ac.signal });
    assert.equal(r.exitCode, 130);
    assert.equal(r.trials.length, 1, 'iptalden sonra yeni deneme başlamadı');
    assert.equal(r.trials[0].execution, 'cancelled');
    assert.equal(r.trials[0].cleanup, 'verified', 'iptal edilmiş signal cleanup\'ı iptal etmedi');
    assert.equal(r.manifest.status, 'incomplete');
    assert.equal(r.manifest.cancelled, true);
  });
});

test('B12 cleanup başarısız veya iş kuyruğu bekliyor → pending/failed; küçültme durur', async () => {
  await withDemo(['cleanup-fails'], async (d) => {
    const r = await run(config(d), [fixture('latin.basic.001')]);
    assert.equal(r.trials[0].cleanup, 'failed');
    assert.equal(r.exitCode, 3);
  });
  await withDemo(['background-rewrite', 'strip-marks'], async (d) => {
    const r = await run(config(d), [fixture('tr-i.dotted-capital.002')], { reproduce: true, shrink: true });
    assert.equal(r.trials[0].cleanup, 'pending');
    assert.equal(r.exitCode, 3);
    const f = r.findings[0];
    assert.equal(f.reproducibility, 'not-checked', 'kirli ortamda tekrar yapılmaz');
    assert.equal(f.shrink?.status, 'not-attempted');
    assert.equal(r.trials.length, 1, 'yeni deneme başlatılmadı');
  });
});

test('B13 yeni context, eski backend kaydı mevcut → browser izolasyonu yeterli sayılmaz', async () => {
  await withDemo([], async (d) => {
    await testApi(d, '/__test/namespaces', { namespace: 'hdl-fixed' });
    await testApi(d, '/__test/records', { namespace: 'hdl-fixed', displayName: 'eski kayıt' });
    const r = await run(config(d, { adapter: { fixedNamespace: 'hdl-fixed' } }), [fixture('latin.basic.001')]);
    const t = r.trials[0];
    assert.equal(t.execution, 'error');
    assert.equal(t.errors[0].phase, 'prepare');
    assert.match(t.errors[0].message, /temiz değil/);
    assert.equal(d.stats.creates, 0);
  });
});

test('B14 yanlış origin\'e yönlendirme var → mutasyon durdurulur; kapsam hatası', async () => {
  await withDemo(['redirect-foreign'], async (d) => {
    const r = await run(config(d), [fixture('latin.basic.001'), fixture('tr-i.dotted-capital.002')]);
    assert.equal(r.trials.length, 1, 'kapsam hatasından sonra koşu durdu');
    assert.equal(r.trials[0].errors[0].class, 'configuration');
    assert.match(r.trials[0].errors[0].message, /izinli olmayan origin/);
    assert.equal(r.manifest.status, 'incomplete');
    assert.equal(r.exitCode, 2);
    assert.equal(d.stats.creates, 1);
  });
  // Korumalı API istemcisi de izinli olmayan origin'e istek atmaz.
  await withDemo([], async (d) => {
    const cfg = config(d);
    const base = cfg.adapter;
    let caught: unknown;
    cfg.adapter = wrap(base, { prepare: async (ctx) => { try { await (await ctx.request()).get('http://foreign.example.test/x'); } catch (e) { caught = e; } return base.prepare(ctx); } });
    await run(cfg, [fixture('latin.basic.001')]);
    assert.ok(caught instanceof ScopeError);
  });
});

// ---------------- C: kanıt ve replay ----------------

async function replayConfig(dir: string, d: { url: string; token: string }, rule = 'text.exact.v1') {
  const file = join(dir, `replay-${rule}.config.ts`);
  const href = (p: string) => pathToFileURL(resolve(p)).href;
  writeFileSync(file, `import { profileDemoAdapter } from '${href('examples/profile-demo/adapter.ts')}';
import { displayNameContract } from '${href('examples/profile-demo/contract.ts')}';
export default { target: { name: 'profile-demo', baseURL: '${d.url}' }, allowedOrigins: ['${d.url}'], syntheticDemo: true,
  adapter: profileDemoAdapter({ testToken: '${d.token}', user: 'demo', password: 'demo-password' }),
  contract: displayNameContract({ rule: '${rule}' }) };
`);
  return file;
}
const newestRun = (dir: string, exclude: string) => readdirSync(dir).filter((n) => n.startsWith('run-') && join(dir, n) !== exclude).map((n) => join(dir, n))[0];

test('C01 seed aynı, corpus sürümü farklı → replay somut saklı girdiyi kullanır', async () => {
  await withDemo(['strip-marks'], async (d) => {
    const out = tmp();
    // Corpus'ta bu kimliğin değeri "İpek Çağlar"; koşuda farklı somut değer kullanıldı (ör. eski corpus sürümü).
    const stored = '\u0130pek Z';
    const r = await run(config(d), [{ fixture: fixture('tr-i.dotted-capital.002'), value: stored }], { artifactsDir: out, reproduce: true });
    assert.equal(r.findings.length, 1);
    const cfg = await replayConfig(out, d);
    const code = await main(['replay', r.runDir, '--finding', 'f1', '--config', cfg, '--out', out]);
    assert.equal(code, 1, 'aynı hedefte ihlal yeniden üretildi');
    const rep = readRun(newestRun(out, r.runDir));
    assert.ok(rep.fixtures.length >= 1 && rep.fixtures.every((f) => f.value === stored), 'corpus değil saklı değer kullanıldı');
    assert.equal(rep.manifest?.replayOf?.findingId, 'f1');
    assert.deepEqual(rep.manifest?.replayOf?.mismatches, []);
  });
});

test('C02 oracle/flow digest değişmiş → eski koşu diye eşlenmez', async () => {
  await withDemo(['strip-marks'], async (d) => {
    const out = tmp();
    const r = await run(config(d), [fixture('tr-i.dotted-capital.002')], { artifactsDir: out });
    const cfg = await replayConfig(out, d, 'text.nfc.v1');
    await main(['replay', r.runDir, '--finding', 'f1', '--config', cfg, '--out', out]);
    const rep = readRun(newestRun(out, r.runDir));
    assert.ok(rep.manifest?.replayOf?.mismatches.some((m) => /digest/.test(m)), 'sözleşme değişikliği uyuşmazlık olarak işaretlendi');
    assert.match(renderReport(rep), /orijinal sürüm yeniden üretildi/);
    // Artifact'taki yapılandırma yolu kendiliğinden import edilmez.
    assert.equal(await main(['replay', r.runDir, '--finding', 'f1']), 2);
  });
});

test('C03 ilk tekrar fail, sonraki pass → bütün denemeler; unstable; shrink yok', async () => {
  await withDemo(['flaky-strip'], async (d) => {
    const r = await run(config(d), [fixture('tr-i.dotted-capital.002')], { reproduce: true, shrink: true });
    const f = r.findings[0];
    assert.equal(f.reproducibility, 'unstable');
    assert.equal(f.attemptsObserved, 3);
    assert.ok(f.attemptsReproduced >= 1 && f.attemptsReproduced < 3);
    assert.equal(f.shrink?.status, 'not-attempted');
    const lines = readFileSync(join(r.runDir, 'attempts.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 3, 'geçen tekrar da dahil bütün denemeler saklı');
  });
});

test('C04 shrink adayı validation reddine dönüşüyor → eski kabul+korunma ihlalinin yerine geçmez', async () => {
  await withDemo(['strip-marks', 'min-length:4'], async (d) => {
    const r = await run(config(d), [fixture('tr-i.dotted-capital.002')], { reproduce: true, shrink: true });
    const f = r.findings[0];
    assert.equal(f.signature.applicationOutcome, 'accepted');
    assert.ok([...f.shrink!.best.value].length >= 4, `en iyi aday reddedilen boyutun altına inmedi: ${JSON.stringify(f.shrink!.best.value)}`);
    const rejected = r.trials.filter((t) => t.identity.candidateId !== 'original' && t.applicationOutcome === 'rejected');
    assert.ok(rejected.length > 0, 'reddedilen adaylar denendi');
    assert.ok(rejected.every((t) => t.identity.candidateId !== f.shrink!.best.candidateId));
  });
});

test('C05 shrink bütçesi bitiyor → son doğrulanmış aday; incomplete arama', async () => {
  await withDemo(['strip-marks'], async (d) => {
    const r = await run(config(d, { budgets: { shrinkMaxTrials: 2 } }), [fixture('tr-i.dotted-capital.002')], { reproduce: true, shrink: true });
    const s = r.findings[0].shrink!;
    assert.equal(s.status, 'budget-exhausted');
    assert.equal(s.best.candidateId, 'original', 'doğrulanmamış aday teslim edilmez');
    assert.ok(s.trialsUsed <= 2);
  });
});

test('C06 orijinal bozuk, son aday kararsız → son aday kararlı diye yayımlanmaz', async () => {
  await withDemo(['strip-marks'], async (d) => {
    const cfg = config(d);
    const base = cfg.adapter;
    const original = fixture('tr-i.dotted-capital.002').value;
    let n = 0;
    // Adaylarda hata her denemede açılıp kapanır: ilk deneme aynı imzayı verir, onay denemesi vermez.
    cfg.adapter = wrap(base, { create: async (ctx, own, v) => {
      if (v === original) d.bugs.add('strip-marks');
      else if (n++ % 2 === 0) d.bugs.add('strip-marks'); else d.bugs.delete('strip-marks');
      return base.create(ctx, own, v);
    } });
    const r = await run(cfg, [fixture('tr-i.dotted-capital.002')], { reproduce: true, shrink: true });
    const f = r.findings[0];
    assert.equal(f.reproducibility, 'stable');
    assert.equal(f.shrink?.status, 'stopped-unstable');
    assert.equal(f.shrink?.best.candidateId, 'original');
  });
});

// Ortak, tamamlanmış bir koşu: C07–C13 için kanıt dosyalarını değiştirmeden önce kopyalanır.
let goodRun: string | undefined;
async function completedRun() {
  if (goodRun) return goodRun;
  await withDemo([], async (d) => {
    const r = await run(config(d), [
      fixture('latin.basic.001'),
      inline('inline.html.001', '<img src=x onerror="alert(1)"><script>alert(2)</script>'),
      fixture('space.zwsp.001'),
      fixture('newline.lf.001'),
    ]);
    assert.equal(r.manifest.status, 'complete');
    goodRun = r.runDir;
  });
  return goodRun!;
}
const copyRun = async () => { const dst = join(tmp(), 'run-copy'); copyTree(await completedRun(), dst); return dst; };

test('C07 herhangi bir kanıt dosyası eksik → manifestte incomplete / eksik kanıt', async () => {
  const dir = await copyRun();
  assert.equal(readRun(dir).complete, true);
  const obs = readdirSync(join(dir, 'observations'))[0];
  rmSync(join(dir, 'observations', obs));
  const run2 = readRun(dir);
  assert.equal(run2.complete, false);
  assert.ok(run2.problems.some((p) => p.includes(`observations/${obs}`)));
  writeFileSync(join(dir, 'contract.json'), '{"tampered":true}');
  assert.ok(readRun(dir).problems.some((p) => /digest uyuşmuyor: contract.json/.test(p)));
});

test('C08 rapor girdisi HTML veya script içeriyor → yalnız inert metin olarak gösterilir', async () => {
  const html = readFileSync(join(await completedRun(), 'report.html'), 'utf8');
  assert.ok(!/<script/i.test(html), 'raporda script etiketi yok');
  assert.ok(!html.includes('<img src=x'), 'veri HTML olarak yorumlanmadı');
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  assert.ok(!/https?:\/\/(?!www\.)[a-z]/i.test(html.replace(/http:\/\/127\.0\.0\.1:\d+/g, '')), 'uzak kaynak/CDN çağrısı yok');
});

test('C09 artifact yolu dizin dışına çıkıyor → okuma/yazma reddedilir', async () => {
  for (const bad of ['../x.json', '..\\x.json', 'a/../../x', '/etc/passwd', 'C:\\x', '']) assert.throws(() => safeResolve('/tmp/run-x', bad), ArtifactError, bad);
  assert.doesNotThrow(() => safeResolve('/tmp/run-x', 'observations/a.json'));
  const dir = await copyRun();
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  m.files['../../outside.txt'] = 'sha256:00';
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m));
  const r = readRun(dir);
  assert.ok(r.problems.some((p) => /dışına çıkıyor/.test(p)));
  assert.equal(r.complete, false);
});

test('C10 export paketi auth sırları içeriyor → varsayılan allowlist bu dosyayı dışlar', async () => {
  const dir = await copyRun();
  writeFileSync(join(dir, 'storage-state.json'), '{"cookies":[{"name":"sid","value":"secret"}]}');
  mkdirSync(join(dir, 'evidence'), { recursive: true });
  writeFileSync(join(dir, 'evidence', 'auth.json'), '{}');
  writeFileSync(join(dir, 'trace.zip'), 'x');
  const plan = planShare(dir);
  for (const f of ['storage-state.json', 'evidence/auth.json', 'trace.zip']) {
    assert.ok(!plan.included.includes(f), `${f} dahil edilmedi`);
    assert.ok(plan.excluded.some((e) => e.file === f));
  }
  assert.ok(plan.included.includes('manifest.json') && plan.included.includes('report.html'));
  // Gerçek kopya, ASCII dışı yolda (Node 24 / Windows'ta fs.cpSync burada sessizce 127 ile çöküyordu).
  const out = join(tmp(), 'paylaşım-İpek-ğış');
  const written = writeShare(dir, out);
  for (const f of written.included) assert.ok(existsSync(join(out, f)), `kopyalandı: ${f}`);
  for (const f of ['storage-state.json', 'evidence/auth.json', 'trace.zip']) assert.ok(!existsSync(join(out, f)), `${f} pakete girmedi`);
  assert.match(readFileSync(join(out, 'CONTENTS.txt'), 'utf8'), /Dışarıda bırakılan dosyalar/);

  // Koşu dizinindeki bağlantı, dışarıdaki bir sırrı paylaşım paketine taşıyamaz.
  const outside = tmp('hdl-secret-');
  writeFileSync(join(outside, 'id_rsa'), 'GIZLI-ANAHTAR');
  const dir2 = await copyRun();
  symlinkSync(outside, join(dir2, 'findings', 'linked-dir'), 'junction'); // yönetici yetkisi gerektirmez
  let fileLink = false;
  try { rmSync(join(dir2, 'report.html')); symlinkSync(join(outside, 'id_rsa'), join(dir2, 'report.html'), 'file'); fileLink = true; } catch { /* Windows: ayrıcalık yoksa yalnız junction sınanır */ }
  const plan2 = planShare(dir2);
  assert.ok(plan2.excluded.some((e) => e.file === 'findings/linked-dir' && /bağlantı/.test(e.reason)));
  if (fileLink) assert.ok(!plan2.included.includes('report.html') && plan2.excluded.some((e) => e.file === 'report.html'));
  const out2 = join(tmp(), 'paylaşım-2');
  writeShare(dir2, out2);
  const copied = readdirSync(out2, { recursive: true }).map(String);
  assert.ok(!copied.some((f) => f.includes('id_rsa')), 'dışarıdaki dosya kopyalanmadı');
  for (const f of copied) if (lstatSync(join(out2, f)).isFile()) assert.ok(!readFileSync(join(out2, f)).toString().includes('GIZLI-ANAHTAR'), f);
  // Koşu artifact'larında test token'ı ve parola geçmez.
  const all = ['contract.json', 'attempts.jsonl', 'manifest.json', 'report.html'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  assert.ok(!all.includes('demo-test-token') && !all.includes('demo-password'));
});

test('C11 tamamlanmamış koşu dizini açılıyor → başarılı bitiş veya tüm kontroller geçti yok', async () => {
  const dir = await copyRun();
  rmSync(join(dir, 'manifest.json'));
  const r = readRun(dir);
  assert.equal(r.complete, false);
  assert.match(r.problems[0], /manifest\.json yok/);
  assert.match(renderReport(r), /Bu koşu tamamlanmış değil/);
  assert.equal(await main(['report', dir, '--out', join(dir, 'regen.html')]), 2);
});

test('C12 uzun/görünmez metin kopyalanıyor → escaped ve raw kopya açık ayrılır', async () => {
  const html = readFileSync(join(await completedRun(), 'report.html'), 'utf8');
  assert.ok(html.includes('Ayse\\u200bKaya'), 'kaçışlı gösterim');
  assert.ok(html.includes('Ayse\u200bKaya'), 'ham değer de ayrıca mevcut');
  assert.match(html, /<span class="k">ham<\/span>/);
  assert.match(html, /<span class="k">kaçışlı<\/span>/);
});

test('C13 bilinen ama bu akışa uygulanamayan optional kontrol → gerekçeli kapsam dışı; required gizlenmez', async () => {
  const r = readRun(await completedRun());
  const s = r.manifest!.summary!;
  assert.equal(s.selected, 4);
  assert.equal(s.applicable, 3);
  assert.equal(s.outOfScope[0].fixtureId, 'newline.lf.001');
  assert.match(s.outOfScope[0].reason, /kontrol türü/);
  assert.equal(s.executed, 3);
  assert.equal(s.requiredNotRun, 0);
  assert.match(renderReport(r), /Kapsam dışı 1 fixture/);
});

// ---------------- readback politikaları (§21) ----------------

test('readback politikaları: stable-read ara örnekleri saklar; readiness-signal hazır sinyalini bekler', async () => {
  await withDemo([], async (d) => {
    const c1 = config(d);
    c1.contract.readback = { kind: 'stable-read', consecutive: 2, intervalMs: 50, budgetMs: 5000 };
    const r1 = await run(c1, [fixture('latin.basic.001')]);
    assert.equal(req(r1.trials[0]).status, 'passed');
    assert.ok((r1.trials[0].readbackSamples?.length ?? 0) >= 2);
    const c2 = config(d);
    c2.contract.readback = { kind: 'readiness-signal' };
    const r2 = await run(c2, [fixture('latin.basic.001')]);
    assert.equal(req(r2.trials[0]).status, 'passed');
  });
});

test('hdl run yapılandırma dosyasıyla uçtan uca + repro spec adapter bağımlılığını açık yazar', async () => {
  await withDemo(['strip-marks'], async (d) => {
    const out = tmp();
    const cfg = await replayConfig(out, d);
    const code = await main(['run', cfg, '--corpus', 'demo-a', '--out', out, '--no-shrink']);
    assert.equal(code, 1);
    const dir = readdirSync(out).filter((n) => n.startsWith('run-')).map((n) => join(out, n))[0];
    const spec = readFileSync(join(dir, 'repro', 'f1.spec.ts'), 'utf8');
    assert.match(spec, /BAĞIMLILIK/);
    assert.match(spec, /runSingleTrial/);
    assert.ok(existsSync(join(dir, 'report.html')));
  });
});

// ---------------- çok satırlı metin: textarea (§15 "Satır sonu" ailesi) ----------------

test('textarea: LF ve boş satır korunur; CR/CRLF farkı tarayıcıda (injected) başlar, uygulamaya yüklenmez', async () => {
  await withDemo([], async (d) => {
    const cfg = config(d, { adapter: { control: 'textarea' }, contract: displayNameContract({ control: 'textarea' }) });
    const r = await run(cfg, ['newline.lf.001', 'newline.trailing.001', 'newline.blank-line.001', 'newline.crlf.001', 'newline.cr.001'].map(fixture));
    const byFixture = Object.fromEntries(r.trials.map((t) => [t.fixtureId, t]));
    for (const id of ['newline.lf.001', 'newline.trailing.001', 'newline.blank-line.001']) assert.equal(req(byFixture[id]).status, 'passed', id);
    for (const id of ['newline.crlf.001', 'newline.cr.001']) {
      const t = byFixture[id];
      assert.equal(byId(t, 'input-preserved').status, 'failed', `${id}: textarea.value satır sonunu normalleştirir`);
      assert.equal(byId(t, 'submit-preserved').status, 'passed', `${id}: gönderim değiştirmedi`);
      assert.equal(observationsFile(r.runDir, t.identity.attemptId).firstObservedDivergence.at, 'injected', `${id}: ilk sapma tarayıcıda`);
      assert.equal(t.observations.readback?.value, t.observations.injected?.value, `${id}: uygulama, aldığını aynen sakladı`);
    }
  });
});
