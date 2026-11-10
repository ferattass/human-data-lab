## Ne değişti

<!-- Bir iki cümle. Hangi sözleşme, paket veya belge? -->

## Neden

<!-- Sorun, ADR veya issue bağlantısı. Ürün kararını değiştiriyorsa docs/adr altında yeni kayıt. -->

## Kanıt

- [ ] `npm run typecheck` ve `npm test` yerelde yeşil
- [ ] Yeni davranışın testi var (kabul senaryosu kimliği veya yeni test adı: …)
- [ ] Fixture değişikliği varsa: `node packages/corpus/scripts/write-corpus.ts` çalıştı, corpus sürümü ve `packages/corpus/CHANGELOG.md` güncel
- [ ] Belgeler güncel (`README`, `docs/scope.md`, `docs/contracts.md`, `CHANGELOG.md` "Yayımlanmamış")

## Kontrol

- [ ] Gerçek kişi verisi, müşteri dosyası, auth state, cookie, trace veya saldırı payload'ı yok
- [ ] Çekirdeğe örtük normalleştirme (trim / case-fold / NFKC) eklenmedi; yeni eşdeğerlik yeni kural kimliğiyle geldi
- [ ] "Destekleniyor" etiketi yalnız testi olan yetenek için kullanıldı
