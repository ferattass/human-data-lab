# Katkı rehberi

Teşekkürler! Bu proje küçük ve dar tutuluyor: önce **tek bir metin roundtrip'ini sağlam kurmak**, sonra genişlemek.
Katkıdan önce [`docs/scope.md`](docs/scope.md) ve [`docs/contracts.md`](docs/contracts.md) dosyalarına göz atın.

## Geliştirme

```bash
npm ci
npx playwright install chromium
npm run typecheck      # tsc --noEmit (TypeScript 7, build adımı yok; Node ≥ 22.18 .ts dosyalarını doğrudan çalıştırır)
npm test               # birim + kabul testleri (A/B/C matrisi, gerçek Chromium)
npm run demo           # dört sentetik senaryo (doğru mod + A/B/C)
```

Kod Node'un tip silme (type stripping) özelliğiyle çalışır: yalnız **silinebilir TypeScript** kullanın
(`enum`, `namespace`, parametre özelliği yok; importlarda `.ts` uzantısı; tip importları `import type`).

## Paket sınırları

- `packages/core` Playwright'a, dosya sistemine veya React'e bağımlı olamaz (`test/architecture.test.ts` denetler).
- `packages/reporter` yalnız sonuç dosyalarını okur; tarayıcı veya uygulama üzerinde yazma yapmaz.
- CLI ve MCP sunucusu (`packages/mcp`) ikinci bir oracle yaratmaz; çekirdeğin sonucunu serileştirir (`store.compactRun`).
- Kod ajanlarıyla çalışıyorsanız depo kuralları [`AGENTS.md`](AGENTS.md) içinde; aynı kurallar insan katkıcı için de geçerlidir.

## Yeni fixture eklemek

Her fixture şunlarla gelir (şema: [`schema/fixture.schema.json`](schema/fixture.schema.json)):

| Alan | Kural |
|---|---|
| `id` | `aile.ad.NNN`; anlamı değişen fixture **yeni kimlik** alır, eskisi sessizce değiştirilmez |
| `value` | ASCII dışı her karakter `\uXXXX` kaçışlı (görünmez karakterler incelenebilsin) |
| `properties` | sınanan **davranış** (ör. `nfc-sensitive`, `rtl`), ülke/kişi stereotipi değil |
| `applicableControls` | `input-text` / `textarea` (çok satırlı değerler yalnız `textarea`) |
| `defaultExpectation` | `unspecified` — kabul politikasını akış sözleşmesi bağlar |
| `provenance` | `synthetic` + lisans; üçüncü taraf içerikte `source` zorunlu ve lisansı korunur |
| `notes` | neyi sınadığı ve **neyi iddia etmediği** |

Gerçek kişi bilgisi, gerçek müşteri dosyası, özel ekran görüntüsü veya saldırı payload'ı eklemeyin.
Corpus'u değiştirdikten sonra `node packages/corpus/scripts/write-corpus.ts` ile kanonik biçimde yazın,
sürümü artırın ve [`packages/corpus/CHANGELOG.md`](packages/corpus/CHANGELOG.md)'ye not düşün.

Kültürel/yazı sistemi açıklamaları için o yazı sistemini bilen bir reviewer aranır.

## Kararları değiştirmek

Ürün kararları (exact + açık NFC, Chromium + `fill`, seri koşu, …) [`docs/adr/`](docs/adr/) altında kayıtlıdır.
Değiştirmek için kısa bir ADR açın: sorun, alternatif, karar, geri dönüş koşulu ve etkilenen kabul testi kimlikleri.

## Hata bildirmek

Issue şablonunu kullanın. **Gerçek müşteri verisi göndermeyin**; sorunu sentetik küçük bir örneğe çevirin
(`hdl export` ile paylaşım paketi yalnız allowlist dosyalarını içerir, yine de göndermeden önce içeriğe bakın).
Güvenlik sorunları için [`SECURITY.md`](SECURITY.md).

## Dil

Belgeler Türkçe yazılıyor; kod, tanımlayıcılar, şema ve JSON çıktıları dilden bağımsızdır. İngilizce katkı ve çeviri (`README.en.md`) memnuniyetle kabul edilir.

## Sürüm ve yayın

[`docs/release.md`](docs/release.md): sürüm numarası yalnız `package.json`'da; etiket public dalın commit'ine konur; GitHub Release ve npm yayını iş akışıyla yapılır.

## Lisans

Katkılarınız [Apache License 2.0](LICENSE) altında lisanslanır (lisansın 5. maddesi).
