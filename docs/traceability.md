# İzlenebilirlik: ürün raporu → uygulama

Kaynak: *Human Data Lab — Ürün Kararı + Mühendislik Dosyası, v1.0, 5 Kasım 2026* (53 sayfa, 50 bölüm).
Durum: **✓ uygulandı ve test edildi** · **◐ kısmen / bilinçli sapma** · **○ insan veya dış dünya gerektirir (yöntem belgelendi)** · **— bilgi bölümü**

| § | Bölüm | Durum | Nerede |
|---|---|---|---|
| 1 | Ürün kararı | ✓ | TypeScript çekirdeği + Playwright, Chromium, tek alan, model çağrısı yok |
| 2 | Raporun okunuşu | — | Bulgu/karar/varsayım ayrımı belgelerde korunur ("tasarlandı, yürütülmedi" etiketleri) |
| 3 | Problemin biçimi | — | README "Neden" |
| 4 | İlk kullanıcı ve önkoşullar | ✓ | `docs/adapter-guide.md` önkoşullar |
| 5 | Ürün akışı | ✓ | create/read/cleanup → corpus → izole deneme → kural → repro |
| 6 | Rekabet | — | `docs/benchmark.md` |
| 7 | Test edilecek farklılık | ○ | `docs/benchmark.md`, `docs/pilot.md` |
| 8 | v0.1 kapsam sözleşmesi | ✓ | `docs/scope.md` |
| 9 | Beş açık adım | ✓ | `hdl demo` → `hdl init` → sözleşme → `hdl run --corpus smoke` → `hdl replay` |
| 10 | Ürün ekranı konsepti | ✓ | `packages/reporter` ("Kaydedildi. Peki korundu mu?") |
| 11 | Kanıt görünümü | ✓ | authored/injected/submitted/readback ayrı; ham + kaçışlı + kod noktası; ilk gözlenen sapma |
| 12 | Sonuç modeli | ✓ | `core/types.ts`; A08–A11, B05 |
| 13 | Oracle | ✓ | `core/comparators.ts`, `evaluate.ts`; A01–A10 · [ADR 0001](adr/0001-oracle.md) |
| 14 | Unicode kararları | ✓ | `core/text.ts` (birimli ölçüler, segmenter), ICU/Unicode sürümü manifest'te; A03–A05, A12 |
| 15 | Corpus aileleri | ✓ | 11 aile, 99 fixture (hedef "yaklaşık 100"), saldırı payload'ı yok |
| 16 | Fixture sözleşmesi | ✓ | `schema/fixture.schema.json`, sürüm + digest + CHANGELOG, somut değer kopyası |
| 17 | Motor mimarisi | ✓ | core / playwright / store / reporter / cli ayrımı; mimari testi |
| 18 | Adapter arayüzü | ✓ | `playwright/src/adapter.ts`; yetenekler dürüst bildirilir |
| 19 | Deneme kimliği ve sahiplik | ✓ | `TrialIdentity`, `OwnedFixture`, `allocations.jsonl`; B10 · [ADR 0004](adr/0004-data-isolation.md) |
| 20 | Forma yazma ve gönderim | ✓ | Bekleyici tıklamadan önce, sahipli istek korelasyonu, HTTP 200 kabul değil, tekrar gönderim yok; B02, B05, B08, B09 |
| 21 | Taze okuma ve asenkronluk | ✓ | first-independent-read / stable-read / readiness-signal; B06 |
| 22 | Yaşam döngüsü ve iptal | ✓ | preflight…finalize, ayrı cleanup signal'ı, kurtarma (`hdl cleanup --owned-only`); A14, B11 |
| 23 | Sonuç JSON'u | ✓ | `schema/trial-result`, `finding`; hata sınıfları |
| 24 | Tekrar üretim sözleşmesi | ✓ | manifest provenance, `hdl replay`; C01, C02 |
| 25 | Küçültme | ✓ | grafem/kod noktası indirgeme, aynı imza, bütçe, son onay; C04–C06 |
| 26 | Kararsızlık ve kirli ortam | ✓ | `unstable`, `pending`, seri koşu; B12, C03 |
| 27 | Kanıt paketi | ✓ | `packages/store`; atomik manifest, digest, path safety; C07, C09, C11 · [ADR 0006](adr/0006-artifact-model.md) |
| 28 | CLI ve entegrasyon | ✓ | `demo/init/run/replay/report/cleanup` (+ `export`, `lab`), exit 0/1/2/3/130, Playwright Test fixture |
| 29 | HTML raporu | ✓ | escape, CSP, uzak kaynak yok, klavye odağı, metin etiketleri, paydalar, kısaltma + tam değer; C08, C12 |
| 30 | Güvenlik ve gizlilik | ✓ | origin allowlist (gezinme + API, yönlendirme yok), redaction, paylaşım allowlist'i; B14, C10 · `SECURITY.md` |
| 31 | Benchmark tasarımı | ○ | `docs/benchmark.md` (yürütülmedi) |
| 32 | Kabul matrisi A | ✓ | `test/core.test.ts` + A14 runner testi |
| 33 | Kabul matrisi B | ✓ | `test/acceptance.test.ts` (gerçek Chromium) |
| 34 | Kabul matrisi C | ✓ | `test/acceptance.test.ts`, C14 `core.test.ts`; `test/matrix.test.ts` 42/42 kapsamı zorlar |
| 35 | Üç demo | ✓ | `hdl demo` (A, B, C + doğru mod), sentetik etiketli |
| 36 | Performans bütçesi | ✓ | `DEFAULT_BUDGETS`; ölçüm `docs/performance.md` |
| 37 | Depo ve paket sınırları | ◐ | `packages/{core,corpus,playwright,store,reporter,cli}`, `examples/{profile-demo,existing-test}`, `schema/`, `docs/`. Sapma: fixture verisi `packages/corpus/data` altında (ayrı `fixtures/` yok); `store` paketi eklendi; npm workspaces kullanılmadı ([ADR 0007](adr/0007-typescript-no-build.md)) |
| 38 | Geliştirme sırası ve kapılar | ◐ | Faz 0–4 tamamlandı (sözleşme, çekirdek, gerçek akış, kanıt, küçültme). Faz 5 pilot ve faz 6 beta açık |
| 39 | Karar günlüğü | ✓ | `docs/adr/` (9 kayıt) |
| 40 | Pilot | ○ | `docs/pilot.md` (başlamadı) |
| 41 | Dağıtım | ◐ | Tek komut demo, JSON+HTML örnek, entegrasyon rehberi var. Kısa video yok |
| 42 | Açık kaynak sözleşmesi | ✓ | Apache-2.0, NOTICE, köken kaydı, CONTRIBUTING, SECURITY, issue şablonu |
| 43 | Uzun vadeli yön | — | Arama/export/tarih/sayı/IME: sonraki fazlar; `research/` deneyleri |
| 44 | Uygulama başlangıç brifi | ✓ | Çalışma sırası izlendi; kararlar ADR ile |
| 45 | Teknik review soruları | ✓ | `docs/review.md` |
| 46 | Beta teslim tanımı | ◐ | Aşağıda |
| 47–50 | Kaynaklar | — | Rapordaki S01–S26 |

## Beta teslim tanımı (§46): dürüst durum

| Teslim | Durum |
|---|---|
| Kaynak ve bağımlılıklar | ✓ Çalışan çekirdek, `package-lock.json`, lisans/köken kayıtları |
| Demo | ✓ Doğru/bozuk modlar, sentetik etiketli. `npm pack` paketi boş projeye kurulup demo kaynak kod olmadan çalıştırılıyor (`test/package.test.ts`) |
| Testler | ✓ 42/42 A/B/C, gerçek browser yaşam döngüsü |
| Replay | ✓ Orijinal somut fixture ve sürümlü sözleşmeyle |
| Küçültme | ✓ Aynı imza, yeni fixture, bütçe, kararsızlık koruması |
| Artifact | ✓ Eksik koşu, bozuk dosya, hassas içerik davranışları sınandı |
| Platform | ✓ CI: Linux, Windows, macOS × Node 22/24, Chromium. Firefox/WebKit kapsam dışı |
| Dokümantasyon | ✓ API, sınırlar, güvenlik, adapter rehberi, hata şablonu |
| Pilot | ○ Yöntem var, gözlem yok |

Beta yayımlanmadan önce kalan: npm paket adı ve yayın kararı, pilot.
