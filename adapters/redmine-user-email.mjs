// Redmine: Yönetim > Kullanıcılar > Yeni, e-posta alanı. Taze okuma: /users/:id/edit #user_mail.
const base = process.env.REDMINE_URL ?? 'http://localhost:8083';
let state;

export default {
  name: 'redmine-user-email',
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
  async createUser(page, { login, email }) {
    await page.goto(`${base}/users/new`);
    await page.fill('#user_login', login);
    await page.fill('#user_firstname', 'Hdl');
    await page.fill('#user_lastname', 'Test');
    await page.evaluate(() => { document.querySelector('#user_mail').type = 'text'; document.querySelectorAll('form').forEach((f) => f.setAttribute('novalidate', '')); });
    await page.fill('#user_mail', email);
    await page.fill('#user_password', 'hdlpassword123');
    await page.fill('#user_password_confirmation', 'hdlpassword123');
    await Promise.all([page.waitForLoadState('load'), page.locator('input[name="commit"]').first().click()]);
    const m = page.url().match(/\/users\/(\d+)/);
    if (m) return { recordId: m[1] };
    return { rejected: ((await page.locator('#errorExplanation').textContent().catch(() => '')) || page.url()).trim().replace(/\s+/g, ' ') };
  },
  async readEmail(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/users/${id}/edit`);
    return page.locator('#user_mail').inputValue();
  },
};
