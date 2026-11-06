# Performans ve kaynak bütçesi

Her fixture için kayıt yaratmak ve yeniden açmak birim testten pahalıdır (rapor §36). Aşağıdaki sayılar **tek bir yerel ölçümdür**;
benchmark sonucu veya evrensel doğru ayar değildir.

## Varsayılan bütçeler (`DEFAULT_BUDGETS`)

| Bütçe | Değer | Sınır aşılınca |
|---|---|---|
| Smoke corpus | 24 fixture | Tam liste ve uygulanamayanlar raporlanır |
| Paralellik | 1 worker | Veri izolasyonu kanıtlanmadan artırılmaz |
| Deneme timeout | 30 sn | Yürütme hatası / eksik kontrol; success değil |
| Cleanup timeout | 10 sn, ayrı bütçe | `pending`; küçültme durur, exit 3 |
| Tekrar | 3 bağımsız deneme | — |
| Küçültme | 60 deneme veya 5 dk | Son doğrulanmış aday teslim edilir (`budget-exhausted`) |
| Kanıt boyutu | ekran görüntüsü başına 2 MiB | Görüntü kaydedilmez; kanıt listesi bunu yansıtır |

Hepsi `roundtrip.config.ts` → `budgets` ile ayarlanır ve manifest'e yazılır.

## Ölçüm — 6 Kasım 2026

Ortam: Windows 11, Node 24.14.0, Chromium 156 (headless), demo uygulaması aynı makinede (`127.0.0.1`), sıcak önbellek.
Kaynak: `hdl demo` çıktısındaki `attempts.jsonl` → `timings`.

**Doğru mod, smoke corpus (24 deneme, toplam 19,6 sn)**

| Aşama | Medyan | p90 | Maks. |
|---|---:|---:|---:|
| prepare | 5 ms | 21 ms | 80 ms |
| submit (sayfa + doldur + gönder + kabul) | 177 ms | 250 ms | 511 ms |
| readFresh (yeni context + detay sayfası) | 100 ms | 144 ms | 332 ms |
| compare | < 1 ms | < 1 ms | < 1 ms |
| cleanup (sil + doğrula) | 217 ms | 250 ms | 324 ms |
| **deneme toplamı** | **506 ms** | **677 ms** | — |

Cleanup süresinin yaklaşık 180 ms'si, referans adapter'ın arka plan yazımlarını yakalamak için yaptığı 3 × 60 ms doğrulama beklemesidir.

**Demo A — işaret atan sunucu, 3 fixture (33 deneme, toplam 20,6 sn)**

| Bulgu | Tekrar | Küçültme | Süre | Sonuç |
|---|---|---|---:|---|
| `tr-i.dotted-capital.002` | stable (3/3) | 15 deneme | 10,8 sn | `"İpek Çağlar"` → `"İ"` |
| `combining.nfc-acute.001` | stable (3/3) | 11 deneme | 5,5 sn | `"José"` → `"é"` |

## Yorum

- Maliyetin büyük kısmı tarayıcı gezinmesi ve temizlik doğrulamasıdır; karşılaştırma ihmal edilebilir.
- Uzak bir staging ortamında ağ gecikmesi her aşamaya eklenir. PR'larda smoke seti, geniş corpus (99) için gece koşusu önerilir.
- Küçültme maliyeti bulgu başına onlarca denemedir; büyük corpus'ta `--no-shrink` ile bulgu toplanıp seçilenler sonra küçültülebilir.
- Tam trace her başarılı denemede saklanmaz. Ekran görüntüsü yalnız ihlal veya yürütme hatasında alınır.
