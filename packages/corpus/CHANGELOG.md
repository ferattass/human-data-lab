# human-text corpus — değişiklik notu

Fixture içeriği değişirse corpus sürümü ve digest değişir. Bir kimliğin anlamı geriye dönük sessizce değiştirilmez;
anlamı değişen fixture yeni kimlik alır (`.002`), eskisi kaldırılmaz, kullanımdan düşürüldüğü burada yazılır (§16).
Koşu paketleri kullanılan somut değerleri `fixtures.jsonl` içinde kopyalar; replay bu dosyaya değil, o kopyaya dayanır.

## 1.1.0 — 2026-11-06
- Yeni setler: `demo-a`, `demo-b`, `demo-c` (§35'teki üç demo). Fixture değerleri değişmedi.

## 1.0.0 — 2026-11-06
- İlk sürüm: 11 aile, 99 sentetik fixture; `smoke` seti 24 fixture.
- Aileler: latin (pozitif kontrol), tr-i, combining, compat, punct, space, length, script, emoji, newline (yalnız textarea), control (teknik kontrol; must-reject politikaları için, saldırı yükü değil).
- Not: `compat.kelvin.001` ve `compat.ohm.001` kanonik tekil karakterlerdir; NFC zaten değiştirir, NFKC ek fark üretmez (`canonical-singleton`).
