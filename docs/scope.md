# v0.1 kapsam sözleşmesi

İlk sürümde neyin çalıştığı, aynı kesinlikle (ürün raporu §8). "Destekleniyor" etiketi yalnız ilgili sözleşme ve
kritik testler gerçekten çalıştığında verilir; yol haritası bugünün özelliği gibi yazılmaz.

| Yetenek | Durum | Kabul sınırı | Kanıt |
|---|---|---|---|
| Metin roundtrip | **Destekleniyor** | Tek alan; formdan gönder, bağımsız taze okuma ile karşılaştır. Referans okuma UI detay sayfası; API okuması açık etiketli (`freshReadSource: 'api'`). | `test/acceptance.test.ts` B01–B14 |
| Browser | **Chromium** | Diğer tarayıcılara güvence verilmez. | CI: ubuntu + Chromium |
| Giriş yöntemi | **Playwright `fill`** | Gerçek klavye / IME composition doğrulanmış sayılmaz. | `inputMethod: 'fill'` dışı preflight hatası |
| Oracle | **`text.exact.v1` + açık `text.nfc.v1`** | Varsayılan sessiz trim / case-fold / NFKC yok. | `test/core.test.ts` A01–A14 |
| Kabul beklentisi | **`must-accept` / `must-reject`** | Uygulama sahibi sözleşmede bağlar; araç tahmin etmez. Eşleşmeyen fixture kapsam dışı. | A08–A10, C13 |
| Corpus | **Küratörlü, 99 fixture, 11 aile** | Özellik temelli; tüm dünya/diller onayı değil. Smoke: 24. | `packages/corpus` |
| Tekrar / küçültme | **Sınırlı ve gözlenebilir** | 3 bağımsız tekrar; bütçe 60 deneme / 5 dk; aynı imza; kirli ortamda durur. | C03–C06, B12 |
| Rapor | **JSON + yerel HTML** | Script yok, dış kaynak yok, tüm veri escape'li. Model yorumu yok. | C07–C12 |
| Replay | **Tek bulgu, saklı somut değer** | Aynı uygulama ortamı ve adapter gerekir; uyuşmazlıklar görünür. | C01–C02 |
| Owned cleanup / kurtarma | **Destekleniyor** | Yalnız allocation günlüğündeki namespace'ler; doğru hedef doğrulanır. | B10, B11, `hdl cleanup` |
| Mevcut Playwright testine entegrasyon | **Destekleniyor** | `humanData` fixture + `expectTextPreserved`. | `test/playwright-integration.test.ts` |
| Paralellik | **Kapalı (1 worker)** | Veri izolasyonu kanıtlanmadan artırılmaz. | `Budgets.workers: 1` |
| Arama / CSV export | **Sonraki faz** | İndeks gecikmesi ve parser semantiği ayrı tasarlanır. `research/` altındaki araçlar deneyseldir. | — |
| Tarih / sayı / zengin metin | **Sonraki faz** | Ayrı veri tipi ve koruma kuralı gerekir. | — |
| Otomatik recorder / AI | **Yok, zorunlu değil** | `hdl init` yalnız incelenebilir taslak üretir; siteyi keşfetmez. | — |

## Bilinen sınırlar

- **Taze okuma kapsamı:** UI okuması ile API okuması aynı şeyi kanıtlamaz. Yeni sayfa backend kaynağını tek başına kanıtlamaz
  (service worker, cache, localStorage adapter'da açıklanmalı). İddia yalnız gözlenen okuma yoluyla sınırlıdır.
- **Satır sonları:** HTML ayrıştırıcısı ve `textarea.value` CR/CRLF'yi normalleştirir. `newline` ailesi yalnız `textarea`
  sözleşmelerinde uygundur ve fark çoğu zaman `injected` sınırında görünür: bu tarayıcı davranışıdır, uygulama hatası değil.
- **Kök neden:** "İlk gözlenen sapma" gözlem sınırları içindeki aşamadır; backend kök nedeni bu kanıttan çıkmaz.
- **Redaction** kusursuz gizlilik garantisi değildir.
- **Lone surrogate** ve bozuk kodlama ayrı dayanıklılık sınıfıdır; temel corpus'ta yoktur.
- **Platform matrisi:** Geliştirme Windows 11 + Node 24.14, CI Ubuntu + Node 24. macOS denenmedi.
