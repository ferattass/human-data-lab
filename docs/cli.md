# CLI referansı

`hdl` depoda TypeScript kaynağından (Node ≥ 22.18), kurulu pakette derlenmiş `dist/` içinden çalışır. `hdl --help` aynı listeyi basar.

Bayrak biçimi: `--ad değer` veya `--ad=değer`. Değer almayan bayraklar (`--json`, `--dry-run`, `--include-evidence`, `--owned-only`,
`--no-reproduce`, `--no-shrink`, `--allow-run`) sonraki argümanı yutmaz; değer bekleyen bir bayrak değersiz kalırsa açık hata verilir (exit 2).

## Komutlar

| Komut | Bayraklar | Ne yapar |
|---|---|---|
| `hdl demo` | `--out <dizin>` (varsayılan `runs/demo`) | Sentetik profil uygulamasıyla dört senaryo: doğru mod, A (işaret kaybı), B (izinli NFC), C (red + yürütme engeli). Beklenen çıkış kodları tutmazsa 1. |
| `hdl init --adapter playwright` | `--dir <dizin>` (varsayılan `hdl`) | `adapter.ts` ve `roundtrip.config.ts` taslaklarını yazar; var olan dosyanın üzerine yazmaz; siteyi keşfetmez. |
| `hdl run <roundtrip.config.ts>` | `--corpus smoke\|full\|<set>` · `--out <dizin>` · `--no-reproduce` · `--no-shrink` | Yapılandırmayı import eder (kod çalışır), gerçek Chromium'da koşar, `run-<id>/` kanıt paketi ve `report.html` yazar. Ctrl+C: mevcut deneme durur, sahipli kaynaklar ayrı bütçeyle temizlenir, exit 130. |
| `hdl replay <run-dizini> --finding f1 --config <dosya>` | `--candidate original\|best` · `--out <dizin>` | Saklı somut değeri aynı adapter ve hedefte 3 kez yeniden dener. Sözleşme digest'i, adapter sürümü veya hedef farklıysa uyuşmazlıklar yazılır ve koşu "regresyon" olarak etiketlenir. |
| `hdl report <run-dizini>` | `--out <dosya.html>` · `--json` | Bütünlüğü denetler (eksik dosya, digest, listelenmeyen dosya), özet basar; rapor yoksa üretir. `--json`: makine okunur `RunView`. Çıkış kodu koşunun kodudur; tamamlanmamış koşu en az 2 (130 ve 3 korunur). |
| `hdl cleanup <run-dizini> --owned-only --config <dosya>` | — | Yalnız `allocations.jsonl`'daki, doğrulanmış temizliği olmayan namespace'leri adapter'ın `cleanup`'ı ile temizler. Hedef eşleşmezse veya günlük bütünlüğü bozuksa çalışmaz. Sonuç `recovery/cleanup-<zaman>.json`. Doğrulanamayan varsa exit 3. |
| `hdl export <run-dizini> --out <dizin>` | `--include-evidence` · `--dry-run` | Paylaşım paketi: yalnız allowlist dosyaları (manifest, contract, fixtures, attempts, observations, findings, repro, report). Auth/storageState/trace/cookie ve sembolik bağlantılar dışarıda. `--dry-run` yalnız planı yazar. |
| `hdl mcp` | `--allow-run` · `--root <dizin>` | MCP sunucusu (stdio). Varsayılan salt okunur; `--allow-run` ile `hdl_run`. Ajanın verdiği yollar `--root` (varsayılan çalışma dizini) içinde kalır. Ayrıntı: [`AGENTS.md`](../AGENTS.md). |
| `hdl lab <search\|identity\|collision\|roundtrip> …` | araç bağımlı | `research/` altındaki deneysel araçlar; yalnız depodan çalışır, pakete dahil değildir. |
| `hdl --version` / `hdl --help` | — | Sürüm (`package.json`) / bu liste. |

## Çıkış kodları

| Kod | Anlam |
|:-:|---|
| `0` | Gerekli kontroller tamamlandı; ihlal veya çözümsüz durum yok |
| `1` | En az bir required assertion ihlali |
| `2` | Yapılandırma, yürütme, eksik kanıt veya belirsiz sonuç (required not-run dahil); kullanım hatası |
| `3` | Cleanup doğrulanamadı; sahipli veri için işlem gerekiyor |
| `130` | Kullanıcı iptali; kısmi sonuç ve cleanup durumu JSON'da |

Öncelik `130 > 3 > 2 > 1 > 0`. Hiçbir şey yürütülmediyse 0 verilmez.

## Ortam değişkenleri (örnekler)

| Değişken | Kullanım |
|---|---|
| `HDL_DEMO_URL`, `HDL_DEMO_TOKEN`, `HDL_DEMO_USER`, `HDL_DEMO_PASSWORD`, `HDL_RULE` | `examples/profile-demo/roundtrip.config.ts` |
| `HDL_EXAMPLE_PORT`, `DEMO_BUGS` | `examples/existing-test` (Playwright Test entegrasyonu) |
| `PORT`, `DEMO_BUGS` | `examples/profile-demo/server.ts` tek başına çalıştırılırken |

Sırlar yapılandırma dosyasına değil ortam değişkenine ve adapter'ın `authenticate` / `secrets` kancalarına aittir; artifact'a yazılmaz.
