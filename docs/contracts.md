# Sözleşmeler

Makine ve arayüz aynı durum modelini kullanır. Şemalar: [`schema/`](../schema). Türler: [`packages/core/src/types.ts`](../packages/core/src/types.ts).
Tüm şemalarda `schemaVersion` zorunludur; bilinmeyen büyük sürüm açık hatadır (sessizce okunmaz).

## 1. Fixture (rapor §16)

Fixture uygulamanın kabul politikasını **belirlemez**. `defaultExpectation` corpus'ta her yerde `unspecified`'dır;
akış sözleşmesi fixture ailelerini seçer ve beklentiyi bağlar. Böylece aynı sentetik metin farklı uygulamalarda
yanlışlıkla "evrensel geçerli veri" ilan edilmez. İçerik değişirse corpus sürümü ve digest değişir;
koşu paketi kullanılan somut değerleri `fixtures.jsonl`'a kopyalar (replay "latest corpus"a değil bu kopyaya dayanır).

## 2. Akış sözleşmesi (§13)

```ts
{
  schemaVersion: '0.1',
  id: 'profile.display-name',
  field: { id: 'display-name', control: 'input-text' },
  inputMethod: 'fill',
  expectations: [                                   // ilk eşleşen bağlanır
    { properties: ['technical-control'], expect: 'must-reject' },
    { properties: '*', expect: 'must-accept' },
  ],
  preservation: [
    { id: 'display-name-preserved', rule: 'text.exact.v1', required: true,  boundary: ['authored', 'readback'] },
    { id: 'input-preserved',        rule: 'text.exact.v1', required: false, boundary: ['authored', 'injected'] },
  ],
  readback: { kind: 'first-independent-read' },     // | stable-read | readiness-signal
}
```

| Kural | İzin verilen | Not |
|---|---|---|
| `acceptance.must-accept.v1` | Tanımlı geçerli örnek kabul edilir | Geçerliliği kullanıcı tanımlar |
| `acceptance.must-reject.v1` | Tanımlı geçersiz örnek reddedilir | Korunma kontrolü yerine geçmez |
| `text.exact.v1` | JS dizgisi tam eşit | Karşılaştırılan iki gözlem sınırı sabitlenir |
| `text.nfc.v1` | NFC sonrası eşdeğer | Ham fark (`rawEqual`) ayrıca saklanır; "exact geçti" denmez |

Karşılaştırıcı seti kapalıdır. Dışarıdan gelen JSON içine kod gömülüp kural gibi çalıştırılmaz.
Tanısal (`required: false`) kontroller raporda görünür ama CI sonucunu etkilemez.

## 3. Gözlem sınırları (§11, §20)

| Sınır | Anlamı | Kaynak (referans adapter) |
|---|---|---|
| `authored` | Fixture'daki özgün JS dizgisi | `fixture` |
| `injected` | Kontrole yazdıktan sonra DOM'dan okunan değer | `dom-input` |
| `submitted` | Bu denemeye ait istekle korele edilmiş gönderim değeri | `request-body` |
| `readback` | Yeni context + kayıt kimliğiyle bağımsız okuma | `ui-detail` / `api` |

`submitted` gözlenemiyorsa `not-observed` / `not-supported` olur; `injected` değeri `submitted` diye etiketlenmez.
Karşılaştırmanın başlangıcı, erken kaybı gizlemek için sessizce ileri taşınmaz.

## 4. Sonuç modeli: tek yeşil yok (§12)

| Boyut | Değerler |
|---|---|
| `execution` | `completed` · `error` · `cancelled` |
| `applicationOutcome` | `accepted` · `rejected` · `indeterminate` |
| assertion `status` | `passed` · `failed` · `not-run` · `indeterminate` |
| `cleanup` | `verified` · `failed` · `pending` · `not-needed` |
| `reproducibility` | `not-checked` · `stable` · `unstable` · `inconclusive` |
| hata sınıfı | `configuration` · `adapter` · `target` · `observation` · `assertion` · `cleanup` · `artifact` |

