# Teknik review: rapor §45 soruları, kod ve testle

"Testler geçti" tek başına cevap değildir. Her soru için davranışı belirleyen kod ve onu doğrulayan test kimliği.
Doğrulama komutu: `npm test` (57 test; 6 Kasım 2026 itibarıyla hepsi geçiyor, Windows 11 + Node 24.14 + Chromium 156).

| Soru | Cevap | Kod | Test |
|---|---|---|---|
| Kabul beklentisini kim tanımladı? Fixture üreticisi politikayı gizlice seçiyor mu? | Akış sözleşmesi (`expectations`). Corpus'ta `defaultExpectation` her yerde `unspecified`; eşleşmeyen fixture kapsam dışı. | `core/evaluate.ts` `resolveExpectation` | A08–A10, C13, şema testi |
| Exact karşılaştırma hangi iki gözleme bağlı? Başlangıç ileri taşınıyor mu? | Sözleşmedeki `boundary` çifti; sıralı olmalı. Tanısal kontroller ara sınırları ayrı gösterir. | `core/validate.ts`, `evaluate.ts` | A02, A14, B01, B02 |
| `submitted` gerçekten gözlendi mi? | Yalnız korele edilmiş istekten. Gözlenmezse `not-observed`/`not-supported`; `injected` değeri kopyalanmaz. Required kontrol gözlenemeyen sınıra bağlıysa preflight hatası. | `playwright/runner.ts`, demo adapter | B02, B09 |
| HTTP 200 veya toast kabul/kalıcılık kanıtı mı? | Hayır. Kayıt kimliği gerekir; yoksa `indeterminate`. | runner: `created.recordId` denetimi | B05 |
| Fresh read eski form state'inden veya yanlış kayıttan mı? | Her okuma yeni browser context'i + kayıt kimliği. `recordIdSeen` uyuşmazsa gözlem hatası. | `TrialContext.newPage`, runner | B03, B06 |
| Aynı ada sahip iki kayıt ayrılıyor mu? | recordId ile. | demo adapter `readFresh` | B03 |
| Prepare yarıda çökünce sahipli kaynaklar temizlenebiliyor mu? | Rezervasyon ilk mutasyondan önce yazılır; cleanup günlükten yapılır. | `AllocationLog.reserve` | B10 |
| İptal olmuş signal cleanup'ı da iptal ediyor mu? | Hayır: ayrı signal + bütçe. Deneme kapanınca yeni sayfa/istek açılamaz, yolda olan context kapatılır. | runner: `trialClosed`, `cleanupCtxFor` | B11 |
| Backend, kuyruk ve harici servis izolasyonu? | Namespace + doğrulanmış cleanup; doğrulama sonrası yazım `pending`. Önceden dolu namespace hata. Harici servisler test ortamında ayrıca kapatılmalı (araç bunu yapamaz). | demo adapter `prepare`/`cleanup` | B12, B13 |
| Shrink validation reddine inen adayı aynı hata sayıyor mu? | Hayır: `applicationOutcome` imzanın parçası. | `core/shrink.ts` `signatureOf` | C04 |
| NFC dışında örtük trim/case/NFKC var mı? | Yok. | `core/comparators.ts` | A05–A07 |
| Retry ilk ihlali saklıyor mu? | Bütün denemeler `attempts.jsonl`'da; kararsız bulgu `unstable`, küçültme yok. | runner | C03 |
| Required not-run iken exit 0 verilebilir mi? | Hayır (exit 2). Hiçbir şey yürütülmediyse de 0 değil. | `core/outcome.ts` | C14, A11 |
| HTML raw metni kod olarak çalıştırabilir mi? Auth/trace paylaşılıyor mu? | Tüm veri escape'li, script yok, CSP `default-src 'none'`. Paylaşım allowlist; sırlar redakte. | `reporter`, `store.planShare`, `redactMessage` | C08, C10, C12 |
| Repro hangi sürüme ve hangi somut fixture'a bağlı? | Manifest: corpus digest, sözleşme/akış digest'i, adapter sürümü, hedef build, Chromium, Node/ICU, locale/TZ. Replay saklı değeri kullanır; uyuşmazlık işaretlenir. | `store` manifest, `cli replay` | C01, C02 |
| Test, uygulamadaki aynı yanlış normalizer'ı oracle diye kullanıyor mu? | Hayır. Demo uygulaması kendi dönüşümlerini sunucuda yapar; oracle yalnız `===` ve `normalize('NFC')`. Testler beklenen değeri elle yazılmış kaçışlı literal ile verir. | `test/core.test.ts` | A01–A07 |

## Review sırasında bulunan ve düzeltilen hatalar

| Hata | Nasıl bulundu | Düzeltme |
|---|---|---|
| Eksik readback gözlemi `[a, b].find(...)` ile gizleniyordu (eleman `undefined` iken find da `undefined` döner) | Demo C'nin çökmesi | `unusable(a) || unusable(b)`; mutasyon testiyle A11'in bunu yakaladığı doğrulandı |
| İptal sonrası terk edilen adapter çağrısı cleanup'tan sonra kayıt yaratabiliyordu | B11 | Deneme kapanınca context'ler cleanup'tan önce kapanır; geç `newPage`/`request` reddedilir |
| Korumalı API istekleri yönlendirme izleyip sırlı başlığı başka origin'e taşıyabilirdi | Otomatik güvenlik incelemesi | `maxRedirects: 0` |
| Hata mesajları Playwright "Call log" ile başlık değerlerini artifact'a yazabilirdi | Otomatik güvenlik incelemesi | `redactMessage` |
| `replay`/`cleanup`, koşu dizinindeki yapılandırma yolunu import ediyordu (paylaşılan paket kod çalıştırabilirdi) | Otomatik güvenlik incelemesi | `--config` zorunlu |
| Demo sunucusu ASCII dışı yolda (`Yayında`) başlamıyordu | Playwright entegrasyon örneği | URL kodlamalı karşılaştırma |
| Şema denetleyicisinde dangling-else nesne tipli alanları atlıyordu | Kod incelemesi + negatif kontrol testi | Süslü parantez + negatif test |

## Çözülmemiş riskler

- Kullanıcı pilotu yok; kurulum süresi ve tekrar kullanım ölçülmedi ([`pilot.md`](pilot.md)).
- Rakip karşılaştırması yapılmadı ([`benchmark.md`](benchmark.md)).
- macOS ve Firefox/WebKit denenmedi.
- npm paketi olarak yayımlanmadı; Node `node_modules` içinde tip silmeyi desteklemediği için derlenmiş çıktı gerekecek ([ADR 0007](adr/0007-typescript-no-build.md)).
- Redaction bilinen kalıplara dayanır; kusursuz değildir.
