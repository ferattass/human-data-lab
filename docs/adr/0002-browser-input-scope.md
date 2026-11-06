# 0002 — Chromium + Playwright `fill`

**Karar.** v0.1 yalnız Chromium ve `fill` giriş yöntemini destekler. Diğer yöntemler preflight'ta yapılandırma hatasıdır.

**Bağlam.** Gerçek klavye, IME composition, yapıştırma ve mobil klavye ayrı olay dizileri üretir; doğrulanmadan desteklenmiş sayılamaz.

**Alternatifler.** Firefox/WebKit matrisi; `keyboard.type`; IME simülasyonu.

**Geri dönüş.** Pilot farklı tarayıcı veya giriş yöntemi gerektirirse; her biri ayrı platform matrisi ve kabul testleri ister.

**Testler.** Fixture/sözleşme doğrulaması (`inputMethod: 'fill'`), B01–B02.
