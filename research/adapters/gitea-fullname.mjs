// Gitea: Ayarlar > Profil > "Full Name". Kayıt = hdladmin kullanıcısı (seri koşu, her fixture üzerine yazar).
// Taze okuma: yeni context'te /user/settings ve herkese açık profil sayfası.
const base = process.env.GITEA_URL ?? 'http://localhost:8082';
let state;

export default {
  name: 'gitea-full-name',
  controlType: 'input-text',
  async newContext(browser) {
    if (!state) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(`${base}/user/login`);
      await p.fill('#user_name', 'hdladmin');
      await p.fill('#password', 'admin12345');
      await Promise.all([p.waitForURL((u) => !u.pathname.includes('login')), p.locator('#password').press('Enter')]);
      state = await ctx.storageState();
      await ctx.close();
    }
    return browser.newContext({ storageState: state });
  },
  async create(page, value) {
    await page.goto(`${base}/user/settings`);
    const field = page.locator('#full_name');
    await field.fill(value);
    const injected = await field.inputValue();
    await Promise.all([page.waitForLoadState('load'), page.getByRole('button', { name: 'Update Profile' }).click()]);
    const err = page.locator('.flash-error');
    if (await err.count()) return { injected, rejected: (await err.first().textContent()).trim() };
    if (!(await page.locator('.flash-success').count())) return { injected };
    return { injected, recordId: 'hdladmin' };
  },
  // Keşfet > Kullanıcılar araması (oturumsuz ziyaretçi gibi). Kayıt = hdladmin.
  async search(context, query) {
    const page = await context.newPage();
    await page.goto(`${base}/explore/users?q=${encodeURIComponent(query)}`);
    return { found: (await page.locator('.page-content a[href="/hdladmin"]', { hasText: 'hdladmin (' }).count()) > 0 };
  },
  async readFresh(context) {
    const page = await context.newPage();
    await page.goto(`${base}/user/settings`);
    return page.locator('#full_name').inputValue();
  },
};
