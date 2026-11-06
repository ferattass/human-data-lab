# Değişiklik günlüğü

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/). Sürümleme: [SemVer](https://semver.org/lang/tr/); 1.0 öncesinde küçük sürümler kırıcı değişiklik içerebilir.

## [Yayımlanmamış]

### Güvenlik
- `hdl export` sembolik bağlantıları ve junction'ları izlemez. Başkasından gelen bir koşu dizinindeki bağlantı
  (ör. `report.html → ~/.ssh/id_rsa`) hedefin içeriğini paylaşım paketine taşıyamaz.
- Paylaşım kopyası doğrulanmış dosya tanımlayıcısından yapılır: POSIX'te `O_NOFOLLOW` ile açılır, `dev/ino` denetimden
  sonra değişmişse reddedilir. Hedef dosyaların üzerine yazılmaz.

## [0.5.0] — 2026-11-06

### Eklendi
- **Paket:** `npm run build` derlenmiş `dist/` (JS + `.d.ts`) üretir; `npm pack` tarball'ı kaynak kodu olmadan çalışır.
  Dışa aktarımlar: `human-data-lab` (= `/playwright`), `/playwright/test`, `/core`, `/corpus`, `/store`, `/reporter`, `/schema/*`.
- `hdl init` kurulu pakette taslakları `human-data-lab/playwright` ile import eder.
- Görsel kimlik: README, HTML rapor ve animasyonlar marka paletiyle (`docs/brand`).
- Test: kurulu paketten demo (`test/package.test.ts`), çok satırlı `textarea` roundtrip'i, ASCII dışı yolda paylaşım paketi.
- CI: Linux, Windows ve macOS; Node 22 ve 24.

### Düzeltildi
- `hdl export` ve testler, Windows'ta yolda ASCII dışı karakter (ör. `Yayında`) varken çöküyordu:
  Node 24.14'te `fs.cpSync` bu durumda hiçbir hata basmadan 127 koduyla sonlanıyor. `copyFileSync` tabanlı kopyaya geçildi.
- Artifact yollarında ters eğik çizgi, sürücü harfi ve `:` her işletim sisteminde reddedilir (C09; Linux'ta `C:\x` kabul ediliyordu).
- `hdl --version` yardım metni yerine sürümü basar.

## [0.4.0] — 2026-11-06

İlk public sürüm: ürün raporuna göre yeniden kurulan TypeScript çekirdeği, Playwright çalıştırıcısı, kanıt paketi,
HTML rapor, replay, küçültme, 99 fixture'lık corpus, JSON şemaları, CLI, demo ve 42 kabul senaryosu.
