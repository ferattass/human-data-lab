<div align="center">

<img src="docs/brand/readme-hero-tr-1600x600.webp" alt="Human Data Lab — Kaydedildi. Peki korundu mu? Yaz → Kaydet → Yeniden oku. Açık kaynak Unicode round-trip testi" width="100%">

<br>

[![ci](https://github.com/ferattass/human-data-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/ferattass/human-data-lab/actions/workflows/ci.yml)
[![codeql](https://github.com/ferattass/human-data-lab/actions/workflows/codeql.yml/badge.svg)](https://github.com/ferattass/human-data-lab/actions/workflows/codeql.yml)
[![npm](https://img.shields.io/npm/v/human-data-lab?style=flat-square&color=D7502B&label=npm)](https://www.npmjs.com/package/human-data-lab)
![lisans](https://img.shields.io/badge/lisans-Apache--2.0-D7502B?style=flat-square)
![node](https://img.shields.io/badge/node-%E2%89%A522.18-202A27?style=flat-square)
![browser](https://img.shields.io/badge/browser-Chromium-202A27?style=flat-square)
![kabul](https://img.shields.io/badge/kabul%20senaryosu-42%2F42-47705C?style=flat-square)
![durum](https://img.shields.io/badge/durum-v0.6%20beta-65706B?style=flat-square)
![mcp](https://img.shields.io/badge/MCP-sunucu%20dahil-65706B?style=flat-square)

**Türkçe:** bu sayfa · **English:** [README.en.md](README.en.md)

**Bir formun "Kaydedildi" demesi yeterli değil.**<br>
Uygulamanızın kabul ettiği insan metninin (Türkçe ı/İ, birleşik aksan, emoji, sağdan sola yazı) kaydet → taze okuma yolculuğunda<br>
korunup korunmadığını gerçek tarayıcıda sınar. Bulguyu kod noktası düzeyinde kanıtla, tekrar üretim bilgisiyle ve regresyon testi olarak teslim eder.

<sub>*Open-source testing tool that checks whether human text your app accepts survives the save → fresh re-read journey, using a real browser via Playwright.*</sub>

[Neden](#-neden) · [30 saniyelik demo](#-30-saniyelik-demo) · [Nasıl çalışır](#-nasıl-çalışır) · [Kendi uygulamanızda](#-kendi-uygulamanızda) · [Playwright testinde](#-mevcut-playwright-testinde) · [Ajanlar & MCP](#-ajanlar-için-mcp) · [Durum](#-durum-ve-yol-haritası) · [Sözleşmeler](docs/contracts.md)

</div>

---

## ✦ Neden

Bir ad alanına `İpek Çağlar` yazılır, sunucu "Kaydedildi" der, ekranda `Ipek Caglar` görünür. Birim testleri geçer, çünkü her katman
kendi içinde tutarlıdır: tarayıcı doğru gönderir, API doğru ayrıştırır, veritabanı doğru saklar, bir ara katman sessizce "temizler".
Kaybı yalnız **uçtan uca** ve **bağımsız bir yeniden okumayla** görürsünüz. Araç tam olarak bunu yapar; başka bir şey vaat etmez.

| Soru | Alışılmış yol | Human Data Lab |
|---|---|---|
| Veri korundu mu? | Başarı mesajı veya HTTP 200 | Kayıt kimliğiyle **yeni context'te taze okuma**; `authored → readback` kod noktası eşitliği |
| Hangi fark hata sayılır? | Testi yazanın o anki kararı | **Sözleşme:** `must-accept / must-reject`, `text.exact.v1` veya açıkça seçilen `text.nfc.v1` |
| Kayıp nerede başladı? | Tahmin | `authored / injected / submitted / readback` ayrı gözlenir; **ilk gözlenen sapma** işaretlenir |
| Tekrar üretilebilir mi? | Ekran görüntüsü | 3 bağımsız tekrar, aynı imzayla **küçültme**, `repro/f1.spec.ts`, saklı değerle **replay** |
| Test ortamı temiz kaldı mı? | Umut | Sahipli namespace, **doğrulanmış cleanup**; aksi halde exit 3 |

**Kimin için:** profil adı, müşteri görünen adı, serbest not gibi insan metni kabul eden ve bir Playwright testi yazabilen ekipler.
Çerçeve fark etmez: Laravel, Django, Rails, Next.js, hazır CRM; tarayıcıda bir form ve kaydı kimliğiyle yeniden bulma yolu yeter.<br>
**Ne zaman değil:** üretim ortamında, izinsiz sitelerde, kaydı kimliğiyle yeniden bulamadığınız akışlarda; arama, CSV/export ve zengin metin için (sonraki faz).

---

## ▶ 30 saniyelik demo

```bash
npm ci
npx playwright install chromium
npm run demo
```

Hesap, model anahtarı veya bulut gerekmez. Yerel bir **sentetik** profil uygulaması, doğru modda ve üç bilinçli hatayla çalışır (rapor §35):

<img src="docs/assets/demo.svg" alt="hdl demo: doğru mod exit 0, A işaret kaybı exit 1, B izinli NFC exit 0, C red ve oturum engeli exit 2" width="100%">

| Senaryo | Ders |
|---|---|
| **Doğru mod** | 24 fixture'lık smoke corpus aynen korunur; NUL içeren teknik kontrol girdisi doğru reddedilir. |
| **A · Başarı mesajının arkasındaki kayıp** | Sunucu birleşik işaretleri atar. "Kaydedildi" görünür, taze okuma farklıdır. Bulgu 3/3 kararlı, `"İpek Çağlar"` → `"İ"` diye küçültülür. Rapor kök neden uydurmaz; ilk gözlenen sapmayı gösterir. |
| **B · Farklı kod noktası, izinli eşdeğerlik** | Sunucu NFC uygular. Açık `text.nfc.v1` politikası geçer, tanısal exact kontrolü ham farkı görünür tutar. Araç her farkı hata ilan etmez. |
| **C · Red, ihlal ve yürütme engeli** | Beklenen red korunma başarısı sayılmaz; oturum düşmesi "Unicode bozuldu" diye raporlanmaz. |

Her senaryo bir HTML raporu üretir. Raporlar script çalıştırmaz, dış kaynak yüklemez, veriyi escape'ler:

<img src="docs/assets/report-demo-a.png" alt="Demo A raporu (sentetik): paydalar, required ihlaller, temizlik durumu ve aşama aşama authored/injected/submitted/readback değerleri" width="100%">

---

## ◇ Nasıl çalışır

<img src="docs/assets/pipeline.svg" alt="yazılan → forma giren → kaydet → taze okuma; ilk sapma işaretlenir" width="100%">

1. **Akışı tanımla.** Adapter `prepare / create / readFresh / cleanup` adımlarını sizin uygulamanıza bağlar.
2. **Beklentiyi siz seçin.** Hangi fixture ailesi kabul edilmeli, hangisi reddedilmeli, metin exact mı korunmalı yoksa NFC eşdeğerliği yeterli mi? Araç tahmin etmez.
3. **Gerçek uygulamada dene.** Her fixture ayrı namespace'te, yeni browser context'inde çalışır. Kayıt kimliğiyle bağımsız taze okuma yapılır.
4. **Kurala göre karşılaştır.** `authored`, `injected`, `submitted` ve `readback` gözlemleri ayrı tutulur. Kabul ile korunma iki ayrı assertion'dır.
5. **Hatayı yeniden üret.** Bulgu 3 bağımsız denemede doğrulanır, aynı imzayı koruyan bütçeli küçültme yapılır, `repro/f1.spec.ts` yazılır.

```mermaid
flowchart LR
  subgraph cli[cli]
    run[hdl run / replay / report / cleanup / export / mcp]
  end
  subgraph pw[playwright]
    life[yaşam döngüsü · bütçe · iptal · origin allowlist<br/>tekrar · küçültme]
    ad[[uygulama adapter'ı<br/>prepare · create · readFresh · cleanup]]
  end
  core[core<br/>sözleşme · oracle · sonuç modeli<br/><i>Playwright/fs bağımlılığı yok</i>]
  corpus[corpus<br/>99 sentetik fixture]
  store[store<br/>run-&lt;id&gt;/ · atomik manifest]
  rep[reporter<br/>inert JSON → HTML]
  mcp[mcp<br/>ajanlar için stdio sunucu]
  run --> life --> ad --> app[(test ortamındaki<br/>uygulamanız)]
  life --> core
  life --> corpus
  life --> store --> rep
  mcp --> core
  mcp --> store
```

**Tek yeşil yok.** Her deneme beş bağımsız boyutta raporlanır: `execution`, `applicationOutcome`, assertion durumu, `cleanup` ve `reproducibility`. Çalışmayan bir required kontrol asla "geçti" görünmez:

| Exit | Anlam |
|:-:|---|
| `0` | Gerekli kontroller tamamlandı; ihlal veya çözümsüz durum yok |
| `1` | En az bir required ihlal |
| `2` | Yapılandırma, yürütme, eksik kanıt veya belirsiz sonuç (**required not-run dahil**) |
| `3` | Cleanup doğrulanamadı; sahipli veri için işlem gerekiyor |
| `130` | Kullanıcı iptali; kısmi sonuç ve cleanup durumu JSON'da |

---

## ⌂ Kendi uygulamanızda

```bash
npx hdl init --adapter playwright        # hdl/adapter.ts + hdl/roundtrip.config.ts taslakları (siteyi keşfetmez)
# TODO'ları doldurun: alan seçicisi, kayıt kimliği, test namespace'i, temizlik yolu
npx hdl run hdl/roundtrip.config.ts --corpus smoke
```

**Paket olarak (beta).** [npm'de yayında](https://www.npmjs.com/package/human-data-lab); sürüm etiketi (`vX.Y.Z`) GitHub Release'e tarball ekler ([`docs/release.md`](docs/release.md)):

```bash
npm install human-data-lab @playwright/test     # veya Release sayfasındaki human-data-lab-X.Y.Z.tgz
```

Dışa aktarımlar: `human-data-lab` (= `/playwright`), `/playwright/test`, `/core`, `/corpus`, `/store`, `/reporter`, `/mcp`, `/schema/*`.
Kurulu paket kaynak kod olmadan demoyu çalıştırır; `test/package.test.ts` bunu Linux, Windows ve macOS'ta sınar.

Önkoşullar: yerel veya izinli staging ortamı, test kullanıcısı, kaydı kimliğiyle yeniden bulma yolu, deneme başına ayrı namespace ve doğrulanabilir temizlik. Rehber: [`docs/adapter-guide.md`](docs/adapter-guide.md). Çalışan örnek: [`examples/profile-demo`](examples/profile-demo).

```bash
npx hdl replay runs/run-<id> --finding f1 --config hdl/roundtrip.config.ts   # saklı somut değerle, aynı hedefte
npx hdl report runs/run-<id> [--json]                                        # bütünlük denetimi + rapor (makineler için JSON)
npx hdl cleanup runs/run-<id> --owned-only --config hdl/roundtrip.config.ts  # yalnız sahipli kaynaklar
npx hdl export runs/run-<id> --out share/ [--dry-run]                        # allowlist; auth/trace hariç
```

---

## ✎ Mevcut Playwright testinde

Ayrı bir CLI veya auth düzeni kopyalamadan:

```ts
import { test, expect, expectTextPreserved } from 'human-data-lab/playwright/test';

test('profil adı korunur', async ({ humanData }) => {
  const r = await humanData.trial({ config, fixtureId: 'tr-i.dotted-capital.002', value: 'İpek Çağlar' });
  expect(r.violations, r.describe).toEqual([]);
});

// Kendi kaydet/yeniden-aç adımlarınızı yazıyorsanız yalnız kural:
expectTextPreserved('İpek Çağlar', await page.getByTestId('display-name').textContent());
```

Başarısızlıkta açıklama kod noktası düzeyindedir:

```text
kural: text.exact.v1
fark sınıfı: marks-stripped  (ilk fark: 0. kod noktası)
beklenen: "İpek Çağlar"
görülen:  "Ipek Caglar"
beklenen kod noktaları: U+0130 U+0070 U+0065 U+006B U+0020 U+00C7 U+0061 U+011F U+006C U+0061 U+0072
görülen kod noktaları:  U+0049 U+0070 U+0065 U+006B U+0020 U+0043 U+0061 U+0067 U+006C U+0061 U+0072
```

Tam örnek: [`examples/existing-test`](examples/existing-test). Doğru modda 5/5 yeşil, bozuk modda 3 kırmızı ve açıklamalı.

---

## ⚙ Ajanlar için (MCP)

Araç, bağımlılıksız bir [Model Context Protocol](https://modelcontextprotocol.io) sunucusu içerir. MCP konuşan her kod asistanı, IDE eklentisi
veya CI botu oracle'a, corpus'a ve koşu kanıtına doğrudan ulaşır; çekirdeğin kararını yine model değil kural verir ([ADR 0005](docs/adr/0005-ai-optional.md), [ADR 0010](docs/adr/0010-mcp-server.md)).

```bash
npx hdl mcp               # salt okunur araçlar + JSON Schema kaynakları
npx hdl mcp --allow-run   # ek olarak hdl_run (hedef uygulamada yazar; operatör izni)
```

```json
{ "mcpServers": { "human-data-lab": { "command": "npx", "args": ["hdl", "mcp"] } } }
```

| Araç | Tarayıcı | Ne döner |
|---|:-:|---|
| `hdl_describe_difference` | yok | kural sonucu, fark sınıfı, ilk farklı kod noktası, kaçışlı değerler, kod noktaları, ölçüler |
| `hdl_list_fixtures` | yok | corpus kimliği/sürümü/digest'i ve set, aile veya özelliğe göre fixture'lar |
| `hdl_validate_contract` | yok | akış sözleşmesinin preflight doğrulaması |
| `hdl_read_run` | yok | bir koşunun bütünlük sorunları, özeti, bulguları, bütün denemeleri ve aşama gözlemleri |
| `hdl_plan_export` | yok | paylaşım paketine girecek ve girmeyecek dosyalar, nedenleriyle |
| `hdl_run` | Chromium | tam koşu; yalnız `--allow-run`, seri, yapılandırma dosyası import edilir |

Ajanın verdiği yollar sunucu kökünün (`--root`, varsayılan çalışma dizini) içinde kalır; kök dışı istek reddedilir.

Aynı makine okunur görünüm CLI'dan `hdl report <koşu> --json` ile alınır. Ajan sözleşmesi (çıkış kodları nasıl okunur, hangi iddia asla yapılmaz): [`AGENTS.md`](AGENTS.md).

---

## ⧉ Corpus

99 sentetik fixture, 11 aile, `smoke` seti 24 fixture ([`packages/corpus`](packages/corpus)):
Latin pozitif kontrol · Türkçe I ailesi · önceden birleşmiş/ayrık aksan · NFKC uyumluluk · apostrof ve tire · boşluk, NBSP, görünmez karakter · uzunluk birimleri · Latin dışı ve RTL yazı · emoji/ZWJ · satır sonu (textarea) · teknik kontrol (must-reject).

Ülke stereotipi değil, **sınanan metin davranışı** yazılır. Görünmez karakterler incelenebilsin diye her değer `\uXXXX` kaçışlıdır. Gerçek kişi verisi ve saldırı payload'ı yoktur. Kabul politikasını fixture değil sözleşme belirler.

---

## ✓ Neyi kanıtlıyoruz

```bash
npm run typecheck    # TypeScript 7, build adımı yok
npm test             # 65 test: 42 kabul senaryosu (A01–C14) + mimari + şema + Playwright entegrasyonu + kurulu paket + MCP
```

Raporun 42 çekirdek kabul senaryosu test adlarıyla izlenir; `test/matrix.test.ts` bir senaryonun testi kaybolursa kırılır. Testlerin çoğu **gerçek Chromium** ve kasıtlı hata modlu demo uygulamasıyla koşar. Bu testler geliştirme sırasında üç gerçek motor hatasını yakaladı:

- Eksik readback gözlemi `Array.find` yüzünden gizleniyordu.
- İptalden sonra yarım kalan bir adapter çağrısı, cleanup'tan sonra yeni kayıt yaratabiliyordu.
- ASCII dışı bir dizin adı (`Yayında`) demo sunucusunun başlamasını engelliyordu.

Kapsam ve sınırlar: [`docs/scope.md`](docs/scope.md) · ölçülmüş süreler: [`docs/performance.md`](docs/performance.md) · teknik review cevapları: [`docs/review.md`](docs/review.md).

---

## ⚠ Sınırlar

- **Chromium + Playwright `fill`.** Gerçek klavye, IME composition, yapıştırma ve diğer tarayıcılar doğrulanmış sayılmaz.
- **Tek alan, tek metin roundtrip'i.** Arama, CSV/export, tarih, sayı ve zengin metin sonraki fazdır.
- **İddia yalnız gözlenen okuma yoluyla sınırlıdır.** UI okuması API'yi, API okuması render'ı kanıtlamaz. "İlk gözlenen sapma" kök neden değildir.
- **Kullanıcı pilotu ve rakip benchmark'ı yapılmadı.** Yöntemleri [`docs/pilot.md`](docs/pilot.md) ve [`docs/benchmark.md`](docs/benchmark.md) içinde, sonuç uydurulmadı.
- Araç test ortamında **yazma işlemi yapar.** Yalnız yerel veya açıkça izinli ortamlarda çalıştırın: [`SECURITY.md`](SECURITY.md).

---

## ◷ Durum ve yol haritası

| | |
|---|---|
| **Sürüm** | v0.6.2 beta · kaynak ve derlenmiş paket · 65 test · CI: Linux, Windows, macOS × Node 22, 24 |
| **Kararlı** | Tek alan metin roundtrip'i, sözleşme ve sonuç modeli, kanıt paketi, replay, küçültme, Playwright Test entegrasyonu, MCP araçları (koşu yalnız `--allow-run` ile) |
| **Deneysel** | `research/` araçları (arama, kimlik, çakışma) |
| **Sırada** | kullanıcı pilotu ([yöntem](docs/pilot.md)) · tarih, sayı ve zengin metin alanları · arama ve export yolculukları |
| **Kırıcı değişiklik** | 1.0 öncesi `0.X` sürümleri kırıcı olabilir ve [CHANGELOG](CHANGELOG.md)'da açıkça yazılır; şemalar `schemaVersion` ile ayrı sürümlenir, bilinmeyen büyük sürüm okunmaz |

---

## Belgeler

| | |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Kod ajanları için sözleşme: komutlar, çıkış kodları, RunView, MCP, asla yapılmayacak iddialar |
| [`docs/contracts.md`](docs/contracts.md) | Fixture, akış sözleşmesi, gözlem sınırları, sonuç modeli, kanıt paketi, replay, küçültme |
| [`docs/adapter-guide.md`](docs/adapter-guide.md) | Kendi uygulamanız için adapter yazmak |
| [`docs/cli.md`](docs/cli.md) | CLI referansı: bütün komutlar, bayraklar, çıkış kodları |
| [`docs/scope.md`](docs/scope.md) | v0.1 kapsam sözleşmesi ve bilinen sınırlar |
| [`docs/release.md`](docs/release.md) | Sürümleme, etiket, GitHub Release ve npm trusted publishing |
| [`docs/adr/`](docs/adr) | Karar kayıtları |
| [`docs/traceability.md`](docs/traceability.md) | Ürün raporunun her bölümü → kod ve test |
| [`schema/`](schema) | Sürümlü JSON Schema'lar |
| [`research/`](research) | Erken deneyler (arama, e-posta kimliği, ad çakışması): **deneysel**, v0.1 kapsamı dışında |
| [`docs/brand/`](docs/brand) | Görsel kimlik: logo, sembol, renkler, kullanım kuralları |

## Katkı

<a href="CONTRIBUTING.md"><img src="docs/brand/contributor-card-1200x675.webp" alt="Human Data Lab katkı çağrısı" width="100%"></a>

Yeni bir fixture, bir adapter örneği veya bir hata bildirimi. Hepsi sentetik verinin üzerinde çalışır, gerçek müşteri verisi gerekmez.
[`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · [`CITATION.cff`](CITATION.cff)

## Lisans

[Apache License 2.0](LICENSE). "Human Data Lab" bir çalışma adıdır; marka, alan adı veya npm kapsamı (scope) tahsis edilmemiştir ([`NOTICE`](NOTICE)).

<div align="center">
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo-horizontal-dark.webp">
  <img src="docs/brand/logo-horizontal-ink.webp" alt="Human Data Lab" width="320">
</picture>
<br>
<sub><b>Every character matters.</b> · Animasyonlar <code>prefers-reduced-motion</code> ayarına uyar · Tüm demo verisi sentetiktir</sub>
</div>
