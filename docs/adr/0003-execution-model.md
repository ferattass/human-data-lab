# 0003 — Tek tanımlı akış, veri varyasyonu

**Karar.** Runner, kullanıcının tanımladığı tek bir akışı (create → fresh read → cleanup) farklı fixture'larla tekrarlar.
Eylem dizisi keşfi, rastgele site gezinmesi veya form otomatik anlama yapılmaz. `hdl init` yalnız incelenebilir taslak üretir.

**Gerekçe.** Hedef "her formu anlamak" değil, belirli bir veri yolculuğuna korunma sözleşmesi eklemeyi kolaylaştırmak (§7).

**Geri dönüş.** Gerçek fayda eylem dizisi keşfine bağlı çıkarsa.

**Testler.** B03–B09.
