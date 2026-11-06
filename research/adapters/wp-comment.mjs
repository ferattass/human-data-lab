// WordPress: ziyaretçi yorum formu "Name" (author). Oturumsuz gönderim; taze okuma yönetici yorum düzenleme ekranından.
// Test ortamı notu: flood kontrolü mu-plugin ile kapatıldı (experiments/wordpress).
const base = process.env.WP_URL ?? 'http://localhost:8081';
let adminState;
let n = 0;

export default {
  name: 'wordpress-comment-author',
  controlType: 'input-text',
  async create(page, value) {
    await page.goto(`${base}/?p=1`);
    const field = page.locator('#author');
    await field.fill(value);
    const injected = await field.inputValue();
    await page.fill('#email', `guest${n}@example.com`);
    await page.fill('#comment', `hdl test yorumu ${Date.now()}-${n++}`);
    await Promise.all([page.waitForLoadState('load'), page.click('#submit')]);
    const m = page.url().match(/#comment-(\d+)/) ?? page.url().match(/unapproved=(\d+)/);
    if (!m) return { injected, rejected: ((await page.locator('body').textContent()) ?? '').trim().slice(0, 120) };
    return { injected, recordId: m[1] };
  },
  async search(context, query, id) {
    await this.ensureAdmin(context);
    const page = await context.newPage();
    await page.goto(`${base}/wp-admin/edit-comments.php?comment_status=all&s=${encodeURIComponent(query)}`);
    return { found: (await page.locator(`tr#comment-${id}`).count()) > 0 };
  },
  async ensureAdmin(context) {
    if (!adminState) {
      const p = await context.newPage();
      await p.goto(`${base}/wp-login.php`);
      await p.fill('#user_login', 'admin');
      await p.fill('#user_pass', 'admin12345');
      await Promise.all([p.waitForURL(/wp-admin/), p.click('#wp-submit')]);
      adminState = await context.storageState();
      await p.close();
    } else {
      await context.addCookies(adminState.cookies);
    }
  },
  async readFresh(context, id) {
    await this.ensureAdmin(context);
    const page = await context.newPage();
    await page.goto(`${base}/wp-admin/comment.php?action=editcomment&c=${id}`);
    return page.locator('input[name="newcomment_author"]').inputValue();
  },
};
