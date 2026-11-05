# Deney sonuçları — 5 Kasım 2026

Soru: 25 fixture'lık korpus, gerçek uygulamaların form → kaydet → taze okuma yolunda insan metni sorunu buluyor mu?
Hepsi yerel Docker, sentetik veri, Chromium + `fill`. Ham sonuçlar: `runs/*.json`.

## Varsayılan (modern) kurulumlar

| Uygulama / alan | Stack | Unicode ihlali | Diğer |
|---|---|---|---|
| WordPress 7.1.4 — kullanıcı First Name | PHP + MySQL 8.4 utf8mb4 | 0 / 23 | baş/son boşluk kırpılır, çift boşluk teke iner (sanitize_text_field politikası) |
| WordPress — ziyaretçi yorum adı | aynı | 0 / 23 | aynı boşluk politikası |
| Gitea 28.3 — Full Name | Go + Postgres 16 | 0 / 24 | uzun ad tarayıcıdaki `maxlength=100` ile **gönderimden önce** kesiliyor (ilk sapma: injected) |
| Redmine 7.0.3 — First name | Ruby + MySQL 8.4 utf8mb4 | 0 / 24 | 30+ karakter açık hata mesajıyla reddediliyor (doğru davranış) |

**Sonuç: iyi bakılan modern stack'lerde metin roundtrip'i sağlam. Araç burada hata bulmadı.**

## Eski (utf8mb3) tabloya sahip kurulumlar — yükseltilmiş eski sistemleri taklit eder

| Uygulama | Davranış | Ciddiyet |
|---|---|---|
| Redmine (users tablosu utf8mb3) | Emoji / 4 baytlık CJK → **HTTP 500** (`Incorrect string value`). Rails strict modu zorladığı için veri bozulmuyor; kayıt yapılamıyor. Non-strict sql_mode'da da aynı. | Görünür hata |
| WordPress (wp_usermeta utf8mb3) | Emoji / 4 baytlık CJK → "New user created" der, **First Name boş kaydedilir**. MySQL'de doğrulandı: `meta_value=''`, 0 bayt. 2 bağımsız koşuda kararlı. | **Sessiz veri kaybı** |

Not: wp_comments dönüşümü strict mod (`comment_date` varsayılanı) nedeniyle başarısız oldu; yorum yolu eski senaryoda test edilmedi.

## Araç hakkında öğrenilenler

- Korpus + iki fonksiyonluk adapter yeterli; her uygulama ~30-45 satır.
- Yürütme hatası ≠ veri hatası: WordPress'te şifre JS ile asenkron üretildiği için 3 sahte "red" çıktı; yeniden üretilemedi, adapter yarışı olarak düzeltildi.
- 5xx ayrı bir sonuç olmalı (eklendi: `server-error`); başlangıçta "red" diye yanlış etiketlendi.
- İlk sapma noktası (injected vs readback) gerçek değer üretti: Gitea'daki kesme sunucu değil, tarayıcı sınırı.

## Ürün kararı için anlamı

- Değer önerisi "modern uygulamada hata bul" değil; **"eski/yükseltilmiş kurulumlarda ve stack değişikliklerinde (DB taşıma, charset, ORM/sanitizer değişimi) sessiz veri kaybını CI'da yakala"**.
- Bulgu üreten tek senaryo konfigürasyon kaynaklıydı. Sonraki adım: arama/case-fold (Türkçe İ), CSV export ve e-posta/slug yolları — hata yoğunluğunun daha yüksek olması beklenen alanlar.

---

# Tur 2 — Arama ve CSV dışa aktarma (5 Kasım 2026)

Yeni araçlar: `src/variants.mjs` (9 sorgu biçimi), `src/search-run.mjs` (arama matrisi + negatif kontrol), `src/csv.mjs`.
Ham sonuçlar: `runs/search-*.json`, `runs/redmine-issue*.json`.

## Bulgu 1 — Türkçe noktasız ı / I araması (3 uygulamada, 2 veritabanında)

"Ilık Işık" kaydı Türkçe doğru küçük harf ("ılık ışık") ve büyük harf ("ILIK IŞIK") sorgularıyla **bulunamıyor**.
Yalnız tam aynısı veya yanlış Türkçe "ilık işık" bulur. Aynı desen: Redmine kullanıcı + iş araması (MySQL), WordPress yorum araması (MySQL), Gitea kullanıcı araması (Postgres).

