# 0009 — Deneyler `research/` altında

**Karar.** Ürün raporu öncesi ve sırasında yapılan arama, e-posta kimliği ve ad çakışması deneyleri `research/` altında,
v0.1 kapsamı dışında ve "deneysel" etiketiyle tutulur (`hdl lab …`). Çekirdek bunlara bağımlı değildir.

**Bağlam.** Rapor arama ve export'u sonraki faz sayar (§8, §21): indeks gecikmesi ve sorgu semantiği ayrı oracle ister.

**Gerekçe.** Deneyler ürün yönüne kanıt sağladı (sorunlar eşleme noktalarında yoğunlaşıyor), ama aynı güvencelerle sunulamaz.

**Geri dönüş.** Roundtrip kullanıcıları aynı sorunu tekrar yaşıyorsa, ayrı sözleşme ve kabul testleriyle `packages/` altına taşınır.
