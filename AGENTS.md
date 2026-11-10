# Ajanlar için rehber / Guide for coding agents

Bu dosya, depoda çalışan veya aracı kullanan **kod ajanları** (MCP istemcisi olan asistanlar, IDE eklentileri, CI botları) için
sözleşmedir. İnsan okuyucu için asıl giriş [`README.md`](README.md) ve [`README.en.md`](README.en.md).
*English summary at the end.*

## Araç ne yapar, ne yapmaz

- **Yapar:** bir uygulamanın kabul ettiği insan metninin (Türkçe İ/ı, birleşik aksan, emoji, RTL, görünmez karakter) **kaydet → taze okuma**
  yolculuğunda korunup korunmadığını gerçek Chromium'da sınar; kod noktası düzeyinde kanıt, tekrar üretim ve regresyon testi üretir.
- **Yapmaz:** siteyi keşfetmez, kabul politikası tahmin etmez, kök neden iddia etmez, model çağrısı yapmaz (ADR 0005), üretim ortamına dokunmaz.
- **Hedef uygulamada yazma yapar** (kayıt yaratır ve siler). Yalnız yerel veya açıkça izinli test ortamında çalıştırın. Bu kural ajan için de geçerlidir.

## Hızlı yol

```bash
npm ci && npx playwright install chromium
npm run demo                                  # sentetik demo, hesap/anahtar gerekmez; dört senaryo beklenen çıkış kodlarını verir
npx hdl run hdl/roundtrip.config.ts --corpus smoke
npx hdl report runs/run-<id> --json           # makine okunur özet (aşağıdaki RunView)
```

Kaynaktan çalışmak için Node ≥ 22.18 (TypeScript tip silme; build adımı yok). Kurulu pakette derlenmiş `dist/` çalışır.

## MCP sunucusu

```bash
npx hdl mcp               # salt okunur araçlar: oracle, corpus, sözleşme doğrulama, koşu okuma, paylaşım planı
npx hdl mcp --allow-run   # + hdl_run (gerçek koşu). Operatör izni; ajan kendi başına açamaz.
```

İstemci yapılandırması (çoğu MCP istemcisi bu biçimi kullanır):

```json
{ "mcpServers": { "human-data-lab": { "command": "npx", "args": ["hdl", "mcp"] } } }
```

| Araç | Tarayıcı | Ne döner |
|---|:-:|---|
| `hdl_describe_difference` `{expected, actual, rule?}` | yok | `passed`, `rawEqual`, `differenceClass`, `firstDifferenceAt`, kaçışlı değerler, kod noktaları, birimli ölçüler |
| `hdl_list_fixtures` `{set?, family?, property?}` | yok | corpus kimliği/sürümü/digest'i ve fixture listesi (ham + kaçışlı) |
| `hdl_validate_contract` `{contract}` | yok | `valid`, `issues[]` (yol + mesaj) |
| `hdl_read_run` `{runDir}` | yok | RunView: bütünlük sorunları, özet, bulgular, bütün denemeler, aşama gözlemleri |
| `hdl_plan_export` `{runDir, includeEvidence?}` | yok | paylaşım paketine girecek/girmeyecek dosyalar ve nedenleri |
| `hdl_run` `{configPath, corpusSet?, artifactsDir?, reproduce?, shrink?}` | **Chromium** | RunView. Yalnız `--allow-run`; seri; yapılandırma dosyası import edilir (kod çalışır) |

Yol kuralı: `runDir`, `configPath` ve `artifactsDir` sunucu kökünün (`hdl mcp --root <dizin>`, varsayılan başlatıldığı dizin) **içinde** olmalı;
gerçek yol (symlink çözülmüş) denetlenir, UNC yolu reddedilir. Kök dışı istek `-32602` ile döner. `file` bir corpus **adıdır**, yol değil.

Kaynaklar: `hdl://schema/<fixture|corpus|contract|trial-result|finding|manifest>` (JSON Schema), `hdl://docs/agents`, `hdl://docs/contracts`, `hdl://docs/adapter-guide`.
Protokol: stdio, JSON-RPC 2.0, satır başına bir mesaj; sürümler 2024-11-05 … 2025-11-25. Bağımlılık yok (`packages/mcp`).

## Sonucu doğru okumak

Tek yeşil yoktur. Her deneme beş boyutta raporlanır: `execution`, `applicationOutcome`, assertion durumu, `cleanup`, `reproducibility`.

| Exit | Anlam | Ajan ne der |
|:-:|---|---|
| `0` | gerekli kontroller tamamlandı; ihlal veya çözümsüz durum yok | "Seçilen fixture'lar için korunma doğrulandı." Uygulamanın her durumda doğru olduğunu **söylemez.** |
| `1` | en az bir required ihlal | Bulguyu `findings[]` ile raporla: kural, sınır, fark sınıfı, kaçışlı değerler, tekrar durumu. |
| `2` | yapılandırma, yürütme, eksik kanıt veya belirsiz sonuç (required not-run dahil) | "Sonuç yok" de; "geçti" veya "veri bozuldu" **deme.** Oturum düşmesi, seçici hatası, timeout buraya girer. |
| `3` | cleanup doğrulanamadı | Önce sahipli veriyi temizle: `hdl cleanup <run> --owned-only --config <dosya>`. |
| `130` | kullanıcı iptali | Kısmi sonuç; `cleanup` sayımlarına bak. |

