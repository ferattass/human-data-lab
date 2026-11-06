// Örnek: mevcut Playwright testine insan metni korunma kuralı eklemek.
import { test, expect, expectTextPreserved } from '../../../packages/playwright/src/test.ts';
import { defineConfig } from '../../../packages/playwright/src/index.ts';
import { profileDemoAdapter } from '../../profile-demo/adapter.ts';
import { displayNameContract } from '../../profile-demo/contract.ts';

const baseURL = `http://127.0.0.1:${process.env.HDL_EXAMPLE_PORT ?? 4410}`;
const config = defineConfig({
  target: { name: 'profile-demo', baseURL },
  allowedOrigins: [baseURL],
  adapter: profileDemoAdapter({ testToken: 'demo-test-token', user: 'demo', password: 'demo-password' }),
  contract: displayNameContract(),
  syntheticDemo: true,
});

// 1) Hazır yaşam döngüsü: prepare → create → readFresh → cleanup, sözleşme ve kanıtla.
test.describe('profil görünen adı — human-text smoke', () => {
  for (const f of ['latin.basic.001', 'tr-i.dotted-capital.002', 'combining.nfd-acute.001', 'emoji.zwj-family.001']) {
    test(f, async ({ humanData }) => {
      const fixture = humanData.corpus('full').fixtures.find((x) => x.id === f)!;
      const r = await humanData.trial({ config, fixtureId: f, value: fixture.value });
      expect(r.execution, r.describe).toBe('completed');
      expect(r.violations, r.describe).toEqual([]);
      expect(r.notRun, r.describe).toEqual([]);
    });
  }
});

// 2) Kendi adımlarınızı yazdığınız testte yalnız kural kontrolü.
test('elle yazılmış akış: kaydet ve yeniden aç', async ({ page, browser }) => {
  const ns = `manual-${Date.now()}`;
  await page.request.post('/__test/namespaces', { headers: { 'x-test-token': 'demo-test-token' }, data: { namespace: ns } });
  await page.goto('/login');
  await page.getByLabel('Kullanıcı').fill('demo');
  await page.getByLabel('Parola').fill('demo-password');
  await page.getByRole('button', { name: 'Giriş' }).click();
  await page.goto(`/profiles/new?ns=${ns}`);
  const value = 'İpek Çağlar';
  await page.getByLabel('Görünen ad', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await page.waitForURL(/\/profiles\/\d+/);
  // Taze okuma: aynı oturumla yeni context, aynı kayıt kimliği.
  const fresh = await browser.newContext({ storageState: await page.context().storageState(), baseURL });
  const p2 = await fresh.newPage();
  await p2.goto(new URL(page.url()).pathname);
  expectTextPreserved(value, await p2.getByTestId('display-name').textContent(), { label: 'profil adı' });
  await fresh.close();
  await page.request.delete(`/__test/namespaces/${ns}`, { headers: { 'x-test-token': 'demo-test-token' } });
});
