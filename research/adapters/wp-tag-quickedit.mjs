// WordPress: Yazılar > Hızlı Düzenle > Etiketler (adla atama). Çakışma koşucusu için.
// save: yeni yazı (REST) + Hızlı Düzenle'de etiket adı yaz + kaydet; recordId = yazıya gerçekte bağlanan etiketin kimliği.
// Etiketlerin gövdesi yok (bodyless): yalnız hangi etikete gidildiği karşılaştırılır.
const base = process.env.WP_URL ?? 'http://localhost:8081';
let state;

const rest = (page, method, route, body) => page.evaluate(async ([method, route, body]) => {
  const nonce = await (await fetch('/wp-admin/admin-ajax.php?action=rest-nonce')).text();
  // Düz kalıcı bağlantılarda /wp-json yönlendirilmez; rest_route her kurulumda çalışır.
  const r = await fetch(`/?rest_route=${route}`, { method, headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}, [method, route, body]);

export default {
  name: 'wp-tag-quickedit',
  bodyless: true,
  async newContext(browser) {
    if (!state) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(`${base}/wp-login.php`);
      await p.fill('#user_login', 'admin');
      await p.fill('#user_pass', 'admin12345');
      await Promise.all([p.waitForURL(/wp-admin/), p.click('#wp-submit')]);
      state = await ctx.storageState();
      await ctx.close();
    }
    return browser.newContext({ storageState: state });
  },
  async save(page, { name }) {
    await page.goto(`${base}/wp-admin/edit.php`);
    const post = await rest(page, 'POST', '/wp/v2/posts', { title: `hdl etiket ${name}`, status: 'publish' });
    await page.goto(`${base}/wp-admin/edit.php`);
    const row = page.locator(`#post-${post.id}`);
    await row.hover();
    await row.locator('button.editinline').click();
    await page.locator(`#edit-${post.id} textarea[name="tax_input[post_tag]"]`).fill(name);
    await Promise.all([page.waitForResponse((r) => r.url().includes('admin-ajax.php')), page.locator(`#edit-${post.id} button.save`).click()]);
    const fresh = await rest(page, 'GET', `/wp/v2/posts/${post.id}&_fields=tags`);
    if (!fresh.tags?.length) return { rejected: 'etiket bağlanmadı' };
    return { recordId: fresh.tags[0] };
  },
  async read(context, id) {
    const page = await context.newPage();
    await page.goto(`${base}/wp-admin/edit.php`);
    const t = await rest(page, 'GET', `/wp/v2/tags/${id}`);
    return { name: t.name };
  },
};
