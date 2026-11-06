// WordPress: Kullanıcılar > Yeni ekle > "First Name" alanı. Taze okuma: user-edit.php.
const base = process.env.WP_URL ?? 'http://localhost:8081';
let state;
let n = 0;

async function login(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/wp-login.php`);
  await page.fill('#user_login', 'admin');
  await page.fill('#user_pass', 'admin12345');
  await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);
  state = await ctx.storageState();
  await ctx.close();
}

export default {
  name: 'wordpress-user-first-name',
  controlType: 'input-text',
  async newContext(browser) {
    if (!state) await login(browser);
    return browser.newContext({ storageState: state });
  },
  async create(page, value) {
    await page.goto(`${base}/wp-admin/user-new.php`);
    const login = `hdl${Date.now()}${n++}`;
    await page.fill('#user_login', login);
    await page.fill('#email', `${login}@example.com`);
    const field = page.locator('#first_name');
    await field.fill(value);
    const injected = await field.inputValue();
    // WP şifreyi JS ile asenkron üretir; boşken göndermek adapter yarışıdır, uygulama reddi değil.
    await page.waitForFunction(() => document.querySelector('#pass1')?.value?.length > 0);
    await Promise.all([page.waitForLoadState('load'), page.click('#createusersub')]);
    const id = new URL(page.url()).searchParams.get('id');
    if (!id) return { injected, rejected: (await page.locator('.notice-error, .error, #message').allTextContents().then((t) => t.join(' ').replace(/\s+/g, ' ')).catch(() => '')).trim() || page.url() };
    return { injected, recordId: id };
  },
  async readFresh(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/wp-admin/user-edit.php?user_id=${id}`);
    return page.locator('#first_name').inputValue();
  },
};
