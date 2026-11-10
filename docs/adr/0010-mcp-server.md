# 0010 — MCP sunucusu: ajanlar çekirdeğe okur, karar vermez

**Karar.** `hdl mcp`, Model Context Protocol üzerinden (stdio, JSON-RPC 2.0) çekirdeğin oracle'ını, corpus'u, sözleşme doğrulamasını ve
koşu kanıtını kod ajanlarına açar. Varsayılan salt okunurdur; `hdl_run` yalnız operatör sunucuyu `--allow-run` ile başlattıysa açılır.
Sunucu bağımlılıksızdır (`packages/mcp`), ikinci bir oracle yazmaz ve `cli` ile aynı `RunView` görünümünü döner.

**Bağlam.** Kod ajanları artık test araçlarının birinci sınıf kullanıcısı. ADR 0005 çekirdekte model çağrısını yasaklar; bu kararı
tersine çevirmeden ajanların aracı **kullanmasını** mümkün kılmak gerekir. Araç hedef uygulamada yazar (§30); bir ajanın koşu başlatması
operatörün bilgisi dışında olmamalıdır.

**Alternatifler.** Resmî SDK bağımlılığı (çalışma zamanı bağımlılığı sıfırdan bire çıkar); yalnız CLI + `--json` (yeterli ama araç
tanımları ve şema kaynakları ajan için daha keşfedilebilir); HTTP taşıması (yerel araç için gereksiz saldırı yüzeyi).

**Gerekçe.** Protokolün gereken kısmı küçüktür (initialize, tools/list, tools/call, resources/*); satır ayraçlı JSON-RPC birkaç yüz satırda
test edilebilir biçimde yazılır. Salt okunur varsayılan ve açık `--allow-run` kapısı, aracın güvenlik sınırını (§30) ajan kullanımına taşır.

**Geri dönüş.** Protokol değişikliği bu uygulamayı sürdürmeyi pahalılaştırırsa resmî SDK'ya geçilir; araç adları ve `RunView` korunur.

**Testler.** `test/mcp.test.ts` (protokol, hata kodları, kapı, gerçek koşu), `test/architecture.test.ts` (mcp bağımlılık yönü).
