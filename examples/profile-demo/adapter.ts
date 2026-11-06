// Profil demo uygulaması için referans adapter (§18–21).
// Uygulamaya özgü her şey burada: seçiciler, endpoint'ler, test token'ı. Çekirdek bunları bilmez.
import type { Request } from '@playwright/test';
import { AdapterError, defineAdapter } from '../../packages/playwright/src/index.ts';
import type { CleanupResult, CreateOutcome, ReadObservation, RoundtripAdapter } from '../../packages/playwright/src/index.ts';

export interface ProfileDemoAdapterOptions {
  /** Test fixture API sırrı. Rapor/artifact'a yazılmaz; yalnız istek başlığında kullanılır. */
  testToken: string;
  user: string;
  password: string;
  control?: 'input-text' | 'textarea';
  readbackSource?: 'ui-detail' | 'api';
  /** Yalnız izolasyon testleri için: her denemede aynı namespace (B13). */
  fixedNamespace?: string;
}

const safeJson = (s: string | null) => { try { return s ? JSON.parse(s) : undefined; } catch { return undefined; } };

export function profileDemoAdapter(o: ProfileDemoAdapterOptions): RoundtripAdapter {
  const control = o.control ?? 'input-text';
  const headers = { 'x-test-token': o.testToken };
  return defineAdapter({
    id: 'profile-demo',
    version: '0.1.0',
    capabilities: {
      control: [control],
      inputMethod: ['fill'],
      boundaries: ['authored', 'injected', 'submitted', 'readback'],
      freshReadSource: o.readbackSource ?? 'ui-detail',
      isolation: 'namespace',
      cleanup: 'verified-delete',
      readiness: true,
    },

    secrets: () => [o.testToken, o.password],

    async authenticate(browser, baseURL) {
      const ctx = await browser.newContext({ baseURL });
      const page = await ctx.newPage();
      await page.goto('/login');
      await page.getByLabel('Kullanıcı').fill(o.user);
      await page.getByLabel('Parola').fill(o.password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.getByRole('button', { name: 'Giriş' }).click()]);
      const state = await ctx.storageState();
      await ctx.close();
      return state;
    },

    async targetBuild(ctx) {
      const r = await (await ctx.request()).get('/health');
      return (await r.json()).build;
    },

    async prepare(ctx) {
      // Test girdisine önek eklenmez; sahiplik ayrı namespace ile sağlanır (§19).
      const namespace = o.fixedNamespace ?? `hdl-${ctx.identity.runId}-${ctx.identity.attemptId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      ctx.allocations.reserve(namespace); // ilk mutasyondan ÖNCE
      const api = await ctx.request();
      const r = await api.post('/__test/namespaces', { headers, data: { namespace } });
      if (r.status() === 409) throw new AdapterError(`namespace temiz değil (önceki backend kaydı var: ${(await r.json()).resources.join(', ')}); browser context izolasyonu backend'i temizlemez`, 'target');
      if (!r.ok()) throw new AdapterError(`namespace hazırlanamadı: HTTP ${r.status()}`, 'target');
      return { namespace, resourceIds: [], allocationLogRef: ctx.allocations.ref, cleanupSecretRef: 'adapter-option:testToken' };
    },

    async create(ctx, own, value): Promise<CreateOutcome> {
      const page = await ctx.newPage();
      await page.goto(`/profiles/new?ns=${encodeURIComponent(own.namespace)}&control=${control === 'textarea' ? 'textarea' : 'input'}`);
      if (new URL(page.url()).pathname.startsWith('/login')) throw new AdapterError('oturum geçersiz: login sayfasına yönlendirildi (önkoşul engeli, veri ihlali değil)', 'target');
      const field = await ctx.unique(page.getByLabel('Görünen ad', { exact: true }), 'Görünen ad');
      await field.fill(value);
      ctx.observe('injected', { status: 'observed', value: await field.inputValue(), source: 'dom-input' });

      // Bekleyici tıklamadan ÖNCE kurulur; yalnız bu denemenin namespace'ine ait istek eşleşir (B09).
      const isOwned = (r: Request) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/profiles' && safeJson(r.postData())?.namespace === own.namespace;
      // Yanıt gövdesi, sayfa kayıttan hemen sonra gezinse bile kaybolmasın diye istek route ile yakalanır.
      let settle!: (v: { submitted?: string; status?: number; body?: string; failed?: string }) => void;
      const captured = new Promise<{ submitted?: string; status?: number; body?: string; failed?: string }>((r) => { settle = r; });
      await page.route('**/api/profiles', async (route) => {
        const req = route.request();
        if (!isOwned(req)) return route.fallback();
        const submitted = safeJson(req.postData())?.displayName;
        try {
          const resp = await route.fetch();
          const body = await resp.text();
          settle({ submitted, status: resp.status(), body });
          await route.fulfill({ response: resp, body });
        } catch (e) {
          settle({ submitted, failed: String((e as Error).message).split('\n')[0] });
          await route.abort('connectionreset').catch(() => {});
        }
      });
      await page.getByRole('button', { name: 'Kaydet' }).click();
      const c = await captured;
      if (typeof c.submitted === 'string') ctx.observe('submitted', { status: 'observed', value: c.submitted, source: 'request-body' });

      // Beklenmedik cevapta create otomatik tekrar EDİLMEZ: ilk istek kaydı yaratmış olabilir (B08).
      if (c.failed) return { kind: 'indeterminate', reason: `gönderimden sonra bağlantı koptu (${c.failed}); kayıt yaratılmış olabilir, tekrar gönderilmedi` };
      const status = c.status!;
      const j = safeJson(c.body ?? null);
      const submitted = c.submitted;
      const evidenceRef = `POST /api/profiles → ${status}`;
      if (status === 201 && typeof j?.id === 'string' && /^\d+$/.test(j.id)) {
        // Uygulama kayıttan sonra gezinir; yabancı origin'e yönlendirme runner tarafından yakalanır (B14).
        await page.waitForURL((u) => u.pathname.startsWith('/profiles/') && !u.pathname.endsWith('/new'), { timeout: 5000 }).catch(() => {});
        return { kind: 'accepted', recordId: j.id, submitted, evidenceRef };
      }
      if (status === 422) return { kind: 'rejected', reason: String(j?.error ?? 'doğrulama hatası'), evidenceRef };
      // HTTP 200 + toast, kayıt kimliği olmadan kabul kanıtı değildir (B05).
      return { kind: 'indeterminate', reason: `beklenmeyen yanıt şeması: HTTP ${status}, kayıt kimliği yok` };
    },

    async readFresh(ctx, _own, recordId): Promise<ReadObservation> {
      if (o.readbackSource === 'api') {
        const r = await (await ctx.request()).get(`/api/profiles/${recordId}`);
        if (!r.ok()) return { status: 'not-observed', source: 'api', note: `HTTP ${r.status()}` };
        const j = await r.json();
        return { status: 'observed', value: j.displayName, source: 'api', recordIdSeen: j.id };
      }
      // Yeni context + kayıt kimliğiyle detay sayfası: aynı formun bellekteki değeri okunmaz (B06).
      const page = await ctx.newPage();
      await page.goto(`/profiles/${encodeURIComponent(recordId)}`);
      if (new URL(page.url()).pathname.startsWith('/login')) throw new AdapterError('oturum geçersiz: taze okuma login sayfasına yönlendirildi', 'target');
      const out = await ctx.unique(page.getByTestId('display-name'), 'display-name');
      const value = await out.textContent();
      return { status: value === null ? 'not-observed' : 'observed', value: value ?? undefined, source: 'ui-detail', recordIdSeen: (await out.getAttribute('data-record-id')) ?? undefined };
    },

    async readiness(ctx, _own, recordId) {
      const r = await (await ctx.request()).get(`/api/profiles/${recordId}/ready`);
      return r.ok() && (await r.json()).ready === true;
    },

    async cleanup(ctx, own): Promise<CleanupResult> {
      const api = await ctx.request();
      const del = await api.delete(`/__test/namespaces/${own.namespace}`, { headers });
      if (!del.ok()) return { status: 'failed', detail: `DELETE HTTP ${del.status()}` };
      // Doğrulama: kısa aralıklı üç okuma; arka plan işi geri yazarsa pending (B12).
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 60));
        const g = await api.get(`/__test/namespaces/${own.namespace}`, { headers });
        const left = (await g.json()).resources as string[];
        if (left.length) return { status: 'pending', detail: `temizlikten sonra namespace'te kayıt var: ${left.join(', ')}` };
      }
      return { status: 'verified', detail: `${(await del.json()).deleted} kayıt silindi, 3 okumada boş` };
    },
  });
}
