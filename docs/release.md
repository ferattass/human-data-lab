# Sürüm ve yayın akışı

Sürüm numarası tek yerde durur: `package.json`. CLI ve manifest (`TOOL.version`) oradan okur.

## Adımlar

1. `CHANGELOG.md`: "Yayımlanmamış" bölümünü sürüm başlığına çevir (`## [X.Y.Z] — YYYY-AA-GG`), yeni boş "Yayımlanmamış" aç.
2. `npm version X.Y.Z --no-git-tag-version` (yalnız `package.json` ve `package-lock.json`).
3. `npm run typecheck && npm test` yeşil.
4. Commit: `release: vX.Y.Z — <kısa özet>`.
5. Public dala yayımla ve etiketle. Etiket **public dalın** commit'ine konur; sürüm numarası `package.json` ile aynı olmalıdır (iş akışı denetler):

   ```bash
   git tag -a vX.Y.Z public -m "Human Data Lab vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. `release.yml` iş akışı etiketle tetiklenir: testler, `npm pack` tarball'ı ile GitHub Release (notlar CHANGELOG bölümünden) ve
   npm'e **provenance** ile yayın.

## npm'e yayın (trusted publishing)

İş akışı token kullanmaz; npm **trusted publishing** (OIDC) ile yayımlar. Bir kez yapılması gereken:

1. npmjs.com → paket sayfası → *Settings* → *Trusted Publishing* → GitHub Actions: depo `ferattass/human-data-lab`,
   iş akışı dosyası `release.yml`, ortam boş.
2. İlk yayın için paket adı boşsa önce yerelden `npm publish --access public` ile paket oluşturulur (bir kez), sonra trusted publishing bağlanır.
3. Gerekirse paketi *Settings → Publishing access* altında "Require two-factor authentication or an automation token / trusted publisher" olarak kilitle.

Yayın yoksa veya başarısızsa GitHub Release yine oluşur; `npm` işi bağımsızdır ve günlükte nedenini söyler.

## Sürümleme

[SemVer](https://semver.org/lang/tr/). 1.0 öncesi küçük sürümler (`0.X`) kırıcı değişiklik içerebilir; kırıcı değişiklik CHANGELOG'da
"Değiştirildi" altında açıkça yazılır. Şema sürümü (`schemaVersion`) paket sürümünden bağımsızdır: bilinmeyen büyük şema sürümü okunmaz.

## Yayın öncesi kontrol

- `npm pack --dry-run` içeriği: `bin/`, `dist/`, `schema/`, README'ler, `AGENTS.md`, `LICENSE`, `NOTICE`, `CHANGELOG.md`; kaynak, test, koşu dizini ve PDF yok (`test/package.test.ts` zorlar).
- README'deki test sayısı ve sürüm rozeti güncel.
- `docs/scope.md` yeni yeteneği "Destekleniyor" diye yalnız testi varsa yazar.
