// WordPress: Kullanıcılar > Yeni ekle, e-posta alanı. Taze okuma: user-edit.php #email.
const base = process.env.WP_URL ?? 'http://localhost:8081';
let state;

export default {
  name: 'wordpress-user-email',
  async newContext(browser) {
    if (!state) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${base}/wp-login.php`);
      await page.fill('#user_login', 'admin');
      await page.fill('#user_pass', 'admin12345');
      await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);
      state = await ctx.storageState();
      await ctx.close();
    }
    return browser.newContext({ storageState: state });
  },
  async createUser(page, { login, email }) {
    await page.goto(`${base}/wp-admin/user-new.php`);
    await page.fill('#user_login', login);
    // type="email" alanı tarayıcı doğrulaması yapar; sunucu davranışını görmek için novalidate.
    await page.evaluate(() => { document.querySelector('#createuser')?.setAttribute('novalidate', ''); document.querySelector('#email').type = 'text'; });
    await page.fill('#email', email);
    await page.waitForFunction(() => document.querySelector('#pass1')?.value?.length > 0);
    await Promise.all([page.waitForLoadState('load'), page.click('#createusersub')]);
    const id = new URL(page.url()).searchParams.get('id');
    if (id) return { recordId: id };
    const t = await page.locator('.notice-error, .error').allTextContents().catch(() => []);
    return { rejected: t.join(' ').replace(/\s+/g, ' ').trim() || page.url() };
  },
  async readEmail(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/wp-admin/user-edit.php?user_id=${id}`);
    return page.locator('#email').inputValue();
  },
};
