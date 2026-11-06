# 0001 — Oracle: yerleşik exact + açık NFC

**Karar.** Korunma kuralları kapalı bir settir: `text.exact.v1` (JS dizgisi tam eşit) ve kullanıcı açıkça seçerse `text.nfc.v1`.
Varsayılan olarak trim, case-fold, NFKC veya Türkçe harf eşlemesi uygulanmaz. NFC geçse bile ham fark (`rawEqual`) saklanır.

**Bağlam.** Görsel benzerlik, kod noktası eşitliği ve kanonik eşdeğerlik ayrı kavramlardır (UAX #15). Her dizgiyi sessizce
normalleştirmek tarafsız bir kontrol değildir; NFKC anlamlı ayrımları silebilir.

**Alternatifler.** Yapılandırılabilir normalleştirici zinciri; kullanıcı tanımlı comparator (JS); "akıllı" eşdeğerlik.

**Gerekçe.** Küçük, öngörülebilir, açıklanabilir set. Dışarıdan gelen JSON'a gömülü kod çalıştırılmaz.

**Geri dönüş.** Gerçek uygulama ihtiyacı başka bir eşdeğerlik gerektirirse yeni kural kimliği (`text.<ad>.v1`) ve kabul testleri ile.

**Testler.** A01–A07, A12, A14.