Kök neden (MySQL, doğrudan SQL ile doğrulandı):

| kayıt | sorgu | varsayılan `utf8mb4_0900_ai_ci` | Türkçe `utf8mb4_tr_0900_ai_ci` |
|---|---|---|---|
| Işık | ışık | ✗ | ✓ |
| Işık | IŞIK | ✗ | ✓ |
| Kılıç | KILIÇ | ✗ | ✓ |
| İpek | ipek | ✓ | ✓ |

Etki: adında ı/I olan kişiler (Işık, Irmak, Ilgaz, Kılıç, Yıldız…) büyük harfle ya da Türkçe küçük harfle aranınca çıkmıyor.
Bu bir uygulama hatasından çok varsayılan ayar sonucu; ama kullanıcının gördüğü şey "kayıt yok".

## Bulgu 2 — WordPress 7.1.4: apostroflu yorumcu adı aranamıyor (gerçek hata)

- `O'Brien` adıyla bırakılan yorum veritabanında doğru (`4F 27 …`).
- Yönetici > Yorumlar araması: `O'Brien` → **0 sonuç**, `Brien` → bulunur. 3 bağımsız koşuda tekrarlandı.
- Üretilen SQL (MySQL general log): `comment_author LIKE '%O\\\'Brien%'` → literal `O\'Brien` arıyor.
  WordPress'in istek verisine eklediği ters eğik çizgi (wp_magic_quotes) arama teriminden kaldırılmıyor.
- Etki: O'Brien, D'Angelo, N'Diaye… tam adla bulunamaz. Tipografik apostrof (’) sorunsuz.
- Yayından önce WordPress Trac'te bilinen kayıt olup olmadığı kontrol edilmeli.

## Diğer gözlemler (politika / beklenen)

- Hiçbir arama NFD ↔ NFC kanonik eşdeğerliği uygulamıyor: ayrık aksanla ("José") kaydedilen ad, normal "José" ile bulunamıyor (ve tersi). macOS/dosya adından kopyalanan metinde görülebilir.
- MySQL aksan duyarsız ("Ipek Caglar" → "İpek Çağlar" bulunur), Postgres/Gitea aksan duyarlı (bulunmaz).
- WordPress kayıtta boşlukları kırpıp tekilleştiriyor ama aramada kırpmıyor: " Ali Veli " / "Ali  Veli" sorgusu kendi kaydını bulamaz.

## CSV dışa aktarma — Redmine iş listesi

Varsayılan diyalog (İngilizce ve Türkçe arayüz): UTF-8 + BOM. 25/25 fixture CSV'de aynen korunuyor.
Not: Redmine'in `general_csv_encoding` çevirisi hâlâ ISO-8859-1 / ISO-8859-9, ama Redmine 7 diyaloğu varsayılan olarak UTF-8 seçiyor; kullanıcı elle değiştirirse kayıp olur (test edilmedi, kullanıcı tercihi).

## Araç dersleri (bu tur)

- 2 sahte pozitif/negatif yakalandı ve düzeltildi: Redmine 7 kullanıcı filtresi URL formatı değişmiş (tüm sorgular "bulunamadı"); Gitea'da oturum açıkken üst menüdeki profil linki her sorguyu "bulundu" yaptı.
- Kalıcı önlem: arama koşusu artık **negatif kontrol** yapıyor; anlamsız sorgu "bulundu" dönerse matris üretilmez (exit 2). Bozuk adapter ile doğrulandı.
- Ortam kirliliği gerçek: önceki utf8mb3 deneyi Redmine konteynerindeki `db/schema.rb`'ye sızdı ve yeni kurulumu etkiledi. Konteyner silinerek temizlendi.

## Güncel ürün sonucu

Metin kaydı modern stack'te sağlam; **arama** en verimli alan: 4 arama yolunda 2 ayrı sorun sınıfı, biri WordPress'te gerçek hata.
Türkçe ı/I + apostrof gibi küçük, açıklanabilir vakalar demo ve içerik için güçlü.

---

# Tur 3 — E-posta kimliği ve benzersiz adlar (6 Kasım 2026)

