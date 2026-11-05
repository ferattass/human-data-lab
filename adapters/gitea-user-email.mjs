// Gitea: Site Yönetimi > Kullanıcılar > Yeni, e-posta alanı. Taze okuma: /-/admin/users/:id/edit #email.
const base = process.env.GITEA_URL ?? 'http://localhost:8082';
let state;

export default {
  name: 'gitea-user-email',
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
  async createUser(page, { login, email }) {
    await page.goto(`${base}/-/admin/users/new`);
    await page.fill('#user_name', login);
    await page.evaluate(() => { document.querySelector('#email').type = 'text'; document.querySelectorAll('form').forEach((f) => f.setAttribute('novalidate', '')); });
    await page.fill('#email', email);
    await page.fill('#password', 'hdlPassw0rd!2026');
    await Promise.all([page.waitForLoadState('load'), page.getByRole('button', { name: 'Create User Account' }).click()]);
    const m = new URL(page.url()).pathname.match(/\/-\/admin\/users\/(\d+)/);
    if (m) return { recordId: m[1] };
    const err = page.locator('.flash-error');
    return { rejected: (await err.count()) ? (await err.first().textContent()).trim() : page.url() };
  },
  async readEmail(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/-/admin/users/${id}/edit`);
    return page.locator('#email').inputValue();
  },
};
