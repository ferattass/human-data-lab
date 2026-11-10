# Değişiklik günlüğü

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/). Sürümleme: [SemVer](https://semver.org/lang/tr/); 1.0 öncesinde küçük sürümler kırıcı değişiklik içerebilir.

## [Yayımlanmamış]

## [0.6.1] — 2026-11-10

### Düzeltildi
- `release.yml`: tarball adımı `out/` dizinini oluşturmadan `npm pack` çalıştırıyordu; v0.6.0 etiketi bu yüzden GitHub Release üretmedi. Kod değişikliği yok.

## [0.6.0] — 2026-11-10

### Eklendi
- **MCP sunucusu** (`hdl mcp`, `packages/mcp`, dışa aktarım `human-data-lab/mcp`): stdio üzerinden, bağımlılıksız. Salt okunur araçlar
  `hdl_describe_difference`, `hdl_list_fixtures`, `hdl_validate_contract`, `hdl_read_run`, `hdl_plan_export`; JSON Schema ve belge kaynakları.
  `hdl_run` yalnız `--allow-run` ile açılır ve seri çalışır ([ADR 0010](docs/adr/0010-mcp-server.md)). Ajanın verdiği yollar sunucu
  kökünün (`--root`, varsayılan çalışma dizini) içinde kalır; corpus dosyası adla seçilir (allowlist).
- `hdl report --json`: makine okunur koşu görünümü (`RunView`, `store.compactRun`); MCP ile aynı biçim.
- `AGENTS.md`: kod ajanları için sözleşme (komutlar, çıkış kodlarının okunması, RunView, yapılmayacak iddialar). Pakete dahil.
- `README.en.md`: İngilizce README; iki README birbirine bağlı.
- Açık kaynak altyapısı: `release.yml` (etiketle test → GitHub Release + npm trusted publishing, provenance), `codeql.yml`,
  Dependabot, PR şablonu, fixture ve özellik issue şablonları, `CITATION.cff`, `.editorconfig`, `.nvmrc`, [`docs/release.md`](docs/release.md).
- `loadConfigFile` (`human-data-lab/playwright`): CLI ve MCP aynı yükleyiciyi kullanır.

### Değiştirildi
- Paket artık yayımlanabilir (`private` kaldırıldı, `publishConfig: { access: public, provenance: true }`); `npm pack` içeriği değişmedi.
- `TOOL.version` tek kaynaktan (`package.json`) okunur; ikinci sürüm sabiti yok.
- Rapor, çıkış kodu anlamını ve ilk gözlenen sapmayı çekirdekten alır (yinelenen tanım kaldırıldı).

### Güvenlik
- Redaction sırası düzeltildi: `Authorization: Bearer <token>` içindeki token artık maskeleniyor (önce şema+token, sonra cookie satırı,
  sonra tek değerli başlıklar). Adapter'ın `reason`/`note` dizgileri de redakte edilir; sırlar authenticate sonrasında da okunur.
- `hdl cleanup`: hedef denetimi manifest yoksa `contract.json`'dan yapılır; `allocations.jsonl` bütünlüğü bozuksa temizlik yapılmaz;
  istekler origin allowlist'ten geçer ve yönlendirme izlemez; ayrıntılar redakte; bütçe aşımında gerçekten durur.
- MCP: `rule`/`set` için prototip anahtarları (`constructor` vb.) reddedilir; sunucu çalışırken `console.log` stderr'e yönlenir;
  SIGINT/SIGTERM, girdi kapanması ve `notifications/cancelled` süren koşuyu iptal eder (cleanup ayrı bütçeyle çalışır).
- Tarayıcı origin allowlist'i WebSocket bağlantılarını ve son aşamadan sonra gelen geç istekleri de kapsar.
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
- Üretilen `repro/*.spec.ts` artık `notRun` da denetler: required kontrol çalışmadan "geçti" denmez.
- `hdl report` tamamlanmamış koşuda saklı 130 (iptal) ve 3 (cleanup) kodunu 2'ye düşürmez.
- Kirli ortam (doğrulanmamış cleanup) sonraki tekrar ve küçültmeyi durdurur; planlanan tekrarların hepsi koşmadıysa `stable` değil `inconclusive`.
- Küçültmede son bağımsız onay için deneme bütçesi rezerve edilir; bütçe biten doğrulanmış aday atılmaz, eksik onay not edilir.
- Rezerve edilen her namespace temizlenir (en kötü durum raporlanır); cleanup bütçesi aşıldıktan sonra geç istek bağlamı açılamaz;
  `authenticate` ve `targetBuild` deneme bütçesi ve iptal sinyaliyle sınırlı.
- `readRun`: manifest'te listelenmeyen dosya, bozuk `attempts.jsonl` satırı ve `provenance`'sız manifest çökme değil sorun üretir;
  boş paylaşım paketi de yazılabilir; koşu dizini atomik oluşturulur.
- CLI: boolean bayraklar (`--json`, `--no-shrink`, `--owned-only`, …) sonraki argümanı yutmaz; değersiz `--out` açık hata verir.
- `preservationChecked` yalnız required kontrolleri sayar (tanısal kontrolün geçmesi "korunma kontrolü çalıştı" değildir).
- Şema doğrulayıcı null öğeli diziler ve sayı yerine dizgi verilen `stable-read` alanlarında çökmez.
- `hdl_run` yapılandırma dosyasını her çağrıda yeniden okur.
- `hdl export` ve testler, Windows'ta yolda ASCII dışı karakter (ör. `Yayında`) varken çöküyordu:
  Node 24.14'te `fs.cpSync` bu durumda hiçbir hata basmadan 127 koduyla sonlanıyor. `copyFileSync` tabanlı kopyaya geçildi.
- Artifact yollarında ters eğik çizgi, sürücü harfi ve `:` her işletim sisteminde reddedilir (C09; Linux'ta `C:\x` kabul ediliyordu).
- `hdl --version` yardım metni yerine sürümü basar.

## [0.4.0] — 2026-11-06

İlk public sürüm: ürün raporuna göre yeniden kurulan TypeScript çekirdeği, Playwright çalıştırıcısı, kanıt paketi,
HTML rapor, replay, küçültme, 99 fixture'lık corpus, JSON şemaları, CLI, demo ve 42 kabul senaryosu.
