#!/usr/bin/env node
// README animasyonlarından veri taşıyanları (matrix.svg) gerçek koşu sonuçlarından üretir.
// Kullanım: node scripts/build-assets.mjs   (runs/search-*.json gerekir)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = root + 'docs/assets/';
mkdirSync(out, { recursive: true });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- matrix.svg ----------
const apps = [
  ['Redmine', 'search-redmine-issue'],
  ['WordPress', 'search-wp-comment'],
  ['Gitea', 'search-gitea'],
];
const fixtures = [
  ['tr.dotless-i.001', 'Ilık Işık'],
  ['tr.dotted-capital-i.001', 'İpek Çağlar'],
  ['combining.precomposed.001', 'José Muñoz'],
  ['punct.ascii-apostrophe.001', "O'Brien"],
];
const cols = [
  ['exact', 'tam'], ['lower-tr', 'tr küçük'], ['upper-tr', 'TR BÜYÜK'], ['nfd', 'NFD'], ['ascii-fold', 'ASCII'],
];
const rows = [];
for (const [app, file] of apps) {
  const data = JSON.parse(readFileSync(root + `runs/${file}.json`, 'utf8'));
  for (const [fid, label] of fixtures) {
    const r = data.results.find((x) => x.fixtureId === fid);
    const cells = cols.map(([v]) => {
      const q = r?.queries.find((x) => x.variants.includes(v));
      return q ? (q.error ? '!' : q.found ? 'y' : 'n') : '';
    });
    rows.push({ app, label, query: (v) => r?.queries.find((x) => x.variants.includes(v))?.query, cells });
  }
}
const W = 1200, top = 120, rh = 34, x0 = 340, cw = 160;
const H = top + rows.length * rh + 70;
let body = '';
cols.forEach(([, name], i) => {
  body += `<text x="${x0 + i * cw + cw / 2}" y="${top - 18}" text-anchor="middle" class="h">${esc(name)}</text>`;
});
let k = 0;
rows.forEach((r, ri) => {
  const y = top + ri * rh;
  if (ri % fixtures.length === 0) {
    if (ri) body += `<line x1="40" x2="${W - 40}" y1="${y - 1}" y2="${y - 1}" stroke="#1f2a44"/>`;
    body += `<text x="48" y="${y + 22}" class="app">${esc(r.app)}</text>`;
  }
  body += `<text x="170" y="${y + 22}" class="fx">${esc(r.label)}</text>`;
  r.cells.forEach((c, ci) => {
    const cx = x0 + ci * cw + cw / 2, cy = y + rh / 2;
    const delay = (0.15 + k++ * 0.045).toFixed(3);
    const cls = c === 'y' ? 'ok' : c === 'n' ? 'bad' : 'na';
    const glyph = c === 'y' ? '✓' : c === 'n' ? '✗' : c === '!' ? '!' : '–';
    body += `<g class="cell ${cls}" style="animation-delay:${delay}s"><rect x="${cx - 54}" y="${cy - 12}" width="108" height="24" rx="12"/><text x="${cx}" y="${cy + 5}" text-anchor="middle">${glyph}</text></g>`;
  });
});
const matrix = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
  <title id="t">Arama matrisi — gerçek koşu sonuçları</title>
  <desc id="d">Aynı kayıt farklı yazım biçimleriyle aranır. Türkçe ı/I ve NFD sorguları üç uygulamada da bulunamaz; WordPress yorum aramasında O'Brien hiç bulunamaz. Kaynak: runs/search-*.json</desc>
  <style>
    text{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
    .h{fill:#94a3b8;font-size:13px;letter-spacing:.1em}
    .app{fill:#f8fafc;font-size:15px;font-weight:700}
    .fx{fill:#cbd5e1;font-size:15px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .cell{animation:pop 12s infinite both;transform-box:fill-box;transform-origin:center}
    .cell text{font-size:15px;font-weight:700}
    .ok rect{fill:#0f2a28;stroke:#2dd4bf;stroke-opacity:.5}.ok text{fill:#2dd4bf}
    .bad rect{fill:#2a1220;stroke:#fb7185;stroke-opacity:.7}.bad text{fill:#fb7185}
    .na rect{fill:#111827;stroke:#334155}.na text{fill:#475569}
    @keyframes pop{0%{opacity:0;transform:scale(.6)}4%{opacity:1;transform:scale(1.08)}6%,92%{opacity:1;transform:none}100%{opacity:0}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  </style>
  <rect width="${W}" height="${H}" rx="20" fill="#0b1220"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="20" fill="none" stroke="#1f2a44"/>
  <text x="48" y="52" fill="#f8fafc" font-size="22" font-weight="700">Kaydı kendi adıyla ara: kim bulunuyor?</text>
  <text x="48" y="78" fill="#94a3b8" font-size="14">Sütunlar, kullanıcının aynı adı yazabileceği biçimler. Yalnız "tam" zorunlu; diğerleri ürün politikası. ✓ bulundu · ✗ bulunamadı</text>
  ${body}
  <text x="48" y="${H - 26}" fill="#64748b" font-size="12">Kaynak: runs/search-redmine-issue.json, search-wp-comment.json, search-gitea.json · scripts/build-assets.mjs ile üretildi</text>
</svg>
`;
writeFileSync(out + 'matrix.svg', matrix);

// ---------- terminal.svg ----------
// experiments/repro-round3.mjs çıktısı (6 Kasım 2026 koşusu, adlardaki benzersiz sonek kısaltıldı).
const lines = [
  ['$', 'node experiments/repro-round3.mjs', 'cmd'],
  ['HATA', 'WP Hızlı Düzenle: girilen "Sis" -> "Şiş"   (mevcut: Şiş, Sis)', 'bad'],
  ['HATA', 'WP Hızlı Düzenle: girilen "ano" -> "año"   (mevcut: año, ano)', 'bad'],
  ['HATA', 'WP Hızlı Düzenle: girilen "Kul" -> "Kül"   (mevcut: Kül)', 'bad'],
  ['HATA', 'Redmine wiki: "Cam" kaydedildikten sonra "Çam" içeriği = "Cam sayfası"', 'bad'],
  ['HATA', 'Redmine wiki: "Sis" kaydedildikten sonra "Şiş" içeriği = "Sis sayfası"', 'bad'],
  ['HATA', 'Redmine wiki: "Strasse" kaydedildikten sonra "Straße" içeriği = "Strasse sayfası"', 'bad'],
  ['OK', 'Redmine wiki: "Kir" kaydedildikten sonra "Kır" içeriği = "Kır sayfası"   ← kontrol', 'ok'],
];
const TH = 96 + lines.length * 30 + 30;
const step = 0.9, total = 12;
let tl = '';
lines.forEach(([tag, text, kind], i) => {
  const at = ((i * step + 0.4) / total) * 100;
  const kf = `l${i}`;
  tl += `<style>@keyframes ${kf}{0%,${at.toFixed(1)}%{opacity:0;transform:translateX(-6px)}${(at + 2).toFixed(1)}%,94%{opacity:1;transform:none}100%{opacity:0}}</style>`;
  const y = 96 + i * 30;
  const color = kind === 'cmd' ? '#2dd4bf' : kind === 'bad' ? '#fb7185' : '#4ade80';
  tl += `<g style="animation:${kf} ${total}s infinite both"><text x="40" y="${y}" fill="${color}" font-weight="700">${esc(tag)}</text><text x="${kind === 'cmd' ? 62 : 100}" y="${y}" fill="${kind === 'cmd' ? '#e2e8f0' : '#cbd5e1'}">${esc(text)}</text></g>`;
});
const terminal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 ${TH}" width="1200" height="${TH}" role="img" aria-labelledby="t d">
  <title id="t">Tek komutla tekrar üretim</title>
  <desc id="d">experiments/repro-round3.mjs altı hatayı yeniden üretir; Kır/Kir kontrol çifti doğru geçer.</desc>
  <style>text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:15px}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
  <rect width="1200" height="${TH}" rx="16" fill="#0a0f1a"/>
  <rect x=".5" y=".5" width="1199" height="${TH - 1}" rx="16" fill="none" stroke="#1f2a44"/>
  <rect width="1200" height="44" rx="16" fill="#111827"/><rect y="28" width="1200" height="16" fill="#111827"/>
  <circle cx="28" cy="22" r="6" fill="#fb7185"/><circle cx="48" cy="22" r="6" fill="#fbbf24"/><circle cx="68" cy="22" r="6" fill="#4ade80"/>
  <text x="600" y="27" text-anchor="middle" fill="#64748b" font-size="13">human-data-lab — repro-round3</text>
  ${tl}
</svg>
`;
writeFileSync(out + 'terminal.svg', terminal);
console.log('docs/assets/matrix.svg, docs/assets/terminal.svg üretildi');
