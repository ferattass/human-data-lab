# Adapter rehberi

Adapter, uygulamanızı anlayan küçük ama dürüst bağlama katmanıdır (rapor §18). Seçiciler, endpoint'ler, test hesabı ve
temizlik yolu burada; çekirdek bunları bilmez. Başlamak için `hdl init --adapter playwright` incelenebilir bir taslak üretir.
Tam çalışan örnek: [`examples/profile-demo/adapter.ts`](../examples/profile-demo/adapter.ts).

## Önkoşullar (§4)

- Uygulama yerel veya ayrılmış bir test ortamında çalışıyor (üretim değil).
- Test kullanıcısı ve izinli origin listesi var.
- Kayıt oluşturma ve kaydı kimliğiyle yeniden bulma yolu biliniyor.
- Denemenin kaynakları ayrı anahtar/tenant/namespace ile tanımlanabiliyor.
- Temizlik veya güvenilir ortam sıfırlama mümkün.

Bunlar yoksa güvenilir otomatik tekrar ve küçültme desteklenmiş sayılmaz.

## Arayüz

```ts
interface RoundtripAdapter {
  id: string; version: string;
  capabilities: AdapterCapabilities;          // kontrol türü, giriş yöntemi, gözlenen sınırlar, okuma kaynağı, izolasyon, temizlik
  authenticate?(browser, baseURL): Promise<StorageState>;   // dönen state artifact'a yazılmaz
  secrets?(): string[];                        // hata mesajlarından maskelenecek değerler
  targetBuild?(ctx): Promise<string>;          // tekrar üretim bağlamı
  prepare(ctx): Promise<OwnedFixture>;
  create(ctx, own, value): Promise<CreateOutcome>;
  readFresh(ctx, own, recordId): Promise<ReadObservation>;
  readiness?(ctx, own, recordId): Promise<boolean>;
  cleanup(ctx, own): Promise<CleanupResult>;
}
```

## Kurallar ve neden

**prepare**
- Namespace'i `ctx.allocations.reserve(ns)` ile **ilk mutasyondan önce** kaydedin. `prepare` yarıda çökerse runner temizliği bu günlükten yapar (B10).
- Veritabanını topluca silmeyin; yalnız bu denemeye ait alanı hazırlayın.
- Namespace önceden doluysa hata verin. Yeni browser context'i backend'i temizlemez (B13).
- Test girdisine önek eklemeyin (`"run-123 İpek"`). Bu, test edilen dizgiyi değiştirir; sahiplik ayrı alanla sağlanır.

**create**
- Alanı `ctx.unique(locator, ad)` ile bulun. Birden çok eşleşme rastgele ilkini seçmek değil, adapter hatasıdır (B04).
- Doldurduktan sonra `ctx.observe('injected', …)`: DOM'dan gerçekten okunan değer.
- İstek bekleyicisini tıklamadan **önce** kurun. Yalnız endpoint adına değil, bu denemenin namespace'ine veya korelasyon kimliğine göre eşleşin (B09).
- Uygulama kayıttan hemen sonra gezinebilir; yanıt gövdesi kaybolmasın diye isteği `page.route` + `route.fetch()` ile yakalamak güvenilirdir.
- HTTP 200 veya toast'ı kabul saymayın. Doğrulanmış yanıt şeması ve kayıt kimliği gerekir; yoksa `indeterminate` (B05).
- Bağlantı koparsa veya yanıt beklenmedikse **tekrar göndermeyin**: ilk istek kaydı yaratmış olabilir (B08).

**readFresh**
- `ctx.newPage()` her çağrıda yeni, izole bir context açar. Kayıt kimliğiyle detay sayfasına gidin; aynı formun bellekteki değerini okumayın (B06).
- `recordIdSeen` döndürürseniz runner doğru kaydın okunduğunu denetler (B03).
- Login'e yönlendirilirseniz `AdapterError(…, 'target')` fırlatın. Bu önkoşul engelidir, veri ihlali değildir (B07).
- Sabit `sleep` veya genel `networkidle` kalıcılık kanıtı değildir. Gerekirse sözleşmede `stable-read` veya `readiness-signal` seçin.

**cleanup**
- Yalnız `own.namespace` içindeki kaynaklara dokunun; idempotent olun.
- Silmeyi **doğrulayın**. Arka plan işi geri yazabilir; doğrulama sonrası kayıt görürseniz `pending` döndürün (B12).
- Cleanup ayrı bir signal ve bütçeyle çağrılır. Koşu iptal edilmiş olsa bile çalışır (B11).

## Yetenekleri dürüst bildirin

`capabilities.boundaries` gerçekten gözleyebildiğiniz sınırları listeler. `submitted`'ı gözleyemiyorsanız listeden çıkarın.
Bu durumda `submitted`'a bağlı required kontrol preflight'ta yapılandırma hatası verir; rapor kapsamı açıkça gösterir.

## Güvenlik

- `ctx.request()` izinli originler dışında istek atmaz ve yönlendirme izlemez.
- Test token'ı gibi sırları `secrets()` ile bildirin; hata mesajlarından maskelenir.
- Adapter güvenilen yerel proje kodudur; sandbox edilmiş gibi düşünmeyin.