Yeni araçlar: `corpus/email-identity.json` (12 çift), `src/identity-run.mjs`, `adapters/*-user-email.mjs`, `experiments/repro-round3.mjs`.
Ham sonuçlar: `runs/identity-*.json`. Tekrar üretim: `node experiments/repro-round3.mjs` (her çalıştırmada benzersiz adlar).

## E-posta kimliği — 3 uygulamada da sağlam (negatif sonuç)

12 çift (büyük harf, alan adı harfi, boşluk, IDN ↔ punycode, NFD, tam genişlik, Türkçe ı/İ, Kelvin `K`, uzun `ſ`, Türkçe yerel kısım).
Tarayıcı dönüşümünü ayırmak için alan `type=text` yapıldı; sunucu ham değeri gördü.

| | WordPress 7.1.4 | Gitea | Redmine 7.0.3 |
|---|---|---|---|
| Aynı posta kutusuna 2. hesap | 0 / 12 | 0 / 12 | 0 / 12 |
| Unicode / IDN adres | reddedilir (yalnız ASCII) | reddedilir | IDN → punycode'a çevrilir, tekilleştirilir |
| Baş/son boşluk | reddedilir | reddedilir | kırpılır, tekilleştirilir |
| Sessiz değişiklik | yok | yok | yalnız IDN → punycode (doğru) |

Yan gözlem: Redmine'in tekillik kontrolü `ｈｄｌ`, `İLK`, `Kim` (Kelvin), `ſam` adreslerini ASCII karşılıklarıyla **aynı** sayıyor (MySQL collation).
Biçim kontrolü bunları zaten reddettiği için zararsız; ama aynı collation Unicode'a izin veren benzersiz alanlarda sorun yaratır → aşağıdaki iki bulgu.

## Bulgu 3 — WordPress: adla etiket ataması yanlış etikete gidiyor (gerçek hata, 2 ayrı kod yolu)

