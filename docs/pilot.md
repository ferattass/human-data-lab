# Pilot ve devam kararı

> **Durum: planlandı, başlamadı.** Kullanıcı görüşmesi veya pilot yapılmadı. Eşikler sektör standardı veya başarı tahmini değil,
> kurucunun erken karar verebilmesi için seçilmiş tasarım varsayımlarıdır (rapor §40).

Birinin kendi **ikinci** işi, demo beğenisinden daha değerlidir.

## Kurgu

Uygun akışı olan (profil adı, müşteri görünen adı, serbest not alanı) on gönüllü geliştirici. İki aşama ayrı ölçülür:

1. Örnek uygulamada kurulum: `npm ci` → `npx playwright install chromium` → `npm run demo`
2. Kendi uygulamasına bağlama: `hdl init --adapter playwright` → adapter → `hdl run`

Kurucu yardımı, test ortamını hazırlama ve oracle yazma süresi gizlenmez; dakika olarak kaydedilir.

## Eşikler

| Deney | Erken eşik | Sağlanmazsa |
|---|---|---|
| Yardımsız örnek | 10 kişiden 7'si ilk anlamlı testi bitirir | Kurulum ve hata mesajları düzeltilir |
| İkinci gerçek yolculuk | 10 kişiden 5'i bir sonraki uygun işinde tekrar kullanır | Tekrar ihtiyacı ve adapter yükü araştırılır |
| Aksiyon alınan bulgu | En az 3 gerçek sorun bakımcı tarafından doğrulanır | Yanlış uyarı / policy sorunları incelenir |
| Replay güvenilirliği | Desteklenen kritik örnekler temiz ortamda yeniden yürür | Beta öncesi kanıt/replay sorunu çözülür |
| Karşılaştırmalı fayda | Aynı görevde kurulum veya teşhis avantajı gözlenir | Ürün yerine küçük yardımcı + corpus düşünülür |

## Bırakma / daraltma sinyali

İnsanlar demoyu seviyor ama kendi ikinci yolculuğunu eklemiyor; oracle bakımı faydayı geçiyor; uyarıların çoğu politika
yanlışlığından geliyor. Bu durumda yeni format veya AI özelliği eklemek asıl sorunu çözmez.

## Mevcut kanıt (pilot değil)

`research/` altındaki erken deneyler (Kasım 2026) aracın dış açık kaynak uygulamalarda gerçek sorun bulup bulamayacağını
sınadı: modern kurulumlarda tek değer roundtrip'i sağlam çıktı; sorunlar arama, tekillik ve adla eşleme yollarında görüldü.
Bunlar pilot kullanıcı verisi **değildir** ve bakımcıya bildirilip doğrulanmadan "doğrulanmış bulgu" diye sunulmaz.