- `complete=false` olan koşudan "tüm kontroller geçti" çıkarılamaz.
- `differenceClass` ve `firstObservedDivergence` **gözlenen** ilişkidir, kök neden değildir. "Sunucu NFC yapıyor" diye yazma; "readback NFC-eşdeğer ama ham fark var" yaz.
- `text.nfc.v1` geçerken `rawEqual=false` ise bunu sakla; kullanıcı exact istemişse ihlaldir.
- Tekrar `unstable` ise bulguyu kesin dille sunma; `inconclusive` ise yürütme sorununu önce çöz.
- Yürütme hatası (`execution=error`) veri bozulması değildir.

## RunView (hdl report --json, hdl_read_run, hdl_run)

```text
runDir, runId, status (complete|incomplete), complete, exitCode, exitMeaning, cancelled, syntheticDemo, replayOf, problems[]
target {name, baseURL, build}, adapter {id, version}, corpus {id, version, set, digest}, summary {…RunSummary}
findings[]  { id, fixtureId, rule, boundary, differenceClass, applicationOutcome, reproducibility, attemptsReproduced, attemptsObserved,
              original {value, escaped}, smallest {value, escaped, status, note} | null, attemptIds[], reproSpec }
attempts[]  { attemptId, candidateId, fixtureId, expectation, execution, applicationOutcome, cleanup, recordId,
              assertions[] {id, rule, required, status, difference?, firstDifferenceAt?, rawEqual?, reason?},
              observations {authored|injected|submitted|readback → {status, value?, escaped?, source?, note?}},
              firstObservedDivergence {at, from, unobserved[]}, errors[] }
reportPath
```

Ham dosyalar: `manifest.json`, `contract.json`, `attempts.jsonl`, `fixtures.jsonl`, `allocations.jsonl`, `observations/*.json`, `findings/*.json`,
`repro/*.spec.ts`, `report.html`. Şemalar `schema/` altında ve MCP kaynağı olarak.

## Depoda değişiklik yaparken

- `npm run typecheck && npm test` yeşil olmadan iş bitmiş sayılmaz. `test/matrix.test.ts` 42 kabul senaryosunun adını zorlar; bir senaryo testini silme/yeniden adlandırma.
- Yalnız **silinebilir TypeScript** (`enum`, `namespace`, parametre özelliği yok; importlarda `.ts`; tipler `import type`).
- Paket sınırları `test/architecture.test.ts` ile zorlanır: `core` Playwright/fs/ağ bilmez; `reporter` yazmaz; `cli` ve `mcp` ikinci oracle yaratmaz.
- Karşılaştırıcı seti kapalıdır. Yeni eşdeğerlik = yeni kural kimliği (`text.<ad>.v1`) + kabul testi + ADR. Dışarıdan gelen JSON'a kod gömülmez.
- Fixture eklerken: `aile.ad.NNN`, değer `\uXXXX` kaçışlı, `defaultExpectation: unspecified`, sentetik köken, ülke stereotipi değil davranış. Sonra `node packages/corpus/scripts/write-corpus.ts`.
- Gerçek kişi verisi, müşteri dosyası, auth state, cookie, trace veya saldırı payload'ı depoya, issue'ya veya rapora girmez.
- Üretim sitelerinde veya izinsiz ortamlarda koşu yapma. Başka projede bulunan hatayı o projenin bildirim yoluyla ilet (`SECURITY.md`).
- Commit mesajları Conventional Commits; sürüm/yayın akışı [`docs/release.md`](docs/release.md).

## English summary

Human Data Lab checks whether human text an app accepts (Turkish İ/ı, combining marks, emoji, RTL, invisible characters) survives the
**save → fresh re-read** journey in a real Chromium, and ships code-point-level evidence, replay and a regression spec.
It writes to the target application: local or explicitly authorized test environments only.

- `npx hdl mcp` exposes read-only tools (`hdl_describe_difference`, `hdl_list_fixtures`, `hdl_validate_contract`, `hdl_read_run`, `hdl_plan_export`)
  and JSON Schema resources over stdio; `npx hdl mcp --allow-run` additionally enables `hdl_run`. Zero dependencies.
- `npx hdl report <run-dir> --json` prints the same RunView from the CLI.
- Exit codes: `0` required checks completed with no violation · `1` required violation · `2` configuration/execution/missing evidence/indeterminate
  (including required not-run) · `3` cleanup unverified · `130` cancelled. Never report exit 2 as "passed" or as "data corruption".
- `differenceClass` and the first observed divergence describe the observed relation between two strings; they are not a root-cause claim.
- Before changing the repo: `npm run typecheck && npm test`; erasable TypeScript only; package boundaries and the 42-scenario matrix are enforced by tests.