İki ayrı etiket var: `Şiş` ve `Sis` (WordPress ikisini de oluşturuyor, slug'lar `sis` / `sis-2`).
Kullanıcı yazıya Hızlı Düzenle'de `Sis` yazıyor → yazı **`Şiş`** ile etiketleniyor. 3/3 koşu, tarayıcıda, taze sayfa yüklemesiyle doğrulandı.

| Girilen | Var olan etiketler | Bağlanan |
|---|---|---|
| `Sis` | Şiş, Sis | **Şiş** |
| `ano` | año, ano | **año** |
| `Kul` | Kül (Kul yok) | **Kül** — "Kul" hiç oluşturulamıyor |

İki farklı kök neden:

1. **Yönetici etiket kutusu** (Hızlı/Toplu Düzenle, klasik editör) — `taxonomy_meta_box_sanitize_cb_input()` (`wp-admin/includes/post.php`)
   adı `get_terms(['name' => …])` ile arıyor; SQL karşılaştırması `utf8mb4_unicode_520_ci` ile **aksan duyarsız**, ilk eşleşme (`$_term[0]`) alınıyor.
2. **Programatik yol** (`wp_set_post_tags`, `tags_input`, WP-CLI, içe aktarıcılar) — `term_exists()` (`wp-includes/taxonomy.php`)
   adı önce `sanitize_title()` ile slug'a çevirip **slug'la** arıyor. Aksan ve noktalama düşüyor:
   `C++` ve `C#` etiketleri ayrı ayrı var olsa da `tags_input="C++,C#"` yazıyı **`C`** ile etiketliyor.
   (Yönetici kutusu bu örnekte doğru: collation `C++` ile `C`'yi ayırır.)

Blok editörü etkilenmiyor: etiketleri kimlik numarasıyla atıyor (doğrulandı).
Etki: Türkçe (çam/cam, şiş/sis, kül/kul), İspanyolca (año/ano), Almanca (Straße/Strasse), programlama dilleri (C/C++/C#) etiketleri birbirine karışır; sessizdir, hata mesajı yoktur.

## Bulgu 4 — Redmine 7.0.3 (MySQL): wiki sayfası aksanlı ikizinin üzerine yazıyor (gerçek hata)

Projede `Çam` sayfası var. Kullanıcı `Cam` sayfasını açıyor → **Çam'ın düzenleyicisi** geliyor; kaydedince Çam'ın içeriği değişiyor.
Sayfa listesinde `Cam` hiç oluşmuyor. 4 bağımsız projede tekrarlandı; Çam'ın sürüm geçmişine 2. sürüm olarak yazılıyor (eski içerik geçmişten geri alınabilir).

| Önce | Sonra açılan | Sonuç |
|---|---|---|
| Çam | Cam | Çam'ın üzerine yazıldı |
| Şiş | Sis | Şiş'in üzerine yazıldı |
| Straße | Strasse | Straße'nin üzerine yazıldı |
| Kır | Kir | doğru — ayrı sayfa (kontrol: `0900_ai_ci` ı ≠ i) |

Kök neden: `app/models/wiki.rb:58` — `pages.find_by("LOWER(title) = LOWER(?)", title)`.
Niyet büyük/küçük harf duyarsızlığı; ama `wiki_pages` tablosu MySQL 8 varsayılanı `utf8mb4_0900_ai_ci` olduğundan karşılaştırma **aksan duyarsız** da oluyor.
Wiki bağlantıları (`[[Cam]]`) da Çam'a gider. Postgres kurulumunda `LOWER()` yalnız harf büyüklüğünü katlar; orada beklenmez (test edilmedi).

## Araç dersleri (bu tur)

- Tarayıcı `type=email` alanı değeri kendisi düzeltebilir; sunucu davranışını ölçmek için alan türü değiştirilip gönderilen değer ayrıca kaydedilmeli.
- Kontrol çifti (Kır/Kir) her matriste olmalı: beklenen "doğru" sonucu verdiği için bulguyu collation'a bağlamayı mümkün kıldı.
- Yeni hata sınıfı: **benzersizlik/arama eşlemesi** (tek değerin roundtrip'i değil, iki değerin karışması). Korpusa "yalnız aksanla ayrılan gerçek kelime çiftleri" eklenmeli.
- WordPress Trac otomatik erişimi engelliyor (403); Bulgu 2–3'ün bilinen kayıt olup olmadığı elle kontrol edilmeli.

## Güncel ürün sonucu

3 tur, 4 uygulama: tek değer roundtrip'i modern stack'te sağlam; hatalar **eşleme** noktalarında (arama, tekillik, adla bulma).
En güçlü demo: "Cam sayfasını aç, Çam'ı sil" (Redmine) ve "Sis yaz, Şiş gelsin" (WordPress) — ikisi de tek komutla tekrar üretilebilir.

## Tur 3b — Çakışma aracı (`src/collision-run.mjs`) ile sistematik koşu

Bulgu 3–4 elle bulunduktan sonra genel bir araca dönüştürüldü: `corpus/name-pairs.json` (13 çift: 1 kontrol, 10 "ayrı kalmalı", 2 politika).
Adapter iki fonksiyon: `save(page, {name, body}) → {recordId}` (uygulamanın **gerçekte** yazdığı kayıt) ve `read(context, id)`.
Doğrulama: demo uygulamada doğru mod 0, `fold-lookup` 7, `slug-lookup` 9 karışma (beklenen) — araç iki mekanizmayı ayırt ediyor.

| Uygulama | Karışan (10 "ayrı" çiftten) | Biçim | Kontrol |
|---|---|---|---|
| Redmine 7.0.3 wiki (MySQL) | **7** — Çam, Şiş, Kül, Göl, Año, Straße, Résumé | `overwritten`: B'yi kaydetmek A'nın içeriğini değiştirir | Elma/Armut ✓, Kır/Kir ✓, C++/C ✓ |
| WordPress 7.1.4 Hızlı Düzenle etiketi | **10** — yukarıdakiler + Kır/Kir, C++/C, C#/C | `merged`: B etiketi oluşturulamaz, yazıya A bağlanır | Elma/Armut ✓ |

WordPress'te B henüz yokken iki mekanizma art arda çalışıyor: ad collation'la eşleşmezse (`C` ≠ `C++`) değer `wp_set_object_terms` → `term_exists()`'e gidiyor ve **slug**'la eşleniyor (`c` = `c`, `kir` = `kir`).
Yani Hızlı Düzenle'de "C" etiketini oluşturmak mümkün değil; yazı "C++" ile etiketleniyor. Blok editörü bu yolda değil (REST ile yeni etiket oluşturur, slug `-2` alır).

Ham sonuçlar: `runs/collision-*.json`.
