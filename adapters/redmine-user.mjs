// Redmine: Yönetim > Kullanıcılar > Yeni > "First name". Taze okuma: /users/:id/edit.
const base = process.env.REDMINE_URL ?? 'http://localhost:8083';
let state;
let n = 0;

export default {
  name: 'redmine-user-firstname',
  controlType: 'input-text',
  async newContext(browser) {
    if (!state) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(`${base}/login`);
      await p.fill('#username', 'admin');
      await p.fill('#password', 'admin12345');
      await Promise.all([p.waitForURL((u) => !u.pathname.includes('login')), p.click('#login-submit')]);
      state = await ctx.storageState();
      await ctx.close();
    }
    return browser.newContext({ storageState: state });
  },
  async create(page, value) {
    await page.goto(`${base}/users/new`);
    const login = `hdl${Date.now()}${n++}`;
    await page.fill('#user_login', login);
    const field = page.locator('#user_firstname');
    await field.fill(value);
    const injected = await field.inputValue();
    await page.fill('#user_lastname', 'Test');
    await page.fill('#user_mail', `${login}@example.com`);
    await page.fill('#user_password', 'hdlpassword123');
    await page.fill('#user_password_confirmation', 'hdlpassword123');
    await Promise.all([page.waitForLoadState('load'), page.locator('input[name="commit"]').first().click()]);
    const m = page.url().match(/\/users\/(\d+)/);
    if (!m) return { injected, rejected: ((await page.locator('#errorExplanation').textContent().catch(() => '')) || page.url()).trim().replace(/\s+/g, ' ') };
    return { injected, recordId: m[1] };
  },
  // Yönetim > Kullanıcılar listesindeki "User" filtresi (ad/soyad/giriş/e-posta üzerinde arar).
  async search(context, query, id) {
    const page = await context.newPage();
    await page.goto(`${base}/users?set_filter=1&f[]=status&op[status]=*&f[]=name&op[name]=~&v[name][]=${encodeURIComponent(query)}&per_page=100`);
    return { found: (await page.locator(`#user-${id}`).count()) > 0 };
  },
  async readFresh(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/users/${id}/edit`);
    return page.locator('#user_firstname').inputValue();
  },
};
