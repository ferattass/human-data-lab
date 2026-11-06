# Güvenlik

## Açık bildirmek

Güvenlik açıklarını **herkese açık issue olarak açmayın**. GitHub'daki
**Security → Report a vulnerability** (özel güvenlik bildirimi) yolunu kullanın.
Bildirimde etkilenen sürüm, tekrar üretim adımları (sentetik veriyle) ve etki bilgisi olsun.

Hedef: 7 gün içinde ilk yanıt; düzeltme ve koordineli açıklama zamanlaması birlikte belirlenir.

## Kapsam — aracın kendi güvenlik sınırı

Bu araç hedef uygulamada **yazma işlemi yapar** (kayıt oluşturur, temizler). Tasarım gereği:

- Varsayılan hedef localhost veya açıkça izin verilmiş staging'dir; üretim verisini keşfeden tarayıcı/scanner değildir.
- Gezinme, yönlendirme, fixture API, okuma ve cleanup yalnız `allowedOrigins` içindeki originlere gider.
  Korumalı API istekleri yönlendirme izlemez (`maxRedirects: 0`). Bu kontrol bir OS sandbox'ı değildir.
- Auth state, cookie ve test token'ları artifact'a yazılmaz; hata mesajları kaydedilmeden önce redakte edilir
  (Playwright "Call log" bölümü atılır, bilinen sırlı başlıklar ve adapter'ın bildirdiği sırlar maskelenir).
  Redaction kusursuz gizlilik garantisi **değildir**.
- HTML rapor script çalıştırmaz, dış kaynak yüklemez (CSP `default-src 'none'`), tüm veri escape edilir.
- Artifact yolları koşu dizini dışına çıkamaz; `hdl export` yalnız allowlist dosyalarını kopyalar.
- Özel adapter ve comparator kodu **güvenilen yerel proje kodudur**; sandbox edilmiş gibi sunulmaz.

Bu sınırlardan birini aşan davranış güvenlik açığıdır; lütfen bildirin.

## Bu araçla bulunan üçüncü taraf hataları

Araçla başka bir projede bulduğunuz hatayı o projenin kendi güvenlik/hata bildirim yoluyla bildirin.
Başkalarının üretim sitelerinde izinsiz test çalıştırmayın; bu rapor/araç böyle bir yetki vermez.