- Kabul beklenen değer reddedilirse kabul assertion'ı başarısız olur; korunma `not-run` kalır.
- Beklenen red doğru görülürse yalnız red assertion'ı geçer; "kaydedildi ve korundu" diye özetlenmez.
- Kabul edilmiş ama okunamamış kayıt için boş dizgi üretilmez; korunma `not-run` olur.
- HTTP 200 veya toast tek başına kabul kanıtı değildir: kayıt kimliği gerekir.
- Timeout ve seçici hatası veri bozulması değildir (`execution: error`).

## 5. Çıkış kodları (§28)

| Kod | Anlam |
|:-:|---|
| `0` | Gerekli kontroller tamamlandı; ihlal veya çözümsüz durum yok |
| `1` | En az bir required assertion ihlali (tanısal ham fark değil) |
| `2` | Yapılandırma, yürütme, eksik kanıt veya belirsiz sonuç — **required not-run dahil** |
| `3` | Cleanup doğrulanamadı; sahipli veri için işlem gerekiyor |
| `130` | Kullanıcı iptali; kısmi sonuç ve cleanup durumu JSON'da |

Öncelik `130 > 3 > 2 > 1 > 0`. "fail yok" ile "tüm gerekli kontroller geçti" aynı şey değildir.

## 6. Kanıt paketi (§27)

```text
run-<id>/
  manifest.json          yalnız finalize sonrası status=complete; dosya digest'leri
  contract.json          çalıştırılan policy + flow + adapter + bütçeler
  fixtures.jsonl         kullanılan somut girdiler (tekrar ve küçültme adayları dahil)
  attempts.jsonl         bütün denemeler
  allocations.jsonl      sahipli kaynak günlüğü (rezervasyon ilk mutasyondan ÖNCE)
  observations/<attempt>.json   ham + kaçışlı + kod noktası + ölçüler + ilk gözlenen sapma
  findings/<finding>.json
  repro/<finding>.spec.ts       adapter bağımlılığı açık
  evidence/              ihlal/hata anında ekran görüntüsü
  report.html
```

Her koşu yeni dizine yazılır; mevcut dizinin üzerine yazılmaz. Manifest geçici dosyaya yazılıp `rename` ile finalleştirilir.
Okuyucu (`readRun`) eksik/bozuk dosyayı, digest uyuşmazlığını ve dizin dışına çıkan yolu **sorun** olarak raporlar.
Hash bütünlüğe yardımcıdır; yayıncı kimliği veya sonucun doğruluğu kanıtı değildir.

## 7. Tekrar üretim (§24)

Manifest şunları kaydeder: fixture değerleri + corpus kimliği/sürümü/digest'i, sözleşme ve akış digest'i,
adapter sürümü + hedef build kimliği (`adapter.targetBuild`), Chromium sürümü, Node/ICU/Unicode sürümü,
locale ve saat dilimi, bütçeler, izinli originler ve deneme sırası.

`hdl replay` saklı somut değerle çalışır; yeni rastgele örnek üretip benzer hata bulmak replay sayılmaz.
Sözleşme digest'i, adapter sürümü veya hedef farklıysa koşu `replayOf.mismatches` ile işaretlenir ve
"orijinal sürüm yeniden üretildi" diye anlatılmaz. Auth sırları, veritabanı yedeği veya ortam imajı pakete girmez.

## 8. Küçültme (§25)

İmza: `{ adapterId, fieldId, boundary, ruleId, applicationOutcome, differenceClass }`.
Önce orijinal 3 bağımsız denemede doğrulanır; kararsızsa küçültme yapılmaz. Adaylar önce grafem kümelerini koruyan silmeler,
sonra kod noktası silmeleridir; her aday yeni fixture ve browser context ile çalışır ve aynı imzayla 3 kez onaylanmalıdır.
Validation reddine dönüşen aday aynı hata değildir. Cleanup doğrulanamazsa küçültme durur. Son bağımsız onay kararsızsa
önceki doğrulanmış aday korunur. Dil: "belirtilen strateji ve bütçe altında daha küçük doğrulanmış örnek bulunamadı";
küresel minimum garantisi yoktur.
