# Karar kayıtları (ADR)

Tartışmalı kararlar sessiz değişmesin (rapor §39). Her kayıt: karar, bağlam, alternatif, gerekçe, geri dönüş koşulu ve
etkilediği test kimlikleri. Geçmiş sonuçlar yeni bir politikayla geriye dönük sessizce güncellenmez.

| # | Karar | Durum |
|---|---|---|
| [0001](0001-oracle.md) | Yerleşik exact + açık NFC; örtük dönüşüm yok | Kabul |
| [0002](0002-browser-input-scope.md) | Chromium + Playwright `fill` | Kabul |
| [0003](0003-execution-model.md) | Tek tanımlı akış, veri varyasyonu; keşif yok | Kabul |
| [0004](0004-data-isolation.md) | Sahipli namespace, seri koşu | Kabul |
| [0005](0005-ai-optional.md) | Çekirdekte AI/model çağrısı yok | Kabul |
| [0006](0006-artifact-model.md) | Yerel, minimum kanıt, açık şema, inert HTML | Kabul |
| [0007](0007-typescript-no-build.md) | TypeScript, build adımı yok (Node tip silme) | Kabul |
| [0008](0008-license.md) | Apache-2.0 | Kabul |
| [0009](0009-research-separation.md) | Arama/kimlik/çakışma deneyleri `research/` altında, v0.1 dışında | Kabul |
| [0010](0010-mcp-server.md) | MCP sunucusu: ajanlar çekirdeğe okur, karar vermez; `hdl_run` yalnız `--allow-run` | Kabul |
