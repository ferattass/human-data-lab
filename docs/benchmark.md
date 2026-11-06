# Benchmark tasarımı

> **Durum: tasarlandı, yürütülmedi.** Bu belge yöntemi tanımlar; aşağıda hiçbir sonuç yoktur.
> Rakip araçlar bu projede kurulup ölçülmedi. Bir aracın bir özelliği burada yazmıyorsa, o özelliğe sahip olmadığı anlamına gelmez.

Üstünlük özellik sayısıyla değil, **aynı iş** üzerinde ölçülür (rapor §31).

## Hipotez

Geliştiricinin tek bir UI veri yolculuğuna korunma sözleşmesi eklemesi, genel araçları elle birleştirmesinden daha az emek ister;
bulgular daha kolay açıklanır ve kalıcı teste dönüşür. Bu hipotez yanlışlanabilir: genel araçlarla eşit veya daha kolaysa ürün
küçük bir yardımcı kütüphane + corpus olarak daraltılır.

## Görevler

| Karşılaştırma | Adil görev | Ölçüm |
|---|---|---|
| Elle Playwright + fast-check | Aynı create/read/cleanup, aynı oracle | Kurulum, bakım, bulgu/replay süresi |
| Bug Magnet ile elle kontrol | Aynı alan, hazır örnek seti | İnceleme süresi, kaçan ve yanlış bulgular |
| Pangaea | Gerçekten örtüşen globalization görevi | Kapsam ve sonuç; UI roundtrip dışı göreve zorlanmaz |
| Schemathesis | Şema/API düzeyinde uygun görev | API avantajı saklanmadan toplam iş yükü |

## Hedef uygulamalar

- Kaynağı açık küçük test uygulamaları: doğru çalışan sürüm ve **tek hata enjekte edilmiş** sürümler birlikte.
  `examples/profile-demo` bu amaçla başlangıç noktasıdır (`strip-marks`, `nfc`, `trim`, `latin1`…).
- Açıkça yetkili pilot ortamları.
- Beklenen sonuçlar motor çalıştırılmadan **önce** yazılır ve sürüm kontrolüne konur.

## Kaydedilecek ölçüler

İlk anlamlı teste kadar geçen süre · kurucu yardımı (dakika) · adapter satır sayısı ve değişiklikleri · gerçek / yanlış ihlal ·
eksik kontroller · temiz ortamda replay · cleanup başarısı · küçültme süresi · toplam tarayıcı süresi.

## Dürüstlük kuralları

- Bir hata ailesinin yüz varyasyonu yüz bağımsız başarı sayılmaz; hata sınıfı başına raporlanır.
- Benchmark fixture'ları ürünün normalleştirici veya ayrıştırıcısıyla aynı yanlış varsayımı paylaşmamalıdır.
- Küçük sentetik benchmark'taki üstünlük gerçek uygulamalara genellenmez.
- Hazırlanmış demo ile dış projede doğrulanmış bulgu aynı etiketle yayımlanmaz.
