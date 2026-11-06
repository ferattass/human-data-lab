# 0006 — Yerel, minimum kanıt, açık şema

**Karar.** Her koşu yeni `run-<id>/` dizini; manifest atomik yazılır; dosya digest'leri; eksik/bozuk kanıt ve dizin dışı yol
açıkça raporlanır. HTML rapor script çalıştırmaz, dış kaynak yüklemez (CSP), tüm veri escape'lidir. Paylaşım allowlist ile;
auth state, cookie ve trace varsayılan dışarıda. Hata mesajları redakte edilir. Koşu dizinindeki yapılandırma yolu
kendiliğinden import edilmez (paylaşılan paket kod çalıştıramaz).

**Geri dönüş.** Takım paylaşımı için gerçek ihtiyaç oluşursa.

**Testler.** C07–C12.
