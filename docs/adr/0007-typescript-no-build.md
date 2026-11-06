# 0007 — TypeScript, build adımı yok

**Karar.** Kaynak TypeScript'tir ve Node ≥ 22.18'in tip silme özelliğiyle doğrudan çalışır; `tsc --noEmit` yalnız tip denetimi yapar.
Yalnız silinebilir söz dizimi (`erasableSyntaxOnly`): enum, namespace, parametre özelliği yok; importlarda `.ts` uzantısı.

**Bağlam.** Rapor TypeScript çekirdeği öneriyor (§1); monorepo aracı projeyi çalıştırmanın önüne geçmemeli (§37).

**Alternatifler.** tsup/tsc ile derleme; npm workspaces.

**Bedel.** npm'e yayımlarken Node'un `node_modules` içinde tip silmeyi desteklememesi nedeniyle derlenmiş çıktı gerekecek (beta işi).

**Testler.** `npm run typecheck`, mimari testi.
