# 0004 — Sahipli namespace, seri koşu

**Karar.** Her deneme kendi namespace'inde çalışır; rezervasyon ilk mutasyondan önce `allocations.jsonl`'a yazılır.
Cleanup yalnız sahipli kaynaklara dokunur, idempotenttir ve doğrulanır. Paralellik 1 worker. Deneme kapandıktan sonra
adapter yeni sayfa/istek bağlamı açamaz (iptal sonrası mutasyon yok).

**Bağlam.** Yeni browser context'i cookie/localStorage'ı ayırır; backend kayıtlarını, kuyrukları veya harici servisleri temizlemez.

**Geri dönüş.** Bağımsız backend namespace'i kanıtlanırsa sınırlı paralellik.

**Testler.** B10–B13, C03, C06.
