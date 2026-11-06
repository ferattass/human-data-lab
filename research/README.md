# research/ — erken deneyler (deneysel)

Bu klasör, ürün raporu yazılmadan önce ve sırasında yapılan keşif deneylerini içerir. **v0.1 kapsamı dışındadır**
([ADR 0009](../docs/adr/0009-research-separation.md)): çekirdeğin sözleşme, kanıt ve kabul testi güvencelerini taşımaz.

| Araç | Soru | Çalıştırma |
|---|---|---|
| `src/run.mjs` | İlk roundtrip prototipi | `hdl lab roundtrip <adapter>` |
| `src/search-run.mjs` | Kayıt, kullanıcının yazabileceği biçimlerle (Türkçe küçük/büyük, NFD, ASCII) bulunuyor mu? Negatif kontrollü. | `hdl lab search <adapter>` |
| `src/identity-run.mjs` | Aynı posta kutusunun farklı yazımı ikinci hesap açtırıyor mu? | `hdl lab identity <adapter>` |
| `src/collision-run.mjs` | Yalnız aksan/noktalamayla ayrılan adlar ayrı kayıt kalıyor mu? | `hdl lab collision <adapter>` |

Testler: `npm run test:research` (Docker gerektirmez; yerel demo uygulamasıyla).

## Özet bulgular (yerel Docker, sentetik veri, Kasım 2026)

- Modern varsayılan kurulumlarda (MySQL 8 `utf8mb4`, Postgres 16) tek değerin kaydet → oku yolculuğu sağlam çıktı.
- Eski `utf8mb3` tablolar 4 baytlık karakterleri (emoji, astral CJK) ya HTTP 500 ile reddetti ya da **sessizce boş** kaydetti.
- Türkçe noktasız ı/I içeren adlar, MySQL ve Postgres'in varsayılan collation'larında Türkçe küçük/büyük harfle aranınca bulunamadı.
  Bu bir uygulama hatasından çok varsayılan ayar sonucudur; `utf8mb4_tr_0900_ai_ci` ile düzeliyor.
- Test edilen uygulamaların hiçbiri aynı posta kutusunun farklı yazımıyla ikinci hesap açtırmadı.
- Sorunlar en çok **eşleme** noktalarında (arama, tekillik, adla bulma) yoğunlaştı. Bu, ürünün sonraki fazları için yön gösteriyor.

Belirli açık kaynak uygulamalarda bulunan ve henüz bakımcılarına bildirilmemiş hataların ayrıntıları, sorumlu bildirim
tamamlanana kadar bu depoda yayımlanmamaktadır.
