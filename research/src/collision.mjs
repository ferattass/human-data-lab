// Ad çakışması için saf sınıflandırıcı (tarayıcıya bağımlı değil).
//
// Senaryo: kullanıcı A adıyla bir kayıt kaydeder (gövde bodyA), sonra B adıyla (gövde bodyB).
// Gözlem: her kaydetmenin uygulamada HANGİ kayda gittiği (recordId) ve iki kaydın taze okunmuş hâli.
//
//   distinct      iki ayrı kayıt, her biri kendi adını ve gövdesini koruyor
//   overwritten   B kaydı A'nın kaydına gitti ve A'nın gövdesini değiştirdi (veri kaybı riski)
//   merged        B kaydı A'nın kaydına gitti (gövde yoksa: etiket/kategori gibi yalnız ad taşıyan kayıt)
//   rejected      uygulama B'yi reddetti (ör. "bu ad zaten var") — görünür davranış
//   renamed       ayrı kayıt ama okunan ad yazılandan farklı
//   error         yürütme hatası (adapter/ortam)
export function classifyCollision({ a, b }) {
  if (a.error || b.error) return 'error';
  if (b.rejected) return 'rejected';
  if (a.recordId === undefined || b.recordId === undefined) return 'error';
  if (String(a.recordId) === String(b.recordId)) {
    if (a.read?.body !== undefined && b.body !== undefined && a.read.body === b.body) return 'overwritten';
    return 'merged';
  }
  if ((a.read && a.read.name !== a.name) || (b.read && b.read.name !== b.name)) return 'renamed';
  if (a.read?.body !== undefined && a.read.body !== a.body) return 'overwritten';
  return 'distinct';
}

// Beklentiye göre hüküm. 'policy' çiftlerinde birleşme/ret gözlemdir, ihlal değildir.
export function verdict(expect, outcome) {
  if (outcome === 'error') return 'not-run';
  if (outcome === 'distinct') return 'pass';
  if (expect === 'policy') return 'observed';
  if (expect === 'control') return 'adapter-suspect';
  // distinct beklenirken: görünür ret de kullanıcıyı engeller ama sessiz değildir.
  return outcome === 'rejected' ? 'blocked' : 'fail';
}

// Her koşuda benzersiz kılmak için ada sonek ekler; sonek ASCII ve iki adda aynıdır.
// Boşluk değil tire: bazı uygulamalar boşluğu '_' yapar, bu da sahte "renamed" üretir.
export const withSuffix = (name, suffix) => `${name}-${suffix}`;
